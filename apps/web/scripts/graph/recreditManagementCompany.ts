/**
 * A venue-MANAGEMENT company got credited as the venue itself -- the concrete case this was
 * built for (D055 follow-up, 2026-09-10 coverage audit) is `venuelogic` ("Venue Management
 * for @rockwellontheriver, @bridgeportartcenter & @amazingspacechicago"), credited
 * `role='venue'` on 189 weddings. This script:
 *
 *   1. Recredits every `wedding_vendors` row of the given account with `role='venue'` to
 *      `role='other'` -- it's still a real, legitimate credit (the management company did
 *      work on the wedding), just not the venue. If an `other` row already exists for the
 *      same wedding/account (rare -- would mean the account was independently credited both
 *      ways), the venue row is deleted and folded into the existing other row
 *      (`n_confirmations = greatest(existing, venue row's)`) rather than violating the
 *      `(wedding_id, account_id, role)` primary key.
 *   2. Re-anchors every wedding whose `weddings.venue_id` pointed at the management company:
 *      prefer the wedding's OTHER `wedding_vendors` venue-role credit if there's exactly one
 *      (most common case); otherwise fall back to the wedding's post(s)' Instagram location
 *      tag resolved through `location_tag_venue_map` (built by buildLocationTagVenueMap.ts)
 *      if that resolves to exactly one venue account -- and if that account has no
 *      `wedding_vendors` venue row yet for this wedding, insert one (`n_confirmations=1`) so
 *      the new venue_id is itself backed by a credit. A wedding that resolves neither way is
 *      left with its old (wrong) venue_id and reported as unresolved -- never guessed.
 *   3. Logs one `wedding_vendor_recredits` row per wedding touched by step 1, for revert.
 *
 * refreshAccountRoleTagsFromWeddings.ts should be run AFTER this script (not before) so the
 * management company's `account_tags` top role reflects `other`, not a now-stale `venue` --
 * running that script first would still show venuelogic's top role as venue (its own
 * comment/check flags this explicitly; harmless either order for that script, just report).
 *
 * Same dry-run-by-default, transaction-wrapped, idempotent shape as the rest of scripts/graph:
 * re-running with --apply after a prior --apply is a no-op (no venue-role rows left to
 * recredit, weddings.venue_id no longer points at the account).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/recreditManagementCompany.ts --handle venuelogic --batch-id d055-venuelogic-recredit              # dry run (default)
 *   bun run scripts/graph/recreditManagementCompany.ts --handle venuelogic --batch-id d055-venuelogic-recredit --dry-run   # same, explicit
 *   bun run scripts/graph/recreditManagementCompany.ts --handle venuelogic --batch-id d055-venuelogic-recredit --apply    # real write, human only
 */
import { getPool, closePool } from "../classify/db";

const CREATE_TABLE = `
  create table if not exists wedding_vendor_recredits (
    id            bigserial primary key,
    batch_id      text not null,
    wedding_id    bigint not null,
    account_id    bigint not null,
    old_role      vendor_role not null,
    new_role      vendor_role not null,
    old_venue_id  bigint,
    new_venue_id  bigint,
    created_at    timestamptz default now()
  );`;

function parseArgs() {
  const argv = process.argv.slice(2);
  const handleIdx = argv.indexOf("--handle");
  const batchIdx = argv.indexOf("--batch-id");
  const handle = handleIdx !== -1 ? argv[handleIdx + 1] : undefined;
  const batchId = batchIdx !== -1 ? argv[batchIdx + 1] : undefined;
  const apply = argv.includes("--apply");
  if (!handle || handle.startsWith("--") || !batchId || batchId.startsWith("--")) {
    console.error(
      "[recredit-management-company] --handle <username> and --batch-id <id> are required.\n" +
        "Usage: bun run scripts/graph/recreditManagementCompany.ts --handle <username> --batch-id <id> [--apply]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  return { handle, batchId, apply };
}

async function main() {
  const { handle, batchId, apply } = parseArgs();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`[recredit-management-company] mode: ${apply ? "APPLY (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[recredit-management-company] handle: @${handle}  batch_id: ${batchId}`);

    await client.query(CREATE_TABLE);

    const { rows: acctRows } = await client.query<{ id: string }>(
      `select id::text from accounts where username = $1`,
      [handle]
    );
    if (acctRows.length === 0) {
      console.error(`[recredit-management-company] REFUSING: no account found for username '${handle}'.`);
      await client.query("rollback");
      process.exit(1);
    }
    const accountId = acctRows[0].id;

    // ------------------------------------------------------------
    // Step 1: recredit venue -> other on every wedding_vendors row for this account.
    // ------------------------------------------------------------
    const { rows: venueRows } = await client.query<{ wedding_id: string; n_confirmations: number }>(
      `select wedding_id::text, n_confirmations from wedding_vendors where account_id = $1 and role = 'venue'`,
      [accountId]
    );
    console.log(`[recredit-management-company] found ${venueRows.length} wedding_vendors row(s) with role='venue' for @${handle}`);

    let mergedIntoExistingOther = 0;
    let plainRecredit = 0;
    const touchedWeddingIds: string[] = [];

    for (const row of venueRows) {
      touchedWeddingIds.push(row.wedding_id);
      const { rows: otherRows } = await client.query<{ n_confirmations: number }>(
        `select n_confirmations from wedding_vendors where wedding_id = $1 and account_id = $2 and role = 'other'`,
        [row.wedding_id, accountId]
      );
      if (apply) {
        if (otherRows.length > 0) {
          await client.query(
            `delete from wedding_vendors where wedding_id = $1 and account_id = $2 and role = 'venue'`,
            [row.wedding_id, accountId]
          );
          await client.query(
            `update wedding_vendors set n_confirmations = greatest(n_confirmations, $3)
             where wedding_id = $1 and account_id = $2 and role = 'other'`,
            [row.wedding_id, accountId, row.n_confirmations]
          );
        } else {
          await client.query(
            `update wedding_vendors set role = 'other' where wedding_id = $1 and account_id = $2 and role = 'venue'`,
            [row.wedding_id, accountId]
          );
        }
      }
      if (otherRows.length > 0) mergedIntoExistingOther++;
      else plainRecredit++;
    }
    console.log(
      `[recredit-management-company] recredited=${venueRows.length} (plain venue->other=${plainRecredit}, merged into existing other row=${mergedIntoExistingOther})`
    );

    // ------------------------------------------------------------
    // Step 2: re-anchor weddings whose venue_id pointed at this account.
    // Read venue_id BEFORE any of step 1's changes could matter here (venue_id is untouched
    // by step 1) -- snapshot up front so provenance logs the true old_venue_id.
    // ------------------------------------------------------------
    const { rows: anchoredWeddings } = await client.query<{ id: string; venue_id: string }>(
      `select id::text, venue_id::text from weddings where venue_id = $1`,
      [accountId]
    );
    console.log(`[recredit-management-company] ${anchoredWeddings.length} wedding(s) have weddings.venue_id = @${handle}`);

    let resolvedByCredit = 0;
    let resolvedByTag = 0;
    const unresolved: string[] = [];
    const venueIdDelta = new Map<string, number>(); // account_id -> delta count
    const newVenueIdByWedding = new Map<string, string>();

    for (const w of anchoredWeddings) {
      const { rows: otherVenueCredits } = await client.query<{ account_id: string }>(
        `select distinct account_id::text from wedding_vendors
         where wedding_id = $1 and role = 'venue' and account_id <> $2`,
        [w.id, accountId]
      );

      let resolvedAccountId: string | null = null;
      let resolvedVia: "credit" | "tag" | null = null;

      if (otherVenueCredits.length === 1) {
        resolvedAccountId = otherVenueCredits[0].account_id;
        resolvedVia = "credit";
      } else {
        const { rows: tagRows } = await client.query<{ venue_account_id: string }>(
          `select distinct ltm.venue_account_id::text
           from wedding_posts wp
           join posts p on p.id = wp.post_id
           join staging.instagram_posts ip on ip.post_url = p.url
           join location_tag_venue_map ltm on ltm.location_tag = ip.location_tag
           where wp.wedding_id = $1 and ltm.venue_account_id <> $2`,
          [w.id, accountId]
        );
        if (tagRows.length === 1) {
          resolvedAccountId = tagRows[0].venue_account_id;
          resolvedVia = "tag";
        }
      }

      if (resolvedAccountId && resolvedVia) {
        if (resolvedVia === "credit") resolvedByCredit++;
        else resolvedByTag++;
        newVenueIdByWedding.set(w.id, resolvedAccountId);
        venueIdDelta.set(accountId, (venueIdDelta.get(accountId) ?? 0) - 1);
        venueIdDelta.set(resolvedAccountId, (venueIdDelta.get(resolvedAccountId) ?? 0) + 1);

        if (apply) {
          await client.query(`update weddings set venue_id = $1 where id = $2`, [resolvedAccountId, w.id]);
          if (resolvedVia === "tag") {
            await client.query(
              `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
               values ($1, $2, 'venue', 1)
               on conflict (wedding_id, account_id, role) do nothing`,
              [w.id, resolvedAccountId]
            );
          }
        }
      } else {
        unresolved.push(w.id);
      }
    }
    console.log(
      `[recredit-management-company] re-anchored: by credit=${resolvedByCredit}, by tag=${resolvedByTag}, unresolved=${unresolved.length}` +
        (unresolved.length > 0 ? ` (wedding ids: ${unresolved.join(", ")})` : "")
    );

    // ------------------------------------------------------------
    // Step 3: provenance -- one row per wedding touched by step 1.
    // ------------------------------------------------------------
    if (apply) {
      for (const weddingId of touchedWeddingIds) {
        // null/null for the ~170 weddings whose venue_id never pointed at this account at all
        // (only role was recredited, step 1) -- old_venue_id/new_venue_id is deliberately only
        // meaningful for the subset step 2 actually anchored to this account.
        const oldVenueId = anchoredWeddings.find((w) => w.id === weddingId)?.venue_id ?? null;
        const newVenueId = newVenueIdByWedding.get(weddingId) ?? oldVenueId;
        await client.query(
          `insert into wedding_vendor_recredits
             (batch_id, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id)
           values ($1, $2, $3, 'venue', 'other', $4, $5)`,
          [batchId, weddingId, accountId, oldVenueId, newVenueId]
        );
      }
      console.log(`[recredit-management-company] logged ${touchedWeddingIds.length} wedding_vendor_recredits row(s), batch_id=${batchId}`);
    } else {
      console.log(`[recredit-management-company] DRY RUN -- would log ${touchedWeddingIds.length} wedding_vendor_recredits row(s), batch_id=${batchId}`);
    }

    // ------------------------------------------------------------
    // Per-venue delta report.
    // ------------------------------------------------------------
    const deltaAccountIds = [...venueIdDelta.keys()];
    let usernameById = new Map<string, string>();
    if (deltaAccountIds.length > 0) {
      const { rows } = await client.query<{ id: string; username: string }>(
        `select id::text, username::text from accounts where id = any($1::bigint[])`,
        [deltaAccountIds]
      );
      usernameById = new Map(rows.map((r) => [r.id, r.username]));
    }
    console.log(`\n[recredit-management-company] weddings.venue_id delta:`);
    const sortedDeltas = [...venueIdDelta.entries()].sort((a, b) => b[1] - a[1]);
    for (const [acctId, delta] of sortedDeltas) {
      const username = usernameById.get(acctId) ?? `account_id=${acctId}`;
      console.log(`  ${username}: ${delta > 0 ? "+" : ""}${delta}`);
    }

    if (apply) {
      console.log(
        `\n[recredit-management-company] to revert this batch by hand (human only):\n` +
          `  begin;\n` +
          `  -- restore role='venue' and delete any 'other' row this batch created from scratch\n` +
          `  -- (safe only if the 'other' row's n_confirmations wasn't independently bumped since):\n` +
          `  update wedding_vendors wv set role = 'venue'\n` +
          `    from wedding_vendor_recredits r\n` +
          `    where r.batch_id = '${batchId}' and wv.wedding_id = r.wedding_id and wv.account_id = r.account_id and wv.role = 'other';\n` +
          `  -- restore weddings.venue_id\n` +
          `  update weddings w set venue_id = r.old_venue_id\n` +
          `    from wedding_vendor_recredits r\n` +
          `    where r.batch_id = '${batchId}' and w.id = r.wedding_id and r.old_venue_id is distinct from r.new_venue_id;\n` +
          `  delete from wedding_vendor_recredits where batch_id = '${batchId}';\n` +
          `  commit;\n` +
          `  -- NOTE: this does not remove any wedding_vendors venue row this batch INSERTED for a\n` +
          `  -- location-tag resolution (step 2, resolved_via='tag') -- check those by hand if the\n` +
          `  -- resolution itself also needs undoing, not just the venue_id pointer.`
      );
      await client.query("commit");
      console.log("\n[recredit-management-company] COMMITTED");
    } else {
      await client.query("rollback");
      console.log("\n[recredit-management-company] DRY RUN -- rolled back, no changes committed");
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
