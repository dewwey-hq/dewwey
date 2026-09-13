/**
 * D059 follow-up (same day, agent-caught during post-apply verification): cleans up a real
 * side effect of running the attire split through `migrateVendorRolesV2.ts`. That script's
 * "protection" invariant (built for D056, to avoid disturbing already-verified wedding data)
 * lets new v10-derived credit rows get INSERTed into `wedding_vendors` on a protected wedding,
 * but does not DELETE the account's prior role on that same wedding when it's protected. For a
 * pure role-relabeling (attire -> wedding_dress, accessories -> shoes/veil_headpiece) that left
 * 2,850 `(wedding_id, account_id)` pairs carrying BOTH the old generic row and the new specific
 * one -- e.g. mira_couture on wedding #59 has both an `attire` row and a `wedding_dress` row.
 * User-visible effect: duplicate "Credited as" chips on vendor pages, and a diluted top-role
 * signal (the old row's evidence competes with the new one in `v_account_role`).
 *
 * Fix: delete the old `attire`/`accessories` row wherever a sibling new-role row
 * (wedding_dress/menswear/bridesmaid_attire/veil_headpiece/shoes) exists for the exact same
 * `(wedding_id, account_id)` pair. This never removes evidence -- the new row already represents
 * that same credit, more specifically -- and is scoped ONLY to pairs where a sibling exists, so
 * a genuine `attire`/`accessories` row with no v10-derived sibling (the "no v10 coverage"
 * residual `migrateVendorRolesV2.ts` already documents) is left untouched.
 *
 * Logged to `vendor_role_migrations` (batch_id below) using the same shape
 * `migrateVendorRolesV2.ts` already writes (`old_role` set, `new_role` null = "this row was
 * deleted, no direct replacement logged here since the sibling row is a separate, already-
 * existing insert from the d059-attire-split-1 batch") -- a human revert follows the exact same
 * pattern already documented for that batch: re-insert from `vendor_role_migrations` where
 * `old_role is not null and new_role is null`.
 *
 * `--dry-run` (default) prints the count and a sample, writes nothing. `--apply` (human only,
 * never this agent -- same standing convention as every other script here) deletes and logs.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/cleanupAttireSplitDuplicates.ts              # dry run (default)
 *   bun run scripts/graph/cleanupAttireSplitDuplicates.ts --apply       # real write, human only
 */
import { getPool, closePool } from "../classify/db";

const BATCH_ID = "d059-attire-split-cleanup-1";
const OLD_ROLES = ["attire", "accessories"];
const NEW_ROLES = ["wedding_dress", "menswear", "bridesmaid_attire", "veil_headpiece", "shoes"];

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  console.log(`[cleanup-attire-split-dupes] mode: ${apply ? "APPLY (real write)" : "DRY RUN (no write)"}`);

  // One row per (wedding, account) that has an old generic role AND at least one new sibling
  // role -- an `exists` (not a join) so an old row with >1 new sibling (e.g. a shop that's both
  // a bridal AND bridesmaid vendor on the same wedding) is counted/deleted exactly once, not
  // fanned out per sibling match.
  const { rows } = await pool.query(
    `select old.wedding_id, old.account_id, old.role as old_role, old.n_confirmations, a.username,
            (select array_agg(distinct new_.role) from wedding_vendors new_
             where new_.wedding_id = old.wedding_id and new_.account_id = old.account_id
               and new_.role = any($2)) as new_roles
     from wedding_vendors old
     join accounts a on a.id = old.account_id
     where old.role = any($1)
       and exists (
         select 1 from wedding_vendors new_
         where new_.wedding_id = old.wedding_id and new_.account_id = old.account_id
           and new_.role = any($2)
       )
     order by old.wedding_id, old.account_id`,
    [OLD_ROLES, NEW_ROLES]
  );

  console.log(`[cleanup-attire-split-dupes] duplicate (old role + new sibling role) pairs: ${rows.length}`);
  console.log(`[cleanup-attire-split-dupes] sample (up to 15):`);
  for (const r of rows.slice(0, 15)) {
    const newRoles = Array.isArray(r.new_roles) ? r.new_roles.join(", ") : String(r.new_roles);
    console.log(`  wedding=${r.wedding_id} account=${r.account_id} (${r.username})  ${r.old_role} -> superseded by [${newRoles}]`);
  }

  if (!apply) {
    console.log(`\n[cleanup-attire-split-dupes] DRY RUN -- no rows deleted. Re-run with --apply to write (human only).`);
    await closePool();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    let logged = 0;
    for (const r of rows) {
      await client.query(
        `insert into vendor_role_migrations (batch_id, table_name, wedding_id, account_id, old_role, new_role, note)
         values ($1, 'wedding_vendors', $2, $3, $4, null, $5)`,
        [
          BATCH_ID,
          r.wedding_id,
          r.account_id,
          r.old_role,
          `duplicate cleanup: deleted because sibling role '${r.new_role}' already exists for this (wedding, account); n_confirmations was ${r.n_confirmations}`,
        ]
      );
      logged++;
    }
    const { rowCount } = await client.query(
      `delete from wedding_vendors old
       using wedding_vendors new_
       where old.wedding_id = new_.wedding_id and old.account_id = new_.account_id
         and old.role = any($1) and new_.role = any($2)`,
      [OLD_ROLES, NEW_ROLES]
    );
    await client.query("commit");
    console.log(`[cleanup-attire-split-dupes] logged ${logged} row(s) to vendor_role_migrations (batch_id=${BATCH_ID})`);
    console.log(`[cleanup-attire-split-dupes] deleted ${rowCount} row(s) from wedding_vendors`);
    console.log(`[cleanup-attire-split-dupes] COMMITTED`);
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
