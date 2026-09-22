/**
 * Post-table merge (plan rev 3, 2026-09-22), phase P0.5: lets the writers of `public.posts` run
 * unchanged on both sides of the schema change. `posts.origin` (the channel that first brought a
 * post in: ben_pipeline | jeremy_beta | acquisition_loop) lands in P1 as NOT NULL with no default,
 * so every writer must state it once the column exists -- and must NOT name it before then.
 *
 * Remove this helper (and its call sites' branches) once P1 is applied everywhere the scripts run.
 */
import type { Pool, PoolClient } from "pg";

let cached: boolean | undefined;

export async function postsHasOrigin(db: Pool | PoolClient): Promise<boolean> {
  if (cached === undefined) {
    const { rows } = await db.query<{ ok: boolean }>(
      `select exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'posts' and column_name = 'origin') as ok`
    );
    cached = rows[0].ok;
  }
  return cached;
}
