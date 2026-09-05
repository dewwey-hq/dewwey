/**
 * Read-only intra-batch duplicate check for the Jeremy wedding-creation mission
 * (docs/engineering/graph-strengthening/jeremy-wedding-creation.md). No writes.
 *
 * Before creating any new `weddings` row from the 447 unmatched candidates (venue has
 * zero existing Ben weddings), checks whether any TWO of those 447 candidates are
 * actually the same real wedding that failed to cluster together (D022's known
 * clustering-order-dependence bug) — creating two new rows for one real event would be
 * worse than the problem this mission is trying to solve.
 *
 * Same comparison rule as Ben's own `phase_dedup()`: vendor-set Jaccard > 0.5 within a
 * 21-day date window. Pairwise in-memory (447 candidates, ~100k pairs — trivial to
 * compute without per-pair DB round trips).
 *
 * Usage (from apps/web): bun run scripts/graph/checkIntraBatchDuplicates.ts
 */
import { getPool, closePool } from "../classify/db";

const JACCARD_THRESHOLD = 0.5;
const DATE_WINDOW_DAYS = 21;

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function main() {
  const pool = getPool();

  const { rows: candidates } = await pool.query<{
    id: number;
    venue_account_id: number;
    event_date_est: string | null;
  }>(`
    select c.id::int, c.venue_account_id::int, c.event_date_est::text
    from jeremy_wedding_candidates c
    join jeremy_wedding_candidate_reconciliation r
      on r.candidate_id = c.id and r.reconciliation_version = 'reconcile-v2'
    where r.matched_wedding_id is null
      and c.venue_account_id is not null
      and not exists (select 1 from weddings w where w.venue_id = c.venue_account_id)
  `);

  const { rows: vendorRows } = await pool.query<{ candidate_id: number; account_id: number; role: string }>(
    `select candidate_id::int, account_id::int, role from jeremy_wedding_candidate_vendors
     where candidate_id = any($1::bigint[])`,
    [candidates.map((c) => c.id)]
  );
  const vendorsByCandidate = new Map<number, Set<string>>();
  for (const r of vendorRows) {
    if (!vendorsByCandidate.has(r.candidate_id)) vendorsByCandidate.set(r.candidate_id, new Set());
    vendorsByCandidate.get(r.candidate_id)!.add(`${r.account_id}:${r.role}`);
  }

  console.log(`[dup-check] candidates in scope (447 expected): ${candidates.length}`);

  // Group by venue first -- a duplicate can only exist between two candidates at the SAME
  // venue (different venues can never be the same real wedding).
  const byVenue = new Map<number, typeof candidates>();
  for (const c of candidates) {
    if (!byVenue.has(c.venue_account_id)) byVenue.set(c.venue_account_id, []);
    byVenue.get(c.venue_account_id)!.push(c);
  }

  let pairsChecked = 0;
  const suspectedDuplicates: { a: number; b: number; venue: number; jac: number; dateDelta: number | null }[] = [];

  for (const group of byVenue.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairsChecked++;
        const a = group[i];
        const b = group[j];
        const dateDelta =
          a.event_date_est && b.event_date_est
            ? Math.abs(new Date(a.event_date_est).getTime() - new Date(b.event_date_est).getTime()) / (1000 * 60 * 60 * 24)
            : null;
        const jac = jaccard(vendorsByCandidate.get(a.id) ?? new Set(), vendorsByCandidate.get(b.id) ?? new Set());
        if (jac > JACCARD_THRESHOLD && dateDelta !== null && dateDelta <= DATE_WINDOW_DAYS) {
          suspectedDuplicates.push({ a: a.id, b: b.id, venue: a.venue_account_id, jac, dateDelta });
        }
      }
    }
  }

  console.log(`[dup-check] venues with 2+ in-scope candidates: ${[...byVenue.values()].filter((g) => g.length > 1).length}`);
  console.log(`[dup-check] pairs checked: ${pairsChecked}`);
  console.log(`[dup-check] suspected intra-batch duplicates (jaccard>${JACCARD_THRESHOLD}, within ${DATE_WINDOW_DAYS}d): ${suspectedDuplicates.length}`);
  for (const d of suspectedDuplicates) {
    console.log(`  venue=${d.venue} candidates=${d.a},${d.b} jaccard=${d.jac.toFixed(3)} date_delta=${d.dateDelta}d`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
