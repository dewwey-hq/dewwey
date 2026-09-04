/**
 * Orchestrator: cost-aware tiered classification.
 *
 *   deterministic (free)
 *     -> confident EXCLUDE: done
 *     -> else: cheap_model (haiku)
 *          -> EXCLUDE: trust it (a wrongly-excluded good post is a false
 *             negative — acceptable; see mission's precision tenet)
 *          -> INCLUDE or REVIEW: escalate to expensive_model (sonnet) for
 *             confirmation, since precision of INCLUDE is the primary
 *             optimization target and a cheap model's "yes" is exactly the
 *             risky case
 *
 * Every tier's attempt is persisted (append-only) even when a later tier
 * overrides it — that's what makes cost/accuracy-by-tier analyzable later.
 * A post whose input_hash is unchanged since its last run under THIS
 * classifier_version is skipped (idempotent reruns).
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/runClassify.ts --limit 200 --version v1
 *   bun run scripts/classify/runClassify.ts --post-urls-file golden_urls.txt --version v1
 *   bun run scripts/classify/runClassify.ts --limit 500 --random --version v1 --max-cost 5
 */
import { getPool, closePool } from "./db";
import {
  fetchPosts,
  loadKnownVendors,
  attachKnownMentions,
  loadAccountArchetypes,
  attachAccountArchetype,
  type PostContext,
} from "./source";
import * as prefilter from "./prefilter";
import * as llm from "./llmClassifier";
import { saveClassification, loadExistingHashes } from "./persist";
import { inputHash, type ClassificationResult } from "./contract";
import { OpenRouterError } from "./openrouter";
import { readFileSync } from "fs";

interface Args {
  limit?: number;
  offset?: number;
  random?: boolean;
  version: string;
  maxCostUsd?: number;
  postUrlsFile?: string;
  skipUnchanged: boolean;
  concurrency: number;
  deterministicOnly: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    offset: get("--offset") ? Number(get("--offset")) : undefined,
    random: a.includes("--random"),
    version: get("--version") ?? "v1",
    maxCostUsd: get("--max-cost") ? Number(get("--max-cost")) : undefined,
    postUrlsFile: get("--post-urls-file"),
    skipUnchanged: !a.includes("--force"),
    concurrency: get("--concurrency") ? Number(get("--concurrency")) : 4,
    deterministicOnly: a.includes("--deterministic-only"),
  };
}

async function processOne(
  ctx: PostContext,
  version: string,
  spendState: { total: number; consecutiveFailures: number },
  deterministicOnly: boolean
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];

  const det = prefilter.classify(ctx);
  if (det) {
    det.classifier_version = version; // tag with the run's overall version; det logic itself is prefilter.PREFILTER_VERSION-stable
    results.push(det);
    return results;
  }

  if (deterministicOnly) {
    return results; // empty: not resolved by the deterministic tier, LLM tiers intentionally skipped
  }

  const cheap = await llm.classify(ctx, { model: llm.MODEL_CHEAP, tier: "cheap_model", classifierVersion: version });
  results.push(cheap);
  spendState.total += cheap.cost_usd ?? 0;

  if (cheap.decision === "EXCLUDE") {
    return results;
  }

  // INCLUDE or REVIEW from the cheap tier — escalate for confirmation.
  const expensive = await llm.classify(ctx, {
    model: llm.MODEL_EXPENSIVE,
    tier: "expensive_model",
    classifierVersion: version,
  });
  results.push(expensive);
  spendState.total += expensive.cost_usd ?? 0;
  return results;
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  console.log(`[classify] version=${args.version} limit=${args.limit ?? "all"} random=${!!args.random}`);

  const [known, archetypes, existingHashes] = await Promise.all([
    loadKnownVendors(pool),
    loadAccountArchetypes(pool),
    args.skipUnchanged ? loadExistingHashes(pool, args.version) : Promise.resolve(new Map<string, string>()),
  ]);
  console.log(`[classify] known vendor accounts: ${known.size}, account archetypes: ${archetypes.size}`);

  let postUrls: string[] | undefined;
  if (args.postUrlsFile) {
    const raw = readFileSync(args.postUrlsFile, "utf8").trim();
    if (raw.startsWith("[")) {
      // JSON array — either bare strings or {post_url, ...} objects (e.g. a merged golden-set labels file)
      const parsed = JSON.parse(raw) as Array<string | { post_url: string }>;
      postUrls = parsed.map((entry) => (typeof entry === "string" ? entry : entry.post_url));
    } else {
      // CSV (post_url as first column, with or without header) or a plain newline list of URLs
      postUrls = raw
        .split("\n")
        .map((l) => l.split(",")[0].trim())
        .filter((u) => u.startsWith("http"));
    }
  }

  const posts = await fetchPosts(pool, {
    limit: args.limit,
    offset: args.offset,
    randomSample: args.random,
    postUrls,
  });
  console.log(`[classify] fetched ${posts.length} posts`);

  const spendState = { total: 0, consecutiveFailures: 0 };
  const tierCounts: Record<string, number> = {};
  const decisionCounts: Record<string, number> = {};
  let skipped = 0;
  let errored = 0;
  let processed = 0; // only incremented on an ACTUAL completed attempt — do
  // not derive this from posts.length - skipped - errored, which silently
  // over-counts whatever the queue never got to attempt if a run aborts
  // early (verified live in runAccountClassify.ts's equivalent bug).
  let aborted = false;

  const queue = [...posts];
  const workers = Array.from({ length: args.concurrency }, () =>
    (async () => {
      while (queue.length) {
        if (args.maxCostUsd && spendState.total >= args.maxCostUsd) return;
        const ctx = queue.shift();
        if (!ctx) return;
        attachKnownMentions(ctx, known);
        attachAccountArchetype(ctx, archetypes);

        const hash = inputHash({
          caption: ctx.caption,
          hashtags: ctx.hashtags,
          mentions: ctx.mentions,
          location_tag: ctx.location_tag,
          account: {
            category: ctx.vendor_category,
            rating: ctx.vendor_rating,
            archetype: ctx.account_archetype,
          },
        });

        if (args.skipUnchanged && existingHashes.get(ctx.post_url) === hash) {
          skipped++;
          continue;
        }

        try {
          const results = await processOne(ctx, args.version, spendState, args.deterministicOnly);
          for (const r of results) {
            await saveClassification(pool, r, hash);
            tierCounts[r.tier] = (tierCounts[r.tier] ?? 0) + 1;
          }
          const final = results[results.length - 1];
          if (final) decisionCounts[final.decision] = (decisionCounts[final.decision] ?? 0) + 1;
          else decisionCounts["(deferred)"] = (decisionCounts["(deferred)"] ?? 0) + 1;
          processed++;
          spendState.consecutiveFailures = 0;
        } catch (e) {
          errored++;
          spendState.consecutiveFailures++;
          const msg = e instanceof OpenRouterError ? `${e.status} ${e.body.slice(0, 200)}` : String(e);
          console.error(`[classify] ERROR ${ctx.post_url}: ${msg}`);
          if (spendState.consecutiveFailures >= 5) {
            console.error(`[classify] 5 consecutive failures — aborting run (likely API/credits issue)`);
            aborted = true;
            queue.length = 0;
            return;
          }
        }
      }
    })()
  );
  await Promise.all(workers);

  console.log("[classify] DONE" + (aborted ? " (ABORTED EARLY)" : ""));
  console.log(`  processed: ${processed}, skipped(unchanged): ${skipped}, errored: ${errored}, of ${posts.length} fetched`);
  if (processed + skipped + errored < posts.length) {
    console.log(`  ${posts.length - processed - skipped - errored} never attempted — rerun this command (idempotent skip means it'll only touch these)`);
  }
  console.log(`  tier counts:`, tierCounts);
  console.log(`  final decision counts:`, decisionCounts);
  console.log(`  spend: $${spendState.total.toFixed(4)}`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
