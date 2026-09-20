/**
 * D061 ("acquisition loop") pure-helper unit tests -- no DB. Covers the three functions the
 * mission's plan calls out explicitly: shortcode extraction (shortcodeFromUrl,
 * createWeddingsFromJeremyEvidence.ts), the month-1 creation-tier rule
 * (decideAcquisitionCreation, same file), and the human-reviewer predicate that
 * revertWeddingBatch.ts's --retire-verdicts uses to decide which verdicts it may supersede
 * (isHumanReviewer, revertWeddingBatch.ts).
 *
 * Both source modules run a live main() at the bottom of the file, guarded by
 * `import.meta.url === file://${process.argv[1]}` so importing them here (argv[1] is this test
 * runner, never the script itself) never triggers a real DB run as a side effect.
 */
import { describe, it, expect } from "vitest";
import { shortcodeFromUrl, decideAcquisitionCreation } from "./createWeddingsFromJeremyEvidence";
import { isHumanReviewer } from "./revertWeddingBatch";

describe("shortcodeFromUrl (unit)", () => {
  it("extracts the shortcode from a standard /p/<sc>/ URL", () => {
    expect(shortcodeFromUrl("https://www.instagram.com/p/DcJTVimP2su/")).toBe("DcJTVimP2su");
  });

  it("extracts the shortcode without a trailing slash", () => {
    expect(shortcodeFromUrl("https://www.instagram.com/p/DcJTVimP2su")).toBe("DcJTVimP2su");
  });

  it("extracts the shortcode regardless of query string / trailing path", () => {
    expect(shortcodeFromUrl("https://www.instagram.com/p/DcJTVimP2su/?utm_source=ig")).toBe("DcJTVimP2su");
  });

  it("returns null for a URL with no /p/ segment", () => {
    expect(shortcodeFromUrl("https://www.instagram.com/somevenue/")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(shortcodeFromUrl("")).toBeNull();
  });
});

describe("decideAcquisitionCreation (unit) -- D061 month-1 reconciliation rule", () => {
  it("WOULD_ATTACH at exactly the 0.7 boundary (>=0.7)", () => {
    expect(decideAcquisitionCreation(0.7)).toBe("WOULD_ATTACH");
  });

  it("WOULD_ATTACH above 0.7", () => {
    expect(decideAcquisitionCreation(0.95)).toBe("WOULD_ATTACH");
    expect(decideAcquisitionCreation(1)).toBe("WOULD_ATTACH");
  });

  it("CREATE_WEAK_MATCH at exactly the 0.5 boundary (>=0.5, <0.7)", () => {
    expect(decideAcquisitionCreation(0.5)).toBe("CREATE_WEAK_MATCH");
  });

  it("CREATE_WEAK_MATCH just below the 0.7 boundary", () => {
    expect(decideAcquisitionCreation(0.6999)).toBe("CREATE_WEAK_MATCH");
  });

  it("styled-shoot gate (2026-09-20): CONFIRMED/LIKELY -> HUMAN before any reconciliation rule; POSSIBLE/NO_SIGNAL do not gate", () => {
    expect(decideAcquisitionCreation(null, "CONFIRMED")).toBe("HUMAN");
    expect(decideAcquisitionCreation(0.95, "LIKELY")).toBe("HUMAN");
    expect(decideAcquisitionCreation(0.6, "POSSIBLE")).toBe("CREATE_WEAK_MATCH");
    expect(decideAcquisitionCreation(null, "NO_SIGNAL")).toBe("CREATE");
    expect(decideAcquisitionCreation(0.8, null)).toBe("WOULD_ATTACH");
  });

  it("CREATE just below the 0.5 boundary", () => {
    expect(decideAcquisitionCreation(0.4999)).toBe("CREATE");
  });

  it("CREATE for a low or zero confidence", () => {
    expect(decideAcquisitionCreation(0.1)).toBe("CREATE");
    expect(decideAcquisitionCreation(0)).toBe("CREATE");
  });

  it("CREATE when there is no reconciliation match at all (null)", () => {
    expect(decideAcquisitionCreation(null)).toBe("CREATE");
  });
});

describe("isHumanReviewer (unit) -- D061 --retire-verdicts predicate", () => {
  it("'jeremy' is human", () => {
    expect(isHumanReviewer("jeremy")).toBe(true);
  });

  it("anything 'human'-prefixed is human", () => {
    expect(isHumanReviewer("human")).toBe(true);
    expect(isHumanReviewer("human-review")).toBe(true);
    expect(isHumanReviewer("human:jhoffen")).toBe(true);
  });

  it("model reviewers are not human", () => {
    expect(isHumanReviewer("haiku-extract-v1")).toBe(false);
    expect(isHumanReviewer("fable-structured")).toBe(false);
  });

  it("a revert-superseded reviewer string is not human (never re-superseded)", () => {
    expect(isHumanReviewer("revert:acq-20260920-pilot-create-1")).toBe(false);
  });
});
