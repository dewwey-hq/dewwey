import { describe, expect, test, it } from "vitest";
import { isOffsitePdfAllowed, sameRegistrableHost, scoreUrl } from "./urlScore";

describe("scoreUrl", () => {
  it("boosts space-name pages and links found on wedding/event pages; penalizes staff/legal/museum noise (tick c3)", () => {
    expect(scoreUrl("https://www.fieldmuseum.org/stanley-field-hall-balcony", { parentScore: 1_000_000 })).toBeGreaterThanOrEqual(7);
    expect(scoreUrl("https://www.fieldmuseum.org/east-atrium-pavilion")).toBeGreaterThanOrEqual(4);
    expect(scoreUrl("https://www.fieldmuseum.org/about/staff/profile/adam-aizenberg")).toBeLessThan(0);
    expect(scoreUrl("https://www.fieldmuseum.org/website-terms-use")).toBeLessThan(0);
    expect(scoreUrl("https://www.fieldmuseum.org/landing/internships")).toBeLessThan(0);
    expect(scoreUrl("https://hotel.com/rooms/deluxe-suite")).toBeLessThan(0);
  });
  test("weddings and policy pages score equally high", () => {
    const wedding = scoreUrl("https://venue.com/weddings");
    const policy = scoreUrl("https://venue.com/policies");
    expect(wedding).toBe(6);
    expect(policy).toBe(6);
  });

  test("orders event/rental pages above generic info pages", () => {
    const events = scoreUrl("https://venue.com/private-events");
    const about = scoreUrl("https://venue.com/about");
    expect(events).toBeGreaterThan(about!);
  });

  test("spaces/rooms only score when context word present", () => {
    expect(scoreUrl("https://venue.com/event-spaces")).toBeGreaterThanOrEqual(4);
    expect(scoreUrl("https://venue.com/spaces")).toBe(0);
  });

  test("floor-plan variants match with or without hyphen", () => {
    expect(scoreUrl("https://venue.com/floor-plans")).toBeGreaterThanOrEqual(4);
    expect(scoreUrl("https://venue.com/floorplans")).toBeGreaterThanOrEqual(4);
  });

  test("fromNav adds a bonus", () => {
    const withoutNav = scoreUrl("https://venue.com/about")!;
    const withNav = scoreUrl("https://venue.com/about", { fromNav: true })!;
    expect(withNav).toBe(withoutNav + 2);
  });

  test("lodging paths are penalized", () => {
    expect(scoreUrl("https://venue.com/rooms")).toBeLessThan(0);
    expect(scoreUrl("https://venue.com/accommodations")).toBeLessThan(0);
    expect(scoreUrl("https://venue.com/book-a-room")).toBeLessThan(0);
  });

  test("a /rooms path that also mentions event/wedding escapes the lodging penalty", () => {
    // "/rooms" alone is lodging; "/rooms/wedding" is not (negative lookahead), and gains the
    // spaces/rooms context bonus instead.
    expect(scoreUrl("https://venue.com/rooms")).toBeLessThan(0);
    expect(scoreUrl("https://venue.com/rooms/wedding")).toBeGreaterThanOrEqual(4);
  });

  test("dining is lodging noise unless it's private dining", () => {
    expect(scoreUrl("https://venue.com/dining")).toBeLessThan(0);
    const privateDining = scoreUrl("https://venue.com/dining-private-events");
    expect(privateDining).toBeGreaterThanOrEqual(0);
  });

  test("blog/news/careers noise is penalized", () => {
    expect(scoreUrl("https://venue.com/blog/our-favorite-2024-weddings")).toBeLessThan(0);
    expect(scoreUrl("https://venue.com/careers")).toBeLessThan(0);
    expect(scoreUrl("https://venue.com/news")).toBeLessThan(0);
  });

  test("tracking-param and hash-only urls are penalized as noise", () => {
    expect(scoreUrl("https://venue.com/page?utm_source=ig")).toBeLessThan(0);
    expect(scoreUrl("https://venue.com/#contact")).toBeLessThan(0);
  });

  test("pdf urls get +5 when wedding/pricing relevant, -5 otherwise", () => {
    const relevant = scoreUrl("https://venue.com/docs/wedding-packages.pdf");
    const irrelevant = scoreUrl("https://venue.com/docs/2019-annual-report.pdf");
    expect(relevant).toBeGreaterThan(irrelevant!);
    expect(irrelevant).toBeLessThan(0);
  });

  test("pdf relevance can come from anchor text alone", () => {
    const byAnchor = scoreUrl("https://venue.com/docs/download.pdf", { anchorText: "Pricing Guide" });
    expect(byAnchor).toBeGreaterThan(0);
  });

  test("skips non-html/pdf extensions outright", () => {
    expect(scoreUrl("https://venue.com/photo.jpg")).toBeNull();
    expect(scoreUrl("https://venue.com/styles.css")).toBeNull();
    expect(scoreUrl("https://venue.com/app.js")).toBeNull();
  });

  test("skips non-pdf wp-content/uploads assets but allows pdfs there", () => {
    expect(scoreUrl("https://venue.com/wp-content/uploads/2024/photo.png")).toBeNull();
    expect(scoreUrl("https://venue.com/wp-content/uploads/2024/menu.pdf")).not.toBeNull();
  });

  test("skips mailto/tel/javascript links", () => {
    expect(scoreUrl("mailto:info@venue.com")).toBeNull();
    expect(scoreUrl("tel:+13125551234")).toBeNull();
    expect(scoreUrl("javascript:void(0)")).toBeNull();
  });

  test("returns null for unparsable urls", () => {
    expect(scoreUrl("not a url")).toBeNull();
  });
});

describe("sameRegistrableHost", () => {
  test("ignores scheme and www", () => {
    expect(sameRegistrableHost("https://www.venue.com/a", "http://venue.com/b")).toBe(true);
  });

  test("different hosts are not equal", () => {
    expect(sameRegistrableHost("https://venue.com", "https://framerusercontent.com/x.pdf")).toBe(false);
  });

  test("unparsable urls are never equal", () => {
    expect(sameRegistrableHost("not a url", "https://venue.com")).toBe(false);
  });
});

describe("isOffsitePdfAllowed", () => {
  test("allows a brochure pdf on a different host", () => {
    expect(isOffsitePdfAllowed("https://framerusercontent.com/assets/abc.pdf", "Download our brochure")).toBe(true);
  });

  test("rejects an irrelevant off-site pdf", () => {
    expect(isOffsitePdfAllowed("https://cdn.example.com/random-file.pdf", "")).toBe(false);
  });

  test("matches on url alone when anchor text is absent", () => {
    expect(isOffsitePdfAllowed("https://cdn.example.com/wedding-pricing.pdf")).toBe(true);
  });
});
