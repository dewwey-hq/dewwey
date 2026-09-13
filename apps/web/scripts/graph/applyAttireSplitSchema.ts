/**
 * D059 — attire split: the schema half. Adds the 5 new attire sub-role enum values and
 * re-seeds `vendor_roles` from the updated `VENDOR_ROLES` (vendorRoleRules.ts). Purely
 * additive -- no data write, no removal. `migrateVendorRolesV2.ts` (the data half, run with a
 * new --batch-id) reconciles wedding_vendors/wedding_vendor_credits/account_tags AFTER this
 * has been applied and AFTER reclassifyAttireSplit.ts has re-bucketed
 * stack_extraction_entries_v2.role. See docs/decisions.md D059 and the plan.
 *
 * Modeled directly on applyVendorTaxonomySchema.ts (D056 stage 2a) -- same enumLabelExists
 * guard, same "each ADD VALUE its own auto-committing statement" discipline (Postgres won't
 * let a transaction USE a value it ADDed to an enum within that same transaction), same
 * --dry-run default / --apply human-only split.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyAttireSplitSchema.ts              # dry run (default)
 *   bun run scripts/graph/applyAttireSplitSchema.ts --dry-run    # same, explicit
 *   bun run scripts/graph/applyAttireSplitSchema.ts --apply      # real write, human only
 */
import { getPool, closePool } from "../classify/db";
import { VENDOR_ROLES } from "./vendorRoleRules";

// The 5 new attire sub-role slugs this migration adds to the vendor_role enum. `attire` and
// `accessories` already exist in the enum (D056) -- only their display/scope changed in
// VENDOR_ROLES, which the vendor_roles reseed below picks up without any enum change.
const NEW_ATTIRE_ROLE_VALUES = ["wedding_dress", "menswear", "bridesmaid_attire", "veil_headpiece", "shoes"];

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
  console.log(`\n[apply-attire-split] ${apply ? "EXECUTING (auto-commits)" : "DRY RUN"}: ${label}`);
  console.log(sql);
  if (apply) {
    await pool.query(sql);
    console.log(`[apply-attire-split] committed: ${label}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  console.log(`[apply-attire-split] mode: ${apply ? "APPLY (real write)" : "DRY RUN (prints SQL, no write)"}`);
  console.log(`[apply-attire-split] vendor_roles seed rows: ${VENDOR_ROLES.length}`);

  // ---- vendor_role enum adds. Each its own committed statement. ----
  for (const slug of NEW_ATTIRE_ROLE_VALUES) {
    const has = await enumLabelExists(pool, "vendor_role", slug);
    const sql = `alter type vendor_role add value if not exists ${sqlString(slug)};`;
    if (has) {
      console.log(`\n[apply-attire-split] vendor_role already has '${slug}' -- skipping: ${sql}`);
      continue;
    }
    await runStandaloneStatement(pool, `add vendor_role value '${slug}'`, sql, apply);
  }

  // ---- vendor_roles reseed (upsert from VENDOR_ROLES; no enum literal involved) ----
  await runStandaloneStatement(pool, "reseed vendor_roles (upsert from VENDOR_ROLES)", buildSeedSql(), apply);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
