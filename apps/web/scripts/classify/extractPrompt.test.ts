import { describe, it, expect } from "vitest";
import {
  buildExtractUserPrompt,
  validateExtractResult,
  decideVerdictWrite,
  truncateBio,
  normalizeHandle,
  type ExtractPostContext,
  type ExtractResult,
} from "./extractPrompt";

function baseCtx(overrides: Partial<ExtractPostContext> = {}): ExtractPostContext {
  return {
    post_url: "https://instagram.com/p/abc123",
    caption_raw: "Sarah & Mike's big day at the venue!",
    location_tag: "The Dalcy, Chicago",
    owner_username: "somephotographer",
    post_timestamp: "2026-06-01T00:00:00Z",
    candidate_id: 42,
    venue_anchor_source: "credit_line",
    venue_username: "thedalcy",
    venue_full_name: "The Dalcy",
    venue_biography: "A Chicago event space.",
    stack: [
      { role_raw: "Photography", role: "photographer", handle: "somephotographer" },
      { role_raw: "Venue", role: "venue", handle: "thedalcy" },
    ],
    couple_guess: "sarah & mike",
    has_non_wedding_event_keyword: false,
    ...overrides,
  };
}

function baseResult(overrides: Partial<ExtractResult> = {}): ExtractResult {
  return {
    verdict: "THIS_VENUE",
    corrected_venue_handle: null,
    event_type: "wedding",
    couple_names: "Sarah & Mike",
    event_date_hint: null,
    // extract-v1.2 fields (venue discovery + geography).
    venue_name: "The Dalcy",
    venue_handle_guess: "thedalcy",
    location_claim: "Chicago, IL",
    chicago_metro: "yes",
    confidence: 0.9,
    evidence: "Sarah & Mike's big day",
    ...overrides,
  };
}

describe("buildExtractUserPrompt", () => {
  it("renders the parsed credit stack", () => {
    const prompt = buildExtractUserPrompt(baseCtx());
    expect(prompt).toContain("photographer (Photography): @somephotographer");
    expect(prompt).toContain("venue (Venue): @thedalcy");
  });

  it("renders the location tag", () => {
    const prompt = buildExtractUserPrompt(baseCtx());
    expect(prompt).toContain("location_tag (IG geotag on this post): The Dalcy, Chicago");
  });

  it("renders (none) for a missing location tag", () => {
    const prompt = buildExtractUserPrompt(baseCtx({ location_tag: null }));
    expect(prompt).toContain("location_tag (IG geotag on this post): (none)");
  });

  it("renders a placeholder when the credit stack is empty", () => {
    const prompt = buildExtractUserPrompt(baseCtx({ stack: [] }));
    expect(prompt).toContain("(no credit stack extracted for this post)");
  });

  it("renders venue_anchor_source and candidate_id", () => {
    const prompt = buildExtractUserPrompt(baseCtx());
    expect(prompt).toContain("candidate_id: 42");
    expect(prompt).toContain("venue_anchor_source");
    expect(prompt).toContain("credit_line");
  });

  it("renders couple_guess and has_non_wedding_event_keyword hints", () => {
    const prompt = buildExtractUserPrompt(baseCtx());
    expect(prompt).toContain("couple_guess");
    expect(prompt).toContain("sarah & mike");
    expect(prompt).toContain("NOT authoritative on its own): false");
  });
});

describe("truncateBio", () => {
  it("passes short bios through unchanged", () => {
    expect(truncateBio("short bio")).toBe("short bio");
  });
  it("truncates to 200 chars by default", () => {
    const long = "a".repeat(300);
    expect(truncateBio(long)).toHaveLength(200);
  });
  it("returns null for null input", () => {
    expect(truncateBio(null)).toBeNull();
  });
});

describe("validateExtractResult", () => {
  it("accepts a well-formed result", () => {
    expect(() => validateExtractResult(baseResult())).not.toThrow();
  });

  it("rejects an invalid verdict", () => {
    const bad = { ...baseResult(), verdict: "MAYBE_VENUE" } as unknown as ExtractResult;
    expect(() => validateExtractResult(bad)).toThrow(/verdict/i);
  });

  it("rejects an invalid event_type", () => {
    const bad = { ...baseResult(), event_type: "party" } as unknown as ExtractResult;
    expect(() => validateExtractResult(bad)).toThrow(/event_type/i);
  });

  it("rejects an out-of-range confidence", () => {
    const bad = { ...baseResult(), confidence: 1.5 };
    expect(() => validateExtractResult(bad)).toThrow(/confidence/i);
  });

  it("rejects a non-string evidence field", () => {
    const bad = { ...baseResult(), evidence: null } as unknown as ExtractResult;
    expect(() => validateExtractResult(bad)).toThrow(/evidence/i);
  });
});

describe("normalizeHandle", () => {
  it("strips a leading @ and lowercases", () => {
    expect(normalizeHandle("@TheDalcy")).toBe("thedalcy");
  });
  it("leaves a bare handle lowercased", () => {
    expect(normalizeHandle("TheDalcy")).toBe("thedalcy");
  });
  it("trims whitespace", () => {
    expect(normalizeHandle("  thedalcy  ")).toBe("thedalcy");
  });
});

describe("decideVerdictWrite", () => {
  const resolver = new Map<string, number>([["realvenue", 101]]);
  const resolve = (handle: string) => resolver.get(normalizeHandle(handle)) ?? null;

  it("never writes UNSURE, regardless of confidence", () => {
    const r = baseResult({ verdict: "UNSURE", confidence: 0.99 });
    const decision = decideVerdictWrite(r, 0.5, resolve);
    expect(decision.shouldWrite).toBe(false);
    expect(decision.skipReason).toBe("unsure");
  });

  it("writes THIS_VENUE at or above the threshold", () => {
    const r = baseResult({ verdict: "THIS_VENUE", confidence: 0.8 });
    const decision = decideVerdictWrite(r, 0.8, resolve);
    expect(decision.shouldWrite).toBe(true);
    expect(decision.verdict).toBe("THIS_VENUE");
  });

  it("does not write THIS_VENUE below the threshold", () => {
    const r = baseResult({ verdict: "THIS_VENUE", confidence: 0.79 });
    const decision = decideVerdictWrite(r, 0.8, resolve);
    expect(decision.shouldWrite).toBe(false);
    expect(decision.skipReason).toBe("below_threshold");
  });

  it("writes NOT_WEDDING at or above the threshold", () => {
    const r = baseResult({ verdict: "NOT_WEDDING", confidence: 0.85, evidence: "just a styled shoot" });
    const decision = decideVerdictWrite(r, 0.8, resolve);
    expect(decision.shouldWrite).toBe(true);
    expect(decision.verdict).toBe("NOT_WEDDING");
  });

  it("writes OTHER_VENUE only when the corrected handle resolves", () => {
    const resolvable = baseResult({ verdict: "OTHER_VENUE", confidence: 0.9, corrected_venue_handle: "@RealVenue" });
    const decision = decideVerdictWrite(resolvable, 0.8, resolve);
    expect(decision.shouldWrite).toBe(true);
    expect(decision.verdict).toBe("OTHER_VENUE");
    expect(decision.correctedVenueAccountId).toBe(101);
  });

  it("does not write OTHER_VENUE when no handle is given", () => {
    const noHandle = baseResult({ verdict: "OTHER_VENUE", confidence: 0.9, corrected_venue_handle: null });
    const decision = decideVerdictWrite(noHandle, 0.8, resolve);
    expect(decision.shouldWrite).toBe(false);
    expect(decision.skipReason).toBe("other_venue_no_handle");
  });

  it("does not write OTHER_VENUE when the handle doesn't resolve to a known account", () => {
    const unresolved = baseResult({ verdict: "OTHER_VENUE", confidence: 0.9, corrected_venue_handle: "@nosuchvenue" });
    const decision = decideVerdictWrite(unresolved, 0.8, resolve);
    expect(decision.shouldWrite).toBe(false);
    expect(decision.skipReason).toBe("other_venue_unresolved");
  });

  it("does not write OTHER_VENUE below the threshold even with a resolvable handle", () => {
    const belowThreshold = baseResult({ verdict: "OTHER_VENUE", confidence: 0.5, corrected_venue_handle: "@RealVenue" });
    const decision = decideVerdictWrite(belowThreshold, 0.8, resolve);
    expect(decision.shouldWrite).toBe(false);
    expect(decision.skipReason).toBe("below_threshold");
  });
});
