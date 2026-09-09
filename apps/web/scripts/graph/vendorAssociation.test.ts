/**
 * Regression tests for the vendor-association views (D046,
 * pipeline/schema.sql). Structural invariant checks against the live DB
 * (the same Supabase project every other script here uses — read-only
 * assertions, no writes). See docs/decisions.md D046 and
 * docs/engineering/human-labeling/README.md.
 */
import { describe, it, expect, afterAll } from "vitest";

// vitest doesn't get Bun's automatic .env.local loading that `bun run <script>` does — load it
// explicitly before importing anything that calls getPool() at module scope.
process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname);
const { getPool, closePool } = await import("../classify/db");

describe("human_confirmed_post_vendor_association (DB)", () => {
  const pool = getPool();
  afterAll(async () => {
    await closePool();
  });

  it("has exactly one row per golden_set INCLUDE post", async () => {
    const [{ rows: gs }, { rows: assoc }] = await Promise.all([
      pool.query(`select count(*)::int as n from golden_set where expected_decision = 'INCLUDE'`),
      pool.query(`select count(*)::int as n from human_confirmed_post_vendor_association`),
    ]);
    expect(assoc[0].n).toBe(gs[0].n);
  }, 15000);

  it("has_vendor_association always equals author_is_vendor OR tagged_vendor_count > 0", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from human_confirmed_post_vendor_association
      where has_vendor_association <> (author_is_vendor or tagged_vendor_count > 0)
    `);
    expect(rows[0].n).toBe(0);
  }, 15000);

  it("vendor_association_type is consistent with the two underlying signals in all four cases", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from human_confirmed_post_vendor_association
      where vendor_association_type <> (
        case
          when author_is_vendor and tagged_vendor_count > 0 then 'BOTH'
          when author_is_vendor then 'AUTHOR_ONLY'
          when tagged_vendor_count > 0 then 'TAGGED_ONLY'
          else 'NONE'
        end
      )
    `);
    expect(rows[0].n).toBe(0);
  }, 15000);

  it("does not gate Layer 1 — human_confirmed_chicago_wedding_content is unchanged by this addition", async () => {
    // 640, not 639 -- a legitimate, separate-cause drift, not this view gating anything: the
    // "v1 data completion, venues-first" mission (D047, 2026-09-06) backfilled account_locations
    // for 33 newly-confirmed Chicago venues, which flipped one previously-AMBIGUOUS/NO_SIGNAL
    // golden_set post to CONFIRMED via human_confirmed_post_geography's venue_signals join --
    // the vendor-association view itself still adds zero gating. Update again if Track A's
    // remaining ~200-account backfill flips more.
    // Jumped to 731 (2026-09-06, later same day): syncHumanLabelsToGoldenSet.ts round 1 (the
    // /label venue_coverage_v3 human-labeling sync) promoted 111 new golden_set INCLUDE rows --
    // a real, expected golden_set-side content increase, not this view gating anything
    // differently (same non-gating mechanism, just more Layer-1 content to reflect). 732
    // (2026-09-06, later same day): sync round 3 added 1 more INCLUDE as labeling continued.
    // Jumped to 925 (2026-09-06, later same day): the /label venue_coverage_v3 queue-completion
    // sync (user finished labeling, 218 WEDDING labels total) promoted 197 new golden_set
    // INCLUDE rows -- same non-gating mechanism, a real Layer-1 content increase.
    // Jumped to 1036 (D048, 2026-09-06): the new beyond_include_v1 queue's first sync round
    // (user labeled 235, 111 new golden_set INCLUDE rows) -- same mechanism.
    // Jumped to 1073 (D049, 2026-09-07): the new styled_shoot_v1 queue's first sync round (user
    // labeled all 80, 37 WEDDING) -- same mechanism.
    // Jumped to 1305 (2026-09-07, later same day): user finished the full beyond_include_v1
    // queue (833/833), synced across two rounds (485 new labels total) -- same mechanism.
    // 1308 (D055, 2026-09-08): stack parser v8 (ungated, plus inline `at @handle` / venue-hashtag
    // patterns) put a role='venue' credit on 3 more golden INCLUDE posts whose venue is a
    // confirmed-Chicago account, so human_confirmed_post_geography's venue_signals join flips
    // them AMBIGUOUS/NO_SIGNAL -> CONFIRMED. Same non-gating mechanism as the D047 +1 above.
    const { rows } = await pool.query(`select count(*)::int as n from human_confirmed_chicago_wedding_content`);
    expect(rows[0].n).toBe(1308);
  }, 15000);

  it(
    "human_confirmed_vendor_page_content is exactly the Layer-1 subset with has_vendor_association",
    async () => {
      // 580, not 579 -- tracks the same +1 Layer-1 drift above (D047), not a change in this
      // view's own logic. 667, not 580 (2026-09-06, later same day) -- tracks the same
      // 640->731 golden_set-sync jump above. 668 (2026-09-06, later same day) -- tracks the
      // 731->732 sync round 3 bump. 861 (2026-09-06, later same day) -- tracks the 732->925
      // /label queue-completion sync jump above. 972 (D048, 2026-09-06) -- tracks the
      // 925->1036 beyond_include_v1 sync jump above. 1009 (D049, 2026-09-07) -- tracks the
      // 1036->1073 styled_shoot_v1 sync jump above. 1206 (2026-09-07, later same day) -- tracks
      // the 1073->1305 beyond_include_v1 completion sync jump above. 1211 (D055, 2026-09-08) --
      // tracks the 1305->1308 v8-parser Layer-1 bump above plus 2 Layer-1 posts that gained
      // their first tagged-vendor credit from the ungated parse (has_vendor_association flipped).
      // 1217 (D055 step 5, same day): upsertAccountsForStackHandles.ts minted 8,434 never-seen
      // handles as accounts, so 6 more Layer-1 posts' existing credits now resolve to a vendor
      // account (Layer 1 itself unchanged at 1308 -- this is association, not geography).
      const { rows } = await pool.query(`
        select
          (select count(*)::int from human_confirmed_vendor_page_content) as vendor_page,
          (select count(*)::int from human_confirmed_chicago_wedding_content c
             join human_confirmed_post_vendor_association va on va.post_url = c.post_url
             where va.has_vendor_association) as expected
      `);
      expect(rows[0].vendor_page).toBe(rows[0].expected);
      expect(rows[0].vendor_page).toBe(1217);
    },
    // 120s, was 30s (D055): the view now scans 451k stack entries (was 362k) after the
    // corpus-wide parse -- ~19s per evaluation, and this test evaluates it twice.
    120000
  );

  it("author-is-vendor posts with no tagged vendor exist and are captured (the D046 discovery: a venue posting its own real wedding, crediting no one else, still counts)", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from human_confirmed_post_vendor_association
      where vendor_association_type = 'AUTHOR_ONLY'
    `);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
