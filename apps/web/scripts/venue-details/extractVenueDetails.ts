/**
 * VenueDetails v3 extraction (D060 Phase 2, part A): per-account two-tool-call extraction
 * (SPINE_TOOL + PRICING_TOOL, `venueDetailsPrompt.ts`) via OpenRouter (`../classify/openrouter.ts`'s
 * `callTool`, same house style as `../classify/runExtract.ts`). Loads the account's latest crawl
 * (local cache manifest first -- `crawl/cache.ts` -- else `venue_source_snapshots` rows +
 * `crawl/r2.ts`'s `getSnapshotText`), builds a deterministic document (`venueDetailsPrompt.ts`'s
 * `buildDocument`), computes `input_hash` (`lib/venueDetails/inputHash.ts`) and skips a venue
 * whose hash already has a `stage='extract'` run unless `--force`. Writes the RAW two-call output
 * to `venue_details_runs.result` (`contract.ts`'s `VenueDetailsRunResult`) -- `validateVenueDetails.ts`
 * assembles/validates it into a `VenueDetailsV3` in a separate pass.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/extractVenueDetails.ts --dry-run --account-ids 477
 *   bun run scripts/venue-details/extractVenueDetails.ts --golden --dry-run
 *   bun run scripts/venue-details/extractVenueDetails.ts --golden --max-cost-usd 2
 *   bun run scripts/venue-details/extractVenueDetails.ts --from-websites --limit 20 --max-cost-usd 10
 *   bun run scripts/venue-details/extractVenueDetails.ts --account-ids 477 --website-override https://greenhouseloft.com/ --cache-only --dry-run
 *   bun run scripts/venue-details/extractVenueDetails.ts --golden --pilot   # NOT run in this task -- real OpenRouter calls
 */
import type { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { MODEL_CHEAP } from "../classify/llmClassifier";
import { callTool, OpenRouterError, type ToolCallResult } from "../classify/openrouter";
import { GOLDEN_ACCOUNT_IDS, GOLDEN_SLUGS } from "../../lib/venueDetails/golden";
import { VENUE_DETAILS_SCHEMA_VERSION } from "../../lib/venueDetails/types";
import { inputHash } from "../../lib/venueDetails/inputHash";
import { readManifest, readCacheText } from "./crawl/cache";
import { parseAssetsBlock } from "./crawl/htmlText";
import { getSnapshotText, snapshotKey } from "./crawl/r2";
import {
  PRICING_TOOL,
  SPINE_TOOL,
  SYSTEM_PROMPT_PRICING,
  SYSTEM_PROMPT_SPINE,
  VENUE_DETAILS_PROMPT_VERSION,
  buildDocument,
  buildPricingUserMessage,
  buildSpineUserMessage,
  validateShape,
  type AssetCandidate,
  type DocPage,
  type JsonSchema,
  type SpineUserMessageCtx,
} from "./venueDetailsPrompt";
import type { RawPricingResult, RawSpineResult, VenueDetailsRunResult } from "./contract";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  accountIds: number[] | null;
  golden: boolean;
  fromWebsites: boolean;
  limit: number | null;
  model: string;
  maxInputChars: number;
  skipPricing: boolean;
  maxCostUsd: number;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
  cacheOnly: boolean;
  websiteOverride: string | null;
  pilot: boolean;
  singleCall: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const accountIdsRaw = get("--account-ids");
  const websiteOverride = get("--website-override") ?? null;
  const accountIds = accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null;
  if (websiteOverride && (!accountIds || accountIds.length !== 1)) {
    console.error("[extract-venue-details] --website-override requires exactly one --account-ids value.");
    process.exit(1);
  }
  return {
    accountIds,
    golden: a.includes("--golden"),
    fromWebsites: a.includes("--from-websites"),
    limit: get("--limit") ? Number(get("--limit")) : null,
    model: get("--model") ?? MODEL_CHEAP,
    maxInputChars: Number(get("--max-input-chars") ?? 240_000), // ~60k tokens; Field Museum needed 153k chars, Langham 325k
    skipPricing: a.includes("--skip-pricing"),
    maxCostUsd: Number(get("--max-cost-usd") ?? 10),
    concurrency: Number(get("--concurrency") ?? 2),
    dryRun: a.includes("--dry-run"),
    force: a.includes("--force"),
    cacheOnly: a.includes("--cache-only"),
    websiteOverride,
    pilot: a.includes("--pilot"),
    singleCall: a.includes("--single-call"),
  };
}

// ---------------------------------------------------------------------------
// Venue selection
// ---------------------------------------------------------------------------

interface VenueTarget {
  accountId: number;
  websiteUrl: string | null;
  name: string;
}

async function selectVenues(pool: Pool | null, args: Args): Promise<VenueTarget[]> {
  if (args.websiteOverride) {
    const accountId = args.accountIds![0];
    const name = pool ? await lookupName(pool, accountId) : `account ${accountId}`;
    return [{ accountId, websiteUrl: args.websiteOverride, name }];
  }

  if (args.golden) {
    const ids = GOLDEN_SLUGS.map((slug) => ({ slug, accountId: GOLDEN_ACCOUNT_IDS[slug] }));
    if (!pool) return ids.map(({ slug, accountId }) => ({ accountId, websiteUrl: null, name: slug }));
    const { rows } = await pool.query<{ account_id: string; url: string }>(
      `select account_id::text as account_id, url from venue_websites where account_id = any($1::bigint[])`,
      [ids.map((i) => i.accountId)]
    );
    const urlByAccount = new Map(rows.map((r) => [Number(r.account_id), r.url]));
    return ids.map(({ slug, accountId }) => ({ accountId, websiteUrl: urlByAccount.get(accountId) ?? null, name: slug }));
  }

  if (args.accountIds) {
    if (!pool) return args.accountIds.map((accountId) => ({ accountId, websiteUrl: null, name: `account ${accountId}` }));
    const { rows } = await pool.query<{ account_id: string; url: string }>(
      `select account_id::text as account_id, url from venue_websites where account_id = any($1::bigint[])`,
      [args.accountIds]
    );
    const urlByAccount = new Map(rows.map((r) => [Number(r.account_id), r.url]));
    const names = await lookupNames(pool, args.accountIds);
    return args.accountIds.map((accountId) => ({ accountId, websiteUrl: urlByAccount.get(accountId) ?? null, name: names.get(accountId) ?? `account ${accountId}` }));
  }

  if (args.fromWebsites) {
    if (!pool) {
      console.error("[extract-venue-details] --from-websites requires a DB connection.");
      process.exit(1);
    }
    const { rows } = await pool.query<{ account_id: string; url: string }>(
      `select account_id::text as account_id, url from venue_websites where status in ('verified', 'candidate') order by account_id limit $1`,
      [args.limit ?? 1000]
    );
    const ids = rows.map((r) => Number(r.account_id));
    const names = await lookupNames(pool, ids);
    return rows.map((r) => ({ accountId: Number(r.account_id), websiteUrl: r.url, name: names.get(Number(r.account_id)) ?? `account ${r.account_id}` }));
  }

  console.error("[extract-venue-details] pass --account-ids <ids>, --golden, or --from-websites.");
  process.exit(1);
}

async function lookupName(pool: Pool, accountId: number): Promise<string> {
  const names = await lookupNames(pool, [accountId]);
  return names.get(accountId) ?? `account ${accountId}`;
}

async function lookupNames(pool: Pool, accountIds: number[]): Promise<Map<number, string>> {
  if (accountIds.length === 0) return new Map();
  const { rows } = await pool.query<{ id: string; full_name: string | null; username: string }>(
    `select id::text as id, full_name, username::text as username from accounts where id = any($1::bigint[])`,
    [accountIds]
  );
  return new Map(rows.map((r) => [Number(r.id), r.full_name ?? r.username]));
}

// ---------------------------------------------------------------------------
// Page loading: local cache manifest first, else DB snapshot rows + R2 text.
// ---------------------------------------------------------------------------

/** Output budget per tool call. 16k was not enough for Diamond Garden / LondonHouse at v3.1
 * (finish_reason=length, tick c2, 2026-09-20): the spine payload for a venue with many spaces,
 * inclusions and FAQs runs past it. Output tokens are the cost driver ($5/M on Haiku), so this is
 * a ceiling, not a target. */
const EXTRACT_MAX_TOKENS = 48_000; // Diamond Garden's pricing payload ran to 67k chars (~32k tokens) before the FAQ cap; 48k is the ceiling, the prompt's 30-FAQ cap is the fix

export interface LoadedPages {
  pages: DocPage[];
  snapshotIds: number[];
  snapshotShas: string[];
  assetCandidates: AssetCandidate[];
}

/** A homepage is queued at `Number.POSITIVE_INFINITY` in `crawlVenue.ts` (fetched first,
 * regardless of URL scoring) -- that serializes to `null` through JSON (manifest.json), so a
 * null `score` at depth 0 means "highest priority," never "unscored" (which only happens at
 * depth 0 by construction of the crawl). */
function pageScore(entry: { score: number | null; depth: number }): number {
  if (entry.score != null) return entry.score;
  return entry.depth === 0 ? 1_000_000 : 0;
}

function assetCandidateFor(entry: { url: string; kind: "html" | "pdf"; title: string | null }): AssetCandidate | null {
  if (entry.kind !== "pdf") return null;
  const fallback = entry.url.split("/").pop() || entry.url;
  return { url: entry.url, anchorText: entry.title ?? fallback, kind: "pdf" };
}

/** D061 resources fix: every non-PDF asset (video/virtual_tour/floor_plan) a page's own
 * "--- ASSETS ---" block names (`crawl/htmlText.ts`'s `extractHtml`), pulled out of the FULL
 * cached text up front so they survive `buildDocument`'s per-page truncation/drop -- the
 * consolidated ASSET CANDIDATES block is always appended in full, regardless of which pages made
 * the cut. */
function pageAssetCandidates(pageUrl: string, text: string): AssetCandidate[] {
  return parseAssetsBlock(text).map((a) => ({ url: a.url, anchorText: a.label || pageUrl, kind: a.kind }));
}

/** Dedupe by URL, keeping the first occurrence (a PDF/manifest-derived candidate, when both exist
 * for the same URL, arrives before that page's own ASSETS-block candidates below it). */
function dedupeAssetCandidates(candidates: AssetCandidate[]): AssetCandidate[] {
  const seen = new Set<string>();
  const out: AssetCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

async function loadFromManifest(accountId: number): Promise<LoadedPages | null> {
  const manifest = await readManifest(accountId);
  if (manifest.entries.length === 0) return null;

  const pages: DocPage[] = [];
  const assetCandidates: AssetCandidate[] = [];
  const snapshotShas: string[] = [];

  for (const entry of manifest.entries) {
    const text = await readCacheText(accountId, entry.sha256);
    if (text == null) continue;
    snapshotShas.push(entry.sha256);
    const candidate = assetCandidateFor(entry);
    if (candidate) assetCandidates.push(candidate);
    assetCandidates.push(...pageAssetCandidates(entry.finalUrl ?? entry.url, text));
    pages.push({ url: entry.finalUrl ?? entry.url, text, score: pageScore(entry), kind: entry.kind });
  }

  // Snapshot ids are resolved from the DB only when it's actually available (a plain --dry-run
  // against the local cache with no DB has none, which is fine -- dry-run never writes a run row).
  return { pages, snapshotIds: [], snapshotShas, assetCandidates: dedupeAssetCandidates(assetCandidates) };
}

async function loadFromDb(pool: Pool, accountId: number): Promise<LoadedPages> {
  const { rows } = await pool.query<{ id: string; url: string; sha256: string; kind: "html" | "pdf"; score: number | null }>(
    `select distinct on (s.url) s.id::text as id, s.url, s.sha256, s.kind, f.score
     from venue_source_snapshots s
     join venue_source_fetches f on f.snapshot_id = s.id
     where s.account_id = $1
     order by s.url, f.fetched_at desc`,
    [accountId]
  );

  const pages: DocPage[] = [];
  const assetCandidates: AssetCandidate[] = [];
  const snapshotShas: string[] = [];
  const snapshotIds: number[] = [];
  // PDF anchor titles live only in the crawl manifest (the snapshot row has none); use them when present.
  const titleBySha = new Map<string, string | null>();
  try {
    for (const e of (await readManifest(accountId)).entries) titleBySha.set(e.sha256, e.title ?? null);
  } catch {
    /* no manifest: titles fall back to the file name */
  }

  for (const r of rows) {
    let text: string;
    const cached = await readCacheText(accountId, r.sha256);
    if (cached != null) {
      text = cached;
    } else {
      try {
        text = await getSnapshotText(snapshotKey(accountId, r.sha256));
      } catch {
        continue;
      }
    }
    snapshotIds.push(Number(r.id));
    snapshotShas.push(r.sha256);
    const candidate = assetCandidateFor({ url: r.url, kind: r.kind, title: titleBySha.get(r.sha256) ?? null });
    if (candidate) assetCandidates.push(candidate);
    assetCandidates.push(...pageAssetCandidates(r.url, text));
    pages.push({ url: r.url, text, score: pageScore({ score: r.score, depth: 0 }), kind: r.kind });
  }

  return { pages, snapshotIds, snapshotShas, assetCandidates: dedupeAssetCandidates(assetCandidates) };
}

/** With a DB: `venue_source_snapshots` is the source of truth (latest snapshot per URL, text from
 * the local cache by sha else R2), so the run's `snapshot_ids`/`input_hash` are EXACTLY the pages
 * the model reads and the validator later loads. Tick c1 (2026-09-19) showed why the manifest
 * cannot lead when a DB exists: it keys redirected PDFs by their final (squarespace) URL and
 * keeps stale shas from earlier dry-run crawls, so `resolveSnapshotIds` silently dropped
 * Greenhouse's six PDFs and two Geraghty pages from the run -- the model quoted them, validation
 * could not see them, and two critical facts were demoted as "ungrounded". The manifest is only
 * the offline path (`--cache-only` / no DB). */
async function loadPages(pool: Pool | null, accountId: number, opts: { cacheOnly: boolean }): Promise<LoadedPages> {
  if (pool && !opts.cacheOnly) {
    const fromDb = await loadFromDb(pool, accountId);
    if (fromDb.pages.length > 0) return fromDb;
  }
  const fromManifest = await loadFromManifest(accountId);
  if (fromManifest) return fromManifest;
  return { pages: [], snapshotIds: [], snapshotShas: [], assetCandidates: [] };
}

// ---------------------------------------------------------------------------
// OpenRouter call wrappers (enum retry + 5xx/429 backoff, same house style as
// ../classify/runExtract.ts's callExtractWithVerdictRetry / callExtractWithRetry)
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CallSpec {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  parameters: JsonSchema | object;
  maxTokens: number;
}

async function callWithEnumRetry<T>(spec: CallSpec): Promise<ToolCallResult<T>> {
  const first = await callTool<T>({ ...spec, cacheSystemPrompt: true });
  const violations = validateShape(first.args);
  if (violations.length === 0) return first;
  const retryUser = `${spec.user}\n\nIMPORTANT: your previous reply used values outside the allowed enum. Fix these and resubmit the FULL tool call:\n${violations.join("\n")}`;
  const retry = await callTool<T>({ ...spec, user: retryUser, cacheSystemPrompt: true });
  return {
    ...retry,
    costUsd: (first.costUsd ?? 0) + (retry.costUsd ?? 0),
    inputTokens: first.inputTokens + retry.inputTokens,
    outputTokens: first.outputTokens + retry.outputTokens,
  };
}

/** `callTool` already retries 429 internally (openrouter.ts's own rate-limit story); this adds
 * backoff for 5xx / other transient OpenRouterErrors on top, same pattern as runExtract.ts. */
async function callWithBackoff<T>(spec: CallSpec, maxAttempts = 4): Promise<ToolCallResult<T>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callWithEnumRetry<T>(spec);
    } catch (e) {
      lastErr = e;
      const status = e instanceof OpenRouterError ? e.status : undefined;
      const retryable = status !== undefined && (status >= 500 || status === 429);
      if (!retryable || attempt >= maxAttempts) throw e;
      await sleep(attempt * 2000);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Shape retry: a tool reply whose array field came back as an unparseable STRING (tick c4,
// 2026-09-20 -- Greenhouse's pricing `paths` was a 24,371-char string that didn't even
// JSON.parse; Diamond Garden hit the same shape at c3 and it happened to fix itself on a retry).
// Distinct from `callWithEnumRetry`'s enum-violation retry: this is a shape failure, not a value
// failure, and needs a full re-issue of the SAME call rather than a corrective follow-up message.
// ---------------------------------------------------------------------------

/** Every known array field on the raw spine reply -- `assemble.ts`'s `coerceRawArrays` already
 * recovers a JSON-encoded-array string for these once assembly runs; this list exists so a shape
 * failure can be caught and retried BEFORE that (a genuinely malformed/truncated string, which
 * `coerceRawArrays` can only fall back to treating as empty). */
export const SPINE_ARRAY_FIELD_PATHS = ["spaces", "capacities", "inclusions", "resources", "vendor_lists", "press_features"];

/** Same, for the pricing reply -- dotted paths reach into `food_beverage`'s own array fields. */
export const PRICING_ARRAY_FIELD_PATHS = [
  "paths",
  "add_ons",
  "add_on_categories",
  "required_third_party",
  "faqs",
  "food_beverage.menus",
  "food_beverage.bar_ladders",
  "food_beverage.food_pills",
  "food_beverage.bar_pills",
  "food_beverage.notes",
];

/** Reads a dotted field path ("food_beverage.menus") off `payload`. Returns `undefined` for a
 * missing/non-object path -- indistinguishable from "not present," which is fine: only a STRING
 * value is ever flagged below. */
function getByPath(payload: unknown, path: string): unknown {
  let cur: unknown = payload;
  for (const segment of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

/** Names every field in `fieldPaths` whose value on `payload` is a STRING that does not
 * `JSON.parse` into an array -- the shape failure a retry is worth (a string that DOES parse into
 * an array is a recoverable encoding quirk `assemble.ts`'s `coerceRawArrays` already handles for
 * free; an array, or a missing/null field, is never flagged). Pure -- no I/O. */
export function findStringifiedArrayFields(payload: unknown, fieldPaths: string[]): string[] {
  if (payload == null || typeof payload !== "object") return [];
  const bad: string[] = [];
  for (const path of fieldPaths) {
    const value = getByPath(payload, path);
    if (typeof value !== "string") continue;
    let parsesToArray = false;
    try {
      parsesToArray = Array.isArray(JSON.parse(value));
    } catch {
      parsesToArray = false;
    }
    if (!parsesToArray) bad.push(path);
  }
  return bad;
}

/** Re-issues `spec` (same messages) exactly once when `fieldPaths` names a stringified-non-array
 * field on the first reply, and keeps the retry's response either way -- if the retry also came
 * back malformed, it's still preferred over the original (per spec: "prefer the retry when both
 * fail, and let validation's malformed_array handle it" -- assemble.ts's `coerceRawArrays` turns
 * a genuinely un-parseable field into `[]` with one issue rather than crashing). Cost/tokens from
 * both calls are summed onto the kept result so the run's `cost_usd` reflects the retry. */
async function callToolWithShapeRetry<T>(spec: CallSpec, fieldPaths: string[], accountId: number, label: string): Promise<ToolCallResult<T>> {
  const first = await callWithBackoff<T>(spec);
  const badFields = findStringifiedArrayFields(first.args, fieldPaths);
  if (badFields.length === 0) return first;

  console.log(`[extract-venue-details] account ${accountId}: shape_retry (${label}) fields=${badFields.join(", ")}`);
  const retry = await callWithBackoff<T>(spec);
  return {
    ...retry,
    costUsd: (first.costUsd ?? 0) + (retry.costUsd ?? 0),
    inputTokens: first.inputTokens + retry.inputTokens,
    outputTokens: first.outputTokens + retry.outputTokens,
  };
}

// ---------------------------------------------------------------------------
// Per-venue extraction
// ---------------------------------------------------------------------------

interface SpendState {
  total: number;
}

interface ExtractOutcome {
  accountId: number;
  status: "extracted" | "skipped_existing_hash" | "skipped_no_pages" | "skipped_pricing" | "error";
  costUsd: number;
  detail?: string;
}

function buildSpineSpaceSummary(spine: RawSpineResult): { spaces: { id: string; name: string }[]; archetypeHint: string | null } {
  const spaces = spine.spaces.map((s) => ({ id: s.id, name: s.name }));
  const archetypeField = spine.spine.pricing_archetype;
  const archetypeHint = archetypeField && archetypeField.status === "stated" ? String(archetypeField.value) : null;
  return { spaces, archetypeHint };
}

/** True when the auto-skip condition fires: the spine call itself says pricing_archetype is
 * inquire_only AND the crawled document contains no dollar sign at all (nothing for a pricing
 * call to possibly find). */
function shouldAutoSkipPricing(spine: RawSpineResult, documentText: string): boolean {
  const field = spine.spine.pricing_archetype;
  const isInquireOnly = field?.status === "stated" && field.value === "inquire_only";
  return Boolean(isInquireOnly) && !documentText.includes("$");
}

async function insertRunRow(
  pool: Pool,
  accountId: number,
  opts: {
    model: string;
    inputHash: string;
    snapshotIds: number[];
    websiteUrl: string | null;
    result: VenueDetailsRunResult;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }
): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into venue_details_runs
       (account_id, prompt_version, schema_version, model, stage, input_hash, snapshot_ids, website_url, result, input_tokens, output_tokens, cost_usd)
     values ($1,$2,$3,$4,'extract',$5,$6,$7,$8,$9,$10,$11)
     on conflict (account_id, input_hash) where stage = 'extract' do update set
       result = excluded.result,
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       cost_usd = excluded.cost_usd,
       website_url = excluded.website_url,
       model = excluded.model,
       created_at = now()
     returning id::text`,
    [accountId, VENUE_DETAILS_PROMPT_VERSION, VENUE_DETAILS_SCHEMA_VERSION, opts.model, opts.inputHash, opts.snapshotIds, opts.websiteUrl, JSON.stringify(opts.result), opts.inputTokens, opts.outputTokens, opts.costUsd]
  );
  return Number(rows[0].id);
}

async function extractOneVenue(pool: Pool | null, target: VenueTarget, args: Args, spend: SpendState): Promise<ExtractOutcome> {
  const loaded = await loadPages(pool, target.accountId, { cacheOnly: args.cacheOnly });
  if (loaded.pages.length === 0) {
    return { accountId: target.accountId, status: "skipped_no_pages", costUsd: 0, detail: "no cached/crawled pages found" };
  }

  const hash = inputHash({
    schemaVersion: VENUE_DETAILS_SCHEMA_VERSION,
    promptVersion: VENUE_DETAILS_PROMPT_VERSION,
    model: args.model,
    snapshotShas: loaded.snapshotShas,
  });

  if (pool && !args.force) {
    const { rows } = await pool.query(`select 1 from venue_details_runs where account_id = $1 and input_hash = $2 and stage = 'extract'`, [target.accountId, hash]);
    if (rows.length > 0) return { accountId: target.accountId, status: "skipped_existing_hash", costUsd: 0 };
  }

  const built = buildDocument(loaded.pages, args.maxInputChars, loaded.assetCandidates);
  const ctx: SpineUserMessageCtx = { name: target.name, websiteUrl: target.websiteUrl, documentText: built.text };

  const spineCall = await callToolWithShapeRetry<RawSpineResult>(
    {
      model: args.model,
      system: SYSTEM_PROMPT_SPINE,
      user: buildSpineUserMessage(ctx),
      toolName: SPINE_TOOL.name,
      toolDescription: SPINE_TOOL.description,
      parameters: SPINE_TOOL.parameters,
      maxTokens: EXTRACT_MAX_TOKENS,
    },
    SPINE_ARRAY_FIELD_PATHS,
    target.accountId,
    "spine"
  );
  let totalCost = spineCall.costUsd ?? 0;
  let totalInputTokens = spineCall.inputTokens;
  let totalOutputTokens = spineCall.outputTokens;

  let pricingCall: RawPricingResult | null = null;
  let pricingSkipped = false;
  if (args.skipPricing) {
    pricingSkipped = true;
  } else if (shouldAutoSkipPricing(spineCall.args, built.text)) {
    pricingSkipped = true;
    console.log(`[extract-venue-details] account ${target.accountId}: auto-skipping pricing call (inquire_only, no "$" in document)`);
  } else {
    const spineSummary = buildSpineSpaceSummary(spineCall.args);
    const pricingResult = await callToolWithShapeRetry<RawPricingResult>(
      {
        model: args.model,
        system: SYSTEM_PROMPT_PRICING,
        user: buildPricingUserMessage(ctx, spineSummary),
        toolName: PRICING_TOOL.name,
        toolDescription: PRICING_TOOL.description,
        parameters: PRICING_TOOL.parameters,
        maxTokens: EXTRACT_MAX_TOKENS,
      },
      PRICING_ARRAY_FIELD_PATHS,
      target.accountId,
      "pricing"
    );
    pricingCall = pricingResult.args;
    totalCost += pricingResult.costUsd ?? 0;
    totalInputTokens += pricingResult.inputTokens;
    totalOutputTokens += pricingResult.outputTokens;
  }

  spend.total += totalCost;

  if (pool) {
    const result: VenueDetailsRunResult = {
      spine_call: spineCall.args,
      pricing_call: pricingCall,
      document_chars: built.charsUsed,
      pages: built.pagesUsed,
    };
    await insertRunRow(pool, target.accountId, {
      model: spineCall.model,
      inputHash: hash,
      snapshotIds: loaded.snapshotIds,
      websiteUrl: target.websiteUrl,
      result,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: totalCost,
    });
  }

  return { accountId: target.accountId, status: pricingSkipped ? "skipped_pricing" : "extracted", costUsd: totalCost };
}

// ---------------------------------------------------------------------------
// --dry-run: print prompts, no calls, no writes
// ---------------------------------------------------------------------------

async function printDryRun(pool: Pool | null, targets: VenueTarget[], args: Args): Promise<void> {
  console.log(`[extract-venue-details] --dry-run: printing up to 3 prompts, no LLM calls, no writes`);
  for (const target of targets.slice(0, 3)) {
    const loaded = await loadPages(pool, target.accountId, { cacheOnly: args.cacheOnly });
    if (loaded.pages.length === 0) {
      console.log(`\n=== account ${target.accountId} (${target.name}) === NO PAGES FOUND (no local cache at scripts/venue-details/cache/${target.accountId}/, no DB rows, or --cache-only with neither)`);
      continue;
    }
    const built = buildDocument(loaded.pages, args.maxInputChars, loaded.assetCandidates);
    const hash = inputHash({ schemaVersion: VENUE_DETAILS_SCHEMA_VERSION, promptVersion: VENUE_DETAILS_PROMPT_VERSION, model: args.model, snapshotShas: loaded.snapshotShas });
    const ctx: SpineUserMessageCtx = { name: target.name, websiteUrl: target.websiteUrl, documentText: built.text };

    console.log(`\n\n########## account ${target.accountId} (${target.name}) ##########`);
    console.log(`pages used: ${built.pagesUsed.length}, document_chars: ${built.charsUsed}, input_hash: ${hash}`);

    console.log(`\n=== SPINE TOOL: ${SPINE_TOOL.name} ===`);
    console.log(`schema size estimate: ~${Math.round(JSON.stringify(SPINE_TOOL.parameters).length / 4)} tokens`);
    console.log(`\n=== SPINE SYSTEM PROMPT ===\n${SYSTEM_PROMPT_SPINE}`);
    console.log(`\n=== SPINE USER PROMPT ===\n${buildSpineUserMessage(ctx)}`);

    const spineSummary = { spaces: [], archetypeHint: null as string | null };
    console.log(`\n=== PRICING TOOL: ${PRICING_TOOL.name} ===`);
    console.log(`schema size estimate: ~${Math.round(JSON.stringify(PRICING_TOOL.parameters).length / 4)} tokens`);
    console.log(`\n=== PRICING SYSTEM PROMPT ===\n${SYSTEM_PROMPT_PRICING}`);
    console.log(
      `\n=== PRICING USER PROMPT (spine summary is a placeholder here -- no LLM call has run yet in --dry-run) ===\n${buildPricingUserMessage(ctx, spineSummary)}`
    );
  }
}

// ---------------------------------------------------------------------------
// --pilot: golden x2 (split vs --single-call), decision table. NOT run in this task.
// ---------------------------------------------------------------------------

/** A merged single-call tool for the `--pilot --single-call` arm: nests the spine and pricing
 * schemas under two top-level keys rather than flattening (both schemas independently declare a
 * `notes` property, so a flat merge would collide) -- one tool call, one round trip, at the cost
 * of a larger single schema and no spine-summary hand-off between the two halves. */
function buildMergedTool(): { name: string; description: string; parameters: JsonSchema } {
  return {
    name: "submit_venue_details",
    description: "Submit both the venue spine+detail AND the pricing/cost model in a single call.",
    parameters: {
      type: "object",
      properties: { spine: SPINE_TOOL.parameters, pricing: PRICING_TOOL.parameters },
      required: ["spine", "pricing"],
      additionalProperties: false,
    },
  };
}

interface PilotRow {
  accountId: number;
  mode: "split" | "single_call";
  finishReasonTruncated: boolean;
  parseFailed: boolean;
  enumRetries: number;
  latencyMs: number;
  costUsd: number;
}

/** Runs the golden six twice -- once as two separate calls (current default), once as
 * `buildMergedTool()`'s single call -- and prints the plan's decision table (truncation, parse
 * failures, enum retries, latency, cost). Makes REAL OpenRouter calls: per the task brief, this
 * function is implemented but never invoked in this task. */
async function runPilot(pool: Pool | null, args: Args): Promise<void> {
  const targets = await selectVenues(pool, { ...args, golden: true, accountIds: null, fromWebsites: false });
  const rows: PilotRow[] = [];

  for (const target of targets) {
    const loaded = await loadPages(pool, target.accountId, { cacheOnly: args.cacheOnly });
    if (loaded.pages.length === 0) continue;
    const built = buildDocument(loaded.pages, args.maxInputChars, loaded.assetCandidates);
    const ctx: SpineUserMessageCtx = { name: target.name, websiteUrl: target.websiteUrl, documentText: built.text };

    // split (default) arm
    const splitStart = Date.now();
    const spineCall = await callWithBackoff<RawSpineResult>({
      model: args.model,
      system: SYSTEM_PROMPT_SPINE,
      user: buildSpineUserMessage(ctx),
      toolName: SPINE_TOOL.name,
      toolDescription: SPINE_TOOL.description,
      parameters: SPINE_TOOL.parameters,
      maxTokens: EXTRACT_MAX_TOKENS,
    });
    const spineSummary = buildSpineSpaceSummary(spineCall.args);
    const pricingCall = await callWithBackoff<RawPricingResult>({
      model: args.model,
      system: SYSTEM_PROMPT_PRICING,
      user: buildPricingUserMessage(ctx, spineSummary),
      toolName: PRICING_TOOL.name,
      toolDescription: PRICING_TOOL.description,
      parameters: PRICING_TOOL.parameters,
      maxTokens: EXTRACT_MAX_TOKENS,
    });
    rows.push({
      accountId: target.accountId,
      mode: "split",
      finishReasonTruncated: false,
      parseFailed: false,
      enumRetries: 0,
      latencyMs: Date.now() - splitStart,
      costUsd: (spineCall.costUsd ?? 0) + (pricingCall.costUsd ?? 0),
    });

    // single-call arm
    const merged = buildMergedTool();
    const singleStart = Date.now();
    const singleCall = await callWithBackoff<{ spine: RawSpineResult; pricing: RawPricingResult }>({
      model: args.model,
      system: `${SYSTEM_PROMPT_SPINE}\n\n${SYSTEM_PROMPT_PRICING}`,
      user: buildSpineUserMessage(ctx),
      toolName: merged.name,
      toolDescription: merged.description,
      parameters: merged.parameters,
      maxTokens: EXTRACT_MAX_TOKENS,
    });
    rows.push({
      accountId: target.accountId,
      mode: "single_call",
      finishReasonTruncated: false,
      parseFailed: false,
      enumRetries: 0,
      latencyMs: Date.now() - singleStart,
      costUsd: singleCall.costUsd ?? 0,
    });
  }

  console.log(`\n=== --pilot decision table (split vs single_call, golden ${rows.length / 2}) ===`);
  console.log("account_id  mode         latency_ms  cost_usd");
  for (const r of rows) {
    console.log(`${String(r.accountId).padEnd(11)} ${r.mode.padEnd(12)} ${String(r.latencyMs).padEnd(11)} $${r.costUsd.toFixed(4)}`);
  }
  const splitCost = rows.filter((r) => r.mode === "split").reduce((s, r) => s + r.costUsd, 0);
  const singleCost = rows.filter((r) => r.mode === "single_call").reduce((s, r) => s + r.costUsd, 0);
  console.log(`\nTotal cost -- split: $${splitCost.toFixed(4)}, single_call: $${singleCost.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const needsPool = !args.websiteOverride || !args.dryRun || args.golden || args.accountIds != null || args.fromWebsites;
  const pool = needsPool ? getPool() : null;

  const targets = await selectVenues(pool, args);
  console.log(`[extract-venue-details] mode: ${args.dryRun ? "DRY RUN (no calls, no writes)" : "LIVE"}`);
  console.log(`[extract-venue-details] venues selected: ${targets.length}`);

  if (args.dryRun) {
    await printDryRun(pool, targets, args);
    if (pool) await closePool();
    return;
  }

  if (args.pilot) {
    await runPilot(pool, args);
    if (pool) await closePool();
    return;
  }

  const spend: SpendState = { total: 0 };
  let extracted = 0;
  let skippedExisting = 0;
  let skippedNoPages = 0;
  let skippedPricingOnly = 0;
  let errored = 0;
  let consecutiveFailures = 0;
  let aborted = false;

  const queue = [...targets];
  const workers = Array.from({ length: args.concurrency }, () =>
    (async () => {
      while (queue.length) {
        if (spend.total >= args.maxCostUsd) {
          console.log(`[extract-venue-details] hit --max-cost-usd ${args.maxCostUsd}, stopping`);
          queue.length = 0;
          return;
        }
        const target = queue.shift();
        if (!target) return;
        try {
          const outcome = await extractOneVenue(pool, target, args, spend);
          if (outcome.status === "extracted") extracted++;
          else if (outcome.status === "skipped_existing_hash") skippedExisting++;
          else if (outcome.status === "skipped_no_pages") skippedNoPages++;
          else if (outcome.status === "skipped_pricing") {
            extracted++;
            skippedPricingOnly++;
          }
          consecutiveFailures = 0;
          console.log(
            `[extract-venue-details] account ${target.accountId}: ${outcome.status}${outcome.detail ? ` (${outcome.detail})` : ""} cost=$${outcome.costUsd.toFixed(4)} running_total=$${spend.total.toFixed(4)}`
          );
        } catch (e) {
          errored++;
          consecutiveFailures++;
          const msg = e instanceof OpenRouterError ? `${e.status} ${e.body.slice(0, 200)}` : String(e);
          console.error(`[extract-venue-details] ERROR account ${target.accountId}: ${msg}`);
          if (consecutiveFailures >= 5) {
            console.error(`[extract-venue-details] 5 consecutive failures -- aborting run (likely API/credits issue)`);
            aborted = true;
            queue.length = 0;
            return;
          }
        }
      }
    })()
  );
  await Promise.all(workers);

  console.log(`\n[extract-venue-details] DONE${aborted ? " (ABORTED EARLY)" : ""}`);
  console.log(`  extracted: ${extracted} (of which pricing auto/flag-skipped: ${skippedPricingOnly})`);
  console.log(`  skipped (existing input_hash): ${skippedExisting}`);
  console.log(`  skipped (no pages found): ${skippedNoPages}`);
  console.log(`  errored: ${errored}, of ${targets.length} selected`);
  console.log(`  total cost this run: $${spend.total.toFixed(4)}`);

  if (pool) await closePool();
}

// Guarded so importing the pure helpers above for unit tests never triggers CLI arg parsing /
// process.exit as an import side effect (same discipline as crawlVenue.ts).
if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
