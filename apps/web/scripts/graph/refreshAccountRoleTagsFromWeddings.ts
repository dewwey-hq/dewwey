/**
 * D055 follow-up (2026-09-10 coverage audit) -- makes `/venues` and
 * `/vendors/<username>`'s displayed role (`v_account_role`, which picks the
 * `account_tags` row with the most evidence per account) honest again. The
 * D055 wedding batches (2,200+ weddings since 2026-09-08) wrote
 * `wedding_vendors (wedding_id, account_id, role, n_confirmations)` directly
 * and never touched `account_tags` -- so 195 accounts that are the venue of
 * 704 documented weddings carry no tag at all (invisible on `/venues`), and
 * 364 accounts show a stale top role from old, thinner stack-evidence tags
 * (`sprouthomechicago` tagged venue/3 but is the florist on 17 weddings;
 * `fschicago` other/3 but venue on 27; `totlspecialevents` planner/1 but
 * venue on 33 -- see the task background for the full audit).
 *
 * Fix: add `wedding_credit` as its own `tag_source` (CLAUDE.md: "roles are
 * votes across posts" -- a documented wedding is the strongest vote there
 * is) and upsert one `account_tags` row per `(account_id, role)` present in
 * `wedding_vendors`, using the SAME confidence formula Ben's pipeline
 * already uses for stack evidence: `least(0.5 + 0.15*evidence_count, 0.95)`
 * where `evidence_count = count(distinct wedding_id)`
 * (see accountRoleTags.ts / accountRoleTags.test.ts for the formula and the
 * top-role diff classifier, unit-tested there). `v_account_role`'s own
 * ordering (evidence_count desc, confidence desc) then just works -- no view
 * change needed.
 *
 * Enum values can't be used in the same transaction that adds them (Postgres
 * restriction, not a rollback-safety one -- see below), so `alter type
 * tag_source add value if not exists 'wedding_credit'` runs as its OWN
 * statement, committed immediately, before the main transaction opens.
 * Because of that, this script's real work (the actual INSERT/UPDATE/DELETE
 * using the `wedding_credit` literal) can only run for real once that enum
 * value is already committed -- i.e. only under `--apply`, on a connection
 * where it just got added (or already existed from a prior `--apply` run).
 * `--dry-run` (the default) therefore NEVER touches the DB with a write of
 * any kind, not even the enum add: it reads `account_tags`/`wedding_vendors`
 * read-only and computes the exact same upsert/delete set and the exact same
 * before/after `v_account_role` diff in application code, reusing the same
 * `weddingCreditConfidence`/`pickTopRoles` helpers the real path's SQL
 * mirrors. That keeps a `--dry-run` run 100% side-effect-free (required --
 * this script is run by an agent that is only ever allowed `--dry-run`; a
 * human runs `--apply`), while still reporting real numbers.
 *
 * Idempotent: re-running with the same `wedding_vendors` contents is a no-op
 * (ON CONFLICT DO UPDATE with identical values); reverting a D055 batch
 * (revertWeddingBatch.ts) removes its `wedding_vendors` rows, and the next
 * `--apply` run of this script deletes the now-orphaned `wedding_credit`
 * tags to match.
 *
 * D052 rule respected: this script NEVER inserts into `account_locations` --
 * hidden-venue accounts with no location row or `in_metro=false` are only
 * ever listed to a file for a human/agent to web-check.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/refreshAccountRoleTagsFromWeddings.ts             # dry run (default)
 *   bun run scripts/graph/refreshAccountRoleTagsFromWeddings.ts --dry-run   # same, explicit
 *   bun run scripts/graph/refreshAccountRoleTagsFromWeddings.ts --apply     # real write, human only
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import {
  weddingCreditConfidence,
  pickTopRoles,
  diffTopRoles,
  type RoleVote,
  type TopRole,
} from "./accountRoleTags";

const OUT_DIR = new URL("./tmp_analysis/", import.meta.url).pathname;
const TOP_CHANGES_TO_PRINT = 30;

interface TagRow {
  account_id: string;
  role: string;
  source: string;
  confidence: number;
  evidence_count: number;
}
interface WeddingCreditTargetRow {
  account_id: string;
  role: string;
  evidence_count: number;
}

function key(accountId: number | string, role: string) {
  return `${accountId}|${role}`;
}

/** Returns whether tag_source now has 'wedding_credit' (pre-existing or freshly added). */
async function ensureEnumValue(pool: ReturnType<typeof getPool>, apply: boolean): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'tag_source' and e.enumlabel = 'wedding_credit'`
  );
  if (rows.length > 0) {
    console.log("[refresh-role-tags] tag_source already has 'wedding_credit' -- skipping ALTER TYPE");
    return true;
  }
  if (!apply) {
    console.log(
      "[refresh-role-tags] DRY RUN -- would run as its own committed statement, outside the main " +
        "transaction: alter type tag_source add value if not exists 'wedding_credit'"
    );
    return false;
  }
  const client = await pool.connect();
  try {
    await client.query(`alter type tag_source add value if not exists 'wedding_credit'`);
  } finally {
    client.release();
  }
  console.log("[refresh-role-tags] COMMITTED: alter type tag_source add value if not exists 'wedding_credit'");
  return true;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  const enumReady = await ensureEnumValue(pool, apply);

  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`[refresh-role-tags] mode: ${apply ? "APPLY (real write)" : "DRY RUN (no write, not even the enum)"}`);

    // Before-state: today's real v_account_role.
    const { rows: beforeRows } = await client.query<{
      account_id: string;
      role: string;
      confidence: number;
      evidence_count: number;
    }>(`select account_id, role, confidence, evidence_count from v_account_role`);
    const beforeTop = pickTopRoles(
      beforeRows.map((r) => ({
        accountId: Number(r.account_id),
        role: r.role,
        source: "current",
        confidence: r.confidence,
        evidenceCount: r.evidence_count,
      }))
    );

    // Target wedding_credit rows: one per (account_id, role) in wedding_vendors.
    const { rows: targetRows } = await client.query<WeddingCreditTargetRow>(
      `select account_id, role, count(distinct wedding_id)::int as evidence_count
       from wedding_vendors
       group by account_id, role`
    );
    const targetByKey = new Map(targetRows.map((r) => [key(r.account_id, r.role), r]));

    // Existing wedding_credit rows -- only queryable once the enum value exists (can't cast
    // the literal 'wedding_credit' to tag_source before it's a committed enum value; if it
    // doesn't exist yet, no wedding_credit rows can possibly exist either).
    let existingCreditRows: TagRow[] = [];
    if (enumReady) {
      const { rows } = await client.query<TagRow>(
        `select account_id, role, source, confidence, evidence_count
         from account_tags where source = 'wedding_credit'`
      );
      existingCreditRows = rows;
    }
    const existingByKey = new Map(existingCreditRows.map((r) => [key(r.account_id, r.role), r]));

    let toInsert = 0;
    let toUpdate = 0;
    for (const [k] of targetByKey) {
      if (existingByKey.has(k)) toUpdate++;
      else toInsert++;
    }
    let toDelete = 0;
    for (const [k] of existingByKey) {
      if (!targetByKey.has(k)) toDelete++;
    }

    if (apply && enumReady) {
      const insertResult = await client.query(
        `insert into account_tags (account_id, role, source, confidence, evidence_count, updated_at)
         select account_id, role, 'wedding_credit'::tag_source,
                least(0.5 + 0.15 * count(distinct wedding_id), 0.95),
                count(distinct wedding_id),
                now()
         from wedding_vendors
         group by account_id, role
         on conflict (account_id, role, source)
         do update set confidence = excluded.confidence,
                        evidence_count = excluded.evidence_count,
                        updated_at = now()`
      );
      const deleteResult = await client.query(
        `delete from account_tags at
         where at.source = 'wedding_credit'
           and not exists (
             select 1 from wedding_vendors wv
             where wv.account_id = at.account_id and wv.role = at.role
           )`
      );
      console.log(
        `[refresh-role-tags] APPLIED: upserted=${insertResult.rowCount} (insert=${toInsert} update=${toUpdate}) deleted=${deleteResult.rowCount}`
      );
    } else {
      console.log(
        `[refresh-role-tags] DRY RUN totals: would insert=${toInsert} update=${toUpdate} delete=${toDelete}`
      );
    }

    // After-state. Real path: requery the real view (sees this transaction's own uncommitted
    // writes). Dry-run path: simulate in application code -- allTagRows (everything except the
    // stale wedding_credit rows) plus the freshly computed wedding_credit rows.
    let afterTop: Map<number, TopRole>;
    if (apply && enumReady) {
      const { rows: afterRows } = await client.query<{
        account_id: string;
        role: string;
        confidence: number;
        evidence_count: number;
      }>(`select account_id, role, confidence, evidence_count from v_account_role`);
      afterTop = pickTopRoles(
        afterRows.map((r) => ({
          accountId: Number(r.account_id),
          role: r.role,
          source: "current",
          confidence: r.confidence,
          evidenceCount: r.evidence_count,
        }))
      );
    } else {
      const { rows: allTagRows } = await client.query<TagRow>(
        `select account_id, role, source, confidence, evidence_count from account_tags`
      );
      const simulated: RoleVote[] = [];
      for (const r of allTagRows) {
        if (r.source === "wedding_credit") continue; // replaced wholesale below
        simulated.push({
          accountId: Number(r.account_id),
          role: r.role,
          source: r.source,
          confidence: r.confidence,
          evidenceCount: r.evidence_count,
        });
      }
      for (const r of targetRows) {
        simulated.push({
          accountId: Number(r.account_id),
          role: r.role,
          source: "wedding_credit",
          confidence: weddingCreditConfidence(r.evidence_count),
          evidenceCount: r.evidence_count,
        });
      }
      afterTop = pickTopRoles(simulated);
    }

    // Newly-tagged accounts: accounts with zero account_tags rows before this run that now
    // have at least the wedding_credit row (whether or not it became their top role).
    const beforeAccountIds = new Set(beforeRows.map((r) => Number(r.account_id)));
    const newlyTaggedAccountIds = new Set<number>();
    for (const r of targetRows) {
      const accountId = Number(r.account_id);
      if (!beforeAccountIds.has(accountId)) newlyTaggedAccountIds.add(accountId);
    }

    const changes = diffTopRoles(beforeTop, afterTop);
    changes.sort((a, b) => b.becomesEvidence - a.becomesEvidence);

    // Usernames for reporting.
    const reportAccountIds = [
      ...new Set([...changes.map((c) => c.accountId), ...newlyTaggedAccountIds]),
    ];
    const { rows: usernameRows } = await client.query<{ id: string; username: string }>(
      `select id, username::text from accounts where id = any($1::bigint[])`,
      [reportAccountIds]
    );
    const usernameById = new Map(usernameRows.map((r) => [Number(r.id), r.username]));

    console.log(`\n[refresh-role-tags] newly-tagged accounts (had zero account_tags rows before): ${newlyTaggedAccountIds.size}`);
    console.log(`[refresh-role-tags] top-role changes: ${changes.length}`);
    console.log(`\n[refresh-role-tags] top ${Math.min(TOP_CHANGES_TO_PRINT, changes.length)} top-role changes by becomes-evidence:`);
    for (const c of changes.slice(0, TOP_CHANGES_TO_PRINT)) {
      const username = usernameById.get(c.accountId) ?? `account_id=${c.accountId}`;
      console.log(
        `  ${username}: ${c.wasRole}/${c.wasEvidence} -> ${c.becomesRole}/${c.becomesEvidence}`
      );
    }
    for (const flag of [
      ["sprouthomechicago", "venue", "florist"],
      ["fschicago", "other", "venue"],
    ] as const) {
      const row = changes.find((c) => usernameById.get(c.accountId) === flag[0]);
      if (row) {
        const ok = row.wasRole === flag[1] && row.becomesRole === flag[2];
        console.log(
          `[refresh-role-tags] check ${flag[0]}: ${row.wasRole} -> ${row.becomesRole} (expected ${flag[1]} -> ${flag[2]}) ${ok ? "OK" : "MISMATCH"}`
        );
      } else {
        console.log(`[refresh-role-tags] check ${flag[0]}: not found in top-role changes (see full report)`);
      }
    }
    const { rows: venuelogicRows } = await client.query<{ id: string }>(
      `select id::text from accounts where username = 'venuelogic'`
    );
    if (venuelogicRows.length > 0) {
      const top = afterTop.get(Number(venuelogicRows[0].id));
      console.log(
        `[refresh-role-tags] check venuelogic: top role after this script = ${top?.role ?? "(none)"} ` +
          `(expected to still be 'venue' here -- only recreditManagementCompany.ts moves it to 'other')`
      );
    }

    // Newly visible / hidden-on-/venues accounting for accounts whose AFTER top role is venue.
    const afterVenueAccountIds = [...afterTop.values()]
      .filter((t) => t.role === "venue")
      .map((t) => t.accountId);
    const { rows: locationRows } = await client.query<{ account_id: string; in_metro: boolean | null }>(
      `select account_id, in_metro from account_locations where account_id = any($1::bigint[])`,
      [afterVenueAccountIds]
    );
    const locationByAccount = new Map(locationRows.map((r) => [Number(r.account_id), r.in_metro]));

    let newlyVisible = 0;
    const hiddenNoLocation: { accountId: number; weddings: number }[] = [];
    const hiddenNotInMetro: { accountId: number; weddings: number }[] = [];
    for (const accountId of afterVenueAccountIds) {
      const inMetro = locationByAccount.get(accountId);
      const wasVenue = beforeTop.get(accountId)?.role === "venue";
      const wasVisible = wasVenue && inMetro === true;
      const nowVisible = inMetro === true;
      if (nowVisible && !wasVisible) newlyVisible++;
      if (!locationByAccount.has(accountId)) {
        hiddenNoLocation.push({ accountId, weddings: afterTop.get(accountId)!.evidenceCount });
      } else if (inMetro === false) {
        hiddenNotInMetro.push({ accountId, weddings: afterTop.get(accountId)!.evidenceCount });
      }
    }
    hiddenNoLocation.sort((a, b) => b.weddings - a.weddings);
    hiddenNotInMetro.sort((a, b) => b.weddings - a.weddings);

    console.log(`\n[refresh-role-tags] venue-top accounts newly visible on /venues (top becomes venue AND in_metro=true, wasn't visible before): ${newlyVisible}`);
    console.log(`[refresh-role-tags] venue-top accounts still hidden -- no account_locations row: ${hiddenNoLocation.length}`);
    console.log(`[refresh-role-tags] venue-top accounts still hidden -- in_metro=false: ${hiddenNotInMetro.length}`);

    // Usernames for the hidden lists.
    const hiddenIds = [...hiddenNoLocation, ...hiddenNotInMetro].map((h) => h.accountId);
    let hiddenUsernameById = new Map<number, string>();
    if (hiddenIds.length > 0) {
      const { rows } = await client.query<{ id: string; username: string }>(
        `select id, username::text from accounts where id = any($1::bigint[])`,
        [hiddenIds]
      );
      hiddenUsernameById = new Map(rows.map((r) => [Number(r.id), r.username]));
    }

    const today = new Date().toISOString().slice(0, 10);
    mkdirSync(OUT_DIR, { recursive: true });
    const mdPath = `${OUT_DIR}venue_accounts_hidden_${today}.md`;
    const renderList = (rows: { accountId: number; weddings: number }[]) =>
      rows
        .map((r) => `- ${hiddenUsernameById.get(r.accountId) ?? `account_id=${r.accountId}`} -- ${r.weddings} weddings`)
        .join("\n") || "(none)";
    const md = `# Venue-top accounts still hidden on /venues after wedding-credit refresh (${today})

Generated by refreshAccountRoleTagsFromWeddings.ts. Simulated in ${apply ? "APPLY" : "DRY RUN"} mode.
D052 rule: geography is verified by a person/agent before an \`account_locations\` row is
minted -- this script never inserts one. These two lists are for that verification pass.

## No account_locations row at all (${hiddenNoLocation.length} accounts)

${renderList(hiddenNoLocation)}

## Has account_locations but in_metro=false (${hiddenNotInMetro.length} accounts)

${renderList(hiddenNotInMetro)}
`;
    writeFileSync(mdPath, md);
    console.log(`[refresh-role-tags] wrote ${mdPath}`);

    if (apply) {
      await client.query("commit");
      console.log("\n[refresh-role-tags] COMMITTED");
    } else {
      await client.query("rollback");
      console.log("\n[refresh-role-tags] DRY RUN -- rolled back (no account_tags write occurred; enum was also never touched)");
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
