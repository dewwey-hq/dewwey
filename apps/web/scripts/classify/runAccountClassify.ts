/**
 * Runs the account-archetype classifier (requirement 7) over vendor
 * accounts that have posts in staging.instagram_posts. Run this BEFORE
 * runClassify.ts so the account-level prior is available to attach to posts.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/runAccountClassify.ts --version v1 --limit 100
 *   bun run scripts/classify/runAccountClassify.ts --version v1 --for-source-notes dev_v1,heldout_v1
 *   bun run scripts/classify/runAccountClassify.ts --version v3 --post-urls-file data/canary_v3_3000.csv
 */
import { readFileSync } from "fs";
import { getPool, closePool } from "./db";
import { fetchVendorsForClassification } from "./source";
import { classifyAccount } from "./accountClassifier";
import { saveAccountClassification } from "./persist";
import { OpenRouterError } from "./openrouter";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    version: get("--version") ?? "v1",
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    concurrency: get("--concurrency") ? Number(get("--concurrency")) : 4,
    force: a.includes("--force"),
    forSourceNotes: get("--for-source-notes")?.split(",").map((s) => s.trim()),
    postUrlsFile: get("--post-urls-file"),
  };
}

function readPostUrls(path: string): string[] {
  const raw = readFileSync(path, "utf8").trim();
  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw) as Array<string | { post_url: string }>;
    return parsed.map((entry) => (typeof entry === "string" ? entry : entry.post_url));
  }
  // CSV (post_url as first column, with or without header) or plain newline list
  return raw
    .split("\n")
    .map((l) => l.split(",")[0].trim())
    .filter((u) => u.startsWith("http"));
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  let usernames: string[] | undefined;
  if (args.forSourceNotes) {
    const { rows } = await pool.query<{ owner_username: string | null }>(
      `select distinct sp.owner_username
       from staging.instagram_posts sp
       where sp.post_url = any(array(select post_url from golden_set where source_note = any($1::text[])))`,
      [args.forSourceNotes]
    );
    usernames = rows.map((r) => r.owner_username).filter((u): u is string => u != null);
    console.log(`[account-classify] scoped to ${usernames.length} owner_usernames from source_notes=${args.forSourceNotes.join(",")}`);
  } else if (args.postUrlsFile) {
    const postUrls = readPostUrls(args.postUrlsFile);
    const { rows } = await pool.query<{ owner_username: string | null }>(
      `select distinct owner_username from staging.instagram_posts where post_url = any($1::text[])`,
      [postUrls]
    );
    usernames = rows.map((r) => r.owner_username).filter((u): u is string => u != null);
    console.log(`[account-classify] scoped to ${usernames.length} owner_usernames from ${postUrls.length} posts in ${args.postUrlsFile}`);
  }

  let vendors = await fetchVendorsForClassification(pool, { limit: args.limit, usernames });

  if (!args.force) {
    // Skip anyone already classified under ANY version — account archetype is
    // reused across post-classifier versions (loadAccountArchetypes reads the
    // latest regardless of its own version tag), so re-running here for a new
    // post-classifier version shouldn't burn money re-deriving facts about an
    // account nothing has changed about.
    const { rows: already } = await pool.query<{ username: string }>(
      `select distinct lower(username::text) as username from account_classification_runs`
    );
    const done = new Set(already.map((r) => r.username));
    const before = vendors.length;
    vendors = vendors.filter((v) => !done.has(v.username.toLowerCase()));
    console.log(`[account-classify] ${before - vendors.length} already classified under ${args.version}, skipping (--force to redo)`);
  }
  console.log(`[account-classify] ${vendors.length} vendor accounts to classify`);

  const archetypeCounts: Record<string, number> = {};
  let succeeded = 0; // only incremented on an ACTUAL successful save — do not
  // derive this from `vendors.length - errored`, which silently over-counts
  // whatever the queue never got to attempt (verified live: a 3-consecutive-
  // failure abort left 2812 vendors NEVER attempted while that formula
  // reported them as "classified" — only 71 rows actually existed in the DB).
  let errored = 0;
  let consecutiveFailures = 0;
  let aborted = false;

  const queue = [...vendors];
  const workers = Array.from({ length: args.concurrency }, () =>
    (async () => {
      while (queue.length) {
        const v = queue.shift();
        if (!v) return;
        try {
          const result = await classifyAccount(
            {
              username: v.username,
              vendorName: v.vendorName,
              vendorCategory: v.vendorCategory,
              vendorAiSummary: v.vendorAiSummary,
              vendorRating: v.vendorRating,
              vendorReviewCount: v.vendorReviewCount,
              sampleCaptions: v.sampleCaptions,
            },
            args.version
          );
          await saveAccountClassification(pool, result);
          archetypeCounts[result.archetype] = (archetypeCounts[result.archetype] ?? 0) + 1;
          succeeded++;
          consecutiveFailures = 0;
        } catch (e) {
          errored++;
          consecutiveFailures++;
          const msg = e instanceof OpenRouterError ? `${e.status} ${e.body.slice(0, 200)}` : String(e);
          console.error(`[account-classify] ERROR @${v.username}: ${msg}`);
          if (consecutiveFailures >= 5) {
            console.error(`[account-classify] 5 consecutive failures — aborting (likely API/credits issue)`);
            aborted = true;
            queue.length = 0;
            return;
          }
        }
      }
    })()
  );
  await Promise.all(workers);

  console.log("[account-classify] DONE" + (aborted ? " (ABORTED EARLY)" : ""));
  console.log(`  attempted: ${succeeded + errored}/${vendors.length}, succeeded: ${succeeded}, errored: ${errored}`);
  if (succeeded + errored < vendors.length) {
    console.log(`  ${vendors.length - succeeded - errored} never attempted — rerun this command (idempotent skip means it'll only touch these)`);
  }
  console.log(`  archetypes:`, archetypeCounts);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
