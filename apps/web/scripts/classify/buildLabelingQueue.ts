/**
 * Builds a stratified, frozen review queue for the human-labeling UI
 * (/label) spanning the WHOLE ecosystem, not just one corpus -- per the
 * user's explicit request to not narrow prematurely: "give me everything
 * ... including the ones we are showing and the ones that are excluded ...
 * that way we receive value all over our funnel, not just in specific
 * pockets."
 *
 * Two source corpora:
 *
 *   staging.instagram_posts (47,623)  Jeremy's own-profile scrape.
 *   public.posts            (6,370)   Ben's venue_tagged crawl -- the live
 *                                      serving graph behind /weddings and
 *                                      /vendors. Almost entirely unreviewed
 *                                      by a human before this (only the 105
 *                                      posts from the D040/D042 non-wedding
 *                                      hand-flagging mission are in
 *                                      golden_set from this corpus).
 *
 * Five buckets:
 *
 *   random               true representative base rate of staging.instagram_posts.
 *   v1_include            the shipped 4,033-post /feed corpus (v1_content_corpus)
 *                          -- validates live-product precision against real
 *                          human judgment.
 *   v1_exclude_review     candidate_scores score>=12 whose latest v3 decision
 *                          is EXCLUDE or REVIEW -- finds false negatives /
 *                          calibration gaps in the shipped pipeline.
 *   below_cutoff           candidate_scores score<12 (or unscored) AND no v3
 *                          run at all -- the deliberately-unclassified
 *                          majority of staging.instagram_posts.
 *   public_posts_random    true random sample of public.posts -- this corpus
 *                          has never had a broad human review pass.
 *
 * Every bucket excludes posts already in golden_set OR already labeled by
 * ANY prior human_post_labels row (any queue_version) -- a rebuild never
 * wastes a slot re-serving something already resolved.
 *
 * Writes to label_queue with a fixed, reproducible order: the combined pool
 * is shuffled with a PRNG seeded from queue_version (not Math.random()), so
 * rebuilding the SAME queue_version twice produces the same order --
 * `--rebuild` deletes and reinserts that version's rows first, matching
 * "nothing downstream depends on stable ranks surviving a rebuild."
 *
 * Deliberately does NOT persist candidate_score/v3_decision/v3_confidence
 * anywhere the UI reads from -- see lib/server/labeling.ts's getQueueBatch
 * query, which never selects those columns. Model opinions stay out of
 * Jeremy's view entirely (anti-anchoring).
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/buildLabelingQueue.ts --queue-version v2
 *   bun run scripts/classify/buildLabelingQueue.ts --queue-version v2 --rebuild
 */
import { getPool, closePool } from "./db";

interface Args {
  queueVersion: string;
  rebuild: boolean;
  nRandom: number;
  nV1Include: number;
  nV1ExcludeReview: number;
  nBelowCutoff: number;
  nPublicRandom: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    queueVersion: get("--queue-version") ?? "v1",
    rebuild: a.includes("--rebuild"),
    nRandom: Number(get("--n-random") ?? 600),
    nV1Include: Number(get("--n-v1-include") ?? 400),
    nV1ExcludeReview: Number(get("--n-v1-exclude-review") ?? 300),
    nBelowCutoff: Number(get("--n-below-cutoff") ?? 400),
    nPublicRandom: Number(get("--n-public-random") ?? 400),
  };
}

/** mulberry32 -- tiny, deterministic, seeded PRNG. Good enough for a review
 * shuffle; not cryptographic, doesn't need to be. */
export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type QueueSource = "staging" | "public";

export interface QueueRow {
  post_url: string;
  bucket: string;
  source: QueueSource;
}

/** Dedupe by post_url, keeping the first row seen. Exported for testing
 * independent of the DB. */
export function dedupeQueueRows(rows: QueueRow[]): QueueRow[] {
  const seen = new Map<string, QueueRow>();
  for (const row of rows) {
    if (!seen.has(row.post_url)) seen.set(row.post_url, row);
  }
  return [...seen.values()];
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  if (args.rebuild) {
    const { rowCount } = await pool.query(`delete from label_queue where queue_version = $1`, [
      args.queueVersion,
    ]);
    console.log(`[build-queue] --rebuild: deleted ${rowCount} existing rows for queue_version=${args.queueVersion}`);
  } else {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::int as n from label_queue where queue_version = $1`,
      [args.queueVersion]
    );
    if (Number(rows[0].n) > 0) {
      console.error(
        `[build-queue] queue_version=${args.queueVersion} already has ${rows[0].n} rows -- pass --rebuild to replace it`
      );
      process.exit(1);
    }
  }

  // Every bucket excludes post_urls already in golden_set (ground truth
  // already exists -- don't re-spend a review slot) OR already labeled by
  // a prior human_post_labels row under ANY queue_version (a rebuild/new
  // version should surface fresh posts, not re-serve resolved ones).
  const alreadyResolvedSp = `
    not exists (select 1 from golden_set gs where gs.post_url = sp.post_url)
    and not exists (select 1 from human_post_labels hpl where hpl.post_url = sp.post_url)`;
  const alreadyResolvedCs = `
    not exists (select 1 from golden_set gs where gs.post_url = cs.post_url)
    and not exists (select 1 from human_post_labels hpl where hpl.post_url = cs.post_url)`;
  const alreadyResolvedP = `
    not exists (select 1 from golden_set gs where gs.post_url = p.url)
    and not exists (select 1 from human_post_labels hpl where hpl.post_url = p.url)`;

  const buckets: QueueRow[] = [];

  const { rows: randomRows } = await pool.query<{ post_url: string }>(
    `select sp.post_url from staging.instagram_posts sp
     where ${alreadyResolvedSp}
     order by random() limit $1`,
    [args.nRandom]
  );
  buckets.push(...randomRows.map((r) => ({ post_url: r.post_url, bucket: "random", source: "staging" as const })));

  const { rows: v1IncludeRows } = await pool.query<{ post_url: string }>(
    `select post_url from v1_content_corpus vc
     where not exists (select 1 from golden_set gs where gs.post_url = vc.post_url)
       and not exists (select 1 from human_post_labels hpl where hpl.post_url = vc.post_url)
     order by random() limit $1`,
    [args.nV1Include]
  );
  buckets.push(
    ...v1IncludeRows.map((r) => ({ post_url: r.post_url, bucket: "v1_include", source: "staging" as const }))
  );

  const { rows: v1ExcludeReviewRows } = await pool.query<{ post_url: string }>(
    `select cs.post_url
     from candidate_scores cs
     join lateral (
       select pcr.decision from post_classification_runs pcr
       where pcr.post_url = cs.post_url and pcr.classifier_version = 'v3'
       order by pcr.classified_at desc limit 1
     ) pc on true
     where cs.candidate_generation_version = 'candidate-score-v1'
       and cs.score >= 12
       and pc.decision in ('EXCLUDE', 'REVIEW')
       and ${alreadyResolvedCs}
     order by random()
     limit $1`,
    [args.nV1ExcludeReview]
  );
  buckets.push(
    ...v1ExcludeReviewRows.map((r) => ({
      post_url: r.post_url,
      bucket: "v1_exclude_review",
      source: "staging" as const,
    }))
  );

  // Genuinely untouched: score<12 (or unscored) AND no v3 run at all --
  // some low-score posts have a stray v3 run from unrelated ad-hoc work,
  // which would muddy "what is the score>=12 cutoff leaving behind" if
  // included here.
  const { rows: belowCutoffRows } = await pool.query<{ post_url: string }>(
    `select sp.post_url
     from staging.instagram_posts sp
     left join candidate_scores cs
       on cs.post_url = sp.post_url and cs.candidate_generation_version = 'candidate-score-v1'
     where (cs.post_url is null or cs.score < 12)
       and not exists (
         select 1 from post_classification_runs pcr
         where pcr.post_url = sp.post_url and pcr.classifier_version = 'v3'
       )
       and ${alreadyResolvedSp}
     order by random()
     limit $1`,
    [args.nBelowCutoff]
  );
  buckets.push(
    ...belowCutoffRows.map((r) => ({ post_url: r.post_url, bucket: "below_cutoff", source: "staging" as const }))
  );

  // Ben's venue_tagged corpus (public.posts) -- the live serving graph.
  // True random sample; the only prior human review of this corpus is the
  // 105-row D040/D042 non-wedding hand-flagging slice already in
  // golden_set (excluded here like everything else).
  const { rows: publicRandomRows } = await pool.query<{ post_url: string }>(
    `select p.url as post_url
     from posts p
     where ${alreadyResolvedP}
     order by random() limit $1`,
    [args.nPublicRandom]
  );
  buckets.push(
    ...publicRandomRows.map((r) => ({
      post_url: r.post_url,
      bucket: "public_posts_random",
      source: "public" as const,
    }))
  );

  // Dedupe by post_url, keeping the first row seen -- collisions should be
  // rare (staging and public are independently-scraped corpora with
  // effectively disjoint post_urls) but guard anyway.
  const deduped = dedupeQueueRows(buckets);

  const shuffled = seededShuffle(deduped, seedFromString(args.queueVersion));

  console.log(
    `[build-queue] queue_version=${args.queueVersion} pool=${buckets.length} deduped=${deduped.length}`
  );
  const bucketCounts: Record<string, number> = {};
  for (const r of deduped) bucketCounts[r.bucket] = (bucketCounts[r.bucket] ?? 0) + 1;
  for (const [b, n] of Object.entries(bucketCounts)) console.log(`  ${b}: ${n}`);

  for (let i = 0; i < shuffled.length; i++) {
    await pool.query(
      `insert into label_queue (post_url, queue_version, bucket, source, rank) values ($1, $2, $3, $4, $5)`,
      [shuffled[i].post_url, args.queueVersion, shuffled[i].bucket, shuffled[i].source, i + 1]
    );
  }

  console.log(`[build-queue] DONE -- inserted ${shuffled.length} rows into label_queue`);
  await closePool();
}

// Guarded so this module can be imported for unit-testing the pure
// helpers above (dedupeQueueRows, seededShuffle, ...) without triggering a
// live DB run as a side effect of the import. Portable entrypoint check
// (works under both `bun run` and vitest/Node) -- `import.meta.main` is
// Bun-specific and not in this repo's TS lib config.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
