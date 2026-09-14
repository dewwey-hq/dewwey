/**
 * Website discovery for the venue-details universe (D060 Phase 2). For every listed venue
 * account (`universe.ts`'s `listedVenueAccountIds`, alias-resolved), finds a candidate website
 * URL in priority order: `vendors.website` (0.9) -> `venue_enrichment.website` via `vendors`
 * (0.8) -> `accounts.external_url` minus link hubs/social hosts (0.7) -> `--manual-map <csv>`
 * (1.0, source `manual`). Optionally probes each candidate (HEAD then GET) to set
 * verified/unreachable/js_shell. Same dry-run-by-default, `--batch-id`-required,
 * printed-revert-SQL shape as `scripts/graph/seedVenueTypes.ts`.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/discoverWebsites.ts --batch-id vd-discover-1 --dry-run --limit 20
 *   bun run scripts/venue-details/discoverWebsites.ts --batch-id vd-discover-1 --probe --limit 20
 *   bun run scripts/venue-details/discoverWebsites.ts --batch-id vd-discover-1 --apply
 *   bun run scripts/venue-details/discoverWebsites.ts --batch-id vd-discover-1 --apply --force --account-ids 31,477
 *   bun run scripts/venue-details/discoverWebsites.ts --batch-id vd-discover-1 --apply --manual-map scripts/graph/tmp_analysis/manual-websites.csv
 */
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { accountAliasSet, listedVenueAccountIds } from "./universe";
import { extractHtml } from "./crawl/htmlText";

const VENUE_BOT_USER_AGENT = "DewweyVenueBot/1.0 (+https://dewwey.com/bot; venue facts for couples)";
const PROBE_TIMEOUT_MS = 15_000;

type Source = "vendors_website" | "legacy_venue_enrichment" | "accounts_external_url" | "manual";
type Status = "candidate" | "verified" | "rejected" | "unreachable" | "js_shell";

interface Candidate {
  accountId: number;
  url: string;
  source: Source;
  confidence: number;
}

interface ProbeResult {
  status: Status;
  httpStatus: number | null;
  finalUrl: string | null;
  note: string | null;
}

interface ExistingRow {
  account_id: number;
  url: string;
  source: Source;
  confidence: number;
  status: Status;
  http_status: number | null;
  final_url: string | null;
  checked_at: string | null;
  note: string | null;
  batch_id: string | null;
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  batchId: string;
  apply: boolean;
  limit: number | null;
  accountIds: number[] | null;
  probe: boolean;
  concurrency: number;
  force: boolean;
  manualMapPath: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const batchId = get("--batch-id");
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[discover-websites] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/venue-details/discoverWebsites.ts --batch-id <id> [--apply] [--probe] [--limit N] [--account-ids 1,2] [--force] [--manual-map <csv>]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  const accountIdsRaw = get("--account-ids");
  return {
    batchId,
    apply: a.includes("--apply"),
    limit: get("--limit") ? Number(get("--limit")) : null,
    accountIds: accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null,
    probe: a.includes("--probe"),
    concurrency: Number(get("--concurrency") ?? 4),
    force: a.includes("--force"),
    manualMapPath: get("--manual-map") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Manual map CSV (columns: account_id,url,note)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function loadManualMap(csvPath: string): Map<number, { url: string; note: string | null }> {
  const map = new Map<number, { url: string; note: string | null }>();
  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return map;
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const accountIdIdx = header.indexOf("account_id");
  const urlIdx = header.indexOf("url");
  const noteIdx = header.indexOf("note");
  if (accountIdIdx === -1 || urlIdx === -1) {
    throw new Error(`--manual-map csv must have an "account_id" and "url" column header (got: ${header.join(",")})`);
  }
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const accountId = Number(fields[accountIdIdx]);
    const url = fields[urlIdx]?.trim();
    if (!Number.isFinite(accountId) || !url) continue;
    map.set(accountId, { url, note: noteIdx >= 0 ? fields[noteIdx]?.trim() || null : null });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Candidate resolution
// ---------------------------------------------------------------------------

const LINK_HUB_HOSTS = new Set([
  "linktr.ee",
  "linkin.bio",
  "beacons.ai",
  "instagram.com",
  "facebook.com",
  "theknot.com",
  "weddingwire.com",
  "zola.com",
  "yelp.com",
  "google.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
]);

function isLinkHubOrSocial(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return [...LINK_HUB_HOSTS].some((hub) => host === hub || host.endsWith(`.${hub}`));
  } catch {
    return true; // unparsable -> reject
  }
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|ref)/i;

/** Strips tracking query params; keeps host/path as-is. Scheme upgrade to https happens only
 * during --probe (we need a successful https fetch to justify the swap). */
function normalizeCandidateUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    try {
      u = new URL(`https://${rawUrl.trim()}`);
    } catch {
      return null;
    }
  }
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

async function findCandidate(
  pool: Pool,
  accountId: number,
  manualMap: Map<number, { url: string; note: string | null }>
): Promise<Candidate | null> {
  const aliasSet = await accountAliasSet(pool, accountId);

  const { rows: vendorRows } = await pool.query<{ website: string }>(
    `select website from vendors where account_id = any($1::bigint[]) and website is not null and trim(website) <> '' order by id limit 1`,
    [aliasSet]
  );
  if (vendorRows[0]?.website) {
    const url = normalizeCandidateUrl(vendorRows[0].website);
    if (url) return { accountId, url, source: "vendors_website", confidence: 0.9 };
  }

  const { rows: enrichmentRows } = await pool.query<{ website: string }>(
    `select ve.website
     from venue_enrichment ve
     join vendors v on v.id = ve.vendor_id
     where v.account_id = any($1::bigint[]) and ve.website is not null and trim(ve.website) <> ''
     order by ve.vendor_id limit 1`,
    [aliasSet]
  );
  if (enrichmentRows[0]?.website) {
    const url = normalizeCandidateUrl(enrichmentRows[0].website);
    if (url) return { accountId, url, source: "legacy_venue_enrichment", confidence: 0.8 };
  }

  const { rows: accountRows } = await pool.query<{ external_url: string }>(
    `select external_url from accounts where id = $1 and external_url is not null and trim(external_url) <> ''`,
    [accountId]
  );
  if (accountRows[0]?.external_url) {
    const url = normalizeCandidateUrl(accountRows[0].external_url);
    if (url && !isLinkHubOrSocial(url)) {
      return { accountId, url, source: "accounts_external_url", confidence: 0.7 };
    }
  }

  const manual = manualMap.get(accountId);
  if (manual) {
    const url = normalizeCandidateUrl(manual.url);
    if (url) return { accountId, url, source: "manual", confidence: 1.0 };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Probing
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, method: "HEAD" | "GET"): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      headers: { "User-Agent": VENUE_BOT_USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeCandidate(candidate: Candidate): Promise<ProbeResult> {
  // Try https first if the candidate is http, since a successful https probe upgrades the URL.
  const attempts = candidate.url.startsWith("http://") ? [candidate.url.replace(/^http:\/\//, "https://"), candidate.url] : [candidate.url];

  let lastError: string | null = null;
  for (const attemptUrl of attempts) {
    try {
      // HEAD first just to fail fast on a dead host without paying for a full GET; a HEAD
      // response body is unreliable across servers (some return an empty body, some the real
      // content-length with no bytes), so it is never used for content itself -- only to bail
      // out early on a non-2xx/unsupported-method response before doing the real GET below.
      try {
        const headRes = await fetchWithTimeout(attemptUrl, "HEAD");
        if (!headRes.ok && headRes.status !== 405 && headRes.status !== 501) {
          lastError = `HTTP ${headRes.status}`;
          continue;
        }
      } catch {
        // Some servers reject HEAD outright; fall through to GET.
      }

      const res = await fetchWithTimeout(attemptUrl, "GET");
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!/text\/html/i.test(contentType) && contentType !== "") {
        return { status: "verified", httpStatus: res.status, finalUrl: res.url, note: `non-html content-type: ${contentType}` };
      }

      const html = await res.text();
      const { isJsShell } = await extractHtml(html, res.url);
      return {
        status: isJsShell ? "js_shell" : "verified",
        httpStatus: res.status,
        finalUrl: res.url,
        note: isJsShell ? "text.length < 400 after HTML parse" : null,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { status: "unreachable", httpStatus: null, finalUrl: null, note: lastError };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const pool = getPool();

  console.log(`[discover-websites] mode: ${args.apply ? "APPLY (real write)" : "DRY RUN"}`);
  console.log(`[discover-websites] batch_id: ${args.batchId}`);

  const manualMap = args.manualMapPath ? loadManualMap(args.manualMapPath) : new Map();
  if (args.manualMapPath) console.log(`[discover-websites] loaded ${manualMap.size} manual-map rows from ${args.manualMapPath}`);

  let universe = await listedVenueAccountIds(pool);
  console.log(`[discover-websites] listed venue universe (live searchVendors predicate): ${universe.length}`);

  if (args.accountIds) {
    const wanted = new Set(args.accountIds);
    universe = universe.filter((id) => wanted.has(id));
  }
  if (args.limit) universe = universe.slice(0, args.limit);

  const candidates: (Candidate | null)[] = [];
  for (const accountId of universe) {
    candidates.push(await findCandidate(pool, accountId, manualMap));
  }

  const withCandidate = candidates.filter((c): c is Candidate => c !== null);
  const bySource: Record<string, number> = {};
  for (const c of withCandidate) bySource[c.source] = (bySource[c.source] ?? 0) + 1;

  let probeResults = new Map<number, ProbeResult>();
  if (args.probe) {
    console.log(`[discover-websites] probing ${withCandidate.length} candidates (concurrency ${args.concurrency})...`);
    const results = await mapWithConcurrency(withCandidate, args.concurrency, async (c) => ({ accountId: c.accountId, result: await probeCandidate(c) }));
    probeResults = new Map(results.map((r) => [r.accountId, r.result]));
  }

  const verifiedCount = [...probeResults.values()].filter((r) => r.status === "verified").length;
  const unreachableCount = [...probeResults.values()].filter((r) => r.status === "unreachable").length;
  const jsShellCount = [...probeResults.values()].filter((r) => r.status === "js_shell").length;

  console.log(`\n[discover-websites] funnel:`);
  console.log(`  listed:          ${universe.length}`);
  console.log(`  has candidate:   ${withCandidate.length}`);
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${source}: ${count}`);
  }
  if (args.probe) {
    console.log(`  probed:          ${withCandidate.length}`);
    console.log(`    verified:      ${verifiedCount}`);
    console.log(`    js_shell:      ${jsShellCount}`);
    console.log(`    unreachable:   ${unreachableCount}`);
  }

  if (!args.apply) {
    console.log(`\n[discover-websites] DRY RUN -- no writes. Re-run with --apply to write venue_websites.`);
    await closePool();
    return;
  }

  // Capture pre-existing rows for every touched account so we can print an exact revert.
  const touchedIds = withCandidate.map((c) => c.accountId);
  const { rows: existingRows } = touchedIds.length
    ? await pool.query<ExistingRow>(`select * from venue_websites where account_id = any($1::bigint[])`, [touchedIds])
    : { rows: [] as ExistingRow[] };
  const existingById = new Map(existingRows.map((r) => [r.account_id, r]));

  let written = 0;
  let skippedManualLock = 0;
  let skippedVerifiedLock = 0;

  for (const candidate of withCandidate) {
    const existing = existingById.get(candidate.accountId);
    const probe = probeResults.get(candidate.accountId);

    if (existing?.source === "manual" && candidate.source !== "manual") {
      skippedManualLock++;
      continue;
    }
    if (existing?.status === "verified" && !args.force) {
      skippedVerifiedLock++;
      continue;
    }

    const status: Status = probe?.status ?? "candidate";
    await pool.query(
      `insert into venue_websites (account_id, url, source, confidence, status, http_status, final_url, checked_at, note, batch_id, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       on conflict (account_id) do update set
         url = excluded.url, source = excluded.source, confidence = excluded.confidence,
         status = excluded.status, http_status = excluded.http_status, final_url = excluded.final_url,
         checked_at = excluded.checked_at, note = excluded.note, batch_id = excluded.batch_id, updated_at = now()`,
      [
        candidate.accountId,
        probe?.finalUrl ?? candidate.url,
        candidate.source,
        candidate.confidence,
        status,
        probe?.httpStatus ?? null,
        probe?.finalUrl ?? null,
        probe ? new Date().toISOString() : null,
        probe?.note ?? null,
        args.batchId,
      ]
    );
    written++;
  }

  console.log(`\n[discover-websites] wrote ${written} rows (skipped ${skippedManualLock} manual-locked, ${skippedVerifiedLock} verified-locked without --force)`);

  const restoreRows = [...existingById.values()];
  console.log(`\n[discover-websites] to revert this batch by hand:`);
  console.log(`  begin;`);
  console.log(`  delete from venue_websites where batch_id = '${args.batchId}';`);
  for (const row of restoreRows) {
    console.log(
      `  insert into venue_websites (account_id, url, source, confidence, status, http_status, final_url, checked_at, note, batch_id, created_at, updated_at) values (` +
        `${row.account_id}, ${sqlStr(row.url)}, ${sqlStr(row.source)}, ${row.confidence}, ${sqlStr(row.status)}, ${row.http_status ?? "null"}, ` +
        `${sqlStr(row.final_url)}, ${sqlStr(row.checked_at)}, ${sqlStr(row.note)}, ${sqlStr(row.batch_id)}, now(), now());`
    );
  }
  console.log(`  commit;`);

  await closePool();
}

function sqlStr(v: string | null): string {
  return v === null ? "null" : `'${v.replace(/'/g, "''")}'`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
