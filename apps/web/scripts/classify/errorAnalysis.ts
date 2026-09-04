/**
 * Error analysis over a full classification run (not just the golden set):
 * accounts with unusually high INCLUDE/error rates, exclusion-reason
 * breakdown across the whole corpus, and lightweight clustering of EXCLUDE
 * posts by shared hashtags (Jaccard merge — same algorithm pipeline.py
 * already uses to dedupe weddings, reused here for consistency) to surface
 * recurring patterns worth a new deterministic rule or prompt fix.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/errorAnalysis.ts --version v1
 */
import type { Pool } from "pg";
import { getPool, closePool } from "./db";

interface AccountRollupRow {
  owner_username: string;
  n: string;
  n_include: string;
  n_review: string;
  avg_confidence: string;
  archetype: string | null;
  archetype_confidence: number | null;
  is_wedding_industry: boolean | null;
}

interface ReasonBreakdownRow {
  exclusion_reason: string | null;
  tier: string;
  n: string;
  avg_confidence: string;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { version: get("--version") ?? "v1", minPosts: Number(get("--min-posts") ?? 3) };
}

// Latest run WITHIN the requested version, not post_classifications_current
// (that view is latest-across-ALL-versions — goes silently empty for an
// older version once a newer one has run on the same posts; see
// evalHarness.ts for the live case that caught this).
const LATEST_FOR_VERSION_CTE = `
  with latest as (
    select distinct on (post_url) *
    from post_classification_runs
    where classifier_version = $1
    order by post_url, classified_at desc
  )
`;

async function accountErrorRates(pool: Pool, version: string, minPosts: number) {
  const sql = `
    ${LATEST_FOR_VERSION_CTE}
    select sp.owner_username,
      count(*) as n,
      count(*) filter (where pc.decision = 'INCLUDE') as n_include,
      count(*) filter (where pc.decision = 'REVIEW') as n_review,
      avg(pc.confidence) as avg_confidence,
      acc.archetype, acc.confidence as archetype_confidence, acc.is_wedding_industry
    from latest pc
    join staging.instagram_posts sp on sp.post_url = pc.post_url
    left join account_classifications_current acc on lower(acc.username) = lower(sp.owner_username)
    group by sp.owner_username, acc.archetype, acc.confidence, acc.is_wedding_industry
    having count(*) >= $2
    order by (count(*) filter (where pc.decision = 'INCLUDE'))::float / count(*) desc
  `;
  const { rows } = await pool.query<AccountRollupRow>(sql, [version, minPosts]);
  // Flag the interesting case: high INCLUDE rate from an account the
  // account-level classifier thinks is NOT primarily wedding industry
  // (or has low archetype confidence) — a contradiction worth a human look.
  const suspicious = rows.filter(
    (r) => Number(r.n_include) / Number(r.n) > 0.5 && (r.is_wedding_industry === false || (r.archetype_confidence !== null && r.archetype_confidence < 0.5))
  );
  return { all: rows, suspicious };
}

async function exclusionReasonBreakdown(pool: Pool, version: string) {
  const sql = `
    ${LATEST_FOR_VERSION_CTE}
    select exclusion_reason, tier, count(*) as n, avg(confidence) as avg_confidence
    from latest
    where decision = 'EXCLUDE'
    group by exclusion_reason, tier
    order by n desc
  `;
  const { rows } = await pool.query<ReasonBreakdownRow>(sql, [version]);
  return rows;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

interface ClusterInput {
  post_url: string;
  hashtags: string[];
  exclusion_reason: string | null;
}

/** Greedy Jaccard-merge clustering (same shape as pipeline.py's wedding
 * dedup) over EXCLUDE posts' hashtag sets, within each exclusion_reason
 * bucket. A cluster of 5+ posts sharing >0.5 hashtag overlap under one
 * reason is a candidate for a new deterministic pre-filter rule instead of
 * paying LLM cost for the same pattern repeatedly. */
function clusterByHashtags(posts: ClusterInput[], threshold = 0.5, minClusterSize = 4) {
  const clusters: Array<{ hashtags: Set<string>; posts: string[] }> = [];
  for (const p of posts) {
    const tags = new Set((p.hashtags || []).map((h) => h.toLowerCase()));
    if (tags.size === 0) continue;
    let placed = false;
    for (const c of clusters) {
      if (jaccard(tags, c.hashtags) > threshold) {
        c.posts.push(p.post_url);
        for (const t of tags) c.hashtags.add(t);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ hashtags: tags, posts: [p.post_url] });
  }
  return clusters.filter((c) => c.posts.length >= minClusterSize).sort((a, b) => b.posts.length - a.posts.length);
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const { all, suspicious } = await accountErrorRates(pool, args.version, args.minPosts);
  console.log(`\n=== Account-level rollup (classifier_version=${args.version}, >=${args.minPosts} classified posts) ===`);
  console.log(`${all.length} accounts with enough volume to judge`);
  console.log(`\n--- Suspicious: high INCLUDE rate but account classifier disagrees (${suspicious.length}) ---`);
  for (const r of suspicious) {
    console.log(
      `  @${r.owner_username}: ${r.n_include}/${r.n} INCLUDE, archetype=${r.archetype ?? "unclassified"} ` +
        `(conf ${r.archetype_confidence ?? "n/a"}, is_wedding_industry=${r.is_wedding_industry})`
    );
  }

  const reasons = await exclusionReasonBreakdown(pool, args.version);
  console.log(`\n=== Exclusion reason breakdown (full corpus) ===`);
  for (const r of reasons) {
    console.log(`  ${(r.exclusion_reason ?? "(none)").padEnd(28)} tier=${r.tier.padEnd(16)} n=${r.n} avg_conf=${Number(r.avg_confidence).toFixed(2)}`);
  }

  const { rows: excludePosts } = await pool.query(
    `${LATEST_FOR_VERSION_CTE}
     select pc.post_url, sp.hashtags, pc.exclusion_reason
     from latest pc
     join staging.instagram_posts sp on sp.post_url = pc.post_url
     where pc.decision = 'EXCLUDE'`,
    [args.version]
  );
  const byReason = new Map<string, ClusterInput[]>();
  for (const r of excludePosts) {
    const key = r.exclusion_reason ?? "(none)";
    if (!byReason.has(key)) byReason.set(key, []);
    byReason.get(key)!.push({ post_url: r.post_url, hashtags: r.hashtags || [], exclusion_reason: r.exclusion_reason });
  }
  console.log(`\n=== Hashtag clusters within each EXCLUDE reason (candidates for a new deterministic rule) ===`);
  for (const [reason, posts] of byReason) {
    const clusters = clusterByHashtags(posts);
    if (!clusters.length) continue;
    console.log(`\n  reason=${reason} (${posts.length} posts)`);
    for (const c of clusters) {
      console.log(`    cluster of ${c.posts.length}: ${[...c.hashtags].slice(0, 8).join(", ")}`);
    }
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
