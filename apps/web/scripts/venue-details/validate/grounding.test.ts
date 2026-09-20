import { describe, expect, it } from "vitest";
import { checkGrounding, coverage, normalizeNumberToken, normalizeUrl, tokens, type GroundingPage } from "./grounding";

describe("tokens", () => {
  it("lowercases, drops stopwords and short non-numeric tokens", () => {
    expect(tokens("The Big Ballroom is a wedding venue")).toEqual(["big", "ballroom", "wedding", "venue"]);
  });

  it("normalizes currency, thousands separators, and percentages", () => {
    expect(tokens("$6,000 minimum")).toContain("6000");
    expect(tokens("11.75% sales tax")).toContain("11.75");
  });

  it("normalizes a 'k' shorthand", () => {
    expect(tokens("starting at 6k")).toContain("6000");
  });

  it("keeps short numeric tokens", () => {
    expect(tokens("$5 fee")).toContain("5");
  });
});

describe("normalizeNumberToken", () => {
  it("handles $, commas, %, and k", () => {
    expect(normalizeNumberToken("$6,000")).toBe("6000");
    expect(normalizeNumberToken("11.75%")).toBe("11.75");
    expect(normalizeNumberToken("6k")).toBe("6000");
  });
});

describe("normalizeUrl", () => {
  it("strips scheme, www, and a trailing slash", () => {
    expect(normalizeUrl("https://www.example.com/weddings/")).toBe(normalizeUrl("http://example.com/weddings"));
  });

  it("strips a hash fragment", () => {
    expect(normalizeUrl("https://example.com/weddings#pricing")).toBe(normalizeUrl("https://example.com/weddings"));
  });

  it("falls back to lowercasing an unparsable URL", () => {
    expect(normalizeUrl("Not A Url")).toBe("not a url");
  });

  it("treats a missing source_url as empty, and checkGrounding reports it as source_not_crawled instead of throwing", () => {
    expect(normalizeUrl(undefined)).toBe("");
    expect(normalizeUrl(null)).toBe("");
    const pages = new Map<string, GroundingPage>();
    expect(() => checkGrounding("some quote", undefined, pages)).not.toThrow();
    expect(checkGrounding("some quote", undefined, pages).status).toBe("source_not_crawled");
    expect(() => checkGrounding(undefined, undefined, pages)).not.toThrow();
  });
});

describe("coverage", () => {
  it("is 1.0 when every quote token appears in the page", () => {
    expect(coverage("a food and beverage minimum of $6,000 applies", "Our food and beverage minimum is $6,000 for Saturday events.")).toBeGreaterThanOrEqual(0.8);
  });

  it("is lower when the quote's tokens are mostly absent", () => {
    expect(coverage("a completely unrelated sentence about nothing here", "Our food and beverage minimum is $6,000.")).toBeLessThan(0.5);
  });

  it("is 0 for an empty quote", () => {
    expect(coverage("", "some page text")).toBe(0);
  });

  it("finds tokens across table cells joined by ' | ' (htmlText.ts's CELL_SELECTOR format)", () => {
    const pageText = "Seated capacity | 320 | Seated with dance | 250 | Reception | 450";
    expect(coverage("seated capacity 320", pageText)).toBeGreaterThanOrEqual(0.8);
  });
});

function pagesOf(entries: Record<string, string>): Map<string, GroundingPage> {
  const m = new Map<string, GroundingPage>();
  let id = 1;
  for (const [url, text] of Object.entries(entries)) {
    m.set(normalizeUrl(url), { text, snapshotId: id++ });
  }
  return m;
}

describe("checkGrounding", () => {
  it("passes a well-grounded quote on the stated page", () => {
    const pages = pagesOf({ "https://x.com/pricing": "Our food and beverage minimum is $6,000 on Saturdays." });
    const outcome = checkGrounding("food and beverage minimum is $6,000", "https://x.com/pricing", pages);
    expect(outcome.status).toBe("pass");
    expect(outcome.snapshotId).toBe(1);
  });

  it("fails when the stated page doesn't contain the quote at all", () => {
    const pages = pagesOf({ "https://x.com/pricing": "We host weddings and corporate events." });
    const outcome = checkGrounding("food and beverage minimum is $6,000", "https://x.com/pricing", pages);
    expect(outcome.status).not.toBe("pass");
    expect(["fail", "source_not_crawled"]).toContain(outcome.status);
  });

  it("reports source_not_crawled when the source_url was never crawled and the quote appears nowhere", () => {
    const pages = pagesOf({ "https://x.com/faq": "General wedding FAQ content unrelated to pricing." });
    const outcome = checkGrounding("food and beverage minimum is $6,000", "https://x.com/pricing", pages);
    expect(outcome.status).toBe("source_not_crawled");
  });

  it("reports grounded_elsewhere when the quote matches a different crawled page than the stated source_url", () => {
    const pages = pagesOf({
      "https://x.com/legal/terms": "The food and beverage minimum is $6,000 for Saturday events per our policy.",
      "https://x.com/pricing": "See our packages page for details.",
    });
    const outcome = checkGrounding("food and beverage minimum is $6,000 for Saturday events", "https://x.com/pricing", pages);
    expect(outcome.status).toBe("grounded_elsewhere");
    expect(outcome.matchedUrl).toBe(normalizeUrl("https://x.com/legal/terms"));
  });

  it("reports weak_quote for a short quote that's on the right page but scores softly", () => {
    const pages = pagesOf({ "https://x.com/pricing": "Rentals from $5,000." });
    const outcome = checkGrounding("$5,000", "https://x.com/pricing", pages);
    expect(["pass", "weak_quote"]).toContain(outcome.status);
  });
});
