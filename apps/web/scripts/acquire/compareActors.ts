/**
 * D063 Stage 0 -- is `apify/instagram-scraper` with `resultsType: "mentions"` equivalent to
 * `apify/instagram-tagged-scraper`, and does its `onlyPostsNewerThan` filter actually work?
 *
 * Why this exists. The tagged actor's entire input surface is `username[]` + `resultsLimit`
 * (verified against its own build schema via the Apify API, not inferred from our code), so a depth
 * pull always re-fetches -- and re-pays for -- posts we already hold. The D061 deepen tick wasted
 * $0.82 of $1.84 that way, 26-59% already-held per venue. The general `instagram-scraper` exposes
 * `onlyPostsNewerThan` AND a `mentions` results type documented as "Posts where a profile is
 * tagged. Same shape as a post, filtered to posts where a target profile is tagged" -- the same
 * content -- at the SAME price ($0.0023/result at our BRONZE tier, from `pricingInfos`).
 *
 * If the two are equivalent and the date filter works, every future depth or recency pull costs
 * marginal price instead of full price. That is worth far more than this test costs, and the docs
 * only *infer* the filter applies to mentions, so it gets measured rather than trusted.
 *
 * READ-ONLY with respect to our database: this never ingests, never writes posts, never touches
 * ops.*. It starts two paid Apify runs and compares what comes back against shortcodes we already
 * hold. Cost is bounded by `--results-limit` x the number of venues x 2 runs, and printed as a
 * projection before anything starts; `--dry-run` prints the projection and exits.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/compareActors.ts --dry-run
 *   bun run scripts/acquire/compareActors.ts --apply
 *   bun run scripts/acquire/compareActors.ts --apply --usernames a,b,c --results-limit 25 --since 2026-08-20
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { startRun, waitForRun, getDatasetItems, getMonthlyUsageUsd, PRICE_USD } from "./apifyClient";

/** The general scraper, which the ACTORS map in apifyClient.ts calls `own`. Named here so the
 * report is unambiguous about which actor produced which column. */
const GENERAL_ACTOR = "apify~instagram-scraper";
// D065: matches runTick.ts's stop; see the rationale there ($20 authorized overage).
const MONTHLY_STOP_USD = 48.5;

/** Default probe set: venues already pulled with the tagged actor, with >= 20 held posts, chosen to
 * span the follower range that D062 found predictive (615 / 4.4k / 8.8k followers). */
const DEFAULT_USERNAMES = ["belvederechateau1", "ivyroomchicago", "chicagowinery"];

interface HeldVenue {
  username: string;
  accountId: number;
  heldShortcodes: Set<string>;
  newestHeld: string | null;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Pure: given the items a run returned and the shortcodes we already hold, how much of this pull
 * was new? This is the number that decides whether incremental pulls are worth switching actors
 * for, so it is extracted and unit-tested rather than computed inline in a report string. */
export function overlapStats(
  returnedShortcodes: string[],
  held: Set<string>
): { returned: number; alreadyHeld: number; fresh: number; pctAlreadyHeld: number } {
  const returned = returnedShortcodes.length;
  const alreadyHeld = returnedShortcodes.filter((s) => held.has(s)).length;
  return {
    returned,
    alreadyHeld,
    fresh: returned - alreadyHeld,
    pctAlreadyHeld: returned === 0 ? 0 : Math.round((100 * alreadyHeld) / returned),
  };
}

/** Pure: does every returned item post-date the watermark?
 *
 * PINNED POSTS ARE EXEMPT, and that exemption is the whole reason this function takes items rather
 * than bare timestamps. Apify's own docs say "Pinned posts may still appear even with this filter
 * set", and the first live run confirmed it exactly: of 45 items returned under a 2026-08-22
 * cutoff, precisely one predated it -- `DbcXKLMtGZ3`, posted 2026-07-31, `isPinned: true`. A naive
 * "zero older items" rule called that a FAIL and would have cost us the incremental-pull path over
 * a single pinned photo. An UNPINNED item older than the cutoff is a real violation and still
 * fails, because it would mean the filter cannot be trusted for cost control. */
export function dateFilterHonoured(
  items: { timestamp?: string | null; isPinned?: boolean | null }[],
  since: string
): { total: number; olderUnpinned: number; olderPinned: number; honoured: boolean } {
  const cutoff = new Date(since).getTime();
  let olderUnpinned = 0;
  let olderPinned = 0;
  for (const it of items) {
    const t = it.timestamp ? new Date(it.timestamp).getTime() : NaN;
    if (Number.isNaN(t) || t >= cutoff) continue;
    if (it.isPinned === true) olderPinned++;
    else olderUnpinned++;
  }
  return { total: items.length, olderUnpinned, olderPinned, honoured: olderUnpinned === 0 };
}

async function loadHeld(usernames: string[]): Promise<HeldVenue[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    username: string;
    account_id: string;
    shortcodes: string[];
    newest_held: string | null;
  }>(
    `select a.username::text as username, a.id::text as account_id,
            coalesce(array_agg(distinct p.shortcode) filter (where p.shortcode is not null), '{}') as shortcodes,
            max(p.posted_at)::text as newest_held
       from accounts a
       join ops.post_observations o on o.seed_account_id = a.id
       join ops.crawl_runs r on r.id = o.run_id and r.feed = 'tagged'
       join posts p on p.id = o.post_id
      where a.username = any($1::citext[])
      group by a.username, a.id`,
    [usernames]
  );
  return rows.map((r) => ({
    username: r.username,
    accountId: Number(r.account_id),
    heldShortcodes: new Set(r.shortcodes),
    newestHeld: r.newest_held,
  }));
}

async function runMentions(
  usernames: string[],
  resultsLimit: number,
  since?: string
): Promise<Record<string, unknown>[]> {
  const input: Record<string, unknown> = {
    directUrls: usernames.map((u) => `https://www.instagram.com/${u}/`),
    resultsType: "mentions",
    resultsLimit,
  };
  if (since) input.onlyPostsNewerThan = since;
  const handle = await startRun(GENERAL_ACTOR, input);
  const status = await waitForRun(handle.runId, { timeoutMs: 15 * 60_000 });
  if (status.status !== "SUCCEEDED") {
    throw new Error(`run ${handle.runId} ended ${status.status}`);
  }
  return getDatasetItems(handle.datasetId);
}

/** Which venue an item belongs to. Mentions results carry the tagged profile in different places
 * depending on shape, so try the documented ones and fall back to a caption/mention scan. */
function attributeItem(item: Record<string, unknown>, usernames: string[]): string | null {
  const direct = [item.inputUrl, item.input, item.ownerUsername, item.queryUsername]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
  for (const u of usernames) if (direct.includes(u.toLowerCase())) return u;
  const blob = JSON.stringify(item).toLowerCase();
  for (const u of usernames) if (blob.includes(u.toLowerCase())) return u;
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const usernames = (arg("--usernames") ?? DEFAULT_USERNAMES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const resultsLimit = Number(arg("--results-limit") ?? "25");
  const sinceArg = arg("--since");

  const held = await loadHeld(usernames);
  if (held.length !== usernames.length) {
    console.warn(
      `[compare-actors] WARNING: only ${held.length} of ${usernames.length} usernames have held tagged posts; ` +
        `equivalence can only be judged for those.`
    );
  }
  // Default watermark: 30 days back. Deliberately NOT the newest held post -- that would return ~0
  // items and prove nothing. A month back should return a non-empty set that is strictly newer,
  // which tests both that the filter fires and that it does not over-filter.
  const since = sinceArg ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const projected = usernames.length * resultsLimit * PRICE_USD.own * 2;
  console.log(`[compare-actors] venues: ${usernames.join(", ")}`);
  console.log(`[compare-actors] resultsLimit=${resultsLimit} since=${since}`);
  console.log(`[compare-actors] projected cost: $${projected.toFixed(4)} (2 runs)`);
  for (const h of held) {
    console.log(`  @${h.username}: ${h.heldShortcodes.size} held shortcodes, newest ${h.newestHeld?.slice(0, 10) ?? "-"}`);
  }

  if (!apply) {
    console.log(`[compare-actors] DRY RUN -- no runs started. Re-run with --apply.`);
    await closePool();
    return;
  }

  const usage = await getMonthlyUsageUsd();
  if (usage + projected > MONTHLY_STOP_USD) {
    throw new Error(`[compare-actors] would breach the $${MONTHLY_STOP_USD} stop (usage $${usage.toFixed(2)} + $${projected.toFixed(2)})`);
  }
  console.log(`[compare-actors] apify usage before: $${usage.toFixed(4)}`);

  console.log(`[compare-actors] run A: mentions, NO date filter ...`);
  const itemsA = await runMentions(usernames, resultsLimit);
  console.log(`[compare-actors] run A returned ${itemsA.length} items`);

  console.log(`[compare-actors] run B: mentions, onlyPostsNewerThan=${since} ...`);
  const itemsB = await runMentions(usernames, resultsLimit, since);
  console.log(`[compare-actors] run B returned ${itemsB.length} items`);

  const usageAfter = await getMonthlyUsageUsd();
  const billed = usageAfter - usage;

  const lines: string[] = [
    `# D063 Stage 0 -- mentions vs tagged, and the date filter`,
    ``,
    `Generated ${new Date().toISOString()}. Read-only against our DB; two paid Apify runs.`,
    `Actor under test: \`${GENERAL_ACTOR}\` with \`resultsType: "mentions"\`.`,
    `Baseline: shortcodes already held from \`apify/instagram-tagged-scraper\` pulls.`,
    ``,
    `- run A (no date filter): **${itemsA.length}** items`,
    `- run B (onlyPostsNewerThan=${since}): **${itemsB.length}** items`,
    `- Apify usage before $${usage.toFixed(4)} -> after $${usageAfter.toFixed(4)} = **$${billed.toFixed(4)} billed**`,
    `- billed per item: $${(billed / Math.max(itemsA.length + itemsB.length, 1)).toFixed(5)} (PRICE_USD assumes $${PRICE_USD.own})`,
    ``,
    `## Q1. Is \`mentions\` the same content as the tagged actor?`,
    ``,
    `| venue | held (tagged) | run A returned | of which already held | overlap % |`,
    `|---|---|---|---|---|`,
  ];

  let totalA = 0, totalOverlap = 0;
  for (const h of held) {
    const mine = itemsA.filter((it) => attributeItem(it, usernames) === h.username);
    const codes = mine.map((it) => String(it.shortCode ?? ""));
    const st = overlapStats(codes, h.heldShortcodes);
    totalA += st.returned;
    totalOverlap += st.alreadyHeld;
    lines.push(
      `| @${h.username} | ${h.heldShortcodes.size} | ${st.returned} | ${st.alreadyHeld} | ${st.pctAlreadyHeld}% |`
    );
  }
  lines.push(
    ``,
    `Overall overlap: **${totalA === 0 ? 0 : Math.round((100 * totalOverlap) / totalA)}%** of run A's items were already held.`,
    `A high overlap means the two actors surface the same feed (we already hold ~100 recent posts`,
    `per venue, so most of a fresh 25-post pull SHOULD be familiar). A near-zero overlap would mean`,
    `\`mentions\` is a different content type and the swap is unsafe.`,
    ``,
    `## Q2. Does \`onlyPostsNewerThan\` actually filter?`,
    ``
  );

  const df = dateFilterHonoured(
    itemsB.map((it) => ({
      timestamp: typeof it.timestamp === "string" ? it.timestamp : null,
      isPinned: typeof it.isPinned === "boolean" ? it.isPinned : null,
    })),
    since
  );
  lines.push(
    `- items returned: ${df.total}`,
    `- UNPINNED items older than ${since}: **${df.olderUnpinned}** (real violations)`,
    `- pinned items older than ${since}: ${df.olderPinned} (documented exception, harmless)`,
    `- filter honoured: **${df.honoured ? "YES" : "NO"}**`,
    `- run B / run A item ratio: ${itemsA.length === 0 ? "n/a" : (itemsB.length / itemsA.length).toFixed(2)}`,
    ``,
    df.honoured && itemsB.length < itemsA.length
      ? `**PASS** -- the filter fires and returns strictly newer posts (pinned posts excepted, as Apify documents). Incremental depth pulls are viable: a deepen tick can skip everything it already holds instead of re-paying for it.`
      : df.honoured && itemsB.length >= itemsA.length
        ? `**INCONCLUSIVE** -- nothing older came back, but the filter did not reduce the result count. Re-run with an older \`--since\` before relying on it.`
        : `**FAIL** -- UNPINNED items older than the cutoff came back. The filter cannot be relied on for cost control; keep the tagged actor and defer incremental depth.`,
    ``,
    `## Cost note`,
    ``,
    `Both actors bill per result written to the dataset at the same tiered rate (BRONZE $0.0023).`,
    `Switching actors is therefore cost-neutral per result; the saving comes entirely from fetching`,
    `fewer results.`
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const path = `scripts/graph/tmp_analysis/d063_actor_comparison_${stamp}.md`;
  writeFileSync(path, lines.join("\n") + "\n");
  writeFileSync(
    path.replace(/\.md$/, ".json"),
    JSON.stringify({ since, resultsLimit, usernames, billed, itemsA: itemsA.length, itemsB: itemsB.length, dateFilter: df }, null, 2)
  );
  console.log("\n" + lines.join("\n"));
  console.log(`\n[compare-actors] wrote ${path}`);
  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
