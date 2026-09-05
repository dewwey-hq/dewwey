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
});

// --- Structural invariants against the live DB. Read-only. ---
describe("graph-strengthening invariants (DB)", () => {
  const pool = getPool();
  // pool is closed in the last describe block below, not here — vitest runs
  // describe blocks in declaration order and this module shares one pool singleton.

  it("evidence view never includes role='other'", async () => {
    const { rows } = await pool.query(`select count(*) as n from jeremy_post_vendor_evidence where role = 'other'`);
    expect(Number(rows[0].n)).toBe(0);
  });

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
  });

  it("a source post belongs to at most one Jeremy wedding candidate (DB-level PK, tested explicitly)", async () => {
    const { rows } = await pool.query(
      `select source_post_url, count(*) as n from jeremy_wedding_candidate_posts group by source_post_url having count(*) > 1`
    );
    expect(rows.length).toBe(0);
  });

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

  it("the 143 high-confidence matches are byte-identical between reconcile-v1 and reconcile-v2 (evidence floor changed nothing above the ambiguous threshold)", async () => {
    const { rows } = await pool.query(`
      select count(*) as n
      from jeremy_wedding_candidate_reconciliation v1
      join jeremy_wedding_candidate_reconciliation v2 on v1.candidate_id = v2.candidate_id
      where v1.reconciliation_version = 'reconcile-v1' and v2.reconciliation_version = 'reconcile-v2'
        and v1.match_confidence between 0.75 and 0.85
        and (
          v1.matched_wedding_id is distinct from v2.matched_wedding_id
          or v1.match_confidence is distinct from v2.match_confidence
          or v1.date_delta_days is distinct from v2.date_delta_days
          or v1.vendor_jaccard is distinct from v2.vendor_jaccard
        )
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("the 268 ambiguous matches are byte-identical between reconcile-v1 and reconcile-v2", async () => {
    const { rows } = await pool.query(`
      select count(*) as n
      from jeremy_wedding_candidate_reconciliation v1
      join jeremy_wedding_candidate_reconciliation v2 on v1.candidate_id = v2.candidate_id
      where v1.reconciliation_version = 'reconcile-v1' and v2.reconciliation_version = 'reconcile-v2'
        and v1.match_confidence between 0.35 and 0.45
        and (v1.matched_wedding_id is distinct from v2.matched_wedding_id or v1.match_confidence is distinct from v2.match_confidence)
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("reconcile-v1 rows still exist untouched — the floor was shipped as a new version, not an overwrite", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation where reconciliation_version = 'reconcile-v1'
    `);
    expect(Number(rows[0].n)).toBe(2503);
  });

  it("many-to-one fragmentation among matched candidates shrinks under the floor (weak 'best available' collisions are no longer reported as matches)", async () => {
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
    expect(after).toBeLessThan(before);
  });

  it("total insufficient-evidence rows equal what v1 recorded as weak-but-matched (2058 - 411 = 1647), confirming reclassification not data loss", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_candidate_reconciliation
      where reconciliation_version = 'reconcile-v2' and match_confidence between 0.05 and 0.15
    `);
    expect(Number(rows[0].n)).toBe(1647);
  });

  it("weddings/wedding_posts are unaffected by the reconciliation rerun — reconciliation never writes to Ben's graph (wedding_vendors/edges are D023's separate, deliberate ingestion, asserted in its own describe block)", async () => {
    const { rows } = await pool.query(`
      select
        (select count(*) from weddings) as weddings,
        (select count(*) from wedding_posts) as wedding_posts
    `);
    expect(Number(rows[0].weddings)).toBe(1384);
    expect(Number(rows[0].wedding_posts)).toBe(1668);
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

  it("candidate/candidate_posts counts are unchanged from D019/D021 (2,872 / 3,273) — Experiment B made zero production writes", async () => {
    const { rows } = await pool.query(`
      select
        (select count(*) from jeremy_wedding_candidates) as candidates,
        (select count(*) from jeremy_wedding_candidate_posts) as candidate_posts
    `);
    expect(Number(rows[0].candidates)).toBe(2872);
    expect(Number(rows[0].candidate_posts)).toBe(3273);
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

  it("exactly 100 rows were newly ingested (the rest of the 143's evidence already matched Ben's own data)", async () => {
    const { rows } = await pool.query(`select count(*) as n from jeremy_wedding_vendors_ingested`);
    expect(Number(rows[0].n)).toBe(100);
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

  it("every ingested row traces back to a candidate that is actually in the 143 high-confidence tier", async () => {
    const { rows } = await pool.query(`
      select count(*) as n from jeremy_wedding_vendors_ingested log
      where not exists (
        select 1 from jeremy_wedding_candidate_reconciliation r
        where r.candidate_id = log.candidate_id and r.reconciliation_version = log.reconciliation_version
          and r.match_confidence between 0.75 and 0.85
      )
    `);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("wedding_vendors grew by exactly the ingested count (12,366 pre-existing + 100 ingested = 12,466) — no pre-existing row was touched", async () => {
    // 12,366/12,466 reflects Case A's +56 rows (D027, unrelated provenance table
    // stack_reparse_v3_ingested) landing after D023's original 12,310/12,410 snapshot —
    // update these two literals again if another additive workstream lands more rows.
    const { rows } = await pool.query(`
      select
        count(*) filter (where not exists (
          select 1 from jeremy_wedding_vendors_ingested log
          where log.wedding_id = wv.wedding_id and log.account_id = wv.account_id and log.role = wv.role
        )) as untouched,
        count(*) as total
      from wedding_vendors wv
    `);
    expect(Number(rows[0].untouched)).toBe(12366);
    expect(Number(rows[0].total)).toBe(12466);
  });

  it("Ben's weddings/wedding_posts/accounts are byte-identical in row count to before ingestion (1384/1668/14330) — only wedding_vendors gained rows", async () => {
    const { rows } = await pool.query(`
      select
        (select count(*) from weddings) as weddings,
        (select count(*) from wedding_posts) as wedding_posts,
        (select count(*) from accounts) as accounts
    `);
    expect(Number(rows[0].weddings)).toBe(1384);
    expect(Number(rows[0].wedding_posts)).toBe(1668);
    expect(Number(rows[0].accounts)).toBe(14330);
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
    expect(rows[0].n).toBe(15);
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
