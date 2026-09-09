/**
 * Read-only secondary-account duplicate check for the Jeremy wedding-creation mission
 * (docs/engineering/graph-strengthening/jeremy-wedding-creation.md). No writes.
 *
 * The intra-batch check (checkIntraBatchDuplicates.ts) only compares the 447 candidates
 * against EACH OTHER. This checks them against Ben's EXISTING weddings using the
 * candidate's FULL vendor set (every extracted account/role, not just the resolved
 * `venue_account_id`) — because the pilot found real cases where a candidate's anchor
 * venue has zero Ben weddings, but a SECONDARY account it also mentions (a reception venue
 * when the anchor is the ceremony church, a sibling venue-brand account) might already
 * have an existing Ben wedding this candidate should match instead of needing creation.
 *
 * Same comparison rule as `phase_dedup()`/`runJeremyWeddingReconciliation.ts`: vendor-set
 * Jaccard > 0.5 within a 21-day date window — but computed against ANY Ben wedding that
 * shares at least one vendor account with the candidate, not gated on venue match.
 *
 * Usage (from apps/web): bun run scripts/graph/checkExistingDuplicatesForCreation.ts
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
  // venue/hotel/catering/rentals. D055 (2026-09-08): vendors.city defaults to 'Chicago' on
  // every row (docs/jeremy-ddl.sql) -- only trust it here when discovery_source='google_places'.
  const phase1 = process.argv.includes("--phase1");
  const PHASE1_FILTER = `
    and exists (select 1 from vendors v where v.account_id = c.venue_account_id and v.city = 'Chicago' and v.discovery_source = 'google_places')
    and exists (select 1 from account_tags at2 where at2.account_id = c.venue_account_id and at2.role in ('venue','hotel','catering','rentals'))
  `;

  // --phase2: the 99 venue accounts D039 confirmed via WebSearch (see
  // checkIntraBatchDuplicates.ts for why this is an explicit ID list, not a DB-column scope).
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

  // --batch5: "v1 data completion, venues-first" mission (D046 follow-on, 2026-09-06) --
  // 33 venue accounts confirmed Chicago-metro via WebSearch (backfillVenueLocationsViaWebSearch.ts
  // Batch 5), from a fresh 252-account pool distinct from Phase 1/2's 447-candidate scope.
  const batch5 = process.argv.includes("--batch5");
  const BATCH5_ACCOUNT_IDS = [
    2864, 7581, 4188, 6260, 3564, 7038, 8324, 1303, 4904, 4994, 4151, 1645, 1526, 8124, 11109,
    8163, 8952, 6634, 5809, 6304, 4355, 4207, 4386, 3813, 3808, 1480, 2764, 2761, 2757, 2753,
    2738, 2734, 2697,
    // Batch 6 (2026-09-06), appended to the same allowlist -- same mechanism, no new flag needed.
    4245, 4638, 4610, 2576, 5115, 5741, 5544, 5079, 6129, 3407, 4600,
  ];

  // --venue-couple-signal: D047 follow-on (2026-09-06) -- see checkIntraBatchDuplicates.ts's
  // comment. Scoped by clustering_version, no account-ID list needed.
  const venueCoupleSignal = process.argv.includes("--venue-couple-signal");

  // --tier1/--tier2/--tier3: see checkIntraBatchDuplicates.ts's comment -- the full
  // system-wide unmatched/uncreated pool, tiered by candidates-per-venue.
  const tier1 = process.argv.includes("--tier1");
  const tier2 = process.argv.includes("--tier2");
  const tier3 = process.argv.includes("--tier3");
  const TIER_BASE = `
    select c2.venue_account_id
    from jeremy_wedding_candidates c2
    join jeremy_wedding_candidate_reconciliation r2
      on r2.candidate_id = c2.id and r2.reconciliation_version = 'reconcile-v2'
    where r2.matched_wedding_id is null
      and c2.venue_account_id is not null
      and c2.clustering_version <> 'venue-couple-signal-v1'
      and not exists (select 1 from jeremy_weddings_created j2 where j2.candidate_id = c2.id)
    group by c2.venue_account_id
  `;
  const TIER_FILTER = tier1
    ? `and c.venue_account_id in (${TIER_BASE} having count(*) between 1 and 4)`
    : tier2
      ? `and c.venue_account_id in (${TIER_BASE} having count(*) between 5 and 14)`
      : tier3
        ? `and c.venue_account_id in (${TIER_BASE} having count(*) >= 15)`
        : "";

  const { rows: candidates } = await pool.query<{ id: number; event_date_est: string | null }>(`
    select c.id::int, c.event_date_est::text
    from jeremy_wedding_candidates c
    join jeremy_wedding_candidate_reconciliation r
      on r.candidate_id = c.id and r.reconciliation_version = 'reconcile-v2'
    where r.matched_wedding_id is null
      and c.venue_account_id is not null
      and not exists (select 1 from jeremy_weddings_created j where j.candidate_id = c.id)
      -- batch5/venue-couple-signal/tierN deliberately drop the "venue has zero existing
      -- weddings" pre-filter -- see checkIntraBatchDuplicates.ts's comment and
      -- docs/decisions.md D047. This script's own cross-wedding Jaccard check below is the
      -- actual duplicate protection either way.
      ${batch5 || venueCoupleSignal || tier1 || tier2 || tier3 ? "" : "and not exists (select 1 from weddings w where w.venue_id = c.venue_account_id)"}
      ${phase1 ? PHASE1_FILTER : ""}
      ${phase2 ? "and c.venue_account_id = any($1::bigint[])" : ""}
      ${batch5 ? "and c.venue_account_id = any($1::bigint[])" : ""}
      ${venueCoupleSignal ? "and c.clustering_version = 'venue-couple-signal-v1'" : ""}
      ${tier1 || tier2 || tier3 ? `and c.clustering_version <> 'venue-couple-signal-v1' ${TIER_FILTER}` : ""}
  `, phase2 ? [PHASE2_ACCOUNT_IDS] : batch5 ? [BATCH5_ACCOUNT_IDS] : []);
  console.log(`[existing-dup-check] ${tier1 ? "Tier 1 (1-4 candidates/venue)" : tier2 ? "Tier 2 (5-14 candidates/venue)" : tier3 ? "Tier 3 (15+ candidates/venue)" : venueCoupleSignal ? "venue-couple-signal (D047)" : batch5 ? "Batch 5 (v1 venues-first, websearch-confirmed)" : phase2 ? "Phase 2 (websearch-confirmed)" : phase1 ? "Phase 1 (city+venue-role filtered)" : "full"} scope: ${candidates.length} candidates`);

  const { rows: candVendorRows } = await pool.query<{ candidate_id: number; account_id: number; role: string }>(
    `select candidate_id::int, account_id::int, role from jeremy_wedding_candidate_vendors
     where candidate_id = any($1::bigint[])`,
    [candidates.map((c) => c.id)]
  );
  const candVendors = new Map<number, Set<string>>();
  const candAccountIds = new Map<number, Set<number>>();
  for (const r of candVendorRows) {
    if (!candVendors.has(r.candidate_id)) {
      candVendors.set(r.candidate_id, new Set());
      candAccountIds.set(r.candidate_id, new Set());
    }
    candVendors.get(r.candidate_id)!.add(`${r.account_id}:${r.role}`);
    candAccountIds.get(r.candidate_id)!.add(r.account_id);
  }

  const allCandidateAccounts = [...new Set(candVendorRows.map((r) => r.account_id))];
  const { rows: sharedWeddingRows } = await pool.query<{
    wedding_id: number;
    event_date_est: string | null;
  }>(
    `select distinct w.id as wedding_id, w.event_date_est::text
     from weddings w
     join wedding_vendors wv on wv.wedding_id = w.id
     where wv.account_id = any($1::bigint[])`,
    [allCandidateAccounts]
  );
  const { rows: wvRows } = await pool.query<{ wedding_id: number; account_id: number; role: string }>(
    `select wedding_id, account_id, role::text as role from wedding_vendors
     where wedding_id = any($1::bigint[])`,
    [sharedWeddingRows.map((w) => w.wedding_id)]
  );
  const weddingVendors = new Map<number, Set<string>>();
  const weddingAccountIds = new Map<number, Set<number>>();
  for (const r of wvRows) {
    if (!weddingVendors.has(r.wedding_id)) {
      weddingVendors.set(r.wedding_id, new Set());
      weddingAccountIds.set(r.wedding_id, new Set());
    }
    weddingVendors.get(r.wedding_id)!.add(`${r.account_id}:${r.role}`);
    weddingAccountIds.get(r.wedding_id)!.add(r.account_id);
  }
  const weddingDates = new Map<number, string | null>(sharedWeddingRows.map((w) => [w.wedding_id, w.event_date_est]));

  let flagged = 0;
  let clean = 0;
  const flaggedDetails: { candidateId: number; weddingId: number; jac: number; dateDelta: number }[] = [];

  for (const c of candidates) {
    const myAccounts = candAccountIds.get(c.id) ?? new Set();
    const myVendors = candVendors.get(c.id) ?? new Set();
    let candidateFlagged = false;

    for (const [weddingId, weddingAccts] of weddingAccountIds) {
      // Only bother comparing weddings that share at least one vendor account.
      let shares = false;
      for (const acc of myAccounts) {
        if (weddingAccts.has(acc)) {
          shares = true;
          break;
        }
      }
      if (!shares) continue;

      const wDate = weddingDates.get(weddingId);
      const dateDelta =
        c.event_date_est && wDate
          ? Math.abs(new Date(c.event_date_est).getTime() - new Date(wDate).getTime()) / (1000 * 60 * 60 * 24)
          : null;
      const jac = jaccard(myVendors, weddingVendors.get(weddingId) ?? new Set());
      if (jac > JACCARD_THRESHOLD && dateDelta !== null && dateDelta <= DATE_WINDOW_DAYS) {
        flaggedDetails.push({ candidateId: c.id, weddingId, jac, dateDelta: Math.round(dateDelta) });
        candidateFlagged = true;
      }
    }
    if (candidateFlagged) flagged++;
    else clean++;
  }

  console.log(`[existing-dup-check] clean (safe to consider for creation): ${clean}`);
  console.log(`[existing-dup-check] flagged (likely should match an existing Ben wedding instead): ${flagged}`);
  for (const d of flaggedDetails) {
    console.log(`  candidate=${d.candidateId} -> existing wedding=${d.weddingId} jaccard=${d.jac.toFixed(3)} date_delta=${d.dateDelta}d`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
