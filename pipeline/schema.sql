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

create type tag_source as enum ('stack_regex','stack_llm','profile_bio','manual');
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
order by account_id, evidence_count desc, confidence desc;

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
  select sp.post_url, sp.caption_raw, sp.post_timestamp, sp.location_tag, sp.owner_username
  from staging.instagram_posts sp
  where not exists (
      select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = sp.post_url
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

comment on view structural_post_vendor_evidence is 'DERIVED (D055 "squeeze the 47k" Phase 0, precision fixes for structural-v2 2026-09-08): venue-anchors a post from credit-line, author-is-known-venue, or IG location-tag (priority order, alias-resolved, conflict-flagged), plus the post''s own non-venue stack credits. has_couple_signal/couple_guess veto business-word false matches (e.g. "Lido Banquets & Events"). Eligibility (venue anchor + supporting evidence, anchor-source-dependent) and the couple-guess merge veto are enforced in runJeremyWeddingClustering.ts --evidence-source structural, not here. See docs/decisions.md D055.';

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
comment on table post_extraction_runs is 'RAW (D055 Phase 2, extract-v1): one row per (post_url, prompt_version) LLM extraction attempt from runExtract.ts. result is the full structured tool-call output; verdict/confidence/corrected_venue_handle are denormalized copies for cheap querying/reporting. See decideVerdictWrite in extractPrompt.ts for how (or whether) a post_venue_verdicts row gets written from this.';
