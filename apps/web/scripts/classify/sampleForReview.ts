/**
 * Picks posts for human review, prioritized by expected information value —
 * not just "low confidence." Three signals, combined:
 *
 *   1. Tier disagreement — cheap_model and expensive_model reached different
 *      decisions on the same post. This is the highest-value case: it's a
 *      live disagreement between two models, not a guess about uncertainty.
 *   2. REVIEW decisions and confidence near the 0.5 boundary — the
 *      classifier's own stated uncertainty.
 *   3. Under-represented exclusion_reason — a post whose reason has few or
 *      no golden_set examples yet teaches the eval harness something new,
 *      even at moderate confidence (golden-set coverage gaps are worth
 *      closing deliberately, not just wherever confidence happens to be low).
 *
 * Output is a ranked list to review by hand; label the ones you review and
 * feed them into a new data/golden_set_vN.json + loadGoldenSet.ts.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/sampleForReview.ts --version v1 --limit 30
 */
import { getPool, closePool } from "./db";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { version: get("--version") ?? "v1", limit: Number(get("--limit") ?? 30) };
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  // Reason coverage in the golden set today — used to boost under-represented reasons.
  const { rows: goldenCoverage } = await pool.query<{ reason: string; n: string }>(
    `select coalesce(exclusion_reason, '(none)') as reason, count(*) as n from golden_set group by 1`
  );
  const coverage = new Map<string, number>(goldenCoverage.map((r) => [r.reason, Number(r.n)]));

  // Tier disagreement: latest cheap_model vs latest expensive_model run per post.
  const { rows: tierPairs } = await pool.query<{
    post_url: string;
    cheap_decision: string;
    expensive_decision: string;
    expensive_confidence: number;
  }>(
    `with cheap as (
       select distinct on (post_url) post_url, decision, confidence
       from post_classification_runs where classifier_version = $1 and tier = 'cheap_model'
       order by post_url, classified_at desc
     ), expensive as (
       select distinct on (post_url) post_url, decision, confidence
       from post_classification_runs where classifier_version = $1 and tier = 'expensive_model'
       order by post_url, classified_at desc
     )
     select c.post_url, c.decision as cheap_decision, e.decision as expensive_decision,
       e.confidence as expensive_confidence
     from cheap c join expensive e on e.post_url = c.post_url
     where c.decision <> e.decision`,
    [args.version]
  );

  // Latest run WITHIN this version, not post_classifications_current — same
  // cross-version staleness issue documented in evalHarness.ts.
  const { rows: current } = await pool.query<{
    post_url: string;
    decision: string;
    confidence: number;
    exclusion_reason: string | null;
    tier: string;
  }>(
    `select distinct on (post_url) post_url, decision, confidence, exclusion_reason, tier
     from post_classification_runs where classifier_version = $1
     order by post_url, classified_at desc`,
    [args.version]
  );

  const alreadyLabeled = new Set(
    (await pool.query<{ post_url: string }>(`select post_url from golden_set`)).rows.map((r) => r.post_url)
  );

  const disagreementUrls = new Set(tierPairs.map((r) => r.post_url));

  interface Candidate {
    post_url: string;
    score: number;
    reasons: string[];
    decision: string;
    confidence: number;
    exclusion_reason: string | null;
  }
  const candidates: Candidate[] = [];

  for (const r of current) {
    if (alreadyLabeled.has(r.post_url)) continue;
    let score = 0;
    const why: string[] = [];

    if (disagreementUrls.has(r.post_url)) {
      score += 10;
      why.push("cheap/expensive tier disagreement");
    }
    if (r.decision === "REVIEW") {
      score += 5;
      why.push("classifier itself said REVIEW");
    }
    const distFromBoundary = Math.abs(r.confidence - 0.5);
    score += (0.5 - Math.min(distFromBoundary, 0.5)) * 6; // up to +3 at confidence=0.5
    if (distFromBoundary < 0.15) why.push(`confidence near decision boundary (${r.confidence})`);

    const reasonKey = r.exclusion_reason ?? "(none)";
    const n = coverage.get(reasonKey) ?? 0;
    if (n < 5) {
      score += (5 - n) * 0.8;
      why.push(`exclusion_reason "${reasonKey}" has only ${n} golden_set examples`);
    }

    if (why.length) {
      candidates.push({
        post_url: r.post_url,
        score,
        reasons: why,
        decision: r.decision,
        confidence: r.confidence,
        exclusion_reason: r.exclusion_reason,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, args.limit);

  console.log(`\n=== Review queue (classifier_version=${args.version}) — top ${top.length} of ${candidates.length} candidates ===\n`);
  for (const c of top) {
    console.log(`${c.post_url}`);
    console.log(`  current: ${c.decision} (confidence ${c.confidence})${c.exclusion_reason ? ` reason=${c.exclusion_reason}` : ""}`);
    console.log(`  why review: ${c.reasons.join("; ")}\n`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
