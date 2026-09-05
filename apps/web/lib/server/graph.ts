import { getPool } from "./db";

// The graph-native surfaces: vendor profiles and wedding stacks. Chicago
// membership is venue-anchored (weddings.is_chicago), not location-text.

export function avatarUrl(avatarPath: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!avatarPath || !base) return null;
  return `${base}/${avatarPath}`;
}

export interface StackVendor {
  accountId: number;
  username: string;
  name: string;
  role: string;
  avatar_url: string | null;
  confirmations: number;
}

export interface WeddingStack {
  id: number;
  event_date_est: string | null;
  venue_username: string | null;
  venue_name: string | null;
  venue_avatar_url: string | null;
  n_posts: number;
  post_urls: string[];
  /** Only posts whose owners allow embedding (61/816 accounts opt out). */
  embed_urls: string[];
  caption: string | null;
  vendors: StackVendor[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStack(row: any): WeddingStack {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendors = ((row.vendors ?? []) as any[]).map((v) => ({
    accountId: v.id,
    username: v.username,
    name: v.name,
    role: v.role,
    avatar_url: avatarUrl(v.avatar),
    confirmations: v.confirmations,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infos = (row.post_infos ?? []) as { url: string; ok: boolean }[];
  return {
    id: row.id,
    event_date_est: row.event_date_est,
    venue_username: row.venue_username,
    venue_name: row.venue_name,
    venue_avatar_url: avatarUrl(row.venue_avatar),
    n_posts: row.n_posts,
    post_urls: infos.map((i) => i.url),
    embed_urls: infos.filter((i) => i.ok).map((i) => i.url),
    caption: row.caption ?? null,
    vendors,
  };
}

const STACK_SELECT = `
  SELECT
    w.id::int,
    w.event_date_est,
    venue.username::text AS venue_username,
    COALESCE(venue.full_name, venue.username::text) AS venue_name,
    venue.avatar_path AS venue_avatar,
    (SELECT COUNT(*) FROM wedding_posts wp WHERE wp.wedding_id = w.id)::int AS n_posts,
    (SELECT jsonb_agg(jsonb_build_object(
        'url', p.url, 'ok', (ao.embeds_disabled IS DISTINCT FROM true)
      ) ORDER BY (ao.embeds_disabled IS TRUE), p.posted_at)
       FROM wedding_posts wp JOIN posts p ON p.id = wp.post_id
       JOIN accounts ao ON ao.id = p.owner_id
      WHERE wp.wedding_id = w.id) AS post_infos,
    (SELECT p.caption FROM wedding_posts wp JOIN posts p ON p.id = wp.post_id
      WHERE wp.wedding_id = w.id AND p.caption IS NOT NULL
      ORDER BY p.posted_at LIMIT 1) AS caption,
    (SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'username', a.username, 'name', COALESCE(a.full_name, a.username::text),
        'role', wv.role, 'avatar', a.avatar_path, 'confirmations', wv.n_confirmations
      ) ORDER BY array_position(enum_range(NULL::vendor_role), wv.role), a.username)
       FROM wedding_vendors wv JOIN accounts a ON a.id = wv.account_id
      WHERE wv.wedding_id = w.id) AS vendors,
    COUNT(*) OVER() AS total_count
  FROM weddings w
  LEFT JOIN accounts venue ON venue.id = w.venue_id`;

export async function listWeddingStacks(opts: {
  limit?: number;
  offset?: number;
  accountId?: number;
} = {}) {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;
  const { rows } = await getPool().query(
    `${STACK_SELECT}
     WHERE ($3::int IS NULL AND w.is_chicago)
        OR ($3::int IS NOT NULL AND EXISTS (
             SELECT 1 FROM wedding_vendors x
             WHERE x.wedding_id = w.id AND x.account_id = $3))
     ORDER BY w.event_date_est DESC NULLS LAST, w.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, opts.accountId ?? null]
  );
  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  return { stacks: rows.map(toStack), total, limit, offset };
}

export async function getVendorProfile(
  username: string,
  opts: { feedLimit?: number; feedOffset?: number } = {}
) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       a.id::int, a.username::text, CASE WHEN v.name IS NULL OR v.name IN (a.username::text, '@' || a.username::text)
            THEN COALESCE(a.full_name, a.username::text) ELSE v.name END AS name,
       a.full_name, a.biography, a.followers, a.external_url, a.avatar_path,
       var.role::text AS role,
       COALESCE(al.address, v.address) AS address,
       COALESCE(al.city, v.city) AS city,
       v.place_id, v.rating, v.review_count, v.website AS places_website,
       (SELECT COUNT(*) FROM wedding_vendors wv JOIN weddings w ON w.id = wv.wedding_id
         WHERE wv.account_id = a.id)::int AS n_weddings,
       (SELECT COUNT(*) FROM wedding_vendors wv JOIN weddings w ON w.id = wv.wedding_id
         WHERE wv.account_id = a.id AND w.is_chicago)::int AS n_chicago_weddings
     FROM accounts a
     LEFT JOIN v_account_role var ON var.account_id = a.id
     LEFT JOIN account_locations al ON al.account_id = a.id
     LEFT JOIN LATERAL (
       SELECT name, address, city, place_id, rating, review_count, website
       FROM vendors WHERE account_id = a.id ORDER BY id LIMIT 1
     ) v ON true
     WHERE a.username = $1::citext`,
    [username]
  );
  if (rows.length === 0) return null;
  const a = rows[0];

  // The remaining queries only need a.id; run them together.
  const [{ rows: partnerRows }, feed, { rows: enrichmentRows }] = await Promise.all([
    pool.query(
      `SELECT
         partner.id::int,
         partner.username::text,
         CASE WHEN pv.name IS NULL OR pv.name IN (partner.username::text, '@' || partner.username::text)
              THEN COALESCE(partner.full_name, partner.username::text) ELSE pv.name END AS name,
         pvar.role::text AS role,
         partner.avatar_path AS avatar,
         e.n_weddings::int, e.last_worked_together
       FROM edges e
       JOIN accounts partner
         ON partner.id = CASE WHEN e.account_a = $1 THEN e.account_b ELSE e.account_a END
       LEFT JOIN v_account_role pvar ON pvar.account_id = partner.id
       LEFT JOIN LATERAL (
         SELECT name FROM vendors WHERE account_id = partner.id ORDER BY id LIMIT 1
       ) pv ON true
       WHERE $1 IN (e.account_a, e.account_b)
       ORDER BY e.n_weddings DESC, e.last_worked_together DESC NULLS LAST
       LIMIT 24`,
      [a.id]
    ),
    listWeddingStacks({
      accountId: a.id,
      limit: opts.feedLimit ?? 20,
      offset: opts.feedOffset ?? 0,
    }),
    pool.query(
      `SELECT ve.capacity_min, ve.capacity_max, ve.capacity_as_stated,
              ve.catering, ve.event_insurance, ve.pricing_model, ve.price_display,
              ve.website, ve.extracted_at
       FROM venue_enrichment ve
       JOIN vendors v ON v.id = ve.vendor_id
       WHERE v.account_id = $1`,
      [a.id]
    ),
  ]);

  return {
    enrichment: enrichmentRows[0] ?? null,
    profile: {
      id: a.id,
      username: a.username,
      name: a.name,
      biography: a.biography,
      followers: a.followers,
      website: a.external_url || a.places_website,
      avatar_url: avatarUrl(a.avatar_path),
      role: a.role,
      address: a.address,
      city: a.city,
      rating: a.rating,
      review_count: a.review_count,
      n_weddings: a.n_weddings,
      n_chicago_weddings: a.n_chicago_weddings,
    },
    partners: partnerRows.map((p) => ({
      id: p.id,
      username: p.username,
      name: p.name,
      role: p.role,
      avatar_url: avatarUrl(p.avatar),
      n_weddings: p.n_weddings,
      last_worked_together: p.last_worked_together,
    })),
    stacks: feed.stacks,
    feedTotal: feed.total,
    feedLimit: feed.limit,
    feedOffset: feed.offset,
  };
}

export async function listVendors(opts: {
  /** vendor_role values to include; null/empty = all roles. */
  roles?: string[] | null;
  q?: string | null;
  /** Only vendors with at least this many documented Chicago weddings. */
  minWeddings?: number;
  /** Only vendors who share an edge with one of these account ids ("works with your team"). */
  teamIds?: number[] | null;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = Math.min(opts.limit ?? 24, 100);
  const offset = opts.offset ?? 0;
  const roles = opts.roles?.length ? opts.roles : null;
  const teamIds = opts.teamIds?.length ? opts.teamIds.slice(0, 50) : null;
  // A "Chicago vendor" = worked at least one venue-verified Chicago wedding.
  const { rows } = await getPool().query(
    `SELECT
       a.id::int, a.username::text, CASE WHEN v.name IS NULL OR v.name IN (a.username::text, '@' || a.username::text)
            THEN COALESCE(a.full_name, a.username::text) ELSE v.name END AS name,
       var.role::text AS role, a.avatar_path AS avatar, a.followers,
       v.place_id, v.rating, v.review_count, v.neighborhood,
       v.photo_keys AS photos,
       cnt.n_chicago::int AS n_weddings,
       COUNT(*) OVER() AS total_count
     FROM accounts a
     JOIN v_account_role var ON var.account_id = a.id
     JOIN (
       SELECT wv.account_id,
              COUNT(*) FILTER (WHERE w.is_chicago) AS n_chicago
       FROM wedding_vendors wv JOIN weddings w ON w.id = wv.wedding_id
       GROUP BY wv.account_id
     ) cnt ON cnt.account_id = a.id
     LEFT JOIN LATERAL (
       SELECT name, place_id, rating, review_count, neighborhood, photo_keys
       FROM vendors WHERE account_id = a.id ORDER BY id LIMIT 1
     ) v ON true
     WHERE cnt.n_chicago >= GREATEST($5::int, 1)
       AND ($1::text[] IS NULL OR var.role = ANY($1::vendor_role[]))
       AND ($4::text IS NULL
            OR a.username::text ILIKE $4 ESCAPE '\\'
            OR COALESCE(a.full_name, '') ILIKE $4 ESCAPE '\\'
            OR COALESCE(v.name, '') ILIKE $4 ESCAPE '\\')
       AND ($6::int[] IS NULL
            OR EXISTS (SELECT 1 FROM edges e
                       WHERE e.account_a = a.id AND e.account_b = ANY($6::int[]))
            OR EXISTS (SELECT 1 FROM edges e
                       WHERE e.account_b = a.id AND e.account_a = ANY($6::int[])))
     ORDER BY cnt.n_chicago DESC, a.followers DESC NULLS LAST, a.username
     LIMIT $2 OFFSET $3`,
    [roles, limit, offset,
     opts.q?.trim() ? `%${opts.q.trim().replace(/[%_\\]/g, "\\$&")}%` : null,
     opts.minWeddings ?? 1, teamIds]
  );
  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  return {
    vendors: rows.map((r) => ({
      id: r.id,
      username: r.username,
      name: r.name,
      role: r.role,
      avatar_url: avatarUrl(r.avatar),
      followers: r.followers,
      place_id: r.place_id,
      rating: r.rating,
      review_count: r.review_count,
      neighborhood: r.neighborhood,
      photos: r.photos,
      n_weddings: r.n_weddings,
    })),
    total,
    limit,
    offset,
  };
}

/** Real numbers for the homepage — no fabricated marketing stats. */
export async function homeStats() {
  const { rows } = await getPool().query(`
    SELECT
      (SELECT COUNT(*) FROM weddings WHERE is_chicago)::int AS chicago_weddings,
      (SELECT COUNT(DISTINCT wv.account_id)
         FROM wedding_vendors wv JOIN weddings w ON w.id = wv.wedding_id
        WHERE w.is_chicago)::int AS credited_vendors,
      (SELECT COUNT(*) FROM edges)::int AS collaborations`);
  return rows[0] as {
    chicago_weddings: number;
    credited_vendors: number;
    collaborations: number;
  };
}

/** Chicago-credited vendor count per role, for homepage category cards. */
export async function categoryCounts(): Promise<Record<string, number>> {
  const { rows } = await getPool().query(`
    SELECT var.role::text AS role, COUNT(DISTINCT wv.account_id)::int AS n
    FROM wedding_vendors wv
    JOIN weddings w ON w.id = wv.wedding_id AND w.is_chicago
    JOIN v_account_role var ON var.account_id = wv.account_id
    GROUP BY var.role`);
  return Object.fromEntries(rows.map((r) => [r.role, r.n]));
}
