import { describe, it, expect } from "vitest";
import {
  normalizeVenueName,
  classifyVenueAttribution,
  classifyCaptionVenueSignal,
  type VenueAttributionInput,
  type CaptionVenueSignalInput,
} from "./venueAttribution";

describe("normalizeVenueName", () => {
  it("lowercases", () => {
    expect(normalizeVenueName("The Dalcy")).toBe("dalcy");
  });

  it("strips punctuation", () => {
    expect(normalizeVenueName("Salvatore's!")).toBe("salvatore s");
  });

  it("drops the standalone word 'the' anywhere, not just leading", () => {
    expect(normalizeVenueName("The Dalcy")).toBe("dalcy");
    expect(normalizeVenueName("Dalcy, The")).toBe("dalcy");
    expect(normalizeVenueName("Chicago Botanic Garden")).toBe("chicago botanic garden");
  });

  it("does not strip 'the' as a substring of another word", () => {
    expect(normalizeVenueName("Bethel Hall")).toBe("bethel hall");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeVenueName("The   Dalcy   Chicago")).toBe("dalcy chicago");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(normalizeVenueName(null)).toBe("");
    expect(normalizeVenueName(undefined)).toBe("");
    expect(normalizeVenueName("")).toBe("");
  });
});

function baseAttributionInput(overrides: Partial<VenueAttributionInput> = {}): VenueAttributionInput {
  return {
    modelVenueHandleGuess: "thedalcy",
    modelHandleAccountId: 101,
    modelVenueName: "The Dalcy",
    actualVenueAccountId: 101,
    actualNameVariants: ["The Dalcy", "The Dalcy Chicago"],
    ...overrides,
  };
}

describe("classifyVenueAttribution", () => {
  it("matches on a resolved handle even when the name field is wrong", () => {
    const result = classifyVenueAttribution(
      baseAttributionInput({ modelVenueName: "Some Other Place", modelHandleAccountId: 101 })
    );
    expect(result.match).toBe("handle_match");
    expect(result.handleMatched).toBe(true);
  });

  it("falls back to a name match when the handle guess is missing", () => {
    const result = classifyVenueAttribution(
      baseAttributionInput({ modelVenueHandleGuess: null, modelHandleAccountId: null })
    );
    expect(result.match).toBe("name_match");
    expect(result.nameMatched).toBe(true);
    expect(result.handleMatched).toBe(false);
  });

  it("matches a name against ANY of the venue's name variants (full_name/vendor name/location tags)", () => {
    const result = classifyVenueAttribution(
      baseAttributionInput({
        modelVenueHandleGuess: null,
        modelHandleAccountId: null,
        modelVenueName: "The Dalcy Chicago",
        actualNameVariants: ["Different Legal Name LLC", "The Dalcy Chicago"],
      })
    );
    expect(result.match).toBe("name_match");
  });

  it("reports no_match when the model guessed something but it's wrong", () => {
    const result = classifyVenueAttribution(
      baseAttributionInput({
        modelVenueHandleGuess: "wrongvenue",
        modelHandleAccountId: 999,
        modelVenueName: "Wrong Venue Name",
      })
    );
    expect(result.match).toBe("no_match");
    expect(result.handleMatched).toBe(false);
    expect(result.nameMatched).toBe(false);
  });

  it("reports no_match when the handle resolved to a DIFFERENT account than the actual venue", () => {
    const result = classifyVenueAttribution(
      baseAttributionInput({ modelHandleAccountId: 202, modelVenueName: null })
    );
    expect(result.match).toBe("no_match");
  });

  it("reports model_null only when BOTH raw fields are null", () => {
    const result = classifyVenueAttribution(
      baseAttributionInput({ modelVenueHandleGuess: null, modelHandleAccountId: null, modelVenueName: null })
    );
    expect(result.match).toBe("model_null");
  });

  it("does not report model_null when the model gave a handle guess that merely failed to resolve", () => {
    const result = classifyVenueAttribution(
      baseAttributionInput({ modelVenueHandleGuess: "somehandle", modelHandleAccountId: null, modelVenueName: null })
    );
    expect(result.match).toBe("no_match");
  });

  it("prefers handle_match over name_match when both are true", () => {
    const result = classifyVenueAttribution(baseAttributionInput());
    expect(result.match).toBe("handle_match");
    expect(result.handleMatched).toBe(true);
    expect(result.nameMatched).toBe(true);
  });
});

function baseSignalInput(overrides: Partial<CaptionVenueSignalInput> = {}): CaptionVenueSignalInput {
  return {
    mentionAccountIds: [55, 101],
    removedVenueStackAccountIds: [],
    actualVenueAccountId: 101,
    captionNameNormalized: normalizeVenueName("so honored to be part of this beautiful day"),
    actualNameVariants: ["The Dalcy"],
    ...overrides,
  };
}

describe("classifyCaptionVenueSignal", () => {
  it("detects a handle from raw @mentions", () => {
    expect(classifyCaptionVenueSignal(baseSignalInput())).toBe("handle");
  });

  it("detects a handle from the hidden role=venue credit-stack entries when mentions miss it", () => {
    const result = classifyCaptionVenueSignal(
      baseSignalInput({ mentionAccountIds: [55], removedVenueStackAccountIds: [101] })
    );
    expect(result).toBe("handle");
  });

  it("falls back to name_only when no handle resolves but the caption names the venue", () => {
    const result = classifyCaptionVenueSignal(
      baseSignalInput({
        mentionAccountIds: [55],
        removedVenueStackAccountIds: [],
        captionNameNormalized: normalizeVenueName("married at The Dalcy last fall"),
      })
    );
    expect(result).toBe("name_only");
  });

  it("returns neither when nothing ties the caption to the venue", () => {
    const result = classifyCaptionVenueSignal(
      baseSignalInput({
        mentionAccountIds: [55],
        removedVenueStackAccountIds: [],
        captionNameNormalized: normalizeVenueName("so much fun last night"),
      })
    );
    expect(result).toBe("neither");
  });

  it("ignores null (unresolved) mention account ids", () => {
    const result = classifyCaptionVenueSignal(
      baseSignalInput({ mentionAccountIds: [null, null], removedVenueStackAccountIds: [null] })
    );
    expect(result).toBe("neither");
  });
});
