import { getPool } from "./db";

// The graph-native surfaces: vendor profiles and wedding stacks. Chicago
// membership is venue-anchored (weddings.is_chicago), not location-text.

function avatarUrl(avatarPath: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!avatarPath || !base) return null;
  return `${base}/${avatarPath}`;
}

export interface StackVendor {
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
  vendors: StackVendor[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStack(row: any): WeddingStack {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendors = ((row.vendors ?? []) as any[]).map((v) => ({
    username: v.username,
    name: v.name,
    role: v.role,
    avatar_url: avatarUrl(v.avatar),
    confirmations: v.confirmations,
  }));
  return {
    id: row.id,
    event_date_est: row.event_date_est,
    venue_username: row.venue_username,
    venue_name: row.venue_name,
    venue_avatar_url: avatarUrl(row.venue_avatar),
    n_posts: row.n_posts,
    post_urls: row.post_urls ?? [],
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
    (SELECT jsonb_agg(p.url ORDER BY p.posted_at)
       FROM wedding_posts wp JOIN posts p ON p.id = wp.post_id
      WHERE wp.wedding_id = w.id) AS post_urls,
    (SELECT jsonb_agg(jsonb_build_object(
        'username', a.username, 'name', COALESCE(a.full_name, a.username::text),
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

export async function getVendorProfile(username: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       a.id::int, a.username::text, COALESCE(v.name, a.full_name, a.username::text) AS name,
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
     LEFT JOIN vendors v ON v.account_id = a.id
     WHERE a.username = $1::citext`,
    [username]
  );
  if (rows.length === 0) return null;
  const a = rows[0];

  const { rows: partnerRows } = await pool.query(
    `SELECT
       partner.username::text,
       COALESCE(pv.name, partner.full_name, partner.username::text) AS name,
       pvar.role::text AS role,
       partner.avatar_path AS avatar,
       e.n_weddings::int, e.last_worked_together
     FROM edges e
     JOIN accounts partner
       ON partner.id = CASE WHEN e.account_a = $1 THEN e.account_b ELSE e.account_a END
     LEFT JOIN v_account_role pvar ON pvar.account_id = partner.id
     LEFT JOIN vendors pv ON pv.account_id = partner.id
     WHERE $1 IN (e.account_a, e.account_b)
     ORDER BY e.n_weddings DESC, e.last_worked_together DESC NULLS LAST
     LIMIT 24`,
    [a.id]
  );

  const { stacks } = await listWeddingStacks({ accountId: a.id, limit: 50 });

  return {
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
      username: p.username,
      name: p.name,
      role: p.role,
      avatar_url: avatarUrl(p.avatar),
      n_weddings: p.n_weddings,
      last_worked_together: p.last_worked_together,
    })),
    stacks,
  };
}

export async function listVendors(opts: {
  role?: string | null;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = Math.min(opts.limit ?? 24, 100);
  const offset = opts.offset ?? 0;
  // A "Chicago vendor" = worked at least one venue-verified Chicago wedding.
  const { rows } = await getPool().query(
    `SELECT
       a.username::text, COALESCE(v.name, a.full_name, a.username::text) AS name,
       var.role::text AS role, a.avatar_path AS avatar, a.followers,
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
     LEFT JOIN vendors v ON v.account_id = a.id
     WHERE cnt.n_chicago > 0
       AND ($1::text IS NULL OR var.role = $1::vendor_role)
     ORDER BY cnt.n_chicago DESC, a.followers DESC NULLS LAST, a.username
     LIMIT $2 OFFSET $3`,
    [opts.role ?? null, limit, offset]
  );
  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  return {
    vendors: rows.map((r) => ({
      username: r.username,
      name: r.name,
      role: r.role,
      avatar_url: avatarUrl(r.avatar),
      followers: r.followers,
      n_weddings: r.n_weddings,
    })),
    total,
    limit,
    offset,
  };
}
