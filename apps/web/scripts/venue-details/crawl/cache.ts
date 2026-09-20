/**
 * Local scratch cache for crawled page/PDF text, under
 * `scripts/venue-details/cache/<account_id>/` (gitignored). Lets `crawlVenue.ts --dry-run` and
 * later extraction runs work fully offline once a venue has been crawled once. One JSON
 * manifest per account (`manifest.json`) plus one `.txt` file per fetched page/PDF, named by
 * sha256 so identical content across two URLs collapses to one file (mirrors the R2 snapshot
 * dedupe key).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface CacheManifestEntry {
  url: string;
  finalUrl: string | null;
  kind: "html" | "pdf";
  sha256: string;
  chars: number;
  title: string | null;
  hasTextLayer: boolean | null;
  depth: number;
  score: number | null;
  fetchedAt: string;
  /** "manual_seed" for a `crawlVenue.ts --seed-urls` row (coordinator follow-up, 2026-09-13);
   * "wedding_page" for the venue's `venue_websites.wedding_url` / `--wedding-url-override`
   * (2026-09-14 follow-up); omitted/undefined for ordinary crawl-discovered entries written
   * before this field existed. */
  source?: "crawl" | "manual_seed" | "wedding_page";
  seedNote?: string | null;
  /** Non-PDF asset embeds/images found on an HTML page (`crawl/htmlText.ts`'s `extractHtml`
   * `assets` result) -- carried on the manifest entry so the offline (`--dry-run`/no-DB) path can
   * still build ASSET CANDIDATES from them without re-parsing the cached text. Omitted for PDFs
   * and for entries written before this field existed. */
  assets?: { kind: "video" | "virtual_tour" | "floor_plan"; url: string; label: string }[];
}

export interface CacheManifest {
  accountId: number;
  entries: CacheManifestEntry[];
}

const CACHE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cache");

function accountDir(accountId: number): string {
  return path.join(CACHE_ROOT, String(accountId));
}

function manifestPath(accountId: number): string {
  return path.join(accountDir(accountId), "manifest.json");
}

export async function readManifest(accountId: number): Promise<CacheManifest> {
  const file = manifestPath(accountId);
  if (!existsSync(file)) return { accountId, entries: [] };
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as CacheManifest;
  } catch {
    return { accountId, entries: [] };
  }
}

async function writeManifest(manifest: CacheManifest): Promise<void> {
  await mkdir(accountDir(manifest.accountId), { recursive: true });
  await writeFile(manifestPath(manifest.accountId), JSON.stringify(manifest, null, 2), "utf8");
}

/** Writes `text` to the local cache under its sha256 and appends/updates the manifest entry
 * for `url`. Returns the sha256 (== the cache key). */
export async function writeCacheEntry(
  accountId: number,
  entry: Omit<CacheManifestEntry, "sha256" | "chars" | "fetchedAt"> & { fetchedAt?: string },
  text: string
): Promise<string> {
  const hash = sha256(text);
  await mkdir(accountDir(accountId), { recursive: true });
  await writeFile(path.join(accountDir(accountId), `${hash}.txt`), text, "utf8");

  const manifest = await readManifest(accountId);
  const full: CacheManifestEntry = {
    ...entry,
    sha256: hash,
    chars: text.length,
    fetchedAt: entry.fetchedAt ?? new Date().toISOString(),
  };
  const withoutUrl = manifest.entries.filter((e) => e.url !== entry.url);
  withoutUrl.push(full);
  await writeManifest({ accountId, entries: withoutUrl });
  return hash;
}

export async function readCacheText(accountId: number, hash: string): Promise<string | null> {
  const file = path.join(accountDir(accountId), `${hash}.txt`);
  if (!existsSync(file)) return null;
  return readFile(file, "utf8");
}
