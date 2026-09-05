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
  // --phase1 scopes to the is-chicago-for-new-venues mission's Phase 1 pool: venue resolves
  // via existing, trustworthy vendors.city='Chicago' data, AND (added after the 2026-09-05
  // hand-read pilot found venue_account_id can itself be wrong -- a lighting company, a
  // musician, a mislabeled planner) has a corroborating account_tags role in
  // venue/hotel/catering/rentals -- real venues are legitimately often also tagged
  // hotel/catering/rentals (a hotel or restaurant-group venue), so this isn't requiring an
  // exact 'venue' tag, just some venue-shaped evidence.
  const phase1 = process.argv.includes("--phase1");
  const PHASE1_FILTER = `
    and exists (select 1 from vendors v where v.account_id = c.venue_account_id and v.city = 'Chicago')
    and exists (select 1 from account_tags at2 where at2.account_id = c.venue_account_id and at2.role in ('venue','hotel','catering','rentals'))
  `;

  // --phase2 scopes to the is-chicago-for-new-venues mission's Phase 2 pool: the 99 venue
  // accounts D039 confirmed via WebSearch as real Chicago-metro locations. Scoped by an
  // explicit ID list (not `account_locations.source='websearch'`) because the backfill
  // write hasn't landed in the DB yet as of this check -- see mission doc.
  const phase2 = process.argv.includes("--phase2");
  const PHASE2_ACCOUNT_IDS = [
    1438, 2857, 4208, 6059, 7033, 7893, 8024, 8478, 8791, 9829, 11283, 19471, 20812, 3088,
    4641, 18240, 18283, 18370, 18466, 18489, 18490, 18508, 18543, 18606, 18621, 18631, 18676,
    18712, 18759, 18793, 18849, 18863, 18865, 18869, 18877, 18892, 18940, 18945, 18975, 19183,
    19194, 19224, 19260, 19286, 19288, 19292, 19310, 19353, 19354, 19446, 19482, 19535, 19539,
    19603, 19612, 19628, 19637, 19704, 19812, 19890, 19931, 20346, 20377, 20504, 20545, 20574,
    20581, 20593, 20679, 20680, 20694, 20755, 20792, 20805, 20819, 20911, 20978, 20979, 21019,
    21020, 21147, 21161, 21169, 21174, 21178, 21185, 21186, 21192, 21195, 21196, 21197, 21286,
    21305, 21307, 21319, 21342, 21343, 21348, 21416,
  ];

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
      ${phase1 ? PHASE1_FILTER : ""}
      ${phase2 ? "and c.venue_account_id = any($1::bigint[])" : ""}
  `, phase2 ? [PHASE2_ACCOUNT_IDS] : []);

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

  console.log(`[dup-check] ${phase2 ? "Phase 2 (websearch-confirmed)" : phase1 ? "Phase 1 (city+venue-role filtered)" : "full"} scope: ${candidates.length} candidates`);

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
