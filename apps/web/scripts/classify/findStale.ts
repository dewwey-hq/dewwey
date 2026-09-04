/**
 * Finds posts that are good candidates for re-evaluation, and prints a
 * plain URL list ready to feed straight into:
 *   bun run scripts/classify/runClassify.ts --version <new> --post-urls-file <this output>
 *
 * Three independent criteria (OR'd together — a post matching any one is a
 * candidate), each answering a different "why would we want to touch this
 * post again" question:
 *
 *   --behind <version>   posts whose CURRENT classification is under a
 *                        version other than <version> — i.e. never touched
 *                        by the newest classifier. This is what makes
 *                        "selectively reclassify existing posts" concrete:
 *                        point a new classifier_version at exactly the set
 *                        of posts it hasn't seen yet, not the whole corpus.
 *   --max-confidence N   current decision's confidence is below N (default
 *                        off) — low-confidence calls a better model/prompt
 *                        might resolve.
 *   --older-than-days N  current classification's classified_at is more
 *                        than N days old (default off) — even a
 *                        high-confidence call from months ago is worth a
 *                        second look once the prompt/model has moved on.
 *
 * Explicitly NOT included here: a post's own age (posted_at). An old real
 * wedding needing re-classification is about the CLASSIFIER being stale
 * (classified_at, or an outdated classifier_version), never about the POST
 * being old — see llmClassifier.ts's system prompt for the same principle
 * applied inside a single classification.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/findStale.ts --behind v2 > to_reclassify.txt
 *   bun run scripts/classify/findStale.ts --max-confidence 0.6 --older-than-days 30
 */
import { getPool, closePool } from "./db";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    behind: get("--behind"),
    maxConfidence: get("--max-confidence") ? Number(get("--max-confidence")) : undefined,
    olderThanDays: get("--older-than-days") ? Number(get("--older-than-days")) : undefined,
    urlsOnly: a.includes("--urls-only"),
  };
}

async function main() {
  const args = parseArgs();
  if (!args.behind && args.maxConfidence === undefined && args.olderThanDays === undefined) {
    console.error("pass at least one of --behind <version>, --max-confidence N, --older-than-days N");
    process.exit(1);
  }
  const pool = getPool();

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (args.behind) {
    params.push(args.behind);
    conditions.push(`classifier_version <> $${params.length}`);
  }
  if (args.maxConfidence !== undefined) {
    params.push(args.maxConfidence);
    conditions.push(`confidence < $${params.length}`);
  }
  if (args.olderThanDays !== undefined) {
    params.push(args.olderThanDays);
    conditions.push(`classified_at < now() - ($${params.length} || ' days')::interval`);
  }

  const { rows } = await pool.query<{
    post_url: string;
    classifier_version: string;
    decision: string;
    confidence: number;
    classified_at: string;
  }>(
    `select post_url, classifier_version, decision, confidence, classified_at
     from post_classifications_current
     where ${conditions.join(" or ")}
     order by classified_at asc`,
    params
  );

  if (args.urlsOnly) {
    for (const r of rows) console.log(r.post_url);
  } else {
    console.error(`[find-stale] ${rows.length} candidates (behind=${args.behind ?? "-"} max-confidence=${args.maxConfidence ?? "-"} older-than-days=${args.olderThanDays ?? "-"})`);
    for (const r of rows) {
      console.log(`${r.post_url}  version=${r.classifier_version} decision=${r.decision} confidence=${r.confidence} classified_at=${r.classified_at}`);
    }
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
