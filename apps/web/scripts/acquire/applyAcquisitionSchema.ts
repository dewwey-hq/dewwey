// POST_MERGE_SUPERSEDED: this DDL creates the old two-source v_ig_posts (union of
// staging.instagram_posts and public.posts), from before the post-table merge (2026-09-23);
// main() refuses to run (outside --print) once v_jeremy_beta_posts exists -- the live view
// definitions are in pipeline/schema.sql under the "POST-TABLE MERGE (P3 + P4 W1" banner.
/**
 * ACQUISITION LOOP (D061) — idempotent DDL for the budgeted crawl-target/run/observation
 * schema, `ops.creation_decisions`, and the pure `v_ig_posts` normalization view. Same
 * pattern as scripts/venue-details/applyVenueDetailsSchema.ts: hand-maintained schema.sql is
 * the single source of truth, applied by a script when ready, safe to re-run
 * (create table/index IF NOT EXISTS, create or replace view). This file is transcribed
 * VERBATIM into pipeline/schema.sql under the
 * "ACQUISITION LOOP (D061, 2026-09-19)" banner — keep the two in sync by hand.
 *
 * Human-run only. This script does NOT run automatically against DATABASE_URL as part of any
 * verification — pass --print to see the statements without touching the database. Applies
 * everything in one transaction so a mid-run failure never leaves a half-built schema.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/applyAcquisitionSchema.ts --print   # print DDL, no DB access
 *   bun run scripts/acquire/applyAcquisitionSchema.ts           # human only: apply for real
 */
import { getPool, closePool } from "../classify/db";

// Dependency order: targets before runs (FK added after runs exists, via a guarded ALTER),
// then run_seeds/observations/post_images, then creation_decisions, then the pure view.
export const STATEMENTS: string[] = [
  `create table if not exists ops.crawl_targets (
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
   );`,
  `create index if not exists idx_crawl_targets_account_feed_evaluated on ops.crawl_targets (account_id, feed, evaluated_at desc);`,
  `comment on table ops.crawl_targets is 'OPS (D061): append-only prior rows for a budgeted crawl target (account x feed x depth) -- latest row per (account_id, feed) wins. tier is pilot|probe|canary|vendor|alias|deepen|recency_a|recency_b|discovered|profile. No excluded-target filter is enforced anywhere in commit 1 (see docs/decisions.md D061): observations point at the target row that existed at pick time, and targets are append-only, so a later exclusion cannot retroactively hide an earlier observation.';`,

  `create table if not exists ops.crawl_runs (
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
   );`,
  `comment on table ops.crawl_runs is 'OPS (D061): the fetch log = the clock -- one row per Apify run. batch_id is the tick (acq-YYYYMMDD-<tick>). pipeline_versions is null at insert and written after the parse/cluster/reconcile/reader stages run for this run''s posts, not at run creation.';`,

  // Guarded FK: crawl_targets.last_run_id -> crawl_runs(id), added only once crawl_runs
  // exists and only if the constraint isn't already there (idempotent re-run).
  `do $$
   begin
     if not exists (
       select 1 from pg_constraint where conname = 'crawl_targets_last_run_fk'
     ) then
       alter table ops.crawl_targets
         add constraint crawl_targets_last_run_fk
         foreign key (last_run_id) references ops.crawl_runs(id);
     end if;
   end $$;`,

  `create table if not exists ops.crawl_run_seeds (
     run_id       bigint references ops.crawl_runs(id),
     account_id   bigint references accounts(id),
     target_id    bigint references ops.crawl_targets(id),
     requested    integer not null,
     fetched      integer,
     new_posts    integer,
     already_had  integer,
     stack_posts  integer,
     primary key (run_id, account_id)
   );`,
  `comment on table ops.crawl_run_seeds is 'OPS (D061): per-seed attribution inside a batched run -- one row per (run, account) with requested/fetched/new_posts/already_had/stack_posts counts, filled in by ingest.ts after processing that run''s items.';`,

  `create table if not exists ops.post_observations (
     run_id            bigint references ops.crawl_runs(id),
     post_id           bigint references posts(id),
     seed_account_id   bigint references accounts(id),
     target_id         bigint references ops.crawl_targets(id),
     observed_at       timestamptz not null default now(),
     is_first          boolean not null,
     caption_sha256    text not null,
     caption_changed   boolean not null default false,
     primary key (run_id, post_id)
   );`,
  `create index if not exists idx_post_observations_post_observed on ops.post_observations (post_id, observed_at);`,
  `comment on table ops.post_observations is 'OPS (D061): one row per sighting of a post (as opposed to posts, which holds only the first sighting''s raw/caption/scraped_at, never overwritten). PK (run_id, post_id) makes ingest.ts --run-id idempotent -- a re-run of the same run is a no-op. is_first marks the sighting that actually created the posts row; caption_changed compares this sighting''s caption_sha256 against the posts row''s caption on a re-sighting (absence from a capped feed is never treated as deletion).';`,

  `create table if not exists post_images (
     post_id     bigint references posts(id),
     idx         smallint,
     r2_key      text,
     width       integer,
     height      integer,
     bytes       integer,
     status      text not null check (status in ('stored','fetch_failed','invalid','skipped')),
     fetched_at  timestamptz default now(),
     primary key (post_id, idx)
   );`,
  `comment on table post_images is 'D061/D007: one row per candidate image for a post''s FIRST sighting (idx 0..4 for a Sidecar, 0 for a single Image, one skipped row for a Video). r2_key is an R2 key (D007: keys, never URLs) at posts/<shortcode>/<idx>.jpg, null when status is not ''stored''. Image fetching is fail-open by design (see ingest.ts) -- a fetch/validation failure here never aborts the run.';`,

  `create table if not exists ops.creation_decisions (
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
   );`,
  `create index if not exists idx_creation_decisions_acquisition_batch on ops.creation_decisions (acquisition_batch_id);`,
  // D061 pilot rollback rehearsal (2026-09-19): the first revert failed on
  // creation_decisions_created_wedding_id_fkey -- a decision row pointed at the wedding being
  // deleted. Decisions are append-only history, so the FK now sets null on delete (the row keeps
  // its candidate, batch and decision) and a REVERTED decision is allowed for the revert script
  // to append. Idempotent: drop-if-exists, then add.
  `alter table ops.creation_decisions drop constraint if exists creation_decisions_created_wedding_id_fkey;`,
  `alter table ops.creation_decisions add constraint creation_decisions_created_wedding_id_fkey
     foreign key (created_wedding_id) references weddings(id) on delete set null;`,
  `alter table ops.creation_decisions drop constraint if exists creation_decisions_matched_wedding_id_fkey;`,
  `alter table ops.creation_decisions add constraint creation_decisions_matched_wedding_id_fkey
     foreign key (matched_wedding_id) references weddings(id) on delete set null;`,
  `alter table ops.creation_decisions drop constraint if exists creation_decisions_decision_check;`,
  `alter table ops.creation_decisions add constraint creation_decisions_decision_check
     check (decision in ('CREATE','CREATE_WEAK_MATCH','WOULD_ATTACH','HUMAN','SKIP','REVERTED'));`,
  `comment on table ops.creation_decisions is 'OPS (D061): one row per candidate createWeddingsFromJeremyEvidence.ts considered under --acquisition-batch scoping -- CREATE (no match), CREATE_WEAK_MATCH (0.5-0.7 reconciliation match, excluded from the coverage number until mergeDuplicateWeddings.ts clears it), WOULD_ATTACH (>=0.7 match, skipped -- no ATTACH lift in month 1), HUMAN (routed to /label/candidates), or SKIP. reportAcquisitionFunnel.ts reads this by acquisition_batch_id.';`,

  // Pure normalization view: union of staging.instagram_posts and public.posts (venue_tagged /
  // own_profile), no dedupe, no eligibility, no exclusions — see docs/decisions.md D061.
  `create index if not exists staging_instagram_posts_shortcode_idx on staging.instagram_posts (((regexp_match(post_url, '/p/([^/]+)'))[1]));`,

  `create or replace view v_ig_posts as
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
   where p.source in ('venue_tagged','own_profile');`,
  `comment on view v_ig_posts is 'DERIVED (D061): pure normalization of every raw Instagram post we hold -- staging (Jeremy) union public.posts (Ben crawl + acquisition loop). NO dedupe, NO eligibility, NO exclusions: consumers apply distinct on (shortcode) with staging precedence and their own guards. The join key across sources is shortcode, never the URL string.';`,
];

function usage(): never {
  console.error(
    "[apply-acquisition-schema] Usage:\n" +
      "  bun run scripts/acquire/applyAcquisitionSchema.ts --print   # print DDL only, no DB access\n" +
      "  bun run scripts/acquire/applyAcquisitionSchema.ts           # human only: apply for real against DATABASE_URL\n"
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) usage();

  if (args.includes("--print")) {
    for (const [i, sql] of STATEMENTS.entries()) {
      console.log(`-- statement ${i + 1}/${STATEMENTS.length}`);
      console.log(sql);
      console.log();
    }
    return;
  }

  console.log(
    "[apply-acquisition-schema] This is a HUMAN-RUN script (see file header) -- it is about to " +
      "apply DDL directly against DATABASE_URL, in one transaction. Re-run with --print first if " +
      "you have not reviewed the statements."
  );
  const pool = getPool();
  const { rows: mergeCheck } = await pool.query<{ merged: boolean }>(
    `select to_regclass('public.v_jeremy_beta_posts') is not null as merged`
  );
  if (mergeCheck[0]?.merged) {
    console.error(
      'REFUSING: superseded by the post-table merge (2026-09-23). The live definitions are in ' +
        'pipeline/schema.sql under the "POST-TABLE MERGE (P3 + P4 W1" banner; re-running this would ' +
        'point views back at staging.instagram_posts.'
    );
    process.exit(1);
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [i, sql] of STATEMENTS.entries()) {
      await client.query(sql);
      console.log(`[apply-acquisition-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
    }
    await client.query("commit");
    console.log("[apply-acquisition-schema] done");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
