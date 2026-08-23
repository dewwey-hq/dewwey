import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";
import { avatarUrl } from "@/lib/server/graph";

/**
 * The payoff query: vendors (optionally of given roles) ranked by real
 * weddings worked WITH the couple's current team, receipts included.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 50);
  const roles = (searchParams.get("roles") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (ids.length === 0) return NextResponse.json({ picks: [] });

  const { rows } = await getPool().query(
    `WITH team AS (SELECT unnest($1::bigint[]) AS id)
     SELECT
       cand.id::int,
       cand.username::text,
       CASE WHEN v.name IS NULL OR v.name IN (cand.username::text, '@' || cand.username::text)
            THEN COALESCE(cand.full_name, cand.username::text) ELSE v.name END AS name,
       var.role::text AS role,
       cand.avatar_path,
       SUM(e.n_weddings)::int AS weddings_together,
       jsonb_agg(jsonb_build_object(
         'username', tm.username,
         'name', COALESCE(tm.full_name, tm.username::text),
         'n', e.n_weddings
       ) ORDER BY e.n_weddings DESC) AS receipts
     FROM edges e
     JOIN team t ON t.id IN (e.account_a, e.account_b)
     JOIN accounts tm ON tm.id = t.id
     JOIN accounts cand
       ON cand.id = CASE WHEN e.account_a = t.id THEN e.account_b ELSE e.account_a END
     JOIN v_account_role var ON var.account_id = cand.id
     LEFT JOIN LATERAL (
       SELECT name FROM vendors WHERE account_id = cand.id ORDER BY id LIMIT 1
     ) v ON true
     WHERE cand.id != ALL($1::bigint[])
       AND (cardinality($2::text[]) = 0 OR var.role::text = ANY($2::text[]))
     GROUP BY cand.id, cand.username, v.name, cand.full_name, var.role, cand.avatar_path
     ORDER BY weddings_together DESC
     LIMIT 12`,
    [ids, roles]
  );

  return NextResponse.json({
    picks: rows.map((r) => ({
      accountId: r.id,
      username: r.username,
      name: r.name,
      role: r.role,
      avatarUrl: avatarUrl(r.avatar_path),
      weddingsTogether: r.weddings_together,
      receipts: r.receipts,
    })),
  });
}
