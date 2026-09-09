/**
 * Pre-step for the D055 "squeeze the 47k" structural_post_vendor_evidence source (Phase 0 step
 * 5): every evidence view in this project (jeremy_post_vendor_evidence and its siblings, and
 * now structural_post_vendor_evidence) joins `accounts` by handle, so a credit to a handle the
 * graph has never seen is silently dropped -- not surfaced as a gap, just absent. The ungated
 * parser run (runStackParserBaseline.ts --ungated, stack-parser-ts-v7, 41k posts) surfaced
 * ~1,000 never-seen VENUE handles alone (8,174 across all roles) that this join would otherwise
 * throw away. This mirrors pipeline.py's acct_id() (mint a bare account row on first sight,
 * enrich later) and D050 Track 2.2's placeholder-row precedent -- it inserts nothing but
 * `accounts(username)`; profile enrichment, role tagging, and location resolution all stay
 * separate, later steps, exactly as they are for every other account in this table.
 *
 * Scope: distinct stack_extraction_entries.handle at the latest parser version (max
 * stack_parser_version in stack_extraction_runs, same "latest" definition
 * venue_couple_signal_post_vendor_evidence uses) with role <> 'other', that has no existing
 * `accounts` row (case-insensitive -- accounts.username is citext). Handles are validated
 * against the same shape Instagram itself enforces (`^[a-z0-9._]{2,30}$`, already-lowercased)
 * before insert; anything else is skipped and counted, never inserted blind. `on conflict
 * (username) do nothing` makes this idempotent against both a rerun and a race with any other
 * process minting the same handle.
 *
 * --dry-run (or no flag -- see below): prints the count of would-be-inserted handles by role
 * plus 30 sample handles, writes nothing.
 * Real mode: inserts inside a single transaction, prints the inserted count.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/upsertAccountsForStackHandles.ts             # same as --dry-run
 *   bun run scripts/graph/upsertAccountsForStackHandles.ts --dry-run
 *   bun run scripts/graph/upsertAccountsForStackHandles.ts --apply     # actually inserts
 */
import { getPool, closePool } from "../classify/db";

const HANDLE_SHAPE = /^[a-z0-9._]{2,30}$/;

interface NeverSeenRow {
  handle: string;
  role: string;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  // One row per (handle, role) -- a handle can be credited under more than one role across
  // the corpus; we only need distinct handles to insert, but report by role for visibility.
  const { rows } = await pool.query<NeverSeenRow>(
    `select distinct se.handle, se.role
     from stack_extraction_entries se
     left join accounts a on lower(a.username::text) = se.handle
     where se.stack_parser_version = (select max(stack_parser_version) from stack_extraction_runs)
       and se.role <> 'other'
       and a.id is null`
  );

  const handleRoles = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!handleRoles.has(r.handle)) handleRoles.set(r.handle, new Set());
    handleRoles.get(r.handle)!.add(r.role);
  }

  const validHandles: string[] = [];
  const invalidHandles: string[] = [];
  for (const h of handleRoles.keys()) {
    (HANDLE_SHAPE.test(h) ? validHandles : invalidHandles).push(h);
  }

  // Count by role (a handle counts once per role it was credited under, for visibility only --
  // the actual insert below is one row per distinct handle regardless of role count).
  const countByRole = new Map<string, number>();
  for (const r of rows) {
    if (!HANDLE_SHAPE.test(r.handle)) continue;
    countByRole.set(r.role, (countByRole.get(r.role) ?? 0) + 1);
  }

  console.log(
    `[upsert-stack-handles] never-seen handles: ${handleRoles.size} distinct (valid=${validHandles.length}, invalid-shape=${invalidHandles.length})`
  );
  console.log(`[upsert-stack-handles] valid, never-seen handles by role:`);
  for (const [role, n] of [...countByRole.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role}: ${n}`);
  }
  if (invalidHandles.length > 0) {
    console.log(`[upsert-stack-handles] invalid-shape handles (skipped, never inserted): ${invalidHandles.slice(0, 10).join(", ")}`);
  }

  if (!apply) {
    const sample = validHandles.slice(0, 30);
    console.log(`[upsert-stack-handles] DRY RUN (pass --apply to insert) -- would insert ${validHandles.length} accounts. Sample (30):`);
    for (const h of sample) console.log(`  @${h}`);
    await closePool();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    let inserted = 0;
    for (const h of validHandles) {
      const { rowCount } = await client.query(
        `insert into accounts (username) values ($1) on conflict (username) do nothing`,
        [h]
      );
      inserted += rowCount ?? 0;
    }
    await client.query("commit");
    console.log(`[upsert-stack-handles] COMMITTED -- inserted ${inserted} of ${validHandles.length} candidate accounts`);
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
