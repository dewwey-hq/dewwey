import { describe, it, expect } from "vitest";
import { matchKeyToAction } from "./labelKeyboard";

describe("matchKeyToAction (unit)", () => {
  it("maps the five label/undo letter keys", () => {
    expect(matchKeyToAction({ key: "w" })).toBe("WEDDING");
    expect(matchKeyToAction({ key: "W" })).toBe("WEDDING"); // case-insensitive
    expect(matchKeyToAction({ key: "n" })).toBe("NOT_WEDDING");
    expect(matchKeyToAction({ key: "u" })).toBe("UNSURE");
    expect(matchKeyToAction({ key: "b" })).toBe("UNVIEWABLE");
    expect(matchKeyToAction({ key: "z" })).toBe("UNDO");
    expect(matchKeyToAction({ key: " " })).toBe("SKIP");
  });

  it("returns null for unmapped keys", () => {
    expect(matchKeyToAction({ key: "q" })).toBeNull();
    expect(matchKeyToAction({ key: "Enter" })).toBeNull();
    expect(matchKeyToAction({ key: "Tab" })).toBeNull();
  });

  // Regression test: Cmd+W / Ctrl+W closes the current browser tab. A naive
  // handler matching bare "w" would ALSO fire a WEDDING submission right
  // before the tab closes -- every modifier must suppress a match.
  it("never matches when a modifier key is held (Cmd+W / Ctrl+W tab-close guard)", () => {
    expect(matchKeyToAction({ key: "w", metaKey: true })).toBeNull();
    expect(matchKeyToAction({ key: "w", ctrlKey: true })).toBeNull();
    expect(matchKeyToAction({ key: "n", altKey: true })).toBeNull();
    expect(matchKeyToAction({ key: "z", metaKey: true })).toBeNull(); // Cmd+Z (undo) too
  });
});
