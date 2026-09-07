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
  /** Alias account ids (account_aliases) whose wedding_vendors rows also count toward
   * accountId's Feed -- see resolveAccountIdentity(). Only meaningful when accountId is set. */
  aliasAccountIds?: number[];
} = {}) {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;
  const accountIds = opts.accountId != null ? [opts.accountId, ...(opts.aliasAccountIds ?? [])] : null;
  const { rows } = await getPool().query(
    `${STACK_SELECT}
     WHERE ($3::int[] IS NULL AND w.is_chicago)
        OR ($3::int[] IS NOT NULL AND EXISTS (
             SELECT 1 FROM wedding_vendors x
             WHERE x.wedding_id = w.id AND x.account_id = ANY($3::int[])))
     ORDER BY w.event_date_est DESC NULLS LAST, w.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, accountIds]
  );
  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  return { stacks: rows.map(toStack), total, limit, offset };
}

/**
 * Resolves a requested account id through `account_aliases` (D047 follow-on, 2026-09-06 --
 * some real venues run multiple Instagram handles, e.g. Art Institute of Chicago has three).
 * Visiting an alias's own URL still resolves to the canonical account's identity (name, bio,
 * avatar) so both handles render the same profile, and returns every alias id feeding INTO
 * that canonical account so callers can merge wedding counts/Feed across all of them --
 * additive, doesn't touch any wedding_vendors row.
 */
async function resolveAccountIdentity(requestedId: number): Promise<{ canonicalId: number; aliasIds: number[] }> {
  const { rows } = await getPool().query<{ canonical_account_id: number }>(
    `select canonical_account_id from account_aliases where alias_account_id = $1`,
    [requestedId]
  );
  const canonicalId = rows.length > 0 ? rows[0].canonical_account_id : requestedId;
  const { rows: aliasRows } = await getPool().query<{ alias_account_id: number }>(
    `select alias_account_id from account_aliases where canonical_account_id = $1`,
    [canonicalId]
  );
  return { canonicalId, aliasIds: aliasRows.map((r) => r.alias_account_id) };
}

export async function getVendorProfile(
  username: string,
  opts: { feedLimit?: number; feedOffset?: number } = {}
) {
  const pool = getPool();

  // Resolve alias->canonical FIRST (D047 follow-on, 2026-09-06) -- visiting either handle of
  // a multi-account venue (e.g. artinstitutespecialevents) renders the same canonical profile,
  // with wedding counts/Feed merged across every alias. See resolveAccountIdentity() and
  // account_aliases in pipeline/schema.sql.
  const { rows: rawRows } = await pool.query<{ id: number }>(`SELECT id::int FROM accounts WHERE username = $1::citext`, [username]);
  if (rawRows.length === 0) return null;
  const { canonicalId, aliasIds } = await resolveAccountIdentity(rawRows[0].id);
  const allIds = [canonicalId, ...aliasIds];

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
         WHERE wv.account_id = ANY($2::int[]))::int AS n_weddings,
       (SELECT COUNT(*) FROM wedding_vendors wv JOIN weddings w ON w.id = wv.wedding_id
         WHERE wv.account_id = ANY($2::int[]) AND w.is_chicago)::int AS n_chicago_weddings
     FROM accounts a
     LEFT JOIN v_account_role var ON var.account_id = a.id
     LEFT JOIN account_locations al ON al.account_id = a.id
     LEFT JOIN LATERAL (
       SELECT name, address, city, place_id, rating, review_count, website
       FROM vendors WHERE account_id = a.id ORDER BY id LIMIT 1
     ) v ON true
     WHERE a.id = $1`,
    [canonicalId, allIds]
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
         SUM(e.n_weddings)::int AS n_weddings, MAX(e.last_worked_together) AS last_worked_together
       FROM edges e
       JOIN accounts partner
         ON partner.id = CASE WHEN e.account_a = ANY($1::int[]) THEN e.account_b ELSE e.account_a END
       LEFT JOIN v_account_role pvar ON pvar.account_id = partner.id
       LEFT JOIN LATERAL (
         SELECT name FROM vendors WHERE account_id = partner.id ORDER BY id LIMIT 1
       ) pv ON true
       WHERE (e.account_a = ANY($1::int[]) OR e.account_b = ANY($1::int[]))
         AND partner.id <> ALL($1::int[])
       GROUP BY partner.id, partner.username, name, pvar.role, partner.avatar_path
       ORDER BY n_weddings DESC, last_worked_together DESC NULLS LAST
       LIMIT 24`,
      [allIds]
    ),
    listWeddingStacks({
      accountId: canonicalId,
      aliasAccountIds: aliasIds,
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
       -- D047 follow-on, 2026-09-06: a real venue running multiple Instagram handles (see
       -- account_aliases) shouldn't fragment its wedding count across separate browse cards --
       -- merge every alias's rows onto the canonical account_id here.
       SELECT COALESCE(aa.canonical_account_id, wv.account_id) AS account_id,
              COUNT(*) FILTER (WHERE w.is_chicago) AS n_chicago
       FROM wedding_vendors wv
       JOIN weddings w ON w.id = wv.wedding_id
       LEFT JOIN account_aliases aa ON aa.alias_account_id = wv.account_id
       GROUP BY COALESCE(aa.canonical_account_id, wv.account_id)
     ) cnt ON cnt.account_id = a.id
     LEFT JOIN LATERAL (
       SELECT name, place_id, rating, review_count, neighborhood, photo_keys
       FROM vendors WHERE account_id = a.id ORDER BY id LIMIT 1
     ) v ON true
     WHERE cnt.n_chicago >= GREATEST($5::int, 1)
       -- alias accounts never appear as their own card -- their weddings already counted
       -- toward the canonical account above.
       AND NOT EXISTS (SELECT 1 FROM account_aliases WHERE alias_account_id = a.id)
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
      (SELECT COUNT(DISTINCT COALESCE(aa.canonical_account_id, wv.account_id))
         FROM wedding_vendors wv JOIN weddings w ON w.id = wv.wedding_id
         LEFT JOIN account_aliases aa ON aa.alias_account_id = wv.account_id
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
    SELECT var.role::text AS role, COUNT(DISTINCT COALESCE(aa.canonical_account_id, wv.account_id))::int AS n
    FROM wedding_vendors wv
    JOIN weddings w ON w.id = wv.wedding_id AND w.is_chicago
    JOIN v_account_role var ON var.account_id = wv.account_id
    LEFT JOIN account_aliases aa ON aa.alias_account_id = wv.account_id
    GROUP BY var.role`);
  return Object.fromEntries(rows.map((r) => [r.role, r.n]));
}
