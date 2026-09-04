/**
 * Read-only in-memory simulation of the Jeremy wedding-candidate clustering
 * algorithm (runJeremyWeddingClustering.ts), for Experiment B (clustering
 * order-dependence investigation). Never writes to the DB.
 *
 * Why simulate instead of just re-running the real script under a new
 * clustering_version: jeremy_wedding_candidate_posts has PK(source_post_url)
 * only — no clustering_version column — so a post can belong to exactly one
 * candidate GLOBALLY, across all versions. A second full from-scratch
 * clustering pass cannot coexist with jeremy-cluster-v1's results the way
 * reconciliation's (candidate_id, reconciliation_version) PK allows for
 * reconcile-v1/v2. This script replays the algorithm faithfully in memory
 * (mode "current") to verify it reproduces the live DB exactly, then replays
 * a variant to measure the delta before touching any schema or production data.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/simulateClustering.ts <mode>          — single run + stats
 *   bun run scripts/graph/simulateClustering.ts diff <mode>     — vs "current", lists every merge
 *   mode: current | inclusive | best-match | inclusive-best-match
 */
import { getPool, closePool } from "../classify/db";
import { effectiveDate, daysBetween, jaccard } from "./clusteringUtils";

const DATE_WINDOW_DAYS = 21;
const JACCARD_THRESHOLD = 0.5;

interface PostRow {
  source_post_url: string;
  posted_at: string | null;
  event_date: string | null;
  event_date_confidence: number | null;
}
interface EvidenceRow {
  source_post_url: string;
  account_id: number;
  role: string;
}
interface SimCandidate {
  id: number; // synthetic, simulation-only
  venueAccountId: number | null;
  eventDateEst: Date | null;
  vendorKeys: Set<string>;
  postDates: Date[];
  posts: string[];
}

export type Mode = "current" | "inclusive" | "best-match" | "inclusive-best-match";

export async function runSimulation(mode: Mode, pool: ReturnType<typeof getPool>) {
  const { rows: evidence } = await pool.query<EvidenceRow>(
    `select source_post_url, account_id, role from jeremy_post_vendor_evidence`
  );
  const evidenceByPost = new Map<string, EvidenceRow[]>();
  for (const e of evidence) {
    if (!evidenceByPost.has(e.source_post_url)) evidenceByPost.set(e.source_post_url, []);
    evidenceByPost.get(e.source_post_url)!.push(e);
  }
  const eligiblePostUrls = [...evidenceByPost.entries()]
    .filter(([, rows]) => new Set(rows.map((r) => r.role)).size >= 3)
    .map(([url]) => url);

  const { rows: posts } = await pool.query<PostRow>(
    `select post_url as source_post_url, posted_at::text as posted_at, event_date, event_date_confidence
     from post_classification_runs
     where classifier_version = 'v3' and post_url = any($1::text[])
     order by post_url, classified_at desc`,
    [eligiblePostUrls]
  );
  const seenPost = new Set<string>();
  const dedupedPosts = posts.filter((p) => (seenPost.has(p.source_post_url) ? false : (seenPost.add(p.source_post_url), true)));

  const sortable = dedupedPosts
    .map((p) => ({ p, date: effectiveDate(p) }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.getTime() - b.date.getTime() || a.p.source_post_url.localeCompare(b.p.source_post_url);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.p.source_post_url.localeCompare(b.p.source_post_url);
    });

  const candidates = new Map<number, SimCandidate>();
  let nextId = 1;
  const passesThreshold = (jac: number) =>
    mode === "inclusive" || mode === "inclusive-best-match" ? jac >= JACCARD_THRESHOLD : jac > JACCARD_THRESHOLD;
  const useBestMatch = mode === "best-match" || mode === "inclusive-best-match";

  const postToCandidate = new Map<string, number>();
  const decisiveJaccard = new Map<string, number>();

  for (const { p, date } of sortable) {
    const postEvidence = evidenceByPost.get(p.source_post_url) ?? [];
    const vendorKeys = new Set(postEvidence.map((e) => `${e.account_id}:${e.role}`));
    const venueEvidence = postEvidence.find((e) => e.role === "venue");

    let matched: SimCandidate | null = null;
    let bestJac = -1;
    if (date) {
      for (const c of candidates.values()) {
        if (!c.eventDateEst) continue;
        if (daysBetween(date, c.eventDateEst) > DATE_WINDOW_DAYS) continue;
        const jac = jaccard(vendorKeys, c.vendorKeys);
        if (!passesThreshold(jac)) continue;
        if (useBestMatch) {
          if (jac > bestJac) {
            bestJac = jac;
            matched = c;
          }
        } else {
          matched = c;
          bestJac = jac;
          break;
        }
      }
    }

    if (matched) {
      decisiveJaccard.set(p.source_post_url, bestJac);
      matched.postDates.push(date!);
      matched.eventDateEst = matched.postDates.reduce((a, b) => (a < b ? a : b));
      if (!matched.venueAccountId && venueEvidence) matched.venueAccountId = venueEvidence.account_id;
      for (const k of vendorKeys) matched.vendorKeys.add(k);
      matched.posts.push(p.source_post_url);
      postToCandidate.set(p.source_post_url, matched.id);
    } else {
      const id = nextId++;
      candidates.set(id, {
        id,
        venueAccountId: venueEvidence?.account_id ?? null,
        eventDateEst: date,
        vendorKeys,
        postDates: date ? [date] : [],
        posts: [p.source_post_url],
      });
      postToCandidate.set(p.source_post_url, id);
    }
  }

  return { candidates, postToCandidate, evidenceByPost, decisiveJaccard };
}

function printStats(mode: Mode, candidates: Map<number, SimCandidate>) {
  const sizes = [...candidates.values()].map((c) => c.posts.length);
  const singleton = sizes.filter((s) => s === 1).length;
  const pair = sizes.filter((s) => s === 2).length;
  const larger = sizes.filter((s) => s >= 3).length;
  const maxSize = Math.max(...sizes);
  const venueResolved = [...candidates.values()].filter((c) => c.venueAccountId != null).length;
  console.log(
    `[sim:${mode}] candidates: ${candidates.size}  singleton=${singleton} pair=${pair} larger(3+)=${larger} max=${maxSize} venue-resolved=${venueResolved}`
  );

  const w468Posts = [
    "https://www.instagram.com/p/DZVIim0FvcA/",
    "https://www.instagram.com/p/DXmojvKEWIo/",
    "https://www.instagram.com/p/DXrkdSDju9Y/",
  ];
  const owningCandidates = new Set<number>();
  for (const c of candidates.values()) if (c.posts.some((u) => w468Posts.includes(u))) owningCandidates.add(c.id);
  console.log(`[sim:${mode}] wedding-468 trio -> ${owningCandidates.size} distinct simulated candidate(s)`);
}

async function diffAgainstCurrent(mode: Mode, pool: ReturnType<typeof getPool>) {
  const baseline = await runSimulation("current", pool);
  const variant = await runSimulation(mode, pool);

  // Group baseline-candidate-ids by which variant-candidate-id they ended up merged into.
  const baselineToVariant = new Map<number, Set<number>>(); // variantCandidateId -> set of baseline candidate ids it absorbed
  for (const [url, variantCid] of variant.postToCandidate) {
    const baselineCid = baseline.postToCandidate.get(url)!;
    if (!baselineToVariant.has(variantCid)) baselineToVariant.set(variantCid, new Set());
    baselineToVariant.get(variantCid)!.add(baselineCid);
  }
  const merges = [...baselineToVariant.entries()].filter(([, baselineCids]) => baselineCids.size > 1);

  console.log(`\n=== diff: current -> ${mode} ===`);
  console.log(`baseline candidates: ${baseline.candidates.size}, variant candidates: ${variant.candidates.size}`);
  console.log(`merges (variant candidate absorbing >1 baseline candidate): ${merges.length}`);

  for (const [variantCid, baselineCids] of merges) {
    const vc = variant.candidates.get(variantCid)!;
    console.log(`\n  variant candidate#${variantCid}: venue=${vc.venueAccountId} date=${vc.eventDateEst?.toISOString().slice(0, 10)} posts=${vc.posts.length}`);
    for (const bcid of baselineCids) {
      const bc = baseline.candidates.get(bcid)!;
      console.log(`    from baseline candidate#${bcid}: venue=${bc.venueAccountId} date=${bc.eventDateEst?.toISOString().slice(0, 10)} posts=${bc.posts.join(", ")}`);
    }
    for (const url of vc.posts) {
      const jac = variant.decisiveJaccard.get(url);
      if (jac !== undefined) console.log(`    decisive jaccard for ${url}: ${jac.toFixed(4)}`);
    }
  }

  await closePool();
}

async function main() {
  const arg1 = process.argv[2];
  const pool = getPool();

  if (arg1 === "diff") {
    const mode = (process.argv[3] as Mode) ?? "inclusive";
    await diffAgainstCurrent(mode, pool);
    return;
  }

  const mode = (arg1 as Mode) ?? "current";
  const { candidates } = await runSimulation(mode, pool);
  printStats(mode, candidates);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
