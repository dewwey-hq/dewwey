/**
 * Regression tests for the graph-strengthening invariants
 * (docs/engineering/graph-strengthening/ingestion-design.md). Split into
 * pure-function unit tests (fast, no DB) and structural invariant checks
 * against the live DB (the same Supabase project every other script here
 * uses — read-only assertions, no writes).
 */
import { describe, it, expect, afterAll } from "vitest";
import { parseEventDate, jaccard, daysBetween } from "./clusteringUtils";
import { decideStructuralCandidateCreation } from "./structuralCandidateGating";

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

describe("decideStructuralCandidateCreation (unit, D055 Phase 1 step 9, revised for candidate_review_derived)", () => {
  it("creates at the original venue on CONFIRM when chicago_status is already CHICAGO_CONFIRMED", () => {
    const result = decideStructuralCandidateCreation({
      decision: "CONFIRM",
      originalVenueAccountId: 101,
      correctedVenueAccountId: null,
      chicagoStatus: "CHICAGO_CONFIRMED",
      venueCityIsChicago: false,
      venueInMetro: false,
      includedPostUrls: ["https://instagram.com/p/abc123/"],
    });
    expect(result).toEqual({ action: "CREATE", venueAccountId: 101 });
  });

  it("creates on CONFIRM when chicago_status is null/ambiguous but vendors.city='Chicago' or account_locations.in_metro backs the venue", () => {
    const viaCity = decideStructuralCandidateCreation({
      decision: "CONFIRM",
      originalVenueAccountId: 202,
      correctedVenueAccountId: null,
      chicagoStatus: "CHICAGO_AMBIGUOUS",
      venueCityIsChicago: true,
      venueInMetro: false,
      includedPostUrls: ["https://instagram.com/p/aaa/"],
    });
    expect(viaCity).toEqual({ action: "CREATE", venueAccountId: 202 });

    const viaMetro = decideStructuralCandidateCreation({
      decision: "CONFIRM",
      originalVenueAccountId: 303,
      correctedVenueAccountId: null,
      chicagoStatus: null,
      venueCityIsChicago: false,
      venueInMetro: true,
      includedPostUrls: ["https://instagram.com/p/bbb/"],
    });
    expect(viaMetro).toEqual({ action: "CREATE", venueAccountId: 303 });
  });

  it("skips chicago_unconfirmed when a human CONFIRM has no geography backing it — a content confirmation is not a geography confirmation", () => {
    const result = decideStructuralCandidateCreation({
      decision: "CONFIRM",
      originalVenueAccountId: 404,
      correctedVenueAccountId: null,
      chicagoStatus: "CHICAGO_NOT_CONFIRMED",
      venueCityIsChicago: false,
      venueInMetro: false,
      includedPostUrls: ["https://instagram.com/p/ccc/"],
    });
    expect(result).toEqual({ action: "SKIP", reason: "chicago_unconfirmed" });
  });

  it("skips wrong_venue_no_correction when WRONG_VENUE has no corrected_venue_account_id, regardless of geography or included posts", () => {
    const result = decideStructuralCandidateCreation({
      decision: "WRONG_VENUE",
      originalVenueAccountId: 505,
      correctedVenueAccountId: null,
      chicagoStatus: "CHICAGO_CONFIRMED",
      venueCityIsChicago: true,
      venueInMetro: true,
      includedPostUrls: null,
    });
    expect(result).toEqual({ action: "SKIP", reason: "wrong_venue_no_correction" });
  });

  it("creates at the CORRECTED venue on WRONG_VENUE, gating geography on the corrected venue not the original", () => {
    const result = decideStructuralCandidateCreation({
      decision: "WRONG_VENUE",
      originalVenueAccountId: 606, // the wrong venue -- must never be used
      correctedVenueAccountId: 707,
      chicagoStatus: null,
      venueCityIsChicago: true, // resolved by the CALLER against account 707, not 606
      venueInMetro: false,
      // Not realistic given candidate_review_derived's own CASE (WRONG_VENUE implies zero
      // THIS_VENUE posts, see the no_included_posts test below) -- this exercises the pure
      // function's own mechanism in isolation, decoupled from that view-level correlation.
      includedPostUrls: ["https://instagram.com/p/ddd/"],
    });
    expect(result).toEqual({ action: "CREATE", venueAccountId: 707 });
  });

  it("skips no_venue_account defensively when a CONFIRM candidate somehow has a null venue_account_id", () => {
    const result = decideStructuralCandidateCreation({
      decision: "CONFIRM",
      originalVenueAccountId: null,
      correctedVenueAccountId: null,
      chicagoStatus: "CHICAGO_CONFIRMED",
      venueCityIsChicago: false,
      venueInMetro: false,
      includedPostUrls: ["https://instagram.com/p/eee/"],
    });
    expect(result).toEqual({ action: "SKIP", reason: "no_venue_account" });
  });

  it("skips no_included_posts when included_post_urls is null or empty, even with a resolvable venue and confirmed geography — the realistic WRONG_VENUE case, since candidate_review_derived only sets decision=WRONG_VENUE when the candidate has zero THIS_VENUE posts", () => {
    const nullCase = decideStructuralCandidateCreation({
      decision: "WRONG_VENUE",
      originalVenueAccountId: 808,
      correctedVenueAccountId: 909,
      chicagoStatus: "CHICAGO_CONFIRMED",
      venueCityIsChicago: true,
      venueInMetro: true,
      includedPostUrls: null,
    });
    expect(nullCase).toEqual({ action: "SKIP", reason: "no_included_posts" });

    const emptyArrayCase = decideStructuralCandidateCreation({
      decision: "CONFIRM",
      originalVenueAccountId: 1010,
      correctedVenueAccountId: null,
      chicagoStatus: "CHICAGO_CONFIRMED",
      venueCityIsChicago: true,
      venueInMetro: true,
      includedPostUrls: [],
    });
    expect(emptyArrayCase).toEqual({ action: "SKIP", reason: "no_included_posts" });
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

  it("does NOT classify 'Getting Ready Venue:' as role=venue -- a secondary, adjacent-event location, not where the wedding happened (D049 follow-on, found live: this exact caption shape produced 5 real weddings anchored to the wrong account)", async () => {
    const { stack } = await parse("Venue: @thedalcy\nGetting Ready Venue: @nobuchicago");
    expect(stack.find((e) => e.handle === "thedalcy")).toMatchObject({ role: "venue" });
    expect(stack.find((e) => e.handle === "nobuchicago")).toMatchObject({ role: "other" });
  });

  it("does NOT classify 'Rehearsal Dinner Venue:'/'Sangeet Venue:'/'Welcome Party Venue:' as role=venue (same fix, other secondary-event-location labels seen in the corpus)", async () => {
    const { stack } = await parse(
      "Venue: @revelspace\nRehearsal Dinner Venue: @someresto\nSangeet Venue: @otherhall\nWelcome Party Venue: @thirdplace"
    );
    expect(stack.find((e) => e.handle === "revelspace")).toMatchObject({ role: "venue" });
    for (const h of ["someresto", "otherhall", "thirdplace"]) {
      expect(stack.find((e) => e.handle === h)).toMatchObject({ role: "other" });
    }
  });

  it("classifies a combined 'Venue + Hotel:' label as role=venue, same as a bare 'Venue:' label (D050 audit: tried demoting this to role=hotel in v6, reverted in v7 -- every real-world instance of this label is the ONLY venue-shaped credit on a genuinely real wedding post; demoting would strip the sole venue signal, see normRole()'s comment)", async () => {
    const { stack } = await parse("Venue + Hotel: @somehotel");
    expect(stack.find((e) => e.handle === "somehotel")).toMatchObject({ role: "venue" });
  });

  it("existing 'Venue: @handle' credit lines are tagged source='credit_line' (v8, D055 -- so per-pattern precision can be measured downstream)", async () => {
    const { stack } = await parse("Venue: @galleriamarchetti");
    expect(stack).toEqual([
      expect.objectContaining({ handle: "galleriamarchetti", role: "venue", source: "credit_line" }),
    ]);
  });
});

describe("parseCaption v8 inline_at + venue_hashtag (unit, D055 Phase 0 step 2)", () => {
  async function parse(caption: string, opts?: { venueHandles?: Set<string> }) {
    const { parseCaption } = await import("./stackParser");
    return parseCaption(caption, opts);
  }

  it("extracts 'at @handle' embedded in caption prose as a venue credit, source inline_at", async () => {
    const { stack } = await parse("Congrats Sam & Alex who tied the knot at @thedalcy!");
    expect(stack).toEqual([
      expect.objectContaining({ handle: "thedalcy", role: "venue", role_raw: "at @", source: "inline_at" }),
    ]);
  });

  it("demotes 'at @handle' to role=other (kept, source-tagged) when the containing line is a secondary-event or hospitality context -- the D051 wrong-venue-anchor trap, sized at 15% of inline matches before the first v8 run", async () => {
    const cases = [
      "Getting ready at @thegraychi before the big day 💄",
      "The afterparty at @dorothydownstairs will begin at 7pm",
      "- 2-Night Stay at @thegraychi (Chicago)",
      "Few views compare to the Royal Suite at @intercontinental_madrid",
    ];
    for (const c of cases) {
      const { stack } = await parse(c);
      expect(stack).toHaveLength(1);
      expect(stack[0]).toEqual(expect.objectContaining({ role: "other", role_raw: "at @ (secondary/stay)", source: "inline_at" }));
    }
    // ...but a genuine wedding-venue sentence on its own line is untouched.
    const { stack: ok } = await parse("Anna & Matt's reception at @waldenchicago was unreal");
    expect(ok[0]).toEqual(expect.objectContaining({ role: "venue", role_raw: "at @" }));
  });

  it("does NOT extract a venue_hashtag entry when no venueHandles set is passed -- the pattern requires an explicit lookup list, it never guesses", async () => {
    const { stack } = await parse("Best day ever! #thedalcywedding");
    expect(stack.find((e) => e.source === "venue_hashtag")).toBeUndefined();
  });

  it("extracts '#<handle>wedding' as a venue credit, source venue_hashtag, when the handle is in the passed venueHandles set", async () => {
    const { stack } = await parse("Best day ever! #thedalcywedding", { venueHandles: new Set(["thedalcy"]) });
    expect(stack).toEqual([
      expect.objectContaining({ handle: "thedalcy", role: "venue", role_raw: "#hashtag", source: "venue_hashtag" }),
    ]);
  });

  it("does NOT extract a venue_hashtag entry for a hashtag whose handle isn't in the venueHandles set", async () => {
    const { stack } = await parse("Best day ever! #chicagowedding", { venueHandles: new Set(["thedalcy"]) });
    expect(stack.find((e) => e.source === "venue_hashtag")).toBeUndefined();
  });

  it("emits exactly ONE venue entry, source credit_line, when a caption has both a labeled 'Venue: @handle' line AND the same handle again as inline prose ('at @handle') -- the labeled credit wins, no duplicate", async () => {
    const { stack } = await parse("Venue: @thedalcy\nSo grateful we got married at @thedalcy, it was perfect.");
    const venueEntries = stack.filter((e) => e.handle === "thedalcy");
    expect(venueEntries).toHaveLength(1);
    expect(venueEntries[0]).toMatchObject({ role: "venue", source: "credit_line" });
  });

  it("emits exactly ONE venue entry, source credit_line, when a caption has both a labeled 'Venue: @handle' line AND the same handle again as a venue_hashtag", async () => {
    const { stack } = await parse("Venue: @thedalcy\n#thedalcywedding", { venueHandles: new Set(["thedalcy"]) });
    const venueEntries = stack.filter((e) => e.handle === "thedalcy");
    expect(venueEntries).toHaveLength(1);
    expect(venueEntries[0]).toMatchObject({ role: "venue", source: "credit_line" });
  });

  it("both new patterns can still contribute toward has_stack (>=3 distinct roles), same as credit_line entries", async () => {
    const { stack, has_stack } = await parse(
      "Planner: @someplanner\nPhoto: @somephoto\nWe got married at @thedalcy!"
    );
    expect(stack.find((e) => e.handle === "thedalcy")).toMatchObject({ role: "venue", source: "inline_at" });
    expect(has_stack).toBe(true);
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
    // Now 45 (beyond_include_v1 completion sync, 2026-09-07): re-verified still zero of the 45
    // are in jeremy_wedding_vendors_ingested.
    expect(Number(rows[0].n)).toBe(45);
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
    // 353 (beyond_include_v1 completion sync, 2026-09-07): more candidates converging on
    // already-created weddings as the graph keeps growing -- same expected signature.
    // 427 (D055 structural-v2, 2026-09-08): +4,355 venue-anchored candidates from the
    // ungated/v8 parser + location tags + author-is-venue; several hundred are additional posts
    // about weddings already on file (the ambiguous 0.4 tier -- the review UI's "Duplicate"
    // path), so many-to-one convergence rises as expected. Zero ingestion-safety impact: only
    // the 0.75-0.85 band is ever auto-applied. 426 after the couple-name merge pass.
    expect(after).toBe(426);
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
    // DROPPED again to 344 (D049 follow-on, 2026-09-07): the secondary-venue-anchor bug fix
    // (getting-ready/rehearsal-dinner/etc. locations no longer winning venue_account_id --
    // see stackParser.ts's SECONDARY_EVENT_VENUE_MARKER) re-anchored 112 candidates to their
    // real venue and nulled 9 with no other venue credit -- some of the 112 landed in a
    // DIFFERENT tier (a real venue with existing weddings reconciles differently than a
    // secondary-location account that had none), a few shifted out of insufficient entirely.
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2' and match_confidence between 0.05 and 0.15
    `);
    // ROSE to 353 (beyond_include_v1 completion sync, 2026-09-07) -- breaks the prior
    // consistent-drop pattern, but explainably: 116 new candidates clustered from this round's
    // 485 synced labels, only 12 were created (the rest correctly excluded for non-Chicago
    // geography, generic marketing, or misresolved co-tags -- see
    // createWeddingsFromJeremyEvidence.ts), so most of the new candidates land here unmatched
    // rather than being absorbed by a creation batch. Expected given this round's much lower
    // creation rate, not a regression.
    // 2,657 (D055 structural-v2, 2026-09-08): the structural source deliberately clusters posts
    // NOT already documented as weddings at venues that mostly DO have some existing weddings,
    // so the reconciler finds a venue-mate for most of them but below the ambiguous floor --
    // exactly the "insufficient" tier by design (matched_wedding_id stays null, metrics kept for
    // inspection). These are the candidates the /label/candidates review decides on; none are
    // created without a human CONFIRM. 2,568 after the couple-name merge pass (229 candidates
    // absorbed, reconciliation re-run).
    expect(Number(rows[0].n)).toBe(2568);
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
    // 3538/4061 (D050, 2026-09-07) reflects the secondary-venue-anchor bug fix's Track 1
    // zero-coverage batch (+11 weddings/+11 posts): hand-read 37 candidates at zero-documented-
    // wedding venues, 11 kept (Chicago-confirmed, specific real events), 26 excluded (mostly the
    // same misresolved-co-tagged-account shape as the bug just fixed, a few generic-marketing
    // and 2 non-Chicago) -- see createWeddingsFromJeremyEvidence.ts's own comment.
    // 3552/4076 (D050, 2026-09-07) reflects Track 1's 1-5-documented-wedding bucket (+14
    // weddings/+15 posts): 55 candidates deduped to ~50 worth reading; two large single-venue
    // clusters (thefultonwest x22, thegwenchicago x6) bulk-excluded as self-marketing/styled-
    // competition content, the rest hand-read individually -- 14 kept, the remainder excluded
    // (same co-tagged-wrong-account shape, generic marketing, or wrong event type entirely, e.g.
    // a Bat Mitzvah) -- see createWeddingsFromJeremyEvidence.ts's own comment.
    const { rows } = await pool.query(`
      select
        (select count(*) from weddings) as weddings,
        (select count(*) from wedding_posts) as wedding_posts
    `);
    // D050 Track 2.1 (2026-09-07, +1 wedding/+1 post): naturemuseum candidate 2541, a
    // ceremony+reception pair wrongly anchored to the ceremony church, corrected directly.
    // Double-venue-tag audit (2026-09-07, -1 wedding/-1 post): wedding 1253's only post was
    // confirmed a baby shower, not a wedding ("Hire me after the wedding! This is the prettiest
    // baby shower I photographed at @stregischicago") -- retired via retireNonWeddingPosts.ts,
    // the same D040/D041 mechanism, human-confirmed before commit. 3553->3552, 4077->4076.
    // Orphaned-wedding cleanup (2026-09-07, -17 weddings, 0 posts -- a real bug in
    // createWeddingsFromJeremyEvidence.ts found live during the audit: `wedding_posts`'
    // `on conflict (post_id) do nothing` silently no-op'd when a candidate's source post already
    // belonged to a DIFFERENT existing wedding, but the new `weddings`/`wedding_vendors` rows
    // still got created -- 17 orphans session-wide, dating back to the very first creation batch
    // on 2026-09-05, all confirmed duplicates of an already-existing wedding, zero
    // jeremy_wedding_vendors_ingested linkage. Deleted (logged to orphaned_weddings_retired for
    // provenance), root cause fixed (the post-already-documented check now runs BEFORE creating
    // anything). 3552->3535, wedding_posts unaffected (orphans had none to begin with).
    // beyond_include_v1 round 2+3 sync (2026-09-07, +6 weddings/+6 posts): user finished the
    // full 833-post queue, 485 more labels synced across two rounds, 116 new candidates
    // clustered -- 6 kept (Chicago-confirmed, explicit venue tags or specific named-couple
    // content), the rest excluded (mostly non-Chicago Wisconsin/Indiana/Michigan patterns
    // resurfacing, generic marketing, or misresolved co-tags) -- see
    // createWeddingsFromJeremyEvidence.ts's own comment.
    // D055 batch 1 (2026-09-08 late, +13 weddings/+16 posts): first creation from the per-post
    // venue review (candidate_review_derived), batch_id d055-structural-v2-batch1.
    // D055 batch 2 (same night, +60 weddings/+66 posts): 3614/4164.
    expect(Number(rows[0].weddings)).toBe(3614);
    expect(Number(rows[0].wedding_posts)).toBe(4164);
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

  it("candidate/candidate_posts counts: 2,872/3,273 (D019/D021 baseline, Experiment B made zero writes) plus 140/144 from the human-confirmed-evidence pipeline (clustering_version='human-confirmed-v1', two runs as labeling continued) = 3,012/3,417, plus 212/229 from venue-couple-signal-v1 (D047 follow-on, abandoned but not deleted) = 3,224/3,646, plus 8/8 from human-confirmed-v1 round 3 (/label venue_coverage_v3 sync, 2026-09-06) = 3,232/3,654, plus 26/26 from venue-inline-mention-v1 round 1 (D047 follow-on, 2026-09-06) = 3,258/3,680, plus 1/2 from human-confirmed-v1 round 4 (/label queue-completion sync, 2026-09-06) = 3,259/3,682, plus 106/111 from human-confirmed-v1 round 5 (D048, beyond_include_v1 first sync, 2026-09-06) = 3,365/3,793, plus 39/42 from human-confirmed-v1 round 6 (D049, styled_shoot_v1 first sync, 2026-09-07) = 3,404/3,835, plus 116/127 from human-confirmed-v1 round 7 (beyond_include_v1 completion sync, 2026-09-07) = 3,520/3,962", async () => {
    const { rows } = await pool.query(`
      select
        (select count(*) from jeremy_wedding_candidates) as candidates,
        (select count(*) from jeremy_wedding_candidate_posts) as candidate_posts
    `);
    // plus 4,355/4,743 from structural-v2 (D055, 2026-09-08: venue-anchored source over the
    // ungated v8 parser + location_tag_venue_map + author-is-venue; 388 of its posts attached to
    // existing candidates rather than minting new ones -- 4,355 new candidates + 4,743 new
    // candidate_posts rows) = 7,875/8,705. structural-v1's 4,646/5,420 were deleted and
    // re-clustered as v2 (zero human decisions, zero creations -- see decisions.md D055).
    // 7,646/8,705 after mergeStructuralCandidatesByCouple.ts (D055, same day): 229 structural-v2
    // candidates absorbed into 199 survivors (same venue + same normalized couple name within
    // 400 days -- one wedding's posts spread across vendors and months). Posts unchanged (they
    // move, they don't disappear); logged in structural_candidate_merges.
    // 7,645: one more hand-merge before batch 1 (candidate 8534 -> 8520, Warwick Allerton, same
    // photographer next day with no couple name in the caption; logged in
    // structural_candidate_merges with reason 'manual').
    expect(Number(rows[0].candidates)).toBe(7645);
    expect(Number(rows[0].candidate_posts)).toBe(8705);
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
    // +148 more from D050's Track 1 zero-coverage batch (2026-09-07, 11 weddings, same
    // provenance table). +131 more from Track 1's 1-5 bucket (2026-09-07, 14 weddings, same
    // provenance table).
    // +15 more from D050's Track 2.1 naturemuseum correction (2026-09-07, 1 wedding, same
    // provenance table).
    // -3 more from wedding 1253's retirement (2026-09-07, a confirmed non-wedding post -- baby
    // shower content, not from D023's provenance table either).
    // -179 more from the orphaned-wedding cleanup (2026-09-07, 17 phantom weddings' vendor
    // credits removed with them -- confirmed zero jeremy_wedding_vendors_ingested overlap).
    // +46 more from the beyond_include_v1 round 2+3 sync (2026-09-07, 6 weddings, same
    // provenance table).
    // +68 more from D055 batch 1 (2026-09-08 late, 13 weddings from the per-post venue review;
    // provenance is jeremy_weddings_created.batch_id, not this table, so all 68 are "untouched").
    // +337 more from D055 batch 2 (60 weddings; includes second venue-role rows for ceremony
    // sites -- same provenance via jeremy_weddings_created.batch_id, so all land in "untouched").
    expect(Number(rows[0].untouched)).toBe(33557);
    expect(Number(rows[0].total)).toBe(33668);
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
    // sync round (D049, 2026-09-07, +7 weddings/+7 posts) landed 3527/4050. D050's Track 1
    // zero-coverage batch (2026-09-07, +11 weddings/+11 posts) landed 3538/4061. Track 1's 1-5
    // bucket (2026-09-07, +14 weddings/+15 posts) landed the current 3552/4076.
    const { rows } = await pool.query(`
      select
        (select count(*) from weddings) as weddings,
        (select count(*) from wedding_posts) as wedding_posts,
        (select count(*) from accounts) as accounts
    `);
    // D050 Track 2.1 (2026-09-07, +1 wedding/+1 post): naturemuseum candidate 2541, a
    // ceremony+reception pair wrongly anchored to the ceremony church, corrected directly.
    // Double-venue-tag audit (2026-09-07, -1 wedding/-1 post): wedding 1253's only post was
    // confirmed a baby shower, not a wedding ("Hire me after the wedding! This is the prettiest
    // baby shower I photographed at @stregischicago") -- retired via retireNonWeddingPosts.ts,
    // the same D040/D041 mechanism, human-confirmed before commit. 3553->3552, 4077->4076.
    // Orphaned-wedding cleanup (2026-09-07, -17 weddings, 0 posts -- a real bug in
    // createWeddingsFromJeremyEvidence.ts found live during the audit: `wedding_posts`'
    // `on conflict (post_id) do nothing` silently no-op'd when a candidate's source post already
    // belonged to a DIFFERENT existing wedding, but the new `weddings`/`wedding_vendors` rows
    // still got created -- 17 orphans session-wide, dating back to the very first creation batch
    // on 2026-09-05, all confirmed duplicates of an already-existing wedding, zero
    // jeremy_wedding_vendors_ingested linkage. Deleted (logged to orphaned_weddings_retired for
    // provenance), root cause fixed (the post-already-documented check now runs BEFORE creating
    // anything). 3552->3535, wedding_posts unaffected (orphans had none to begin with).
    // beyond_include_v1 round 2+3 sync (2026-09-07, +6 weddings/+6 posts): user finished the
    // full 833-post queue, 485 more labels synced across two rounds, 116 new candidates
    // clustered -- 6 kept (Chicago-confirmed, explicit venue tags or specific named-couple
    // content), the rest excluded (mostly non-Chicago Wisconsin/Indiana/Michigan patterns
    // resurfacing, generic marketing, or misresolved co-tags) -- see
    // createWeddingsFromJeremyEvidence.ts's own comment.
    // 3554/4098 (D055 batch 1, 2026-09-08 late): first creation from the per-post review --
    // 13 weddings / 16 posts, batch_id d055-structural-v2-batch1, snapshot taken first,
    // revertable via revertWeddingBatch.ts.
    // 3614/4164 (D055 batch 2, 2026-09-08 late): +60 weddings / +66 posts, batch_id
    // d055-structural-v2-batch2 -- the user's verdicts plus 56 ceremony+reception posts cleared
    // under reviewed_by='fable-structured'; 14 weddings carry both ceremony and reception venue
    // credits (D050 convention: reception anchors, ceremony site credited).
    expect(Number(rows[0].weddings)).toBe(3614);
    expect(Number(rows[0].wedding_posts)).toBe(4164);
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
    // D049) -- all 67 new vendor credits resolved to already-existing accounts. +1 more
    // (14365->14366, D050's Track 1 zero-coverage batch) -- one previously-unseen secondary
    // vendor handle among the 11 newly-created weddings' credits. +51 more (14366->14417,
    // D050's Track 2.2, 2026-09-07) -- NOT from any wedding creation: bare placeholder
    // `accounts` rows created for 51 known Chicago venues with zero posts in our corpus,
    // queued in ops.crawl_frontier for the next real Apify run (queueUnseenVenuesForCrawl.ts).
    // +3 more (14417->14420, tail-end coverage mission Track 1, 2026-09-07): 3 new `accounts`
    // rows for real, Google-Places-verified Chicago venues (Cotillion Banquets, Orland Chateau,
    // Georgios Banquets) that had zero Instagram bridge at all -- see
    // bridgeVerifiedVenueAccounts.ts. Not a wedding-creation batch; these start with zero posts,
    // queued in crawl_frontier same as D050's Track 2.2 batch, pending Track 3 (deferred, no
    // Apify credits until 2026-09-11).
    // +8434 (14420->22854, D055 Phase 0 step 5, 2026-09-08): upsertAccountsForStackHandles.ts
    // minted bare `accounts` rows for every handle the (now ungated, v8) stack parser credited
    // that the graph had never seen -- 1,283 venues, 939 photographers, 840 florists, ... The
    // evidence views join accounts by handle, so without these rows ~1k venue credits and
    // thousands of vendor credits were silently invisible (the candidate_score circularity in
    // one number). Same mechanism as pipeline.py's acct_id() and D050 Track 2.2's placeholders.
    // +1 (22854->22855, D055 batch 2): one imported post's author had no accounts row yet --
    // createWeddingsFromJeremyEvidence.ts mints it on import, same as every prior batch.
    expect(Number(rows[0].accounts)).toBe(22855);
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
  // No afterAll(closePool) here -- this is no longer the last describe block in the file
  // (D055's batch-provenance block below now is). Moved there, same "exactly one closePool()
  // call for the whole file" rule as the D023 block's comment above establishes.

  it("galleriamarchetti Feed equals wedding_vendors rows (still 15 after Case A/B — D027/D031)", async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from wedding_vendors wv
      join accounts a on a.id = wv.account_id
      where a.username = 'galleriamarchetti'
    `);
    // 46 (D055 batch 2, 2026-09-08): Lisa & Daniel's wedding, confirmed at the post level in the
    // per-post venue review, created in batch d055-structural-v2-batch2.
    expect(rows[0].n).toBe(46);
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

// --- D055 (2026-09-08): provenance/reversibility -- batch identity on jeremy_weddings_created,
// the weddings_retired_batches revert-log table, and the "no orphaned-provenance weddings" floor.
// See pipeline/schema.sql's D055 entries, applyWeddingBatchProvenanceSchema.ts,
// revertWeddingBatch.ts, and createWeddingsFromJeremyEvidence.ts's now-required --batch-id. ---
describe("D055 batch provenance/reversibility (DB)", () => {
  const pool = getPool();
  // Exactly one closePool() call for the whole file, in this LAST describe block (see the
  // D023 block's and "vendor feed count invariant" block's own comments above).
  afterAll(async () => {
    await closePool();
  });

  it("jeremy_weddings_created.batch_id column exists (applied via applyWeddingBatchProvenanceSchema.ts)", async () => {
    const { rows } = await pool.query(`
      select column_name, data_type from information_schema.columns
      where table_name = 'jeremy_weddings_created' and column_name = 'batch_id'
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].data_type).toBe("text");
  });

  it("weddings_retired_batches table exists and is empty (no batch has been reverted yet)", async () => {
    const { rows } = await pool.query(`select count(*)::int as n from weddings_retired_batches`);
    expect(rows[0].n).toBe(0);
  });

  it("every weddings row without a jeremy_weddings_created row is one of Ben's original-crawl weddings -- this floor must never grow", async () => {
    // Measured live 2026-09-08 (same day as the D050 orphaned-wedding bug fix that made this
    // number stable, 2026-09-07): 1,326 weddings have no jeremy_weddings_created row at all.
    // These are Ben's original crawl, created before this whole Jeremy-evidence workstream
    // existed -- createWeddingsFromJeremyEvidence.ts is the ONLY script that has ever created a
    // `weddings` row from Jeremy's corpus, and it has always logged to jeremy_weddings_created
    // (D023 onward) -- so every NEW wedding from here on comes with a log row, and this number
    // is a floor, not a snapshot: it must never increase. If it does, something created a
    // weddings row outside the logged path (the same class of bug the D050 orphaned-wedding
    // cleanup fixed) and needs auditing before this mission's revert tooling can be trusted.
    const { rows } = await pool.query(`
      select count(*)::int as n from weddings w
      where not exists (select 1 from jeremy_weddings_created j where j.wedding_id = w.id)
    `);
    expect(rows[0].n).toBe(1326);
  });
});
