/**
 * `/venues` counts `weddings.venue_id` per account with NO alias resolution (unlike the vendor
 * detail page's `resolveAccountIdentity()` in lib/server/graph.ts, which merges aliases at read
 * time). Real venues that run a second Instagram handle -- and are recorded in `account_aliases`
 * (`alias_account_id` -> `canonical_account_id`, e.g. `chicagomuseumevents` -> `chicagomuseum`) --
 * usually have their `weddings.venue_id`/`wedding_vendors` credits sitting on the ALIAS account.
 * The alias account itself usually has no `account_locations` row, so `/venues` (which requires
 * `account_locations.in_metro`) never shows those weddings at all. Measured 2026-09-10: 243
 * weddings across 36 alias accounts.
 *
 * This script re-points those weddings and credits at the canonical account, so they surface
 * under the canonical account's `/venues` card and vendor-detail page like any other credit --
 * with revertable provenance, since it's a write against production tables:
 *
 *   1. Loads all `account_aliases` pairs. Refuses (throws) if any pair chains -- a
 *      `canonical_account_id` that is itself somebody else's `alias_account_id` -- since this
 *      script only ever writes the direct canonical, never walks a chain.
 *   2. `weddings.venue_id`: every wedding pointing at an alias account gets re-pointed at that
 *      alias's canonical account. One provenance row per wedding, `table_name='weddings'`.
 *   3. `wedding_vendors`: every row credited to an alias account (ANY role, not just venue) gets
 *      moved to the canonical account. If the canonical account already has a row for the same
 *      `(wedding_id, role)`, the alias row is deleted and folded in
 *      (`n_confirmations = greatest(existing, alias's)`) rather than violating the
 *      `(wedding_id, account_id, role)` primary key; otherwise the row's `account_id` is updated
 *      in place. One provenance row per touched `wedding_vendors` row, `table_name='wedding_vendors'`,
 *      carrying `role`, `merged`, and the ALIAS row's original `n_confirmations` (`old_n_confirmations`
 *      -- what a revert needs to re-insert the alias row; a merged canonical row's OWN prior
 *      `n_confirmations` isn't separately recoverable once `greatest()` has run, so a merge can't
 *      be perfectly reverted, only re-approximated -- see the printed revert SQL).
 *   4. Provenance lives in `account_alias_remaps` (created here if missing). Revert SQL is printed
 *      every run (human-run-by-hand only, this script never applies it).
 *   5. Report: weddings re-pointed (count + top 15 alias->canonical), wedding_vendors rows
 *      moved/merged, per-account delta of `weddings.venue_id` counts, and how many of the
 *      affected canonical accounts have an `account_locations` row with `in_metro=true` (i.e.
 *      will now be countable on `/venues`) vs not.
 *   6. Read-only report (never writes `account_tags`): which alias accounts still carry a
 *      venue-ish (`venue`/`hotel`) `v_account_role` top role. `account_tags` isn't touched by
 *      this script, so these rows will read stale (still crediting the alias as a venue) until
 *      `refreshAccountRoleTagsFromWeddings.ts` is next run -- listed so the parent can decide
 *      whether/when to do that, not acted on here.
 *
 * Same dry-run-by-default, transaction-wrapped, idempotent shape as the rest of scripts/graph
 * (see recreditManagementCompany.ts): a second `--apply` after a prior `--apply` finds no
 * weddings/wedding_vendors rows left pointing at an alias account, so it's a no-op.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/remapWeddingsToCanonicalAccounts.ts --batch-id d055-alias-remap-1              # dry run (default)
 *   bun run scripts/graph/remapWeddingsToCanonicalAccounts.ts --batch-id d055-alias-remap-1 --dry-run    # same, explicit
 *   bun run scripts/graph/remapWeddingsToCanonicalAccounts.ts --batch-id d055-alias-remap-1 --apply      # real write, human only
 */
import { getPool, closePool } from "../classify/db";

const CREATE_TABLE = `
  create table if not exists account_alias_remaps (
    id                    bigserial primary key,
    batch_id              text not null,
    table_name            text not null,
    wedding_id            bigint not null,
    alias_account_id      bigint not null,
    canonical_account_id  bigint not null,
    role                  vendor_role,
    merged                boolean not null default false,
    old_n_confirmations   int,
    created_at            timestamptz not null default now()
  );`;

const TOP_N = 15;

function parseArgs() {
  const argv = process.argv.slice(2);
  const batchIdx = argv.indexOf("--batch-id");
  const batchId = batchIdx !== -1 ? argv[batchIdx + 1] : undefined;
  const apply = argv.includes("--apply");
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[remap-weddings-to-canonical] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/graph/remapWeddingsToCanonicalAccounts.ts --batch-id <id> [--apply]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  return { batchId, apply };
}

async function main() {
  const { batchId, apply } = parseArgs();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`[remap-weddings-to-canonical] mode: ${apply ? "APPLY (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[remap-weddings-to-canonical] batch_id: ${batchId}`);

    await client.query(CREATE_TABLE);

    // ------------------------------------------------------------
    // Step 1: load alias pairs, refuse on chains.
    // ------------------------------------------------------------
    const { rows: aliasPairs } = await client.query<{ alias_account_id: string; canonical_account_id: string }>(
      `select alias_account_id::text, canonical_account_id::text from account_aliases`
    );
    console.log(`[remap-weddings-to-canonical] loaded ${aliasPairs.length} account_aliases pair(s)`);

    const aliasIdSet = new Set(aliasPairs.map((p) => p.alias_account_id));
    const chainOffenders = aliasPairs.filter((p) => aliasIdSet.has(p.canonical_account_id));
    if (chainOffenders.length > 0) {
      console.error(
        `[remap-weddings-to-canonical] REFUSING: account_aliases contains chain(s) -- a canonical_account_id ` +
          `that is itself an alias_account_id of another pair:`
      );
      for (const o of chainOffenders) {
        console.error(`  alias_account_id=${o.alias_account_id} -> canonical_account_id=${o.canonical_account_id} (canonical is itself an alias)`);
      }
      await client.query("rollback");
      throw new Error("account_aliases contains chained pairs -- fix account_aliases before running this script.");
    }

    const aliasToCanonical = new Map(aliasPairs.map((p) => [p.alias_account_id, p.canonical_account_id]));
    const aliasAccountIds = [...aliasToCanonical.keys()];
    const canonicalAccountIds = [...new Set(aliasToCanonical.values())];
    const allAccountIds = [...new Set([...aliasAccountIds, ...canonicalAccountIds])];

    const { rows: acctRows } = await client.query<{ id: string; username: string }>(
      `select id::text, username::text from accounts where id = any($1::bigint[])`,
      [allAccountIds]
    );
    const usernameById = new Map(acctRows.map((r) => [r.id, r.username]));
    const nameOf = (id: string) => usernameById.get(id) ?? `account_id=${id}`;

    if (aliasAccountIds.length === 0) {
      console.log("[remap-weddings-to-canonical] no account_aliases pairs found -- nothing to do.");
      await client.query("rollback");
      return;
    }

    // ------------------------------------------------------------
    // Step 2: weddings.venue_id re-pointing.
    // ------------------------------------------------------------
    const { rows: weddingRows } = await client.query<{ id: string; venue_id: string }>(
      `select id::text, venue_id::text from weddings where venue_id = any($1::bigint[])`,
      [aliasAccountIds]
    );
    console.log(`[remap-weddings-to-canonical] ${weddingRows.length} wedding(s) have weddings.venue_id = an alias account`);

    // per-alias wedding counts, for the top-15 report and the venue_id delta
    const weddingCountByAlias = new Map<string, number>();
    for (const w of weddingRows) {
      weddingCountByAlias.set(w.venue_id, (weddingCountByAlias.get(w.venue_id) ?? 0) + 1);
    }

    const venueIdDelta = new Map<string, number>(); // account_id -> delta
    for (const [aliasId, count] of weddingCountByAlias) {
      const canonicalId = aliasToCanonical.get(aliasId)!;
      venueIdDelta.set(aliasId, (venueIdDelta.get(aliasId) ?? 0) - count);
      venueIdDelta.set(canonicalId, (venueIdDelta.get(canonicalId) ?? 0) + count);
    }

    if (apply) {
      for (const [aliasId, canonicalId] of aliasToCanonical) {
        if (!weddingCountByAlias.has(aliasId)) continue;
        await client.query(`update weddings set venue_id = $2 where venue_id = $1`, [aliasId, canonicalId]);
      }
      for (const w of weddingRows) {
        const canonicalId = aliasToCanonical.get(w.venue_id)!;
        await client.query(
          `insert into account_alias_remaps
             (batch_id, table_name, wedding_id, alias_account_id, canonical_account_id, role, merged, old_n_confirmations)
           values ($1, 'weddings', $2, $3, $4, null, false, null)`,
          [batchId, w.id, w.venue_id, canonicalId]
        );
      }
    }

    // ------------------------------------------------------------
    // Step 3: wedding_vendors moves/merges.
    // ------------------------------------------------------------
    const { rows: wvRows } = await client.query<{
      wedding_id: string;
      account_id: string;
      role: string;
      n_confirmations: number;
    }>(
      `select wedding_id::text, account_id::text, role::text, n_confirmations
       from wedding_vendors where account_id = any($1::bigint[])`,
      [aliasAccountIds]
    );
    console.log(`[remap-weddings-to-canonical] ${wvRows.length} wedding_vendors row(s) credited to an alias account (any role)`);

    let wvMoved = 0;
    let wvMerged = 0;

    for (const row of wvRows) {
      const canonicalId = aliasToCanonical.get(row.account_id)!;
      const { rows: existingRows } = await client.query<{ n_confirmations: number }>(
        `select n_confirmations from wedding_vendors where wedding_id = $1 and account_id = $2 and role = $3`,
        [row.wedding_id, canonicalId, row.role]
      );
      const merged = existingRows.length > 0;

      if (apply) {
        if (merged) {
          await client.query(
            `delete from wedding_vendors where wedding_id = $1 and account_id = $2 and role = $3`,
            [row.wedding_id, row.account_id, row.role]
          );
          await client.query(
            `update wedding_vendors set n_confirmations = greatest(n_confirmations, $4)
             where wedding_id = $1 and account_id = $2 and role = $3`,
            [row.wedding_id, canonicalId, row.role, row.n_confirmations]
          );
        } else {
          await client.query(
            `update wedding_vendors set account_id = $2 where wedding_id = $1 and account_id = $3 and role = $4`,
            [row.wedding_id, canonicalId, row.account_id, row.role]
          );
        }
        await client.query(
          `insert into account_alias_remaps
             (batch_id, table_name, wedding_id, alias_account_id, canonical_account_id, role, merged, old_n_confirmations)
           values ($1, 'wedding_vendors', $2, $3, $4, $5, $6, $7)`,
          [batchId, row.wedding_id, row.account_id, canonicalId, row.role, merged, row.n_confirmations]
        );
      }

      if (merged) wvMerged++;
      else wvMoved++;
    }
    console.log(
      `[remap-weddings-to-canonical] wedding_vendors: moved=${wvMoved}, merged into existing canonical row=${wvMerged} (total touched=${wvRows.length})`
    );

    if (apply) {
      console.log(`[remap-weddings-to-canonical] logged ${weddingRows.length + wvRows.length} account_alias_remaps row(s), batch_id=${batchId}`);
    } else {
      console.log(`[remap-weddings-to-canonical] DRY RUN -- would log ${weddingRows.length + wvRows.length} account_alias_remaps row(s), batch_id=${batchId}`);
    }

    // ------------------------------------------------------------
    // Revert SQL (human only, never run by this script).
    // ------------------------------------------------------------
    console.log(
      `\n[remap-weddings-to-canonical] to revert this batch by hand (human only):\n` +
        `  begin;\n` +
        `  -- restore weddings.venue_id\n` +
        `  update weddings w set venue_id = r.alias_account_id\n` +
        `    from account_alias_remaps r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'weddings' and w.id = r.wedding_id;\n` +
        `  -- restore non-merged wedding_vendors rows (account_id back to the alias)\n` +
        `  update wedding_vendors wv set account_id = r.alias_account_id\n` +
        `    from account_alias_remaps r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'wedding_vendors' and r.merged = false\n` +
        `      and wv.wedding_id = r.wedding_id and wv.account_id = r.canonical_account_id and wv.role = r.role;\n` +
        `  -- best-effort restore of merged wedding_vendors rows: re-insert the alias row with its\n` +
        `  -- original n_confirmations. NOTE: this does NOT undo the greatest() bump applied to the\n` +
        `  -- canonical row -- if the canonical row's n_confirmations was already >= the alias row's\n` +
        `  -- before the merge, it is left as-is (correct); if the alias row's was higher, the\n` +
        `  -- canonical row is left elevated and cannot be perfectly restored to its pre-merge value\n` +
        `  -- from this log alone.\n` +
        `  insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)\n` +
        `  select r.wedding_id, r.alias_account_id, r.role, r.old_n_confirmations\n` +
        `    from account_alias_remaps r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'wedding_vendors' and r.merged = true\n` +
        `  on conflict (wedding_id, account_id, role) do nothing;\n` +
        `  delete from account_alias_remaps where batch_id = '${batchId}';\n` +
        `  commit;`
    );

    // ------------------------------------------------------------
    // Report.
    // ------------------------------------------------------------
    console.log(`\n[remap-weddings-to-canonical] weddings re-pointed: ${weddingRows.length} across ${weddingCountByAlias.size} alias account(s)`);
    console.log(`[remap-weddings-to-canonical] top ${TOP_N} alias -> canonical:`);
    const sortedAliasCounts = [...weddingCountByAlias.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
    for (const [aliasId, count] of sortedAliasCounts) {
      const canonicalId = aliasToCanonical.get(aliasId)!;
      console.log(`  ${nameOf(aliasId)} -> ${nameOf(canonicalId)}: ${count}`);
    }

    console.log(`\n[remap-weddings-to-canonical] weddings.venue_id delta (alias accounts lose, canonical accounts gain):`);
    const sortedDeltas = [...venueIdDelta.entries()].sort((a, b) => b[1] - a[1]);
    for (const [acctId, delta] of sortedDeltas) {
      console.log(`  ${nameOf(acctId)}: ${delta > 0 ? "+" : ""}${delta}`);
    }

    const canonicalIdsReceivingWeddings = [...new Set([...weddingCountByAlias.keys()].map((aliasId) => aliasToCanonical.get(aliasId)!))];
    let inMetroCount = 0;
    let notInMetroCount = 0;
    if (canonicalIdsReceivingWeddings.length > 0) {
      const { rows: locRows } = await client.query<{ account_id: string; in_metro: boolean | null }>(
        `select account_id::text, in_metro from account_locations where account_id = any($1::bigint[])`,
        [canonicalIdsReceivingWeddings]
      );
      const inMetroById = new Map(locRows.map((r) => [r.account_id, r.in_metro === true]));
      for (const id of canonicalIdsReceivingWeddings) {
        if (inMetroById.get(id)) inMetroCount++;
        else notInMetroCount++;
      }
    }
    console.log(
      `\n[remap-weddings-to-canonical] of ${canonicalIdsReceivingWeddings.length} canonical account(s) newly re-pointed to, ` +
        `${inMetroCount} have an account_locations row with in_metro=true (countable on /venues), ${notInMetroCount} do not.`
    );

    // ------------------------------------------------------------
    // Step 6: read-only -- alias accounts still carrying a venue-ish top role.
    // account_tags/v_account_role is never written by this script.
    // ------------------------------------------------------------
    const { rows: stillVenueish } = await client.query<{ account_id: string; role: string }>(
      `select account_id::text, role::text from v_account_role where account_id = any($1::bigint[]) and role in ('venue', 'hotel')`,
      [aliasAccountIds]
    );
    console.log(
      `\n[remap-weddings-to-canonical] (read-only) ${stillVenueish.length} alias account(s) still carry a venue-ish (venue/hotel) ` +
        `v_account_role top role -- account_tags is NOT touched by this script, so these will read stale until ` +
        `refreshAccountRoleTagsFromWeddings.ts is next run:`
    );
    for (const r of stillVenueish) {
      console.log(`  ${nameOf(r.account_id)}: ${r.role} -> ${nameOf(aliasToCanonical.get(r.account_id)!)}`);
    }

    if (apply) {
      await client.query("commit");
      console.log("\n[remap-weddings-to-canonical] COMMITTED");
    } else {
      await client.query("rollback");
      console.log("\n[remap-weddings-to-canonical] DRY RUN -- rolled back, no changes committed");
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
