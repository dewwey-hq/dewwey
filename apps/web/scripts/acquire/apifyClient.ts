/**
 * ACQUISITION LOOP (D061) — thin REST client over the Apify API (no SDK dependency, plain
 * fetch, same house style as scripts/venue-details/crawl/r2.ts using Bun.S3Client directly
 * instead of an SDK). Every call is read-only against Apify except startRun, which launches a
 * paid actor run — runTick.ts is the only caller of startRun and it gates cost first.
 *
 * process.env.APIFY_API_TOKEN — NEVER logged. Every function accepts/returns only run/dataset
 * ids, status, and cost numbers.
 *
 * Usage: import { startRun, waitForRun, getDatasetItems, getMonthlyUsageUsd, buildInput,
 * estimateCostUsd, ACTORS, PRICE_USD } from "./apifyClient" — no CLI entrypoint of its own.
 */

const API_BASE = "https://api.apify.com/v2";

function token(): string {
  const t = process.env.APIFY_API_TOKEN;
  if (!t) {
    throw new Error("APIFY_API_TOKEN is not set — run from apps/web so Bun loads .env.local");
  }
  return t;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${token()}` };
}

// Accepts either `apify~instagram-tagged-scraper` (API path form) or
// `apify/instagram-tagged-scraper` (the form actors are usually written in) and converts.
function actorPath(actorId: string): string {
  return actorId.replace("/", "~");
}

/**
 * Actor ids in the API-path form (`~`, not `/`). Verified live against
 * GET /v2/acts/apify~instagram-profile-scraper/builds/default (2026-09-19): that actor's
 * inputSchema.required is exactly ["usernames"] — confirms buildInput's `profile` shape below.
 */
export const ACTORS = {
  tagged: "apify~instagram-tagged-scraper",
  own: "apify~instagram-scraper",
  profile: "apify~instagram-profile-scraper",
  // D065: the SAME content as `tagged` -- apify/instagram-scraper's `mentions` results type is
  // documented as "Posts where a profile is tagged", and D063 Stage 0 measured 99% overlap with
  // the tagged actor over 3 venues (74 of 75 items already held). The reason to prefer it is that
  // it accepts `onlyPostsNewerThan`, which the tagged actor has no equivalent for at all, at the
  // same per-result price. Use this for any pull that should stop at a date.
  mentions: "apify~instagram-scraper",
} as const;
export type Feed = keyof typeof ACTORS;

// Per-result price, BRONZE tier. Reconciled against real usage via getMonthlyUsageUsd().
//
// D065 (2026-09-21) CORRECTS D063. D063 claimed we were billed $0.001918/item (SILVER) and that
// every "$ per wedding" figure we publish was therefore ~21% overstated. That was wrong, and the
// mistake is worth keeping because it is easy to repeat: the claim came from a 120-item run, and a
// ~$0.23 delta read off a lagging monthly-usage API is noise, not a rate.
//
// Measured again on samples big enough to mean something:
//   120 items   -> $0.00192/item   (too small to trust)
//   113 items   -> $0.00204/item   (too small to trust)
//   1,000 items -> $0.00234
//   1,500 items -> $0.00233
//   1,000 items -> $0.00230
//   3,500 items in aggregate -> **$0.00232/item**, i.e. BRONZE $0.0023.
//
// So this constant was right all along. Rule of thumb that follows: never infer a unit rate from a
// usage delta under ~1,000 items.
//
// The tier table still holds if volume ever justifies a plan change:
// FREE $0.0027 · BRONZE $0.0023 · SILVER $0.0019 · GOLD $0.0015 · PLATINUM $0.0009 · DIAMOND $0.0005.
export const PRICE_USD: Record<Feed, number> = {
  tagged: 0.0023,
  own: 0.0023,
  profile: 0.0023,
  mentions: 0.0023,
};

export interface RunHandle {
  runId: string;
  datasetId: string;
  status: string;
}

export interface RunStatus {
  runId: string;
  datasetId: string;
  status: string;
  finishedAt: string | null;
}

/** POST /v2/acts/{actorId}/runs — starts a paid actor run. The only non-read-only call here. */
export async function startRun(
  actorId: string,
  input: Record<string, unknown>,
  opts: { waitForFinishSecs?: number } = {}
): Promise<RunHandle> {
  const params = new URLSearchParams();
  if (opts.waitForFinishSecs) params.set("waitForFinish", String(opts.waitForFinishSecs));
  const url = `${API_BASE}/acts/${actorPath(actorId)}/runs${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`apify startRun ${actorId} failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: { id: string; defaultDatasetId: string; status: string } };
  return { runId: body.data.id, datasetId: body.data.defaultDatasetId, status: body.data.status };
}

/** GET /v2/actor-runs/{runId} — read-only. */
export async function getRun(runId: string): Promise<RunStatus> {
  const res = await fetch(`${API_BASE}/actor-runs/${runId}`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`apify getRun ${runId} failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data: { id: string; defaultDatasetId: string; status: string; finishedAt: string | null };
  };
  return {
    runId: body.data.id,
    datasetId: body.data.defaultDatasetId,
    status: body.data.status,
    finishedAt: body.data.finishedAt,
  };
}

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

/** Polls GET /v2/actor-runs/{runId} until a terminal status or timeoutMs elapses. Read-only. */
export async function waitForRun(
  runId: string,
  opts: { pollMs?: number; timeoutMs: number }
): Promise<RunStatus> {
  const pollMs = opts.pollMs ?? 15_000;
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    const status = await getRun(runId);
    if (TERMINAL_STATUSES.has(status.status)) return status;
    if (Date.now() >= deadline) return status; // caller decides how to treat a non-terminal timeout
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** GET /v2/datasets/{id}/items — paginated (limit=1000), clean=true (drops Apify metadata keys). */
export async function getDatasetItems(datasetId: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const url = `${API_BASE}/datasets/${datasetId}/items?clean=true&format=json&offset=${offset}&limit=${pageSize}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(`apify getDatasetItems ${datasetId} failed: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as Record<string, unknown>[];
    items.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return items;
}

/** GET /v2/users/me/limits — read-only; used by runTick.ts to enforce the $28.50 stop. */
export async function getMonthlyUsageUsd(): Promise<number> {
  const res = await fetch(`${API_BASE}/users/me/limits`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`apify getMonthlyUsageUsd failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: { current: { monthlyUsageUsd: number } } };
  return body.data.current.monthlyUsageUsd;
}

/** Pure: builds the exact actor input per feed. No I/O, no env access. */
export function buildInput(
  feed: Feed,
  usernames: string[],
  opts: { resultsLimit: number; onlyPostsNewerThan?: string }
): Record<string, unknown> {
  if (feed === "tagged") {
    // D063: FAIL LOUDLY instead of silently dropping a date filter this actor cannot apply.
    //
    // apify/instagram-tagged-scraper's entire input surface is `username[]` + `resultsLimit`
    // (verified against its own builds/default inputSchema, 2026-09-20) -- no cursor, offset or
    // date parameter exists. Before this throw, runTick.ts passed `onlyNewerThan` in here
    // unconditionally and the key was quietly discarded: the caller paid full price for a complete
    // re-pull and saw a successful run. STATE.md's own guidance ("the next deepening should use
    // --only-newer-than") would have done exactly that. A silent no-op on a metered API is the
    // expensive kind of bug, so it is now impossible to make by accident.
    //
    // For an incremental pull of the same content, use the `mentions` results type on the general
    // scraper (see ACTORS.own), which does support onlyPostsNewerThan at the same per-result price.
    if (opts.onlyPostsNewerThan) {
      throw new Error(
        `buildInput: the tagged actor (${ACTORS.tagged}) has no date filter -- it accepts only ` +
          `username[] and resultsLimit, so onlyPostsNewerThan=${opts.onlyPostsNewerThan} would be ` +
          `silently ignored and the full result set billed. Use feed 'own' with resultsType ` +
          `'mentions' for an incremental pull of the same content.`
      );
    }
    return { username: usernames, resultsLimit: opts.resultsLimit };
  }
  if (feed === "own" || feed === "mentions") {
    const input: Record<string, unknown> = {
      directUrls: usernames.map((u) => `https://www.instagram.com/${u}/`),
      // `posts` = what this account posted; `mentions` = posts where it is TAGGED by others.
      // The venue graph is built from the latter -- a venue's own feed is marketing (D055
      // measured 0.056 w/post on venue own-profiles), while its tagged feed is vendor recaps.
      resultsType: feed === "mentions" ? "mentions" : "posts",
      resultsLimit: opts.resultsLimit,
    };
    if (opts.onlyPostsNewerThan) input.onlyPostsNewerThan = opts.onlyPostsNewerThan;
    return input;
  }
  // profile: verified live 2026-09-19 against the actor's builds/default inputSchema —
  // required key is exactly "usernames" (see ACTORS comment above).
  return { usernames };
}

/** Pure: projects the $ cost of a run before it's started. */
export function estimateCostUsd(feed: Feed, usernameCount: number, resultsLimit: number): number {
  if (feed === "profile") return usernameCount * PRICE_USD.profile;
  return usernameCount * resultsLimit * PRICE_USD[feed];
}
