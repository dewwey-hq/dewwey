/**
 * Read-only intra-batch duplicate check for the "venuelogic co-tag" recovery batch
 * (D047 follow-on, 2026-09-06, docs/decisions.md). Same comparison rule as
 * checkIntraBatchDuplicates.ts (vendor-set Jaccard > 0.5 within a 21-day date window),
 * scoped by an explicit candidate-ID list rather than an account-ID/tier filter, since this
 * population is defined by a specific double-venue-tag PATTERN (candidate has exactly
 * {X, venuelogic} as its venue-role evidence), not by venue or clustering_version.
 *
 * Background: Tier 1/2/3's systematic double-venue-tag filter excluded any candidate whose
 * posts credit 2+ distinct accounts with role='venue', to guard against genuine ambiguity
 * (which venue did this actually happen at?). Hand-reading 6/6 sampled candidates at
 * bridgeportartcenter and rockwellontheriver found the SAME clean, unambiguous pattern every
 * time: "Venue: @<real venue>" + "Venue Management & Bar: @venuelogic" -- venuelogic is a
 * hospitality/event-management company operating both venues' bar service, not a competing
 * venue claim. 160 candidates match this exact {X, venuelogic} pair (85 bridgeportartcenter,
 * 75 rockwellontheriver) and were never created or matched to an existing Ben wedding
 * (reconcile-v2, matched_wedding_id IS NULL) -- this script checks them for intra-batch
 * duplicates before any creation.
 *
 * Usage (from apps/web): bun run scripts/graph/checkVenueLogicCoTagDuplicates.ts
 */
import { getPool, closePool } from "../classify/db";

const JACCARD_THRESHOLD = 0.5;
const DATE_WINDOW_DAYS = 21;

const BRIDGEPORTARTCENTER_IDS = [
  438, 444, 453, 458, 459, 492, 497, 504, 508, 515, 530, 536, 555, 576, 583, 601, 604, 612, 633,
  653, 664, 669, 681, 693, 700, 709, 716, 718, 729, 746, 752, 758, 759, 766, 768, 792, 826, 830,
  836, 873, 886, 895, 909, 1001, 1073, 1113, 1135, 1146, 1169, 1200, 1225, 1251, 1269, 1375, 1426,
  1442, 1460, 1529, 1573, 1604, 1624, 1736, 1755, 1849, 1892, 1901, 2010, 2027, 2032, 2035, 2039,
  2049, 2091, 2136, 2149, 2164, 2221, 2307, 2353, 2436, 2594, 2915, 2918, 2923, 2993,
];
const ROCKWELLONTHERIVER_IDS = [
  46, 86, 264, 289, 301, 310, 332, 336, 352, 423, 431, 437, 441, 457, 467, 471, 505, 514, 520,
  527, 529, 556, 570, 572, 578, 586, 608, 617, 651, 670, 671, 684, 688, 713, 727, 731, 735, 739,
  760, 775, 791, 845, 902, 982, 1003, 1060, 1071, 1112, 1141, 1153, 1168, 1194, 1203, 1256, 1416,
  1431, 1534, 1627, 1645, 1679, 1791, 1913, 1942, 2024, 2042, 2087, 2106, 2420, 2482, 2687, 2719,
  2869, 2904, 2905, 2928,
];
export const CANDIDATE_IDS = [...BRIDGEPORTARTCENTER_IDS, ...ROCKWELLONTHERIVER_IDS];

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
  }>(
    `select c.id::int, c.venue_account_id::int, c.event_date_est::text
     from jeremy_wedding_candidates c
     join jeremy_wedding_candidate_reconciliation r
       on r.candidate_id = c.id and r.reconciliation_version = 'reconcile-v2'
     where r.matched_wedding_id is null
       and not exists (select 1 from jeremy_weddings_created j where j.candidate_id = c.id)
       and c.id = any($1::bigint[])`,
    [CANDIDATE_IDS]
  );

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

  console.log(`[dup-check] venuelogic-cotag scope: ${candidates.length} candidates (expected ${CANDIDATE_IDS.length})`);

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
