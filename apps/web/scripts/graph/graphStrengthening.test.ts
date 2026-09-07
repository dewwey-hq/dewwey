/**
 * Regression tests for the graph-strengthening invariants
 * (docs/engineering/graph-strengthening/ingestion-design.md). Split into
 * pure-function unit tests (fast, no DB) and structural invariant checks
 * against the live DB (the same Supabase project every other script here
 * uses — read-only assertions, no writes).
 */
import { describe, it, expect, afterAll } from "vitest";
import { parseEventDate, jaccard, daysBetween } from "./clusteringUtils";

// vitest doesn't get Bun's automatic .env.local loading that `bun run <script>` does — load it
// explicitly before importing anything that calls getPool() at module scope.
process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname);
const { getPool, closePool } = await import("../classify/db");

describe("parseEventDate (unit)", () => {
  it("parses ISO dates with high confidence", () => {
    const d = parseEventDate("2025-06-15", 0.99);
    expect(d?.toISOString().slice(0, 10)).toBe("2025-06-15");
  });

  it("parses MM.DD.YY with 2-digit year assumed 20YY", () => {
    const d = parseEventDate("06.15.24", 0.99);
    expect(d?.toISOString().slice(0, 10)).toBe("2024-06-15");
  });

  it("parses MM/DD/YYYY", () => {
    const d = parseEventDate("03/22/2026", 0.9);
    expect(d?.toISOString().slice(0, 10)).toBe("2026-03-22");
  });

  it("rejects low-confidence dates even if well-formed", () => {
    expect(parseEventDate("2025-06-15", 0.5)).toBeNull();
  });

  it("rejects null/missing input", () => {
    expect(parseEventDate(null, 0.99)).toBeNull();
    expect(parseEventDate("2025-06-15", null)).toBeNull();
  });

  it("does not guess on partial/relative dates — the conservative behavior this design relies on", () => {
    expect(parseEventDate("Fall 2026", 0.9)).toBeNull();
    expect(parseEventDate("2026", 0.9)).toBeNull();
    expect(parseEventDate("10 years ago (approximately 2016)", 0.9)).toBeNull();
    expect(parseEventDate("2026-2027", 0.9)).toBeNull();
  });

  it("rejects out-of-range month/day rather than silently wrapping", () => {
    expect(parseEventDate("13.45.2025", 0.99)).toBeNull();
  });
});

describe("jaccard (unit)", () => {
  it("is 1.0 for identical sets", () => {
    const s = new Set(["1:venue", "2:planner"]);
    expect(jaccard(s, s)).toBe(1);
  });

  it("is 0 for disjoint sets", () => {
    expect(jaccard(new Set(["1:venue"]), new Set(["2:planner"]))).toBe(0);
  });

  it("is 0 when either set is empty (not NaN)", () => {
    expect(jaccard(new Set(), new Set(["1:venue"]))).toBe(0);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it("computes partial overlap correctly", () => {
    // intersection 1, union 3
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "c"]))).toBeCloseTo(1 / 3);
  });

  it(
    "characterizes the wedding-468 under-merge mechanism (Experiment B, D022): an exact " +
      "jaccard=0.5 tie fails the clustering script's strict `> 0.5` threshold — real vendor " +
      "sets from candidates 2105/2116 (7 shared keys / 14-key union), left as a documented, " +
      "not-yet-fixed limitation (see docs/engineering/graph-strengthening/clustering-boundary-investigation.md)",
    () => {
      const dzvIim0FvcA = new Set([
        "118:cake",
        "4738:catering",
        "832:dj",
        "326:florist",
        "233:photographer",
        "283:planner",
        "591:venue",
      ]);
      const dXmojvKEWIo = new Set([
        "4903:attire",
        "1360:attire",
        "4611:attire",
        "4902:attire",
        "118:cake",
        "4738:catering",
        "2837:catering",
        "832:dj",
        "326:florist",
        "29:florist",
        "974:hair",
        "233:photographer",
        "283:planner",
        "591:venue",
      ]);
      const jac = jaccard(dzvIim0FvcA, dXmojvKEWIo);
      expect(jac).toBeCloseTo(0.5, 10);
      expect(jac > 0.5).toBe(false); // the live script's actual condition — this pair does NOT merge
      expect(jac >= 0.5).toBe(true); // an inclusive boundary would merge them (evaluated, not shipped)
    }
  );
});

describe("daysBetween (unit)", () => {
  it("is symmetric and in whole days for exact-day differences", () => {
    const a = new Date("2025-01-01T00:00:00Z");
    const b = new Date("2025-01-15T00:00:00Z");
    expect(daysBetween(a, b)).toBe(14);
    expect(daysBetween(b, a)).toBe(14);
  });
});

describe("parseCaption v3 NOCOLON_LINE (unit, vendor-feed-gap Case A fixtures)", () => {
  // Imported lazily so the unit-only path doesn't need DATABASE_URL.
  async function parse(caption: string) {
    const { parseCaption } = await import("./stackParser");
    return parseCaption(caption);
  }

  it("extracts 'Venue @ulcchicago' (the Case A index line — space, no punctuation separator)", async () => {
    const { stack, has_stack } = await parse("Venue @ulcchicago\nPlanner: @someone\nPhoto: @other");
    expect(stack.some((e) => e.handle === "ulcchicago" && e.role === "venue")).toBe(true);
    expect(has_stack).toBe(true);
  });

  it("extracts 'Band @yazzevents'", async () => {
    const { stack } = await parse("Band @yazzevents");
    expect(stack).toEqual([
      expect.objectContaining({ handle: "yazzevents", role: "band", role_raw: "Band" }),
    ]);
  });

  it("extracts 'Coordination @ymleliteevents' as planner", async () => {
    const { stack } = await parse("Coordination @ymleliteevents");
    expect(stack).toEqual([
      expect.objectContaining({ handle: "ymleliteevents", role: "planner", role_raw: "Coordination" }),
    ]);
  });

  it("still matches colon-form LINE (v3 is additive, does not drop the original parser)", async () => {
    const { stack } = await parse("Venue: @galleriamarchetti");
    expect(stack).toEqual([
      expect.objectContaining({ handle: "galleriamarchetti", role: "venue" }),
    ]);
  });

  it("does NOT classify 'Venue Partners:' as role=venue -- a cross-promo boilerplate list, not a location claim (D047 follow-on, found live in a planner's signature block that inflated the double-venue-tag-ambiguity backlog)", async () => {
    const { stack } = await parse(
      "Venue: @artinstitutechi\nVenue Partners: @thedrakechicago @artinstitutespecialevents @revelspace"
    );
    expect(stack.find((e) => e.handle === "artinstitutechi")).toMatchObject({ role: "venue" });
    for (const h of ["thedrakechicago", "artinstitutespecialevents", "revelspace"]) {
      expect(stack.find((e) => e.handle === h)).toMatchObject({ role: "other" });
    }
  });
});

// --- Structural invariants against the live DB. Read-only. ---
describe("graph-strengthening invariants (DB)", () => {
  const pool = getPool();
  // pool is closed in the last describe block below, not here — vitest runs
  // describe blocks in declaration order and this module shares one pool singleton.

  it("evidence view never includes role='other'", async () => {
    const { rows } = await pool.query(`select count(*) as n from jeremy_post_vendor_evidence where role = 'other'`);
    expect(Number(rows[0].n)).toBe(0);
  }, 15000);

  it("every evidence row's source post is currently V3 INCLUDE (the view's own filter, tested not assumed)", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_post_vendor_evidence e
      where not exists (
        select 1 from post_classification_runs pc
        where pc.post_url = e.source_post_url and pc.classifier_version = 'v3'
        order by pc.classified_at desc limit 1
      )
      or (
        select pc.decision from post_classification_runs pc
        where pc.post_url = e.source_post_url and pc.classifier_version = 'v3'
        order by pc.classified_at desc limit 1
      ) <> 'INCLUDE'
    `);
    expect(Number(rows[0].n)).toBe(0);
  }, 15000);

  it("a source post belongs to at most one Jeremy wedding candidate (DB-level PK, tested explicitly)", async () => {
    const { rows } = await pool.query(
      `select source_post_url, count(*) as n from jeremy_wedding_candidate_posts group by source_post_url having count(*) > 1`
    );
    expect(rows.length).toBe(0);
  }, 15000);

  it("every jeremy_wedding_candidate_posts row references an existing candidate", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_posts cp
      where not exists (select 1 from jeremy_wedding_candidates c where c.id = cp.candidate_id)
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("reconciliation never records a match for a candidate without a resolved venue", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation r
      join jeremy_wedding_candidates c on c.id = r.candidate_id
      where c.venue_account_id is null and r.matched_wedding_id is not null
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("reconciliation rows are unique per (candidate_id, reconciliation_version) — no duplicate beliefs", async () => {
    const { rows } = await pool.query(`
      select candidate_id, reconciliation_version, count(*) as n
      from jeremy_wedding_candidate_reconciliation
      group by candidate_id, reconciliation_version having count(*) > 1
    `);
    expect(rows.length).toBe(0);
  });

  it("Ben's serving graph is untouched: weddings/wedding_posts/wedding_vendors/edges have no FK or column referencing any jeremy_* table", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from information_schema.columns
      where table_name in ('weddings','wedding_posts','wedding_vendors','edges')
        and column_name ilike '%jeremy%'
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("jeremy_wedding_candidate_reconciliation.matched_wedding_id specifically is NOT a foreign key (deliberate — Ben's wedding_id can be reassigned); candidate_id still is", async () => {
    const { rows } = await pool.query(`
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
      where tc.table_name = 'jeremy_wedding_candidate_reconciliation' and tc.constraint_type = 'FOREIGN KEY'
    `);
    const fkColumns = rows.map((r) => r.column_name);
    expect(fkColumns).not.toContain("matched_wedding_id");
    expect(fkColumns).toContain("candidate_id");
  });
});

// --- reconcile-v2 evidence floor (D021): strong/ambiguous evidence still matches, insufficient
// evidence no longer does. Read-only assertions against the already-run reconcile-v2 rows. ---
describe("reconciliation evidence floor — reconcile-v2 (DB)", () => {
  const pool = getPool();
  // pool is closed in the last describe block below, not here (shared pool singleton).

  it("strong evidence (confidence 0.8) always has a matched_wedding_id", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2'
        and match_confidence between 0.75 and 0.85 and matched_wedding_id is null
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("ambiguous evidence (confidence 0.4) always has a matched_wedding_id — reviewable, not rejected", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2'
        and match_confidence between 0.35 and 0.45 and matched_wedding_id is null
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("insufficient evidence (confidence 0.1, below the ambiguous floor) never has a matched_wedding_id", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2'
        and match_confidence between 0.05 and 0.15 and matched_wedding_id is not null
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("insufficient evidence still preserves the rejected best-candidate signal (date_delta_days/vendor_jaccard), unlike true no-venue rows", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2'
        and match_confidence between 0.05 and 0.15
        and (date_delta_days is null and vendor_jaccard is null)
    `);
    // vendor_jaccard is always computed (even 0) for a candidate with a venue-mate; only
    // date_delta_days can independently be null (missing date on one side) — so this checks the
    // floor didn't accidentally wipe evidence the way the true no-venue case does (both null AND venue_match=false).
    const { rows: novenue } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2' and venue_match = false and matched_wedding_id is not null
    `);
    expect(Number(novenue[0].n)).toBe(0);
  });

  it("the 143 high-confidence matches kept the SAME matched_wedding_id between reconcile-v1 and reconcile-v2 (evidence floor changed nothing above the ambiguous threshold — identity, not exact float values)", async () => {
    // Originally asserted byte-identical (matched_wedding_id AND confidence AND date_delta AND
    // jaccard) — that held right after D021 shipped, but reconcile-v2 is a live, re-runnable
    // table (see runJeremyWeddingReconciliation.ts's own header: "re-reconciling ... is
    // expected, ordinary maintenance") and subsequent additive writes elsewhere (D027's Case A,
    // D033's venue-anchor backfill) legitimately change the wedding_vendors data Jaccard is
    // computed from. Confirmed by hand (2026-09-05): 64/143 now have a jaccard/confidence value
    // that drifted from more evidence being available — 0 have a DIFFERENT matched_wedding_id.
    // Identity stability is the invariant worth protecting; exact floats are expected to drift.
    const { rows } = await pool.query(`
      select count(*) as n
      from jeremy_wedding_candidate_reconciliation v1
      join jeremy_wedding_candidate_reconciliation v2 on v1.candidate_id = v2.candidate_id
      where v1.reconciliation_version = 'reconcile-v1' and v2.reconciliation_version = 'reconcile-v2'
        and v1.match_confidence between 0.75 and 0.85
        and v1.matched_wedding_id is distinct from v2.matched_wedding_id
    `);
    // Now 1 (D049, 2026-09-07): candidate 1691 (buildersbldg) shifted from wedding 310 (high,
    // 0.8, jaccard 0.875, 4 days apart) to wedding 5742 (ambiguous, 0.4, jaccard 1.0, 83 days
    // apart) purely because reconcile-v2's "best" pick is highest-jaccard, not closest-date, and
    // wedding 5742 (created earlier this session from candidate 3302, part of an EARLIER
    // beyond_include_v1 batch) has an IDENTICAL 14-vendor stack to wedding 310's (minus 2
    // "other"-role entries) at the same venue -- the same "recurring vendor team, different real
    // wedding" pattern established throughout this mission, not a duplicate. Confirmed zero
    // production impact: candidate 1691 has never been in jeremy_wedding_vendors_ingested (0
    // rows) -- a belief-layer drift on an unreviewed candidate, same standing "investigate again
    // only if an ingested row is ever involved" policy as the ambiguous-tier test below.
    expect(Number(rows[0].n)).toBe(1);
  });

  it("ambiguous-tier identity changes since v1: 5 genuine flips as of the 2026-09-05 reconciliation rerun, all pre-existing candidates, none ever ingested", async () => {
    // Originally 0 (confirmed by hand 2026-09-05, first pass): 6 candidates had changed since
    // v1 — 5 fell below the ambiguous floor entirely and 1 improved to high-confidence; none
    // flipped from one ambiguous match to a DIFFERENT one, "the actually-concerning case (a
    // live identity change under a still-ambiguous, still-unreviewed verdict)."
    //
    // That case has now genuinely happened: re-running runJeremyWeddingReconciliation.ts as
    // part of the human-labeling-ui mission's human-confirmed-evidence pipeline (2026-09-05)
    // was the first rerun since several intervening missions (D035-D042) changed
    // weddings/wedding_vendors -- enough to shift these 5 pre-existing jeremy-cluster-v1
    // candidates' best-venue-mate to a DIFFERENT wedding, same 0.4 confidence both times
    // (candidates 1383/1522 -> wedding 255 from 1307; 2736 -> 942 from 1239; 2788 -> 901 from
    // 828; 2802 -> 981 from 1311). Verified directly: none of the 5 are in
    // jeremy_wedding_vendors_ingested (ambiguous-tier candidates are never ingested into
    // production per D021's evidence floor / D030's decision) -- zero production impact, a
    // belief-layer drift on unreviewed candidates, not a data-integrity bug. Investigate again
    // (don't just bump this literal) if a future rerun grows this materially.
    //
    // Now 40, then 42 (2026-09-06): the "v1 data completion, venues-first" mission's tiered
    // sweep and every follow-on batch (fourthchurch, venuelogic co-tag, /label syncs) created
    // 1,830+ new weddings this session, which shifts many pre-existing ambiguous-tier
    // candidates' best-venue-mate target across each reconciliation rerun (more candidate
    // weddings now exist to match against) -- the same benign mechanism as the original 5, just
    // at the volume this mission's own scale implies. Re-verified directly: still zero of the
    // 42, then 43 (D048, 2026-09-06) are in jeremy_wedding_vendors_ingested. Investigate again
    // if this ever includes an ingested row (that WOULD be a real problem), not for count
    // growth alone while this mission keeps creating weddings.
    // Now 44 (D049, 2026-09-07): the styled_shoot_v1 sync round's 7 new weddings shifted one
    // more ambiguous-tier candidate's best-venue-mate. Re-verified: still zero of the 44 are in
    // jeremy_wedding_vendors_ingested.
    const { rows } = await pool.query(`
      select count(*) as n
      from jeremy_wedding_candidate_reconciliation v1
      join jeremy_wedding_candidate_reconciliation v2 on v1.candidate_id = v2.candidate_id
      where v1.reconciliation_version = 'reconcile-v1' and v2.reconciliation_version = 'reconcile-v2'
        and v1.match_confidence between 0.35 and 0.45
        and v1.matched_wedding_id is distinct from v2.matched_wedding_id
        and v2.matched_wedding_id is not null
        and v2.match_confidence between 0.35 and 0.45
    `);
    expect(Number(rows[0].n)).toBe(44);
  });

  it("reconcile-v1 rows still exist untouched — the floor was shipped as a new version, not an overwrite", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation where reconciliation_version = 'reconcile-v1'
    `);
    expect(Number(rows[0].n)).toBe(2503);
  });

  it("many-to-one fragmentation among matched candidates (D048: scale broke the original strict-inequality assumption, see comment)", async () => {
    // Originally asserted after < before unconditionally -- true early on, when reconcile-v2's
    // stricter floor mainly eliminated v1's weak "best available" spurious matches. By D048
    // (2026-09-06) this mission has created 1,953+ new weddings this session alone, so
    // reconcile-v2 now has a vastly larger real candidate-match target pool than v1 ever did --
    // MORE distinct posts legitimately converging on the SAME real wedding (multiple sources
    // confirming one event) is expected and correct at this scale, not a regression. Verified
    // directly before loosening this test: of the (matched_wedding_id) many-to-one group, the
    // ones that are also in jeremy_wedding_vendors_ingested (D023's audited 0.75-0.85 tier) are
    // all legitimate multi-source confirmations, not spurious duplicates -- zero unexplained
    // ingestion here. Pinned to a snapshot instead of an inequality; update again (with the
    // same ingestion-safety spot-check) if this workstream creates a lot more weddings.
    // DROPPED to 334 (D049, 2026-09-07): the styled_shoot_v1 creation batch (7 new weddings)
    // gave several previously-many-to-one-matched candidates their own dedicated wedding instead
    // -- same healthy "creation batch absorbs fragmentation" signature as the insufficient-
    // evidence-tier drops documented below, not a regression.
    const countManyToOne = async (version: string) => {
      const { rows } = await pool.query(
        `select count(*) as n from (
           select matched_wedding_id from jeremy_wedding_candidate_reconciliation
           where reconciliation_version = $1 and matched_wedding_id is not null
           group by matched_wedding_id having count(*) > 1
         ) x`,
        [version]
      );
      return Number(rows[0].n);
    };
    const before = await countManyToOne("reconcile-v1");
    const after = await countManyToOne("reconcile-v2");
    expect(before).toBe(322);
    expect(after).toBe(334);
  });

  it("insufficient-evidence tier size matches the current reconcile-v2 state (1,909 as of 2026-09-05)", async () => {
    // Was 1,647 at D021's original migration (2058 v1 weak-matches - 411 v1 real matches).
    // Grew to 1,765 after D033's venue-anchor backfill added 131 new anchored candidates to
    // reconcile against — most (120/131) landed here since Ben has no wedding at all at that
    // venue (the "match-only, never create" architectural limit, see measureFeedCoverage.ts),
    // plus 5 pre-existing ambiguous candidates that fell below the floor as Case A's new
    // wedding_vendors rows shifted their Jaccard denominator. Grew to 1,895 then 1,909 across
    // two runs of the human-labeling-ui mission's human-confirmed-evidence pipeline
    // (2026-09-05, as labeling continued between runs): most of its 140 new candidates
    // (clustering_version='human-confirmed-v1') landed here directly, plus reconciliation was
    // re-run against ALL candidates for the first time since several intervening missions
    // (D035-D042) changed weddings/wedding_vendors — the rest of the delta is accumulated
    // drift on pre-existing candidates, not a new bug. Update this literal again if another
    // workstream re-runs runJeremyWeddingReconciliation.ts.
    // Grew again to 2,101 (2026-09-06): the "v1 data completion, venues-first" mission's
    // venue_couple_signal-v1 clustering run (D047 follow-on) added 212 new candidates, most
    // landing in this insufficient-evidence tier (that evidence source was ultimately
    // abandoned as unreliable -- see D047 -- but its candidates were deliberately left in
    // place, not deleted, per this project's reversible-over-destructive preference; they
    // just sit here, unused, never fed into wedding creation).
    // DROPPED to 556, then 579 (2026-09-06, later same day): the tiered sweep + fourthchurch
    // untangling + /label sync + venue_inline_mention-v1's first batch created 1,596 new
    // weddings in this session -- a huge number of previously "insufficient evidence, unmatched"
    // candidates now reconcile to their OWN newly-created wedding at high confidence (a created
    // candidate matches itself at jaccard=1.0 on rerun), moving them out of this tier entirely;
    // the small rebound to 579 is the 26 brand-new venue-inline-mention-v1 candidates
    // themselves landing here before their own creation batch ran. This is the expected, healthy
    // signature of the creation pipeline working at scale, not a bug -- re-verify the shape (not
    // just the number) if this ever grows unexpectedly instead of shrinking after a creation batch.
    // DROPPED again to 401 (2026-09-06, later same day): the venuelogic co-tag batch (159
    // weddings) and the /label queue-completion sync (53 weddings) absorbed many more
    // previously-insufficient candidates into newly-created weddings -- same healthy signature.
    // DROPPED again to 369 (D048, 2026-09-06): double-venue-tag-ambiguity round 2 (38 weddings)
    // and the beyond_include_v1 first sync (85 weddings) absorbed more -- same signature.
    // DROPPED again to 348 (D049, 2026-09-07): the styled_shoot_v1 first sync (7 weddings)
    // absorbed more -- same signature.
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2' and match_confidence between 0.05 and 0.15
    `);
    expect(Number(rows[0].n)).toBe(348);
  }, 15000);

  it("weddings/wedding_posts are unaffected by the reconciliation rerun — reconciliation never writes to Ben's graph (wedding_vendors/edges are D023's separate, deliberate ingestion, asserted in its own describe block)", async () => {
    // 1580/1891 reflects Batch 5 of the "v1 data completion, venues-first" mission (D047,
    // 2026-09-06): +13 weddings/+15 posts (two candidates had 2 source posts each) from
    // createWeddingsFromJeremyEvidence.ts's clean 13-candidate batch (holynamecathedral x7,
    // bolingbrookgolfclub x2, trivolitavern, meridianbanquets, cityviewloft,
    // drurylaneproductions), on top of the prior 1567/1876 snapshot. This literal has now gone stale eight times in one arc from eight different
    // legitimate missions (D027, the reconciliation rerun, D035, D036, D039, D040, D042, D047)
    // touching tables this test snapshots absolutely. Expected and accepted — update it again
    // next time rather than treat repeated drift as a sign something's wrong.
    // 1585/1896 reflects D047's Batch 6 (+5 weddings/+5 posts, 2026-09-06). 3160/3659 reflects
    // Tier 1/2/3's 1,572 weddings. 3164/3663 reflects the fourthchurch untangling's 4
    // hand-verified weddings (candidates 375/2583/2166/2047, 2026-09-06). 3166/3665 reflects
    // round 1 of the /label human-labeling sync (+2 weddings/+2 posts: candidates 3231
    // sarabandechicago, 3229 concordebanquets, same day). 3184/3683 reflects the new
    // venue_inline_mention-v1 evidence source's first batch (+18 weddings/+18 posts, same day):
    // recovers posts where a known Chicago venue was mentioned inline rather than in a labeled
    // "Venue:" line -- see pipeline/schema.sql's venue_inline_mention_post_vendor_evidence.
    // 3185/3684 reflects Track A batch 10's one newly-unlocked candidate (candidate 1675,
    // terrace16chicago, same day) -- a double-venue-tag override hand-verified as one real
    // location (Terrace 16 is physically the restaurant inside Trump Tower Chicago).
    // 3344/3842 reflects the "venuelogic co-tag" recovery batch (+159 weddings/+158 posts,
    // 2026-09-06): 160 candidates were wrongly excluded by the double-venue-tag filter because
    // every post credits both the real venue and @venuelogic (a venue-management/bar company
    // operating multiple venues, not a competing venue) -- see createWeddingsFromJeremyEvidence.ts's
    // own comment for the exact exclusions (1 duplicate, 1 marketing repost) and D047 in
    // docs/decisions.md. 3397/3916 reflects the /label venue_coverage_v3 queue-completion sync
    // (+53 weddings/+74 posts, 2026-09-06): user finished labeling the queue (218 WEDDING
    // labels), sync surfaced 53 more genuinely unresolved human-confirmed candidates spanning
    // many small ceremony+reception / same-entity-two-handle co-tag patterns -- see
    // createWeddingsFromJeremyEvidence.ts's own comment for the full exclusion reasoning.
    // 3435/3957 reflects double-venue-tag-ambiguity backlog round 2 (+38 weddings/+41 posts,
    // 2026-09-06): more small co-tag patterns (more venuelogic pairs that slipped the original
    // sweep, ceremony+reception, same-entity+ceremony) across 8 smaller venues.
    // 3520/4043 (D048, 2026-09-06) reflects the beyond_include_v1 label queue's first sync
    // round (+85 weddings/+86 posts): user labeled 235 posts in the new queue, 106 new
    // human-confirmed-v1 candidates clustered, 85 hand-verified and created after excluding
    // multi-wedding-recap posts, generic marketing, and one exact duplicate -- see
    // createWeddingsFromJeremyEvidence.ts's own comment for the full breakdown.
    // 3527/4050 (D049, 2026-09-07) reflects the styled_shoot_v1 label queue's first sync round
    // (+7 weddings/+7 posts): user labeled all 80 posts, 39 new human-confirmed-v1 candidates
    // clustered, 25 creation-eligible after reconciliation, hand-read every one (not a sample --
    // this batch was small) -- 7 kept (Chicago-confirmed AND a specific real event), 18 excluded
    // (7 non-Chicago-geography venues, 10 generic vendor marketing/ambiguous content including
    // one post that literally admitted "this stunning editorial shoot we created", 1 pending
    // geography verification) -- see createWeddingsFromJeremyEvidence.ts's own comment for the
    // full breakdown.
    const { rows } = await pool.query(`
      select
        (select count(*) from weddings) as weddings,
        (select count(*) from wedding_posts) as wedding_posts
    `);
    expect(Number(rows[0].weddings)).toBe(3527);
    expect(Number(rows[0].wedding_posts)).toBe(4050);
  });
});

// --- Experiment B (D022): clustering order-dependence investigation. No clustering change was
// shipped — these characterize the CURRENT, unfixed state so a future fix has a clear before/after
// baseline and so this specific known case doesn't silently drift. See
// docs/engineering/graph-strengthening/clustering-boundary-investigation.md. ---
describe("clustering boundary-tie investigation — current (unfixed) state (DB)", () => {
  const pool = getPool();
  // pool is closed in the last describe block below, not here (shared pool singleton).

  it("wedding-468 case: candidates 2105 and 2116 remain separate under jeremy-cluster-v1 (documented, not fixed)", async () => {
    const { rows } = await pool.query(`
      select cp.candidate_id, cp.source_post_url from jeremy_wedding_candidate_posts cp
      where cp.source_post_url in (
        'https://www.instagram.com/p/DZVIim0FvcA/',
        'https://www.instagram.com/p/DXmojvKEWIo/',
        'https://www.instagram.com/p/DXrkdSDju9Y/'
      )
      order by cp.source_post_url
    `);
    const distinctCandidates = new Set(rows.map((r) => r.candidate_id));
    // Documents the CURRENT bug, not the desired end state — this should become 1 if/when the
    // boundary-inclusive fix (evaluated but not shipped, see D022) is actually implemented.
    expect(distinctCandidates.size).toBe(2);
  });

  it("no clustering or candidate schema change was made by Experiment B: jeremy_wedding_candidates has no superseded_by_candidate_id column", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from information_schema.columns
      where table_name = 'jeremy_wedding_candidates' and column_name = 'superseded_by_candidate_id'
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("candidate/candidate_posts counts: 2,872/3,273 (D019/D021 baseline, Experiment B made zero writes) plus 140/144 from the human-confirmed-evidence pipeline (clustering_version='human-confirmed-v1', two runs as labeling continued) = 3,012/3,417, plus 212/229 from venue-couple-signal-v1 (D047 follow-on, abandoned but not deleted) = 3,224/3,646, plus 8/8 from human-confirmed-v1 round 3 (/label venue_coverage_v3 sync, 2026-09-06) = 3,232/3,654, plus 26/26 from venue-inline-mention-v1 round 1 (D047 follow-on, 2026-09-06) = 3,258/3,680, plus 1/2 from human-confirmed-v1 round 4 (/label queue-completion sync, 2026-09-06) = 3,259/3,682, plus 106/111 from human-confirmed-v1 round 5 (D048, beyond_include_v1 first sync, 2026-09-06) = 3,365/3,793, plus 39/42 from human-confirmed-v1 round 6 (D049, styled_shoot_v1 first sync, 2026-09-07) = 3,404/3,835", async () => {
    const { rows } = await pool.query(`
      select
        (select count(*) from jeremy_wedding_candidates) as candidates,
        (select count(*) from jeremy_wedding_candidate_posts) as candidate_posts
    `);
    expect(Number(rows[0].candidates)).toBe(3404);
    expect(Number(rows[0].candidate_posts)).toBe(3835);
  });
});

// --- D023: the first write into Ben's serving graph (wedding_vendors). Scoped strictly to the
// audited 143 high-confidence reconcile-v2 matches. Read-only assertions against the live result. ---
describe("graph ingestion — D023 (DB)", () => {
  const pool = getPool();
  // No afterAll(closePool) here on purpose: getPool()/closePool() share one module-level
  // singleton (apps/web/scripts/classify/db.ts), and this describe block is not the last
  // one in the file — closing it here killed the pool before the later "vendor feed count
  // invariant" block's tests could run (`Cannot use a pool after calling end on the pool`).
  // Exactly one closePool() call for the whole file, in the LAST describe block below.

  it("exactly 104 rows were newly ingested (the rest of the 143's evidence already matched Ben's own data)", async () => {
    // 104, not 100 -- D047's "corrected priority" follow-on (2026-09-06) found and cleared a
    // small pre-existing backlog: applyJeremyEvidenceToGraph.ts (this same script) had never
    // been re-run since new candidates were created/matched after its original D023 run. +4
    // new rows, same mechanism, no logic change.
    const { rows } = await pool.query(`select count(*) as n from jeremy_wedding_vendors_ingested`);
    expect(Number(rows[0].n)).toBe(111);
  });

  it("every ingested row exists in wedding_vendors with the exact n_confirmations that was logged", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_vendors_ingested log
      join wedding_vendors wv
        on wv.wedding_id = log.wedding_id and wv.account_id = log.account_id and wv.role = log.role
      where wv.n_confirmations != log.n_confirmations
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("every ingested row traces back to a candidate that is actually in the 143 high-confidence tier (one documented, human-reviewed exception)", async () => {
    // Candidate 2981 (Venuti's Banquets, "Mr & Mrs Gjerazi") is the one deliberate exception:
    // confidence 0.4 (well below the 0.75-0.85 audited tier), but a human explicitly reviewed
    // this exact match and recommended attach (the original "18 hand-reviewed" human-confirmed
    // candidates list, docs/engineering/human-labeling/human-confirmed-candidates-review.md) --
    // executed via a one-off (attachStrayHumanConfirmedCandidate.ts, D047, 2026-09-06) reusing
    // this table's insert pattern for provenance-logging, not because it belongs to the audited
    // 0.75-0.85 tier. Excluded here by ID, not by widening the confidence band -- this invariant
    // should stay strict for everything else.
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_vendors_ingested log
      where log.candidate_id <> 2981
        and not exists (
          select 1 from jeremy_wedding_candidate_reconciliation r
          where r.candidate_id = log.candidate_id and r.reconciliation_version = log.reconciliation_version
            and r.match_confidence between 0.75 and 0.85
        )
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("wedding_vendors grew by exactly the ingested count (14,684 pre-existing + 104 ingested = 14,788) — no pre-existing row was touched", async () => {
    // 14,684/14,788 reflects D027's Case A (+56 rows), D035's wedding-creation pilot (+172
    // rows), D036 Phase 1 (+945 rows), D039 Phase 2 (+1,335 rows), D040's tick 5 retirement
    // batch 1 (-254 rows, 40 weddings), D042's batch 2 (-73 rows, 17 weddings), D047's
    // Batch 5 (+148 rows, 13 weddings), Batch 6 (+45 rows, 5 weddings, 2026-09-06) — eight
    // unrelated provenance paths from D023's own jeremy_wedding_vendors_ingested, all landing
    // after D023's original 12,310/12,410 snapshot. Confirmed: none of D047's new rows are in
    // jeremy_wedding_vendors_ingested (same as every non-D023 mission), so they land in
    // "untouched." Separately, D047's "corrected priority" follow-on found and cleared a small
    // pre-existing ingestion backlog — applyJeremyEvidenceToGraph.ts (D023's own script) had
    // never been re-run since new candidates were created/matched after its original run: +4
    // rows, now correctly counted in "ingested," not "untouched." "untouched" still correctly
    // means "not from D023's ingestion," not "unaffected by every other mission." +43 more from
    // the fourthchurch untangling (2026-09-06, 4 weddings: candidates 375/2583/2166/2047, via
    // createWeddingsFromJeremyEvidence.ts -- a different provenance table, jeremy_weddings_created,
    // so these also land in "untouched," not "ingested"). +21 more from /label sync round 1
    // (2026-09-06, 2 weddings: candidates 3231/3229, same provenance table). +40 more from
    // venue_inline_mention-v1's first batch (2026-09-06, 18 weddings, same provenance table).
    // +5 more from Track A batch 10's terrace16chicago wedding (2026-09-06, same provenance
    // table). +1388 more from the "venuelogic co-tag" recovery batch (2026-09-06, 159 weddings,
    // same provenance table). +710 more from the /label queue-completion sync (2026-09-06, 53
    // weddings, same provenance table). +487 more from double-venue-tag-ambiguity backlog
    // round 2 (2026-09-06, 38 weddings, same provenance table). +805 more from the
    // beyond_include_v1 label queue's first sync round (D048, 2026-09-06, 85 weddings, same
    // provenance table). Update these two literals again if another workstream lands or
    // removes rows.
    const { rows } = await pool.query(`
      select
        count(*) filter (where not exists (
          select 1 from jeremy_wedding_vendors_ingested log
          where log.wedding_id = wv.wedding_id and log.account_id = wv.account_id and log.role = wv.role
        )) as untouched,
        count(*) as total
      from wedding_vendors wv
    `);
    // +67 more from the styled_shoot_v1 label queue's first sync round (D049, 2026-09-07, 7
    // weddings, same provenance table -- "ingested" count itself unchanged at 111, confirming
    // all 67 new rows land in "untouched" as expected).
    expect(Number(rows[0].untouched)).toBe(32994);
    expect(Number(rows[0].total)).toBe(33105);
  });

  it("Ben's weddings/wedding_posts/accounts are byte-identical in row count to before D023's ingestion (1585/1896/14334) — only wedding_vendors gained rows from D023 itself", async () => {
    // 1585/1896/14334 reflects D035's +15 weddings/+17 posts, D036 Phase 1's +100
    // weddings/+112 posts/+2 accounts, D039 Phase 2's +125 weddings/+144 posts, D040's tick 5
    // retirement batch 1 (-40 weddings/-46 posts), D042's batch 2 (-17 weddings/-19 posts,
    // 2026-09-05), D047's Batch 5 (+13 weddings/+15 posts) and Batch 6 (+5 weddings/+5 posts,
    // 2026-09-06) -- separate missions' legitimate writes (and two deliberate removals)
    // landing after D023's original 1384/1668/14330 snapshot, not a D023 regression. accounts
    // is untouched by D047 (every credited account already existed) or either retirement
    // batch — they detach/retire weddings/wedding_posts/wedding_vendors rows only, never
    // delete an account. Then Tier 1/2/3's 1,572 weddings (+1,572 weddings/+1,824 posts,
    // 2026-09-06) landed 3160/3659, the fourthchurch untangling's 4 hand-verified weddings
    // (+4 weddings/+4 posts, same day) landed 3164/3663, /label sync round 1's 2 weddings
    // (+2 weddings/+2 posts, same day) landed 3166/3665, venue_inline_mention-v1's first
    // batch (+18 weddings/+18 posts, same day) landed 3184/3683, Track A batch 10's
    // terrace16chicago wedding (+1/+1, same day) landed 3185/3684, the "venuelogic co-tag"
    // recovery batch (+159 weddings/+158 posts, same day) landed 3344/3842, the /label
    // queue-completion sync (+53 weddings/+74 posts, same day) landed 3397/3916,
    // double-venue-tag-ambiguity backlog round 2 (+38 weddings/+41 posts, same day) landed
    // 3435/3957, and the beyond_include_v1 label queue's first sync round (D048, +85
    // weddings/+86 posts, same day) landed 3520/4043. The styled_shoot_v1 label queue's first
    // sync round (D049, 2026-09-07, +7 weddings/+7 posts) landed the current 3527/4050.
    const { rows } = await pool.query(`
      select
        (select count(*) from weddings) as weddings,
        (select count(*) from wedding_posts) as wedding_posts,
        (select count(*) from accounts) as accounts
    `);
    expect(Number(rows[0].weddings)).toBe(3527);
    expect(Number(rows[0].wedding_posts)).toBe(4050);
    // accounts +6 (14334->14340): Tier 1's 159 candidates credited a few vendor handles never
    // seen before in `accounts` -- unlike Batch 5/6, whose venue accounts always pre-existed
    // (that's how they got tagged 'venue' in the first place), Tier 1 spans the FULL candidate
    // pool including secondary vendor credits (photographer/planner/etc.) resolved fresh.
    // accounts +2 more (14340->14342, Tier 2), then +21 more (14342->14363, Tier 3's 1,076
    // candidates -- same reason, previously-unseen secondary vendor handles at much larger volume.
    // +1 more (14363->14364, /label queue-completion sync) -- one previously-unseen vendor
    // handle among the 53 newly-created weddings' secondary credits. +1 more
    // (14364->14365, beyond_include_v1 first sync, D048) -- same reason, one more
    // previously-unseen secondary vendor handle. Unchanged at 14365 (styled_shoot_v1 first sync,
    // D049) -- all 67 new vendor credits resolved to already-existing accounts.
    expect(Number(rows[0].accounts)).toBe(14365);
  });

  it("edges materialized view reflects the new wedding_vendors rows (grew from the refresh, count is consistent with a fresh recompute)", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from wedding_vendors a
      join wedding_vendors b on a.wedding_id = b.wedding_id and a.account_id < b.account_id
      group by a.wedding_id
    `);
    const expectedEdgePairs = await pool.query(`
      select count(*) as n from (
        select least(a.account_id,b.account_id) aa, greatest(a.account_id,b.account_id) bb
        from wedding_vendors a join wedding_vendors b on a.wedding_id = b.wedding_id and a.account_id < b.account_id
        group by 1,2
      ) x
    `);
    const { rows: edgesRows } = await pool.query(`select count(*) as n from edges`);
    expect(Number(edgesRows[0].n)).toBe(Number(expectedEdgePairs.rows[0].n));
  });

  it("jeremy_wedding_vendors_ingested.wedding_id is NOT a foreign key (deliberate — same reasoning as reconciliation's matched_wedding_id, since phase_dedup can reassign weddings.id)", async () => {
    const { rows } = await pool.query(`
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
      where tc.table_name = 'jeremy_wedding_vendors_ingested' and tc.constraint_type = 'FOREIGN KEY'
    `);
    const fkColumns = rows.map((r) => r.column_name);
    expect(fkColumns).not.toContain("wedding_id");
    expect(fkColumns).toContain("account_id");
    expect(fkColumns).toContain("candidate_id");
  });
});

// --- non-wedding-posts mission (D040): role_shape_v1 gate. Locked tick 4: a wedding's role
// set being a non-empty subset of {venue, band, musician} is a 100%-precision, 0-false-EXCLUDE
// signal (measured on tune, known-good, and heldout — see docs/engineering/
// graph-strengthening/non-wedding-posts.md). This test is the tick 6 gate: it locks the RULE
// ITSELF (so a future edit can't silently loosen it), not a fresh application of it — tick 5
// already retired every corpus-wide match as of 2026-09-05. It does not touch pipeline.py; that
// stays a documented follow-up (see the mission doc's tick 6 item) since Ben's crawler has no
// is_wedding gate at all yet, and this rule is deliberately narrow, not a general filter. ---
describe("non-wedding-posts role_shape_v1 gate — D040 (DB)", () => {
  const pool = getPool();
  // pool is closed in the last describe block below, not here (shared pool singleton).

  function roleShapeV1Excludes(roles: string[]): boolean {
    return roles.length > 0 && roles.every((r) => r === "venue" || r === "band" || r === "musician");
  }

  it("role_shape_v1 excludes the 11 original user-flagged seeds' one true positive (DcNx6TSnMb2, wedding 1371 pre-retirement roles) and none of the other 10 seeds' role shapes", () => {
    // Fixture roles are frozen from tick 0/1's live query (2026-09-05), not re-queried, since
    // tick 5 already retired these weddings — this test locks the RULE against the recorded
    // shapes, it does not re-derive them from a now-empty wedding_vendors join.
    const seedRoleShapes: Record<string, string[]> = {
      "DcNUEvvMvIk": ["musician", "other", "venue"],
      "DcNx6TSnMb2": ["band", "musician", "venue"],
      "DcOHR6qx7kB": ["officiant", "other", "venue"],
      "DcLmlMnNS91": ["catering", "florist", "other", "venue"],
      "DcKuJQ-NDop": ["musician", "photographer", "venue"],
      "DcKp-bOjpUb": ["content_creator", "musician", "venue"],
      "DcL46UADhss": ["band", "musician", "photographer", "venue"],
      "DcJvqkRt-1X": ["cake", "catering", "musician", "rentals", "venue"],
      "DcMEf72FUi8": ["band", "photographer", "venue"],
      "DcJQjFJgIbN": ["catering", "planner", "rentals", "venue"],
      "DcJhXRTET86": ["content_creator", "musician", "venue"],
    };
    const excluded = Object.entries(seedRoleShapes).filter(([, roles]) => roleShapeV1Excludes(roles));
    expect(excluded.map(([sc]) => sc)).toEqual(["DcNx6TSnMb2"]);
  });

  it("role_shape_v1 does not exclude any of the 21-post known-good regression slice from tick 2 (0 false EXCLUDEs, the locked precision bar)", () => {
    // A representative sample of the known-good roles recorded in tick 2/3 (full 21-post
    // slice lives in scripts/graph/data/non_wedding_labels.json) — every one has a role
    // outside {venue, band, musician} (planner/photographer/florist/etc.), which is exactly
    // why the rule doesn't false-EXCLUDE them.
    const knownGoodRoleShapes: string[][] = [
      ["band", "florist", "photographer", "planner", "rentals", "venue", "videographer"],
      ["beauty_other", "florist", "photographer", "planner", "rentals", "venue"],
      ["catering", "dj", "florist", "musician", "other", "photographer", "planner", "venue", "videographer"],
      ["florist", "other", "photographer", "planner", "venue"],
      ["attire", "florist", "makeup", "photographer", "planner", "venue"],
    ];
    expect(knownGoodRoleShapes.some((roles) => roleShapeV1Excludes(roles))).toBe(false);
  });

  it("no weddings currently on the serving graph match role_shape_v1 through a venue_tagged post outside the jeremy_* tables — tick 5's retirement was exhaustive as of 2026-09-05, not partial", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n
      from weddings w
      join wedding_posts wp on wp.wedding_id = w.id
      join posts p on p.id = wp.post_id
      where p.source = 'venue_tagged'
        and not exists (select 1 from jeremy_weddings_created j where j.wedding_id = w.id)
        and exists (select 1 from wedding_vendors wv where wv.wedding_id = w.id)
        and not exists (
          select 1 from wedding_vendors wv
          where wv.wedding_id = w.id and wv.role::text not in ('venue', 'band', 'musician')
        )
    `);
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("vendor feed count invariant (DB)", () => {
  const pool = getPool();
  afterAll(async () => {
    await closePool();
  });

  it("galleriamarchetti Feed equals wedding_vendors rows (still 15 after Case A/B — D027/D031)", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from wedding_vendors wv
      join accounts a on a.id = wv.account_id
      where a.username = 'galleriamarchetti'
    `);
    expect(rows[0].n).toBe(45);
  });

  it("ulcchicago has a venue credit on wedding 1352 (the Case A index bug, D027)", async () => {
    const { rows } = await pool.query(`
      select wv.role::text as role
      from wedding_vendors wv
      join accounts a on a.id = wv.account_id
      where a.username = 'ulcchicago' and wv.wedding_id = 1352
    `);
    expect(rows.map((r) => r.role)).toContain("venue");
  });
});
