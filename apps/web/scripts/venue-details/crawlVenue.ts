/**
 * BFS crawl of one venue website (D060 Phase 2 crawl-only checkpoint). Score-ordered
 * (`crawl/urlScore.ts`), same-registrable-host except allowed off-site PDFs
 * (`isOffsitePdfAllowed`), robots-respecting (`crawl/robots.ts`), politely rate-limited per
 * host. Every fetched page/PDF is deduped by `sha256(text)` against `venue_source_snapshots`
 * (insert-only) and always mirrored to the local cache (`crawl/cache.ts`) so extraction can run
 * offline. `--dry-run` does the fetch + parse + local cache only -- no DB or R2 writes.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/crawlVenue.ts --dry-run --account-ids 477 --website-override https://greenhouseloft.com/ --max-pages 12
 *   bun run scripts/venue-details/crawlVenue.ts --from-websites --limit 10 --crawl-batch vd-crawl-1
 *   bun run scripts/venue-details/crawlVenue.ts --account-ids 31,477,507 --crawl-batch vd-crawl-1
 *   bun run scripts/venue-details/crawlVenue.ts --dry-run --account-ids 31 --website-override https://www.galleriamarchetti.com/ --seed-urls scripts/venue-details/seeds/golden-seeds.csv
 *
 * `--seed-urls <csv>` (columns account_id,url,note): known public documents a plain-fetch crawl
 * can't discover on its own (a JS-rendered download link, e.g. Marchetti's brochure) get
 * enqueued at depth 0 / score SEED_SCORE regardless of same-host/off-site-PDF rules, tagged
 * `source: "manual_seed"` in the summary/cache manifest (never in the DB fetch row's
 * `crawl_batch`, which stays whatever `--crawl-batch` says).
 *
 * 2026-09-14 follow-up ("the wedding site variant, not just the homepage"): when the account's
 * `venue_websites` row has a `wedding_url` (found by `scripts/venue-details/crawl/weddingPage.ts`
 * via `discoverWebsites.ts --probe`), or `--wedding-url-override <url>` is passed (paired with a
 * single `--account-ids`, same shape as `--website-override`), it is enqueued at depth 0 with a
 * score high enough to be fetched right after the homepage -- tagged `source: "wedding_page"` in
 * the summary/cache manifest -- so its own sub-links get crawled at depth 1 too. Unlike a manual
 * seed it is still subject to the normal same-host/off-site-PDF rule (it's expected to already
 * live on the venue's own host); a wedding_url identical to the homepage is not double-enqueued.
 */
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { extractHtml, type HtmlLink } from "./crawl/htmlText";
import { extractPdfText } from "./crawl/pdfText";
import { isAllowed, fetchRobots, VENUE_BOT_NAME, VENUE_BOT_USER_AGENT } from "./crawl/robots";
import { isOffsitePdfAllowed, sameRegistrableHost, scoreUrl } from "./crawl/urlScore";
import { putSnapshotText, snapshotKey } from "./crawl/r2";
import { sha256, writeCacheEntry } from "./crawl/cache";
import { parseCsvRows } from "./csv";

// ---------------------------------------------------------------------------
// Manual seeds (--seed-urls <csv>, columns account_id,url,note)
// ---------------------------------------------------------------------------

export const SEED_SCORE = 10;

/** Score for a venue's own wedding_url item (2026-09-14 follow-up), chosen relative to
 * SEED_SCORE so it comfortably outranks a manual seed and any normally-discovered link (whose
 * realistic ceiling from `urlScore.ts`'s additive bonuses is well below this in practice) while
 * staying below the homepage's own Number.POSITIVE_INFINITY -- i.e. it is fetched right after
 * the homepage, exactly as the spec asks. */
export const WEDDING_PAGE_SCORE = SEED_SCORE + 8;

export interface Seed {
  accountId: number;
  url: string;
  note: string;
}

/** Pure parse of a seed CSV's text (columns account_id,url,note) into rows. Exported for unit
 * testing; `loadSeedsFile` below does the actual file read. */
export function parseSeedsCsv(text: string): Seed[] {
  const { header, rows } = parseCsvRows(text, ["account_id", "url"]);
  const accountIdIdx = header.indexOf("account_id");
  const urlIdx = header.indexOf("url");
  const noteIdx = header.indexOf("note");
  const seeds: Seed[] = [];
  for (const fields of rows) {
    const accountId = Number(fields[accountIdIdx]);
    const url = fields[urlIdx]?.trim();
    if (!Number.isFinite(accountId) || !url) continue;
    seeds.push({ accountId, url, note: (noteIdx >= 0 ? fields[noteIdx]?.trim() : "") || "" });
  }
  return seeds;
}

/** Groups a seed CSV's rows by account_id, for `crawlOneVenue` to pull its own seeds out of a
 * shared file (one CSV can seed many venues). */
export function loadSeedsFile(csvPath: string): Map<number, Seed[]> {
  const text = readFileSync(csvPath, "utf8");
  const byAccount = new Map<number, Seed[]>();
  for (const seed of parseSeedsCsv(text)) {
    const list = byAccount.get(seed.accountId) ?? [];
    list.push(seed);
    byAccount.set(seed.accountId, list);
  }
  return byAccount;
}

/** Builds the depth-0, score-`SEED_SCORE` queue items for a venue's manual seeds. Pure --
 * exported so enqueue-ordering can be unit tested without a network call. */
export function buildSeedQueueItems(seeds: Seed[]): QueueItem[] {
  return seeds.map((seed) => ({
    url: seed.url,
    depth: 0,
    score: SEED_SCORE,
    isPdf: isPdfUrl(seed.url),
    anchorText: "",
    isSeed: true,
    seedNote: seed.note,
  }));
}

const HTML_BYTE_CAP = 2 * 1024 * 1024; // 2 MB
const PDF_BYTE_CAP = 15 * 1024 * 1024; // 15 MB
const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  accountIds: number[] | null;
  fromWebsites: boolean;
  limit: number | null;
  maxPages: number;
  maxPdfs: number;
  maxDepth: number;
  delayMs: number;
  concurrency: number;
  refresh: boolean;
  crawlBatch: string | null;
  dryRun: boolean;
  printManifest: boolean;
  websiteOverride: string | null;
  seedUrls: string | null;
  weddingUrlOverride: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const accountIdsRaw = get("--account-ids");
  const dryRun = a.includes("--dry-run");
  const crawlBatch = get("--crawl-batch") ?? null;
  if (!dryRun && !crawlBatch) {
    console.error("[crawl-venue] --crawl-batch <id> is required unless --dry-run is passed.");
    process.exit(1);
  }
  const websiteOverride = get("--website-override") ?? null;
  const weddingUrlOverride = get("--wedding-url-override") ?? null;
  const accountIds = accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null;
  if (websiteOverride && (!accountIds || accountIds.length !== 1)) {
    console.error("[crawl-venue] --website-override requires exactly one --account-ids value.");
    process.exit(1);
  }
  if (weddingUrlOverride && (!accountIds || accountIds.length !== 1)) {
    console.error("[crawl-venue] --wedding-url-override requires exactly one --account-ids value.");
    process.exit(1);
  }
  return {
    accountIds,
    fromWebsites: a.includes("--from-websites"),
    limit: get("--limit") ? Number(get("--limit")) : null,
    maxPages: Number(get("--max-pages") ?? 30),
    maxPdfs: Number(get("--max-pdfs") ?? 8),
    maxDepth: Number(get("--max-depth") ?? 3),
    delayMs: Number(get("--delay-ms") ?? 1500),
    concurrency: Number(get("--concurrency") ?? 3),
    refresh: a.includes("--refresh"),
    crawlBatch,
    dryRun,
    printManifest: a.includes("--print-manifest"),
    websiteOverride,
    seedUrls: get("--seed-urls") ?? null,
    weddingUrlOverride,
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface FetchOutcome {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  finalUrl: string | null;
  bytes: Uint8Array | null;
  error: string | null;
  tooLarge: boolean;
}

async function fetchOnce(url: string, capBytes: number): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": VENUE_BOT_USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type");
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > capBytes) {
      return { ok: false, status: res.status, contentType, finalUrl: res.url, bytes: null, error: "content-length exceeds cap", tooLarge: true };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > capBytes) {
      return { ok: res.ok, status: res.status, contentType, finalUrl: res.url, bytes: buf.slice(0, capBytes), error: null, tooLarge: true };
    }
    return { ok: res.ok, status: res.status, contentType, finalUrl: res.url, bytes: buf, error: null, tooLarge: false };
  } catch (e) {
    return { ok: false, status: null, contentType: null, finalUrl: null, bytes: null, error: e instanceof Error ? e.message : String(e), tooLarge: false };
  } finally {
    clearTimeout(timeout);
  }
}

/** One retry on 5xx or network error (no retry on 4xx). */
async function fetchWithRetry(url: string, capBytes: number): Promise<FetchOutcome> {
  const first = await fetchOnce(url, capBytes);
  const shouldRetry = first.error !== null || (first.status !== null && first.status >= 500);
  if (!shouldRetry) return first;
  return fetchOnce(url, capBytes);
}

// ---------------------------------------------------------------------------
// Queue item
// ---------------------------------------------------------------------------

interface QueueItem {
  url: string;
  depth: number;
  score: number;
  isPdf: boolean;
  anchorText: string;
  /** From `--seed-urls` (coordinator follow-up, 2026-09-13): a manually seeded URL, enqueued at
   * depth 0 / score SEED_SCORE, exempt from the same-registrable-host / off-site-PDF rule (a
   * known public document a JS-rendered site never links to server-side, e.g. Marchetti's
   * framerusercontent.com brochure). */
  isSeed?: boolean;
  seedNote?: string;
  /** From `venue_websites.wedding_url` or `--wedding-url-override` (2026-09-14 follow-up): the
   * venue's own dedicated wedding page, enqueued at depth 0 / score WEDDING_PAGE_SCORE. Unlike
   * a manual seed this is still subject to the normal same-host/off-site-PDF rule. */
  isWeddingPage?: boolean;
}

/** Dedupe key ignoring scheme/www and a trailing slash -- `https://x.com/` and
 * `http://www.x.com` (a common http->https / bare->www redirect pair) must count as the same
 * page for `visited`, or a redirecting homepage burns the page budget on itself. */
function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
    return `${host}${pathname}${u.search}`.toLowerCase();
  } catch {
    return url;
  }
}

function isPdfUrl(url: string): boolean {
  try {
    return /\.pdf(\?|#|$)/i.test(new URL(url).pathname + new URL(url).search);
  } catch {
    return /\.pdf(\?|#|$)/i.test(url);
  }
}

/** Builds the depth-0, score-WEDDING_PAGE_SCORE queue item for a venue's own wedding page
 * (`venue_websites.wedding_url` or `--wedding-url-override`), or null when there's no
 * wedding_url or it's the same page as the homepage -- enqueuing a duplicate would just be
 * silently dropped by the visited-set check on dequeue, losing its "wedding_page" tag in the
 * summary/cache manifest for no benefit. Pure -- exported for unit testing. */
export function buildWeddingPageQueueItem(weddingUrl: string | null, homepage: string): QueueItem | null {
  if (!weddingUrl) return null;
  if (normalizeUrlKey(weddingUrl) === normalizeUrlKey(homepage)) return null;
  return { url: weddingUrl, depth: 0, score: WEDDING_PAGE_SCORE, isPdf: isPdfUrl(weddingUrl), anchorText: "", isWeddingPage: true };
}

interface CrawlSummary {
  accountId: number;
  homepage: string;
  htmlFetched: number;
  htmlUnchanged: number;
  jsShellCount: number;
  blockedCount: number;
  pdfsWithTextLayer: number;
  pdfsWithoutTextLayer: number;
  offsitePdfsFollowed: number;
  totalChars: number;
  hostBlocked: boolean;
  entries: {
    url: string;
    kind: "html" | "pdf";
    depth: number;
    score: number;
    outcome: string;
    chars: number;
    hasTextLayer: boolean | null;
    offsite: boolean;
    source: "crawl" | "manual_seed" | "wedding_page";
    seedNote?: string;
  }[];
}

async function crawlOneVenue(
  pool: Pool | null,
  accountId: number,
  homepage: string,
  args: Args,
  seeds: Seed[] = [],
  weddingUrl: string | null = null
): Promise<CrawlSummary> {
  const summary: CrawlSummary = {
    accountId,
    homepage,
    htmlFetched: 0,
    htmlUnchanged: 0,
    jsShellCount: 0,
    blockedCount: 0,
    pdfsWithTextLayer: 0,
    pdfsWithoutTextLayer: 0,
    offsitePdfsFollowed: 0,
    totalChars: 0,
    hostBlocked: false,
    entries: [],
  };

  const weddingPageItem = buildWeddingPageQueueItem(weddingUrl, homepage);

  const visited = new Set<string>();
  const queue: QueueItem[] = [
    { url: homepage, depth: 0, score: Number.POSITIVE_INFINITY, isPdf: isPdfUrl(homepage), anchorText: "" },
    // Right after the homepage (WEDDING_PAGE_SCORE outranks SEED_SCORE and any realistic
    // urlScore.ts total) and before any manual seeds, per spec.
    ...(weddingPageItem ? [weddingPageItem] : []),
    ...buildSeedQueueItems(seeds),
  ];
  const lastFetchAtByHost = new Map<string, number>();
  let hostBlocked = false;

  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return u;
    }
  };

  while (queue.length > 0 && !hostBlocked) {
    if (summary.htmlFetched >= args.maxPages && summary.entries.filter((e) => e.kind === "pdf").length >= args.maxPdfs) break;

    queue.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.depth - b.depth));
    const item = queue.shift()!;
    if (visited.has(normalizeUrlKey(item.url))) continue;
    if (item.depth > args.maxDepth) continue;

    const isHome = item.depth === 0;
    if (!isHome && !(item.score >= 0 || item.depth <= 1)) continue; // low priority, never fetched

    if (item.isPdf) {
      if (summary.entries.filter((e) => e.kind === "pdf").length >= args.maxPdfs) continue;
    } else {
      if (summary.htmlFetched >= args.maxPages) continue;
    }

    const offsite = !sameRegistrableHost(item.url, homepage);
    // A manual seed (--seed-urls) is exempt from the same-host/off-site-PDF rule -- it is a
    // known public document by construction, not something discovered mid-crawl.
    if (!item.isSeed && offsite && (!item.isPdf || !isOffsitePdfAllowed(item.url, item.anchorText))) continue;

    visited.add(normalizeUrlKey(item.url));
    const source: "crawl" | "manual_seed" | "wedding_page" = item.isSeed ? "manual_seed" : item.isWeddingPage ? "wedding_page" : "crawl";

    const robotsOk = await isAllowed(item.url).catch(() => true);
    if (!robotsOk) {
      summary.entries.push({ url: item.url, kind: item.isPdf ? "pdf" : "html", depth: item.depth, score: item.score, outcome: "skipped (robots)", chars: 0, hasTextLayer: null, offsite, source, seedNote: item.seedNote });
      continue;
    }

    // Polite per-host delay: max(--delay-ms, robots Crawl-delay).
    const host = hostOf(item.url);
    const robots = await fetchRobots(item.url, VENUE_BOT_NAME, VENUE_BOT_USER_AGENT).catch(() => ({ rules: [], crawlDelayMs: 0 }));
    const delay = Math.max(args.delayMs, robots.crawlDelayMs);
    const lastAt = lastFetchAtByHost.get(host);
    if (lastAt !== undefined) {
      const wait = delay - (Date.now() - lastAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    lastFetchAtByHost.set(host, Date.now());

    const outcome = await fetchWithRetry(item.url, item.isPdf ? PDF_BYTE_CAP : HTML_BYTE_CAP);

    if (outcome.status === 403 || outcome.status === 429 || outcome.status === 503) {
      hostBlocked = true;
      summary.hostBlocked = true;
      summary.blockedCount++;
      summary.entries.push({ url: item.url, kind: item.isPdf ? "pdf" : "html", depth: item.depth, score: item.score, outcome: `blocked (HTTP ${outcome.status})`, chars: 0, hasTextLayer: null, offsite, source, seedNote: item.seedNote });
      if (!args.dryRun && pool) {
        await pool.query(`update venue_websites set status = 'unreachable', note = $2, updated_at = now() where account_id = $1`, [
          accountId,
          `blocked during crawl: HTTP ${outcome.status} on ${item.url}`,
        ]);
      }
      break;
    }

    if (!outcome.ok || !outcome.bytes) {
      summary.entries.push({ url: item.url, kind: item.isPdf ? "pdf" : "html", depth: item.depth, score: item.score, outcome: `error (${outcome.error ?? outcome.status})`, chars: 0, hasTextLayer: null, offsite, source, seedNote: item.seedNote });
      continue;
    }

    if (item.isPdf) {
      if (offsite) summary.offsitePdfsFollowed++;
      const { text, hasTextLayer } = await extractPdfText(outcome.bytes);
      const hash = sha256(text);
      summary.totalChars += text.length;
      if (hasTextLayer) summary.pdfsWithTextLayer++;
      else summary.pdfsWithoutTextLayer++;

      await writeCacheEntry(
        accountId,
        { url: item.url, finalUrl: outcome.finalUrl, kind: "pdf", title: null, hasTextLayer, depth: item.depth, score: item.score, source, seedNote: item.seedNote ?? null },
        text
      );

      // The fetch row's crawl_batch is unchanged by seeding -- it stays whatever --crawl-batch
      // says regardless of source; "manual_seed" is a summary/cache-manifest concept only.
      if (!args.dryRun && pool) {
        await recordSnapshotAndFetch(pool, accountId, item, outcome, "pdf", hash, text, null, hasTextLayer, args.crawlBatch!);
      }

      summary.entries.push({ url: item.url, kind: "pdf", depth: item.depth, score: item.score, outcome: "fetched", chars: text.length, hasTextLayer, offsite, source, seedNote: item.seedNote });
      continue;
    }

    // HTML
    const html = new TextDecoder().decode(outcome.bytes);
    const { text, title, links, assetCandidates, isJsShell } = await extractHtml(html, outcome.finalUrl ?? item.url);
    const hash = sha256(text);

    await writeCacheEntry(
      accountId,
      { url: item.url, finalUrl: outcome.finalUrl, kind: "html", title, hasTextLayer: null, depth: item.depth, score: item.score, source, seedNote: item.seedNote ?? null },
      text
    );

    let dbOutcome: "fetched" | "unchanged" | "js_shell" = "fetched";
    if (!args.dryRun && pool) {
      if (isJsShell) {
        await recordJsShellFetch(pool, accountId, item, outcome, args.crawlBatch!);
        dbOutcome = "js_shell";
      } else {
        dbOutcome = await recordSnapshotAndFetch(pool, accountId, item, outcome, "html", hash, text, title, null, args.crawlBatch!);
      }
    } else if (isJsShell) {
      dbOutcome = "js_shell";
    }

    summary.htmlFetched++;
    summary.totalChars += text.length;
    if (dbOutcome === "unchanged") summary.htmlUnchanged++;
    if (isJsShell) summary.jsShellCount++;

    summary.entries.push({ url: item.url, kind: "html", depth: item.depth, score: item.score, outcome: dbOutcome, chars: text.length, hasTextLayer: null, offsite, source, seedNote: item.seedNote });

    if (!isJsShell) {
      const allLinks: (HtmlLink & { isPdfLink: boolean })[] = [
        ...links.map((l) => ({ ...l, isPdfLink: false })),
        ...assetCandidates.map((a) => ({ href: a.href, text: a.text, fromNav: false, isPdfLink: true })),
      ];
      for (const link of allLinks) {
        if (visited.has(normalizeUrlKey(link.href))) continue;
        const score = scoreUrl(link.href, { fromNav: link.fromNav, anchorText: link.text, parentScore: item.score });
        if (score === null) continue;
        const linkIsPdf = link.isPdfLink || isPdfUrl(link.href);
        const linkOffsite = !sameRegistrableHost(link.href, homepage);
        if (linkOffsite && (!linkIsPdf || !isOffsitePdfAllowed(link.href, link.text))) continue;
        queue.push({ url: link.href, depth: item.depth + 1, score, isPdf: linkIsPdf, anchorText: link.text });
      }
    }
  }

  return summary;
}

async function recordSnapshotAndFetch(
  pool: Pool,
  accountId: number,
  item: QueueItem,
  outcome: FetchOutcome,
  kind: "html" | "pdf",
  hash: string,
  text: string,
  title: string | null,
  hasTextLayer: boolean | null,
  crawlBatch: string
): Promise<"fetched" | "unchanged"> {
  const { rows: existing } = await pool.query<{ id: string }>(
    `select id::text from venue_source_snapshots where account_id = $1 and url = $2 and sha256 = $3`,
    [accountId, item.url, hash]
  );

  let snapshotId: number;
  let dbOutcome: "fetched" | "unchanged";
  if (existing[0]) {
    snapshotId = Number(existing[0].id);
    dbOutcome = "unchanged";
  } else {
    const key = snapshotKey(accountId, hash);
    await putSnapshotText(key, text);
    const { rows: inserted } = await pool.query<{ id: string }>(
      `insert into venue_source_snapshots (account_id, url, final_url, kind, sha256, r2_key, chars, title, has_text_layer)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id::text`,
      [accountId, item.url, outcome.finalUrl, kind, hash, key, text.length, title, hasTextLayer]
    );
    snapshotId = Number(inserted[0].id);
    dbOutcome = "fetched";
  }

  await pool.query(
    `insert into venue_source_fetches (account_id, url, http_status, content_type, outcome, snapshot_id, depth, score, crawl_batch)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [accountId, item.url, outcome.status, outcome.contentType, dbOutcome, snapshotId, item.depth, Math.trunc(Math.min(item.score, 1_000_000)), crawlBatch]
  );

  return dbOutcome;
}

/** js_shell pages get a fetch row only -- no snapshot (spec: "js_shell pages: fetch row only"). */
async function recordJsShellFetch(pool: Pool, accountId: number, item: QueueItem, outcome: FetchOutcome, crawlBatch: string): Promise<void> {
  await pool.query(
    `insert into venue_source_fetches (account_id, url, http_status, content_type, outcome, snapshot_id, depth, score, crawl_batch)
     values ($1, $2, $3, $4, 'js_shell', null, $5, $6, $7)`,
    [accountId, item.url, outcome.status, outcome.contentType, item.depth, Math.trunc(Math.min(item.score, 1_000_000)), crawlBatch]
  );
}

// ---------------------------------------------------------------------------
// Venue selection
// ---------------------------------------------------------------------------

interface VenueTarget {
  accountId: number;
  url: string;
  /** venue_websites.wedding_url (2026-09-14 follow-up), or --wedding-url-override. */
  weddingUrl?: string | null;
}

async function selectVenues(pool: Pool, args: Args): Promise<VenueTarget[]> {
  if (args.websiteOverride) {
    return [{ accountId: args.accountIds![0], url: args.websiteOverride, weddingUrl: args.weddingUrlOverride }];
  }

  if (args.accountIds) {
    const { rows } = await pool.query<{ account_id: number; url: string; wedding_url: string | null }>(
      `select account_id, url, wedding_url from venue_websites where account_id = any($1::bigint[]) and status in ('verified', 'candidate')`,
      [args.accountIds]
    );
    return rows.map((r) => ({ accountId: Number(r.account_id), url: r.url, weddingUrl: args.weddingUrlOverride ?? r.wedding_url }));
  }

  if (args.fromWebsites) {
    const { rows } = await pool.query<{ account_id: number; url: string; wedding_url: string | null }>(
      `select account_id, url, wedding_url from venue_websites where status in ('verified', 'candidate') order by account_id limit $1`,
      [args.limit ?? 1000]
    );
    return rows.map((r) => ({ accountId: Number(r.account_id), url: r.url, weddingUrl: r.wedding_url }));
  }

  console.error("[crawl-venue] pass --account-ids <ids> or --from-websites.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printSummary(summary: CrawlSummary, printManifest: boolean) {
  const seedCount = summary.entries.filter((e) => e.source === "manual_seed").length;
  const weddingPageFetched = summary.entries.some((e) => e.source === "wedding_page" && e.outcome !== "skipped (robots)" && !e.outcome.startsWith("error") && !e.outcome.startsWith("blocked"));
  console.log(`\n[crawl-venue] account ${summary.accountId} (${summary.homepage})`);
  console.log(`  pages fetched:        ${summary.htmlFetched} (unchanged: ${summary.htmlUnchanged}, js_shell: ${summary.jsShellCount})`);
  console.log(`  pdfs:                 with text layer ${summary.pdfsWithTextLayer}, without ${summary.pdfsWithoutTextLayer}`);
  console.log(`  off-site pdfs followed: ${summary.offsitePdfsFollowed}`);
  console.log(`  manual seeds fetched:  ${seedCount}`);
  console.log(`  wedding page fetched:  ${weddingPageFetched}`);
  console.log(`  host blocked mid-crawl: ${summary.hostBlocked}`);
  console.log(`  total chars:           ${summary.totalChars}`);
  if (printManifest) {
    console.log(`  manifest:`);
    for (const e of summary.entries) {
      const seedTag = e.source === "manual_seed" ? ` [manual_seed: ${e.seedNote ?? ""}]` : e.source === "wedding_page" ? ` [wedding_page]` : "";
      console.log(
        `    [${e.kind}] d${e.depth} score=${e.score} chars=${e.chars} textLayer=${e.hasTextLayer ?? "n/a"} offsite=${e.offsite} -- ${e.outcome}${seedTag} -- ${e.url}`
      );
    }
  }
}

async function main() {
  const args = parseArgs();
  // --website-override skips the DB lookup entirely (used for a --dry-run smoke test against a
  // single account with no venue_websites row yet). Otherwise a pool is always needed: either to
  // select venues (--account-ids/--from-websites) or, when not a dry run, to write snapshots/
  // fetches/status updates during the crawl itself.
  const needsPool = !args.websiteOverride || !args.dryRun;
  const pool = needsPool ? getPool() : null;

  if (!pool && !args.websiteOverride) {
    console.error("[crawl-venue] no venue selection given.");
    process.exit(1);
  }

  const targets = args.websiteOverride
    ? [{ accountId: args.accountIds![0], url: args.websiteOverride, weddingUrl: args.weddingUrlOverride }]
    : await selectVenues(pool!, args);

  const limited = args.limit && !args.accountIds ? targets.slice(0, args.limit) : targets;

  const seedsByAccount = args.seedUrls ? loadSeedsFile(args.seedUrls) : new Map<number, Seed[]>();
  if (args.seedUrls) {
    const total = [...seedsByAccount.values()].reduce((n, s) => n + s.length, 0);
    console.log(`[crawl-venue] loaded ${total} seed(s) for ${seedsByAccount.size} account(s) from ${args.seedUrls}`);
  }

  console.log(`[crawl-venue] mode: ${args.dryRun ? "DRY RUN (fetch + parse + local cache only, no DB/R2 writes)" : "LIVE"}`);
  console.log(`[crawl-venue] venues to crawl: ${limited.length}`);

  for (const target of limited) {
    const seeds = seedsByAccount.get(target.accountId) ?? [];
    const summary = await crawlOneVenue(args.dryRun ? null : pool, target.accountId, target.url, args, seeds, target.weddingUrl ?? null);
    printSummary(summary, args.printManifest);
  }

  if (pool) await closePool();
}

// Guarded so importing the pure helpers above (parseSeedsCsv, buildSeedQueueItems, etc.) for
// unit tests never triggers CLI arg parsing / process.exit as an import side effect.
if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
