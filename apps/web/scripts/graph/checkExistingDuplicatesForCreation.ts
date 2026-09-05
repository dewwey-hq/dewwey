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
  // venue/hotel/catering/rentals.
  const phase1 = process.argv.includes("--phase1");
  const PHASE1_FILTER = `
    and exists (select 1 from vendors v where v.account_id = c.venue_account_id and v.city = 'Chicago')
    and exists (select 1 from account_tags at2 where at2.account_id = c.venue_account_id and at2.role in ('venue','hotel','catering','rentals'))
  `;

  const { rows: candidates } = await pool.query<{ id: number; event_date_est: string | null }>(`
    select c.id::int, c.event_date_est::text
    from jeremy_wedding_candidates c
    join jeremy_wedding_candidate_reconciliation r
      on r.candidate_id = c.id and r.reconciliation_version = 'reconcile-v2'
    where r.matched_wedding_id is null
      and c.venue_account_id is not null
      and not exists (select 1 from weddings w where w.venue_id = c.venue_account_id)
      ${phase1 ? PHASE1_FILTER : ""}
  `);
  console.log(`[existing-dup-check] ${phase1 ? "Phase 1 (city+venue-role filtered)" : "full"} scope: ${candidates.length} candidates`);

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
