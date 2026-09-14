import { describe, expect, it } from "vitest";

import { getGolden } from "../../lib/venueDetails/golden";
import { criticalFieldPaths } from "../../lib/venueDetails/tiers";
import { fact, makeVenue, spineWith } from "../../lib/venueDetails/testHelpers";
import { scoreCapacities, scoreSpaces, scoreSpineTiers, scoreVenue } from "./score";

describe("scoreVenue: golden vs itself", () => {
  it("scores 100% on every tier and 0 cost delta for every golden fixture", () => {
    for (const slug of ["galleria-marchetti", "greenhouse-loft", "diamond-garden-banquet-hall", "londonhouse-chicago", "field-museum", "geraghty"] as const) {
      const golden = getGolden(slug)!;
      const result = scoreVenue(golden, golden, criticalFieldPaths(golden));
      expect(result.tiers.critical.accuracy, `${slug} critical`).toBe(1);
      expect(result.tiers.important.accuracy, `${slug} important`).toBe(1);
      expect(result.tiers.secondary.accuracy, `${slug} secondary`).toBe(1);
      expect(result.capacities.headlineExact, `${slug} headline`).toBe(true);
      expect(result.costDelta.pctDelta ?? 0, `${slug} cost delta`).toBeLessThanOrEqual(0.0001);
    }
  });
});

describe("scoreSpineTiers: one swapped critical value drops critical accuracy by one field", () => {
  it("field-museum-style: flipping a critical field lowers only the critical tier", () => {
    const golden = getGolden("galleria-marchetti")!;
    const critical = scoreSpineTiers(golden, golden).critical;
    expect(critical.matches).toBe(critical.total);

    const candidate: typeof golden = JSON.parse(JSON.stringify(golden));
    // catering is critical; swap it to a different valid enum value.
    candidate.spine.catering = { status: "stated", value: "open", quote: "x", source_url: candidate.spine.catering.status === "stated" ? candidate.spine.catering.source_url : "https://example.com", snapshot_id: null };

    const result = scoreSpineTiers(candidate, golden);
    expect(result.critical.matches).toBe(critical.total - 1);
    expect(result.critical.misses).toContain("/spine/catering");
  });
});

describe("scoreSpaces: a missing space drops recall", () => {
  it("recall is 0.5 when the candidate is missing one of two golden spaces", () => {
    const golden = makeVenue({
      spaces: [
        { id: "a", name: "The Pavilion", structure_label: null, sq_ft: null, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: null } },
        { id: "b", name: "La Pergola", structure_label: null, sq_ft: null, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: null } },
      ],
    });
    const candidate = makeVenue({
      spaces: [{ id: "a", name: "The Pavilion", structure_label: null, sq_ft: null, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: null } }],
    });

    const result = scoreSpaces(candidate, golden);
    expect(result.recall).toBe(0.5);
    expect(result.precision).toBe(1);
  });
});

describe("human_only-tagged fields are ignored unless --all-fields", () => {
  it("excludes a human_only spine field from the tier score by default, includes it with allFields", () => {
    const golden = makeVenue({
      spine: spineWith({ catering: fact("open"), coat_check: fact("included") }),
      eval: { "/spine/catering": "extractor", "/spine/coat_check": "human_only" },
      sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null },
    });
    // golden.spine.catering.source_url defaults to https://example.com via `fact()`.

    const candidateMissingBoth = makeVenue({ spine: spineWith({}), sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null } });

    const defaultScore = scoreSpineTiers(candidateMissingBoth, golden);
    // catering (critical) is in scope and missed; coat_check (secondary, human_only) is excluded
    // entirely, so secondary's total should be 0 (vacuous accuracy 1), not counted as a miss.
    expect(defaultScore.critical.total).toBe(1);
    expect(defaultScore.critical.matches).toBe(0);
    expect(defaultScore.secondary.total).toBe(0);
    expect(defaultScore.secondary.accuracy).toBe(1);

    const allFieldsScore = scoreSpineTiers(candidateMissingBoth, golden, { allFields: true });
    expect(allFieldsScore.secondary.total).toBeGreaterThan(0);
  });
});

describe("capacity headline exact / mismatch", () => {
  it("headlineExact is false when the two documents' headline numbers differ", () => {
    const golden = getGolden("galleria-marchetti")!;
    const candidate: typeof golden = JSON.parse(JSON.stringify(golden));
    const idx = candidate.capacities.findIndex((c) => c.space_id === "the-pavilion" && c.layout === "seated_dinner");
    candidate.capacities[idx] = { ...candidate.capacities[idx], max: 999 };
    const result = scoreCapacities(candidate, golden);
    expect(result.headlineExact).toBe(false);
    expect(result.matches).toBeLessThan(result.total);
  });
});
