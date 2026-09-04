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
});

describe("daysBetween (unit)", () => {
  it("is symmetric and in whole days for exact-day differences", () => {
    const a = new Date("2025-01-01T00:00:00Z");
    const b = new Date("2025-01-15T00:00:00Z");
    expect(daysBetween(a, b)).toBe(14);
    expect(daysBetween(b, a)).toBe(14);
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
  afterAll(async () => {
    await closePool();
  });

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

  it("Ben's graph tables are unaffected by the reconciliation rerun (row counts match the pre-existing verified baseline)", async () => {
    const { rows } = await pool.query(`
      select
        (select count(*) from weddings) as weddings,
        (select count(*) from wedding_posts) as wedding_posts,
        (select count(*) from wedding_vendors) as wedding_vendors,
        (select count(*) from edges) as edges
    `);
    expect(Number(rows[0].weddings)).toBe(1384);
    expect(Number(rows[0].wedding_posts)).toBe(1668);
    expect(Number(rows[0].wedding_vendors)).toBe(12310);
    expect(Number(rows[0].edges)).toBe(54271);
  });
});
