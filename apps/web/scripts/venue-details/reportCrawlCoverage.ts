/**
 * The crawl-only checkpoint report (D060 plan: "before any LLM spend on a new population").
 * Reads `venue_websites` + `venue_source_fetches` + `venue_source_snapshots` (or, with
 * `--from-cache`, the local cache manifests) and prints a Markdown table per venue plus the
 * ceiling summary: venues with >= 5 usable pages (>= 400 chars), venues that are shells (zero
 * usable pages), and venues whose only pricing-looking source is an image-only PDF.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/reportCrawlCoverage.ts
 *   bun run scripts/venue-details/reportCrawlCoverage.ts --account-ids 31,477,507
 *   bun run scripts/venue-details/reportCrawlCoverage.ts --from-cache
 *   bun run scripts/venue-details/reportCrawlCoverage.ts --out scripts/graph/tmp_analysis/coverage.md --json
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "../classify/db";
import { readManifest } from "./crawl/cache";

const USABLE_PAGE_CHARS = 400;

interface VenueCoverage {
  accountId: number;
  websiteUrl: string | null;
  websiteStatus: string | null;
  usablePages: number;
  jsShellPages: number;
  pdfsWithTextLayer: number;
  imageOnlyPdfs: number;
  offsitePdfsFollowed: number;
  totalChars: number;
  /** venue_websites.wedding_url/wedding_url_source (2026-09-14 follow-up) -- null in
   * --from-cache mode, which has no DB access and so no way to know it. */
  weddingUrl: string | null;
  weddingUrlSource: string | null;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const accountIdsRaw = get("--account-ids");
  return {
    accountIds: accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null,
    fromCache: a.includes("--from-cache"),
    out: get("--out") ?? null,
    json: a.includes("--json"),
  };
}

async function coverageFromDb(accountIds: number[] | null): Promise<VenueCoverage[]> {
  const pool = getPool();
  const { rows: websites } = await pool.query<{
    account_id: number;
    url: string;
    status: string;
    wedding_url: string | null;
    wedding_url_source: string | null;
  }>(
    accountIds
      ? `select account_id, url, status, wedding_url, wedding_url_source from venue_websites where account_id = any($1::bigint[]) order by account_id`
      : `select account_id, url, status, wedding_url, wedding_url_source from venue_websites order by account_id`,
    accountIds ? [accountIds] : []
  );

  const results: VenueCoverage[] = [];
  for (const site of websites) {
    const homepageHost = safeHost(site.url);

    const { rows: fetches } = await pool.query<{
      url: string;
      outcome: string;
      chars: number | null;
      kind: string | null;
      has_text_layer: boolean | null;
    }>(
      `select f.url, f.outcome, s.chars, s.kind, s.has_text_layer
       from venue_source_fetches f
       left join venue_source_snapshots s on s.id = f.snapshot_id
       where f.account_id = $1`,
      [site.account_id]
    );

    let usablePages = 0;
    let jsShellPages = 0;
    let pdfsWithTextLayer = 0;
    let imageOnlyPdfs = 0;
    let offsitePdfsFollowed = 0;
    let totalChars = 0;

    for (const f of fetches) {
      if (f.outcome === "js_shell") {
        jsShellPages++;
        continue;
      }
      if (f.kind === "html") {
        const chars = f.chars ?? 0;
        totalChars += chars;
        if (chars >= USABLE_PAGE_CHARS) usablePages++;
        else jsShellPages++;
      } else if (f.kind === "pdf") {
        totalChars += f.chars ?? 0;
        if (f.has_text_layer) pdfsWithTextLayer++;
        else imageOnlyPdfs++;
        if (homepageHost && safeHost(f.url) !== homepageHost) offsitePdfsFollowed++;
      }
    }

    results.push({
      accountId: site.account_id,
      websiteUrl: site.url,
      websiteStatus: site.status,
      usablePages,
      jsShellPages,
      pdfsWithTextLayer,
      imageOnlyPdfs,
      offsitePdfsFollowed,
      weddingUrl: site.wedding_url,
      weddingUrlSource: site.wedding_url_source,
      totalChars,
    });
  }
  return results;
}

async function coverageFromCache(accountIds: number[] | null): Promise<VenueCoverage[]> {
  const cacheRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "cache");
  let ids: number[];
  if (accountIds) {
    ids = accountIds;
  } else {
    try {
      const dirs = await readdir(cacheRoot);
      ids = dirs.map((d) => Number(d)).filter((n) => Number.isFinite(n));
    } catch {
      ids = [];
    }
  }

  const results: VenueCoverage[] = [];
  for (const accountId of ids) {
    const manifest = await readManifest(accountId);
    const homepage = manifest.entries.find((e) => e.depth === 0)?.url ?? manifest.entries[0]?.url ?? null;
    const homepageHost = homepage ? safeHost(homepage) : null;

    let usablePages = 0;
    let jsShellPages = 0;
    let pdfsWithTextLayer = 0;
    let imageOnlyPdfs = 0;
    let offsitePdfsFollowed = 0;
    let totalChars = 0;

    for (const e of manifest.entries) {
      totalChars += e.chars;
      if (e.kind === "html") {
        if (e.chars >= USABLE_PAGE_CHARS) usablePages++;
        else jsShellPages++;
      } else {
        if (e.hasTextLayer) pdfsWithTextLayer++;
        else imageOnlyPdfs++;
        if (homepageHost && safeHost(e.url) !== homepageHost) offsitePdfsFollowed++;
      }
    }

    if (manifest.entries.length === 0) continue;

    results.push({
      accountId,
      websiteUrl: homepage,
      websiteStatus: null,
      usablePages,
      jsShellPages,
      pdfsWithTextLayer,
      imageOnlyPdfs,
      offsitePdfsFollowed,
      // --from-cache reads local crawl-cache manifests, which don't know discoverWebsites.ts's
      // wedding_url discovery result -- that lives only in the DB (venue_websites).
      weddingUrl: null,
      weddingUrlSource: null,
      totalChars,
    });
  }
  return results;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function buildMarkdown(rows: VenueCoverage[], fromCache: boolean): string {
  const lines: string[] = [];
  lines.push(`# Venue details crawl coverage`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()}. ${rows.length} venues.`);
  lines.push("");
  lines.push(
    `| account_id | website status | usable pages (>=${USABLE_PAGE_CHARS} chars) | js_shell pages | pdfs w/ text layer | image-only pdfs | off-site pdfs followed | total chars | wedding page | wedding page source |`
  );
  lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    lines.push(
      `| ${r.accountId} | ${r.websiteStatus ?? "n/a"} (${r.websiteUrl ?? "-"}) | ${r.usablePages} | ${r.jsShellPages} | ${r.pdfsWithTextLayer} | ${r.imageOnlyPdfs} | ${r.offsitePdfsFollowed} | ${r.totalChars} | ${r.weddingUrl ?? "none"} | ${r.weddingUrlSource ?? "n/a"} |`
    );
  }
  lines.push("");

  const withUsable5 = rows.filter((r) => r.usablePages >= 5);
  const shells = rows.filter((r) => r.usablePages === 0 && r.jsShellPages > 0 && r.pdfsWithTextLayer === 0);
  const imagePdfOnly = rows.filter((r) => r.usablePages === 0 && r.imageOnlyPdfs > 0 && r.pdfsWithTextLayer === 0);
  const noWeddingPage = rows.filter((r) => r.weddingUrl === null);

  lines.push(`## Ceiling summary`);
  lines.push("");
  lines.push(`- Venues with >= 5 usable pages: **${withUsable5.length}** / ${rows.length}`);
  lines.push(`- Venues that are shells (zero usable pages, no text-layer PDF either): **${shells.length}** / ${rows.length}`);
  lines.push(
    `- Venues whose only pricing-looking source is an image-only PDF (zero usable pages, >=1 image-only PDF, no text-layer PDF): **${imagePdfOnly.length}** / ${rows.length}`
  );
  if (fromCache) {
    lines.push(
      `- Venues with no wedding page found: n/a (--from-cache has no DB access, so no wedding_url data)`
    );
  } else {
    lines.push(`- Venues with no wedding page found: **${noWeddingPage.length}** / ${rows.length}`);
  }
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  const rows = args.fromCache ? await coverageFromCache(args.accountIds) : await coverageFromDb(args.accountIds);

  const markdown = buildMarkdown(rows, args.fromCache);
  console.log(markdown);

  const defaultOut = `scripts/graph/tmp_analysis/venue_details_crawl_coverage_${new Date().toISOString().slice(0, 10)}.md`;
  const outPath = args.out ?? defaultOut;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf8");
  console.log(`\n[report-crawl-coverage] wrote ${outPath}`);

  if (args.json) {
    const jsonPath = outPath.replace(/\.md$/, ".json");
    await writeFile(jsonPath, JSON.stringify(rows, null, 2), "utf8");
    console.log(`[report-crawl-coverage] wrote ${jsonPath}`);
  }

  if (!args.fromCache) await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
