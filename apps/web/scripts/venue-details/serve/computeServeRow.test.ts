import { describe, expect, it } from "vitest";

import { getGolden } from "../../../lib/venueDetails/golden";
import { diffVersions } from "../../../lib/venueDetails/diff";
import { defaultAxes, estimateCost } from "../../../lib/venueDetails/derive";
import { isExcellent } from "../../../lib/venueDetails/tiers";
import { fact, makeVenue, spineWith } from "../../../lib/venueDetails/testHelpers";
import type { RunRow, Validation } from "../contract";
import {
  buildProvenance,
  computeDenormalizedColumns,
  computeLastChangedAt,
  nextVersionNo,
  pickRunToServe,
  summarizeChanges,
} from "./computeServeRow";

function runRow(overrides: Partial<RunRow>): RunRow {
  return {
    id: 1,
    account_id: 31,
    prompt_version: "venue-details-v3.0",
    schema_version: 3,
    model: "haiku",
    stage: "extract",
    parent_run_id: null,
    input_hash: "abc",
    snapshot_ids: [],
    website_url: null,
    validation: null,
    spine_stated_count: null,
    critical_failures: null,
    cost_usd: null,
    created_at: "2026-09-13T00:00:00Z",
    ...overrides,
  };
}

function validation(overrides: Partial<Validation>): Validation {
  return {
    ok: true,
    needs_review: false,
    review_reasons: [],
    issues: [],
    repairs: [],
    grounding: { checked: 0, passed: 0, failed: 0, min_coverage: 0.8 },
    spine_stated_count: 0,
    critical_failures: 0,
    document: makeVenue(),
    ...overrides,
  };
}

describe("pickRunToServe", () => {
  it("picks the only acceptable run for the prompt version", () => {
    const runs = [runRow({ id: 1, validation: validation({ ok: true }) })];
    const picked = pickRunToServe(runs, { promptVersion: "venue-details-v3.0", allowNeedsReview: false });
    expect(picked?.id).toBe(1);
  });

  it("prefers a repair child over its parent when both validate", () => {
    const parent = runRow({ id: 1, stage: "extract", validation: validation({ ok: true }), created_at: "2026-09-13T00:00:00Z" });
    const child = runRow({ id: 2, stage: "repair", parent_run_id: 1, validation: validation({ ok: true }), created_at: "2026-09-12T00:00:00Z" }); // even if OLDER
    const picked = pickRunToServe([parent, child], { promptVersion: "venue-details-v3.0", allowNeedsReview: false });
    expect(picked?.id).toBe(2);
  });

  it("falls back to the parent when the repair child fails validation", () => {
    const parent = runRow({ id: 1, stage: "extract", validation: validation({ ok: true }) });
    const child = runRow({ id: 2, stage: "repair", parent_run_id: 1, validation: validation({ ok: false, needs_review: true }) });
    const picked = pickRunToServe([parent, child], { promptVersion: "venue-details-v3.0", allowNeedsReview: false });
    expect(picked?.id).toBe(1);
  });

  it("excludes needs_review runs by default and includes them with --allow-needs-review", () => {
    const runs = [runRow({ id: 1, validation: validation({ ok: false, needs_review: true }) })];
    expect(pickRunToServe(runs, { promptVersion: "venue-details-v3.0", allowNeedsReview: false })).toBeNull();
    expect(pickRunToServe(runs, { promptVersion: "venue-details-v3.0", allowNeedsReview: true })?.id).toBe(1);
  });

  it("ignores runs for a different prompt_version", () => {
    const runs = [runRow({ id: 1, prompt_version: "venue-details-v2.0", validation: validation({ ok: true }) })];
    expect(pickRunToServe(runs, { promptVersion: "venue-details-v3.0", allowNeedsReview: false })).toBeNull();
  });

  it("returns null when no run has been validated", () => {
    expect(pickRunToServe([runRow({ id: 1 })], { promptVersion: "venue-details-v3.0", allowNeedsReview: false })).toBeNull();
  });
});

describe("nextVersionNo / buildProvenance", () => {
  it("starts at 1 for a brand-new document and increments thereafter", () => {
    expect(nextVersionNo(null)).toBe(1);
    expect(nextVersionNo(1)).toBe(2);
    expect(nextVersionNo(7)).toBe(8);
  });

  it("carries human_verified_at/verified_by from the prior serving row", () => {
    const provenance = buildProvenance({
      versionId: 42,
      versionNo: 3,
      correctionIds: [5, 2],
      carry: { humanVerifiedAt: "2026-09-01T00:00:00Z", verifiedBy: "ben" },
    });
    expect(provenance).toEqual({
      version_id: 42,
      version_no: 3,
      correction_ids: [2, 5],
      human_verified_at: "2026-09-01T00:00:00Z",
      verified_by: "ben",
    });
  });
});

describe("computeLastChangedAt", () => {
  it("is `now` for the first version", () => {
    expect(computeLastChangedAt({ changes: [], isFirstVersion: true, prevLastChangedAt: null, now: "2026-09-13T00:00:00Z" })).toBe("2026-09-13T00:00:00Z");
  });

  it("is `now` when there are changes", () => {
    const changes = [{ field_path: "/spine/catering", kind: "changed" as const, from: null, to: "open" }];
    expect(computeLastChangedAt({ changes, isFirstVersion: false, prevLastChangedAt: "2026-09-01T00:00:00Z", now: "2026-09-13T00:00:00Z" })).toBe(
      "2026-09-13T00:00:00Z"
    );
  });

  it("carries the previous last_changed_at when nothing changed", () => {
    expect(computeLastChangedAt({ changes: [], isFirstVersion: false, prevLastChangedAt: "2026-09-01T00:00:00Z", now: "2026-09-13T00:00:00Z" })).toBe(
      "2026-09-01T00:00:00Z"
    );
  });
});

describe("computeDenormalizedColumns (golden fixture: Marchetti)", () => {
  const marchetti = getGolden("galleria-marchetti")!;

  it("computes headline 425, catering exclusive_in_house, compare_ready true, and (via isExcellent) excellent true", () => {
    const cols = computeDenormalizedColumns(marchetti, { criticalGroundingFailures: 0, needsReview: false, reviewReasons: [] });
    expect(cols.headline_seated).toBe(425);
    expect(cols.catering).toBe("exclusive_in_house");
    expect(cols.compare_ready).toBe(true);
    expect(cols.needs_review).toBe(false);
    expect(cols.spine_stated_count).toBeGreaterThan(0);
    expect(cols.critical_stated_count).toBeGreaterThan(0);

    // `excellent` isn't a stored column (reportVenueDetailsFunnel.ts computes it on the served
    // document), but the same compare_ready value feeds it directly.
    const estimate = estimateCost(marchetti, defaultAxes(marchetti));
    expect(estimate.warnings).not.toContain("no_path");
    expect(isExcellent(marchetti, { compareReady: cols.compare_ready, humanVerified: false })).toBe(true);
  });

  it("compare_ready flips false when needs_review is true, independent of the document", () => {
    const cols = computeDenormalizedColumns(marchetti, { criticalGroundingFailures: 0, needsReview: true, reviewReasons: ["critical field stripped"] });
    expect(cols.compare_ready).toBe(false);
    expect(cols.review_reasons).toEqual(["critical field stripped"]);
  });

  it("fb_minimum_applies reflects the spine's fb_minimum.applies, null when not_stated", () => {
    const withMin = makeVenue({ spine: spineWith({ fb_minimum: fact({ applies: true, amount_usd: 5000, detail: null }) }) });
    const cols = computeDenormalizedColumns(withMin, { criticalGroundingFailures: 0, needsReview: false, reviewReasons: [] });
    expect(cols.fb_minimum_applies).toBe(true);

    const bare = makeVenue();
    const bareCols = computeDenormalizedColumns(bare, { criticalGroundingFailures: 0, needsReview: false, reviewReasons: [] });
    expect(bareCols.fb_minimum_applies).toBeNull();
  });
});

describe("diffVersions -> summarizeChanges (changes non-empty only when the document changed)", () => {
  it("is empty when re-diffing the identical document", () => {
    const marchetti = getGolden("galleria-marchetti")!;
    const changes = diffVersions(marchetti, marchetti);
    expect(summarizeChanges(changes).total).toBe(0);
  });

  it("reports a changed spine field when one value differs", () => {
    const prev = makeVenue({ spine: spineWith({ catering: fact("open") }) });
    const next = makeVenue({ spine: spineWith({ catering: fact("exclusive_in_house") }) });
    const changes = diffVersions(prev, next);
    const summary = summarizeChanges(changes);
    expect(summary.total).toBe(1);
    expect(summary.byKind.changed).toBe(1);
    expect(summary.firstPaths).toEqual(["/spine/catering"]);
  });

  it("reports kind=added for the very first version (prev=null)", () => {
    const next = makeVenue();
    const changes = diffVersions(null, next);
    expect(summarizeChanges(changes).byKind.added).toBe(1);
  });
});
