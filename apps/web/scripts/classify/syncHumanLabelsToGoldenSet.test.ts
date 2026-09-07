import { describe, it, expect } from "vitest";
import { mapHumanLabelToDecision } from "./syncHumanLabelsToGoldenSet";

describe("mapHumanLabelToDecision (unit)", () => {
  it("maps content judgments onto golden_set's post_decision vocabulary", () => {
    expect(mapHumanLabelToDecision("WEDDING")).toBe("INCLUDE");
    expect(mapHumanLabelToDecision("NOT_WEDDING")).toBe("EXCLUDE");
    expect(mapHumanLabelToDecision("UNSURE")).toBe("REVIEW");
  });

  it("never promotes technical outcomes (UNVIEWABLE/SKIP say nothing about content)", () => {
    expect(mapHumanLabelToDecision("UNVIEWABLE")).toBeNull();
    expect(mapHumanLabelToDecision("SKIP")).toBeNull();
  });

  it("returns null for anything unrecognized rather than guessing", () => {
    expect(mapHumanLabelToDecision("bogus")).toBeNull();
  });
});
