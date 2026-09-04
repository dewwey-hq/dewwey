/**
 * Ship-decision summary for one classifier_version: the exact metrics the
 * mission's decision gate cares about, in one place.
 *
 *   - INCLUDE precision (PRIMARY — the ship/no-ship number: a false INCLUDE
 *     is much worse than a false EXCLUDE, so this outranks overall accuracy/F1)
 *   - INCLUDE recall, overall accuracy (secondary context, not the gate)
 *   - REVIEW rate (how much human-review load this version creates)
 *   - tier distribution (deterministic / cheap_model / expensive_model share)
 *   - real observed cost per 1k posts, extrapolated to the full 45k corpus
 *
 * Precision/recall/accuracy come from scoring against a golden_set slice
 * (pass --source-note); tier distribution and cost come from the classifier
 * run itself over however many posts it actually touched — pass --scale-to
 * to extrapolate observed per-post cost to a different corpus size (default
 * 47623, the full staging.instagram_posts count).
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/costReport.ts --version v1 --source-note dev_v1
 */
import { getPool, closePool } from "./db";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    version: get("--version") ?? "v1",
    sourceNote: get("--source-note"),
    scaleTo: Number(get("--scale-to") ?? 47623),
  };
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  // --- precision/recall/accuracy against golden_set (optional slice) ---
  const { rows: golden } = await pool.query<{
    post_url: string;
    expected_decision: string;
  }>(
    args.sourceNote
      ? `select post_url, expected_decision from golden_set where source_note = $1`
      : `select post_url, expected_decision from golden_set`,
    args.sourceNote ? [args.sourceNote] : []
  );
  // Not post_classifications_current — see evalHarness.ts for why: that view
  // is latest-across-ALL-versions, so it goes empty for an older version once
  // a newer one has run on the same posts. Resolve latest-within-THIS-version
  // directly so a superseded version's numbers stay reproducible.
  const { rows: actualRows } = await pool.query<{ post_url: string; decision: string }>(
    `select distinct on (post_url) post_url, decision
     from post_classification_runs
     where classifier_version = $1 and post_url = any($2::text[])
     order by post_url, classified_at desc`,
    [args.version, golden.map((g) => g.post_url)]
  );
  const actual = new Map(actualRows.map((r) => [r.post_url, r.decision]));
  const scored = golden.filter((g) => actual.has(g.post_url));

  let tp = 0,
    fp = 0,
    fn = 0,
    correct = 0;
  for (const g of scored) {
    const d = actual.get(g.post_url)!;
    if (d === g.expected_decision) correct++;
    if (d === "INCLUDE" && g.expected_decision === "INCLUDE") tp++;
    if (d === "INCLUDE" && g.expected_decision !== "INCLUDE") fp++;
    if (d !== "INCLUDE" && g.expected_decision === "INCLUDE") fn++;
  }
  const includePrecision = tp + fp > 0 ? tp / (tp + fp) : null;
  const includeRecall = tp + fn > 0 ? tp / (tp + fn) : null;
  const accuracy = scored.length ? correct / scored.length : null;

  // --- FINAL tier/decision distribution, over every post this version has touched ---
  // Latest run WITHIN this version (not post_classifications_current — same
  // cross-version staleness issue as above) — right for "how many posts
  // ended up INCLUDE/EXCLUDE/REVIEW" and "what tier resolved it," but still
  // WRONG for cost: a post that escalated cheap->expensive has its (real,
  // already-spent) cheap-tier cost on a row this "latest per post" resolution
  // drops — see the separate all-attempts query below for that.
  const { rows: tierRows } = await pool.query<{
    tier: string;
    decision: string;
    n: string;
  }>(
    `select tier, decision, count(*) as n
     from (
       select distinct on (post_url) tier, decision
       from post_classification_runs
       where classifier_version = $1
       order by post_url, classified_at desc
     ) latest
     group by tier, decision`,
    [args.version]
  );
  const totalPosts = tierRows.reduce((s, r) => s + Number(r.n), 0);
  const tierTotals: Record<string, number> = {};
  let reviewCount = 0;
  for (const r of tierRows) {
    tierTotals[r.tier] = (tierTotals[r.tier] ?? 0) + Number(r.n);
    if (r.decision === "REVIEW") reviewCount += Number(r.n);
  }
  const reviewRate = totalPosts ? reviewCount / totalPosts : null;

  // --- TRUE cost: every attempt, including a cheap-tier call later
  // superseded by escalation — that money was still spent. Sourced from
  // post_classification_runs (full history), not the current-only view.
  const { rows: costRows } = await pool.query<{ tier: string; total_cost: string | null; n_calls: string }>(
    `select tier, sum(cost_usd) as total_cost, count(*) as n_calls
     from post_classification_runs
     where classifier_version = $1
     group by tier`,
    [args.version]
  );
  const tierCost: Record<string, number> = {};
  const tierCallCounts: Record<string, number> = {};
  let totalCost = 0;
  for (const r of costRows) {
    const cost = Number(r.total_cost ?? 0);
    tierCost[r.tier] = cost;
    tierCallCounts[r.tier] = Number(r.n_calls);
    totalCost += cost;
  }
  const costPer1k = totalPosts ? (totalCost / totalPosts) * 1000 : null;
  const scaledCost = costPer1k !== null ? (costPer1k / 1000) * args.scaleTo : null;

  console.log(`\n=== Ship-decision summary: classifier_version=${args.version}${args.sourceNote ? ` source_note=${args.sourceNote}` : ""} ===`);
  console.log(`golden set scored: ${scored.length}/${golden.length}`);
  console.log(`\n--- PRIMARY: INCLUDE precision (ship gate) ---`);
  console.log(`  precision: ${includePrecision !== null ? includePrecision.toFixed(3) : "n/a"}  (${tp} correct / ${tp + fp} total INCLUDE calls, ${fp} false positives)`);
  console.log(`\n--- Secondary ---`);
  console.log(`  INCLUDE recall:  ${includeRecall !== null ? includeRecall.toFixed(3) : "n/a"}  (${fn} missed real weddings)`);
  console.log(`  overall accuracy: ${accuracy !== null ? accuracy.toFixed(3) : "n/a"}`);
  console.log(`\n--- Volume (over all ${totalPosts} posts this version has classified, not just golden set) ---`);
  console.log(`  REVIEW rate: ${reviewRate !== null ? (reviewRate * 100).toFixed(1) + "%" : "n/a"} (${reviewCount}/${totalPosts})`);
  console.log(`  FINAL tier distribution (which tier's decision won, after any escalation):`);
  for (const [tier, n] of Object.entries(tierTotals)) {
    console.log(`    ${tier.padEnd(18)} ${n} (${((n / totalPosts) * 100).toFixed(1)}%)`);
  }
  console.log(`\n--- Cost (every attempt, including cheap-tier calls later superseded by escalation) ---`);
  console.log(`  calls by tier:`);
  for (const [tier, cost] of Object.entries(tierCost)) {
    console.log(`    ${tier.padEnd(18)} ${tierCallCounts[tier]} calls, $${cost.toFixed(4)} total`);
  }
  console.log(`  total spend this version: $${totalCost.toFixed(4)}`);
  console.log(`  observed cost per 1k posts: $${costPer1k !== null ? costPer1k.toFixed(2) : "n/a"}`);
  console.log(`  extrapolated to ${args.scaleTo.toLocaleString()} posts: $${scaledCost !== null ? scaledCost.toFixed(2) : "n/a"}`);
  console.log(`  (extrapolation assumes this run's tier mix is representative — a small/adversarial`);
  console.log(`   sample's mix can differ from the full corpus; sanity-check against det-only-v1's`);
  console.log(`   33.1% full-corpus deterministic-resolve rate before trusting this at 45k scale)`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
