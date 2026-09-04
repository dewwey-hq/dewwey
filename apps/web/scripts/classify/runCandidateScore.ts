/**
 * Scores the corpus with the deterministic candidate-generation score
 * (candidate-score-v1, see candidateScore.ts) and persists to
 * candidate_scores. Free/zero-LLM-cost — pure regex + the existing
 * known-vendor-mention graph join, no API calls at all.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/runCandidateScore.ts            # full corpus
 *   bun run scripts/classify/runCandidateScore.ts --limit 500
 */
import { getPool, closePool } from "./db";
import { fetchPosts, loadKnownVendors, attachKnownMentions } from "./source";
import { scoreCandidate, CANDIDATE_SCORE_VERSION } from "./candidateScore";
import { saveCandidateScore } from "./persist";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { limit: get("--limit") ? Number(get("--limit")) : undefined };
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const known = await loadKnownVendors(pool);
  console.log(`[candidate-score] version=${CANDIDATE_SCORE_VERSION} known vendor accounts: ${known.size}`);

  const posts = await fetchPosts(pool, { limit: args.limit });
  console.log(`[candidate-score] fetched ${posts.length} posts`);

  const scoreCounts: Record<number, number> = {};
  let saved = 0;
  for (const ctx of posts) {
    attachKnownMentions(ctx, known);
    const result = scoreCandidate(ctx);
    await saveCandidateScore(pool, result);
    scoreCounts[result.score] = (scoreCounts[result.score] ?? 0) + 1;
    saved++;
    if (saved % 5000 === 0) console.log(`[candidate-score] ${saved}/${posts.length}`);
  }

  console.log(`[candidate-score] DONE — scored ${saved} posts`);
  const thresholds = [18, 15, 12, 10, 8, 5, 3, 0];
  for (const t of thresholds) {
    const n = Object.entries(scoreCounts)
      .filter(([s]) => Number(s) >= t)
      .reduce((sum, [, c]) => sum + c, 0);
    console.log(`  score >= ${t}: ${n}`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
