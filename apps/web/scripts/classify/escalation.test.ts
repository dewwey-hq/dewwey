import { describe, it, expect } from "vitest";
import { parseEscalateBand, shouldEscalate } from "./escalation";
import type { ExtractResult } from "./extractPrompt";

function baseResult(overrides: Partial<Pick<ExtractResult, "verdict" | "confidence">> = {}): Pick<
  ExtractResult,
  "verdict" | "confidence"
> {
  return { verdict: "THIS_VENUE", confidence: 0.9, ...overrides };
}

describe("parseEscalateBand", () => {
  it("returns null for undefined", () => {
    expect(parseEscalateBand(undefined)).toBeNull();
  });

  it("returns null for an empty/whitespace string", () => {
    expect(parseEscalateBand("")).toBeNull();
    expect(parseEscalateBand("   ")).toBeNull();
  });

  it("parses a well-formed band", () => {
    expect(parseEscalateBand("0.5-0.8")).toEqual({ lo: 0.5, hi: 0.8 });
  });

  it("parses integer-looking bounds", () => {
    expect(parseEscalateBand("0-1")).toEqual({ lo: 0, hi: 1 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseEscalateBand("  0.5-0.8  ")).toEqual({ lo: 0.5, hi: 0.8 });
  });

  it("throws on a malformed spec", () => {
    expect(() => parseEscalateBand("garbage")).toThrow(/escalate-band/);
    expect(() => parseEscalateBand("0.5")).toThrow(/escalate-band/);
    expect(() => parseEscalateBand("0.5-0.8-0.9")).toThrow(/escalate-band/);
  });

  it("throws when a bound is out of [0,1]", () => {
    expect(() => parseEscalateBand("0.5-1.2")).toThrow(/within \[0,1\]/);
    expect(() => parseEscalateBand("-0.1-0.8")).toThrow(/escalate-band/);
  });

  it("throws when lo > hi", () => {
    expect(() => parseEscalateBand("0.8-0.5")).toThrow(/lo must be <= hi/);
  });
});

describe("shouldEscalate", () => {
  it("never escalates when band is null (disabled)", () => {
    expect(shouldEscalate(baseResult({ verdict: "UNSURE" }), null)).toBe(false);
    expect(shouldEscalate(baseResult({ confidence: 0.6 }), null)).toBe(false);
  });

  it("always escalates UNSURE regardless of confidence", () => {
    const band = { lo: 0.5, hi: 0.8 };
    expect(shouldEscalate(baseResult({ verdict: "UNSURE", confidence: 0.99 }), band)).toBe(true);
    expect(shouldEscalate(baseResult({ verdict: "UNSURE", confidence: 0.01 }), band)).toBe(true);
  });

  it("escalates a decided verdict inside the band, inclusive of both ends", () => {
    const band = { lo: 0.5, hi: 0.8 };
    expect(shouldEscalate(baseResult({ confidence: 0.5 }), band)).toBe(true);
    expect(shouldEscalate(baseResult({ confidence: 0.65 }), band)).toBe(true);
    expect(shouldEscalate(baseResult({ confidence: 0.8 }), band)).toBe(true);
  });

  it("does not escalate a decided verdict outside the band", () => {
    const band = { lo: 0.5, hi: 0.8 };
    expect(shouldEscalate(baseResult({ confidence: 0.49 }), band)).toBe(false);
    expect(shouldEscalate(baseResult({ confidence: 0.81 }), band)).toBe(false);
    expect(shouldEscalate(baseResult({ confidence: 0.95 }), band)).toBe(false);
  });
});
