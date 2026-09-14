/**
 * VENUE DETAILS v3 (D060, provenance-first) — idempotent DDL for the six tables + one view
 * the plan's "DDL" section specifies (source, derived, human, history, serving layers). Same
 * pattern as scripts/classify/applyPostExtractionSchema.ts: hand-maintained schema.sql is the
 * single source of truth, applied by a script when ready, safe to re-run (create table/index
 * IF NOT EXISTS). This file is transcribed VERBATIM into pipeline/schema.sql under the
 * "-- VENUE DETAILS v3 (D060, provenance-first)" banner — keep the two in sync by hand.
 *
 * Human-run only. This script does NOT run automatically against DATABASE_URL as part of any
 * verification — pass --print to see the statements without touching the database.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/applyVenueDetailsSchema.ts --print   # print DDL, no DB access
 *   bun run scripts/venue-details/applyVenueDetailsSchema.ts           # human only: apply for real
 */
import { getPool, closePool } from "../classify/db";

export const STATEMENTS: string[] = [
  // ------------------------------------------------------------------
  // Pointer: one candidate/verified website per account. Provenance lives in
  // batch_id/note; no history table yet (LATER: venue_websites_history).
  // ------------------------------------------------------------------
  `create table if not exists venue_websites (
     account_id   bigint primary key references accounts(id),
     url          text not null,
     source       text not null check (source in ('vendors_website','accounts_external_url','legacy_venue_enrichment','manual','search')),
     confidence   real not null default 1,
     status       text not null default 'candidate' check (status in ('candidate','verified','rejected','unreachable','js_shell')),
     http_status  int,
     final_url    text,
     checked_at   timestamptz,
     note         text,
     batch_id     text,
     created_at   timestamptz not null default now(),
     updated_at   timestamptz not null default now()
   );`,
  `create index if not exists idx_venue_websites_status on venue_websites(status);`,
  `create index if not exists idx_venue_websites_batch on venue_websites(batch_id);`,
  `comment on table venue_websites is 'D060 VenueDetails v3: pointer, one row per account -- discoverWebsites.ts writes/updates it. Provenance is batch_id + note (no history table yet, see docs/engineering/venue-enrichment/ plan LATER section).';`,

  // ------------------------------------------------------------------
  // Source layer: insert-only snapshots (cleaned text in R2 by sha256) + the
  // fetch log (the only clock -- no last_seen/fetch_count on snapshots).
  // ------------------------------------------------------------------
  `create table if not exists venue_source_snapshots (
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
   );`,
  `create index if not exists idx_venue_source_snapshots_sha256 on venue_source_snapshots(sha256);`,
  `comment on table venue_source_snapshots is 'D060 VenueDetails v3: SOURCE layer, insert-only -- cleaned text lives in R2 at venue-sources/<account_id>/<sha256>.txt, this row is metadata. No last_seen/fetch_count column (spec resolution "Snapshots are insert-only"): venue_source_fetches is the only clock. Never republish a snapshot; never UPDATE/DELETE this table.';`,

  `create table if not exists venue_source_fetches (
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
   );`,
  `create index if not exists idx_venue_source_fetches_account_time on venue_source_fetches(account_id, fetched_at desc);`,
  `comment on table venue_source_fetches is 'D060 VenueDetails v3: one row per crawlVenue.ts fetch attempt, whether or not it produced a new snapshot (outcome=unchanged on a sha256 repeat). The only clock for "when was this URL last seen" -- see venue_source_snapshots comment.';`,

  // ------------------------------------------------------------------
  // Derived layer: immutable extraction/repair runs, keyed by input_hash.
  // ------------------------------------------------------------------
  `create table if not exists venue_details_runs (
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
   );`,
  `create unique index if not exists uq_venue_details_runs_account_input_hash on venue_details_runs(account_id, input_hash) where stage = 'extract';`,
  `create index if not exists idx_venue_details_runs_account_time on venue_details_runs(account_id, created_at desc);`,
  `create index if not exists idx_venue_details_runs_prompt_version on venue_details_runs(prompt_version);`,
  `comment on table venue_details_runs is 'D060 VenueDetails v3: DERIVED layer, immutable -- one row per extractVenueDetails.ts/repairVenueDetails.ts call. Partial unique index on (account_id, input_hash) WHERE stage=''extract'' makes extraction resumable (spec resolution "Run uniqueness": NULL parent_run_id never collides in a plain unique constraint, so the partial index is scoped to stage=''extract'' and repair rows are unique on (parent_run_id, created_at) by construction).';`,

  // ------------------------------------------------------------------
  // Human layer: genuinely append-only corrections. No status column, no
  // superseded_by -- effective correction per (account_id, field_path) is the
  // latest row; 'retire' clears it.
  // ------------------------------------------------------------------
  `create table if not exists venue_details_corrections (
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
   );`,
  `create index if not exists idx_venue_details_corrections_account_field_time on venue_details_corrections(account_id, field_path, created_at desc);`,
  `comment on table venue_details_corrections is 'D060 VenueDetails v3: HUMAN layer, append-only (spec resolution "Corrections are genuinely append-only") -- no status/superseded_by column. Effective correction per (account_id, field_path) is the latest row by created_at; action=''retire'' clears it. Staleness (needs_recheck) is computed at serve time, not stored here.';`,

  // ------------------------------------------------------------------
  // History layer: every served state, linear versions with field-level changes.
  // ------------------------------------------------------------------
  `create table if not exists venue_details_versions (
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
   );`,
  `comment on table venue_details_versions is 'D060 VenueDetails v3: HISTORY layer, append-only -- one row per served state (see serveVenueDetails.ts / rollbackVenueDetails.ts). Versions are linear (unique account_id, version_no); a rollback writes a NEW version copying the target and moves the venue_details pointer, it never mutates or deletes a prior version.';`,

  // ------------------------------------------------------------------
  // Serving layer: pointer + denormalized spine for fast browse/compare reads.
  // ------------------------------------------------------------------
  `create table if not exists venue_details (
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
   );`,
  `create index if not exists idx_venue_details_headline_seated on venue_details(headline_seated);`,
  `create index if not exists idx_venue_details_catering on venue_details(catering);`,
  `create index if not exists idx_venue_details_bar on venue_details(bar);`,
  `create index if not exists idx_venue_details_pricing_archetype on venue_details(pricing_archetype);`,
  `create index if not exists idx_venue_details_compare_ready on venue_details(account_id) where compare_ready;`,
  `create index if not exists idx_venue_details_needs_review on venue_details(account_id) where needs_review;`,
  `create index if not exists idx_venue_details_batch on venue_details(batch_id);`,
  `comment on table venue_details is 'D060 VenueDetails v3: SERVING layer -- pointer (current_version_id) + denormalized spine columns for fast browse/compare/filter reads. Never the source of truth for the full document (that is venue_details_versions.details); this row is rebuilt by serveVenueDetails.ts on every new version.';`,

  `create or replace view venue_details_current as
     select
       vd.*,
       vv.version_no,
       vv.details,
       vv.created_at as version_created_at
     from venue_details vd
     join venue_details_versions vv on vv.id = vd.current_version_id;`,
  `comment on view venue_details_current is 'D060 VenueDetails v3: venue_details joined to its current version, exposing the full details jsonb + version_no + version_created_at alongside the denormalized serving columns.';`,
];

function usage(): never {
  console.error(
    "[apply-venue-details-schema] Usage:\n" +
      "  bun run scripts/venue-details/applyVenueDetailsSchema.ts --print   # print DDL only, no DB access\n" +
      "  bun run scripts/venue-details/applyVenueDetailsSchema.ts           # human only: apply for real against DATABASE_URL\n"
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
    "[apply-venue-details-schema] This is a HUMAN-RUN script (see file header) -- it is about to " +
      "apply DDL directly against DATABASE_URL. Re-run with --print first if you have not reviewed " +
      "the statements."
  );
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-venue-details-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  console.log("[apply-venue-details-schema] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
