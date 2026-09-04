/**
 * Normalizes post + account context for the classifier.
 *
 * Reads from staging.instagram_posts (Jeremy's 47k own-profile scrape,
 * pending re-parse per ROADMAP.md) joined to staging.vendors for account
 * context. The classifier itself (contract.ts) doesn't know about staging —
 * when own_profile rows exist in public.posts post-migration, add a second
 * fetch function here with the same PostContext shape and the rest of the
 * pipeline is unaffected.
 */
import type { Pool } from "pg";

export interface KnownVendorMention {
  username: string;
  role: string | null;
  in_metro: boolean | null;
}

export interface PostContext {
  post_url: string;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  location_tag: string | null;
  post_timestamp: string | null;
  likes_count: number | null;
  owner_username: string | null;
  post_type: string | null;
  image_url: string | null;
  vendor_name: string | null;
  vendor_category: string | null;
  vendor_rating: number | null;
  vendor_review_count: number | null;
  vendor_ai_summary: string | null;
  vendor_city: string | null;
  vendor_neighborhood: string | null;
  vendor_instagram_handle: string | null;
  is_own_profile_post: boolean;
  known_vendor_mentions: KnownVendorMention[];
  account_archetype: string | null;
  account_archetype_confidence: number | null;
}

const POST_QUERY = `
  select
    sp.id as staging_id, sp.post_url, sp.caption_raw, sp.hashtags, sp.mentions,
    sp.location_tag, sp.post_timestamp, sp.likes_count, sp.owner_username,
    sp.post_type, sp.image_url,
    v.name as vendor_name, v.category as vendor_category,
    v.rating as vendor_rating, v.review_count as vendor_review_count,
    v.ai_summary as vendor_ai_summary, v.city as vendor_city,
    v.neighborhood as vendor_neighborhood,
    v.instagram_handle as vendor_instagram_handle
  from staging.instagram_posts sp
  join staging.vendors v on v.id = sp.vendor_id
`;

// jsonb array-or-null columns come back from pg as parsed JS values already
// (node-pg parses jsonb), but guard against null.
function arr(x: unknown): string[] {
  return Array.isArray(x) ? (x as string[]) : [];
}

// pg rows are untyped; same convention as lib/server/vendors.ts's toCard().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToContext(row: any): PostContext {
  const owner = (row.owner_username || "").toLowerCase();
  const handle = (row.vendor_instagram_handle || "").toLowerCase();
  return {
    post_url: row.post_url,
    caption: row.caption_raw,
    hashtags: arr(row.hashtags),
    mentions: arr(row.mentions),
    location_tag: row.location_tag,
    post_timestamp: row.post_timestamp,
    likes_count: row.likes_count,
    owner_username: row.owner_username,
    post_type: row.post_type,
    image_url: row.image_url,
    vendor_name: row.vendor_name,
    vendor_category: row.vendor_category,
    vendor_rating: row.vendor_rating !== null ? Number(row.vendor_rating) : null,
    vendor_review_count: row.vendor_review_count,
    vendor_ai_summary: row.vendor_ai_summary,
    vendor_city: row.vendor_city,
    vendor_neighborhood: row.vendor_neighborhood,
    vendor_instagram_handle: row.vendor_instagram_handle,
    is_own_profile_post: Boolean(owner && handle && owner === handle),
    known_vendor_mentions: [],
    account_archetype: null,
    account_archetype_confidence: null,
  };
}

export interface FetchOptions {
  limit?: number;
  offset?: number;
  postUrls?: string[];
  vendorId?: number;
  randomSample?: boolean;
}

export async function fetchPosts(pool: Pool, opts: FetchOptions = {}): Promise<PostContext[]> {
  let sql = POST_QUERY;
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.postUrls?.length) {
    params.push(opts.postUrls);
    where.push(`sp.post_url = ANY($${params.length})`);
  }
  if (opts.vendorId) {
    params.push(opts.vendorId);
    where.push(`sp.vendor_id = $${params.length}`);
  }
  if (where.length) sql += " where " + where.join(" and ");
  sql += opts.randomSample ? " order by random()" : " order by sp.id";
  if (opts.limit) {
    params.push(opts.limit);
    sql += ` limit $${params.length}`;
  }
  if (opts.offset) {
    params.push(opts.offset);
    sql += ` offset $${params.length}`;
  }
  const { rows } = await pool.query(sql, params);
  return rows.map(rowToContext);
}

export async function countPosts(pool: Pool): Promise<number> {
  const { rows } = await pool.query("select count(*)::int as n from staging.instagram_posts");
  return rows[0].n;
}

/** username(lower) -> role/in_metro for every account already in OUR graph
 * (public.accounts). A post mentioning e.g. @galleriamarchetti — a venue
 * we've independently confirmed via the tagged-feed crawl and 196 IG
 * geotags — is much stronger evidence of a real Chicago wedding than the
 * caption text alone. One query (~11k rows), reused across a whole run. */
export async function loadKnownVendors(pool: Pool): Promise<Map<string, KnownVendorMention>> {
  const sql = `
    select a.username, var.role::text as role, al.in_metro
    from accounts a
    left join v_account_role var on var.account_id = a.id
    left join account_locations al on al.account_id = a.id
  `;
  const { rows } = await pool.query(sql);
  const out = new Map<string, KnownVendorMention>();
  for (const row of rows) {
    out.set(row.username.toLowerCase(), {
      username: row.username,
      role: row.role,
      in_metro: row.in_metro,
    });
  }
  return out;
}

export function attachKnownMentions(ctx: PostContext, known: Map<string, KnownVendorMention>): PostContext {
  ctx.known_vendor_mentions = ctx.mentions
    .map((m) => known.get(m.toLowerCase()))
    .filter((v): v is KnownVendorMention => Boolean(v));
  return ctx;
}

interface AccountArchetypeRow {
  archetype: string;
  confidence: number;
}

/** username(lower) -> latest account_classifications_current row, for
 * attaching the account-level prior (requirement 7) to each post. */
export async function loadAccountArchetypes(pool: Pool): Promise<Map<string, AccountArchetypeRow>> {
  const { rows } = await pool.query(
    `select lower(username::text) as username, archetype, confidence from account_classifications_current`
  );
  const out = new Map<string, AccountArchetypeRow>();
  for (const row of rows) out.set(row.username, { archetype: row.archetype, confidence: row.confidence });
  return out;
}

export function attachAccountArchetype(ctx: PostContext, archetypes: Map<string, AccountArchetypeRow>): PostContext {
  const hit = ctx.owner_username ? archetypes.get(ctx.owner_username.toLowerCase()) : undefined;
  if (hit) {
    ctx.account_archetype = hit.archetype;
    ctx.account_archetype_confidence = hit.confidence;
  }
  return ctx;
}

/** Distinct vendors (staging.vendors rows with >=1 post) with a sample of
 * their own captions — input to the account classifier. */
export async function fetchVendorsForClassification(
  pool: Pool,
  opts: { limit?: number; samplesPerVendor?: number; usernames?: string[] } = {}
): Promise<
  Array<{
    username: string;
    vendorName: string | null;
    vendorCategory: string | null;
    vendorAiSummary: string | null;
    vendorRating: number | null;
    vendorReviewCount: number | null;
    sampleCaptions: string[];
  }>
> {
  const samplesPerVendor = opts.samplesPerVendor ?? 6;
  const sql = `
    select v.instagram_handle as username, v.name as vendor_name, v.category as vendor_category,
      v.ai_summary as vendor_ai_summary, v.rating as vendor_rating, v.review_count as vendor_review_count,
      (
        select coalesce(jsonb_agg(c), '[]'::jsonb) from (
          select caption_raw as c from staging.instagram_posts sp
          where sp.vendor_id = v.id and sp.owner_username = v.instagram_handle
            and coalesce(sp.caption_raw, '') <> ''
          -- Recent posts, not an arbitrary early sample — an account
          -- classification is a snapshot of CURRENT behavior (mission
          -- requirement: re-classify from recent history, not treat the
          -- verdict as permanent), so re-running this later as new posts
          -- arrive should see what the account looks like NOW.
          order by sp.post_timestamp desc nulls last limit ${samplesPerVendor}
        ) s
      ) as sample_captions
    from staging.vendors v
    where v.instagram_handle is not null
      and exists (select 1 from staging.instagram_posts sp where sp.vendor_id = v.id)
      ${opts.usernames ? `and lower(v.instagram_handle::text) = any($1)` : ""}
    order by v.id
    ${opts.limit ? `limit ${opts.limit}` : ""}
  `;
  const { rows } = await pool.query(sql, opts.usernames ? [opts.usernames.map((u) => u.toLowerCase())] : []);
  return rows.map((r) => ({
    username: r.username,
    vendorName: r.vendor_name,
    vendorCategory: r.vendor_category,
    vendorAiSummary: r.vendor_ai_summary,
    vendorRating: r.vendor_rating !== null ? Number(r.vendor_rating) : null,
    vendorReviewCount: r.vendor_review_count,
    sampleCaptions: r.sample_captions || [],
  }));
}
