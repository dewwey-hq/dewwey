/**
 * Scores each jeremy_wedding_candidate against Ben's CURRENT weddings —
 * a versioned, non-authoritative BELIEF (jeremy_wedding_candidate_reconciliation),
 * never a merge. matched_wedding_id is deliberately not a foreign key: Ben's
 * weddings.id can be reassigned by a future phase_dedup rebuild, and
 * re-reconciling afterward is expected, ordinary maintenance, not a repair.
 *
 * Candidates with no resolved venue_account_id are skipped entirely — venue
 * is the strongest anchor (matching the existing "a wedding is Chicago iff
 * its venue is" principle) and matching without one would be guessing.
 *
 * Usage (from apps/web): bun run scripts/graph/runJeremyWeddingReconciliation.ts
 */
import { getPool, closePool } from "../classify/db";

export const RECONCILIATION_VERSION = "reconcile-v1";
const HIGH_CONFIDENCE_DATE_DAYS = 14;
const HIGH_CONFIDENCE_JACCARD = 0.5;
const AMBIGUOUS_DATE_DAYS = 30;
const AMBIGUOUS_JACCARD = 0.3;

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
    venue_account_id: number | null;
    event_date_est: string | null;
  }>(`select id, venue_account_id, event_date_est::text as event_date_est from jeremy_wedding_candidates`);

  const { rows: candidateVendorRows } = await pool.query<{ candidate_id: number; account_id: number; role: string }>(
    `select candidate_id, account_id, role from jeremy_wedding_candidate_vendors`
  );
  const candidateVendors = new Map<number, Set<string>>();
  for (const r of candidateVendorRows) {
    if (!candidateVendors.has(r.candidate_id)) candidateVendors.set(r.candidate_id, new Set());
    candidateVendors.get(r.candidate_id)!.add(`${r.account_id}:${r.role}`);
  }

  const withVenue = candidates.filter((c) => c.venue_account_id != null);
  console.log(`[jeremy-reconcile] version=${RECONCILIATION_VERSION} candidates=${candidates.length} with-venue=${withVenue.length}`);

  const venueIds = [...new Set(withVenue.map((c) => c.venue_account_id))];
  const { rows: bendWeddings } = await pool.query<{
    id: number;
    venue_id: number;
    event_date_est: string | null;
  }>(`select id, venue_id, event_date_est::text as event_date_est from weddings where venue_id = any($1::bigint[])`, [venueIds]);
  const weddingsByVenue = new Map<number, typeof bendWeddings>();
  for (const w of bendWeddings) {
    if (!weddingsByVenue.has(w.venue_id)) weddingsByVenue.set(w.venue_id, []);
    weddingsByVenue.get(w.venue_id)!.push(w);
  }

  const { rows: wvRows } = await pool.query<{ wedding_id: number; account_id: number; role: string }>(
    `select wedding_id, account_id, role::text as role from wedding_vendors where wedding_id = any($1::bigint[])`,
    [bendWeddings.map((w) => w.id)]
  );
  const weddingVendors = new Map<number, Set<string>>();
  for (const r of wvRows) {
    if (!weddingVendors.has(r.wedding_id)) weddingVendors.set(r.wedding_id, new Set());
    weddingVendors.get(r.wedding_id)!.add(`${r.account_id}:${r.role}`);
  }

  let high = 0;
  let ambiguous = 0;
  let none = 0;

  for (const c of candidates) {
    if (c.venue_account_id == null) continue;
    const candidates_for_venue = weddingsByVenue.get(c.venue_account_id) ?? [];
    const myVendors = candidateVendors.get(c.id) ?? new Set();

    let best: { weddingId: number; dateDelta: number | null; jac: number } | null = null;
    for (const w of candidates_for_venue) {
      const dateDelta =
        c.event_date_est && w.event_date_est
          ? Math.abs(new Date(c.event_date_est).getTime() - new Date(w.event_date_est).getTime()) / (1000 * 60 * 60 * 24)
          : null;
      const jac = jaccard(myVendors, weddingVendors.get(w.id) ?? new Set());
      if (!best || jac > best.jac) best = { weddingId: w.id, dateDelta, jac };
    }

    if (!best) {
      none++;
      await pool.query(
        `insert into jeremy_wedding_candidate_reconciliation
           (candidate_id, matched_wedding_id, match_confidence, venue_match, date_delta_days, vendor_jaccard, reconciliation_version)
         values ($1,null,null,false,null,null,$2)
         on conflict (candidate_id, reconciliation_version) do update set
           matched_wedding_id=null, match_confidence=null, venue_match=false, date_delta_days=null, vendor_jaccard=null, reconciled_at=now()`,
        [c.id, RECONCILIATION_VERSION]
      );
      continue;
    }

    const isHigh = best.dateDelta !== null && best.dateDelta <= HIGH_CONFIDENCE_DATE_DAYS && best.jac > HIGH_CONFIDENCE_JACCARD;
    const isAmbiguous =
      !isHigh && ((best.dateDelta !== null && best.dateDelta <= AMBIGUOUS_DATE_DAYS) || best.jac > AMBIGUOUS_JACCARD);
    const confidence = isHigh ? 0.8 : isAmbiguous ? 0.4 : 0.1;
    if (isHigh) high++;
    else if (isAmbiguous) ambiguous++;
    else none++;

    await pool.query(
      `insert into jeremy_wedding_candidate_reconciliation
         (candidate_id, matched_wedding_id, match_confidence, venue_match, date_delta_days, vendor_jaccard, reconciliation_version)
       values ($1,$2,$3,true,$4,$5,$6)
       on conflict (candidate_id, reconciliation_version) do update set
         matched_wedding_id=excluded.matched_wedding_id, match_confidence=excluded.match_confidence,
         venue_match=true, date_delta_days=excluded.date_delta_days, vendor_jaccard=excluded.vendor_jaccard, reconciled_at=now()`,
      [c.id, best.weddingId, confidence, best.dateDelta != null ? Math.round(best.dateDelta) : null, best.jac, RECONCILIATION_VERSION]
    );
  }

  console.log(`[jeremy-reconcile] DONE — high=${high} ambiguous=${ambiguous} none=${none} (of ${candidates.length} total candidates)`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
