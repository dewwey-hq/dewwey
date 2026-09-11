/**
 * D056 stage 2a: the schema half of the vendor-taxonomy migration -- purely additive/renaming
 * DDL, no data writes (migrateVendorRolesV2.ts is the data half, run AFTER this one is applied).
 * See docs/decisions.md D056 and the plan file's "Vendor-stack nomenclature" section (Design D/E,
 * "Execution -- Stage 2").
 *
 * What this creates/changes, in the order Postgres requires:
 *   a. `vendor_roles` (the two-level taxonomy reference table) -- create + seed/upsert from
 *      `VENDOR_ROLES` (vendorRoleRules.ts), the single source of truth for the taxonomy.
 *   b. `wedding_event` enum -- the event-context values from vendorRoleRules.ts's `EventContext`
 *      type, created once (Postgres has no `create type ... as enum if not exists`, so this
 *      checks `pg_type` first).
 *   c. `vendor_role` enum RENAMEs (beauty_other->beauty_services, jeweler->jewelry,
 *      photobooth->photo_booth, musician->live_music) then ADD VALUEs for the 30 new D056
 *      vendor slugs not yet in the enum. `hotel` is deliberately left alone here -- it stays in
 *      the enum, retired from use by migrateVendorRolesV2.ts's hotel rule, not by a rename.
 *      Each rename/add runs as its OWN auto-committing statement (via pool.query, no explicit
 *      BEGIN wrapping it) -- Postgres will not let a transaction USE a value ADDed to an enum
 *      within that same transaction (same restriction refreshAccountRoleTagsFromWeddings.ts's
 *      header documents for `tag_source`); running each rename/add standalone sidesteps that
 *      entirely and keeps every one of them independently idempotent to re-run.
 *   d. `wedding_vendor_credits` -- the granular per-post-per-role truth the migration derives
 *      from `stack_extraction_entries_v2`.
 *   e. `wedding_participants` -- bride/groom/couple/host_family/model/muse, out of the vendor
 *      graph, kept for duplicate detection.
 *   f. `weddings.ceremony_venue_id`, `accounts.venue_type` -- additive columns.
 *   g. `vendor_role_migrations` -- the provenance/revert log for migrateVendorRolesV2.ts, same
 *      shape as recreditManagementCompany.ts's `wedding_vendor_recredits` /
 *      remapWeddingsToCanonicalAccounts.ts's `account_alias_remaps`.
 * d-g run inside one transaction (table/column DDL only -- no enum literal is used by any of
 * these CREATE/ALTER statements, so there's no same-transaction-enum-use restriction to worry
 * about there).
 *
 * `--dry-run` (default) issues ONLY read-only `pg_catalog` existence checks and PRINTS every
 * statement it would run -- it commits nothing, renames nothing, creates nothing. Same
 * "run by an agent that is only ever allowed --dry-run" discipline as
 * refreshAccountRoleTagsFromWeddings.ts: a human runs `--apply`, never this agent.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyVendorTaxonomySchema.ts              # dry run (default)
 *   bun run scripts/graph/applyVendorTaxonomySchema.ts --dry-run    # same, explicit
 *   bun run scripts/graph/applyVendorTaxonomySchema.ts --apply      # real write, human only
 */
import { getPool, closePool } from "../classify/db";
import { VENDOR_ROLES } from "./vendorRoleRules";

const ENUM_RENAMES: Array<[string, string]> = [
  ["beauty_other", "beauty_services"],
  ["jeweler", "jewelry"],
  ["photobooth", "photo_booth"],
  ["musician", "live_music"],
];

// The 30 D056 vendor slugs not already in vendor_role (after the renames above land) --
// deliberately excludes `press_feature`/`noise` (VENDOR_ROLES rows with isVendor=false: never a
// wedding_vendors/wedding_vendor_credits row, so they never need to be a vendor_role enum value)
// and `hotel` (retired from use, not removed from the enum -- see header).
const NEW_VENDOR_ROLE_VALUES = [
  "venue_management", "accommodations", "coordinator", "event_design", "second_shooter", "drone",
  "album_editing", "lighting_production", "tent", "signage", "decor_other", "bar_service",
  "desserts", "mc", "cultural_performers", "dancers_choreography", "entertainment_other",
  "accessories", "alterations", "calligraphy", "live_painter", "guest_book", "favors_gifts",
  "valet", "security", "childcare", "pet_attendant", "travel_honeymoon", "website_registry",
  "staffing",
];

const WEDDING_EVENT_VALUES = [
  "wedding_day", "ceremony", "reception", "cocktail_hour", "getting_ready", "rehearsal_dinner",
  "welcome_party", "after_party", "brunch", "engagement", "shower", "sangeet_mehndi",
];

const CREATE_VENDOR_ROLES_TABLE = `create table if not exists vendor_roles (
  slug          text primary key,
  category      text not null,
  display_name  text not null,
  sort_order    int not null,
  is_vendor     boolean not null default true
);`;

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function buildSeedSql(): string {
  const rows = VENDOR_ROLES.map(
    (r, i) => `  (${sqlString(r.slug)}, ${sqlString(r.category)}, ${sqlString(r.display)}, ${i}, ${r.isVendor})`
  ).join(",\n");
  return (
    `insert into vendor_roles (slug, category, display_name, sort_order, is_vendor) values\n${rows}\n` +
    `on conflict (slug) do update set\n` +
    `  category = excluded.category, display_name = excluded.display_name,\n` +
    `  sort_order = excluded.sort_order, is_vendor = excluded.is_vendor;`
  );
}

const CREATE_WEDDING_EVENT_TYPE = `create type wedding_event as enum (\n  ${WEDDING_EVENT_VALUES.map(sqlString).join(", ")}\n);`;

const CREATE_WEDDING_VENDOR_CREDITS = `create table if not exists wedding_vendor_credits (
  wedding_id      bigint not null references weddings(id),
  post_id         bigint not null references posts(id),
  account_id      bigint not null references accounts(id),
  role            vendor_role not null,
  event_context   wedding_event not null default 'wedding_day',
  label_raw       text,
  source          text not null,
  parser_version  text not null,
  created_at      timestamptz default now(),
  primary key (wedding_id, post_id, account_id, role, event_context)
);`;

const CREATE_WEDDING_PARTICIPANTS = `create table if not exists wedding_participants (
  wedding_id        bigint references weddings(id),
  account_id        bigint references accounts(id),
  participant_role  text not null,
  source            text not null,
  created_at        timestamptz default now(),
  primary key (wedding_id, account_id, participant_role)
);`;

const ALTER_WEDDINGS_CEREMONY_VENUE = `alter table weddings add column if not exists ceremony_venue_id bigint references accounts(id);`;
const ALTER_ACCOUNTS_VENUE_TYPE = `alter table accounts add column if not exists venue_type text;`;

// D056 tie-break: on equal evidence and confidence a venue-category role wins (mirrors
// pickTopRoles in accountRoleTags.ts). Without it "Venue & Catering" compound credits leave a
// venue tied with catering and the winner is arbitrary.
const REPLACE_V_ACCOUNT_ROLE = `create or replace view v_account_role as
  select distinct on (account_id) account_id, role, confidence, evidence_count
  from account_tags
  order by account_id, evidence_count desc, confidence desc, (role = 'venue') desc, role;`;

const CREATE_VENDOR_ROLE_MIGRATIONS = `create table if not exists vendor_role_migrations (
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
);`;

async function typeExists(pool: ReturnType<typeof getPool>, typname: string): Promise<boolean> {
  const { rows } = await pool.query(`select 1 from pg_type where typname = $1`, [typname]);
  return rows.length > 0;
}

async function enumLabelExists(pool: ReturnType<typeof getPool>, typname: string, label: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = $1 and e.enumlabel = $2`,
    [typname, label]
  );
  return rows.length > 0;
}

async function runStandaloneStatement(
  pool: ReturnType<typeof getPool>,
  label: string,
  sql: string,
  apply: boolean
) {
  console.log(`\n[apply-vendor-taxonomy] ${apply ? "EXECUTING (auto-commits)" : "DRY RUN"}: ${label}`);
  console.log(sql);
  if (apply) {
    await pool.query(sql);
    console.log(`[apply-vendor-taxonomy] committed: ${label}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  console.log(`[apply-vendor-taxonomy] mode: ${apply ? "APPLY (real write)" : "DRY RUN (prints SQL, no write)"}`);
  console.log(`[apply-vendor-taxonomy] vendor_roles seed rows: ${VENDOR_ROLES.length}`);

  // ---- a. vendor_roles table + seed (no enum involved -- safe to batch) ----
  await runStandaloneStatement(pool, "create table vendor_roles", CREATE_VENDOR_ROLES_TABLE, apply);
  await runStandaloneStatement(pool, "seed vendor_roles (upsert from VENDOR_ROLES)", buildSeedSql(), apply);

  // ---- b. wedding_event enum ----
  const hasWeddingEvent = await typeExists(pool, "wedding_event");
  if (hasWeddingEvent) {
    console.log(`\n[apply-vendor-taxonomy] wedding_event type already exists -- skipping create`);
  } else {
    await runStandaloneStatement(pool, "create type wedding_event", CREATE_WEDDING_EVENT_TYPE, apply);
  }

  // ---- c. vendor_role enum renames, then adds. Each its own committed statement. ----
  for (const [oldVal, newVal] of ENUM_RENAMES) {
    const hasOld = await enumLabelExists(pool, "vendor_role", oldVal);
    const hasNew = await enumLabelExists(pool, "vendor_role", newVal);
    const sql = `alter type vendor_role rename value ${sqlString(oldVal)} to ${sqlString(newVal)};`;
    if (!hasOld && hasNew) {
      console.log(`\n[apply-vendor-taxonomy] vendor_role already has '${newVal}' (rename already applied) -- skipping: ${sql}`);
      continue;
    }
    if (!hasOld && !hasNew) {
      console.log(`\n[apply-vendor-taxonomy] REFUSING: vendor_role has neither '${oldVal}' nor '${newVal}' -- inspect the enum by hand before proceeding.`);
      process.exit(1);
    }
    await runStandaloneStatement(pool, `rename vendor_role '${oldVal}' -> '${newVal}'`, sql, apply);
  }
  for (const slug of NEW_VENDOR_ROLE_VALUES) {
    const has = await enumLabelExists(pool, "vendor_role", slug);
    const sql = `alter type vendor_role add value if not exists ${sqlString(slug)};`;
    if (has) {
      console.log(`\n[apply-vendor-taxonomy] vendor_role already has '${slug}' -- skipping: ${sql}`);
      continue;
    }
    await runStandaloneStatement(pool, `add vendor_role value '${slug}'`, sql, apply);
  }

  // ---- d-g. tables/columns, one transaction (no enum literal is USED by any DDL below). ----
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`\n[apply-vendor-taxonomy] ${apply ? "EXECUTING" : "DRY RUN"} (tables/columns, one transaction):`);
    for (const [label, sql] of [
      ["create table wedding_vendor_credits", CREATE_WEDDING_VENDOR_CREDITS],
      ["create table wedding_participants", CREATE_WEDDING_PARTICIPANTS],
      ["alter table weddings add ceremony_venue_id", ALTER_WEDDINGS_CEREMONY_VENUE],
      ["alter table accounts add venue_type", ALTER_ACCOUNTS_VENUE_TYPE],
      ["create table vendor_role_migrations", CREATE_VENDOR_ROLE_MIGRATIONS],
      ["replace view v_account_role (venue tie-break)", REPLACE_V_ACCOUNT_ROLE],
    ] as const) {
      console.log(`\n-- ${label}`);
      console.log(sql);
      if (apply) await client.query(sql);
    }
    if (apply) {
      await client.query("commit");
      console.log("\n[apply-vendor-taxonomy] COMMITTED (tables/columns)");
    } else {
      await client.query("rollback");
      console.log("\n[apply-vendor-taxonomy] DRY RUN -- rolled back, no changes committed");
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
