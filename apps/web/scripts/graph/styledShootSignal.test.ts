/**
 * Regression tests for the styled-shoot-vs-real-wedding signal views (D049,
 * pipeline/schema.sql). Structural invariant checks against the live DB
 * (the same Supabase project every other script here uses — read-only
 * assertions, no writes). See docs/decisions.md D049.
 */
import { describe, it, expect, afterAll } from "vitest";

process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname);
const { getPool, closePool } = await import("../classify/db");

describe("post_styled_shoot_signal (DB)", () => {
  const pool = getPool();
  // No afterAll(closePool) here on purpose: getPool()/closePool() share one module-level
  // pool for the whole file. Exactly one closePool() call for the whole file, in the LAST
  // describe block below (matches graphStrengthening.test.ts's own pattern).

  it("confidence is always one of the four defined values", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from post_styled_shoot_signal
      where confidence not in ('CONFIRMED', 'LIKELY', 'POSSIBLE', 'NO_SIGNAL')
    `);
    expect(rows[0].n).toBe(0);
  }, 30000);

  it("CONFIRMED is structurally gated to golden_set EXCLUDE rows only -- never an INCLUDE (real) post", async () => {
    // Guaranteed by the view's own golden_styled CTE (expected_decision = 'EXCLUDE'), not just an
    // empirical observation -- if this ever breaks it means the view's WHERE clause changed.
    const { rows } = await pool.query(`
      select count(*)::int as n
      from golden_set gs
      join post_styled_shoot_signal pss on pss.post_url = gs.post_url
      where gs.expected_decision = 'INCLUDE' and pss.confidence = 'CONFIRMED'
    `);
    expect(rows[0].n).toBe(0);
  }, 30000);

  it("CONFIRMED count matches the golden_set styled-signal EXCLUDE population", async () => {
    // 94 as of the initial D049 build (2026-09-07): golden_set rows with expected_decision=
    // 'EXCLUDE' and a "styl" signal in notes or exclusion_reason. Jumped to 141 (D049, same day,
    // later): the new styled_shoot_v1 queue's first sync round (user labeled all 80, 48
    // NOT_WEDDING) promoted new golden_set EXCLUDE rows carrying a "styled shoot" note -- a real
    // ground-truth-growth increase, not a change in this view's own logic. Jumped to 228
    // (2026-09-07, later same day): the beyond_include_v1 completion sync (485 new labels
    // across two rounds) promoted more EXCLUDE rows with a "styl" note -- same mechanism. Grows
    // only when golden_set itself grows via new labeling -- update this literal (and the
    // comment) if a future sync legitimately changes it.
    const [{ rows: viewRows }, { rows: gsRows }] = await Promise.all([
      pool.query(`select count(*)::int as n from post_styled_shoot_signal where confidence = 'CONFIRMED'`),
      pool.query(`
        select count(*)::int as n from golden_set
        where expected_decision = 'EXCLUDE'
          and (exclusion_reason = 'styled_or_editorial' or notes ~* 'styl' or exclusion_reason ~* 'styl')
      `),
    ]);
    expect(viewRows[0].n).toBe(gsRows[0].n);
    expect(viewRows[0].n).toBe(228);
  }, 30000);

  it("high-precision phrase/hashtag regex has a low false-positive rate against confirmed-real weddings", async () => {
    // Hand-verified during D049 build: an earlier version of the hashtag regex (missing a word
    // boundary) matched #editorialweddingphotography -- a common REAL wedding-photographer tag
    // (appearing alongside #realwedding in the same caption) -- as a prefix of #editorialwedding.
    // Fixed with \y (Postgres word-boundary). This test locks in that the false-positive rate
    // stays low (<1%) against the 1,237 confirmed-real golden_set INCLUDE posts.
    const [{ rows: fp }, { rows: total }] = await Promise.all([
      pool.query(`
        select count(*)::int as n
        from golden_set gs
        join post_styled_shoot_signal pss on pss.post_url = gs.post_url
        where gs.expected_decision = 'INCLUDE' and pss.phrase_or_hashtag_signal
      `),
      pool.query(`select count(*)::int as n from golden_set where expected_decision = 'INCLUDE'`),
    ]);
    expect(fp[0].n / total[0].n).toBeLessThan(0.01);
  }, 30000);
});

describe("wedding_styled_shoot_flag (DB)", () => {
  const pool = getPool();
  afterAll(async () => {
    await closePool();
  });

  it("only appears for weddings with at least one flagged (non-NO_SIGNAL) post", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from wedding_styled_shoot_flag
      where flagged_post_count = 0
    `);
    expect(rows[0].n).toBe(0);
  }, 30000);

  it("styled_shoot_confidence is never NO_SIGNAL and every wedding_id exists in weddings (purely additive -- no wedding row is touched)", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n
      from wedding_styled_shoot_flag wsf
      left join weddings w on w.id = wsf.wedding_id
      where wsf.styled_shoot_confidence = 'NO_SIGNAL' or w.id is null
    `);
    expect(rows[0].n).toBe(0);
  }, 30000);
});
