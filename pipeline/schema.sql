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
