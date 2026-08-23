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
