/**
 * D056 coverage-audit follow-up: two `weddings` rows for the SAME real wedding got created
 * separately (different crawl passes / different posts never cross-referenced) and never
 * merged. This script finds and merges those duplicate pairs.
 *
 * Candidate pair = two weddings whose venue_id (alias-resolved through `account_aliases`, so
 * an alias/canonical pair count as "the same venue") is the SAME, AND either:
 *   (a) they share a `wedding_participants.account_id` (a bride/groom/couple account credited
 *       on both), or
 *   (b) they share a normalized couple name pulled from `post_extraction_runs.result->>
 *       'couple_names'` on their posts -- see weddingMaintenance.ts's
 *       `normalizeCoupleNamePair`/`coupleNamesMatch` for the normalization + why
 *       "caterer+reception"-shaped noise can't false-positive.
 * ... AND their `event_date_est` is within 400 days of each other (every wedding in the table
 * has a non-null event_date_est as of this writing, so this is never a null-date judgment call
 * -- see the guard below regardless).
 *
 * "Never merge two weddings that both carry human THIS_VENUE verdicts on DIFFERENT venue
 * accounts" is checked explicitly below even though, given the same-venue precondition above,
 * it should structurally never fire -- the spec calls this out as "can't be; skip if venue
 * differs" and this script treats a firing as a bug worth aborting loudly on rather than
 * silently trusting the precondition.
 *
 * Merge = survivor is the LOWER id. Every table with a real FK to `weddings.id` is discovered
 * at runtime from `information_schema` and checked against the hardcoded list this script knows
 * how to move (wedding_posts, wedding_vendors, wedding_vendor_credits, wedding_participants,
 * candidate_review_decisions.duplicate_of_wedding_id, post_venue_verdicts.duplicate_of_
 * wedding_id) -- if Postgres reports an FK to weddings this script doesn't recognize, it aborts
 * rather than silently dropping data (see `assertKnownWeddingForeignKeys`). Two more tables are
 * moved even though they carry no formal FK constraint, because the spec names them explicitly:
 * `jeremy_wedding_post_attachments` (wedding_id updated to the survivor) and
 * `jeremy_weddings_created` (the absorbed row is DELETED, not moved -- it's a "candidate X
 * created wedding Y" provenance row, and Y no longer exists after the merge). Pure history/
 * batch-provenance tables that happen to carry a wedding_id column (vendor_role_migrations,
 * wedding_vendor_recredits, account_alias_remaps, non_wedding_posts_retired,
 * orphaned_weddings_retired, stack_reparse_v3_ingested, weddings_retired_batches,
 * jeremy_wedding_vendors_ingested) are deliberately left untouched -- they're a record of what
 * happened at the time, not a live reference to rewrite.
 *
 * Row-level conflict handling on move: `wedding_vendors` (PK wedding_id/account_id/role) keeps
 * `n_confirmations = greatest(existing, incoming)` on conflict; `wedding_vendor_credits` (PK
 * wedding_id/post_id/account_id/role/event_context) and `wedding_participants` (PK
 * wedding_id/account_id/participant_role) both `on conflict do nothing` (the row already exists
 * verbatim under the survivor). `wedding_posts` needs no conflict handling -- post_id is
 * globally UNIQUE, so a post can never appear under both weddings already.
 *
 * Provenance: one `wedding_merges` row per merge, `absorbed_snapshot` jsonb holding the
 * absorbed wedding row plus its (pre-move) wedding_posts/wedding_vendors/wedding_participants
 * rows, so a human can reconstruct the absorbed wedding by hand. See the printed revert
 * APPROACH at the end of an --apply run -- a full automatic revert isn't possible in general
 * (an `on conflict` merge into an existing survivor row can't be un-merged without knowing
 * which contribution was which), so this is a documented manual procedure, not executable SQL,
 * same spirit as recreditManagementCompany.ts's "check those by hand" caveat.
 *
 * A wedding can appear in more than one candidate pair (a chain: A-B and B-C). Pairs are
 * resolved through a union-find over "current survivor" so a chain merges into ONE surviving
 * wedding (the lowest id in the chain) rather than double-processing an already-absorbed id.
 *
 * Same dry-run-by-default, transaction-wrapped shape as the rest of scripts/graph.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/mergeDuplicateWeddings.ts --batch-id d056-dedupe-1              # dry run (default)
 *   bun run scripts/graph/mergeDuplicateWeddings.ts --batch-id d056-dedupe-1 --dry-run    # same, explicit
 *   bun run scripts/graph/mergeDuplicateWeddings.ts --batch-id d056-dedupe-1 --apply      # real write, human only
 */
import { getPool, closePool } from "../classify/db";
import { coupleNamesMatch, normalizeCoupleNamePair, daysBetween } from "./weddingMaintenance";

const MAX_DATE_DIFF_DAYS = 400;

const CREATE_TABLE = `
  create table if not exists wedding_merges (
    id                 bigserial primary key,
    batch_id           text not null,
    survivor_id        bigint not null,
    absorbed_id        bigint not null,
    reason             text not null,
    absorbed_snapshot  jsonb not null,
    created_at         timestamptz default now()
  );`;

// Real FK-to-weddings.id constraints this script knows how to move, as `table:column`. Verified
// live against information_schema on 2026-09-10 -- see assertKnownWeddingForeignKeys.
const KNOWN_WEDDING_FK_COLUMNS = new Set([
  "wedding_posts:wedding_id",
  "wedding_vendors:wedding_id",
  "wedding_vendor_credits:wedding_id",
  "wedding_participants:wedding_id",
  "candidate_review_decisions:duplicate_of_wedding_id",
  "post_venue_verdicts:duplicate_of_wedding_id",
]);

function parseArgs() {
  const argv = process.argv.slice(2);
  const batchIdx = argv.indexOf("--batch-id");
  const batchId = batchIdx !== -1 ? argv[batchIdx + 1] : undefined;
  const apply = argv.includes("--apply");
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[merge-duplicate-weddings] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/graph/mergeDuplicateWeddings.ts --batch-id <id> [--apply]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  return { batchId, apply };
}

interface WeddingRow {
  id: string;
  venue_id: string | null;
  resolved_venue_id: string | null;
  event_date_est: string;
}

interface CandidatePair {
  a: string;
  b: string;
  venueAccountId: string;
  reasons: Set<"participant" | "couple_name">;
}

async function assertKnownWeddingForeignKeys(client: import("pg").PoolClient) {
  const { rows } = await client.query<{ table_name: string; column_name: string }>(
    `select tc.table_name, kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
     join information_schema.constraint_column_usage ccu
       on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
     join information_schema.referential_constraints rc
       on tc.constraint_name = rc.constraint_name and tc.table_schema = rc.constraint_schema
     where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'weddings' and tc.table_schema = 'public'`
  );
  const live = new Set(rows.map((r) => `${r.table_name}:${r.column_name}`));
  const unknown = [...live].filter((k) => !KNOWN_WEDDING_FK_COLUMNS.has(k));
  const missing = [...KNOWN_WEDDING_FK_COLUMNS].filter((k) => !live.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `[merge-duplicate-weddings] REFUSING: information_schema reports FK(s) to weddings.id this ` +
        `script doesn't know how to move: ${unknown.join(", ")}. Extend KNOWN_WEDDING_FK_COLUMNS ` +
        `and the move logic before running again.`
    );
  }
  if (missing.length > 0) {
    console.log(
      `[merge-duplicate-weddings] note: expected FK(s) no longer present (harmless, informational): ${missing.join(", ")}`
    );
  }
}

function pairKey(a: string, b: string): string {
  const [lo, hi] = [a, b].sort((x, y) => Number(x) - Number(y));
  return `${lo}:${hi}`;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(id: string): string {
    if (!this.parent.has(id)) this.parent.set(id, id);
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = id;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string): { survivor: string; absorbed: string } {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return { survivor: ra, absorbed: ra };
    const survivor = Number(ra) < Number(rb) ? ra : rb;
    const absorbed = survivor === ra ? rb : ra;
    this.parent.set(absorbed, survivor);
    return { survivor, absorbed };
  }
}

async function main() {
  const { batchId, apply } = parseArgs();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`[merge-duplicate-weddings] mode: ${apply ? "APPLY (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[merge-duplicate-weddings] batch_id: ${batchId}`);

    await assertKnownWeddingForeignKeys(client);
    // DDL only ever runs on --apply -- dry-run just prints it (never DDL against Supabase from
    // a dry run, even one that rolls back).
    if (apply) {
      await client.query(CREATE_TABLE);
    } else {
      console.log(`[merge-duplicate-weddings] DRY RUN -- would run this DDL on --apply:\n${CREATE_TABLE}`);
    }

    // ------------------------------------------------------------
    // All weddings, venue alias-resolved.
    // ------------------------------------------------------------
    const { rows: weddingRows } = await client.query<WeddingRow>(
      `select w.id::text, w.venue_id::text,
              coalesce(al.canonical_account_id, w.venue_id)::text as resolved_venue_id,
              w.event_date_est::text
       from weddings w
       left join account_aliases al on al.alias_account_id = w.venue_id
       where w.venue_id is not null and w.event_date_est is not null`
    );
    const weddingById = new Map(weddingRows.map((w) => [w.id, w]));
    console.log(`[merge-duplicate-weddings] ${weddingRows.length} weddings have both venue_id and event_date_est`);

    // ------------------------------------------------------------
    // Rule (a): shared wedding_participants.account_id.
    // ------------------------------------------------------------
    const { rows: participantRows } = await client.query<{ wedding_id: string; account_id: string }>(
      `select wedding_id::text, account_id::text from wedding_participants`
    );
    const weddingsByParticipant = new Map<string, string[]>();
    for (const r of participantRows) {
      if (!weddingById.has(r.wedding_id)) continue;
      const list = weddingsByParticipant.get(r.account_id) ?? [];
      list.push(r.wedding_id);
      weddingsByParticipant.set(r.account_id, list);
    }

    // ------------------------------------------------------------
    // Rule (b): shared normalized couple name from post_extraction_runs.
    // ------------------------------------------------------------
    const { rows: coupleRows } = await client.query<{ wedding_id: string; couple_names: string }>(
      `select distinct wp.wedding_id::text, per.result->>'couple_names' as couple_names
       from wedding_posts wp
       join posts p on p.id = wp.post_id
       join post_extraction_runs per on per.post_url = p.url
       where per.result->>'couple_names' is not null and per.result->>'couple_names' <> ''`
    );
    const weddingsByNormalizedCouple = new Map<string, string[]>();
    for (const r of coupleRows) {
      if (!weddingById.has(r.wedding_id)) continue;
      const key = normalizeCoupleNamePair(r.couple_names);
      if (!key) continue;
      const list = weddingsByNormalizedCouple.get(key) ?? [];
      if (!list.includes(r.wedding_id)) list.push(r.wedding_id);
      weddingsByNormalizedCouple.set(key, list);
    }

    // ------------------------------------------------------------
    // Build candidate pairs: same resolved venue, date within 400 days, dedup by pairKey.
    // ------------------------------------------------------------
    const pairs = new Map<string, CandidatePair>();
    function considerGroup(ids: string[], reason: "participant" | "couple_name") {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const wa = weddingById.get(ids[i])!;
          const wb = weddingById.get(ids[j])!;
          if (!wa.resolved_venue_id || wa.resolved_venue_id !== wb.resolved_venue_id) continue;
          if (daysBetween(wa.event_date_est, wb.event_date_est) > MAX_DATE_DIFF_DAYS) continue;
          const key = pairKey(wa.id, wb.id);
          const existing = pairs.get(key);
          if (existing) {
            existing.reasons.add(reason);
          } else {
            pairs.set(key, { a: wa.id, b: wb.id, venueAccountId: wa.resolved_venue_id, reasons: new Set([reason]) });
          }
        }
      }
    }
    for (const ids of weddingsByParticipant.values()) if (ids.length > 1) considerGroup(ids, "participant");
    for (const ids of weddingsByNormalizedCouple.values()) if (ids.length > 1) considerGroup(ids, "couple_name");

    console.log(`[merge-duplicate-weddings] candidate pairs found: ${pairs.size}`);

    // ------------------------------------------------------------
    // Paranoia check: both weddings carry human THIS_VENUE verdicts on DIFFERENT venue
    // accounts. Structurally shouldn't happen (candidate pairs already require the same
    // resolved venue) -- abort loudly rather than merge if it ever does.
    // ------------------------------------------------------------
    const allCandidateIds = [...new Set([...pairs.values()].flatMap((p) => [p.a, p.b]))];
    const { rows: verdictRows } = await client.query<{ wedding_id: string; venue_account_id: string | null }>(
      `select distinct wp.wedding_id::text, v.venue_account_id::text
       from wedding_posts wp
       join posts p on p.id = wp.post_id
       join post_venue_verdicts_current v on v.post_url = p.url
       where wp.wedding_id = any($1::bigint[]) and v.verdict = 'THIS_VENUE' and v.venue_account_id is not null`,
      [allCandidateIds]
    );
    const verdictVenuesByWedding = new Map<string, Set<string>>();
    for (const r of verdictRows) {
      const set = verdictVenuesByWedding.get(r.wedding_id) ?? new Set<string>();
      set.add(r.venue_account_id!);
      verdictVenuesByWedding.set(r.wedding_id, set);
    }

    // ------------------------------------------------------------
    // Captions + usernames for the report.
    // ------------------------------------------------------------
    const { rows: captionRows } = await client.query<{ wedding_id: string; caption: string | null }>(
      `select distinct on (wp.wedding_id) wp.wedding_id::text, p.caption
       from wedding_posts wp
       join posts p on p.id = wp.post_id
       where wp.wedding_id = any($1::bigint[])
       order by wp.wedding_id, p.posted_at asc`,
      [allCandidateIds]
    );
    const captionByWedding = new Map(
      captionRows.map((r) => [r.wedding_id, (r.caption ?? "").split("\n")[0].slice(0, 80)])
    );
    const venueIds = [...new Set([...pairs.values()].map((p) => p.venueAccountId))];
    const { rows: usernameRows } = await client.query<{ id: string; username: string }>(
      `select id::text, username::text from accounts where id = any($1::bigint[])`,
      [venueIds]
    );
    const usernameById = new Map(usernameRows.map((r) => [r.id, r.username]));

    // ------------------------------------------------------------
    // Report every candidate pair (dry-run and apply both print this, per spec).
    // ------------------------------------------------------------
    const reasonTotals: Record<string, number> = {};
    const sortedPairs = [...pairs.values()].sort((x, y) => Number(x.a) - Number(y.a) || Number(x.b) - Number(y.b));
    console.log(`\n[merge-duplicate-weddings] candidate pairs:`);
    for (const pair of sortedPairs) {
      const reasonLabel = [...pair.reasons].sort().join("+");
      reasonTotals[reasonLabel] = (reasonTotals[reasonLabel] ?? 0) + 1;
      const wa = weddingById.get(pair.a)!;
      const wb = weddingById.get(pair.b)!;
      const venueName = usernameById.get(pair.venueAccountId) ?? pair.venueAccountId;
      console.log(
        `  (${pair.a}, ${pair.b}) venue=@${venueName} dates=${wa.event_date_est}/${wb.event_date_est} reason=${reasonLabel}\n` +
          `    ${pair.a}: "${captionByWedding.get(pair.a) ?? ""}"\n` +
          `    ${pair.b}: "${captionByWedding.get(pair.b) ?? ""}"`
      );
    }
    console.log(`\n[merge-duplicate-weddings] totals by reason:`);
    for (const [reason, count] of Object.entries(reasonTotals).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }

    // ------------------------------------------------------------
    // Resolve chains with union-find, skip conflicting-verdict pairs, then (if --apply) merge.
    // ------------------------------------------------------------
    const uf = new UnionFind();
    let skippedConflictingVerdicts = 0;
    let merged = 0;

    for (const pair of sortedPairs) {
      const rootA = uf.find(pair.a);
      const rootB = uf.find(pair.b);
      if (rootA === rootB) continue; // already merged via a chain

      const verdictsA = verdictVenuesByWedding.get(rootA);
      const verdictsB = verdictVenuesByWedding.get(rootB);
      if (verdictsA && verdictsB && [...verdictsA].every((v) => !verdictsB.has(v))) {
        console.log(
          `[merge-duplicate-weddings] SKIPPING (${pair.a}, ${pair.b}): both carry human THIS_VENUE ` +
            `verdicts on different venue accounts (${[...verdictsA].join(",")} vs ${[...verdictsB].join(",")})`
        );
        skippedConflictingVerdicts++;
        continue;
      }

      const { survivor, absorbed } = uf.union(rootA, rootB);
      // Fold the absorbed root's verdict-venue set into the survivor's so a later pair in the
      // same chain still sees every human verdict collected so far, not just the survivor's own.
      const combinedVerdicts = new Set([...(verdictsA ?? []), ...(verdictsB ?? [])]);
      if (combinedVerdicts.size > 0) verdictVenuesByWedding.set(survivor, combinedVerdicts);
      merged++;

      if (apply) {
        await mergeWeddings(client, batchId, survivor, absorbed, [...pair.reasons].sort().join("+"));
      } else {
        console.log(`[merge-duplicate-weddings] would merge: survivor=${survivor} absorbs=${absorbed}`);
      }
    }

    console.log(
      `\n[merge-duplicate-weddings] merges ${apply ? "applied" : "that would be applied"}: ${merged}, ` +
        `skipped (conflicting human verdicts): ${skippedConflictingVerdicts}`
    );

    if (apply) {
      console.log(
        `\n[merge-duplicate-weddings] revert APPROACH (manual, no single executable statement -- see\n` +
          `this script's header for why): for each row in wedding_merges where batch_id = '${batchId}',\n` +
          `  1. re-insert a weddings row using absorbed_snapshot->'wedding' (same id if it's still free);\n` +
          `  2. re-insert absorbed_snapshot->'wedding_posts' rows (repointing wedding_id back);\n` +
          `  3. re-insert absorbed_snapshot->'wedding_vendors' rows -- NOTE if the survivor's row for\n` +
          `     the same (account_id, role) had a LOWER n_confirmations than the absorbed row, the\n` +
          `     merge bumped it via greatest() and that bump can't be cleanly subtracted back out;\n` +
          `  4. re-insert absorbed_snapshot->'wedding_participants' rows;\n` +
          `  5. wedding_vendor_credits, jeremy_wedding_post_attachments, candidate_review_decisions.\n` +
          `     duplicate_of_wedding_id and post_venue_verdicts.duplicate_of_wedding_id rows that moved\n` +
          `     to the survivor are NOT separately snapshotted (they're re-derivable from post_url /\n` +
          `     already-idempotent parser reruns) -- re-run the relevant ingest step for the absorbed\n` +
          `     wedding's posts after step 1-2 restore it, rather than hand-editing those tables;\n` +
          `  6. delete wedding_merges rows for the batch once done.`
      );
      await client.query("commit");
      console.log("\n[merge-duplicate-weddings] COMMITTED");
    } else {
      await client.query("rollback");
      console.log("\n[merge-duplicate-weddings] DRY RUN -- rolled back, no changes committed");
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

async function mergeWeddings(
  client: import("pg").PoolClient,
  batchId: string,
  survivorId: string,
  absorbedId: string,
  reason: string
) {
  // Snapshot BEFORE any move.
  const { rows: weddingSnap } = await client.query(`select * from weddings where id = $1`, [absorbedId]);
  const { rows: postsSnap } = await client.query(`select * from wedding_posts where wedding_id = $1`, [absorbedId]);
  const { rows: vendorsSnap } = await client.query(`select * from wedding_vendors where wedding_id = $1`, [absorbedId]);
  const { rows: participantsSnap } = await client.query(
    `select * from wedding_participants where wedding_id = $1`,
    [absorbedId]
  );
  const snapshot = {
    wedding: weddingSnap[0] ?? null,
    wedding_posts: postsSnap,
    wedding_vendors: vendorsSnap,
    wedding_participants: participantsSnap,
  };

  await client.query(
    `insert into wedding_merges (batch_id, survivor_id, absorbed_id, reason, absorbed_snapshot)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [batchId, survivorId, absorbedId, reason, JSON.stringify(snapshot)]
  );

  // wedding_posts: post_id is globally unique -> plain move, no conflict possible.
  await client.query(`update wedding_posts set wedding_id = $1 where wedding_id = $2`, [survivorId, absorbedId]);

  // wedding_vendors: keep the greater n_confirmations on conflict.
  await client.query(
    `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
     select $1, account_id, role, n_confirmations from wedding_vendors where wedding_id = $2
     on conflict (wedding_id, account_id, role)
     do update set n_confirmations = greatest(wedding_vendors.n_confirmations, excluded.n_confirmations)`,
    [survivorId, absorbedId]
  );
  await client.query(`delete from wedding_vendors where wedding_id = $1`, [absorbedId]);

  // wedding_vendor_credits: on conflict do nothing (identical row already exists).
  await client.query(
    `insert into wedding_vendor_credits
       (wedding_id, post_id, account_id, role, event_context, label_raw, source, parser_version, created_at)
     select $1, post_id, account_id, role, event_context, label_raw, source, parser_version, created_at
     from wedding_vendor_credits where wedding_id = $2
     on conflict (wedding_id, post_id, account_id, role, event_context) do nothing`,
    [survivorId, absorbedId]
  );
  await client.query(`delete from wedding_vendor_credits where wedding_id = $1`, [absorbedId]);

  // wedding_participants: on conflict do nothing.
  await client.query(
    `insert into wedding_participants (wedding_id, account_id, participant_role, source, created_at)
     select $1, account_id, participant_role, source, created_at
     from wedding_participants where wedding_id = $2
     on conflict (wedding_id, account_id, participant_role) do nothing`,
    [survivorId, absorbedId]
  );
  await client.query(`delete from wedding_participants where wedding_id = $1`, [absorbedId]);

  // The two duplicate_of_wedding_id FK columns -- simple repoint, no PK/unique conflict risk.
  await client.query(`update candidate_review_decisions set duplicate_of_wedding_id = $1 where duplicate_of_wedding_id = $2`, [
    survivorId,
    absorbedId,
  ]);
  await client.query(`update post_venue_verdicts set duplicate_of_wedding_id = $1 where duplicate_of_wedding_id = $2`, [
    survivorId,
    absorbedId,
  ]);

  // Named explicitly by the spec: no formal FK, but a live wedding_id reference.
  await client.query(`update jeremy_wedding_post_attachments set wedding_id = $1 where wedding_id = $2`, [
    survivorId,
    absorbedId,
  ]);
  await client.query(`delete from jeremy_weddings_created where wedding_id = $1`, [absorbedId]);

  await client.query(`delete from weddings where id = $1`, [absorbedId]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
