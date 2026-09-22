/**
 * ACQUISITION LOOP (D061) — turns one Apify dataset (already fetched by runTick.ts) into
 * `posts`/`accounts`/`post_mentions`/`ops.post_observations`/`post_images` rows. Ports
 * pipeline.py's upsert_post semantics (accounts upsert-by-username, posts
 * on-conflict-shortcode-do-nothing, likesCount/commentsCount<0 -> NULL) onto the acquisition
 * schema, adding per-sighting observations and fail-open image persistence that pipeline.py
 * never had. The stack parser does NOT run here — has_stack/parse_method are left null and
 * populated later by the existing TS stack-parser scripts.
 *
 * Two-phase by design (2026-09-19 fix: no network I/O may happen inside an open DB
 * transaction — this Supabase project has a house statement_timeout and pooled backends, and
 * 250 posts x up to 5 images at ~3 fetches/s would otherwise hold a transaction open for
 * minutes). Phase 1 (`planAndFetch*`) does every network call (dataset already fetched by the
 * caller; image/avatar fetch + R2 `putBytes`) and exactly the read-only queries needed to know
 * which shortcodes/accounts already exist, entirely outside a transaction. Phase 2
 * (`write*Planned`) is one short transaction that only inserts/updates rows from what phase 1
 * already collected in memory — no fetch(), no putBytes() anywhere below the `begin`.
 *
 * Writes: accounts, posts, post_mentions, ops.post_observations, post_images,
 * ops.crawl_run_seeds (counts), ops.crawl_runs (status/items/ingested_at). Fetches images/
 * avatars over the network and writes them to R2 (fail-open: never aborts the run).
 * Read-only mode (--dry-run) touches neither the DB nor R2.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/ingest.ts --run-id <id> [--dry-run] [--no-images]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { getPool, closePool } from "../classify/db";
import { putBytes } from "../venue-details/crawl/r2";
import { getDatasetItems } from "./apifyClient";
import { postsHasOrigin } from "../graph/postMergeCompat";

/** Anything with a pg-shaped `.query()` -- lets phase-1 helpers run against either a Pool (no open transaction) or a PoolClient. */
type DbExecutor = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

// ---------------------------------------------------------------------------
// Pure functions — no DB, no network. Exported for scripts/acquire/acquire.test.ts.
// ---------------------------------------------------------------------------

export interface ApifyPostItem {
  shortCode?: string;
  url?: string;
  ownerUsername?: string;
  caption?: string | null;
  timestamp?: string;
  likesCount?: number | null;
  commentsCount?: number | null;
  inputUrl?: string;
  mentions?: string[];
  hashtags?: string[];
  type?: string; // 'Image' | 'Sidecar' | 'Video'
  images?: string[];
  displayUrl?: string;
  dimensionsWidth?: number;
  dimensionsHeight?: number;
  [key: string]: unknown;
}

/** '@Foo.' -> 'foo'; trims whitespace, strips a leading '@', strips trailing '.'s. */
export function normalizeHandle(raw: string): string {
  let h = raw.trim().toLowerCase();
  if (h.startsWith("@")) h = h.slice(1);
  while (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

/**
 * Which crawl-seed username produced this item, by matching `inputUrl`'s tail against the
 * seed usernames for this run (case-insensitive, trailing-slash tolerant). Mirrors
 * pipeline.py's `it.get('inputUrl','').rstrip('/').lower().endswith(u)`. Returns the seed
 * username exactly as given in `usernames` (already-normalized) or null when nothing matches.
 */
export function attributeSeedUsername(
  inputUrl: string | null | undefined,
  usernames: string[]
): string | null {
  if (!inputUrl) return null;
  const trimmed = inputUrl.trim().replace(/\/+$/, "").toLowerCase();
  for (const u of usernames) {
    if (trimmed.endsWith(u.toLowerCase())) return u;
  }
  return null;
}

/** Instagram returns -1 (or omits) when a count is hidden -- that's "unknown", store NULL. */
export function normalizeCount(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  return n < 0 ? null : n;
}

export function captionSha256(caption: string | null | undefined): string {
  return createHash("sha256").update(caption ?? "").digest("hex");
}

export interface ImageSelection {
  status: "skipped" | "candidates";
  urls: string[];
}

/** Sidecar -> first 5 of `images`; Image (or anything else with a displayUrl) -> [displayUrl]; Video -> skipped entirely. */
export function selectImageCandidates(item: ApifyPostItem): ImageSelection {
  if (item.type === "Video") return { status: "skipped", urls: [] };
  if (item.type === "Sidecar") return { status: "candidates", urls: (item.images ?? []).slice(0, 5) };
  return { status: "candidates", urls: item.displayUrl ? [item.displayUrl] : [] };
}

export interface PostRowInput {
  shortcode: string;
  url: string;
  ownerUsername: string; // normalized
  caption: string | null;
  postedAt: string;
  likesCount: number | null;
  commentsCount: number | null;
  seedUsername: string | null;
  source: "venue_tagged" | "own_profile";
  raw: ApifyPostItem;
}

/** Maps one dataset item (tagged/own feed) to the shape `posts` wants. Pure -- owner_id/post_id resolution happens in the DB layer. */
export function mapItemToPostRow(
  item: ApifyPostItem,
  feed: "tagged" | "own",
  seedUsernames: string[]
): PostRowInput {
  return {
    shortcode: item.shortCode ?? "",
    url: item.url ?? "",
    ownerUsername: normalizeHandle(item.ownerUsername ?? ""),
    caption: item.caption ?? null,
    postedAt: item.timestamp ?? new Date().toISOString(),
    likesCount: normalizeCount(item.likesCount),
    commentsCount: normalizeCount(item.commentsCount),
    seedUsername: attributeSeedUsername(item.inputUrl, seedUsernames),
    // D065: `mentions` is the same content as `tagged` (posts where the seed is tagged by
    // someone else), just pulled via the general actor so a date floor can be applied. It must
    // record source='venue_tagged' -- calling it own_profile would mis-attribute vendor recaps as
    // the venue's own marketing, which is the exact distinction D055 built the 0.056-vs-0.21
    // yield split on.
    source: feed === "tagged" || feed === "mentions" ? "venue_tagged" : "own_profile",
    raw: item,
  };
}

export interface PlannedWrite {
  item: ApifyPostItem;
  mapped: PostRowInput;
  /** Whether this shortcode was NOT in the existing-shortcode set phase 1 read before any writes. Images are only fetched when this is true; it can still lose a race to a concurrent ingest by insert time -- see writeTaggedOrOwnPlanned. */
  looksNew: boolean;
}

/**
 * Pure: plans what to do with each dataset item given the set of shortcodes already in `posts`
 * (as of one phase-1 read). No DB, no network -- the actual insert/select that decides the
 * REAL first-sighting outcome still happens per-item in the phase-2 transaction; `looksNew`
 * only decides whether phase 1 bothers fetching images for it. Dedupes a shortcode that
 * appears twice in the same dataset (seen once).
 */
export function planPostWrites(
  items: ApifyPostItem[],
  feed: "tagged" | "own",
  seedUsernames: string[],
  existingShortcodes: ReadonlySet<string>
): PlannedWrite[] {
  const seen = new Set<string>();
  const out: PlannedWrite[] = [];
  for (const item of items) {
    if (!item.shortCode || seen.has(item.shortCode)) continue;
    seen.add(item.shortCode);
    const mapped = mapItemToPostRow(item, feed, seedUsernames);
    out.push({ item, mapped, looksNew: !existingShortcodes.has(mapped.shortcode) });
  }
  return out;
}

/** `@handle`-shaped mentions in free text (bios), 3+ chars, IG's allowed handle charset. Never inserted anywhere -- written to a CSV for human review. */
export function extractBioHandles(bio: string | null | undefined): string[] {
  if (!bio) return [];
  return [...bio.matchAll(/@([A-Za-z0-9_.]{3,})/g)].map((m) => m[1]);
}

export interface ProfileAccountFields {
  fullName: string | null;
  biography: string | null;
  externalUrl: string | null;
  followers: number | null;
  isBusiness: boolean | null;
  businessCategory: string | null;
  isPrivate: boolean | null;
  avatarUrl: string | null;
  raw: unknown;
}

/**
 * Maps a profile-scraper dataset item to accounts fields. Field names for
 * apify/instagram-profile-scraper's OUTPUT were NOT independently verifiable read-only (the
 * builds/default endpoint only exposes the INPUT schema -- confirmed `usernames` there, see
 * apifyClient.ts). These are the actor's documented/commonly-observed output keys; every field
 * is read defensively with a fallback so an unexpected shape degrades to null instead of
 * throwing.
 */
export function mapProfileItemToAccountFields(item: Record<string, unknown>): ProfileAccountFields {
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
  return {
    fullName: str(item.fullName ?? item.full_name),
    biography: str(item.biography ?? item.bio),
    externalUrl: str(item.externalUrl ?? item.external_url ?? item.website),
    followers: num(item.followersCount ?? item.followers),
    isBusiness: bool(item.isBusinessAccount ?? item.is_business_account),
    businessCategory: str(item.businessCategoryName ?? item.business_category_name),
    isPrivate: bool(item.private ?? item.isPrivate),
    avatarUrl: str(item.profilePicUrlHD ?? item.profilePicUrl ?? item.profile_pic_url_hd ?? item.profile_pic_url),
    raw: item,
  };
}

/** Seed usernames as sent to Apify, recovered from the stored actor input (fallback when ops.crawl_run_seeds has no rows for this run). */
export function seedUsernamesFromInput(feed: "tagged" | "own" | "profile", input: Record<string, unknown>): string[] {
  if (feed === "tagged") return ((input.username as string[]) ?? []).map(normalizeHandle);
  if (feed === "profile") return ((input.usernames as string[]) ?? []).map(normalizeHandle);
  const urls = (input.directUrls as string[]) ?? [];
  return urls.map((u) => normalizeHandle(u.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")));
}

// ---------------------------------------------------------------------------
// Network helpers (images/avatars) -- fail-open, rate-limited ~3/s.
// ---------------------------------------------------------------------------

const MIN_FETCH_INTERVAL_MS = 1000 / 3;
let lastFetchAt = 0;

async function rateLimit(): Promise<void> {
  const wait = lastFetchAt + MIN_FETCH_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();
}

type ImageFetchResult =
  | { ok: true; bytes: ArrayBuffer; contentType: string }
  | { ok: false; reason: "fetch_failed" | "invalid" };

async function fetchImageBytes(url: string): Promise<ImageFetchResult> {
  await rateLimit();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return { ok: false, reason: "fetch_failed" };
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return { ok: false, reason: "invalid" };
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength <= 5_000) return { ok: false, reason: "invalid" };
    return { ok: true, bytes, contentType };
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }
}

/** A planned post_images row -- computed entirely in phase 1 (network), inserted verbatim in phase 2 (DB only). */
export interface ImageRow {
  idx: number;
  status: "stored" | "fetch_failed" | "invalid" | "skipped";
  r2Key: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

/**
 * PHASE 1 ONLY -- fetches (and, on success, R2-puts) every candidate image for one item. Never
 * throws (fail-open); an unexpected error degrades to "no image rows planned" for this item,
 * logged, rather than aborting the batch. Does no DB work at all.
 */
async function fetchAndStoreImagesForItem(item: ApifyPostItem, shortcode: string): Promise<ImageRow[]> {
  try {
    const sel = selectImageCandidates(item);
    if (sel.status === "skipped") {
      return [{ idx: 0, status: "skipped", r2Key: null, width: null, height: null, bytes: null }];
    }
    const rows: ImageRow[] = [];
    for (let idx = 0; idx < sel.urls.length; idx++) {
      const result = await fetchImageBytes(sel.urls[idx]);
      if (!result.ok) {
        rows.push({ idx, status: result.reason, r2Key: null, width: null, height: null, bytes: null });
        continue;
      }
      const key = `posts/${shortcode}/${idx}.jpg`;
      try {
        await putBytes(key, result.bytes, result.contentType);
        rows.push({
          idx,
          status: "stored",
          r2Key: key,
          width: idx === 0 ? item.dimensionsWidth ?? null : null,
          height: idx === 0 ? item.dimensionsHeight ?? null : null,
          bytes: result.bytes.byteLength,
        });
      } catch (e) {
        console.error(`[ingest] R2 put failed for ${key}:`, e);
        rows.push({ idx, status: "fetch_failed", r2Key: null, width: null, height: null, bytes: null });
      }
    }
    return rows;
  } catch (e) {
    console.error(`[ingest] image fetch step failed for ${shortcode}, continuing with no images:`, e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// DB orchestration.
// ---------------------------------------------------------------------------

interface CrawlRunRow {
  id: number;
  batch_id: string;
  actor: string;
  feed: "tagged" | "own" | "profile";
  input: Record<string, unknown>;
  dataset_id: string | null;
  status: string;
}

async function loadRun(db: DbExecutor, runId: number): Promise<CrawlRunRow> {
  const { rows } = await db.query(
    `select id, batch_id, actor, feed, input, dataset_id, status from ops.crawl_runs where id = $1`,
    [runId]
  );
  if (rows.length === 0) throw new Error(`ops.crawl_runs row ${runId} not found`);
  const run = rows[0] as CrawlRunRow;
  if (!["succeeded", "ingested"].includes(run.status)) {
    throw new Error(`run ${runId} has status '${run.status}' -- ingest requires 'succeeded' or 'ingested' (idempotent re-run)`);
  }
  if (!run.dataset_id) throw new Error(`run ${runId} has no dataset_id`);
  return run;
}

async function upsertAccountId(db: DbExecutor, cache: Map<string, number>, usernameRaw: string): Promise<number> {
  const username = normalizeHandle(usernameRaw);
  const cached = cache.get(username);
  if (cached) return cached;
  const { rows } = await db.query(
    `insert into accounts (username) values ($1)
     on conflict (username) do update set username = excluded.username
     returning id`,
    [username]
  );
  const id = rows[0].id as number;
  cache.set(username, id);
  return id;
}

interface SeedInfo {
  accountId: number;
  targetId: number | null;
}

/** PHASE 1 (read-only, with a rare write-fallback that is a single auto-committed statement, never inside the phase-2 transaction). */
async function loadSeedMap(db: DbExecutor, runId: number, feed: string, input: Record<string, unknown>): Promise<{ usernames: string[]; byUsername: Map<string, SeedInfo> }> {
  const { rows } = await db.query(
    `select crs.account_id, crs.target_id, a.username::text as username
     from ops.crawl_run_seeds crs join accounts a on a.id = crs.account_id
     where crs.run_id = $1`,
    [runId]
  );
  const byUsername = new Map<string, SeedInfo>();
  for (const r of rows) {
    byUsername.set(normalizeHandle(r.username), { accountId: r.account_id, targetId: r.target_id });
  }
  if (byUsername.size > 0) return { usernames: [...byUsername.keys()], byUsername };

  // Fallback: no crawl_run_seeds rows (e.g. a run started outside runTick.ts) -- recover seed
  // usernames from the stored actor input and resolve/upsert their account ids, with no
  // target_id (nullable per schema).
  const usernames = seedUsernamesFromInput(feed as "tagged" | "own" | "profile", input);
  const acctCache = new Map<string, number>();
  for (const u of usernames) {
    const accountId = await upsertAccountId(db, acctCache, u);
    byUsername.set(u, { accountId, targetId: null });
  }
  return { usernames, byUsername };
}

interface SeedCounts {
  fetched: number;
  new_posts: number;
  already_had: number;
}

interface TaggedOrOwnPlan {
  usernames: string[];
  byUsername: Map<string, SeedInfo>;
  planned: PlannedWrite[];
  imagesByShortcode: Map<string, ImageRow[]>;
}

/**
 * PHASE 1 -- no open transaction. One read-only query to learn which shortcodes already exist
 * (so `looksNew` is known), plus every network call (image fetch + R2 put) for posts that look
 * new. Nothing here writes a posts/accounts/observations row.
 */
async function planAndFetchTaggedOrOwn(
  pool: Pool,
  run: CrawlRunRow,
  items: ApifyPostItem[],
  noImages: boolean
): Promise<TaggedOrOwnPlan> {
  const feed = run.feed as "tagged" | "own";
  const { usernames, byUsername } = await loadSeedMap(pool, run.id, feed, run.input);

  const shortcodes = [...new Set(items.map((i) => i.shortCode).filter((s): s is string => !!s))];
  const existing = new Set<string>();
  if (shortcodes.length > 0) {
    const { rows } = await pool.query(`select shortcode from posts where shortcode = any($1::text[])`, [shortcodes]);
    for (const r of rows) existing.add(r.shortcode);
  }

  const planned = planPostWrites(items, feed, usernames, existing);

  const imagesByShortcode = new Map<string, ImageRow[]>();
  if (!noImages) {
    for (const pw of planned) {
      if (!pw.looksNew) continue;
      const rows = await fetchAndStoreImagesForItem(pw.item, pw.mapped.shortcode);
      imagesByShortcode.set(pw.mapped.shortcode, rows);
    }
  }
  return { usernames, byUsername, planned, imagesByShortcode };
}

/** PHASE 2 -- one short transaction, DB only (no fetch/putBytes anywhere in here). */
async function writeTaggedOrOwnPlanned(client: PoolClient, run: CrawlRunRow, plan: TaggedOrOwnPlan, totalItems: number): Promise<void> {
  const { usernames, byUsername, planned, imagesByShortcode } = plan;
  const acctCache = new Map<string, number>();
  const seedCounts = new Map<string, SeedCounts>(usernames.map((u) => [u, { fetched: 0, new_posts: 0, already_had: 0 }]));

  // Deadlock guard (2026-09-20): two ingests running at once (probes A + the low-types probe) each
  // upserted overlapping `accounts` rows in dataset order inside their transactions and deadlocked
  // on the username unique index. Upserting every username this run will touch FIRST, in sorted
  // order, makes concurrent transactions acquire those row locks in the same order; the per-post
  // loop below then hits the cache.
  const allUsernames = new Set<string>();
  for (const pw of planned) {
    if (pw.mapped.ownerUsername) allUsernames.add(pw.mapped.ownerUsername);
    for (const m of pw.item.mentions ?? []) {
      const n = normalizeHandle(m);
      if (n) allUsernames.add(n);
    }
  }
  for (const u of [...allUsernames].sort()) await upsertAccountId(client, acctCache, u);

  for (const pw of planned) {
    const { item, mapped } = pw;
    if (mapped.seedUsername) {
      const c = seedCounts.get(mapped.seedUsername);
      if (c) c.fetched++;
    }

    const ownerId = await upsertAccountId(client, acctCache, mapped.ownerUsername);

    // Post-merge P0.5: state origin once the column exists (P1); never name it before then.
    const withOrigin = await postsHasOrigin(client);
    const insertRes = await client.query(
      `insert into posts (shortcode, url, owner_id, caption, posted_at, likes_count, comments_count, seed_username, source, raw${withOrigin ? ", origin" : ""})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10${withOrigin ? ",'acquisition_loop'" : ""})
       on conflict (shortcode) do nothing returning id, caption`,
      [
        mapped.shortcode,
        mapped.url,
        ownerId,
        mapped.caption,
        mapped.postedAt,
        mapped.likesCount,
        mapped.commentsCount,
        mapped.seedUsername,
        mapped.source,
        JSON.stringify(mapped.raw),
      ]
    );

    let postId: number;
    let isFirst: boolean;
    let existingCaption: string | null = null;
    if (insertRes.rows.length > 0) {
      postId = insertRes.rows[0].id;
      isFirst = true;
    } else {
      // Either it already existed at the phase-1 read, or it lost a race to a concurrent
      // ingest between then and now -- either way it's "already had" from this run's view.
      const { rows } = await client.query(`select id, caption from posts where shortcode = $1`, [mapped.shortcode]);
      postId = rows[0].id;
      existingCaption = rows[0].caption;
      isFirst = false;
      if (mapped.seedUsername) {
        const c = seedCounts.get(mapped.seedUsername);
        if (c) c.already_had++;
      }
    }
    if (isFirst && mapped.seedUsername) {
      const c = seedCounts.get(mapped.seedUsername);
      if (c) c.new_posts++;
    }

    // (c) mentions -- only for a brand-new post; an already-existing post already has its mentions.
    if (isFirst) {
      for (const m of item.mentions ?? []) {
        const mid = await upsertAccountId(client, acctCache, m);
        await client.query(
          `insert into post_mentions (post_id, account_id, in_stack) values ($1,$2,false) on conflict do nothing`,
          [postId, mid]
        );
      }
    }

    // (d) observation.
    const captionSha = captionSha256(mapped.caption);
    const captionChanged = isFirst ? false : captionSha !== captionSha256(existingCaption);
    const seedInfo = mapped.seedUsername ? byUsername.get(mapped.seedUsername) : undefined;
    await client.query(
      `insert into ops.post_observations (run_id, post_id, seed_account_id, target_id, is_first, caption_sha256, caption_changed)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (run_id, post_id) do nothing`,
      [run.id, postId, seedInfo?.accountId ?? null, seedInfo?.targetId ?? null, isFirst, captionSha, captionChanged]
    );

    // (e) images -- rows were already fetched + R2-put in phase 1 for every post that LOOKED
    // new; if this one lost the race (isFirst is now false), we still had already spent the
    // fetch/putBytes cost, so record them against the real post_id rather than throw them away.
    const imgRows = imagesByShortcode.get(mapped.shortcode);
    if (imgRows) {
      for (const row of imgRows) {
        await client.query(
          `insert into post_images (post_id, idx, r2_key, width, height, bytes, status)
           values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
          [postId, row.idx, row.r2Key, row.width, row.height, row.bytes, row.status]
        );
      }
    }
  }

  // (f) per-seed counts + run status.
  for (const [username, counts] of seedCounts) {
    const info = byUsername.get(username);
    if (!info) continue;
    await client.query(
      `update ops.crawl_run_seeds set fetched = $1, new_posts = $2, already_had = $3
       where run_id = $4 and account_id = $5`,
      [counts.fetched, counts.new_posts, counts.already_had, run.id, info.accountId]
    );
  }
  await client.query(
    `update ops.crawl_runs set items = $1, status = 'ingested', ingested_at = now() where id = $2`,
    [totalItems, run.id]
  );
}

interface ProfilePlan {
  username: string;
  fields: ProfileAccountFields;
  /** Set only when an avatar was fetched + R2-put in phase 1 (no existing avatar_path at read time). */
  avatarR2Key: string | null;
}

/** PHASE 1 -- reads each account's current avatar_path (read-only) and fetches/R2-puts a new avatar when missing. No accounts row is written here. Also writes the alias-candidate CSV (file I/O, not DB, harmless before the transaction). */
async function planAndFetchProfile(pool: Pool, runId: number, items: Record<string, unknown>[]): Promise<ProfilePlan[]> {
  const plans: ProfilePlan[] = [];
  const aliasRows: string[] = ["account_username,mentioned_handle,bio_excerpt"];

  for (const item of items) {
    const usernameRaw = (item.username as string) ?? (item.ownerUsername as string) ?? "";
    if (!usernameRaw) continue;
    const username = normalizeHandle(usernameRaw);
    const fields = mapProfileItemToAccountFields(item);

    const { rows } = await pool.query(`select avatar_path from accounts where username = $1`, [username]);
    const existingAvatarPath: string | null = rows[0]?.avatar_path ?? null;

    let avatarR2Key: string | null = null;
    if (!existingAvatarPath && fields.avatarUrl) {
      const result = await fetchImageBytes(fields.avatarUrl);
      if (result.ok) {
        const key = `avatars/${username}.jpg`;
        try {
          await putBytes(key, result.bytes, result.contentType);
          avatarR2Key = key;
        } catch (e) {
          console.error(`[ingest] avatar R2 put failed for ${username}:`, e);
        }
      }
    }

    plans.push({ username, fields, avatarR2Key });

    for (const handle of extractBioHandles(fields.biography)) {
      const bio = fields.biography!;
      const excerptIdx = bio.indexOf(`@${handle}`);
      const excerpt = bio.slice(Math.max(0, excerptIdx - 20), excerptIdx + handle.length + 20).replace(/[\r\n,]+/g, " ");
      aliasRows.push(`${username},${handle},"${excerpt.replace(/"/g, '""')}"`);
    }
  }

  const outDir = new URL("../graph/tmp_analysis/", import.meta.url).pathname;
  mkdirSync(outDir, { recursive: true });
  const csvPath = `${outDir}acq_alias_candidates_${runId}.csv`;
  writeFileSync(csvPath, aliasRows.join("\n") + "\n");
  console.log(`[ingest] wrote ${csvPath} (${aliasRows.length - 1} candidate handles)`);

  return plans;
}

/** PHASE 2 -- one short transaction, DB only. */
async function writeProfilePlanned(client: PoolClient, run: CrawlRunRow, plans: ProfilePlan[], totalItems: number): Promise<void> {
  for (const p of plans) {
    const { fields } = p;
    const { rows } = await client.query(
      `insert into accounts (username) values ($1)
       on conflict (username) do update set username = excluded.username
       returning id, avatar_path`,
      [p.username]
    );
    const accountId = rows[0].id as number;
    const currentAvatarPath: string | null = rows[0].avatar_path;

    await client.query(
      `update accounts set
         full_name = coalesce($2, full_name),
         biography = coalesce($3, biography),
         external_url = coalesce($4, external_url),
         followers = coalesce($5, followers),
         is_business = coalesce($6, is_business),
         business_category = coalesce($7, business_category),
         is_private = coalesce($8, is_private),
         profile_scraped_at = now(),
         raw = $9
       where id = $1`,
      [
        accountId,
        fields.fullName,
        fields.biography,
        fields.externalUrl,
        fields.followers,
        fields.isBusiness,
        fields.businessCategory,
        fields.isPrivate,
        JSON.stringify(fields.raw),
      ]
    );

    if (!currentAvatarPath && p.avatarR2Key) {
      await client.query(`update accounts set avatar_path = $1 where id = $2 and avatar_path is null`, [p.avatarR2Key, accountId]);
    }
  }

  await client.query(
    `update ops.crawl_runs set items = $1, status = 'ingested', ingested_at = now() where id = $2`,
    [totalItems, run.id]
  );
}

async function dryRun(run: CrawlRunRow, items: (ApifyPostItem | Record<string, unknown>)[]): Promise<void> {
  console.log(`[ingest] --dry-run: run ${run.id} (${run.feed}), ${items.length} items fetched, nothing written`);
  if (run.feed === "profile") {
    for (const item of items.slice(0, 3)) {
      console.log(JSON.stringify(mapProfileItemToAccountFields(item as Record<string, unknown>), null, 2));
    }
    return;
  }
  const feed = run.feed as "tagged" | "own";
  const usernames = seedUsernamesFromInput(feed, run.input);
  const byType = new Map<string, number>();
  for (const item of items as ApifyPostItem[]) {
    const t = item.type ?? "(unknown)";
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  console.log(`[ingest] item types: ${[...byType.entries()].map(([t, n]) => `${t}=${n}`).join(" ")}`);
  for (const item of (items as ApifyPostItem[]).slice(0, 3)) {
    console.log(JSON.stringify(mapItemToPostRow(item, feed, usernames), null, 2));
  }
}

/**
 * Exported for runTick.ts, which imports this directly rather than shelling out to the CLI.
 * Phase 1 (network + read-only, no open transaction) runs against the pool; phase 2 (one short
 * transaction) checks out a single client just for the writes.
 */
export async function ingestRun(runId: number, opts: { dryRun: boolean; noImages: boolean }): Promise<void> {
  const pool = getPool();
  const run = await loadRun(pool, runId);
  const items = await getDatasetItems(run.dataset_id!);

  if (opts.dryRun) {
    await dryRun(run, items);
    return;
  }

  if (run.feed === "profile") {
    const plans = await planAndFetchProfile(pool, run.id, items);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await writeProfilePlanned(client, run, plans, items.length);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  } else {
    const plan = await planAndFetchTaggedOrOwn(pool, run, items as ApifyPostItem[], opts.noImages);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await writeTaggedOrOwnPlanned(client, run, plan, items.length);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  console.log(`[ingest] run ${runId} ingested (${items.length} items)`);
}

function usage(): never {
  console.error(
    "[ingest] Usage:\n" +
      "  bun run scripts/acquire/ingest.ts --run-id <id> [--dry-run] [--no-images]\n"
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const runIdIdx = args.indexOf("--run-id");
  if (runIdIdx === -1 || !args[runIdIdx + 1]) usage();
  const runId = Number(args[runIdIdx + 1]);
  if (!Number.isFinite(runId)) usage();
  const dryRunFlag = args.includes("--dry-run");
  const noImages = args.includes("--no-images");

  await ingestRun(runId, { dryRun: dryRunFlag, noImages });
  await closePool();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
