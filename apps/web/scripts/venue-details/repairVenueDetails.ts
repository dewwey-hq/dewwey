/**
 * VenueDetails v3 targeted repair (D060 Phase 2, part A): for a run whose `validation.repairs`
 * is non-empty, builds a field-path-isolated subset tool (`venueDetailsPrompt.ts`'s
 * `buildRepairTool`) covering exactly those repairs, sends it page-slice excerpts around the
 * repairs' keyword hits, and merges the reply back into a NEW `stage='repair'` run row
 * (`parent_run_id` set, never mutating the original) -- then re-validates the merged result and
 * writes its `validation`. Field-path isolation is enforced at merge time: only the requested
 * paths are ever read out of the model's reply, so an extra/hallucinated key is silently dropped
 * rather than merged.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/repairVenueDetails.ts --account-ids 477 --dry-run
 *   bun run scripts/venue-details/repairVenueDetails.ts --account-ids 477 --max-cost-usd 5
 *   bun run scripts/venue-details/repairVenueDetails.ts --limit 20 --max-rounds 1
 */
import type { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { MODEL_CHEAP, MODEL_EXPENSIVE } from "../classify/llmClassifier";
import { callTool, OpenRouterError, type ToolCallResult } from "../classify/openrouter";
import { readCacheText } from "./crawl/cache";
import { getSnapshotText, snapshotKey } from "./crawl/r2";
import { buildRepairTool, buildRepairUserMessage, validateShape, type JsonSchema } from "./venueDetailsPrompt";
import { assembleDocument, type AssemblePage } from "./validate/assemble";
import type { RawPricingResult, RawSpineResult, Repair, Validation, VenueDetailsRunResult } from "./contract";

const REPAIR_SYSTEM_PROMPT =
  `You are re-reading page excerpts for a wedding venue extraction that already ran once. ` +
  `Only the specific fields named in the tool schema are being asked again -- resubmit EXACTLY those fields, nothing else; any other key you return is ignored. ` +
  `Use ONLY the excerpts given, never anything from the earlier run. If the evidence still doesn't support a stated value, return status=not_stated (or, for a tri-state spine field where the excerpts show two of the venue's own documents genuinely disagreeing, status=conflicting with a real candidate for each). ` +
  `Never invent a number that isn't in the excerpts. Every stated value still needs a verbatim quote and the exact source_url it came from -- the source_url must be one of the excerpted pages.`;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  accountIds: number[] | null;
  limit: number | null;
  maxRounds: number;
  model: string;
  escalateModel: string;
  dryRun: boolean;
  maxCostUsd: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const accountIdsRaw = get("--account-ids");
  return {
    accountIds: accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null,
    limit: get("--limit") ? Number(get("--limit")) : null,
    maxRounds: Number(get("--max-rounds") ?? 1),
    model: get("--model") ?? MODEL_CHEAP,
    escalateModel: get("--escalate-model") ?? MODEL_EXPENSIVE,
    dryRun: a.includes("--dry-run"),
    maxCostUsd: Number(get("--max-cost-usd") ?? 5),
  };
}

// ---------------------------------------------------------------------------
// Selection: the latest run per account (extract or a prior repair) that still has repairs.
// ---------------------------------------------------------------------------

interface RepairableRun {
  id: number;
  account_id: number;
  prompt_version: string;
  model: string | null;
  snapshot_ids: number[];
  website_url: string | null;
  input_hash: string;
  result: VenueDetailsRunResult;
  validation: Validation;
  created_at: string;
}

async function selectRepairableRuns(pool: Pool, args: Args): Promise<RepairableRun[]> {
  const conditions = [`validation is not null`, `jsonb_array_length(validation->'repairs') > 0`];
  const params: unknown[] = [];
  if (args.accountIds) {
    params.push(args.accountIds);
    conditions.push(`account_id = any($${params.length}::bigint[])`);
  }
  params.push(args.limit ?? 100);

  const { rows } = await pool.query<{
    id: string;
    account_id: string;
    prompt_version: string;
    model: string | null;
    snapshot_ids: string[];
    website_url: string | null;
    input_hash: string;
    result: VenueDetailsRunResult;
    validation: Validation;
    created_at: string;
  }>(
    `select distinct on (account_id) id::text as id, account_id::text as account_id, prompt_version, model, snapshot_ids, website_url, input_hash, result, validation, created_at
     from venue_details_runs
     where ${conditions.join(" and ")}
     order by account_id, created_at desc
     limit $${params.length}`,
    params
  );

  return rows.map((r) => ({
    id: Number(r.id),
    account_id: Number(r.account_id),
    prompt_version: r.prompt_version,
    model: r.model,
    snapshot_ids: (r.snapshot_ids ?? []).map(Number),
    website_url: r.website_url,
    input_hash: r.input_hash,
    result: r.result,
    validation: r.validation,
    created_at: r.created_at,
  }));
}

async function lookupName(pool: Pool, accountId: number): Promise<string> {
  const { rows } = await pool.query<{ full_name: string | null; username: string }>(`select full_name, username::text as username from accounts where id = $1`, [accountId]);
  return rows[0]?.full_name ?? rows[0]?.username ?? `account ${accountId}`;
}

async function loadPagesById(pool: Pool, accountId: number, snapshotIds: number[]): Promise<Map<number, AssemblePage>> {
  const map = new Map<number, AssemblePage>();
  if (snapshotIds.length === 0) return map;
  const { rows } = await pool.query<{ id: string; url: string; sha256: string }>(
    `select id::text as id, url, sha256 from venue_source_snapshots where account_id = $1 and id = any($2::bigint[])`,
    [accountId, snapshotIds]
  );
  for (const r of rows) {
    let text = await readCacheText(accountId, r.sha256);
    if (text == null) {
      try {
        text = await getSnapshotText(snapshotKey(accountId, r.sha256));
      } catch {
        continue;
      }
    }
    map.set(Number(r.id), { url: r.url, text, snapshot_id: Number(r.id) });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Excerpts: whole page when <= 6,000 chars, else ±1,500 chars around each keyword hit, joined.
// Never a single "keyword sentence" -- capacity/fee numbers routinely sit in a table cell far
// from the label's own sentence (crawl/htmlText.ts joins table cells with " | ").
// ---------------------------------------------------------------------------

const FULL_PAGE_CHAR_LIMIT = 6000;
const WINDOW_RADIUS = 1500;

export function buildExcerpt(text: string, keywords: string[]): string {
  if (text.length <= FULL_PAGE_CHAR_LIMIT) return text;
  const lower = text.toLowerCase();
  const windows: [number, number][] = [];
  for (const kw of keywords) {
    const needle = kw.toLowerCase();
    if (!needle) continue;
    let idx = lower.indexOf(needle);
    while (idx !== -1) {
      windows.push([Math.max(0, idx - WINDOW_RADIUS), Math.min(text.length, idx + needle.length + WINDOW_RADIUS)]);
      idx = lower.indexOf(needle, idx + needle.length);
    }
  }
  if (windows.length === 0) return text.slice(0, FULL_PAGE_CHAR_LIMIT);
  windows.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [windows[0]];
  for (const w of windows.slice(1)) {
    const last = merged[merged.length - 1];
    if (w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push(w);
  }
  return merged.map(([s, e]) => text.slice(s, e)).join("\n...\n");
}

export function excerptsForRepairs(repairs: Repair[], pages: Map<number, AssemblePage>): { url: string; text: string }[] {
  const keywordsBySnapshot = new Map<number, Set<string>>();
  for (const r of repairs) {
    for (const sid of r.evidence_hint.snapshot_ids) {
      const set = keywordsBySnapshot.get(sid) ?? new Set<string>();
      for (const k of r.evidence_hint.keyword_hits) set.add(k);
      keywordsBySnapshot.set(sid, set);
    }
  }
  const excerpts: { url: string; text: string }[] = [];
  for (const [sid, keywords] of keywordsBySnapshot) {
    const page = pages.get(sid);
    if (!page) continue;
    excerpts.push({ url: page.url, text: buildExcerpt(page.text, [...keywords]) });
  }
  return excerpts;
}

// ---------------------------------------------------------------------------
// Field-path-isolated merge: only the requested paths are ever read out of the reply.
// ---------------------------------------------------------------------------

const PRICING_TOP_LEVEL_ROOTS = new Set(["archetype", "paths", "rates", "add_ons", "food_beverage", "required_third_party"]);

export function mergeRepairReply(parent: VenueDetailsRunResult, repairPaths: string[], reply: Record<string, unknown>): VenueDetailsRunResult {
  const spineCall: RawSpineResult = structuredClone(parent.spine_call);
  const pricingCall: RawPricingResult | null = parent.pricing_call ? structuredClone(parent.pricing_call) : null;

  const spineKeys = new Set<string>();
  const pricingSubs = new Set<string>();
  const topLevel = new Set<string>();

  for (const fp of repairPaths) {
    const segments = fp.split("/").filter(Boolean);
    const root = segments[0];
    if (root === "spine") spineKeys.add(segments[1]);
    else if (root === "pricing") pricingSubs.add(segments[1]);
    else topLevel.add(root);
  }

  const replySpine = (reply.spine ?? {}) as Record<string, unknown>;
  for (const key of spineKeys) {
    if (key in replySpine) (spineCall.spine as Record<string, unknown>)[key] = replySpine[key];
  }

  const replyPricing = (reply.pricing ?? {}) as Record<string, unknown>;
  for (const sub of pricingSubs) {
    if (pricingCall && sub in replyPricing && PRICING_TOP_LEVEL_ROOTS.has(sub)) {
      (pricingCall as unknown as Record<string, unknown>)[sub] = replyPricing[sub];
    }
  }

  for (const root of topLevel) {
    if (root === "faqs") {
      if (pricingCall && root in reply) (pricingCall as unknown as Record<string, unknown>)[root] = reply[root];
    } else if (root in reply) {
      (spineCall as unknown as Record<string, unknown>)[root] = reply[root];
    }
  }

  return { spine_call: spineCall, pricing_call: pricingCall, document_chars: parent.document_chars, pages: parent.pages };
}

// ---------------------------------------------------------------------------
// OpenRouter call (enum retry, no real calls made in this task)
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callRepairWithRetry(spec: { model: string; tool: { name: string; description: string; parameters: JsonSchema }; user: string }, maxAttempts = 4): Promise<ToolCallResult<Record<string, unknown>>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const first = await callTool<Record<string, unknown>>({
        model: spec.model,
        system: REPAIR_SYSTEM_PROMPT,
        user: spec.user,
        toolName: spec.tool.name,
        toolDescription: spec.tool.description,
        parameters: spec.tool.parameters,
        maxTokens: 8000,
        cacheSystemPrompt: true,
      });
      const violations = validateShape(first.args);
      if (violations.length === 0) return first;
      const retry = await callTool<Record<string, unknown>>({
        model: spec.model,
        system: REPAIR_SYSTEM_PROMPT,
        user: `${spec.user}\n\nIMPORTANT: fix these enum violations and resubmit:\n${violations.join("\n")}`,
        toolName: spec.tool.name,
        toolDescription: spec.tool.description,
        parameters: spec.tool.parameters,
        maxTokens: 8000,
        cacheSystemPrompt: true,
      });
      return { ...retry, costUsd: (first.costUsd ?? 0) + (retry.costUsd ?? 0), inputTokens: first.inputTokens + retry.inputTokens, outputTokens: first.outputTokens + retry.outputTokens };
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
// Per-venue repair round
// ---------------------------------------------------------------------------

async function insertRepairRunRow(
  pool: Pool,
  run: RepairableRun,
  opts: { model: string; result: VenueDetailsRunResult; inputTokens: number; outputTokens: number; costUsd: number }
): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into venue_details_runs
       (account_id, prompt_version, schema_version, model, stage, parent_run_id, input_hash, snapshot_ids, website_url, result, input_tokens, output_tokens, cost_usd)
     values ($1,$2,3,$3,'repair',$4,$5,$6,$7,$8,$9,$10,$11)
     returning id::text`,
    [run.account_id, run.prompt_version, opts.model, run.id, run.input_hash, run.snapshot_ids, run.website_url, JSON.stringify(opts.result), opts.inputTokens, opts.outputTokens, opts.costUsd]
  );
  return Number(rows[0].id);
}

interface RepairOutcome {
  accountId: number;
  status: "repaired" | "skipped_no_pages" | "error";
  costUsd: number;
  newRunId?: number;
  remainingRepairs?: number;
}

async function repairOneVenue(pool: Pool, run: RepairableRun, args: Args, spend: { total: number }): Promise<RepairOutcome> {
  const repairs = run.validation.repairs;
  const fieldPaths = [...new Set(repairs.map((r) => r.field_path))];
  const tool = buildRepairTool(fieldPaths);

  const pages = await loadPagesById(pool, run.account_id, run.snapshot_ids);
  if (pages.size === 0) return { accountId: run.account_id, status: "skipped_no_pages", costUsd: 0 };

  const excerpts = excerptsForRepairs(repairs, pages);
  const user = buildRepairUserMessage(repairs, excerpts);

  const model = repairs.every((r) => r.tier === "critical") && args.maxRounds >= 2 ? args.escalateModel : args.model;
  const call = await callRepairWithRetry({ model, tool, user });
  spend.total += call.costUsd ?? 0;

  const mergedResult = mergeRepairReply(run.result, fieldPaths, call.args);
  const newRunId = await insertRepairRunRow(pool, run, { model: call.model, result: mergedResult, inputTokens: call.inputTokens, outputTokens: call.outputTokens, costUsd: call.costUsd ?? 0 });

  const name = await lookupName(pool, run.account_id);
  const assembled = assembleDocument({
    accountId: run.account_id,
    name,
    websiteUrl: run.website_url,
    runId: newRunId,
    promptVersion: run.prompt_version,
    model: call.model,
    extractedAt: new Date().toISOString(),
    spineRaw: mergedResult.spine_call,
    pricingRaw: mergedResult.pricing_call,
    pages: [...pages.values()],
    assetCandidateUrls: [],
  });
  const validation: Validation = {
    ok: assembled.ok,
    needs_review: assembled.needsReview,
    review_reasons: assembled.reviewReasons,
    issues: assembled.issues,
    repairs: assembled.repairs,
    grounding: assembled.grounding,
    spine_stated_count: assembled.spineStatedCount,
    critical_failures: assembled.criticalFailures,
    document: assembled.document,
  };
  await pool.query(`update venue_details_runs set validation = $2, spine_stated_count = $3, critical_failures = $4 where id = $1`, [
    newRunId,
    JSON.stringify(validation),
    validation.spine_stated_count,
    validation.critical_failures,
  ]);

  return { accountId: run.account_id, status: "repaired", costUsd: call.costUsd ?? 0, newRunId, remainingRepairs: assembled.repairs.length };
}

// ---------------------------------------------------------------------------
// --dry-run: print the repair prompt, no calls, no writes
// ---------------------------------------------------------------------------

async function printDryRun(pool: Pool, runs: RepairableRun[]): Promise<void> {
  console.log(`[repair-venue-details] --dry-run: printing up to 3 repair prompts, no LLM calls, no writes`);
  for (const run of runs.slice(0, 3)) {
    const repairs = run.validation.repairs;
    const fieldPaths = [...new Set(repairs.map((r) => r.field_path))];
    const tool = buildRepairTool(fieldPaths);
    const pages = await loadPagesById(pool, run.account_id, run.snapshot_ids);
    const excerpts = excerptsForRepairs(repairs, pages);
    const user = buildRepairUserMessage(repairs, excerpts);

    console.log(`\n\n########## account ${run.account_id} (run ${run.id}, ${repairs.length} repairs) ##########`);
    console.log(`field_paths: ${fieldPaths.join(", ")}`);
    console.log(`tool: ${tool.name}, schema size estimate: ~${Math.round(JSON.stringify(tool.parameters).length / 4)} tokens`);
    console.log(`\n=== REPAIR SYSTEM PROMPT ===\n${REPAIR_SYSTEM_PROMPT}`);
    console.log(`\n=== REPAIR USER PROMPT ===\n${user}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  if (!args.accountIds && !args.limit) {
    console.error("[repair-venue-details] pass --account-ids and/or --limit.");
    process.exit(1);
  }

  const pool = getPool();
  const runs = await selectRepairableRuns(pool, args);
  console.log(`[repair-venue-details] runs with pending repairs: ${runs.length}`);

  if (args.dryRun) {
    await printDryRun(pool, runs);
    await closePool();
    return;
  }

  const spend = { total: 0 };
  let repaired = 0;
  let skipped = 0;
  let errored = 0;

  for (const run of runs) {
    if (spend.total >= args.maxCostUsd) {
      console.log(`[repair-venue-details] hit --max-cost-usd ${args.maxCostUsd}, stopping`);
      break;
    }
    try {
      const outcome = await repairOneVenue(pool, run, args, spend);
      if (outcome.status === "repaired") repaired++;
      else skipped++;
      console.log(`[repair-venue-details] account ${outcome.accountId}: ${outcome.status} cost=$${outcome.costUsd.toFixed(4)}${outcome.newRunId ? ` new_run=${outcome.newRunId} remaining_repairs=${outcome.remainingRepairs}` : ""}`);
    } catch (e) {
      errored++;
      const msg = e instanceof OpenRouterError ? `${e.status} ${e.body.slice(0, 200)}` : String(e);
      console.error(`[repair-venue-details] ERROR account ${run.account_id}: ${msg}`);
    }
  }

  console.log(`\n[repair-venue-details] DONE: repaired=${repaired} skipped=${skipped} errored=${errored} total_cost=$${spend.total.toFixed(4)}`);
  await closePool();
}

// Guarded so importing the pure helpers above for unit tests never triggers CLI arg parsing /
// process.exit as an import side effect (same discipline as crawlVenue.ts).
if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
