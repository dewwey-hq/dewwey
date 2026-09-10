/**
 * Pure-function tests for discoveredVenueLeads.ts (resolveDiscoveredVenues.ts's normalization +
 * tier-decision logic). No DB -- see that file's header for why these are split out.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeHandle,
  normalizeVenueName,
  captionContainsHandle,
  isNearMiss,
  decideTier,
} from "./discoveredVenueLeads";

describe("normalizeHandle", () => {
  it("lowercases and strips a leading @", () => {
    expect(normalizeHandle("@TheFarmhousePlainfield")).toBe("thefarmhouseplainfield");
  });
  it("leaves a handle with no @ unchanged apart from case/trim", () => {
    expect(normalizeHandle("  MaeDistrict  ")).toBe("maedistrict");
  });
});

describe("normalizeVenueName", () => {
  it("lowercases, strips punctuation, drops a leading 'the', collapses spaces", () => {
    expect(normalizeVenueName("The Farmhouse, Plainfield")).toBe("farmhouse plainfield");
  });
  it("does not touch a 'the' that isn't leading", () => {
    expect(normalizeVenueName("Theater on the Lake")).toBe("theater on the lake");
  });
  it("strips ampersands, apostrophes, and dashes", () => {
    expect(normalizeVenueName("Salvatore's Wedding & Event-Venue")).toBe("salvatores wedding event venue");
  });
  it("collapses repeated whitespace left over from stripped punctuation", () => {
    expect(normalizeVenueName("Herrington Inn  &  Spa")).toBe("herrington inn spa");
  });
  it("is idempotent", () => {
    const once = normalizeVenueName("The Grand Ballroom, Chicago!");
    expect(normalizeVenueName(once)).toBe(once);
  });
});

describe("captionContainsHandle", () => {
  it("matches a literal @handle credit, case-insensitively", () => {
    expect(captionContainsHandle("Married at @TheFarmhousePlainfield last June!", "thefarmhouseplainfield")).toBe(true);
  });
  it("does not false-positive on a longer handle that merely starts the same way", () => {
    expect(captionContainsHandle("Thanks @thefarmhouseplainfieldevents for everything!", "thefarmhouseplainfield")).toBe(false);
  });
  it("returns false for a null/empty caption", () => {
    expect(captionContainsHandle(null, "thefarmhouseplainfield")).toBe(false);
    expect(captionContainsHandle("", "thefarmhouseplainfield")).toBe(false);
  });
  it("returns false when the handle simply isn't mentioned", () => {
    expect(captionContainsHandle("Such a beautiful day for a wedding!", "thefarmhouseplainfield")).toBe(false);
  });
});

describe("isNearMiss", () => {
  it("flags a prefix relationship", () => {
    expect(isNearMiss("londonhouse chicago", "londonhouse")).toBe(true);
  });
  it("flags a containment relationship", () => {
    expect(isNearMiss("the herrington inn spa", "herrington inn")).toBe(true);
  });
  it("does not flag an exact match (that's a resolution, not a near-miss)", () => {
    expect(isNearMiss("cantigny park", "cantigny park")).toBe(false);
  });
  it("does not flag unrelated names", () => {
    expect(isNearMiss("cantigny park", "the drake hotel")).toBe(false);
  });
  it("treats empty strings as never a near-miss", () => {
    expect(isNearMiss("", "cantigny park")).toBe(false);
    expect(isNearMiss("cantigny park", "")).toBe(false);
  });
});

describe("decideTier", () => {
  it("tier A: handle resolves and the caption confirms it", () => {
    const d = decideTier({
      handleResolved: true,
      handleInCaption: true,
      nameResolved: false,
      nameAmbiguous: false,
      nameNearMiss: false,
    });
    expect(d).toEqual({ tier: "A", resolvedBy: "handle", write: true, nearMiss: false });
  });

  it("downgrades to tier B when the handle resolves but the caption doesn't confirm it, and the name resolves", () => {
    const d = decideTier({
      handleResolved: true,
      handleInCaption: false,
      nameResolved: true,
      nameAmbiguous: false,
      nameNearMiss: false,
    });
    expect(d).toEqual({ tier: "B", resolvedBy: "name", write: true, nearMiss: false });
  });

  it("tier B write: name resolves unambiguously (handle guess absent entirely)", () => {
    const d = decideTier({
      handleResolved: false,
      handleInCaption: false,
      nameResolved: true,
      nameAmbiguous: false,
      nameNearMiss: false,
    });
    expect(d).toEqual({ tier: "B", resolvedBy: "name", write: true, nearMiss: false });
  });

  it("tier B near-miss: name resolves to nothing exact but is close to an existing venue -- never written", () => {
    const d = decideTier({
      handleResolved: false,
      handleInCaption: false,
      nameResolved: false,
      nameAmbiguous: false,
      nameNearMiss: true,
    });
    expect(d).toEqual({ tier: "B", resolvedBy: "name", write: false, nearMiss: true });
  });

  it("tier B near-miss: an ambiguous exact match (two+ eligible accounts) is never written either", () => {
    const d = decideTier({
      handleResolved: false,
      handleInCaption: false,
      nameResolved: true,
      nameAmbiguous: true,
      nameNearMiss: false,
    });
    expect(d).toEqual({ tier: "B", resolvedBy: "name", write: false, nearMiss: true });
  });

  it("tier C: nothing resolves at all -- new-venue lead", () => {
    const d = decideTier({
      handleResolved: false,
      handleInCaption: false,
      nameResolved: false,
      nameAmbiguous: false,
      nameNearMiss: false,
    });
    expect(d).toEqual({ tier: "C", resolvedBy: null, write: false, nearMiss: false });
  });

  it("tier C: handle resolves but caption doesn't confirm it, and the name also fails entirely", () => {
    // The handle guess is not trusted without caption confirmation; falling through to name
    // resolution and finding nothing means this is a new-venue lead, not a forced tier A/B.
    const d = decideTier({
      handleResolved: true,
      handleInCaption: false,
      nameResolved: false,
      nameAmbiguous: false,
      nameNearMiss: false,
    });
    expect(d).toEqual({ tier: "C", resolvedBy: null, write: false, nearMiss: false });
  });
});
