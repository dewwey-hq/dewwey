-- dewwey · wedding vendor graph
-- Postgres 15+. Run: psql -f schema.sql
create extension if not exists citext;

-- Canonical vendor roles. post_mentions keeps the raw caption text ("Florals",
-- "HMU", "Pup support"); this enum is what the normalizer maps it into.
create type vendor_role as enum (
  'venue','planner','photographer','videographer','florist','hair','makeup',
  'dj','band','musician','attire','stationery','cake','catering','rentals',
  'transportation','photobooth','officiant','hotel','jeweler','content_creator',
  'beauty_other','other'
);

-- 'wedding_credit' added 2026-09-10 (D055 follow-up, refreshAccountRoleTagsFromWeddings.ts):
-- the wedding_vendors vote (documented weddings a `wedding_id, account_id, role` credit) as
-- its own tag source, alongside the stack/profile/manual evidence sources -- see
-- accountRoleTags.ts and that script's header comment for why account_tags needed a fifth
-- source at all (the D055 batches wrote wedding_vendors directly and never touched
-- account_tags, so v_account_role went stale). Applied live via
-- `alter type tag_source add value if not exists 'wedding_credit'` (must run as its own
-- committed statement, outside any transaction -- Postgres won't let a transaction use an
-- enum value it just added itself).
create type tag_source as enum ('stack_regex','stack_llm','profile_bio','manual','wedding_credit');
create type crawl_status as enum ('pending','crawled','skipped','error');

-- ============================================================
-- Every IG handle we have ever seen (mentioned, tagged, or crawled)
-- ============================================================
create table accounts (
  id            bigint generated always as identity primary key,
  username      citext unique not null,                -- amibloom.florals
  ig_url        text generated always as
                ('https://www.instagram.com/' || (username::text) || '/') stored,
  full_name     text,
  biography     text,
  external_url  text,                                  -- www.amibloomflorals.com
  followers     integer,
  is_business   boolean,
  business_category text,                              -- IG's own category label
  is_private    boolean,
  profile_scraped_at timestamptz,                      -- null = never enriched
  first_seen_at timestamptz not null default now(),
  avatar_path   text,                                  -- R2 key: avatars/<username>.jpg
  embeds_disabled boolean,                             -- IG account-level embed opt-out; null = unscanned
  raw           jsonb                                  -- full profile-scraper payload
);
create index on accounts (profile_scraped_at nulls first);

-- What we think an account IS, with provenance. An account can carry several
-- tags at different confidences; the view v_account_role picks the winner.
create table account_tags (
  account_id  bigint not null references accounts(id),
  role        vendor_role not null,
  source      tag_source not null,
  confidence  real not null check (confidence between 0 and 1),
  evidence_count integer not null default 1,           -- posts supporting this tag
  updated_at  timestamptz not null default now(),
  primary key (account_id, role, source)
);

-- ============================================================
-- Scraped posts (the original post: url, date, poster, message)
-- ============================================================
create table posts (
  id            bigint generated always as identity primary key,
  shortcode     text unique not null,                  -- DcJTVimP2su → natural dedupe key
  url           text not null,
  owner_id      bigint not null references accounts(id),
  caption       text,
  posted_at     timestamptz not null,
  likes_count   integer,
  comments_count integer,
  seed_username citext,                                -- which crawl seed surfaced it
  scraped_at    timestamptz not null default now(),
  has_stack     boolean,                               -- set by the parser
  parse_method  tag_source,                            -- stack_regex | stack_llm
  source        text not null default 'venue_tagged',  -- venue_tagged (the loop) | own_profile (enrichment only)
  wedding_score real,                                  -- confidence this is a real wedding; ingest filter for own_profile
  raw           jsonb not null                         -- full actor item, reprocessable
);
create index on posts (posted_at desc);
create index on posts (owner_id);

-- Lookup table of every @mention in a post. in_stack distinguishes credit-block
-- mentions ("Florals: @x") from prose mentions ("so fun @bestie!!").
create table post_mentions (
  post_id     bigint not null references posts(id),
  account_id  bigint not null references accounts(id),
  role_raw    text,                                    -- "Florals", "HMU", null if prose
  role        vendor_role,                             -- normalized, null if prose
  in_stack    boolean not null default false,
  line_no     integer
);
-- expression not allowed in a PK; same mention can appear under two roles
create unique index on post_mentions (post_id, account_id, coalesce(role_raw,''));
create index on post_mentions (account_id);

-- ============================================================
-- Weddings = deduped events. Multiple posts (photographer, planner, band)
-- describing the same wedding merge here; n_source_posts is confirmation count.
-- ============================================================
create table weddings (
  id            bigint generated always as identity primary key,
  venue_id      bigint references accounts(id),
  event_date_est date,                                 -- earliest post date proxy
  is_chicago    boolean,                               -- derived from venue geo
  created_at    timestamptz not null default now()
);

create table wedding_posts (
  wedding_id  bigint not null references weddings(id),
  post_id     bigint not null references posts(id) unique,
  primary key (wedding_id, post_id)
);

create table wedding_vendors (
  wedding_id  bigint not null references weddings(id),
  account_id  bigint not null references accounts(id),
  role        vendor_role not null,
  n_confirmations integer not null default 1,          -- posts crediting this vendor here
  primary key (wedding_id, account_id, role)
);

-- ============================================================
-- Geo: pins a venue (or any account) to a place. A wedding is "Chicago"
-- iff its venue is — flown-in videographers don't move the wedding.
-- ============================================================
create table account_locations (
  account_id  bigint primary key references accounts(id),
  address     text,
  city        text,
  region      text,
  lat         double precision,
  lng         double precision,
  source      text,        -- 'ig_profile' | 'website' | 'google_maps' | 'theknot' | 'manual'
  in_metro    boolean,     -- inside target metro (Chicago MSA for now)
  verified_at timestamptz
);

-- "V1 data completion, venues-first" mission (D047 follow-on, 2026-09-06). Some real venues
-- run multiple Instagram handles (a main account plus a dedicated events-booking account --
-- Art Institute of Chicago has three: artinstitutechi/artinstitutespecialevents/
-- artinstituteevents; Field Museum, MSI, Chicago History Museum, Harry Caray's, and several
-- others each have two) -- without this table, the SAME real venue's documented weddings get
-- silently split across separate `/vendors/<username>` pages, undercounting coverage on each
-- one individually. Each row is independently verified (WebSearch, same discipline as every
-- other identity claim in this project -- never inferred from username/name similarity alone,
-- which produced false positives: a shared "Venue Partners:" marketing boilerplate line and a
-- multi-city franchise chain both looked like aliasing on name-pattern grounds and weren't).
-- `alias_account_id` is the non-canonical handle; `canonical_account_id` is the one the app
-- displays under. Purely additive -- no existing account or wedding_vendors row is touched;
-- the app layer (apps/web/lib/server/graph.ts) resolves alias->canonical at query time.
create table account_aliases (
  alias_account_id     bigint primary key references accounts(id),
  canonical_account_id bigint not null references accounts(id),
  note                  text,
  confirmed_at          timestamptz not null default now(),
  check (alias_account_id <> canonical_account_id)
);

-- ============================================================
-- Crawl frontier: every account is a potential next seed.
-- Lives in the ops schema — crawler bookkeeping, not product data.
-- search_path lets code reference it unqualified.
-- ============================================================
create schema if not exists ops;
alter role dewwey set search_path = public, ops;
create table ops.crawl_frontier (
  account_id  bigint primary key references accounts(id),
  hops        integer not null default 0,              -- 0 = hand-seeded venue
  priority    real not null default 0,                 -- venues high, attire brands low
  status      crawl_status not null default 'pending',
  last_crawled_at timestamptz,
  posts_found integer,
  stacks_found integer,
  note        text
);
create index on ops.crawl_frontier (status, priority desc);

-- ============================================================
-- The product: the collaboration graph
-- ============================================================
create materialized view edges as
select
  least(a.account_id, b.account_id)    as account_a,
  greatest(a.account_id, b.account_id) as account_b,
  count(distinct a.wedding_id)         as n_weddings,
  sum(least(a.n_confirmations, b.n_confirmations)) as n_confirmations,
  max(w.event_date_est)                as last_worked_together
from wedding_vendors a
join wedding_vendors b
  on a.wedding_id = b.wedding_id and a.account_id < b.account_id
join weddings w on w.id = a.wedding_id
group by 1, 2;
create unique index on edges (account_a, account_b);

-- Winner-take-most role per account, across all evidence sources
create view v_account_role as
select distinct on (account_id)
  account_id, role, confidence, evidence_count
from account_tags
-- D056 (2026-09-10): on an exact tie a venue-category role wins (mirrors pickTopRoles in
-- apps/web/scripts/graph/accountRoleTags.ts); applied live by applyVendorTaxonomySchema.ts.
order by account_id, evidence_count desc, confidence desc, (role = 'venue') desc, role;

-- ============================================================
-- IDENTITY: Google Places-seeded business layer (Jeremy's, slimmed).
-- Typed core + full Places payload in raw. Bridged to the IG-observed
-- world via account_id — one canonical IG account per business.
-- ============================================================
create table vendors (
  id            bigint generated always as identity primary key,
  place_id      text unique,                 -- Places canonical identity
  name          text not null,
  category      text,
  website       text,
  phone         text,
  address       text,
  neighborhood  text,
  city          text default 'Chicago',
  state         text default 'IL',
  zip           text,
  lat           double precision,
  lng           double precision,
  rating        numeric(2,1),
  review_count  integer,
  price_level   integer,
  instagram_handle citext,
  account_id    bigint references accounts(id),
  account_matched_by text,                   -- 'handle_exact' | 'manual'
  photo_keys    jsonb,                       -- R2 keys; Places CDN URLs expire
  discovery_source text not null default 'google_places',
  raw           jsonb,                       -- full Places payload, reprocessable
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on vendors (account_id);
create index on vendors (lower(instagram_handle::text)) where instagram_handle is not null;

-- ============================================================
-- ENRICHMENT: venue-website facts w/ provenance (Jeremy's design,
-- adopted wholesale; ids re-keyed to bigint, varchars relaxed to text).
-- ============================================================
create table venue_extraction_runs (
  id            bigint generated always as identity primary key,
  vendor_id     bigint not null references vendors(id) on delete cascade,
  method        text not null,
  schema_version integer not null default 1,
  status        text not null default 'success',
  payload       jsonb not null,
  meta          jsonb,
  crawled_at    timestamptz,
  extracted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index on venue_extraction_runs (vendor_id);
create index on venue_extraction_runs (extracted_at desc);

create table venue_enrichment (
  vendor_id     bigint primary key references vendors(id) on delete cascade,
  website       text,
  status        text not null default 'partial',
  needs_review  boolean not null default false,
  schema_version integer not null default 1,
  capacity_max  integer,
  capacity_min  integer,
  capacity_as_stated text,
  catering      text,
  event_insurance text,
  pricing_model text,
  price_display text,
  facts         jsonb not null default '{}',
  latest_rules_run_id bigint references venue_extraction_runs(id) on delete set null,
  latest_llm_run_id   bigint references venue_extraction_runs(id) on delete set null,
  crawled_at    timestamptz,
  extracted_at  timestamptz,
  enriched_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on venue_enrichment (capacity_max);
create index on venue_enrichment (needs_review) where needs_review;

-- Staging: Jeremy's raw tables land here verbatim for re-parse; never public.
-- (instagram_post_appearances is NOT imported — superseded by the stack parser.)
create schema if not exists staging;

-- ============================================================
-- POST CLASSIFICATION: is a post a credible real Chicago wedding?
-- (docs/engineering/post-classification/README.md)
--
-- Same shape as venue_extraction_runs/venue_enrichment (append-only runs +
-- a serving layer), with two deliberate differences:
--   1. Keyed by post_url, not post_id/vendor_id — posts being classified
--      live in staging.instagram_posts today (pre-migration) and public.posts
--      after re-parse; post_url is the one natural key stable across both
--      (mirrors posts.shortcode's role as "natural dedupe key"), and it lets
--      the golden set reference posts that were never imported at all.
--   2. exclusion_reason/archetype are free text, not enums — the mission
--      here is explicitly to let evaluation discover new failure modes and
--      account types, not lock in the first taxonomy. post_decision and
--      classifier_tier ARE enums: those are the contract's fixed shape
--      (INCLUDE/EXCLUDE/REVIEW; the cost-tier a decision came from), not a
--      hypothesis under test.
--
-- Time/versioning (D011): classified_at (when the decision was made) is
-- tracked separately from posted_at (when the IG post itself went up,
-- snapshotted here from staging.instagram_posts.post_timestamp /
-- posts.posted_at — those remain the source of truth; this copy is what
-- keeps classification history queryable by post age after staging is
-- eventually dropped). Post age is NEVER evidence of credibility — an old
-- real wedding is still a real wedding; see llmClassifier.ts's prompt.
-- event_date/event_date_confidence are optional and populated ONLY when a
-- post gives direct textual evidence of the wedding's own date — never
-- inferred from posted_at, never guessed.
-- ============================================================
create type post_decision as enum ('INCLUDE', 'EXCLUDE', 'REVIEW');
create type classifier_tier as enum ('deterministic', 'cheap_model', 'expensive_model', 'human');

-- Candidate generation (candidate-score-v1, 2026-09-03) — a deterministic,
-- free pre-classification score that shrinks the corpus to a high-signal
-- pool before spending LLM money. NOT a classifier tier: runs before
-- post_classification_runs, never writes a decision. See
-- docs/engineering/post-classification/candidate-generation-analysis.md for
-- the methodology/evidence behind the score formula (apps/web/scripts/
-- classify/candidateScore.ts). Composite PK (not just post_url) so a future
-- candidate-score-v2 can re-score without overwriting v1's history, same
-- append-only philosophy as post_classification_runs.
create table candidate_scores (
  post_url                      text not null,
  candidate_generation_version  text not null,
  score                         integer not null,
  vendor_role_count             integer not null,
  vendor_roles                  text[] not null default '{}',
  has_photographer              boolean not null,
  has_venue                     boolean not null,
  has_planner                   boolean not null,
  has_wedding_keyword           boolean not null,
  has_chicago_hint              boolean not null,
  has_styled_editorial_language boolean not null,
  has_promo_language            boolean not null,
  has_engagement_language       boolean not null,
  scored_at                     timestamptz not null default now(),
  primary key (post_url, candidate_generation_version)
);
create index on candidate_scores (candidate_generation_version, score desc);

create table post_classification_runs (
  id                     bigint generated always as identity primary key,
  post_url               text not null,
  classifier_version     text not null,             -- e.g. 'v1', 'v2-chicago-strict'
  prompt_version         text,                       -- null for the deterministic tier
  model                  text,                       -- null for the deterministic tier
  tier                   classifier_tier not null,
  decision               post_decision not null,
  confidence             real not null check (confidence between 0 and 1),
  is_wedding             boolean,                    -- tri-state: null = insufficient evidence, not "no"
  is_real_wedding        boolean,
  is_chicago             boolean,
  is_credible_source     boolean,
  exclusion_reason       text,                       -- free text; see contract.ts for the living vocabulary
  evidence               jsonb not null default '[]', -- [{claim, quote_or_signal, source_field}], grounded not vibes
  input_hash             text not null,              -- hash of the fields fed in; lets a rerun skip unchanged posts
  cost_usd               numeric(10,6),
  latency_ms             integer,
  posted_at              timestamptz,                -- snapshot of the post's publish time; NOT the source of truth
  event_date             text,                       -- the wedding's own date, only with direct textual evidence —
                                                       -- free text, not a strict date: real captions often give
                                                       -- partial evidence ("Fall 2026", "2027"), not always ISO
  event_date_confidence  real check (event_date_confidence between 0 and 1),
  classified_at          timestamptz not null default now()  -- when THIS run happened, not when the post was published
);
create index on post_classification_runs (post_url, classified_at desc);
create index on post_classification_runs (classifier_version);
create index on post_classification_runs (decision);

-- Serving layer: latest run per post. A view, not a table — at tens of
-- thousands of posts a DISTINCT ON scan is cheap, and it avoids a second
-- place for "current" to drift from history (venue_enrichment's dual-table
-- correction workflow isn't needed here: a post's classification only ever
-- moves forward to a newer classifier_version, never gets manually patched).
create view post_classifications_current as
select distinct on (post_url) *
from post_classification_runs
order by post_url, classified_at desc;

-- V1 product corpus (2026-09-03): the actual candidate-generation -> V3
-- pipeline output. Deliberately resolves the LATEST v3-specific decision
-- directly from post_classification_runs (not post_classifications_current,
-- which is cross-version and goes stale for a specific version once a newer
-- one supersedes shared posts -- see docs/engineering/post-classification/
-- candidate-generation-analysis.md). Additive: does not touch V3 or any
-- prior evaluation artifact.
create view v1_content_corpus as
select
  cs.post_url,
  cs.candidate_generation_version,
  cs.score as candidate_score,
  cs.vendor_role_count,
  cs.vendor_roles,
  pc.decision as v3_decision,
  pc.confidence as v3_confidence,
  pc.classifier_version,
  pc.model,
  pc.tier,
  pc.exclusion_reason,
  pc.evidence,
  pc.event_date,
  pc.classified_at,
  sp.caption_raw,
  sp.image_url,
  sp.images,
  sp.post_timestamp as posted_at,
  sp.owner_username,
  sp.location_tag,
  sp.hashtags,
  sp.mentions,
  sp.likes_count,
  v.name as vendor_name,
  v.category as vendor_category,
  v.instagram_handle as vendor_instagram_handle
from candidate_scores cs
join lateral (
  select pcr.* from post_classification_runs pcr
  where pcr.post_url = cs.post_url and pcr.classifier_version = 'v3'
  order by pcr.classified_at desc limit 1
) pc on true
join staging.instagram_posts sp on sp.post_url = cs.post_url
left join staging.vendors v on v.id = sp.vendor_id
where cs.candidate_generation_version = 'candidate-score-v1'
  and cs.score >= 12
  and pc.decision = 'INCLUDE';
-- CAVEAT found 2026-09-04 while designing the graph-strengthening evidence
-- layer: this view joins staging.instagram_posts directly. ROADMAP.md's
-- "Next" section plans to eventually drop the staging schema once
-- re-parsing is done -- the day that happens, this view (and /feed, which
-- reads it) breaks. Not fixed here (out of scope for that task); flagging
-- so "drop staging" gets a "materialize what v1_content_corpus/feed still
-- need first" sub-step rather than silently breaking the product feed.
-- The graph-strengthening tables below deliberately do NOT depend on this
-- view or on staging surviving, for exactly this reason.

-- Stack-parser extraction (D016/D017, 2026-09-03/04) — TS port of Ben's
-- pipeline.py stack parser (LINE/HANDLE/ROLE_MAP/norm), run read-only over
-- the candidate pool. Append-only per parser version (stack-parser-ts-v1/
-- v2/v3), never truncated -- a rerun under the same version is an
-- idempotent refresh of that post's rows, a new version appends alongside
-- old ones.
create table stack_extraction_runs (
  post_url             text not null,
  stack_parser_version text not null,
  decision             text not null,  -- V3 decision at extraction time: INCLUDE/REVIEW/EXCLUDE
  candidate_score      integer,
  has_stack            boolean not null,
  distinct_role_count  integer not null,
  entry_count          integer not null,
  extracted_at         timestamptz not null default now(),
  primary key (post_url, stack_parser_version)
);

create table stack_extraction_entries (
  post_url             text not null,
  stack_parser_version text not null,
  role_raw             text not null,
  role                 text not null,
  handle               text not null,
  line_no              integer not null,
  extracted_at         timestamptz not null default now()
);
create index on stack_extraction_entries (post_url, stack_parser_version);
create index on stack_extraction_entries (handle);

-- Human-quality ground truth for vendor extraction (D016/D017) -- built by
-- independent caption review, NOT the parser's own output. 134 posts,
-- 92 eval / 42 held-out, versioned by source_note (append-only, same as
-- golden_set below). Only loadVendorGoldenSet.ts writes this.
create table vendor_extraction_golden_set (
  post_url             text not null,
  handle               text not null,
  expected_role        text,
  is_vendor            boolean not null,
  is_part_of_wedding   text,
  in_parser_extraction boolean not null,
  notes                text,
  post_level_notes     text,
  stratum              text not null,
  split                text not null,
  labeled_by           text not null,
  labeled_at           timestamptz not null default now(),
  source_note          text not null,
  primary key (post_url, handle, source_note)
);
create index on vendor_extraction_golden_set (split, source_note);

-- ============================================================
-- Graph strengthening (2026-09-04, D016-D019): using Jeremy's V1 INCLUDE
-- corpus to add vendor relationships to the wedding/vendor graph, WITHOUT
-- touching Ben's weddings/wedding_posts/wedding_vendors/edges or
-- phase_dedup()'s truncate-rebuild semantics (his `wedding_id` is not
-- stable across reruns -- verified live: phase_dedup truncates and
-- restarts identity on every run). See
-- docs/engineering/graph-strengthening/ingestion-design.md for the full
-- reasoning. Organizing principle: immutable evidence identity != wedding
-- identity -- the durable fact is (source post, credit-line, vendor,
-- role); which real-world wedding it belongs to is a revisable belief.
-- ============================================================

-- Evidence is a VIEW, not a table -- stack_extraction_entries already IS
-- the append-only, per-parser-version extraction history (proven working
-- across stack-parser-ts-v1/v2/v3). A separate physical evidence table
-- would just duplicate that data and re-solve idempotency that's already
-- solved. Identity here is (source_post_url, line_no, handle) -- the
-- credit-line instance -- NOT parser_version: resolving "latest by
-- extracted_at" per credit line means a ROLE_MAP bug fix corrects a row
-- instead of minting a redundant new one for every parser iteration.
-- Deliberately joins candidate_scores/post_classification_runs/accounts
-- directly, never staging.instagram_posts or v1_content_corpus (see the
-- caveat above) -- this view survives the eventual staging-schema drop.
create view jeremy_post_vendor_evidence as
select
  latest.source_post_url,
  a.id as account_id,
  latest.role,
  latest.role_raw,
  latest.line_no,
  latest.parser_version,
  cs.score as candidate_score,
  cs.candidate_generation_version,
  pc.classifier_version,
  pc.confidence as classifier_confidence
from (
  select distinct on (post_url, line_no, handle)
    post_url as source_post_url, line_no, handle, role, role_raw, stack_parser_version as parser_version
  from stack_extraction_entries
  order by post_url, line_no, handle, extracted_at desc
) latest
join accounts a on lower(a.username::text) = latest.handle
join candidate_scores cs on cs.post_url = latest.source_post_url
  and cs.candidate_generation_version = 'candidate-score-v1' and cs.score >= 12
join lateral (
  select pcr.classifier_version, pcr.decision, pcr.confidence
  from post_classification_runs pcr
  where pcr.post_url = latest.source_post_url and pcr.classifier_version = 'v3'
  order by pcr.classified_at desc limit 1
) pc on pc.decision = 'INCLUDE'
where latest.role <> 'other';

-- Human-confirmed-evidence (2026-09, human-labeling-ui mission), DELIBERATELY
-- separate from jeremy_post_vendor_evidence above, not unioned with it --
-- classifier-derived and human-confirmed evidence have different
-- confidence/provenance semantics and should stay independently queryable,
-- not silently treated as interchangeable by a downstream consumer. Gated
-- on golden_set (a human/labeling-script-only table -- never a classifier)
-- instead of candidate_score>=12 + v3 INCLUDE, so a post the classifier
-- never scored highly enough to even run V3 on, or that V3 EXCLUDEd/
-- REVIEWed, can still become evidence once a human has confirmed it's a
-- real wedding. Does NOT resolve Chicago relevance (see
-- jeremy_wedding_candidates.chicago_status below) or vendor correctness --
-- those stay separate, explicit pipeline stages, never collapsed into "human
-- said WEDDING therefore graph-eligible."
create view human_confirmed_post_vendor_evidence as
select
  latest.source_post_url,
  a.id as account_id,
  latest.role,
  latest.role_raw,
  latest.line_no,
  latest.parser_version,
  cs.score as candidate_score,
  cs.candidate_generation_version
from (
  select distinct on (post_url, line_no, handle)
    post_url as source_post_url, line_no, handle, role, role_raw, stack_parser_version as parser_version
  from stack_extraction_entries
  order by post_url, line_no, handle, extracted_at desc
) latest
join accounts a on lower(a.username::text) = latest.handle
left join candidate_scores cs on cs.post_url = latest.source_post_url
  and cs.candidate_generation_version = 'candidate-score-v1'
where latest.role <> 'other'
  and exists (
    select 1 from golden_set gs
    where gs.post_url = latest.source_post_url and gs.expected_decision = 'INCLUDE'
  );

-- Jeremy-owned wedding-candidate identity, fully independent of Ben's
-- `weddings.id`. Stable across reruns via match-upsert against THIS table
-- (never truncated) -- not Ben's truncate-rebuild -- so it requires zero
-- changes to phase_dedup(). Stable only WITHIN a fixed clustering_version;
-- changing the clustering algorithm is an explicit new version, not a
-- silent behavior change (see runJeremyWeddingClustering.ts).
create table jeremy_wedding_candidates (
  id                 bigint generated always as identity primary key,
  clustering_version text not null,
  venue_account_id   bigint references accounts(id),   -- nullable; recomputed as evidence accrues
  event_date_est     date,                              -- an ESTIMATE, recomputed on every touch
  -- Explicit tri-state, not a boolean and not a silent inference. V3-sourced
  -- candidates already resolved geography as part of classification, so
  -- this stays null for them (not applicable, not "unconfirmed"). Only
  -- populated for candidates clustered from human_confirmed_post_vendor_evidence,
  -- where a human confirming "real wedding" says nothing about Chicago
  -- relevance -- that's a separate fact, resolved from account_locations.in_metro
  -- (never guessed). Only CHICAGO_CONFIRMED is eligible for graph creation
  -- without additional human review; CHICAGO_AMBIGUOUS/NOT_CONFIRMED are
  -- surfaced for review, never silently included or excluded.
  chicago_status     text check (chicago_status in ('CHICAGO_CONFIRMED','CHICAGO_NOT_CONFIRMED','CHICAGO_AMBIGUOUS')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- PRIMARY KEY on source_post_url (not composite with candidate_id) enforces
-- "a post belongs to at most one candidate" at the database level -- the
-- rare 1-post/2-weddings case (confirmed once in the 134-post eval set,
-- D016/D017) is a named, accepted V1 limitation, not a silent gap.
create table jeremy_wedding_candidate_posts (
  source_post_url  text primary key,
  candidate_id     bigint not null references jeremy_wedding_candidates(id),
  added_at         timestamptz not null default now()
);
create index on jeremy_wedding_candidate_posts (candidate_id);

-- Derived, not maintained -- always consistent, no upsert-with-greatest
-- bookkeeping needed (unlike Ben's wedding_vendors, which hand-maintains
-- n_confirmations). Resolves a candidate's vendor list regardless of which
-- evidence view clustered it -- this is a read-side rollup keyed by an
-- ALREADY-DECIDED candidate_id (one post belongs to exactly one candidate,
-- pinned at cluster time), not a blended discovery pool, so unioning the
-- two evidence sources here does not reintroduce the "don't merge evidence"
-- concern that applies to clustering itself. The `not exists` guard in the
-- second branch only matters for a post that happens to satisfy BOTH
-- evidence views at once (score>=12, V3 INCLUDE, and independently
-- golden_set-confirmed) -- counted once, via jeremy_post_vendor_evidence.
create view jeremy_wedding_candidate_vendors as
select
  cp.candidate_id,
  e.account_id,
  e.role,
  count(distinct e.source_post_url) as n_confirmations,
  array_agg(distinct e.source_post_url) as source_post_urls
from jeremy_wedding_candidate_posts cp
join jeremy_post_vendor_evidence e on e.source_post_url = cp.source_post_url
group by cp.candidate_id, e.account_id, e.role
union all
select
  cp.candidate_id,
  e.account_id,
  e.role,
  count(distinct e.source_post_url) as n_confirmations,
  array_agg(distinct e.source_post_url) as source_post_urls
from jeremy_wedding_candidate_posts cp
join human_confirmed_post_vendor_evidence e on e.source_post_url = cp.source_post_url
where not exists (
  select 1 from jeremy_post_vendor_evidence jpve where jpve.source_post_url = cp.source_post_url
)
group by cp.candidate_id, e.account_id, e.role;

-- A versioned BELIEF about which Ben wedding a Jeremy candidate might
-- correspond to -- never a merge, never authoritative. matched_wedding_id
-- is deliberately NOT a foreign key: Ben's weddings.id can be reassigned
-- by a future phase_dedup rebuild, and re-reconciling afterward (under a
-- new reconciliation_version) is expected, ordinary maintenance.
create table jeremy_wedding_candidate_reconciliation (
  candidate_id           bigint not null references jeremy_wedding_candidates(id),
  matched_wedding_id     bigint,
  match_confidence       real,
  venue_match            boolean not null,
  date_delta_days        integer,
  vendor_jaccard         real,
  reconciliation_version text not null,
  reconciled_at          timestamptz not null default now(),
  primary key (candidate_id, reconciliation_version)
);

-- D023: the durable provenance log for graph ingestion — the first (and only)
-- write path from this workstream into Ben's wedding_vendors. wedding_vendors
-- itself has no provenance column, so this table is the record of what got
-- written, from which candidate, under which reconciliation_version, and
-- when. wedding_id is deliberately NOT a foreign key (same reasoning as
-- matched_wedding_id above): a future phase_dedup() truncate-rebuild
-- (RESTART IDENTITY CASCADE on weddings/wedding_posts/wedding_vendors) can
-- both wipe the wedding_vendors rows this logged AND reassign weddings.id
-- out from under this table's rows. Recovery is not automatic — the durable
-- source of truth stays the Jeremy evidence/candidate/reconciliation layer;
-- re-apply by rerunning reconciliation (re-matches against Ben's new
-- weddings) then applyJeremyEvidenceToGraph.ts again (both idempotent).
create table jeremy_wedding_vendors_ingested (
  wedding_id             bigint not null,
  account_id             bigint not null references accounts(id),
  role                   vendor_role not null,
  n_confirmations        integer not null,
  candidate_id           bigint not null references jeremy_wedding_candidates(id),
  reconciliation_version text not null,
  ingested_at            timestamptz not null default now(),
  primary key (wedding_id, account_id, role, reconciliation_version)
);

-- Golden set: hand-labeled regression set. NEVER written by any classifier —
-- only a human/labeling script touches this table. This is what every
-- classifier version gets scored against before it ships.
create table golden_set (
  post_url          text primary key,
  expected_decision post_decision not null,
  exclusion_reason  text,
  notes             text,
  labeled_by        text not null,
  labeled_at        timestamptz not null default now(),
  source_note       text                          -- e.g. 'bootstrap_v0', 'review_queue_2026-09-10'
);

-- Account-level archetype prior (requirement 7 of the classification
-- mission) — a signal INTO post classification, never a trusted shortcut
-- (a Chicago-Places-categorized "venue" can be a steakhouse that occasionally
-- hosts receptions, not a wedding venue — verified case: Fioretta Steak).
-- Append-only, same as post_classification_runs — an account's archetype is
-- never treated as permanent; re-running the classifier (sampling the
-- account's MOST RECENT posts, not an arbitrary early sample — see
-- accountClassifier.ts) adds a new row, and account_classifications_current
-- picks it up automatically. classified_at names when the classifier ran,
-- distinct from any post's own posted_at.
create table account_classification_runs (
  id                  bigint generated always as identity primary key,
  username            citext not null,
  classifier_version  text not null,
  prompt_version      text,
  model               text,
  archetype           text not null,               -- free text; see contract.ts
  confidence          real not null check (confidence between 0 and 1),
  is_wedding_industry boolean not null,
  evidence            jsonb not null default '[]',
  classified_at       timestamptz not null default now()
);
create index on account_classification_runs (username, classified_at desc);
create view account_classifications_current as
select distinct on (username) *
from account_classification_runs
order by username, classified_at desc;

-- ============================================================
-- Human post labeling (2026-09, human-labeling-ui) — Jeremy's rapid-review
-- tool, spanning the whole ecosystem: staging.instagram_posts (Jeremy's
-- 47,623-post own-profile corpus) AND public.posts (Ben's 6,370-post
-- venue_tagged corpus, the live serving graph behind /weddings) --
-- label_queue.source records which. Durable, append-only: relabeling a post
-- never destroys the prior observation (unlike golden_set, which is
-- current-state-only by design). golden_set stays the deliberate,
-- human-reviewed regression set; this table is the raw keystroke log that
-- feeds it via syncHumanLabelsToGoldenSet.ts, run on demand, never
-- automatically. WEDDING/NOT_WEDDING/UNSURE are content judgments;
-- UNVIEWABLE/SKIP are technical/non-judgment outcomes and must never be
-- promoted into golden_set.
-- ============================================================
create type human_label_decision as enum (
  'WEDDING', 'NOT_WEDDING', 'UNSURE', 'UNVIEWABLE', 'SKIP'
);

create table human_post_labels (
  id            bigint generated always as identity primary key,
  post_url      text not null,
  queue_version text,                    -- which label_queue batch served this
  decision      human_label_decision not null,
  labeled_by    text not null,           -- 'jeremy' for v1
  client_ms     integer,                 -- ms this post was on screen before this keypress; observability only
  notes         text,                    -- optional free-text comment, carries through to golden_set.notes on sync
  labeled_at    timestamptz not null default now()
);
create index on human_post_labels (post_url, labeled_at desc);
create index on human_post_labels (labeled_by, queue_version);

-- Serving layer: latest human action per post. Same DISTINCT ON convention
-- as post_classifications_current.
create view human_post_labels_current as
select distinct on (post_url) *
from human_post_labels
order by post_url, labeled_at desc;

-- The frozen, resumable initial sample. Built once by buildLabelingQueue.ts
-- per queue_version so a refresh or a new session always resumes the same
-- order -- a future re-sample (informed by round 1) adds a NEW queue_version,
-- never mutates an existing one.
create table label_queue (
  post_url      text not null,
  queue_version text not null,
  bucket        text not null,   -- 'random' | 'v1_include' | 'v1_exclude_review' | 'below_cutoff' | 'public_posts_random'
  source        text not null default 'staging',  -- 'staging' (staging.instagram_posts, Jeremy's own-profile
                                                    -- corpus) | 'public' (public.posts, Ben's venue_tagged
                                                    -- corpus -- the live serving graph behind /weddings)
  rank          integer not null,  -- serving order within (queue_version)
  added_at      timestamptz not null default now(),
  primary key (post_url, queue_version)
);
create index on label_queue (queue_version, rank);

comment on table human_post_labels is 'RAW (append-only): every human labeling action from the /label review UI — never overwritten on relabel';
comment on view human_post_labels_current is 'DERIVED: latest human label per post_url';
comment on table label_queue is 'OPS: the frozen, resumable review order for a given queue_version, built by buildLabelingQueue.ts';

comment on table post_classification_runs is 'DERIVED (append-only): every classification attempt for a post, keyed by post_url (stable across staging.instagram_posts and public.posts). See post_classifications_current for the latest per post.';
comment on table golden_set is 'REGRESSION TEST: hand-labeled posts. Never written by a classifier — read-only ground truth for the eval harness.';
comment on table account_classification_runs is 'DERIVED (append-only): account-level archetype prior (wedding_venue / wedding_photographer / generic_lifestyle / etc) — an input to post classification, not a verdict on its own.';

-- ============================================================
-- USER: "your team" — a couple's wedding as slots to fill.
-- The anon key exposes PostgREST, so EVERY public table runs RLS
-- (no policies = deny; the app's direct pg connection is table owner and
-- bypasses). These two are the only tables with permissive policies.
-- ============================================================
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

create table user_teams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade unique,
  slots       text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table user_teams enable row level security;
create policy "own team" on user_teams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table user_team_entries (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references user_teams(id) on delete cascade,
  slot        text not null,
  kind        text not null check (kind in ('dewwey','custom')),
  status      text not null default 'considering'
              check (status in ('considering','booked')),
  name        text not null,
  account_id  bigint references accounts(id),   -- dewwey entries
  username    text,
  avatar_url  text,
  instagram   text,                              -- custom entries
  website     text,
  created_at  timestamptz not null default now()
);
alter table user_team_entries enable row level security;
create policy "own entries" on user_team_entries
  for all using (auth.uid() = (select user_id from user_teams where id = team_id))
  with check (auth.uid() = (select user_id from user_teams where id = team_id));
create index on user_team_entries (team_id);

-- ============================================================
-- In-database documentation (shows in TablePlus table info)
-- Three layers: RAW (scraped), DERIVED (computed, rebuildable), OPS (crawler)
-- ============================================================
comment on table posts is 'RAW: every Instagram post scraped — url, date, poster, caption, full payload in raw';
comment on table post_mentions is 'RAW: every @mention per post; in_stack=true means it was a vendor credit, role_raw is the caption''s own label';
comment on table accounts is 'RAW: every IG handle ever seen. Enriched rows have bio/website/followers; avatar_path is the R2 key avatars/<username>.jpg';
comment on table vendors is 'IDENTITY: Google Places-seeded business layer (Jeremy''s, slimmed). account_id bridges to the IG-observed accounts table; full Places payload in raw';
comment on table venue_extraction_runs is 'ENRICHMENT: versioned venue-website extraction runs (rules + LLM), payload = full extracted doc with provenance quotes';
comment on table venue_enrichment is 'ENRICHMENT: serving row per venue — capacity/catering/insurance/pricing distilled from latest extraction runs';
comment on column posts.source is 'How acquired: venue_tagged (the crawl loop) | own_profile (profile scrapes, enrichment only)';
comment on column posts.wedding_score is 'Confidence this post depicts a real wedding (Jeremy''s idea) — ingest filter for own_profile posts';
comment on table weddings is 'DERIVED: unique weddings after merging duplicate posts; is_chicago true/false/null by venue geo';
comment on table wedding_posts is 'DERIVED: which posts describe which wedding (2+ posts = independently confirmed)';
comment on table wedding_vendors is 'DERIVED: who worked each wedding, in what role';
comment on materialized view edges is 'DERIVED — THE PRODUCT: one row per vendor pair, n_weddings they worked together. Rebuild anytime: refresh materialized view edges';
comment on table account_tags is 'DERIVED: role votes per account (florist x9 posts etc); v_account_role picks the winner';
comment on view v_account_role is 'DERIVED: the winning role per account, from account_tags votes';
comment on table account_locations is 'DERIVED: geo per account; in_metro=true means verified Chicago-metro venue';
comment on table ops.crawl_frontier is 'OPS: crawler to-do list — every account, its priority, hop distance, and crawl status';

-- ============================================================
-- Content eligibility vs. structured-entity eligibility (2026-09,
-- human-labeling-ui mission) — these are different questions. The
-- human-confirmed-evidence pipeline above (stack extraction ->
-- human_confirmed_post_vendor_evidence -> clustering -> reconciliation ->
-- weddings) answers "do we have enough evidence to create/strengthen a
-- structured multi-vendor wedding entity" and stays deliberately
-- conservative (requires a 3+-role credit stack). It does NOT answer "is
-- this credible Chicago wedding content worth showing on a vendor's
-- page" -- that bar is much lower: a real human-confirmed wedding with
-- confirmed Chicago relevance, full stop. No vendor-attribution, no
-- credit-stack richness, no clustering, no reconciliation requirement.
-- Conflating the two made 742 confirmed real weddings look like only 18
-- were usable -- they were never the same question. See
-- docs/engineering/human-labeling/README.md for the full writeup.
-- ============================================================

-- Per-post Chicago relevance, independent of clustering/candidacy -- a
-- human WEDDING label resolves "is this real," not "is this Chicago."
-- Priority order matches labeling_rubric.md's own hierarchy: a resolved
-- venue's verified location outranks the post's own location_tag, which
-- outranks an explicit "Chicago" mention in the caption tied to this
-- event; a vendor's own market is deliberately NEVER used (not reliable
-- evidence for where the depicted event was). A pure function of already-
-- durable, already-immutable evidence -- changing the rule later is
-- CREATE OR REPLACE VIEW, never a relabel, never a deletion.
create view human_confirmed_post_geography as
select
  gs.post_url,
  case
    -- "Any positive signal wins" rather than picking one arbitrary venue
    -- when a post credits several (ceremony + reception, or extraction
    -- noise) -- confirmed live: some posts have 2+ distinct venue-role
    -- accounts, e.g. a church (no location on file) alongside a confirmed-
    -- Chicago reception venue. Picking just one (by account_id or scan
    -- order) is exactly the kind of guessing this project has explicitly
    -- avoided elsewhere for the same ambiguity (D039's church-vs-reception
    -- pattern) -- but that caution was about NOT auto-resolving which
    -- account is "the" venue for a structured entity (Layer 2). For this
    -- per-post content signal (Layer 1), a real confirmed-Chicago credit
    -- co-existing with an unresolved one is still real positive evidence,
    -- not evidence against.
    when venue_signals.any_confirmed then 'CONFIRMED'
    when sp.location_tag ~* 'chicago' then 'CONFIRMED'
    when sp.caption_raw ~* 'chicago' then 'CONFIRMED'
    when venue_signals.any_not_confirmed then 'NOT_CONFIRMED'
    when sp.location_tag ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
    when sp.caption_raw ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
    when venue_signals.has_any_venue then 'AMBIGUOUS'
    else 'NO_SIGNAL'
  end as chicago_status
from golden_set gs
join staging.instagram_posts sp on sp.post_url = gs.post_url
left join lateral (
  select
    -- D055: vendors.city defaults to 'Chicago' on every row (docs/jeremy-ddl.sql) -- only
    -- trust it as geography evidence when discovery_source='google_places' (a real address
    -- lookup); account_locations.in_metro stays authoritative.
    bool_or(al.in_metro = true or (v.city = 'Chicago' and v.discovery_source = 'google_places')) as any_confirmed,
    bool_or(al.in_metro = false) as any_not_confirmed,
    count(*) > 0 as has_any_venue
  from human_confirmed_post_vendor_evidence e
  left join account_locations al on al.account_id = e.account_id
  -- vendors.account_id is NOT unique (confirmed live: one account has 4
  -- rows) -- a plain join here would silently fan out one venue credit
  -- into multiple rows. Same LATERAL + ORDER BY + LIMIT 1 defensive
  -- pattern already used elsewhere in this codebase for the same reason
  -- (e.g. apps/web/app/api/vendors/for-team/route.ts).
  left join lateral (
    select city, discovery_source from vendors where account_id = e.account_id order by id limit 1
  ) v on true
  where e.source_post_url = gs.post_url and e.role = 'venue'
) venue_signals on true
where gs.expected_decision = 'INCLUDE';

-- THE Layer-1 content corpus: human-confirmed real wedding + confirmed
-- Chicago relevance. Nothing else. Deliberately does NOT require vendor
-- attribution, a rich credit stack, resolved wedding identity, or
-- reconciliation -- those remain independent, joinable, non-gating
-- signals (human_confirmed_post_vendor_evidence for vendor attribution;
-- jeremy_wedding_candidates/reconciliation for structured-entity
-- evidence), never folded into this gate.
create view human_confirmed_chicago_wedding_content as
select gs.post_url, gs.labeled_by, gs.labeled_at, gs.source_note
from golden_set gs
join human_confirmed_post_geography g on g.post_url = gs.post_url
where gs.expected_decision = 'INCLUDE' and g.chicago_status = 'CONFIRMED';

comment on view human_confirmed_post_geography is 'DERIVED: per-post Chicago relevance tri-state (+NO_SIGNAL), independent of clustering -- see the section comment above for why this exists separately from jeremy_wedding_candidates.chicago_status';
comment on view human_confirmed_chicago_wedding_content is 'THE PRODUCT (Layer 1): human-confirmed real wedding + confirmed Chicago relevance, nothing else required. Vendor attribution/credit-stack/clustering/reconciliation stay independent, non-gating signals -- see docs/engineering/human-labeling/README.md';

-- Vendor association (D046, 2026-09-06): a further correction to the same
-- principle above -- "don't make a downstream use-case requirement a
-- prerequisite for retaining upstream evidence." human_confirmed_post_
-- vendor_evidence only captures vendors TAGGED/CREDITED in caption text
-- (stack-parser output); it has no notion of "the post's own author is
-- itself a known vendor." A venue posting about a real wedding it hosted,
-- crediting no one else, looked like zero vendor association even though
-- the venue IS the vendor. This view adds that missing signal with
-- explicit provenance (author vs. tagged vs. both) as one more
-- independent, joinable, NON-GATING dimension -- it does not change
-- Layer 1 membership (human_confirmed_chicago_wedding_content is
-- untouched). Scoped to all golden_set INCLUDE posts (matches
-- human_confirmed_post_vendor_evidence's own scope), not just the
-- Chicago-confirmed subset, so it's reusable regardless of Layer-1 status.
create view human_confirmed_post_vendor_association as
with author as (
  select
    gs.post_url,
    -- Resolves the post's author account from whichever corpus it came
    -- from, same defensive LEFT JOIN posture as getQueueBatch() in
    -- apps/web/lib/server/labeling.ts (staging.instagram_posts OR
    -- posts/accounts) -- unlike human_confirmed_post_geography above,
    -- deliberately does not assume staging-only.
    coalesce(a1.id, a2.id) as author_account_id
  from golden_set gs
  left join staging.instagram_posts sp on sp.post_url = gs.post_url
  left join accounts a1 on lower(a1.username::text) = lower(sp.owner_username)
  left join posts p on p.url = gs.post_url
  left join accounts a2 on a2.id = p.owner_id
  where gs.expected_decision = 'INCLUDE'
),
tagged as (
  select source_post_url as post_url, count(distinct account_id) as tagged_vendor_count
  from human_confirmed_post_vendor_evidence
  group by source_post_url
)
select
  au.post_url,
  au.author_account_id,
  -- EXISTS, not a plain join -- vendors.account_id is NOT unique
  -- (confirmed live: one account has 4 rows); a join here would fan out
  -- rows exactly like the bugs already found and fixed elsewhere in this
  -- workstream.
  exists (select 1 from vendors v where v.account_id = au.author_account_id) as author_is_vendor,
  coalesce(t.tagged_vendor_count, 0) as tagged_vendor_count,
  (exists (select 1 from vendors v where v.account_id = au.author_account_id)
     or coalesce(t.tagged_vendor_count, 0) > 0) as has_vendor_association,
  case
    when exists (select 1 from vendors v where v.account_id = au.author_account_id)
         and coalesce(t.tagged_vendor_count, 0) > 0 then 'BOTH'
    when exists (select 1 from vendors v where v.account_id = au.author_account_id) then 'AUTHOR_ONLY'
    when coalesce(t.tagged_vendor_count, 0) > 0 then 'TAGGED_ONLY'
    else 'NONE'
  end as vendor_association_type
from author au
left join tagged t on t.post_url = au.post_url;

-- Thin, purely derived selection for a vendor-page-shaped surface, which
-- structurally needs a vendor to route the post to. This is a downstream
-- consumer's own stricter requirement applied at query time -- it does
-- NOT change what Layer 1 itself contains.
create view human_confirmed_vendor_page_content as
select c.post_url, c.labeled_by, c.labeled_at, c.source_note,
       va.author_account_id, va.author_is_vendor,
       va.tagged_vendor_count, va.vendor_association_type
from human_confirmed_chicago_wedding_content c
join human_confirmed_post_vendor_association va on va.post_url = c.post_url
where va.has_vendor_association;

comment on view human_confirmed_post_vendor_association is 'DERIVED: per-post vendor-association evidence (author-is-vendor OR tagged/credited vendor), independent and non-gating -- see D046 in docs/decisions.md';
comment on view human_confirmed_vendor_page_content is 'One downstream consumer''s stricter view (Layer 1 content that also has a vendor to attach it to) -- does not redefine Layer 1 itself';

-- "v1 data completion, venues-first" mission (D047 follow-on, 2026-09-06). Track B's blanket
-- "venue-authored + V3 INCLUDE" promotion hand-read at only ~50-72% real-wedding precision (one
-- confirmed false positive, ~22% generic marketing) -- too noisy to auto-promote wholesale. The
-- couple-signal pattern (explicit named-couple language: Mr./Mrs., "Couple:", "Bride:", or
-- "Name & Name") narrowed this to near-100% precision on two independent hand-read samples,
-- INDEPENDENT of V3's own decision (most hits were posts V3 never scored or even EXCLUDEd) --
-- a venue's own account posting about a named couple is about as strong a "real wedding, real
-- Chicago location" prior as this corpus has. Third, deliberately separate evidence source
-- (same provenance-separation rule as human_confirmed_post_vendor_evidence vs.
-- jeremy_post_vendor_evidence) -- gated on stack_extraction_entries rows produced by
-- runStackParserOnVenueCoupleSignalPosts.ts (decision='VENUE_COUPLE_SIGNAL_INCLUDE'), scoped to
-- posts authored by a known Chicago venue vendor whose caption matches the couple-signal
-- pattern, explicitly excluding anything already in golden_set (avoid double-counting content
-- already flowing through the human-confirmed path).
create view venue_couple_signal_post_vendor_evidence as
select
  latest.source_post_url,
  a.id as account_id,
  latest.role,
  latest.role_raw,
  latest.line_no,
  latest.parser_version
from (
  select distinct on (post_url, line_no, handle)
    post_url as source_post_url, line_no, handle, role, role_raw, stack_parser_version as parser_version
  from stack_extraction_entries
  where stack_parser_version = (select max(stack_parser_version) from stack_extraction_runs)
  order by post_url, line_no, handle, extracted_at desc
) latest
join accounts a on lower(a.username::text) = latest.handle
where latest.role <> 'other'
  and exists (
    select 1
    from staging.instagram_posts sp
    join accounts va on lower(va.username::text) = lower(sp.owner_username)
    join vendors v on v.account_id = va.id
    where sp.post_url = latest.source_post_url
      -- D055: v.city='Chicago' is a geography claim here (this view's whole scope is
      -- "known Chicago venue"), not just venue identity -- only trust it with
      -- discovery_source='google_places' (docs/jeremy-ddl.sql defaults city to 'Chicago').
      and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
      and sp.caption_raw ~ '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)'
      and not exists (select 1 from golden_set gs where gs.post_url = sp.post_url)
  );

comment on view venue_couple_signal_post_vendor_evidence is 'DERIVED: vendor evidence for venue-authored, couple-signal-matched posts (V3-independent) -- see D047 follow-on in docs/decisions.md';

-- "v1 data completion, venues-first" mission (D047 follow-on, 2026-09-06), fourth evidence
-- source. Scoping finding: 18,802 posts authored by a non-venue Chicago vendor (photographer,
-- florist, planner, etc.) never got a jeremy_wedding_candidates venue anchor -- but this turned
-- out NOT to be a "vendor category" gap (the existing pipeline already anchors on ANY post with
-- a resolved venue-role credit, regardless of who authored it). It's a STACK-PARSER format gap:
-- hand-reading a sample of these posts found real weddings at real, already-known Chicago venues
-- credited only as a plain inline @mention ("wedding at @salvageone!", "venue 💒: @xyz") rather
-- than the parser's expected "Venue: @handle" label line. Bounded and low-risk, unlike the
-- abandoned venue_couple_signal-v2 track's open-ended name-pattern matching: this only matches
-- an EXACT handle already resolved as a Chicago venue in `vendors` (not a new-account-discovery
-- heuristic), reuses the exact promise-filter regex already proven in `venue_coverage_v3`
-- (buildVenueCoverageQueue.ts) to drop generic non-wedding content (birthday parties, etc.), and
-- unions in the post's OWN already-correctly-parsed non-venue vendor credits (photographer,
-- planner, ...) from jeremy_post_vendor_evidence so it can clear clustering's >=3-distinct-role
-- eligibility floor using real, already-verified evidence -- it only ever ADDS the missing venue
-- role, never invents other roles. Explicitly excludes anything already covered (has a `venue`
-- role in jeremy_post_vendor_evidence or human_confirmed_post_vendor_evidence already, or the
-- post is already a documented wedding). Sized live: 2,143 posts match a known Chicago venue
-- handle inline; 1,214 also clear the promise filter.
create view venue_inline_mention_post_vendor_evidence as
with recovered_venue as (
  select distinct sp.post_url as source_post_url, va.id as account_id, 'venue' as role
  from staging.instagram_posts sp
  cross join lateral regexp_matches(sp.caption_raw, '@([a-zA-Z0-9_.]+)', 'g') as m(handle_arr)
  join accounts va on lower(va.username::text) = lower(m.handle_arr[1])
  -- D055: v.city='Chicago' is a geography claim here (this view's whole scope is "known
  -- Chicago venue"), not just venue identity -- only trust it with
  -- discovery_source='google_places' (docs/jeremy-ddl.sql defaults city to 'Chicago').
  join vendors v on v.account_id = va.id and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
  where sp.caption_raw ~* '(wedding day|.s wedding|their wedding|wedding at |wedding weekend|wedding celebration|wedding reception|wedding ceremony|congrat.*wedding|bride|groom|mr\.? *& *mrs\.?)'
    and not exists (select 1 from jeremy_post_vendor_evidence e where e.source_post_url = sp.post_url and e.role = 'venue')
    and not exists (select 1 from human_confirmed_post_vendor_evidence e where e.source_post_url = sp.post_url and e.role = 'venue')
    and not exists (select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = sp.post_url)
)
select source_post_url, account_id, role from recovered_venue
union
select e.source_post_url, e.account_id, e.role
from jeremy_post_vendor_evidence e
where e.source_post_url in (select source_post_url from recovered_venue);

comment on view venue_inline_mention_post_vendor_evidence is 'DERIVED: recovers the missing venue-role credit for posts where a known Chicago venue was mentioned inline rather than in a labeled "Venue:" line, unioned with the post''s own already-parsed non-venue vendor credits -- see D047 follow-on in docs/decisions.md';

-- Track C (D047 follow-on, 2026-09-06): a venue's own portfolio content -- styled shoots,
-- venue-introduction posts, generic "our space is great for X" marketing -- proves the venue
-- hosts/can host weddings and shows its aesthetic, but is deliberately NOT gated on "is this a
-- specific real documented couple's wedding" the way the structured jeremy_wedding_candidates /
-- weddings pipeline is. Concrete motivating example, hand-verified this session: thefultonwest's
-- own account repeatedly reused two identical vendor-team photo sets across "National Cake Day,"
-- "Happy World Smile Day," a 1-year "Venue Day" anniversary post, and a generic capacity pitch --
-- real, useful content showing the venue's work, but no couple is ever named or evidenced, so it
-- correctly never became a `weddings` row. This view is that content's home: no V3/golden_set
-- gate, no clustering/reconciliation, no couple/date extraction -- just a basic non-spam floor
-- (has a real caption) on posts connected to a known Chicago venue vendor, own-profile OR
-- tagged. Every row is tagged with whether it ALSO cleared the couple-signal bar
-- (has_couple_evidence, same regex as venue_couple_signal_post_vendor_evidence above) and
-- whether it's ALSO already a documented real wedding (is_documented_wedding, via wedding_posts)
-- -- a post can be zero, one, or both simultaneously, never forced into one bucket. Purely
-- additive, non-gating, and not wired into any page yet (that's a separate, deferred UI decision
-- -- see docs/decisions.md D047).
create view venue_portfolio_content as
with venue_posts as (
  select sp.post_url, sp.caption_raw, va.id as venue_account_id, 'own_profile' as connection
  from staging.instagram_posts sp
  join accounts va on lower(va.username::text) = lower(sp.owner_username)
  join vendors v on v.account_id = va.id
  -- D055: v.city='Chicago' is a geography claim here (this view's whole scope is "a
  -- Chicago venue's own portfolio content") -- only trust it with
  -- discovery_source='google_places' (docs/jeremy-ddl.sql defaults city to 'Chicago').
  where v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
  union
  select e.source_post_url as post_url, sp.caption_raw, va.id as venue_account_id, 'tagged' as connection
  from jeremy_post_vendor_evidence e
  join accounts va on va.id = e.account_id
  join vendors v on v.account_id = va.id
  join staging.instagram_posts sp on sp.post_url = e.source_post_url
  where e.role = 'venue' and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
  union
  select e.source_post_url as post_url, sp.caption_raw, va.id as venue_account_id, 'tagged' as connection
  from human_confirmed_post_vendor_evidence e
  join accounts va on va.id = e.account_id
  join vendors v on v.account_id = va.id
  join staging.instagram_posts sp on sp.post_url = e.source_post_url
  where e.role = 'venue' and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
)
select distinct on (post_url)
  post_url,
  venue_account_id,
  connection,
  (caption_raw ~ '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)') as has_couple_evidence,
  exists (select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = venue_posts.post_url) as is_documented_wedding
from venue_posts
where coalesce(length(trim(caption_raw)), 0) > 15
order by post_url, connection;

comment on view venue_portfolio_content is 'Track C (D047 follow-on): a Chicago venue''s own portfolio content, own-profile or tagged, no couple/wedding gate at all -- non-gating dimension, distinct from Layer 1 (human_confirmed_chicago_wedding_content) and the structured weddings entity. See docs/decisions.md D047.';

-- Styled-shoot vs. real-wedding signal (D049, 2026-09-07). The user wants staged/editorial
-- content (no real couple) separated from real documented weddings -- not deleted, tagged, so a
-- future UI can default to real weddings and let users opt into styled content. Signal design
-- was empirically validated against golden_set ground truth before building this (94 confirmed-
-- styled EXCLUDE rows, 1,237 confirmed-real INCLUDE rows -- see docs/decisions.md D049 for the
-- full precision/recall numbers): a refined "styled shoot/editorial" phrase+hashtag regex has
-- 0.16% false-positive rate (vs. 16.7% for the bare "styl" substring the user themselves warned
-- would be noisy); vendor-stack richness and author-is-vendor do NOT discriminate styled from
-- real (both average ~7.2-7.45 distinct credits, ~81-83% vendor-authored) and are deliberately
-- NOT used as classifying signals here, only as a secondary "how much is at stake" dimension
-- once something is otherwise flagged; repeat-producer accounts (an author who shows up 2+ times
-- in the confirmed-styled set) is a real, validated signal matching the user's own hypothesis
-- ("some accounts might even be generating more styled shoots"). "Model" as a credited role was
-- tested and found to have zero occurrences anywhere in stack_extraction_entries at this
-- corpus's current scale -- not included as a structured signal for that reason.
create view post_styled_shoot_signal as
with post_universe as (
  select sp.post_url, sp.caption_raw as caption, lower(sp.owner_username) as author_username
  from staging.instagram_posts sp
  union
  select p.url as post_url, p.caption, lower(a.username::text) as author_username
  from posts p
  left join accounts a on a.id = p.owner_id
),
scored as (
  select post_url, max(caption) as caption, max(author_username) as author_username
  from post_universe
  group by post_url
),
golden_styled as (
  -- Highest-confidence source: the user's own golden_set labels. EXCLUDE only -- the 10
  -- INCLUDE/REVIEW rows that also carry a "styl" note are deliberately left OUT of this
  -- CONFIRMED bucket (the labeler's own words were "can't tell if this is real or styled"),
  -- surfaced instead in docs/decisions.md D049 as a separate, already-ambiguous-by-admission set.
  select post_url from golden_set
  where expected_decision = 'EXCLUDE'
    and (exclusion_reason = 'styled_or_editorial' or notes ~* 'styl' or exclusion_reason ~* 'styl')
),
golden_styled_authors as (
  select s.author_username, count(*) as n_styled_posts
  from golden_styled gsty
  join scored s on s.post_url = gsty.post_url
  where s.author_username is not null
  group by s.author_username
  having count(*) >= 2
),
known_network_accounts (username) as (
  values ('styledshootsacrossamerica'), ('stylemepretty'), ('chicagostyleweddings')
)
select
  s.post_url,
  s.author_username,
  (gsty.post_url is not null) as golden_set_confirmed_styled,
  coalesce(
    s.caption ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
    or s.caption ~* '#(styledshoot|stylizedshoot|editorialshoot|flatlaystyling)\y'
    -- D056 addendum (2026-09-08): extends the phrase/hashtag regex per the user's own read of a
    -- specific POSSIBLE-rated post ("This opulent Chicago style shoot... Models: @dr.king_speaks
    -- & @mike6691") -- a "style shoot" (no d) phrase and a "Models:" credit line, neither of which
    -- the original regex caught. Same \y word-boundary discipline as the original build (the
    -- #editorialweddingphotography false-positive lesson) applied to every new clause.
    --
    -- Two things were DROPPED after empirical testing against golden_set (see the vitest FP test
    -- below): (1) "inspiration|inspo|bridal" from the adjective+shoot phrase group, and
    -- "#weddinginspiration"/"#bridalinspo" from the hashtag family -- #weddinginspiration alone is
    -- 6.85% FP against confirmed-real golden INCLUDEs (108/1576), a hashtag real wedding vendors
    -- use constantly for inspiration boards, not just for styled shoots. (2) the bare
    -- "Models:"/"Model:" credit line is gated to co-occur with shoot/styled/editorial/session
    -- elsewhere in the caption -- ungated it alone is 0.89% FP (many real, golden-INCLUDE weddings
    -- credit a "Model:" for a bridal-boutique or trial-makeup feature within an otherwise-real
    -- wedding post), which combined with everything else pushed the total over the 1% bar.
    -- (3) three of the ORIGINAL D049 hashtags (#editorialwedding, #weddingflatlay,
    -- #designerschallenge) are also dropped here: this addendum is what first made \y (the
    -- Postgres word-boundary the #editorialweddingphotography lesson was supposed to guarantee)
    -- actually take effect in the deployed view -- see applyStyledShootSchema.ts's own comment --
    -- and once the hashtag clause actually ran, those three turned out to have real FP contact
    -- with golden INCLUDEs (7+3+1 = 11 posts) that the original 0.16% figure never caught because
    -- the clause was silently inert. Final combined FP: 7/1576 = 0.44%.
    or s.caption ~* '\y(styled?|editorial|concept)\s+(shoot|session|editorial)\y'
    or (s.caption ~* '\ymodels?\s*[:|]' and s.caption ~* '\y(shoot|styled|editorial|session)\y')
    or s.caption ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot|inspirationshoot|styledweddingshoot)\y'
    or (s.caption ~* '\ystyled by\y' and s.caption ~* '\yshoot\y'),
    false
  ) as phrase_or_hashtag_signal,
  coalesce(s.author_username in (select username from known_network_accounts), false) as known_network_account,
  (gsa.author_username is not null) as repeat_producer_account,
  coalesce(s.caption ~* 'styl', false) as bare_keyword_signal,
  case
    when gsty.post_url is not null then 'CONFIRMED'
    when s.caption ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
      or s.caption ~* '#(styledshoot|stylizedshoot|editorialshoot|flatlaystyling)\y'
      or s.caption ~* '\y(styled?|editorial|concept)\s+(shoot|session|editorial)\y'
      or (s.caption ~* '\ymodels?\s*[:|]' and s.caption ~* '\y(shoot|styled|editorial|session)\y')
      or s.caption ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot|inspirationshoot|styledweddingshoot)\y'
      or (s.caption ~* '\ystyled by\y' and s.caption ~* '\yshoot\y')
      then 'LIKELY'
    -- known_network_account is deliberately NOT in the LIKELY tier: hand-verification found
    -- chicagostyleweddings (one of the 3 known accounts) also authors real, golden_set-CONFIRMED
    -- weddings -- 9 of them -- so it's a mixed-content publication account, not a pure styled-
    -- shoot producer. Demoted to POSSIBLE alongside the other weak/noisy signals.
    when gsa.author_username is not null
      or s.author_username in (select username from known_network_accounts)
      or s.caption ~* 'styl'
      then 'POSSIBLE'
    else 'NO_SIGNAL'
  end as confidence
from scored s
left join golden_styled gsty on gsty.post_url = s.post_url
left join golden_styled_authors gsa on gsa.author_username = s.author_username;

comment on view post_styled_shoot_signal is 'DERIVED (D049): per-post styled-shoot-vs-real tri/quad-state signal (CONFIRMED/LIKELY/POSSIBLE/NO_SIGNAL), independent and non-gating -- never used to delete or exclude anything, only to tag. See docs/decisions.md D049.';

-- Rolls the per-post signal above up to the wedding level, for the ~50 already-created weddings
-- whose source post(s) carry a styled-shoot signal. Purely additive -- no weddings/wedding_posts
-- row is read-written, this only surfaces the tag for a future UI layer. Only weddings with at
-- least one flagged post appear (an explicit filter, not a default-false column), so "not in this
-- view" means NO_SIGNAL across all of that wedding's posts.
create view wedding_styled_shoot_flag as
with post_scores as (
  select
    wp.wedding_id,
    pss.post_url,
    pss.confidence,
    case pss.confidence when 'CONFIRMED' then 3 when 'LIKELY' then 2 when 'POSSIBLE' then 1 else 0 end as rank
  from wedding_posts wp
  join posts p on p.id = wp.post_id
  join post_styled_shoot_signal pss on pss.post_url = p.url
)
select
  wedding_id,
  (array_agg(confidence order by rank desc))[1] as styled_shoot_confidence,
  count(*) filter (where confidence <> 'NO_SIGNAL') as flagged_post_count
from post_scores
group by wedding_id
having max(rank) > 0;

comment on view wedding_styled_shoot_flag is 'DERIVED (D049): rolls post_styled_shoot_signal up to the wedding level -- only weddings with >=1 flagged post appear. Never touches weddings/wedding_posts; a future UI reads this to tag/separate styled-shoot content from real weddings.';

-- "Squeeze the 47k" mission, D055 (2026-09-08), Phase 0 step 5. Measured against golden_set
-- ground truth: 41% of human-confirmed real weddings are blocked from clustering purely on
-- venue resolution -- every existing evidence view (jeremy_post_vendor_evidence,
-- human_confirmed_post_vendor_evidence, venue_couple_signal_post_vendor_evidence,
-- venue_inline_mention_post_vendor_evidence) requires a `Role: @handle` credit line naming the
-- venue AND clustering's own >=3-distinct-role eligibility floor. This is a fifth, separate
-- provenance pool (same non-mixing rule as every source above -- see runJeremyWeddingClustering.ts)
-- that anchors the venue from ANY of four structural signals instead of requiring a labeled
-- credit line, and lowers the eligibility floor for venue-anchored posts only (enforced in
-- runJeremyWeddingClustering.ts's --evidence-source structural branch, NOT in this view -- kept a
-- plain evidence view like its predecessors).
--
-- Venue anchor priority, exactly one row per post with role='venue':
--   1. credit_line   -- a latest stack-parser entry with role='venue' (same "latest per
--                        (post_url,line_no,handle) by extracted_at" resolution as
--                        jeremy_post_vendor_evidence -- no parser-version filter, a fixed
--                        ROLE_MAP bug fix should correct a row, not require a rerun). If 2+
--                        DISTINCT (alias-resolved) venue accounts are credited on one post --
--                        the double-venue-tag case D050/D051 already burned us on once -- still
--                        emit exactly one row (lowest line_no wins) but set
--                        venue_anchor_conflict=true so a human sees it instead of it being
--                        silently picked.
--   2. author        -- only tried when no credit-line venue exists: the post's own
--                        `owner_username` resolves to an account that is independently known as
--                        a venue (v_account_role.role='venue' OR a `vendors` row with
--                        category='venue') -- same "author is a known venue" trust already used
--                        by venue_couple_signal/venue_portfolio_content, just without also
--                        requiring city='Chicago' here (chicago_status is resolved downstream).
--   3. location_tag  -- only tried when neither of the above resolves: `location_tag_venue_map`
--                        (built by buildLocationTagVenueMap.ts) on the post's IG location tag.
-- Every venue account is resolved through account_aliases to its canonical id before either the
-- conflict check or the emitted account_id -- two handles that alias to the SAME real venue must
-- never register as a conflict (D052-D054's account-aliasing lesson).
--
-- Non-venue evidence rows are just the post's own latest non-'other'/non-'venue' stack credits
-- (venue_anchor_source is null on these rows -- they aren't anchor candidates, just supporting
-- evidence). has_couple_signal reuses the exact couple-name regex already validated at
-- ~100% precision for venue_couple_signal_post_vendor_evidence; has_wedding_keyword is a
-- broader generic-language backstop, only meaningful in combination with has_couple_signal (see
-- the eligibility rule in runJeremyWeddingClustering.ts).
--
-- Universe: staging.instagram_posts (all 47k), excluding posts already promoted to a documented
-- wedding (wedding_posts via posts.url) and posts a human has explicitly EXCLUDEd
-- (golden_set.expected_decision='EXCLUDE') -- golden_set INCLUDE rows and never-labeled posts
-- both stay in-universe; sizing (D055 Phase 0) reports the split.
create view structural_post_vendor_evidence as
with latest as (
  select distinct on (post_url, line_no, handle)
    post_url as source_post_url, line_no, handle, role, role_raw, source, stack_parser_version as parser_version
  from stack_extraction_entries
  order by post_url, line_no, handle, extracted_at desc
),
universe as (
  -- D061 (2026-09-19): re-sourced from the pure v_ig_posts view (see the ACQUISITION LOOP banner at
  -- the end of this file) instead of staging.instagram_posts directly. Precedence by shortcode:
  -- staging always wins; a public (venue_tagged/own_profile) row only enters once it was scraped
  -- after the first acquisition run ever -- with ops.crawl_runs empty NOTHING public enters, so
  -- Ben's pre-existing crawl posts stay out in month 1 (D031). Documented-post guard by shortcode.
  select sp.post_url, sp.caption_raw, sp.post_timestamp, sp.location_tag, sp.owner_username
  from (
    -- Precedence without a distinct-on: staging rows always; a public row only when no staging
    -- row shares its shortcode. Two UNION ALL branches rather than one OR so the planner keeps
    -- table statistics (a Unique over the union estimated ~200 rows and an OR ~2.3k for ~46k;
    -- both turned the join with the 90k-row latest CTE into a nested/merge loop -- the full view
    -- went from ~2 min to >15 min on the D061 pilot, 2026-09-19).
    select * from v_ig_posts where corpus_source = 'staging'
    union all
    select * from v_ig_posts v
    where v.corpus_source = 'public'
      -- D061 (2026-09-20): a public row enters iff the loop REGISTERED it (ops.post_observations row,
      -- from ingest or a provenance-logged legacy batch) -- replaces the scrape-date gate.
      and exists (select 1 from ops.post_observations o where o.post_id = v.post_id)
      and not exists (select 1 from staging.instagram_posts s2
                      where (regexp_match(s2.post_url, '/p/([^/]+)'))[1] = v.shortcode)
  ) sp
  where not exists (
      select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.shortcode = sp.shortcode
    )
    and not exists (
      select 1 from golden_set gs where gs.post_url = sp.post_url and gs.expected_decision = 'EXCLUDE'
    )
),
-- Priority 1: labeled "Venue:"-style credit line, alias-resolved, one row per (post, canonical
-- venue account) so a same-account double-credit at two lines never looks like a conflict.
credit_line_accounts as (
  select distinct
    u.post_url as source_post_url,
    coalesce(al.canonical_account_id, a.id) as account_id,
    l.line_no,
    l.role_raw
  from universe u
  -- D055 parser v8: only LABELED credit lines anchor at this (highest) priority. The v8 prose
  -- (`inline_at`) and hashtag (`venue_hashtag`) venue credits are real anchors but weaker --
  -- hand-read 40 inline_at credits: venue correct ~90% when the post IS a wedding, but only
  -- ~1 in 3 is a wedding post at all -- so they rank BELOW author and location tag (see the
  -- inline_venue / hashtag_venue CTEs).
  join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'credit_line'
  join accounts a on lower(a.username::text) = l.handle
  left join account_aliases al on al.alias_account_id = a.id
),
-- D050/D055: when a post credits both a ceremony site and a reception venue, the RECEPTION
-- venue is the wedding's anchor (the ceremony site still gets a venue-role credit downstream,
-- see createWeddingsFromJeremyEvidence.ts's --from-confirmed-candidates path) -- matches the 39
-- structural candidates the user re-anchored by hand and D050's own reception-tiebreak precedent
-- (weddings 899, 5513). Priority: reception (0) > plain "venue"-labeled, not ceremony-ish (1) >
-- ceremony/church/parish/etc (2) > anything else (3), then lowest line_no within a tier. A label
-- like "Ceremony Venue" matches both the venue and ceremony patterns -- the ceremony/church check
-- deliberately requires excluding it from tier 1 so it lands in tier 2, not 1.
credit_line_venue as (
  select distinct on (source_post_url)
    source_post_url, account_id, line_no, role_raw
  from credit_line_accounts
  order by source_post_url,
    case
      when role_raw ~* 'reception' then 0
      when role_raw ~* 'venue' and role_raw !~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 1
      when role_raw ~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 2
      else 3
    end,
    line_no asc
),
credit_line_conflict as (
  select source_post_url
  from credit_line_accounts
  group by source_post_url
  having count(distinct account_id) > 1
),
-- Priority 2: author is an independently-known venue account (only for posts priority 1 missed).
-- Location tag (2nd priority, D055): the platform's own place tag, mapped by location_tag_venue_map.
location_venue as (
  select
    u.post_url as source_post_url,
    coalesce(al.canonical_account_id, ltm.venue_account_id) as account_id
  from universe u
  join location_tag_venue_map ltm on ltm.location_tag = u.location_tag
  left join account_aliases al on al.alias_account_id = ltm.venue_account_id
  where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
),
author_venue as (
  select
    u.post_url as source_post_url,
    coalesce(al.canonical_account_id, va.id) as account_id
  from universe u
  join accounts va on lower(va.username::text) = lower(u.owner_username)
  left join account_aliases al on al.alias_account_id = va.id
  where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
    -- D055 (user-caught): a photographer with a stray venue role vote was anchoring its own posts
    -- as "the venue" (wsphotography.us x7) while the real venue sat in the location tag. Author
    -- anchoring now (a) ranks BELOW the location tag and (b) is refused when the account's Places
    -- row says it is some other kind of vendor.
    and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
    and not exists (select 1 from vendors v where v.account_id = va.id and v.category is not null and v.category <> 'venue')
    and (
      exists (select 1 from v_account_role r where r.account_id = va.id and r.role = 'venue')
      or exists (select 1 from vendors v where v.account_id = va.id and v.category = 'venue')
    )
),
-- Priority 3: IG structured location tag resolves to a known venue (only for posts 1 and 2 missed).
-- v8 prose pattern ("tied the knot at @venue"), 4th priority. One row per post (lowest line).
inline_venue as (
  select distinct on (u.post_url)
    u.post_url as source_post_url,
    coalesce(al.canonical_account_id, a.id) as account_id,
    l.line_no, l.role_raw
  from universe u
  join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'inline_at'
  join accounts a on lower(a.username::text) = l.handle
  left join account_aliases al on al.alias_account_id = a.id
  where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
    and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
    and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
  order by u.post_url, l.line_no asc
),
-- v8 venue-branded hashtag ("#thedalcywedding"), 5th priority.
hashtag_venue as (
  select distinct on (u.post_url)
    u.post_url as source_post_url,
    coalesce(al.canonical_account_id, a.id) as account_id,
    l.line_no, l.role_raw
  from universe u
  join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'venue_hashtag'
  join accounts a on lower(a.username::text) = l.handle
  left join account_aliases al on al.alias_account_id = a.id
  where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
    and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
    and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
    and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
  order by u.post_url, l.line_no asc
),
-- D055 venue-discovery reader downstream (2026-09-09), 6th and LAST priority: the Haiku pool-b
-- reader's own venue attribution (extracted_venue_anchors, resolveDiscoveredVenues.ts), for
-- posts none of the five patterns above anchored at all. Ranked last because every pattern
-- above is either a labeled credit line or a direct structural signal (IG's own location tag,
-- the author's own known-venue identity, an inline/@ mention, a venue-branded hashtag) -- this
-- one is a model's read of free text, measured at 94% venue-attribution accuracy on documented
-- posts, good enough to be the anchor of last resort but not to outrank a real structural match.
extracted_venue as (
  select
    u.post_url as source_post_url,
    coalesce(al.canonical_account_id, eva.venue_account_id) as account_id
  from universe u
  join extracted_venue_anchors eva on eva.post_url = u.post_url
  left join account_aliases al on al.alias_account_id = eva.venue_account_id
  where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
    and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
    and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
    and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
    and not exists (select 1 from hashtag_venue hv where hv.source_post_url = u.post_url)
),
venue_anchor as (
  select
    source_post_url, account_id, 'venue'::text as role, role_raw, line_no,
    'credit_line'::text as venue_anchor_source,
    exists (select 1 from credit_line_conflict cc where cc.source_post_url = clv.source_post_url) as venue_anchor_conflict
  from credit_line_venue clv
  union all
  select source_post_url, account_id, 'venue', null, null, 'author', false
  from author_venue
  union all
  select source_post_url, account_id, 'venue', null, null, 'location_tag', false
  from location_venue
  union all
  select source_post_url, account_id, 'venue', role_raw, line_no, 'inline_at', false
  from inline_venue
  union all
  select source_post_url, account_id, 'venue', role_raw, line_no, 'venue_hashtag', false
  from hashtag_venue
  union all
  select source_post_url, account_id, 'venue', null, null, 'extracted', false
  from extracted_venue
),
non_venue_evidence as (
  select
    u.post_url as source_post_url,
    a.id as account_id,
    l.role,
    l.role_raw,
    l.line_no,
    null::text as venue_anchor_source,
    null::boolean as venue_anchor_conflict
  from universe u
  join latest l on l.source_post_url = u.post_url
  join accounts a on lower(a.username::text) = l.handle
  where l.role not in ('other', 'venue')
),
combined as (
  select * from venue_anchor
  union all
  select * from non_venue_evidence
),
-- D055 precision fix (2026-09-08): the couple-name alternative of the regex below
-- ([A-Z][a-z]+ *(&|+|and) *[A-Z][a-z]+) also matches two business words back-to-back --
-- "Lido Banquets & Events" hand-read as a false couple signal. Extract the match ONCE here
-- (whichever alternative fired) and veto it -- for has_couple_signal AND couple_guess alike --
-- when it contains a business word. couple_guess is the same extraction, lowercased, exposed so
-- runJeremyWeddingClustering.ts's structural branch can veto a Jaccard/date merge across two
-- posts that name two different couples, without re-parsing captions itself.
couple_extract as (
  select
    post_url,
    raw_match,
    (raw_match is not null and raw_match !~* '\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\y') as couple_signal_ok
  from (
    select
      u.post_url,
      substring(u.caption_raw from '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)') as raw_match
    from universe u
  ) x
)
select
  c.source_post_url,
  c.account_id,
  c.role,
  c.role_raw,
  c.line_no,
  c.venue_anchor_source,
  c.venue_anchor_conflict,
  coalesce(ce.couple_signal_ok, false) as has_couple_signal,
  coalesce(u.caption_raw ~* '\y(wedding|bride|groom|reception|ceremony|newlywed|married|mr\.? *& *mrs|i do|tied the knot|big day|vows?)\y', false) as has_wedding_keyword,
  u.post_timestamp::date as event_date,
  -- Appended last, not next to has_couple_signal: `create or replace view` only allows new
  -- columns at the end of the select list -- it errors ("cannot change name of view column") if
  -- an existing column's position shifts, even when the name/type at that position is otherwise
  -- identical. Verified directly against the already-applied structural-v1 view.
  case when ce.couple_signal_ok then lower(ce.raw_match) else null end as couple_guess,
  -- D055 addendum (2026-09-08, user mid-review: "consider filtering out the posts that say bar
  -- or bat mitzvah. that's almost always not a wedding"): flags a post that names a non-wedding
  -- event outright. Sized in the current queue at 43 posts naming one of these with NO wedding
  -- language at all. Appended last for the same create-or-replace-view reason as couple_guess
  -- above -- do not move it earlier in the list.
  coalesce(u.caption_raw ~* '\y(mitzvah|quincea|sweet\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\y', false) as has_non_wedding_event_keyword
from combined c
join universe u on u.post_url = c.source_post_url
join couple_extract ce on ce.post_url = c.source_post_url;

comment on view structural_post_vendor_evidence is 'DERIVED (D055 "squeeze the 47k" Phase 0, precision fixes for structural-v2 2026-09-08; extracted_venue_anchors 5th anchor source added 2026-09-09; D061 2026-09-19: universe re-sourced from v_ig_posts, shortcode precedence, public rows gated on scraped_at > first acquisition run): venue-anchors a post from credit-line, author-is-known-venue, IG location-tag, inline @mention, venue-branded hashtag, or (lowest priority, last resort) the Haiku pool-b reader''s own extraction (priority order, alias-resolved, conflict-flagged), plus the post''s own non-venue stack credits. has_couple_signal/couple_guess veto business-word false matches (e.g. "Lido Banquets & Events"). Eligibility (venue anchor + supporting evidence, anchor-source-dependent) and the couple-guess merge veto are enforced in runJeremyWeddingClustering.ts --evidence-source structural, not here. See docs/decisions.md D055, D061.';


-- D061 (2026-09-19): the same body as the view, restricted to one acquisition tick. Generated from
-- one template in apps/web/scripts/graph/applyStructuralEvidenceSchema.ts; keep the two in step.
create or replace function structural_post_vendor_evidence_for_batch(p_batch text)
   returns setof structural_post_vendor_evidence
   language sql stable
   as $fn$
   with latest as (
     select distinct on (post_url, line_no, handle)
       post_url as source_post_url, line_no, handle, role, role_raw, source, stack_parser_version as parser_version
     from stack_extraction_entries
     order by post_url, line_no, handle, extracted_at desc
   ),
   universe as (
     -- D061 (2026-09-19): re-sourced from the pure v_ig_posts view (owned by the acquisition
     -- schema script) instead of staging.instagram_posts directly, so tagged-feed acquisition
     -- posts join the same structural chain staging always has. Precedence by shortcode: staging
     -- always wins; a public (venue_tagged/own_profile) row only enters the universe once it was
     -- scraped after the first acquisition run ever (decision 5 -- with ops.crawl_runs empty,
     -- NOTHING public enters, so Ben's pre-existing ~6,370 crawl posts stay out in month 1).
     select sp.post_url, sp.caption_raw, sp.post_timestamp, sp.location_tag, sp.owner_username
     from (

       -- BATCH-SCOPED variant (structural_post_vendor_evidence_for_batch): the full source, then
       -- only the tick's first-observed posts. A join, not an OR on a session setting -- an OR
       -- cut the unscoped estimate 40x and re-created the nested-loop plan (D061 pilot).
       select * from (

       -- Precedence without a distinct-on: staging rows always; a public row only when no staging
       -- row shares its shortcode. Same rule either way, but the planner keeps table statistics
       -- (a Unique over the union estimated ~200 rows and turned the join with the 90k-row
       -- latest CTE into a nested loop -- the full view went from ~2 min to >15 min, D061 pilot).
       -- Two UNION ALL branches rather than one OR: an OR over the union view cut the planner's
       -- universe estimate 20x (2.3k for ~46k rows) and produced a 9.7-billion-row merge-join plan.
       select * from v_ig_posts where corpus_source = 'staging'
       union all
       select * from v_ig_posts v
       where v.corpus_source = 'public'
         and v.scraped_at > coalesce((select min(started_at) from ops.crawl_runs), 'infinity'::timestamptz)
         and not exists (select 1 from staging.instagram_posts s2
                         where (regexp_match(s2.post_url, '/p/([^/]+)'))[1] = v.shortcode)

       ) full_source
       where shortcode in (
         select p.shortcode from ops.post_observations o
         join ops.crawl_runs r on r.id = o.run_id
         join posts p on p.id = o.post_id
         where r.batch_id = p_batch and o.is_first)
     ) sp
     where not exists (
         select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.shortcode = sp.shortcode
       )
       and not exists (
         select 1 from golden_set gs where gs.post_url = sp.post_url and gs.expected_decision = 'EXCLUDE'
       )
   ),
   credit_line_accounts as (
     select distinct
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no,
       l.role_raw
     from universe u
     -- D055 parser v8: only LABELED credit lines anchor at this (highest) priority; the v8
     -- inline_at / venue_hashtag credits rank below author and location tag (see below).
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'credit_line'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
   ),
   -- D050/D055: when a post credits both a ceremony site and a reception venue, the RECEPTION
   -- venue is the wedding's anchor (the ceremony site still gets a venue-role credit downstream,
   -- see createWeddingsFromJeremyEvidence.ts's --from-confirmed-candidates path) -- matches the
   -- 39 structural candidates the user re-anchored by hand and D050's own reception-tiebreak
   -- precedent (weddings 899, 5513). Priority: reception (0) > plain "venue"-labeled, not
   -- ceremony-ish (1) > ceremony/church/parish/etc (2) > anything else (3), then lowest line_no
   -- within a tier. A label like "Ceremony Venue" matches both the venue and ceremony patterns --
   -- the ceremony/church check deliberately requires excluding it from tier 1 so it lands in
   -- tier 2, not 1.
   credit_line_venue as (
     select distinct on (source_post_url)
       source_post_url, account_id, line_no, role_raw
     from credit_line_accounts
     order by source_post_url,
       case
         when role_raw ~* 'reception' then 0
         when role_raw ~* 'venue' and role_raw !~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 1
         when role_raw ~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 2
         else 3
       end,
       line_no asc
   ),
   credit_line_conflict as (
     select source_post_url
     from credit_line_accounts
     group by source_post_url
     having count(distinct account_id) > 1
   ),
   location_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, ltm.venue_account_id) as account_id
     from universe u
     join location_tag_venue_map ltm on ltm.location_tag = u.location_tag
     left join account_aliases al on al.alias_account_id = ltm.venue_account_id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
   ),
   author_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, va.id) as account_id
     from universe u
     join accounts va on lower(va.username::text) = lower(u.owner_username)
     left join account_aliases al on al.alias_account_id = va.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       -- D055: author anchoring ranks BELOW the location tag and is refused when the account's
       -- Places row says it is some other kind of vendor (wsphotography.us x7).
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from vendors v where v.account_id = va.id and v.category is not null and v.category <> 'venue')
       and (
         exists (select 1 from v_account_role r where r.account_id = va.id and r.role = 'venue')
         or exists (select 1 from vendors v where v.account_id = va.id and v.category = 'venue')
       )
   ),
   inline_venue as (
     select distinct on (u.post_url)
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no, l.role_raw
     from universe u
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'inline_at'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
     order by u.post_url, l.line_no asc
   ),
   hashtag_venue as (
     select distinct on (u.post_url)
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no, l.role_raw
     from universe u
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'venue_hashtag'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
     order by u.post_url, l.line_no asc
   ),
   -- D055 venue-discovery reader downstream (2026-09-09), 6th and LAST priority: the Haiku
   -- pool-b reader's own venue attribution (extracted_venue_anchors, resolveDiscoveredVenues.ts),
   -- for posts none of the five patterns above anchored at all -- a model's read of free text
   -- (94% venue-attribution accuracy on documented posts), good enough to be the anchor of last
   -- resort but not to outrank any real structural match.
   extracted_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, eva.venue_account_id) as account_id
     from universe u
     join extracted_venue_anchors eva on eva.post_url = u.post_url
     left join account_aliases al on al.alias_account_id = eva.venue_account_id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
       and not exists (select 1 from hashtag_venue hv where hv.source_post_url = u.post_url)
   ),
   venue_anchor as (
     select
       source_post_url, account_id, 'venue'::text as role, role_raw, line_no,
       'credit_line'::text as venue_anchor_source,
       exists (select 1 from credit_line_conflict cc where cc.source_post_url = clv.source_post_url) as venue_anchor_conflict
     from credit_line_venue clv
     union all
     select source_post_url, account_id, 'venue', null, null, 'author', false
     from author_venue
     union all
     select source_post_url, account_id, 'venue', null, null, 'location_tag', false
     from location_venue
     union all
     select source_post_url, account_id, 'venue', role_raw, line_no, 'inline_at', false
     from inline_venue
     union all
     select source_post_url, account_id, 'venue', role_raw, line_no, 'venue_hashtag', false
     from hashtag_venue
     union all
     select source_post_url, account_id, 'venue', null, null, 'extracted', false
     from extracted_venue
   ),
   non_venue_evidence as (
     select
       u.post_url as source_post_url,
       a.id as account_id,
       l.role,
       l.role_raw,
       l.line_no,
       null::text as venue_anchor_source,
       null::boolean as venue_anchor_conflict
     from universe u
     join latest l on l.source_post_url = u.post_url
     join accounts a on lower(a.username::text) = l.handle
     where l.role not in ('other', 'venue')
   ),
   combined as (
     select * from venue_anchor
     union all
     select * from non_venue_evidence
   ),
   -- D055 precision fix (2026-09-08): the couple-name alternative of the regex below
   -- ([A-Z][a-z]+ *(&|+|and) *[A-Z][a-z]+) also matches two business words back-to-back --
   -- "Lido Banquets & Events" hand-read as a false couple signal. Extract the match ONCE here
   -- (whichever alternative fired) and veto it -- for has_couple_signal AND couple_guess alike --
   -- when it contains a business word. couple_guess is the same extraction, lowercased, exposed
   -- so runJeremyWeddingClustering.ts's structural branch can veto a Jaccard/date merge across
   -- two posts that name two different couples, without re-parsing captions itself.
   couple_extract as (
     select
       post_url,
       raw_match,
       (raw_match is not null and raw_match !~* '\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\y') as couple_signal_ok
     from (
       select
         u.post_url,
         substring(u.caption_raw from '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)') as raw_match
       from universe u
     ) x
   )
   select
     c.source_post_url,
     c.account_id,
     c.role,
     c.role_raw,
     c.line_no,
     c.venue_anchor_source,
     c.venue_anchor_conflict,
     coalesce(ce.couple_signal_ok, false) as has_couple_signal,
     coalesce(u.caption_raw ~* '\y(wedding|bride|groom|reception|ceremony|newlywed|married|mr\.? *& *mrs|i do|tied the knot|big day|vows?)\y', false) as has_wedding_keyword,
     u.post_timestamp::date as event_date,
     -- Appended last, not next to has_couple_signal: create or replace view only allows new
     -- columns at the end of the select list (errors otherwise, verified against the
     -- already-applied structural-v1 view: "cannot change name of view column").
     case when ce.couple_signal_ok then lower(ce.raw_match) else null end as couple_guess,
     -- D055 addendum (2026-09-08, user mid-review: "consider filtering out the posts that say
     -- bar or bat mitzvah. that's almost always not a wedding"): flags a post that names a
     -- non-wedding event outright. Sized in the current queue at 43 posts naming one of these
     -- with NO wedding language at all. Appended last for the same create-or-replace-view
     -- reason as couple_guess above -- do not move it earlier in the list.
     coalesce(u.caption_raw ~* '\y(mitzvah|quincea|sweet\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\y', false) as has_non_wedding_event_keyword
   from combined c
   join universe u on u.post_url = c.source_post_url
   join couple_extract ce on ce.post_url = c.source_post_url
   $fn$;
comment on function structural_post_vendor_evidence_for_batch(text) is 'DERIVED (D061): structural_post_vendor_evidence restricted to one acquisition tick (ops.crawl_runs.batch_id) -- same body, same row type, computes in seconds. Consumers under --acquisition-batch select from this instead of the view.';
-- v8 (D055, 2026-09-08 -- Phase 0 step 2): stack_extraction_entries gets a `source` column so
-- per-pattern precision can be measured before anything downstream trusts a new pattern the same
-- as a labeled credit line. Three values: 'credit_line' (the original LINE/NOCOLON_LINE "Label:
-- @handle" match, v1-v7 behavior, unchanged -- the default, so every pre-v8 row backfills
-- correctly with no re-parse), 'inline_at' (v8: "at @handle"/"at the @handle"/"@ @handle" matched
-- against caption prose, not a labeled line -- see stackParser.ts's INLINE_AT), and
-- 'venue_hashtag' (v8: "#<venuehandle>wedding"/"...bride"/"...couple"/etc. against a known-venue
-- username lookup -- see stackParser.ts's buildVenueHashtagRegex). Additive, defaulted, backfills
-- existing rows for free -- applied via apps/web/scripts/graph/applyStackEntrySourceColumn.ts.
alter table stack_extraction_entries add column if not exists source text not null default 'credit_line';
comment on column stack_extraction_entries.source is 'D055: which pattern produced this entry -- credit_line (labeled "Label: @handle" line, v1-v7 behavior), inline_at (v8, caption-prose "at @handle"), or venue_hashtag (v8, known-venue "#handlewedding"-shaped hashtag). Lets precision be measured per pattern before it is trusted like a labeled credit.';

-- D055 (2026-09-08) -- provenance/reversibility follow-up to Ben's question "if we claim too
-- many documented weddings, can we revert to what we had before?" `jeremy_weddings_created`
-- already logs which candidate created which wedding, but had no notion of WHICH SCRIPT RUN did
-- it -- so a bad ingestion batch could only be undone by hand-picking individual wedding ids out
-- of a live query, never as a unit. `batch_id` makes every future creation run (each one now
-- requires `--batch-id <id>`, see createWeddingsFromJeremyEvidence.ts) independently identifiable
-- and revertable via revertWeddingBatch.ts. Additive; rows created before D055 are left NULL --
-- they predate batch identity and stay covered by the existing per-candidate audit trail, just
-- not revertable as a batch.
alter table jeremy_weddings_created add column if not exists batch_id text;
comment on column jeremy_weddings_created.batch_id is 'D055: which createWeddingsFromJeremyEvidence.ts invocation created this row (required on every run from 2026-09-08 onward; suggested format d055-<source>-<YYYY-MM-DD>-<n>). NULL on rows created before batch identity existed. Lets revertWeddingBatch.ts undo one creation run as a unit.';
create index if not exists idx_jeremy_weddings_created_batch_id on jeremy_weddings_created(batch_id);

-- D055: provenance log for revertWeddingBatch.ts, mirroring orphaned_weddings_retired's shape
-- (the 2026-09-07 orphaned-wedding cleanup's ad hoc table) -- one row per wedding a batch revert
-- removed, capturing everything needed to understand and, if truly necessary, hand-reconstruct
-- what was undone without re-deriving it from a live query. This table (plus the snapshot CSVs
-- from snapshotGraphTables.ts) is the safety net Supabase's free tier doesn't give us for free --
-- no point-in-time recovery on this plan, so "can we revert" has to be answered in application
-- code, not by the platform.
create table if not exists weddings_retired_batches (
  id                     bigint generated always as identity primary key,
  batch_id               text not null,
  wedding_id             bigint not null,
  venue_id               bigint,
  event_date_est         date,
  is_chicago             boolean,
  wedding_created_at     timestamptz,
  candidate_id           bigint,
  post_ids               bigint[],
  vendor_account_ids     bigint[],
  removed_posts_imported bigint[], -- posts rows deleted because no other wedding referenced them
  reason                 text not null,
  retired_at             timestamptz not null default now()
);
comment on table weddings_retired_batches is 'D055: one row per wedding removed by revertWeddingBatch.ts, mirroring orphaned_weddings_retired''s provenance-on-delete shape. removed_posts_imported is the subset of post_ids whose posts row (source=jeremy_evidence) was deleted because no other wedding_posts row referenced it after this wedding was removed.';
create index if not exists idx_weddings_retired_batches_batch_id on weddings_retired_batches(batch_id);

-- D055 Phase 1 step 8 (2026-09-08): human review moves from the POST level (/label,
-- human_post_labels) to the wedding-CANDIDATE level (/label/candidates) -- the structural-v1
-- clustering source (Phase 0) produced thousands of venue-anchored jeremy_wedding_candidates
-- from signals weaker than a labeled credit line (author-is-venue, location tag, inline prose),
-- so the review question is no longer "is this one post a wedding" but "is this whole cluster of
-- posts the right venue, in Chicago, a real wedding, and not already documented" -- exactly one
-- decision per candidate instead of one per post. Same append-only, latest-wins discipline as
-- human_post_labels/human_post_labels_current (see docs/engineering/human-labeling/README.md):
-- relabeling a candidate never overwrites, it just inserts another row; this view resolves the
-- current state. The existing /label post-level flow is unchanged and stays live for calibration
-- -- this is a second, independent review surface, not a replacement.
create table if not exists candidate_review_decisions (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references jeremy_wedding_candidates(id),
  decision text not null check (decision in ('CONFIRM','WRONG_VENUE','NOT_WEDDING','DUPLICATE','UNSURE','SKIP')),
  corrected_venue_account_id bigint references accounts(id),   -- WRONG_VENUE: the right venue, if the reviewer names one
  duplicate_of_wedding_id bigint references weddings(id),      -- DUPLICATE: which existing wedding
  notes text,
  reviewed_by text not null,
  client_ms integer,
  reviewed_at timestamptz not null default now()
);
create index if not exists idx_candidate_review_decisions_candidate on candidate_review_decisions(candidate_id);
create view candidate_review_decisions_current as select distinct on (candidate_id) * from candidate_review_decisions order by candidate_id, reviewed_at desc;
comment on table candidate_review_decisions is 'RAW (append-only, D055 Phase 1 step 8): every wedding-candidate-level human review action from /label/candidates -- never overwritten on relabel. Confirmed candidates flow into golden_set (WEDDING) via the existing syncHumanLabelsToGoldenSet.ts, unchanged, because recordCandidateDecision() also writes human_post_labels rows (queue_version=''candidate_review_v1'') for every post in the candidate.';
comment on view candidate_review_decisions_current is 'DERIVED: latest candidate review decision per candidate_id, same DISTINCT ON convention as human_post_labels_current.';

-- D055 Phase 1 step 8, revised (2026-09-08): candidate_review_decisions/_current above was NEVER
-- used -- 0 rows -- before this replacement, per the user's own reaction to /label/candidates:
-- "this ui is confusing... lets design something better for labeling." 4,743 posts across 4,355
-- structural-v2 candidates is 1.09 posts/candidate, so candidate-level bundling saved almost
-- nothing and created exactly the confusing case (a bundle mixing a real wedding with the venue's
-- own marketing in the same review screen). Review moves back to the POST level -- the flow
-- already proven at /label -- but each post now carries its venue's context (chicago_status,
-- documented-wedding count, anchor conflict) so the reviewer isn't reviewing blind the way plain
-- /label is, and the resulting wedding is assembled server-side from per-post verdicts rather than
-- one bundled decision. candidate_review_decisions is left in place, unused going forward -- not
-- dropped, since it's a real (if empty) append-only log and dropping tables is not this change's
-- job.
create table if not exists post_venue_verdicts (
  id bigint generated always as identity primary key,
  post_url text not null,
  candidate_id bigint not null references jeremy_wedding_candidates(id),
  venue_account_id bigint references accounts(id),          -- the venue shown at review time
  verdict text not null check (verdict in ('THIS_VENUE','OTHER_VENUE','NOT_WEDDING','DUPLICATE','UNSURE','SKIP')),
  corrected_venue_account_id bigint references accounts(id), -- OTHER_VENUE, optional
  duplicate_of_wedding_id bigint references weddings(id),    -- DUPLICATE, optional
  reviewed_by text not null,
  client_ms integer,
  reviewed_at timestamptz not null default now()
);
create index if not exists idx_post_venue_verdicts_candidate on post_venue_verdicts(candidate_id);
create index if not exists idx_post_venue_verdicts_post on post_venue_verdicts(post_url);
create view post_venue_verdicts_current as select distinct on (post_url) * from post_venue_verdicts order by post_url, reviewed_at desc;
-- Derived candidate-level decision, SAME SHAPE as candidate_review_decisions_current plus included_post_urls,
-- so the creation path can read one thing:
create or replace view candidate_review_derived as
  select c.id as candidate_id,
    case when bool_or(v.verdict='THIS_VENUE') then 'CONFIRM'
         when bool_or(v.verdict='OTHER_VENUE') then 'WRONG_VENUE'
         when bool_or(v.verdict='DUPLICATE') then 'DUPLICATE'
         when bool_and(v.verdict='NOT_WEDDING') then 'NOT_WEDDING'
         else 'UNSURE' end as decision,
    (array_agg(v.corrected_venue_account_id) filter (where v.verdict='OTHER_VENUE'))[1] as corrected_venue_account_id,
    (array_agg(v.duplicate_of_wedding_id) filter (where v.verdict='DUPLICATE'))[1] as duplicate_of_wedding_id,
    array_agg(v.post_url) filter (where v.verdict='THIS_VENUE') as included_post_urls,
    array_agg(v.post_url) filter (where v.verdict='OTHER_VENUE') as other_venue_post_urls,
    count(*) filter (where v.verdict not in ('SKIP')) as posts_decided,
    (select count(*) from jeremy_wedding_candidate_posts cp where cp.candidate_id=c.id) as posts_total,
    max(v.reviewed_by) as reviewed_by, max(v.reviewed_at) as reviewed_at
  from jeremy_wedding_candidates c
  join post_venue_verdicts_current v on v.candidate_id=c.id
  group by c.id;
comment on table post_venue_verdicts is 'RAW (append-only, D055 post-per-screen review, 2026-09-08): every post-level venue-verdict human review action from /label/candidates (replaces candidate_review_decisions as the active review surface) -- never overwritten on relabel. venue_account_id is a snapshot of the candidate''s venue_account_id AT REVIEW TIME (provenance -- the candidate row itself can be recomputed later). recordPostVerdict() (lib/server/postVenueReview.ts) also writes ONE human_post_labels row per verdict (queue_version=''post_venue_review_v1'', THIS_VENUE/OTHER_VENUE/DUPLICATE->WEDDING, NOT_WEDDING->NOT_WEDDING, UNSURE->UNSURE, SKIP->none) so golden_set sync (syncHumanLabelsToGoldenSet.ts, unchanged) keeps working unmodified.';
comment on view post_venue_verdicts_current is 'DERIVED: latest verdict per post_url, same DISTINCT ON convention as human_post_labels_current/candidate_review_decisions_current.';
comment on view candidate_review_derived is 'DERIVED (D055): assembles a candidate-level decision from its posts'' per-post verdicts, same shape as candidate_review_decisions_current plus included_post_urls -- this is what createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates reads now instead of candidate_review_decisions_current. A candidate is complete when posts_decided = posts_total (every non-SKIP post has a verdict); eligible for graph creation when decision in (''CONFIRM'',''WRONG_VENUE'') and posts_decided = posts_total, attaching only included_post_urls (the THIS_VENUE posts -- OTHER_VENUE posts belong to a different venue''s wedding, not this one, so they are surfaced separately as other_venue_post_urls but never attached here).';

-- D055 addendum (2026-09-08): mid-review the user hit a post at Morgan Mfg that was a styled
-- shoot and had no way to say so -- "what if i want to leave a comment on n. like i just passed
-- morgan mfg and it had styled wedding but i couldn't enter that." post_venue_verdicts had nowhere
-- to put that; human_post_labels already had a notes column (see above, ~line 751) but
-- recordPostVerdict() never populated it. This adds notes to the verdict row itself (so the raw
-- per-post log carries the reviewer's reason, not just human_post_labels) and the UI now passes
-- the same text into both inserts in the one transaction. Structured N reasons are written as
-- `<reason_tag>[: free text]` (reason_tag in styled_shoot/marketing/other_event/other) -- writing
-- "styled_shoot" into notes is exactly the 'styl' substring D049's styled-shoot CONFIRMED bucket
-- already matches on (golden_styled CTE, ~line 1187: `notes ~* 'styl'`), so this feeds that ground
-- truth for free once synced via syncHumanLabelsToGoldenSet.ts (unchanged). Purely additive.
alter table post_venue_verdicts add column if not exists notes text;
comment on column post_venue_verdicts.notes is 'D055 addendum: optional reviewer note, e.g. a structured N reason (styled_shoot/marketing/other_event/other, optionally ": free text") or a free note attached via the / key. Carries through to human_post_labels.notes -> golden_set.notes on sync.';

-- D055 post-hoc merge pass (2026-09-08) -- the user, mid-review at /label/candidates: "im seeing
-- a lot of duplicates." Sized: 564 of 4,743 queued structural-v2 posts are the same couple name
-- at the same venue, split across 213+ separate jeremy_wedding_candidates rows --
-- runJeremyWeddingClustering.ts clusters on vendor-set Jaccard > 0.5 within 21 days, and
-- different vendors' posts about the SAME wedding (a photographer's post crediting only the
-- photographer + venue, a florist's post crediting only the florist + venue) often share too few
-- credited handles to Jaccard-match each other. The couple-name veto added to that script only
-- SPLITS mismatches within one clustering pass; nothing MERGES same-couple candidates clustering
-- never even compared. mergeStructuralCandidatesByCouple.ts is the merge half: groups
-- structural-v2 candidates by (venue_account_id, most-common couple_guess across their posts),
-- merges groups whose combined post-date span is <= 60 days (lowest candidate id survives),
-- skipping any group where a member already has a jeremy_weddings_created row. This table is the
-- provenance log for that merge, one row per absorbed candidate -- mirrors
-- weddings_retired_batches' log-before-delete shape (see above). survivor_candidate_id/
-- absorbed_candidate_id/venue_account_id are deliberately NOT foreign keys to
-- jeremy_wedding_candidates/accounts: the absorbed row is deleted as part of the same merge this
-- table is logging (a FK would make the log un-writable at the moment it matters), and this
-- mirrors jeremy_weddings_created.wedding_id / weddings_retired_batches.wedding_id's existing
-- "not stable across a future rebuild, log the value not the reference" reasoning.
create table if not exists structural_candidate_merges (
  id                    bigint generated always as identity primary key,
  survivor_candidate_id bigint not null,
  absorbed_candidate_id bigint not null,
  venue_account_id      bigint not null,
  couple                text not null,
  post_urls             text[] not null,
  reason                text not null,
  merged_at             timestamptz not null default now()
);
comment on table structural_candidate_merges is 'D055 (2026-09-08): provenance log for mergeStructuralCandidatesByCouple.ts -- one row per structural-v2 jeremy_wedding_candidates row absorbed into a same-venue+same-couple survivor candidate (posts and post_venue_verdicts reassigned to the survivor, the absorbed candidate row then deleted). Not FK-linked to jeremy_wedding_candidates -- the absorbed id no longer exists after the merge that wrote this row.';

-- D055 Phase 2 (2026-09-09, "squeeze the 47k" Phase 1 re-plan step 3): the LLM reader --
-- runExtract.ts asks Haiku 4.5 (via OpenRouter, same callTool plumbing as llmClassifier.ts) ONE
-- question per structural-v2 candidate post: does this post document a real wedding at the
-- candidate's anchored venue? See extractPrompt.ts for the prompt/schema (EXTRACT_PROMPT_VERSION
-- = 'extract-v1'). Primary key (post_url, prompt_version) -- a rerun under the SAME prompt_version
-- is an idempotent upsert (runExtract.ts does ON CONFLICT DO UPDATE, --force only); a NEW
-- prompt_version inserts fresh rows, so prior prompt versions' runs stay comparable. This table is
-- NOT a verdict by itself -- writing a real post_venue_verdicts row (reviewed_by='haiku-extract-v1')
-- happens separately, gated on confidence/threshold/OTHER_VENUE-handle-resolution (see
-- decideVerdictWrite in extractPrompt.ts) -- UNSURE is never written as a verdict.
create table if not exists post_extraction_runs (
  post_url               text not null,
  candidate_id           bigint,
  prompt_version         text not null,
  model                  text,
  result                 jsonb not null,      -- full structured tool-call output (ExtractResult)
  confidence             real,
  verdict                text,                -- THIS_VENUE/OTHER_VENUE/NOT_WEDDING/UNSURE
  corrected_venue_handle text,
  input_tokens           integer,
  output_tokens          integer,
  cost_usd               numeric,
  created_at             timestamptz not null default now(),
  primary key (post_url, prompt_version)
);
create index if not exists idx_post_extraction_runs_candidate on post_extraction_runs(candidate_id);
create index if not exists idx_post_extraction_runs_verdict on post_extraction_runs(verdict);

-- D055 (2026-09-09): `createWeddingsFromJeremyEvidence.ts --from-golden-legacy` recovers
-- golden_set INCLUDE posts that were clustered under a LEGACY clustering_version
-- ('human-confirmed-v1'/'jeremy-cluster-v1'/'venue-couple-signal-v1', pre-dating structural-v2)
-- and never made it into `weddings`. One sub-case of that mode (posts whose legacy candidate's
-- latest jeremy_wedding_candidate_reconciliation row already believes a matched Ben wedding)
-- ATTACHES the post to that EXISTING wedding rather than creating a new one -- `jeremy_weddings_
-- created` is deliberately NOT used for these rows: its own name and every comment describing it
-- (this script's own header, D023, D055's batch_id addendum) says "weddings THIS SCRIPT CREATED",
-- and revertWeddingBatch.ts reads it to decide which `weddings` rows to delete outright -- writing
-- an attach-only row there would make a future revert of this batch try to delete a wedding this
-- batch never created (possibly one of Ben's own 1,326 original-crawl weddings). This table is the
-- parallel, attach-only provenance log: one row per (batch_id, post_id) actually attached.
-- revertWeddingBatch.ts is NOT extended to read this table (out of scope for this change) -- a
-- future revert of an attach batch must, by hand or a follow-up script, delete the `wedding_posts`
-- row for each (wedding_id, post_id) pair logged here (and the underlying `posts` row too, ONLY if
-- it has source='jeremy_evidence' and no other wedding_posts row references it, same orphan check
-- revertWeddingBatch.ts already does for CREATEd posts) -- never delete the `weddings` row itself,
-- since this table never created one.
create table if not exists jeremy_wedding_post_attachments (
  batch_id      text not null,
  wedding_id    bigint not null,
  post_id       bigint not null,
  candidate_id  bigint not null,
  attached_at   timestamptz not null default now(),
  primary key (batch_id, post_id)
);
comment on table jeremy_wedding_post_attachments is 'D055 (2026-09-09): provenance for createWeddingsFromJeremyEvidence.ts --from-golden-legacy''s ATTACH sub-case (post''s legacy candidate already reconciled to an existing wedding) -- distinct from jeremy_weddings_created, which is strictly "weddings this script created" and is what revertWeddingBatch.ts deletes wholesale. wedding_id/post_id/candidate_id are deliberately NOT foreign keys, same "not stable across a future rebuild, log the value not the reference" reasoning as jeremy_weddings_created.wedding_id and weddings_retired_batches.wedding_id. Reverting an attach batch is NOT handled by revertWeddingBatch.ts (out of scope, see the section comment above) -- do it by hand: delete the wedding_posts row for each logged (wedding_id, post_id) pair, and the posts row too only if source=''jeremy_evidence'' and no other wedding_posts row references it; never delete the weddings row itself.';
create index if not exists idx_jeremy_wedding_post_attachments_batch on jeremy_wedding_post_attachments(batch_id);
create index if not exists idx_jeremy_wedding_post_attachments_wedding on jeremy_wedding_post_attachments(wedding_id);
comment on table post_extraction_runs is 'RAW (D055 Phase 2, extract-v1): one row per (post_url, prompt_version) LLM extraction attempt from runExtract.ts. result is the full structured tool-call output; verdict/confidence/corrected_venue_handle are denormalized copies for cheap querying/reporting. See decideVerdictWrite in extractPrompt.ts for how (or whether) a post_venue_verdicts row gets written from this.';

-- D055 Phase 2 pool-b (2026-09-09, "squeeze the 47k"): runExtract.ts --mode pool-b reads posts
-- with wedding-language captions but NO venue anchor of any kind (no stack_extraction_entries
-- venue credit, no location_tag_venue_map hit, owner not a known venue account) and not already
-- part of any jeremy_wedding_candidates -- there is no candidate_id to attach these runs to.
-- candidate_id above was ALREADY nullable (no NOT NULL constraint) both in this file and live in
-- Supabase (verified 2026-09-09) -- nothing to relax there. `pool` is the new bit: null for
-- every calibration/corpus/venue-calibration row, past and future; only pool-b sets it, to
-- 'pool-b' -- lets pool-b's discovery rows be selected back out of the shared table without a
-- prompt_version-based heuristic. Applied via scripts/classify/applyPostExtractionSchema.ts
-- (idempotent, add column if not exists).
alter table post_extraction_runs add column if not exists pool text;
comment on column post_extraction_runs.pool is 'D055 pool-b (2026-09-09): null for calibration/corpus/venue-calibration rows; ''pool-b'' for runExtract.ts --mode pool-b rows (posts with candidate_id NULL -- wedding-language caption, no venue anchor, not already in jeremy_wedding_candidate_posts). Lets pool-b''s rows be selected back out of the shared table.';
create index if not exists idx_post_extraction_runs_pool on post_extraction_runs(pool) where pool is not null;

-- D055 venue-discovery reader downstream (2026-09-09): resolveDiscoveredVenues.ts reads pool-b
-- extraction rows (post_extraction_runs.pool = 'pool-b', verdict in THIS_VENUE/OTHER_VENUE --
-- for pool-b both just mean "a real wedding, venue as extracted") and tries to resolve the
-- model's venue_handle_guess / venue_name to an EXISTING accounts row, three tiers:
--   A. venue_handle_guess resolves to an existing account (alias-aware) AND the caption itself
--      literally credits '@handle' (sanity check -- a handle that resolves but isn't in the
--      caption downgrades to tier B rather than being trusted blind).
--   B. venue_name normalizes (lowercase, strip punctuation, drop leading "the", collapse spaces)
--      to an EXISTING venue (exact match on accounts.full_name / vendors.name /
--      location_tag_venue_map.location_tag) that is vendors.category='venue' or already has
--      >=1 venue-role wedding.
--   C. neither resolves -> a NEW-VENUE LEAD (discovered_venue_leads below), never auto-minted
--      into accounts -- a new venue needs an independent geography check before it enters the
--      graph (same D052 rule reportDefaultCityVenueGeography.ts exists to enforce).
-- One row per post_url (that post's own venue verdict) -- this table never re-decides a post
-- that already has a stronger structural anchor (credit_line/author/location_tag/inline_at/
-- venue_hashtag); see structural_post_vendor_evidence's `extracted_venue` CTE below, which only
-- reaches this table for posts the other four anchor sources missed entirely. Applied via
-- scripts/graph/applyExtractedVenueAnchorSchema.ts (idempotent, create table if not exists) --
-- apply this BEFORE the view change below, since the view's extracted_venue CTE joins it.
create table if not exists extracted_venue_anchors (
  post_url         text primary key,
  venue_account_id bigint not null references accounts(id),
  source           text not null default 'extract-v1.2',
  confidence       real,
  venue_name_raw   text,
  resolved_by      text not null,           -- 'handle' (tier A) | 'name' (tier B)
  resolved_at      timestamptz default now()
);
comment on table extracted_venue_anchors is 'D055 venue-discovery reader downstream: one row per post_url the Haiku pool-b reader (extract-v1.2, posts with no structural anchor) resolved a venue for -- written by resolveDiscoveredVenues.ts. resolved_by is "handle" (venue_handle_guess resolved to an existing account, sanity-checked against the caption) or "name" (venue_name normalized-matched an existing venue unambiguously). Feeds structural_post_vendor_evidence as its 5th, lowest-priority venue_anchor_source ("extracted").';
create index if not exists idx_extracted_venue_anchors_account on extracted_venue_anchors(venue_account_id);

-- D055 venue-discovery reader downstream (2026-09-09), tier C of resolveDiscoveredVenues.ts:
-- pool-b posts whose venue neither a handle guess nor a name match resolves to an EXISTING
-- account -- likely a real venue the graph has never seen at all. Aggregated by normalized
-- venue name (one row per distinct candidate new venue, not per post) so a human can scan a
-- short list instead of hundreds of individual posts. Deliberately NOT auto-minted into
-- `accounts` and NOT written to `account_locations` -- the D052 rule (a new venue needs an
-- independent geography check before it enters the graph) applies here exactly as it did to
-- reportDefaultCityVenueGeography.ts's population; minting is a separate, later, approved step.
-- Applied via resolveDiscoveredVenues.ts itself (idempotent, create table if not exists),
-- written only under --apply.
create table if not exists discovered_venue_leads (
  name_norm        text primary key,        -- normalizeVenueName(venue_name), the grouping key
  name_display     text,                    -- a representative raw venue_name for display
  posts            int,                     -- distinct posts naming this venue
  owners           int,                     -- distinct staging.instagram_posts.owner_username
  location_claim   text,                    -- most common location_claim seen for this group
  metro_yes        int,                     -- chicago_metro='yes' vote count
  metro_no         int,                     -- chicago_metro='no' vote count
  metro_unknown    int,                     -- chicago_metro='unknown' vote count
  handle_guesses   text[],                  -- distinct venue_handle_guess values seen (none exist as accounts -- a mintable lead)
  sample_post_urls text[],                  -- up to 3 sample post_url values
  status           text default 'new',      -- 'new' until a human reviews/mints/rejects it
  updated_at       timestamptz default now()
);
comment on table discovered_venue_leads is 'D055 venue-discovery reader downstream, resolveDiscoveredVenues.ts tier C: candidate NEW venues the pool-b reader surfaced with no existing accounts match, aggregated by normalized venue name. Never auto-minted into accounts/account_locations -- see the D052 "independent geography check before it enters the graph" rule. status is a human review flag (default ''new''), not written by the resolver beyond that default.';

-- D056 stage 1 (2026-09-10, parser v10 "stack-parser-ts-v10", scripts/graph/stackParser.ts's
-- parseCaptionV2 / scripts/graph/runStackParserV10.ts) -- additive re-parse of the SAME corpus
-- using the D056 two-level taxonomy (scripts/graph/vendorRoleRules.ts classifyLabel()) instead of
-- v1-v9's flat 23-value normRole() map, plus two Next-list items bundled in: emoji-keyed credit
-- lines ("💐 @handle", no text label) and a non-wedding-event-title flag (baby/bridal shower,
-- birthday, ...). Parallel to, and never touching, stack_extraction_runs/stack_extraction_entries
-- above -- applied via scripts/graph/applyStackEntriesV2Schema.ts (idempotent, create table if not
-- exists). See docs/decisions.md D056.
create table if not exists stack_extraction_entries_v2 (
  post_url       text not null,
  parser_version text not null,
  line_no        int not null,
  label_raw      text not null,
  handle         text not null,
  role           text not null,          -- a VENDOR_ROLES slug, or 'participant:<role>' for a participant row
  event_context  text not null default 'wedding_day',
  source         text not null,          -- credit_line | inline_at | venue_hashtag | emoji_line
  rule_id        text,
  extracted_at   timestamptz default now()
);
comment on table stack_extraction_entries_v2 is 'D056 stage 1 (parser v10, stack-parser-ts-v10): one row per (post, credit-line, role, handle) using the D056 two-level taxonomy (vendorRoleRules.ts classifyLabel()), NOT the v1-v9 23-value normRole() map. role is a VENDOR_ROLES slug or participant:<role> for a participant-label row (bride/groom/couple/host_family/model/muse -- never a vendor). event_context is the phase (wedding_day/ceremony/reception/getting_ready/rehearsal_dinner/...). source is credit_line/inline_at/venue_hashtag/emoji_line. Additive alongside stack_extraction_entries (v1-v9) -- that table is never modified. See docs/decisions.md D056, scripts/graph/runStackParserV10.ts.';
create index if not exists idx_stack_extraction_entries_v2_post_version on stack_extraction_entries_v2 (post_url, parser_version);
create index if not exists idx_stack_extraction_entries_v2_handle on stack_extraction_entries_v2 (handle);
create index if not exists idx_stack_extraction_entries_v2_role on stack_extraction_entries_v2 (role);

create table if not exists stack_extraction_runs_v2 (
  post_url                text not null,
  parser_version          text not null,
  has_stack               boolean not null,  -- >=1 credit line detected (NOT v9's >=3-distinct-role notion)
  n_credits               int not null,
  non_wedding_event_title text,
  parsed_at               timestamptz default now(),
  primary key (post_url, parser_version)
);
comment on table stack_extraction_runs_v2 is 'D056 stage 1 (parser v10): one row per (post, parser_version) -- has_stack mirrors v9''s >=1-credit-line notion (NOT v9''s >=3-distinct-role has_stack), n_credits is stack_extraction_entries_v2''s row count for this post+version, non_wedding_event_title is set when the caption reads as a non-wedding event (baby/bridal shower, birthday, ...) with no wedding-recap signal alongside it -- flagged, not dropped. Written by runStackParserV10.ts, resumable (skips post_urls already present under the running parser_version). See docs/decisions.md D056.';

-- ============================================================
-- D056 stage 2 (2026-09-10) -- the two-level vendor taxonomy schema + the one revertable
-- migration that applies it. Applied via scripts/graph/applyVendorTaxonomySchema.ts (schema
-- half, idempotent) and scripts/graph/migrateVendorRolesV2.ts (data half, one transaction,
-- provenance in vendor_role_migrations below). See docs/decisions.md D056 and the plan file's
-- "Vendor-stack nomenclature" section (Design D/E, "Execution -- Stage 2", "Protecting venues
-- that are already right"). Neither script has been run with --apply yet as of this comment --
-- stage 1 (the v10 parser / stack_extraction_entries_v2 above) landed first and is still
-- re-parsing the corpus; stage 2 dry-runs against that live, in-progress data.
-- ============================================================

-- Reference table for the taxonomy itself (category -> role, display name, sort order, and
-- whether a role is a real vendor at all) -- seeded/upserted from VENDOR_ROLES
-- (scripts/graph/vendorRoleRules.ts), the single source of truth for the taxonomy. Distinct from
-- the `vendor_role` enum below: this table also carries `press_feature`/`noise` (is_vendor=false
-- -- never a wedding_vendors/wedding_vendor_credits row), which the enum never needs to hold.
create table if not exists vendor_roles (
  slug          text primary key,
  category      text not null,
  display_name  text not null,
  sort_order    int not null,
  is_vendor     boolean not null default true
);

-- Event-phase context a credit or venue applies to (D056 Design C) -- parsed from label
-- modifiers by vendorRoleRules.ts's extractContext(); a venue credited for two phases (ceremony
-- + reception) yields two separate wedding_vendor_credits rows, see below.
create type wedding_event as enum (
  'wedding_day', 'ceremony', 'reception', 'cocktail_hour', 'getting_ready', 'rehearsal_dinner',
  'welcome_party', 'after_party', 'brunch', 'engagement', 'shower', 'sangeet_mehndi'
);

-- `vendor_role` renames (D056 decision 7): beauty_other -> beauty_services, jeweler -> jewelry,
-- photobooth -> photo_booth, musician -> live_music. Each `rename value` is metadata-only -- it
-- changes what an EXISTING row already reads as with zero data-row churn, which is why the
-- migration reconciles wedding_vendors by DIFFING role sets rather than rewriting every row.
-- `hotel` is deliberately NOT renamed or dropped -- it stays in the enum, retired from USE by
-- migrateVendorRolesV2.ts's hotel rule (an existing 'hotel' credit becomes 'venue' when the
-- account IS the wedding's venue_id, else 'accommodations'), not by a rename.
alter type vendor_role rename value 'beauty_other' to 'beauty_services';
alter type vendor_role rename value 'jeweler' to 'jewelry';
alter type vendor_role rename value 'photobooth' to 'photo_booth';
alter type vendor_role rename value 'musician' to 'live_music';

-- The 30 new D056 vendor slugs not already in the (post-rename) enum -- the full role list minus
-- the 23 legacy values above and minus `press_feature`/`noise` (VENDOR_ROLES rows with
-- is_vendor=false, which never need a vendor_role enum value). Each `add value` runs as its own
-- committed statement outside any transaction that might try to USE it (Postgres restriction --
-- see applyVendorTaxonomySchema.ts's header).
alter type vendor_role add value if not exists 'venue_management';
alter type vendor_role add value if not exists 'accommodations';
alter type vendor_role add value if not exists 'coordinator';
alter type vendor_role add value if not exists 'event_design';
alter type vendor_role add value if not exists 'second_shooter';
alter type vendor_role add value if not exists 'drone';
alter type vendor_role add value if not exists 'album_editing';
alter type vendor_role add value if not exists 'lighting_production';
alter type vendor_role add value if not exists 'tent';
alter type vendor_role add value if not exists 'signage';
alter type vendor_role add value if not exists 'decor_other';
alter type vendor_role add value if not exists 'bar_service';
alter type vendor_role add value if not exists 'desserts';
alter type vendor_role add value if not exists 'mc';
alter type vendor_role add value if not exists 'cultural_performers';
alter type vendor_role add value if not exists 'dancers_choreography';
alter type vendor_role add value if not exists 'entertainment_other';
alter type vendor_role add value if not exists 'accessories';
alter type vendor_role add value if not exists 'alterations';
alter type vendor_role add value if not exists 'calligraphy';
alter type vendor_role add value if not exists 'live_painter';
alter type vendor_role add value if not exists 'guest_book';
alter type vendor_role add value if not exists 'favors_gifts';
alter type vendor_role add value if not exists 'valet';
alter type vendor_role add value if not exists 'security';
alter type vendor_role add value if not exists 'childcare';
alter type vendor_role add value if not exists 'pet_attendant';
alter type vendor_role add value if not exists 'travel_honeymoon';
alter type vendor_role add value if not exists 'website_registry';
alter type vendor_role add value if not exists 'staffing';

-- The granular truth wedding_vendors' aggregate is derived from: one row per (post, account,
-- role, event_context) credit, derived from stack_extraction_entries_v2 x wedding_posts by
-- migrateVendorRolesV2.ts, re-derivable and additive (on conflict do nothing). A venue credited
-- for two phases (Ceremony: @a / Reception: @b, or the same account at both) yields two rows.
create table if not exists wedding_vendor_credits (
  wedding_id      bigint not null references weddings(id),
  post_id         bigint not null references posts(id),
  account_id      bigint not null references accounts(id),
  role            vendor_role not null,
  event_context   wedding_event not null default 'wedding_day',
  label_raw       text,
  source          text not null,          -- credit_line | inline_at | venue_hashtag | emoji_line | mention_inferred
  parser_version  text not null,
  created_at      timestamptz default now(),
  primary key (wedding_id, post_id, account_id, role, event_context)
);

-- Bride/groom/couple/host_family/model/muse -- recognised, stored, NEVER rendered and NEVER a
-- wedding_vendors row. Used for duplicate detection (the same participant handles on two
-- weddings is a stronger merge signal than vendor-set Jaccard alone) and to exclude these
-- accounts from `edges`. An account can be a participant on one wedding and a real vendor
-- (credited by role) on another -- no conflict, see D056 decision 4.
create table if not exists wedding_participants (
  wedding_id        bigint references weddings(id),
  account_id        bigint references accounts(id),
  participant_role  text not null,
  source            text not null,
  created_at        timestamptz default now(),
  primary key (wedding_id, account_id, participant_role)
);

-- `venue_id` stays the reception/primary venue; `ceremony_venue_id` is set ONLY when a wedding's
-- v10 credits name a ceremony venue distinct from the reception venue (migrateVendorRolesV2.ts
-- step 2e) -- the one case allowed to move `venue_id` itself (to the reception account, if
-- `venue_id` previously pointed at the ceremony account). `accounts.venue_type` is an optional
-- filter facet (house_of_worship | hotel | restaurant | event_space | country_club | museum |
-- park_outdoor | farm_estate | other), never a counting rule -- D056 decision 1 (no
-- religion-specific ROLE; the kind of place is this facet instead).
alter table weddings add column if not exists ceremony_venue_id bigint references accounts(id);
alter table accounts add column if not exists venue_type text;

-- Provenance + printed-revert log for migrateVendorRolesV2.ts, same shape as
-- recreditManagementCompany.ts's wedding_vendor_recredits / remapWeddingsToCanonicalAccounts.ts's
-- account_alias_remaps: one row per changed wedding_vendors role (old_role/new_role, new_role
-- null on a delete, old_role null on a plain insert), one row per weddings.venue_id move
-- (old_venue_id/new_venue_id, table_name='weddings'), one row per wedding_participants insert
-- (table_name='wedding_participants').
create table if not exists vendor_role_migrations (
  id             bigserial primary key,
  batch_id       text not null,
  table_name     text not null,
  wedding_id     bigint,
  account_id     bigint,
  old_role       text,
  new_role       text,
  old_venue_id   bigint,
  new_venue_id   bigint,
  note           text,
  created_at     timestamptz default now()
);
comment on table vendor_role_migrations is 'D056 stage 2: provenance + printed-revert log for migrateVendorRolesV2.ts -- see that script''s header for the exact revert SQL it prints per batch_id. See docs/decisions.md D056.';

-- ============================================================
-- VENUE DETAILS v3 (D060, provenance-first)
-- Transcribed verbatim from apps/web/scripts/venue-details/applyVenueDetailsSchema.ts
-- (STATEMENTS[]) -- keep the two in sync by hand. See docs/decisions.md D060 and
-- the approved plan (hello-alright-want-to-quizzical-sparrow.md) for the provenance
-- model: source (snapshots/fetches) -> derived (runs) -> human (corrections) ->
-- history (versions) -> serving (venue_details + venue_details_current view).
-- ============================================================
create table if not exists venue_websites (
     account_id             bigint primary key references accounts(id),
     url                    text not null,
     source                 text not null check (source in ('vendors_website','accounts_external_url','legacy_venue_enrichment','manual','search')),
     confidence             real not null default 1,
     status                 text not null default 'candidate' check (status in ('candidate','verified','rejected','unreachable','js_shell')),
     http_status            int,
     final_url              text,
     checked_at             timestamptz,
     note                   text,
     batch_id               text,
     wedding_url            text,
     wedding_url_source     text check (wedding_url_source in ('legacy_enrichment_pages','homepage_link','common_path','manual')),
     wedding_url_checked_at timestamptz,
     created_at             timestamptz not null default now(),
     updated_at             timestamptz not null default now()
   );

create index if not exists idx_venue_websites_status on venue_websites(status);

create index if not exists idx_venue_websites_batch on venue_websites(batch_id);

comment on table venue_websites is 'D060 VenueDetails v3: pointer, one row per account -- discoverWebsites.ts writes/updates it. Provenance is batch_id + note (no history table yet, see docs/engineering/venue-enrichment/ plan LATER section). wedding_url/wedding_url_source/wedding_url_checked_at (2026-09-14 follow-up, "the wedding site variant, not just the homepage") are a second pointer found by scripts/venue-details/crawl/weddingPage.ts''s findWeddingPage in priority legacy_enrichment_pages -> homepage_link -> common_path -> manual; a manual wedding_url is never overwritten by a later discovery run, same lock discipline as the base url/source pair.';

create table if not exists venue_source_snapshots (
     id              bigserial primary key,
     account_id      bigint not null references accounts(id),
     url             text not null,
     final_url       text,
     kind            text not null check (kind in ('html','pdf')),
     sha256          text not null,
     r2_key          text not null,
     chars           int not null,
     title           text,
     has_text_layer  boolean,
     created_at      timestamptz not null default now(),
     unique(account_id, url, sha256)
   );

create index if not exists idx_venue_source_snapshots_sha256 on venue_source_snapshots(sha256);

comment on table venue_source_snapshots is 'D060 VenueDetails v3: SOURCE layer, insert-only -- cleaned text lives in R2 at venue-sources/<account_id>/<sha256>.txt, this row is metadata. No last_seen/fetch_count column (spec resolution "Snapshots are insert-only"): venue_source_fetches is the only clock. Never republish a snapshot; never UPDATE/DELETE this table.';

create table if not exists venue_source_fetches (
     id            bigserial primary key,
     account_id    bigint not null references accounts(id),
     url           text not null,
     http_status   int,
     content_type  text,
     outcome       text not null check (outcome in ('fetched','unchanged','js_shell','blocked','error','skipped')),
     snapshot_id   bigint references venue_source_snapshots(id),
     depth         int,
     score         int,
     crawl_batch   text,
     fetched_at    timestamptz not null default now()
   );

create index if not exists idx_venue_source_fetches_account_time on venue_source_fetches(account_id, fetched_at desc);

comment on table venue_source_fetches is 'D060 VenueDetails v3: one row per crawlVenue.ts fetch attempt, whether or not it produced a new snapshot (outcome=unchanged on a sha256 repeat). The only clock for "when was this URL last seen" -- see venue_source_snapshots comment.';

create table if not exists venue_details_runs (
     id                  bigserial primary key,
     account_id          bigint not null references accounts(id),
     prompt_version      text not null,
     schema_version      int not null default 3,
     model               text,
     stage               text not null default 'extract' check (stage in ('extract','repair')),
     parent_run_id       bigint references venue_details_runs(id),
     input_hash          text not null,
     snapshot_ids        bigint[] not null default '{}',
     website_url         text,
     result              jsonb not null default '{}',
     validation          jsonb,
     repairs             jsonb,
     spine_stated_count  int,
     critical_failures   int,
     input_tokens        int,
     output_tokens       int,
     cost_usd            numeric,
     created_at          timestamptz not null default now()
   );

create unique index if not exists uq_venue_details_runs_account_input_hash on venue_details_runs(account_id, input_hash) where stage = 'extract';

create index if not exists idx_venue_details_runs_account_time on venue_details_runs(account_id, created_at desc);

create index if not exists idx_venue_details_runs_prompt_version on venue_details_runs(prompt_version);

comment on table venue_details_runs is 'D060 VenueDetails v3: DERIVED layer, immutable -- one row per extractVenueDetails.ts/repairVenueDetails.ts call. Partial unique index on (account_id, input_hash) WHERE stage=''extract'' makes extraction resumable (spec resolution "Run uniqueness": NULL parent_run_id never collides in a plain unique constraint, so the partial index is scoped to stage=''extract'' and repair rows are unique on (parent_run_id, created_at) by construction).';

create table if not exists venue_details_corrections (
     id                   bigserial primary key,
     account_id           bigint not null references accounts(id),
     field_path           text not null,
     action               text not null check (action in ('set','unset','retire')),
     value                jsonb,
     reason               text,
     corrected_by         text not null,
     evidence_snapshot_id bigint references venue_source_snapshots(id),
     evidence_url         text,
     run_id               bigint references venue_details_runs(id),
     batch_id             text,
     created_at           timestamptz not null default now()
   );

create index if not exists idx_venue_details_corrections_account_field_time on venue_details_corrections(account_id, field_path, created_at desc);

comment on table venue_details_corrections is 'D060 VenueDetails v3: HUMAN layer, append-only (spec resolution "Corrections are genuinely append-only") -- no status/superseded_by column. Effective correction per (account_id, field_path) is the latest row by created_at; action=''retire'' clears it. Staleness (needs_recheck) is computed at serve time, not stored here.';

create table if not exists venue_details_versions (
     id                     bigserial primary key,
     account_id             bigint not null references accounts(id),
     version_no             int not null,
     details                jsonb not null,
     run_id                 bigint references venue_details_runs(id),
     correction_ids         bigint[] not null default '{}',
     changes                jsonb not null default '[]',
     reason                 text not null check (reason in ('extract','repair','correction','rollback','prompt_bump','legacy_import')),
     rollback_of_version_id bigint references venue_details_versions(id),
     batch_id               text,
     created_by             text,
     created_at             timestamptz not null default now(),
     unique(account_id, version_no)
   );

comment on table venue_details_versions is 'D060 VenueDetails v3: HISTORY layer, append-only -- one row per served state (see serveVenueDetails.ts / rollbackVenueDetails.ts). Versions are linear (unique account_id, version_no); a rollback writes a NEW version copying the target and moves the venue_details pointer, it never mutates or deletes a prior version.';

create table if not exists venue_details (
     account_id             bigint primary key references accounts(id),
     current_version_id     bigint not null references venue_details_versions(id),
     schema_version         int not null default 3,
     prompt_version         text,
     headline_seated        int,
     headline_seated_dance  int,
     headline_cocktail      int,
     headline_layout        text,
     headline_space_id      text,
     cocktail_only          boolean not null default false,
     venue_kind             text,
     setting                text,
     catering               text,
     bar                    text,
     rental_charge_type     text,
     pricing_archetype      text,
     price_from_usd         numeric,
     per_guest_from_usd     numeric,
     per_guest_to_usd       numeric,
     service_charge_pct     numeric,
     fb_minimum_applies     boolean,
     parking                text,
     day_of_coordinator     text,
     event_insurance        text,
     security               text,
     noise_curfew           text,
     spine_stated_count     int not null default 0,
     critical_stated_count  int not null default 0,
     compare_ready          boolean not null default false,
     needs_review           boolean not null default false,
     review_reasons         text[] not null default '{}',
     human_verified_at      timestamptz,
     verified_version_id    bigint references venue_details_versions(id),
     last_checked_at        timestamptz,
     last_changed_at        timestamptz,
     website_url            text,
     batch_id               text,
     served_at              timestamptz not null default now()
   );

create index if not exists idx_venue_details_headline_seated on venue_details(headline_seated);

create index if not exists idx_venue_details_catering on venue_details(catering);

create index if not exists idx_venue_details_bar on venue_details(bar);

create index if not exists idx_venue_details_pricing_archetype on venue_details(pricing_archetype);

create index if not exists idx_venue_details_compare_ready on venue_details(account_id) where compare_ready;

create index if not exists idx_venue_details_needs_review on venue_details(account_id) where needs_review;

create index if not exists idx_venue_details_batch on venue_details(batch_id);

comment on table venue_details is 'D060 VenueDetails v3: SERVING layer -- pointer (current_version_id) + denormalized spine columns for fast browse/compare/filter reads. Never the source of truth for the full document (that is venue_details_versions.details); this row is rebuilt by serveVenueDetails.ts on every new version.';

create or replace view venue_details_current as
     select
       vd.*,
       vv.version_no,
       vv.details,
       vv.created_at as version_created_at
     from venue_details vd
     join venue_details_versions vv on vv.id = vd.current_version_id;

comment on view venue_details_current is 'D060 VenueDetails v3: venue_details joined to its current version, exposing the full details jsonb + version_no + version_created_at alongside the denormalized serving columns.';

-- ============================================================
-- ACQUISITION LOOP (D061, 2026-09-19)
-- Transcribed verbatim from apps/web/scripts/acquire/applyAcquisitionSchema.ts (STATEMENTS[])
-- -- keep the two in sync by hand. Budgeted crawl targets (account x feed x depth) with yield
-- priors, fed to the existing parse -> cluster -> reader -> verdict -> creation chain. See
-- docs/decisions.md D061 and the approved plan (on-1-what-do-joyful-church.md).
-- ============================================================
create table if not exists ops.crawl_targets (
     id                    bigint generated always as identity primary key,
     account_id            bigint not null references accounts(id),
     canonical_account_id  bigint not null references accounts(id),
     feed                  text not null check (feed in ('tagged','own')),
     tier                  text not null,
     prior_w_per_post      real not null,
     prior_n               integer not null,
     status                text not null check (status in ('unknown','promising','dead','ambiguous','excluded')),
     features              jsonb not null,
     last_run_id           bigint,
     evaluated_at          timestamptz not null default now(),
     note                  text
   );
create index if not exists idx_crawl_targets_account_feed_evaluated on ops.crawl_targets (account_id, feed, evaluated_at desc);
comment on table ops.crawl_targets is 'OPS (D061): append-only prior rows for a budgeted crawl target (account x feed x depth) -- latest row per (account_id, feed) wins. tier is pilot|probe|canary|vendor|alias|deepen|recency_a|recency_b|discovered|profile. No excluded-target filter is enforced anywhere in commit 1 (see docs/decisions.md D061): observations point at the target row that existed at pick time, and targets are append-only, so a later exclusion cannot retroactively hide an earlier observation.';

create table if not exists ops.crawl_runs (
     id                  bigint generated always as identity primary key,
     batch_id            text not null,
     actor               text not null,
     feed                text not null check (feed in ('tagged','own','profile')),
     input               jsonb not null,
     apify_run_id        text unique,
     dataset_id          text,
     status              text not null default 'started' check (status in ('started','succeeded','failed','ingested','reverted')),
     items               integer,
     cost_usd            numeric(8,4),
     pipeline_versions   jsonb,
     started_at          timestamptz not null default now(),
     finished_at         timestamptz,
     ingested_at         timestamptz,
     note                text
   );
comment on table ops.crawl_runs is 'OPS (D061): the fetch log = the clock -- one row per Apify run. batch_id is the tick (acq-YYYYMMDD-<tick>). pipeline_versions is null at insert and written after the parse/cluster/reconcile/reader stages run for this run''s posts, not at run creation.';

-- Guarded FK: crawl_targets.last_run_id -> crawl_runs(id), added only once crawl_runs
-- exists and only if the constraint isn't already there (idempotent re-run).
do $$
   begin
     if not exists (
       select 1 from pg_constraint where conname = 'crawl_targets_last_run_fk'
     ) then
       alter table ops.crawl_targets
         add constraint crawl_targets_last_run_fk
         foreign key (last_run_id) references ops.crawl_runs(id);
     end if;
   end $$;

create table if not exists ops.crawl_run_seeds (
     run_id       bigint references ops.crawl_runs(id),
     account_id   bigint references accounts(id),
     target_id    bigint references ops.crawl_targets(id),
     requested    integer not null,
     fetched      integer,
     new_posts    integer,
     already_had  integer,
     stack_posts  integer,
     primary key (run_id, account_id)
   );
comment on table ops.crawl_run_seeds is 'OPS (D061): per-seed attribution inside a batched run -- one row per (run, account) with requested/fetched/new_posts/already_had/stack_posts counts, filled in by ingest.ts after processing that run''s items.';

create table if not exists ops.post_observations (
     run_id            bigint references ops.crawl_runs(id),
     post_id           bigint references posts(id),
     seed_account_id   bigint references accounts(id),
     target_id         bigint references ops.crawl_targets(id),
     observed_at       timestamptz not null default now(),
     is_first          boolean not null,
     caption_sha256    text not null,
     caption_changed   boolean not null default false,
     primary key (run_id, post_id)
   );
create index if not exists idx_post_observations_post_observed on ops.post_observations (post_id, observed_at);
comment on table ops.post_observations is 'OPS (D061): one row per sighting of a post (as opposed to posts, which holds only the first sighting''s raw/caption/scraped_at, never overwritten). PK (run_id, post_id) makes ingest.ts --run-id idempotent -- a re-run of the same run is a no-op. is_first marks the sighting that actually created the posts row; caption_changed compares this sighting''s caption_sha256 against the posts row''s caption on a re-sighting (absence from a capped feed is never treated as deletion).';

create table if not exists post_images (
     post_id     bigint references posts(id),
     idx         smallint,
     r2_key      text,
     width       integer,
     height      integer,
     bytes       integer,
     status      text not null check (status in ('stored','fetch_failed','invalid','skipped')),
     fetched_at  timestamptz default now(),
     primary key (post_id, idx)
   );
comment on table post_images is 'D061/D007: one row per candidate image for a post''s FIRST sighting (idx 0..4 for a Sidecar, 0 for a single Image, one skipped row for a Video). r2_key is an R2 key (D007: keys, never URLs) at posts/<shortcode>/<idx>.jpg, null when status is not ''stored''. Image fetching is fail-open by design (see ingest.ts) -- a fetch/validation failure here never aborts the run.';

create table if not exists ops.creation_decisions (
     id                     bigint generated always as identity primary key,
     batch_id               text not null,
     acquisition_batch_id   text not null,
     candidate_id           bigint not null references jeremy_wedding_candidates(id),
     decision               text not null check (decision in ('CREATE','CREATE_WEAK_MATCH','WOULD_ATTACH','HUMAN','SKIP')),
     match_confidence       real,
     matched_wedding_id     bigint references weddings(id),
     created_wedding_id     bigint references weddings(id),
     decided_at             timestamptz not null default now(),
     note                   text
   );
create index if not exists idx_creation_decisions_acquisition_batch on ops.creation_decisions (acquisition_batch_id);
-- D061 pilot rollback rehearsal (2026-09-19): decisions are append-only history; a reverted wedding
-- must not block the revert, so both wedding FKs set null on delete and REVERTED is a valid decision.
alter table ops.creation_decisions drop constraint if exists creation_decisions_created_wedding_id_fkey;
alter table ops.creation_decisions add constraint creation_decisions_created_wedding_id_fkey
  foreign key (created_wedding_id) references weddings(id) on delete set null;
alter table ops.creation_decisions drop constraint if exists creation_decisions_matched_wedding_id_fkey;
alter table ops.creation_decisions add constraint creation_decisions_matched_wedding_id_fkey
  foreign key (matched_wedding_id) references weddings(id) on delete set null;
alter table ops.creation_decisions drop constraint if exists creation_decisions_decision_check;
alter table ops.creation_decisions add constraint creation_decisions_decision_check
  check (decision in ('CREATE','CREATE_WEAK_MATCH','WOULD_ATTACH','HUMAN','SKIP','REVERTED'));
comment on table ops.creation_decisions is 'OPS (D061): one row per candidate createWeddingsFromJeremyEvidence.ts considered under --acquisition-batch scoping -- CREATE (no match), CREATE_WEAK_MATCH (0.5-0.7 reconciliation match, excluded from the coverage number until mergeDuplicateWeddings.ts clears it), WOULD_ATTACH (>=0.7 match, skipped -- no ATTACH lift in month 1), HUMAN (routed to /label/candidates), or SKIP. reportAcquisitionFunnel.ts reads this by acquisition_batch_id.';

-- ops.crawl_frontier stays read-only legacy; its pending rows become ops.crawl_targets with notes.

-- Pure normalization view: union of staging.instagram_posts and public.posts (venue_tagged /
-- own_profile), no dedupe, no eligibility, no exclusions -- see docs/decisions.md D061.
create index if not exists staging_instagram_posts_shortcode_idx on staging.instagram_posts (((regexp_match(post_url, '/p/([^/]+)'))[1]));

create or replace view v_ig_posts as
   select sp.post_url, (regexp_match(sp.post_url, '/p/([^/]+)'))[1] as shortcode,
          sp.caption_raw, sp.post_timestamp::timestamptz as post_timestamp, sp.location_tag,
          lower(sp.owner_username) as owner_username, sp.mentions, sp.hashtags, sp.post_type, sp.image_url,
          sp.likes_count, sp.vendor_id, sp.scraped_at::timestamptz as scraped_at,
          null::bigint as post_id, 'staging'::text as corpus_source
   from staging.instagram_posts sp
   union all
   select p.url as post_url, p.shortcode, p.caption as caption_raw, p.posted_at as post_timestamp,
          p.raw->>'locationName' as location_tag, lower(a.username::text) as owner_username,
          coalesce(p.raw->'mentions', '[]'::jsonb) as mentions, coalesce(p.raw->'hashtags', '[]'::jsonb) as hashtags,
          p.raw->>'type' as post_type, p.raw->>'displayUrl' as image_url, p.likes_count,
          null::integer as vendor_id, p.scraped_at, p.id as post_id, 'public'::text as corpus_source
   from posts p join accounts a on a.id = p.owner_id
   where p.source in ('venue_tagged','own_profile');
comment on view v_ig_posts is 'DERIVED (D061): pure normalization of every raw Instagram post we hold -- staging (Jeremy) union public.posts (Ben crawl + acquisition loop). NO dedupe, NO eligibility, NO exclusions: consumers apply distinct on (shortcode) with staging precedence and their own guards. The join key across sources is shortcode, never the URL string.';


-- ============================================================================
-- POST-TABLE MERGE (P1, 2026-09-22) -- transcribed VERBATIM from
-- apps/web/scripts/graph/applyPostMergeSchema.ts (keep the two in sync by hand).
-- Additive only: posts.origin/raw_format/staging_raw/staging_post_id/merge_batch_id,
-- unique(url), ops.post_merge_log, ops.post_merge_exclusions, the two synthetic
-- legacy-import crawl_runs, and the one-time origin/raw_format backfill.
-- Plan: ~/.claude/plans/read-thru-my-documentation-reflective-sundae.md (rev 3);
-- tick log: docs/engineering/post-merge/ticks.md.
-- ============================================================================
alter table posts add column if not exists origin text;
alter table posts add column if not exists raw_format text;
alter table posts add column if not exists staging_raw jsonb;
alter table posts add column if not exists staging_post_id integer;
alter table posts add column if not exists merge_batch_id text;
do $$ begin
     if not exists (select 1 from pg_constraint where conname = 'posts_origin_check') then
       alter table posts add constraint posts_origin_check
         check (origin in ('ben_pipeline','jeremy_beta','acquisition_loop'));
     end if;
     if not exists (select 1 from pg_constraint where conname = 'posts_raw_format_check') then
       alter table posts add constraint posts_raw_format_check
         check (raw_format in ('apify_v1','jeremy_evidence_subset','jeremy_staging_v1'));
     end if;
   end $$;
create unique index if not exists posts_url_key on posts (url);
create unique index if not exists posts_staging_post_id_key on posts (staging_post_id);
create table if not exists ops.post_merge_log (
     id               bigint generated always as identity primary key,
     batch_id         text not null,
     post_id          bigint,
     staging_post_id  integer,
     action           text not null,
     before           jsonb,
     after            jsonb,
     logged_at        timestamptz not null default now()
   );
create index if not exists idx_post_merge_log_batch on ops.post_merge_log (batch_id, action);
comment on table ops.post_merge_log is 'POST-TABLE MERGE (2026-09-22): append-only, one row per insert/relabel/link/observation-repair the merge made, with before-state. The revert reads it. Never updated or deleted.';
create table if not exists ops.post_merge_exclusions (
     staging_post_id  integer primary key,
     post_url         text not null,
     reason           text not null,
     batch_id         text not null,
     excluded_at      timestamptz not null default now()
   );
comment on table ops.post_merge_exclusions is 'POST-TABLE MERGE (2026-09-22): staging rows deliberately NOT merged into posts, each with its reason (the 10 profile urls, which are not posts).';
insert into ops.crawl_runs (batch_id, actor, feed, input, status, started_at, finished_at, ingested_at, note)
   select 'legacy-ben-pipeline', 'legacy-import', 'tagged',
          '{"source":"pipeline/pipeline.py (apify/instagram-tagged-scraper)","registered_by":"post-table merge P1"}'::jsonb,
          'ingested', '2026-08-20 05:21:20+00', '2026-08-20 06:32:26+00', now(),
          'POST-TABLE MERGE (2026-09-22): channel for Ben''s pre-loop pipeline.py crawl, bulk-loaded 2026-08-20 05:21-06:32 UTC. Sightings backfilled under this run use posts.scraped_at, which is the LOAD clock, not an Instagram scrape time. Not a strategy: excluded from w/$ (batch_id is not acq-%).'
   where not exists (select 1 from ops.crawl_runs where batch_id = 'legacy-ben-pipeline');
insert into ops.crawl_runs (batch_id, actor, feed, input, status, started_at, finished_at, ingested_at, note)
   select 'legacy-jeremy-beta-import', 'legacy-import', 'own',
          '{"source":"Jeremy beta RDS public.instagram_posts, loaded verbatim into staging.instagram_posts","registered_by":"post-table merge P1"}'::jsonb,
          'ingested', '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00', now(),
          'POST-TABLE MERGE (2026-09-22): channel for Jeremy''s beta own-profile scrape (vendor profiles, scraped 2026-06-17..08-21, imported 2026-08-22). Sightings use the staging row''s scraped_at (his real scrape clock). Not a strategy: excluded from w/$ (batch_id is not acq-%).'
   where not exists (select 1 from ops.crawl_runs where batch_id = 'legacy-jeremy-beta-import');
update posts p set origin = case
       when p.source = 'jeremy_evidence' then 'jeremy_beta'
       when exists (select 1 from ops.post_observations o join ops.crawl_runs r on r.id = o.run_id
                    where o.post_id = p.id and o.is_first and r.batch_id not like 'legacy-%') then 'acquisition_loop'
       else 'ben_pipeline' end
   where p.origin is null;
update posts set raw_format = case when source = 'jeremy_evidence' then 'jeremy_evidence_subset' else 'apify_v1' end
   where raw_format is null;
alter table posts alter column origin set not null;
alter table posts alter column raw_format set default 'apify_v1';
alter table posts alter column raw_format set not null;
comment on column posts.origin is 'POST-TABLE MERGE: which pipeline CREATED this row (ben_pipeline | jeremy_beta | acquisition_loop). No default: writers state it. Sightings (who saw it, when) live in ops.post_observations.';
comment on column posts.raw_format is 'POST-TABLE MERGE: shape of raw -- apify_v1 | jeremy_evidence_subset (5-field copy, pre-P3) | jeremy_staging_v1 (full staging row).';
comment on column posts.staging_raw is 'POST-TABLE MERGE: verbatim staging.instagram_posts row, only where raw is an Apify payload and the post is also in staging; normalized fields read it first (staging precedence).';

-- ============================================================================
-- POST-TABLE MERGE (P3 + P4 W1/W2, 2026-09-23) -- LIVE definitions after the merge, printed by
-- apps/web/scripts/graph/applyPostMergeViewsW1.ts --print-schema. These SUPERSEDE the earlier
-- definitions of the same objects in this file: nothing reads staging.instagram_posts any more;
-- Jeremy-slice views read v_jeremy_beta_posts (posts rows linked to staging). Pinned to the live DB by
-- scripts/graph/postMergeInvariants.test.ts. Note: the earlier structural_post_vendor_evidence_for_batch
-- text in this file was already stale vs live before the merge (live used the observation gate).
-- ============================================================================
create or replace view v_jeremy_beta_posts as
 SELECT p.staging_post_id AS id,
    (p.raw ->> 'vendor_id'::text)::integer AS vendor_id,
    p.url AS post_url,
    ((p.raw ->> 'location_tag'::text))::character varying(255) AS location_tag,
    p.raw ->> 'caption_raw'::text AS caption_raw,
    (p.raw ->> 'scraped_at'::text)::timestamp without time zone AS scraped_at,
    (p.raw ->> 'post_timestamp'::text)::timestamp without time zone AS post_timestamp,
    p.raw ->> 'image_url'::text AS image_url,
    (p.raw ->> 'likes_count'::text)::integer AS likes_count,
    ((p.raw ->> 'owner_username'::text))::character varying(100) AS owner_username,
    NULLIF(p.raw -> 'mentions'::text, 'null'::jsonb) AS mentions,
    NULLIF(p.raw -> 'hashtags'::text, 'null'::jsonb) AS hashtags,
    ((p.raw ->> 'post_type'::text))::character varying(20) AS post_type,
    NULLIF(p.raw -> 'images'::text, 'null'::jsonb) AS images,
    (p.raw ->> 'media_width'::text)::integer AS media_width,
    (p.raw ->> 'media_height'::text)::integer AS media_height,
    p.id AS post_id,
    p.shortcode
   FROM posts p
  WHERE p.staging_post_id IS NOT NULL AND p.raw_format = 'jeremy_staging_v1'::text
UNION ALL
 SELECT p.staging_post_id AS id,
    (p.staging_raw ->> 'vendor_id'::text)::integer AS vendor_id,
    p.url AS post_url,
    ((p.staging_raw ->> 'location_tag'::text))::character varying(255) AS location_tag,
    p.staging_raw ->> 'caption_raw'::text AS caption_raw,
    (p.staging_raw ->> 'scraped_at'::text)::timestamp without time zone AS scraped_at,
    (p.staging_raw ->> 'post_timestamp'::text)::timestamp without time zone AS post_timestamp,
    p.staging_raw ->> 'image_url'::text AS image_url,
    (p.staging_raw ->> 'likes_count'::text)::integer AS likes_count,
    ((p.staging_raw ->> 'owner_username'::text))::character varying(100) AS owner_username,
    NULLIF(p.staging_raw -> 'mentions'::text, 'null'::jsonb) AS mentions,
    NULLIF(p.staging_raw -> 'hashtags'::text, 'null'::jsonb) AS hashtags,
    ((p.staging_raw ->> 'post_type'::text))::character varying(20) AS post_type,
    NULLIF(p.staging_raw -> 'images'::text, 'null'::jsonb) AS images,
    (p.staging_raw ->> 'media_width'::text)::integer AS media_width,
    (p.staging_raw ->> 'media_height'::text)::integer AS media_height,
    p.id AS post_id,
    p.shortcode
   FROM posts p
  WHERE p.staging_post_id IS NOT NULL AND p.raw_format <> 'jeremy_staging_v1'::text;

comment on view v_jeremy_beta_posts is 'POST-TABLE MERGE (P4 W1, 2026-09-23): Jeremy''s beta rows, sourced from public.posts (rows linked to a staging row), with the staging.instagram_posts columns, types and values (from the verbatim staging row the merge stored) plus post_id/shortcode. Use it where a query is DEFINED on his slice; use posts / v_ig_posts for the whole corpus. Never read staging.instagram_posts.';

create or replace view v_ig_posts as
 SELECT p.url AS post_url,
    p.shortcode,
    p.raw ->> 'caption_raw'::text AS caption_raw,
    ((p.raw ->> 'post_timestamp'::text)::timestamp without time zone)::timestamp with time zone AS post_timestamp,
    (p.raw ->> 'location_tag'::text)::character varying AS location_tag,
    lower(p.raw ->> 'owner_username'::text) AS owner_username,
    NULLIF(p.raw -> 'mentions'::text, 'null'::jsonb) AS mentions,
    NULLIF(p.raw -> 'hashtags'::text, 'null'::jsonb) AS hashtags,
    (p.raw ->> 'post_type'::text)::character varying AS post_type,
    p.raw ->> 'image_url'::text AS image_url,
    (p.raw ->> 'likes_count'::text)::integer AS likes_count,
    (p.raw ->> 'vendor_id'::text)::integer AS vendor_id,
    ((p.raw ->> 'scraped_at'::text)::timestamp without time zone)::timestamp with time zone AS scraped_at,
    NULL::bigint AS post_id,
    'staging'::text AS corpus_source
   FROM posts p
  WHERE p.staging_post_id IS NOT NULL AND p.raw_format = 'jeremy_staging_v1'::text
UNION ALL
 SELECT p.url AS post_url,
    p.shortcode,
    p.staging_raw ->> 'caption_raw'::text AS caption_raw,
    ((p.staging_raw ->> 'post_timestamp'::text)::timestamp without time zone)::timestamp with time zone AS post_timestamp,
    (p.staging_raw ->> 'location_tag'::text)::character varying AS location_tag,
    lower(p.staging_raw ->> 'owner_username'::text) AS owner_username,
    NULLIF(p.staging_raw -> 'mentions'::text, 'null'::jsonb) AS mentions,
    NULLIF(p.staging_raw -> 'hashtags'::text, 'null'::jsonb) AS hashtags,
    (p.staging_raw ->> 'post_type'::text)::character varying AS post_type,
    p.staging_raw ->> 'image_url'::text AS image_url,
    (p.staging_raw ->> 'likes_count'::text)::integer AS likes_count,
    (p.staging_raw ->> 'vendor_id'::text)::integer AS vendor_id,
    ((p.staging_raw ->> 'scraped_at'::text)::timestamp without time zone)::timestamp with time zone AS scraped_at,
    NULL::bigint AS post_id,
    'staging'::text AS corpus_source
   FROM posts p
  WHERE p.staging_post_id IS NOT NULL AND p.raw_format <> 'jeremy_staging_v1'::text
UNION ALL
 SELECT p.url AS post_url,
    p.shortcode,
    p.caption AS caption_raw,
    p.posted_at AS post_timestamp,
    (p.raw ->> 'locationName'::text)::character varying AS location_tag,
    lower(a.username::text) AS owner_username,
    COALESCE(p.raw -> 'mentions'::text, '[]'::jsonb) AS mentions,
    COALESCE(p.raw -> 'hashtags'::text, '[]'::jsonb) AS hashtags,
    (p.raw ->> 'type'::text)::character varying AS post_type,
    p.raw ->> 'displayUrl'::text AS image_url,
    p.likes_count,
    NULL::integer AS vendor_id,
    p.scraped_at,
    p.id AS post_id,
    'public'::text AS corpus_source
   FROM posts p
     JOIN accounts a ON a.id = p.owner_id
  WHERE p.staging_post_id IS NULL;

create or replace view v1_content_corpus as
 SELECT cs.post_url,
    cs.candidate_generation_version,
    cs.score AS candidate_score,
    cs.vendor_role_count,
    cs.vendor_roles,
    pc.decision AS v3_decision,
    pc.confidence AS v3_confidence,
    pc.classifier_version,
    pc.model,
    pc.tier,
    pc.exclusion_reason,
    pc.evidence,
    pc.event_date,
    pc.classified_at,
    sp.caption_raw,
    sp.image_url,
    sp.images,
    sp.post_timestamp AS posted_at,
    sp.owner_username,
    sp.location_tag,
    sp.hashtags,
    sp.mentions,
    sp.likes_count,
    v.name AS vendor_name,
    v.category AS vendor_category,
    v.instagram_handle AS vendor_instagram_handle
   FROM candidate_scores cs
     JOIN LATERAL ( SELECT pcr.id,
            pcr.post_url,
            pcr.classifier_version,
            pcr.prompt_version,
            pcr.model,
            pcr.tier,
            pcr.decision,
            pcr.confidence,
            pcr.is_wedding,
            pcr.is_real_wedding,
            pcr.is_chicago,
            pcr.is_credible_source,
            pcr.exclusion_reason,
            pcr.evidence,
            pcr.input_hash,
            pcr.cost_usd,
            pcr.latency_ms,
            pcr.classified_at,
            pcr.posted_at,
            pcr.event_date,
            pcr.event_date_confidence
           FROM post_classification_runs pcr
          WHERE pcr.post_url = cs.post_url AND pcr.classifier_version = 'v3'::text
          ORDER BY pcr.classified_at DESC
         LIMIT 1) pc ON true
     JOIN v_jeremy_beta_posts sp ON sp.post_url = cs.post_url
     LEFT JOIN staging.vendors v ON v.id = sp.vendor_id
  WHERE cs.candidate_generation_version = 'candidate-score-v1'::text AND cs.score >= 12 AND pc.decision = 'INCLUDE'::post_decision;

create or replace view human_confirmed_post_geography as
 SELECT gs.post_url,
        CASE
            WHEN venue_signals.any_confirmed THEN 'CONFIRMED'::text
            WHEN sp.location_tag::text ~* 'chicago'::text THEN 'CONFIRMED'::text
            WHEN sp.caption_raw ~* 'chicago'::text THEN 'CONFIRMED'::text
            WHEN venue_signals.any_not_confirmed THEN 'NOT_CONFIRMED'::text
            WHEN sp.location_tag::text ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)'::text THEN 'NOT_CONFIRMED'::text
            WHEN sp.caption_raw ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)'::text THEN 'NOT_CONFIRMED'::text
            WHEN venue_signals.has_any_venue THEN 'AMBIGUOUS'::text
            ELSE 'NO_SIGNAL'::text
        END AS chicago_status
   FROM golden_set gs
     JOIN v_jeremy_beta_posts sp ON sp.post_url = gs.post_url
     LEFT JOIN LATERAL ( SELECT bool_or(al.in_metro = true OR v.city = 'Chicago'::text AND v.discovery_source = 'google_places'::text) AS any_confirmed,
            bool_or(al.in_metro = false) AS any_not_confirmed,
            count(*) > 0 AS has_any_venue
           FROM human_confirmed_post_vendor_evidence e
             LEFT JOIN account_locations al ON al.account_id = e.account_id
             LEFT JOIN LATERAL ( SELECT vendors.city,
                    vendors.discovery_source
                   FROM vendors
                  WHERE vendors.account_id = e.account_id
                  ORDER BY vendors.id
                 LIMIT 1) v ON true
          WHERE e.source_post_url = gs.post_url AND e.role = 'venue'::text) venue_signals ON true
  WHERE gs.expected_decision = 'INCLUDE'::post_decision;

create or replace view human_confirmed_post_vendor_association as
 WITH author AS (
         SELECT gs.post_url,
            COALESCE(a1.id, a2.id) AS author_account_id
           FROM golden_set gs
             LEFT JOIN v_jeremy_beta_posts sp ON sp.post_url = gs.post_url
             LEFT JOIN accounts a1 ON lower(a1.username::text) = lower(sp.owner_username::text)
             LEFT JOIN posts p ON p.url = gs.post_url
             LEFT JOIN accounts a2 ON a2.id = p.owner_id
          WHERE gs.expected_decision = 'INCLUDE'::post_decision
        ), tagged AS (
         SELECT human_confirmed_post_vendor_evidence.source_post_url AS post_url,
            count(DISTINCT human_confirmed_post_vendor_evidence.account_id) AS tagged_vendor_count
           FROM human_confirmed_post_vendor_evidence
          GROUP BY human_confirmed_post_vendor_evidence.source_post_url
        )
 SELECT au.post_url,
    au.author_account_id,
    (EXISTS ( SELECT 1
           FROM vendors v
          WHERE v.account_id = au.author_account_id)) AS author_is_vendor,
    COALESCE(t.tagged_vendor_count, 0::bigint) AS tagged_vendor_count,
    (EXISTS ( SELECT 1
           FROM vendors v
          WHERE v.account_id = au.author_account_id)) OR COALESCE(t.tagged_vendor_count, 0::bigint) > 0 AS has_vendor_association,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM vendors v
              WHERE v.account_id = au.author_account_id)) AND COALESCE(t.tagged_vendor_count, 0::bigint) > 0 THEN 'BOTH'::text
            WHEN (EXISTS ( SELECT 1
               FROM vendors v
              WHERE v.account_id = au.author_account_id)) THEN 'AUTHOR_ONLY'::text
            WHEN COALESCE(t.tagged_vendor_count, 0::bigint) > 0 THEN 'TAGGED_ONLY'::text
            ELSE 'NONE'::text
        END AS vendor_association_type
   FROM author au
     LEFT JOIN tagged t ON t.post_url = au.post_url;

create or replace view venue_couple_signal_post_vendor_evidence as
 SELECT latest.source_post_url,
    a.id AS account_id,
    latest.role,
    latest.role_raw,
    latest.line_no,
    latest.parser_version
   FROM ( SELECT DISTINCT ON (stack_extraction_entries.post_url, stack_extraction_entries.line_no, stack_extraction_entries.handle) stack_extraction_entries.post_url AS source_post_url,
            stack_extraction_entries.line_no,
            stack_extraction_entries.handle,
            stack_extraction_entries.role,
            stack_extraction_entries.role_raw,
            stack_extraction_entries.stack_parser_version AS parser_version
           FROM stack_extraction_entries
          WHERE stack_extraction_entries.stack_parser_version = (( SELECT max(stack_extraction_runs.stack_parser_version) AS max
                   FROM stack_extraction_runs))
          ORDER BY stack_extraction_entries.post_url, stack_extraction_entries.line_no, stack_extraction_entries.handle, stack_extraction_entries.extracted_at DESC) latest
     JOIN accounts a ON lower(a.username::text) = latest.handle
  WHERE latest.role <> 'other'::text AND (EXISTS ( SELECT 1
           FROM v_jeremy_beta_posts sp
             JOIN accounts va ON lower(va.username::text) = lower(sp.owner_username::text)
             JOIN vendors v ON v.account_id = va.id
          WHERE sp.post_url = latest.source_post_url AND v.city = 'Chicago'::text AND v.discovery_source = 'google_places'::text AND v.category = 'venue'::text AND sp.caption_raw ~ '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)'::text AND NOT (EXISTS ( SELECT 1
                   FROM golden_set gs
                  WHERE gs.post_url = sp.post_url))));

create or replace view venue_inline_mention_post_vendor_evidence as
 WITH recovered_venue AS (
         SELECT DISTINCT sp.post_url AS source_post_url,
            va.id AS account_id,
            'venue'::text AS role
           FROM v_jeremy_beta_posts sp
             CROSS JOIN LATERAL regexp_matches(sp.caption_raw, '@([a-zA-Z0-9_.]+)'::text, 'g'::text) m(handle_arr)
             JOIN accounts va ON lower(va.username::text) = lower(m.handle_arr[1])
             JOIN vendors v ON v.account_id = va.id AND v.city = 'Chicago'::text AND v.discovery_source = 'google_places'::text AND v.category = 'venue'::text
          WHERE sp.caption_raw ~* '(wedding day|.s wedding|their wedding|wedding at |wedding weekend|wedding celebration|wedding reception|wedding ceremony|congrat.*wedding|bride|groom|mr\.? *& *mrs\.?)'::text AND NOT (EXISTS ( SELECT 1
                   FROM jeremy_post_vendor_evidence e
                  WHERE e.source_post_url = sp.post_url AND e.role = 'venue'::text)) AND NOT (EXISTS ( SELECT 1
                   FROM human_confirmed_post_vendor_evidence e
                  WHERE e.source_post_url = sp.post_url AND e.role = 'venue'::text)) AND NOT (EXISTS ( SELECT 1
                   FROM wedding_posts wp
                     JOIN posts p ON p.id = wp.post_id
                  WHERE p.url = sp.post_url))
        )
 SELECT recovered_venue.source_post_url,
    recovered_venue.account_id,
    recovered_venue.role
   FROM recovered_venue
UNION
 SELECT e.source_post_url,
    e.account_id,
    e.role
   FROM jeremy_post_vendor_evidence e
  WHERE (e.source_post_url IN ( SELECT recovered_venue.source_post_url
           FROM recovered_venue));

create or replace view venue_portfolio_content as
 WITH venue_posts AS (
         SELECT sp.post_url,
            sp.caption_raw,
            va.id AS venue_account_id,
            'own_profile'::text AS connection
           FROM v_jeremy_beta_posts sp
             JOIN accounts va ON lower(va.username::text) = lower(sp.owner_username::text)
             JOIN vendors v ON v.account_id = va.id
          WHERE v.city = 'Chicago'::text AND v.discovery_source = 'google_places'::text AND v.category = 'venue'::text
        UNION
         SELECT e.source_post_url AS post_url,
            sp.caption_raw,
            va.id AS venue_account_id,
            'tagged'::text AS connection
           FROM jeremy_post_vendor_evidence e
             JOIN accounts va ON va.id = e.account_id
             JOIN vendors v ON v.account_id = va.id
             JOIN v_jeremy_beta_posts sp ON sp.post_url = e.source_post_url
          WHERE e.role = 'venue'::text AND v.city = 'Chicago'::text AND v.discovery_source = 'google_places'::text AND v.category = 'venue'::text
        UNION
         SELECT e.source_post_url AS post_url,
            sp.caption_raw,
            va.id AS venue_account_id,
            'tagged'::text AS connection
           FROM human_confirmed_post_vendor_evidence e
             JOIN accounts va ON va.id = e.account_id
             JOIN vendors v ON v.account_id = va.id
             JOIN v_jeremy_beta_posts sp ON sp.post_url = e.source_post_url
          WHERE e.role = 'venue'::text AND v.city = 'Chicago'::text AND v.discovery_source = 'google_places'::text AND v.category = 'venue'::text
        )
 SELECT DISTINCT ON (post_url) post_url,
    venue_account_id,
    connection,
    caption_raw ~ '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)'::text AS has_couple_evidence,
    (EXISTS ( SELECT 1
           FROM wedding_posts wp
             JOIN posts p ON p.id = wp.post_id
          WHERE p.url = venue_posts.post_url)) AS is_documented_wedding
   FROM venue_posts
  WHERE COALESCE(length(TRIM(BOTH FROM caption_raw)), 0) > 15
  ORDER BY post_url, connection;

create or replace view post_styled_shoot_signal as
 WITH post_universe AS (
         SELECT sp.post_url,
            sp.caption_raw AS caption,
            lower(sp.owner_username::text) AS author_username
           FROM v_jeremy_beta_posts sp
        UNION
         SELECT p.url AS post_url,
            p.caption,
            lower(a.username::text) AS author_username
           FROM posts p
             LEFT JOIN accounts a ON a.id = p.owner_id
        ), scored AS (
         SELECT post_universe.post_url,
            max(post_universe.caption) AS caption,
            max(post_universe.author_username) AS author_username
           FROM post_universe
          GROUP BY post_universe.post_url
        ), golden_styled AS (
         SELECT golden_set.post_url
           FROM golden_set
          WHERE golden_set.expected_decision = 'EXCLUDE'::post_decision AND (golden_set.exclusion_reason = 'styled_or_editorial'::text OR golden_set.notes ~* 'styl'::text OR golden_set.exclusion_reason ~* 'styl'::text)
        ), golden_styled_authors AS (
         SELECT s_1.author_username,
            count(*) AS n_styled_posts
           FROM golden_styled gsty_1
             JOIN scored s_1 ON s_1.post_url = gsty_1.post_url
          WHERE s_1.author_username IS NOT NULL
          GROUP BY s_1.author_username
         HAVING count(*) >= 2
        ), known_network_accounts(username) AS (
         VALUES ('styledshootsacrossamerica'::text), ('stylemepretty'::text), ('chicagostyleweddings'::text)
        )
 SELECT s.post_url,
    s.author_username,
    gsty.post_url IS NOT NULL AS golden_set_confirmed_styled,
    COALESCE(s.caption ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'::text OR s.caption ~* '#(styledshoot|stylizedshoot|editorialshoot|flatlaystyling)\y'::text OR s.caption ~* '\y(styled?|editorial|concept)\s+(shoot|session|editorial)\y'::text OR s.caption ~* '\ymodels?\s*[:|]'::text AND s.caption ~* '\y(shoot|styled|editorial|session)\y'::text OR s.caption ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot|inspirationshoot|styledweddingshoot)\y'::text OR s.caption ~* '\ystyled by\y'::text AND s.caption ~* '\yshoot\y'::text, false) AS phrase_or_hashtag_signal,
    COALESCE((s.author_username IN ( SELECT known_network_accounts.username
           FROM known_network_accounts)), false) AS known_network_account,
    gsa.author_username IS NOT NULL AS repeat_producer_account,
    COALESCE(s.caption ~* 'styl'::text, false) AS bare_keyword_signal,
        CASE
            WHEN gsty.post_url IS NOT NULL THEN 'CONFIRMED'::text
            WHEN s.caption ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'::text OR s.caption ~* '#(styledshoot|stylizedshoot|editorialshoot|flatlaystyling)\y'::text OR s.caption ~* '\y(styled?|editorial|concept)\s+(shoot|session|editorial)\y'::text OR s.caption ~* '\ymodels?\s*[:|]'::text AND s.caption ~* '\y(shoot|styled|editorial|session)\y'::text OR s.caption ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot|inspirationshoot|styledweddingshoot)\y'::text OR s.caption ~* '\ystyled by\y'::text AND s.caption ~* '\yshoot\y'::text THEN 'LIKELY'::text
            WHEN gsa.author_username IS NOT NULL OR (s.author_username IN ( SELECT known_network_accounts.username
               FROM known_network_accounts)) OR s.caption ~* 'styl'::text THEN 'POSSIBLE'::text
            ELSE 'NO_SIGNAL'::text
        END AS confidence
   FROM scored s
     LEFT JOIN golden_styled gsty ON gsty.post_url = s.post_url
     LEFT JOIN golden_styled_authors gsa ON gsa.author_username = s.author_username;

create or replace view structural_post_vendor_evidence as
 WITH latest AS (
         SELECT DISTINCT ON (stack_extraction_entries.post_url, stack_extraction_entries.line_no, stack_extraction_entries.handle) stack_extraction_entries.post_url AS source_post_url,
            stack_extraction_entries.line_no,
            stack_extraction_entries.handle,
            stack_extraction_entries.role,
            stack_extraction_entries.role_raw,
            stack_extraction_entries.source,
            stack_extraction_entries.stack_parser_version AS parser_version
           FROM stack_extraction_entries
          ORDER BY stack_extraction_entries.post_url, stack_extraction_entries.line_no, stack_extraction_entries.handle, stack_extraction_entries.extracted_at DESC
        ), universe AS (
         SELECT sp.post_url,
            sp.caption_raw,
            sp.post_timestamp,
            sp.location_tag,
            sp.owner_username
           FROM ( SELECT v_ig_posts.post_url,
                    v_ig_posts.shortcode,
                    v_ig_posts.caption_raw,
                    v_ig_posts.post_timestamp,
                    v_ig_posts.location_tag,
                    v_ig_posts.owner_username,
                    v_ig_posts.mentions,
                    v_ig_posts.hashtags,
                    v_ig_posts.post_type,
                    v_ig_posts.image_url,
                    v_ig_posts.likes_count,
                    v_ig_posts.vendor_id,
                    v_ig_posts.scraped_at,
                    v_ig_posts.post_id,
                    v_ig_posts.corpus_source
                   FROM v_ig_posts
                  WHERE v_ig_posts.corpus_source = 'staging'::text
                UNION ALL
                 SELECT v.post_url,
                    v.shortcode,
                    v.caption_raw,
                    v.post_timestamp,
                    v.location_tag,
                    v.owner_username,
                    v.mentions,
                    v.hashtags,
                    v.post_type,
                    v.image_url,
                    v.likes_count,
                    v.vendor_id,
                    v.scraped_at,
                    v.post_id,
                    v.corpus_source
                   FROM v_ig_posts v
                  WHERE v.corpus_source = 'public'::text AND (EXISTS ( SELECT 1
                           FROM post_observations o
                             JOIN crawl_runs r ON r.id = o.run_id
                          WHERE o.post_id = v.post_id AND r.actor <> 'legacy-import'::text))) sp
          WHERE NOT (EXISTS ( SELECT 1
                   FROM wedding_posts wp
                     JOIN posts p ON p.id = wp.post_id
                  WHERE p.shortcode = sp.shortcode)) AND NOT (EXISTS ( SELECT 1
                   FROM golden_set gs
                  WHERE gs.post_url = sp.post_url AND gs.expected_decision = 'EXCLUDE'::post_decision))
        ), credit_line_accounts AS (
         SELECT DISTINCT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, a.id) AS account_id,
            l.line_no,
            l.role_raw
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url AND l.role = 'venue'::text AND l.source = 'credit_line'::text
             JOIN accounts a ON lower(a.username::text) = l.handle
             LEFT JOIN account_aliases al ON al.alias_account_id = a.id
        ), credit_line_venue AS (
         SELECT DISTINCT ON (credit_line_accounts.source_post_url) credit_line_accounts.source_post_url,
            credit_line_accounts.account_id,
            credit_line_accounts.line_no,
            credit_line_accounts.role_raw
           FROM credit_line_accounts
          ORDER BY credit_line_accounts.source_post_url, (
                CASE
                    WHEN credit_line_accounts.role_raw ~* 'reception'::text THEN 0
                    WHEN credit_line_accounts.role_raw ~* 'venue'::text AND credit_line_accounts.role_raw !~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque'::text THEN 1
                    WHEN credit_line_accounts.role_raw ~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque'::text THEN 2
                    ELSE 3
                END), credit_line_accounts.line_no, credit_line_accounts.account_id
        ), credit_line_conflict AS (
         SELECT credit_line_accounts.source_post_url
           FROM credit_line_accounts
          GROUP BY credit_line_accounts.source_post_url
         HAVING count(DISTINCT credit_line_accounts.account_id) > 1
        ), location_venue AS (
         SELECT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, ltm.venue_account_id) AS account_id
           FROM universe u_1
             JOIN location_tag_venue_map ltm ON ltm.location_tag = u_1.location_tag::text
             LEFT JOIN account_aliases al ON al.alias_account_id = ltm.venue_account_id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url))
        ), author_venue AS (
         SELECT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, va.id) AS account_id
           FROM universe u_1
             JOIN accounts va ON lower(va.username::text) = lower(u_1.owner_username)
             LEFT JOIN account_aliases al ON al.alias_account_id = va.id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM vendors v
                  WHERE v.account_id = va.id AND v.category IS NOT NULL AND v.category <> 'venue'::text)) AND ((EXISTS ( SELECT 1
                   FROM v_account_role r
                  WHERE r.account_id = va.id AND r.role = 'venue'::vendor_role)) OR (EXISTS ( SELECT 1
                   FROM vendors v
                  WHERE v.account_id = va.id AND v.category = 'venue'::text)))
        ), inline_venue AS (
         SELECT DISTINCT ON (u_1.post_url) u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, a.id) AS account_id,
            l.line_no,
            l.role_raw
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url AND l.role = 'venue'::text AND l.source = 'inline_at'::text
             JOIN accounts a ON lower(a.username::text) = l.handle
             LEFT JOIN account_aliases al ON al.alias_account_id = a.id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM author_venue av
                  WHERE av.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url))
          ORDER BY u_1.post_url, l.line_no
        ), hashtag_venue AS (
         SELECT DISTINCT ON (u_1.post_url) u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, a.id) AS account_id,
            l.line_no,
            l.role_raw
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url AND l.role = 'venue'::text AND l.source = 'venue_hashtag'::text
             JOIN accounts a ON lower(a.username::text) = l.handle
             LEFT JOIN account_aliases al ON al.alias_account_id = a.id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM author_venue av
                  WHERE av.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM inline_venue iv
                  WHERE iv.source_post_url = u_1.post_url))
          ORDER BY u_1.post_url, l.line_no
        ), extracted_venue AS (
         SELECT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, eva.venue_account_id) AS account_id
           FROM universe u_1
             JOIN extracted_venue_anchors eva ON eva.post_url = u_1.post_url
             LEFT JOIN account_aliases al ON al.alias_account_id = eva.venue_account_id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM author_venue av
                  WHERE av.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM inline_venue iv
                  WHERE iv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM hashtag_venue hv
                  WHERE hv.source_post_url = u_1.post_url))
        ), venue_anchor AS (
         SELECT clv.source_post_url,
            clv.account_id,
            'venue'::text AS role,
            clv.role_raw,
            clv.line_no,
            'credit_line'::text AS venue_anchor_source,
            (EXISTS ( SELECT 1
                   FROM credit_line_conflict cc
                  WHERE cc.source_post_url = clv.source_post_url)) AS venue_anchor_conflict
           FROM credit_line_venue clv
        UNION ALL
         SELECT author_venue.source_post_url,
            author_venue.account_id,
            'venue'::text AS text,
            NULL::text AS text,
            NULL::integer AS int4,
            'author'::text AS text,
            false
           FROM author_venue
        UNION ALL
         SELECT location_venue.source_post_url,
            location_venue.account_id,
            'venue'::text AS text,
            NULL::text AS text,
            NULL::integer AS int4,
            'location_tag'::text AS text,
            false
           FROM location_venue
        UNION ALL
         SELECT inline_venue.source_post_url,
            inline_venue.account_id,
            'venue'::text AS text,
            inline_venue.role_raw,
            inline_venue.line_no,
            'inline_at'::text AS text,
            false
           FROM inline_venue
        UNION ALL
         SELECT hashtag_venue.source_post_url,
            hashtag_venue.account_id,
            'venue'::text AS text,
            hashtag_venue.role_raw,
            hashtag_venue.line_no,
            'venue_hashtag'::text AS text,
            false
           FROM hashtag_venue
        UNION ALL
         SELECT extracted_venue.source_post_url,
            extracted_venue.account_id,
            'venue'::text AS text,
            NULL::text AS text,
            NULL::integer AS int4,
            'extracted'::text AS text,
            false
           FROM extracted_venue
        ), non_venue_evidence AS (
         SELECT u_1.post_url AS source_post_url,
            a.id AS account_id,
            l.role,
            l.role_raw,
            l.line_no,
            NULL::text AS venue_anchor_source,
            NULL::boolean AS venue_anchor_conflict
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url
             JOIN accounts a ON lower(a.username::text) = l.handle
          WHERE l.role <> ALL (ARRAY['other'::text, 'venue'::text])
        ), combined AS (
         SELECT venue_anchor.source_post_url,
            venue_anchor.account_id,
            venue_anchor.role,
            venue_anchor.role_raw,
            venue_anchor.line_no,
            venue_anchor.venue_anchor_source,
            venue_anchor.venue_anchor_conflict
           FROM venue_anchor
        UNION ALL
         SELECT non_venue_evidence.source_post_url,
            non_venue_evidence.account_id,
            non_venue_evidence.role,
            non_venue_evidence.role_raw,
            non_venue_evidence.line_no,
            non_venue_evidence.venue_anchor_source,
            non_venue_evidence.venue_anchor_conflict
           FROM non_venue_evidence
        ), couple_extract AS (
         SELECT x.post_url,
            x.raw_match,
            x.raw_match IS NOT NULL AND x.raw_match !~* '\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\y'::text AS couple_signal_ok
           FROM ( SELECT u_1.post_url,
                    "substring"(u_1.caption_raw, '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)'::text) AS raw_match
                   FROM universe u_1) x
        )
 SELECT c.source_post_url,
    c.account_id,
    c.role,
    c.role_raw,
    c.line_no,
    c.venue_anchor_source,
    c.venue_anchor_conflict,
    COALESCE(ce.couple_signal_ok, false) AS has_couple_signal,
    COALESCE(u.caption_raw ~* '\y(wedding|bride|groom|reception|ceremony|newlywed|married|mr\.? *& *mrs|i do|tied the knot|big day|vows?)\y'::text, false) AS has_wedding_keyword,
    u.post_timestamp::date AS event_date,
        CASE
            WHEN ce.couple_signal_ok THEN lower(ce.raw_match)
            ELSE NULL::text
        END AS couple_guess,
    COALESCE(u.caption_raw ~* '\y(mitzvah|quincea|sweet\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\y'::text, false) AS has_non_wedding_event_keyword
   FROM combined c
     JOIN universe u ON u.post_url = c.source_post_url
     JOIN couple_extract ce ON ce.post_url = c.source_post_url;

CREATE OR REPLACE FUNCTION public.structural_post_vendor_evidence_for_batch(p_batch text)
 RETURNS SETOF structural_post_vendor_evidence
 LANGUAGE sql
 STABLE
AS $function$
   with latest as (
     select distinct on (post_url, line_no, handle)
       post_url as source_post_url, line_no, handle, role, role_raw, source, stack_parser_version as parser_version
     from stack_extraction_entries
     order by post_url, line_no, handle, extracted_at desc
   ),
   universe as (
     -- D061 (2026-09-19): re-sourced from the pure v_ig_posts view (owned by the acquisition
     -- schema script) instead of staging.instagram_posts directly, so tagged-feed acquisition
     -- posts join the same structural chain staging always has. Precedence by shortcode: staging
     -- always wins; a public (venue_tagged/own_profile) row only enters the universe once it was
     -- scraped after the first acquisition run ever (decision 5 -- with ops.crawl_runs empty,
     -- NOTHING public enters, so Ben's pre-existing ~6,370 crawl posts stay out in month 1).
     select sp.post_url, sp.caption_raw, sp.post_timestamp, sp.location_tag, sp.owner_username
     from (

       -- BATCH-SCOPED variant (structural_post_vendor_evidence_for_batch): the full source, then
       -- only the tick's first-observed posts. A join, not an OR on a session setting -- an OR
       -- cut the unscoped estimate 40x and re-created the nested-loop plan (D061 pilot).
       select * from (

       -- Precedence without a distinct-on: staging rows always; a public row only when no staging
       -- row shares its shortcode. Same rule either way, but the planner keeps table statistics
       -- (a Unique over the union estimated ~200 rows and turned the join with the 90k-row
       -- latest CTE into a nested loop -- the full view went from ~2 min to >15 min, D061 pilot).
       -- Two UNION ALL branches rather than one OR: an OR over the union view cut the planner's
       -- universe estimate 20x (2.3k for ~46k rows) and produced a 9.7-billion-row merge-join plan.
       select * from v_ig_posts where corpus_source = 'staging'
       union all
       select * from v_ig_posts v
       where v.corpus_source = 'public'
         -- D061 (2026-09-20): a public row enters iff the acquisition loop has REGISTERED it -- an
         -- ops.post_observations row (written by ingest, or by a provenance-logged legacy batch such
         -- as legacy-ben-crawl1-zero-venues). Replaces the scrape-date gate: same effect for new
         -- acquisitions, and lets Ben's pre-existing crawl posts in one explicit, revertable batch at
         -- a time (D031 attach risk is managed per batch, e.g. zero-wedding seed venues only).
         and (EXISTS ( SELECT 1 FROM ops.post_observations o JOIN ops.crawl_runs r ON r.id = o.run_id WHERE o.post_id = v.post_id AND r.actor <> 'legacy-import'))

       ) full_source
       where shortcode in (
         select p.shortcode from ops.post_observations o
         join ops.crawl_runs r on r.id = o.run_id
         join posts p on p.id = o.post_id
         where r.batch_id = p_batch and o.is_first)
     ) sp
     where not exists (
         select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.shortcode = sp.shortcode
       )
       and not exists (
         select 1 from golden_set gs where gs.post_url = sp.post_url and gs.expected_decision = 'EXCLUDE'
       )
   ),
   credit_line_accounts as (
     select distinct
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no,
       l.role_raw
     from universe u
     -- D055 parser v8: only LABELED credit lines anchor at this (highest) priority; the v8
     -- inline_at / venue_hashtag credits rank below author and location tag (see below).
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'credit_line'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
   ),
   -- D050/D055: when a post credits both a ceremony site and a reception venue, the RECEPTION
   -- venue is the wedding's anchor (the ceremony site still gets a venue-role credit downstream,
   -- see createWeddingsFromJeremyEvidence.ts's --from-confirmed-candidates path) -- matches the
   -- 39 structural candidates the user re-anchored by hand and D050's own reception-tiebreak
   -- precedent (weddings 899, 5513). Priority: reception (0) > plain "venue"-labeled, not
   -- ceremony-ish (1) > ceremony/church/parish/etc (2) > anything else (3), then lowest line_no
   -- within a tier. A label like "Ceremony Venue" matches both the venue and ceremony patterns --
   -- the ceremony/church check deliberately requires excluding it from tier 1 so it lands in
   -- tier 2, not 1.
   credit_line_venue as (
     select distinct on (source_post_url)
       source_post_url, account_id, line_no, role_raw
     from credit_line_accounts
     order by source_post_url,
       case
         when role_raw ~* 'reception' then 0
         when role_raw ~* 'venue' and role_raw !~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 1
         when role_raw ~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 2
         else 3
       end,
       line_no asc, account_id
   ),
   credit_line_conflict as (
     select source_post_url
     from credit_line_accounts
     group by source_post_url
     having count(distinct account_id) > 1
   ),
   location_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, ltm.venue_account_id) as account_id
     from universe u
     join location_tag_venue_map ltm on ltm.location_tag = u.location_tag
     left join account_aliases al on al.alias_account_id = ltm.venue_account_id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
   ),
   author_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, va.id) as account_id
     from universe u
     join accounts va on lower(va.username::text) = lower(u.owner_username)
     left join account_aliases al on al.alias_account_id = va.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       -- D055: author anchoring ranks BELOW the location tag and is refused when the account's
       -- Places row says it is some other kind of vendor (wsphotography.us x7).
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from vendors v where v.account_id = va.id and v.category is not null and v.category <> 'venue')
       and (
         exists (select 1 from v_account_role r where r.account_id = va.id and r.role = 'venue')
         or exists (select 1 from vendors v where v.account_id = va.id and v.category = 'venue')
       )
   ),
   inline_venue as (
     select distinct on (u.post_url)
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no, l.role_raw
     from universe u
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'inline_at'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
     order by u.post_url, l.line_no asc
   ),
   hashtag_venue as (
     select distinct on (u.post_url)
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no, l.role_raw
     from universe u
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'venue_hashtag'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
     order by u.post_url, l.line_no asc
   ),
   -- D055 venue-discovery reader downstream (2026-09-09), 6th and LAST priority: the Haiku
   -- pool-b reader's own venue attribution (extracted_venue_anchors, resolveDiscoveredVenues.ts),
   -- for posts none of the five patterns above anchored at all -- a model's read of free text
   -- (94% venue-attribution accuracy on documented posts), good enough to be the anchor of last
   -- resort but not to outrank any real structural match.
   extracted_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, eva.venue_account_id) as account_id
     from universe u
     join extracted_venue_anchors eva on eva.post_url = u.post_url
     left join account_aliases al on al.alias_account_id = eva.venue_account_id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
       and not exists (select 1 from hashtag_venue hv where hv.source_post_url = u.post_url)
   ),
   venue_anchor as (
     select
       source_post_url, account_id, 'venue'::text as role, role_raw, line_no,
       'credit_line'::text as venue_anchor_source,
       exists (select 1 from credit_line_conflict cc where cc.source_post_url = clv.source_post_url) as venue_anchor_conflict
     from credit_line_venue clv
     union all
     select source_post_url, account_id, 'venue', null, null, 'author', false
     from author_venue
     union all
     select source_post_url, account_id, 'venue', null, null, 'location_tag', false
     from location_venue
     union all
     select source_post_url, account_id, 'venue', role_raw, line_no, 'inline_at', false
     from inline_venue
     union all
     select source_post_url, account_id, 'venue', role_raw, line_no, 'venue_hashtag', false
     from hashtag_venue
     union all
     select source_post_url, account_id, 'venue', null, null, 'extracted', false
     from extracted_venue
   ),
   non_venue_evidence as (
     select
       u.post_url as source_post_url,
       a.id as account_id,
       l.role,
       l.role_raw,
       l.line_no,
       null::text as venue_anchor_source,
       null::boolean as venue_anchor_conflict
     from universe u
     join latest l on l.source_post_url = u.post_url
     join accounts a on lower(a.username::text) = l.handle
     where l.role not in ('other', 'venue')
   ),
   combined as (
     select * from venue_anchor
     union all
     select * from non_venue_evidence
   ),
   -- D055 precision fix (2026-09-08): the couple-name alternative of the regex below
   -- ([A-Z][a-z]+ *(&|+|and) *[A-Z][a-z]+) also matches two business words back-to-back --
   -- "Lido Banquets & Events" hand-read as a false couple signal. Extract the match ONCE here
   -- (whichever alternative fired) and veto it -- for has_couple_signal AND couple_guess alike --
   -- when it contains a business word. couple_guess is the same extraction, lowercased, exposed
   -- so runJeremyWeddingClustering.ts's structural branch can veto a Jaccard/date merge across
   -- two posts that name two different couples, without re-parsing captions itself.
   couple_extract as (
     select
       post_url,
       raw_match,
       (raw_match is not null and raw_match !~* '\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\y') as couple_signal_ok
     from (
       select
         u.post_url,
         substring(u.caption_raw from '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)') as raw_match
       from universe u
     ) x
   )
   select
     c.source_post_url,
     c.account_id,
     c.role,
     c.role_raw,
     c.line_no,
     c.venue_anchor_source,
     c.venue_anchor_conflict,
     coalesce(ce.couple_signal_ok, false) as has_couple_signal,
     coalesce(u.caption_raw ~* '\y(wedding|bride|groom|reception|ceremony|newlywed|married|mr\.? *& *mrs|i do|tied the knot|big day|vows?)\y', false) as has_wedding_keyword,
     u.post_timestamp::date as event_date,
     -- Appended last, not next to has_couple_signal: create or replace view only allows new
     -- columns at the end of the select list (errors otherwise, verified against the
     -- already-applied structural-v1 view: "cannot change name of view column").
     case when ce.couple_signal_ok then lower(ce.raw_match) else null end as couple_guess,
     -- D055 addendum (2026-09-08, user mid-review: "consider filtering out the posts that say
     -- bar or bat mitzvah. that's almost always not a wedding"): flags a post that names a
     -- non-wedding event outright. Sized in the current queue at 43 posts naming one of these
     -- with NO wedding language at all. Appended last for the same create-or-replace-view
     -- reason as couple_guess above -- do not move it earlier in the list.
     coalesce(u.caption_raw ~* '\y(mitzvah|quincea|sweet\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\y', false) as has_non_wedding_event_keyword
   from combined c
   join universe u on u.post_url = c.source_post_url
   join couple_extract ce on ce.post_url = c.source_post_url
   $function$
;

-- END POST-TABLE MERGE VIEWS

-- ============================================================================
-- POST-TABLE MERGE P5 LOCK-DOWN (2026-09-23) -- transcribed from apps/web/scripts/graph/applyPostMergeLockdown.ts.
-- FKs from the core evidence tables to posts(url); staging.instagram_posts rejects writes (trigger).
-- ============================================================================
do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'stack_extraction_runs_post_url_fkey') then
        alter table stack_extraction_runs add constraint stack_extraction_runs_post_url_fkey foreign key (post_url) references posts(url) not valid;
      end if;
    end $$;
do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'post_extraction_runs_post_url_fkey') then
        alter table post_extraction_runs add constraint post_extraction_runs_post_url_fkey foreign key (post_url) references posts(url) not valid;
      end if;
    end $$;
do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'post_venue_verdicts_post_url_fkey') then
        alter table post_venue_verdicts add constraint post_venue_verdicts_post_url_fkey foreign key (post_url) references posts(url) not valid;
      end if;
    end $$;
do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'jeremy_wedding_candidate_posts_source_post_url_fkey') then
        alter table jeremy_wedding_candidate_posts add constraint jeremy_wedding_candidate_posts_source_post_url_fkey foreign key (source_post_url) references posts(url) not valid;
      end if;
    end $$;
do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'human_post_labels_post_url_fkey') then
        alter table human_post_labels add constraint human_post_labels_post_url_fkey foreign key (post_url) references posts(url) not valid;
      end if;
    end $$;
alter table stack_extraction_runs validate constraint stack_extraction_runs_post_url_fkey;
alter table post_extraction_runs validate constraint post_extraction_runs_post_url_fkey;
alter table post_venue_verdicts validate constraint post_venue_verdicts_post_url_fkey;
alter table jeremy_wedding_candidate_posts validate constraint jeremy_wedding_candidate_posts_source_post_url_fkey;
comment on constraint human_post_labels_post_url_fkey on human_post_labels is 'POST-TABLE MERGE P5: NOT VALID on purpose -- one legacy human label (2026-09-05, NOT_WEDDING) is on a profile url that was never a post (logged in ops.post_merge_exclusions); labels are append-only. Every new label is enforced.';
create or replace function staging.forbid_write_instagram_posts() returns trigger language plpgsql as $f$
   begin
     raise exception 'staging.instagram_posts is the read-only import record of the post-table merge (2026-09-23); the corpus is public.posts (Jeremy''s rows: origin = jeremy_beta, view v_jeremy_beta_posts)';
   end $f$;
drop trigger if exists instagram_posts_read_only on staging.instagram_posts;
create trigger instagram_posts_read_only before insert or update or delete on staging.instagram_posts
     for each statement execute function staging.forbid_write_instagram_posts();
drop trigger if exists instagram_posts_read_only_truncate on staging.instagram_posts;
create trigger instagram_posts_read_only_truncate before truncate on staging.instagram_posts
     for each statement execute function staging.forbid_write_instagram_posts();
comment on table staging.instagram_posts is 'READ-ONLY IMPORT RECORD (post-table merge, 2026-09-23). Jeremy''s beta rows, loaded verbatim 2026-08-22. Every real post here is in public.posts (staging_post_id = id, origin = jeremy_beta); the 10 profile urls are in ops.post_merge_exclusions. Writes are rejected by trigger. Read posts / v_ig_posts / v_jeremy_beta_posts instead.';

