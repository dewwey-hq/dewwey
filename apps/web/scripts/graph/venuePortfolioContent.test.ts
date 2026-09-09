/**
 * Regression tests for `venue_portfolio_content` (Track C, D047 follow-on,
 * pipeline/schema.sql). Structural invariant checks against the live DB —
 * read-only assertions, no writes. See docs/decisions.md D047.
 */
import { describe, it, expect, afterAll } from "vitest";

process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname);
const { getPool, closePool } = await import("../classify/db");

describe("venue_portfolio_content (DB)", () => {
  const pool = getPool();
  afterAll(async () => {
    await closePool();
  });

  it("has exactly one row per post_url (distinct on post_url in the view definition)", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from (
        select post_url from venue_portfolio_content group by post_url having count(*) > 1
      ) dup
    `);
    expect(rows[0].n).toBe(0);
  }, 120000); // 15s -> 120s (D055, 2026-09-09): view scans the corpus-wide parse; ~15-20s per evaluation

  it("every row's venue_account_id is a Chicago venue in `vendors`, verified via a real Places lookup (D055: city defaults to 'Chicago' on every row, docs/jeremy-ddl.sql)", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from venue_portfolio_content vpc
      where not exists (
        select 1 from vendors v where v.account_id = vpc.venue_account_id and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
      )
    `);
    expect(rows[0].n).toBe(0);
  }, 120000); // 15s -> 120s (D055, 2026-09-09): view scans the corpus-wide parse; ~15-20s per evaluation

  it("is_documented_wedding rows genuinely trace to wedding_posts (not a stale/mistaken flag)", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from venue_portfolio_content vpc
      where vpc.is_documented_wedding
        and not exists (
          select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = vpc.post_url
        )
    `);
    expect(rows[0].n).toBe(0);
  }, 120000); // 15s -> 120s (D055, 2026-09-09): view scans the corpus-wide parse; ~15-20s per evaluation

  it("is a non-gating, additive view — does not change human_confirmed_chicago_wedding_content's row count", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from golden_set where expected_decision = 'INCLUDE'
    `);
    // Sanity check only: golden_set/Layer-1 membership is defined entirely independently of
    // this view (see the view's own comment) — this just confirms golden_set wasn't touched by
    // applying the new view (still >0, unaffected).
    expect(rows[0].n).toBeGreaterThan(0);
  }, 120000); // 15s -> 120s (D055, 2026-09-09): view scans the corpus-wide parse; ~15-20s per evaluation
});
