/**
 * The actual deliverable of the human-confirmed-evidence pipeline: a
 * concrete funnel showing how much graph value the human-labeling session
 * generated, and per labeling-minute -- not just "we ran some scripts."
 * Read-only (aside from the pipeline runs already executed before this:
 * runStackParserOnGoldenSet.ts, runJeremyWeddingClustering.ts
 * --evidence-source human_confirmed, runJeremyWeddingReconciliation.ts).
 *
 * Usage (from apps/web): bun run scripts/graph/reportHumanConfirmedGraphValue.ts
 */
import type { QueryResultRow } from "pg";
import { getPool, closePool } from "../classify/db";
import { HUMAN_CONFIRMED_CLUSTERING_VERSION } from "./runJeremyWeddingClustering";
import { RECONCILIATION_VERSION } from "./runJeremyWeddingReconciliation";

async function main() {
  const pool = getPool();

  const q = async <T extends QueryResultRow = Record<string, string>>(sql: string, params: unknown[] = []) =>
    (await pool.query<T>(sql, params)).rows;

  console.log("=== Human-confirmed-evidence pipeline: graph value funnel ===\n");

  const [{ n: weddingPosts }] = await q<{ n: string }>(
    `select count(*)::int as n from golden_set gs
     join staging.instagram_posts sp on sp.post_url = gs.post_url
     where gs.expected_decision = 'INCLUDE'`
  );
  console.log(`1. Human-confirmed WEDDING posts (staging corpus): ${weddingPosts}`);

  const [{ n: alreadyEvidence }] = await q<{ n: string }>(
    `select count(*)::int as n from (
       select distinct source_post_url from jeremy_post_vendor_evidence
     ) x
     where exists (
       select 1 from golden_set gs where gs.post_url = x.source_post_url and gs.expected_decision = 'INCLUDE'
     )`
  );
  const previouslyUnused = Number(weddingPosts) - Number(alreadyEvidence);
  console.log(`2. Already evidence before this pipeline (V3-INCLUDE overlap): ${alreadyEvidence}`);
  console.log(`3. Previously unused (this pipeline's addressable population): ${previouslyUnused}`);

  // count(distinct post_url), not count(*): stack_extraction_runs can hold
  // multiple rows per post across parser versions (v1/v2/v3, append-only) --
  // counting rows overstated this by a wide margin (confirmed live, see
  // docs/engineering/human-labeling/human-confirmed-candidates-review.md).
  const [{ n: hadStackAlready }] = await q<{ n: string }>(
    `select count(distinct ser.post_url)::int as n from stack_extraction_runs ser
     where ser.decision <> 'HUMAN_INCLUDE'
       and exists (select 1 from golden_set gs where gs.post_url = ser.post_url and gs.expected_decision='INCLUDE')`
  );
  const [{ n: newlyExtracted }] = await q<{ n: string }>(
    `select count(distinct post_url)::int as n from stack_extraction_runs where decision = 'HUMAN_INCLUDE'`
  );
  console.log(`4. Already had a parsed stack (pre-existing, from the score>=12 baseline run): ${hadStackAlready}`);
  console.log(`5. Newly extracted by runStackParserOnGoldenSet.ts this pass: ${newlyExtracted}`);

  const [{ n: usableStack }] = await q<{ n: string }>(
    `select count(distinct source_post_url)::int as n
     from human_confirmed_post_vendor_evidence e
     where (select count(distinct role) from human_confirmed_post_vendor_evidence e2 where e2.source_post_url = e.source_post_url) >= 3`
  );
  console.log(`6. Posts with a usable (3+ distinct role) vendor stack: ${usableStack}`);

  const [{ n: totalCandidates }] = await q<{ n: string }>(
    `select count(*)::int as n from jeremy_wedding_candidates where clustering_version = $1`,
    [HUMAN_CONFIRMED_CLUSTERING_VERSION]
  );
  const chicagoBreakdown = await q<{ chicago_status: string | null; n: string }>(
    `select chicago_status, count(*)::int as n from jeremy_wedding_candidates
     where clustering_version = $1 group by chicago_status order by chicago_status nulls last`,
    [HUMAN_CONFIRMED_CLUSTERING_VERSION]
  );
  console.log(`\n7. New wedding candidates (human-confirmed-v1): ${totalCandidates}`);
  console.log(`   Chicago status breakdown:`);
  for (const r of chicagoBreakdown) console.log(`     ${r.chicago_status ?? "(no venue resolved)"}: ${r.n}`);

  const reconBreakdown = await q<{ status: string; n: string }>(
    `select
       case
         when r.matched_wedding_id is not null and r.match_confidence >= 0.8 then 'high_confidence_match'
         when r.matched_wedding_id is not null then 'ambiguous_match'
         when r.venue_match then 'insufficient_evidence'
         else 'no_venue_at_all'
       end as status,
       count(*)::int as n
     from jeremy_wedding_candidates c
     join jeremy_wedding_candidate_reconciliation r
       on r.candidate_id = c.id and r.reconciliation_version = $1
     where c.clustering_version = $2
     group by 1 order by 1`,
    [RECONCILIATION_VERSION, HUMAN_CONFIRMED_CLUSTERING_VERSION]
  );
  console.log(`\n8. Reconciliation outcome (of ${totalCandidates} candidates):`);
  for (const r of reconBreakdown) console.log(`     ${r.status}: ${r.n}`);

  // Graph-eligible-without-further-review = CHICAGO_CONFIRMED AND (matched an
  // existing Ben wedding OR would become a genuinely new one) -- everything
  // else is explicitly "requires human review," never silently included.
  const eligible = await q<{ candidate_id: number; matched_wedding_id: number | null }>(
    `select c.id as candidate_id, r.matched_wedding_id
     from jeremy_wedding_candidates c
     join jeremy_wedding_candidate_reconciliation r
       on r.candidate_id = c.id and r.reconciliation_version = $1
     where c.clustering_version = $2 and c.chicago_status = 'CHICAGO_CONFIRMED'`,
    [RECONCILIATION_VERSION, HUMAN_CONFIRMED_CLUSTERING_VERSION]
  );
  const wouldAttach = eligible.filter((e) => e.matched_wedding_id != null);
  const wouldCreate = eligible.filter((e) => e.matched_wedding_id == null);

  let strengthenedRelationships = 0;
  for (const e of wouldAttach) {
    const vendors = await q<{ account_id: number; role: string }>(
      `select account_id, role from jeremy_wedding_candidate_vendors where candidate_id = $1`,
      [e.candidate_id]
    );
    const existing = await q<{ n: string }>(
      `select count(*)::int as n from wedding_vendors where wedding_id = $1
         and (account_id, role) in (${vendors.map((_, i) => `($${i * 2 + 2}, $${i * 2 + 3}::vendor_role)`).join(",") || "(null,null)"})`,
      [e.matched_wedding_id, ...vendors.flatMap((v) => [v.account_id, v.role])]
    );
    strengthenedRelationships += vendors.length - Number(existing[0]?.n ?? 0);
  }
  let newRelationshipsFromNewWeddings = 0;
  for (const e of wouldCreate) {
    const [{ n }] = await q<{ n: string }>(
      `select count(*)::int as n from jeremy_wedding_candidate_vendors where candidate_id = $1`,
      [e.candidate_id]
    );
    newRelationshipsFromNewWeddings += Number(n);
  }

  console.log(`\n9. Graph-eligible without further review (CHICAGO_CONFIRMED + reconciled): ${eligible.length}`);
  console.log(`     would attach to an existing Ben wedding: ${wouldAttach.length} (${strengthenedRelationships} new/strengthened vendor relationships)`);
  console.log(`     would create a genuinely new wedding: ${wouldCreate.length} (${newRelationshipsFromNewWeddings} new vendor relationships)`);

  const requiresReview = Number(totalCandidates) - eligible.length;
  console.log(`\n10. Candidates requiring human review before any write (ambiguous/not-confirmed Chicago, or no venue): ${requiresReview}`);
  console.log(`11. Production graph additions so far: 0 (no write has been made -- pending human approval)`);

  // Graph value per labeling minute -- same active-time methodology used
  // earlier this session (labeled_at gaps, >3min gap = break, excluded).
  const labelRows = await q<{ labeled_at: string }>(
    `select labeled_at from human_post_labels order by labeled_at asc`
  );
  let activeMs = 0;
  const GAP_BREAK_MS = 3 * 60_000;
  for (let i = 1; i < labelRows.length; i++) {
    const dt = new Date(labelRows[i].labeled_at).getTime() - new Date(labelRows[i - 1].labeled_at).getTime();
    if (dt <= GAP_BREAK_MS) activeMs += dt;
  }
  const activeMinutes = activeMs / 60000;
  const totalNewRelationships = strengthenedRelationships + newRelationshipsFromNewWeddings;
  console.log(`\n=== Graph value per labeling-minute ===`);
  console.log(`Active labeling time (all sessions): ${activeMinutes.toFixed(1)} min`);
  console.log(
    `New wedding candidates per labeling-minute: ${(Number(totalCandidates) / activeMinutes).toFixed(3)}`
  );
  console.log(
    `Graph-eligible-without-review candidates per labeling-minute: ${(eligible.length / activeMinutes).toFixed(3)}`
  );
  console.log(
    `New/strengthened vendor relationships per labeling-minute: ${(totalNewRelationships / activeMinutes).toFixed(3)}`
  );

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
