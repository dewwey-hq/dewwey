import { describe, expect, test } from "vitest";
import type { HtmlLink } from "./htmlText";
import {
  COMMON_WEDDING_PATHS,
  isRootUsableWeddingPage,
  isWeddingUrlCandidate,
  pickHomepageLinkWeddingPage,
  pickLegacyWeddingPage,
  probeCommonWeddingPaths,
  SECONDARY_PAGE_RE,
  urlIsWeddingPage,
  WEDDING_PAGE_RE,
  WEDDING_STRICT_RE,
  type LegacyPage,
} from "./weddingPage";

function link(href: string, text: string, fromNav = false): HtmlLink {
  return { href, text, fromNav };
}

// ---------------------------------------------------------------------------
// Regex positives/negatives
// ---------------------------------------------------------------------------

describe("WEDDING_STRICT_RE / WEDDING_PAGE_RE", () => {
  test("strict matches wedding/bridal/nuptial", () => {
    expect(WEDDING_STRICT_RE.test("/weddings")).toBe(true);
    expect(WEDDING_STRICT_RE.test("/bridal-suite")).toBe(true);
    expect(WEDDING_STRICT_RE.test("/nuptial-info")).toBe(true);
    expect(WEDDING_STRICT_RE.test("/private-events")).toBe(false);
  });

  test("broad also matches event-rental synonyms strict doesn't", () => {
    expect(WEDDING_PAGE_RE.test("/private-events")).toBe(true);
    expect(WEDDING_PAGE_RE.test("/special-event")).toBe(true);
    expect(WEDDING_PAGE_RE.test("/host-an-event")).toBe(true);
    expect(WEDDING_PAGE_RE.test("/venue-rental")).toBe(true);
    expect(WEDDING_PAGE_RE.test("/celebrate-with-us")).toBe(true);
  });
});

describe("SECONDARY_PAGE_RE / isRootUsableWeddingPage", () => {
  test("matches gallery/photo/inquiry/form/contact/blog/faq/rsvp/registry/guest pages", () => {
    expect(SECONDARY_PAGE_RE.test("/gallery/wedding")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/photos")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/private-event-inquiry-form")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/contact")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/blog/wedding-trends")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/faq")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/rsvp")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/registry")).toBe(true);
    expect(SECONDARY_PAGE_RE.test("/wedding-guest-info")).toBe(true);
  });

  test("does not match a real info page", () => {
    expect(SECONDARY_PAGE_RE.test("/portfolio/wedding-venue")).toBe(false);
    expect(SECONDARY_PAGE_RE.test("/weddings")).toBe(false);
    expect(SECONDARY_PAGE_RE.test("/venue-rentals/event-spaces")).toBe(false);
  });

  test('regression (account 687 Adler Planetarium, account 1329 Chicago Botanic Garden): a '
    + "root that is a broad (not strict) match and not secondary is a usable fallback", () => {
    expect(isRootUsableWeddingPage("https://www.adlerplanetarium.org/venue-rentals/")).toBe(true);
    expect(isRootUsableWeddingPage("https://www.chicagobotanic.org/private-events")).toBe(true);
  });

  test("a root that only matches via a secondary term is not a usable fallback", () => {
    expect(isRootUsableWeddingPage("https://venue.com/venue-rentals/private-event-inquiry-form")).toBe(false);
  });

  test("a root with no wedding/event relevance at all is not a usable fallback", () => {
    expect(isRootUsableWeddingPage("https://venue.com/about")).toBe(false);
  });
});

describe("isWeddingUrlCandidate / urlIsWeddingPage", () => {
  test("/weddings is a strict match with no urlScore veto", () => {
    expect(isWeddingUrlCandidate("https://venue.com/weddings", WEDDING_STRICT_RE)).toBe(true);
    expect(urlIsWeddingPage("https://venue.com/weddings")).toBe(true);
  });

  test("decision: /wedding-guest-info (a hotel logistics page) is a raw isWeddingUrlCandidate "
    + "match -- nothing in urlScore penalizes it, so the regex alone would otherwise decide -- "
    + "but urlIsWeddingPage additionally excludes it as a secondary (\"guest\") page, since it's "
    + "a logistics page for someone else's wedding rather than the venue's own wedding-info "
    + "page (SECONDARY_PAGE_RE, added after the 2026-09-14 calibration re-check)", () => {
    expect(isWeddingUrlCandidate("https://hotel.com/wedding-guest-info", WEDDING_STRICT_RE)).toBe(true);
    expect(urlIsWeddingPage("https://hotel.com/wedding-guest-info")).toBe(false);
  });

  test("decision: /blog/wedding-trends does NOT count -- /blog drags urlScore negative, "
    + "vetoing the otherwise-matching path (reuses urlScore, per spec)", () => {
    expect(urlIsWeddingPage("https://venue.com/blog/wedding-trends")).toBe(false);
  });

  test("a wedding-flavored domain name alone (no path match) is not a candidate", () => {
    // The regex is tested against the pathname, not the hostname, so a domain like
    // chezweddingvenue.com doesn't trip the check on its bare homepage path "/".
    expect(urlIsWeddingPage("http://chezweddingvenue.com/")).toBe(false);
  });

  test("non-strict broad terms are rejected by the strict check", () => {
    expect(urlIsWeddingPage("https://venue.com/private-events")).toBe(false);
  });

  test('regression (2026-09-14, account 58 offshorerooftop.com): a non-html/pdf asset whose '
    + "filename happens to match the broad regex (a JPEG named "
    + '"Host-an-event-with-us.jpg") is rejected, not just a negative-scored path -- '
    + "scoreUrl returns null (skip outright) for asset extensions, and null must veto here "
    + "exactly like a negative score does", () => {
    expect(
      isWeddingUrlCandidate(
        "https://www.offshorerooftop.com/wp-content/uploads/2022/05/Host-an-event-with-us.jpg",
        WEDDING_PAGE_RE
      )
    ).toBe(false);
  });

  test("regression: a wedding-named PDF is NOT vetoed by the null-score check (PDFs are a "
    + "legitimate page kind, just not html)", () => {
    expect(isWeddingUrlCandidate("https://venue.com/wedding-packages.pdf", WEDDING_STRICT_RE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (a) legacy_enrichment_pages
// ---------------------------------------------------------------------------

describe("pickLegacyWeddingPage", () => {
  test("returns null for an empty list", () => {
    expect(pickLegacyWeddingPage([])).toBeNull();
  });

  test("returns null when nothing matches the strict regex", () => {
    const pages: LegacyPage[] = [
      { url: "https://venue.com/", depth: 0, context: "neutral" },
      { url: "https://venue.com/about-us", depth: 1, context: "neutral" },
    ];
    expect(pickLegacyWeddingPage(pages)).toBeNull();
  });

  test("picks the shortest-path match among several", () => {
    const pages: LegacyPage[] = [
      { url: "https://www.diamondgardenhall.com/royal-garden-banquet-hall-chicago", depth: 3, context: "wedding" },
      { url: "https://www.diamondgardenhall.com/weddings", depth: 3, context: "wedding" },
      { url: "https://www.diamondgardenhall.com/wedding", depth: 3, context: "wedding" },
    ];
    const result = pickLegacyWeddingPage(pages);
    expect(result).toEqual({
      url: "https://www.diamondgardenhall.com/wedding",
      source: "legacy_enrichment_pages",
      evidence: "https://www.diamondgardenhall.com/wedding",
      isSecondary: false,
    });
  });

  test("ignores duplicate urls and non-matching context field (context is informational only, "
    + "the strict regex on the url is what decides)", () => {
    const pages: LegacyPage[] = [
      { url: "https://venue.com/weddings", depth: 1, context: "non_wedding" },
      { url: "https://venue.com/weddings", depth: 3, context: "wedding" },
    ];
    expect(pickLegacyWeddingPage(pages)).toEqual({
      url: "https://venue.com/weddings",
      source: "legacy_enrichment_pages",
      evidence: "https://venue.com/weddings",
      isSecondary: false,
    });
  });

  test("still applies the urlScore veto (a legacy /blog/wedding-trends page is rejected)", () => {
    const pages: LegacyPage[] = [{ url: "https://venue.com/blog/wedding-trends", depth: 1, context: "wedding" }];
    expect(pickLegacyWeddingPage(pages)).toBeNull();
  });

  test("malformed entries (missing url) are skipped without throwing", () => {
    const pages = [{ depth: 1 }, { url: "https://venue.com/weddings" }] as LegacyPage[];
    expect(pickLegacyWeddingPage(pages)?.url).toBe("https://venue.com/weddings");
  });

  test('decision: same-property scoping -- a chain hotel\'s crawl can include sibling '
    + "properties on the same host; the shortest-path match must still be under the same "
    + "property path as the crawl's own root, not just anywhere on the host. Reproduces the "
    + "2026-09-14 measurement bug: account 654 (The Ritz-Carlton, Chicago) previously picked "
    + "The Ritz-Carlton Abama's (Tenerife) wedding page because its slug was one character "
    + "shorter than Chicago's own", () => {
    const pages: LegacyPage[] = [
      { url: "https://www.ritzcarlton.com/en/hotels/chirz-the-ritz-carlton-chicago/events", depth: 0, context: "neutral" },
      { url: "https://www.ritzcarlton.com/en/hotels/chirz-the-ritz-carlton-chicago/weddings", depth: 1, context: "wedding" },
      { url: "https://www.ritzcarlton.com/en/hotels/tfsrz-the-ritz-carlton-abama/weddings", depth: 3, context: "wedding" },
      { url: "https://www.ritzcarlton.com/en/hotels-and-resorts/meetings-and-celebrations/weddings", depth: 2, context: "wedding" },
    ];
    const result = pickLegacyWeddingPage(pages);
    expect(result?.url).toBe("https://www.ritzcarlton.com/en/hotels/chirz-the-ritz-carlton-chicago/weddings");
  });

  test("same-property scoping is a no-op for an ordinary single-property site (root path has "
    + "at most one segment, so the required prefix is empty)", () => {
    const pages: LegacyPage[] = [
      { url: "https://www.diamondgardenhall.com/", depth: 0, context: "neutral" },
      { url: "https://www.diamondgardenhall.com/weddings", depth: 3, context: "wedding" },
      { url: "https://www.diamondgardenhall.com/wedding", depth: 3, context: "wedding" },
    ];
    expect(pickLegacyWeddingPage(pages)?.url).toBe("https://www.diamondgardenhall.com/wedding");
  });

  test("same-property scoping considers each host independently: a wrong-property page on one "
    + "host doesn't block a correctly-scoped match on a different host", () => {
    const pages: LegacyPage[] = [
      { url: "https://www.chainhotel.com/en/hotels/other-property/weddings", depth: 3, context: "wedding" },
      { url: "https://ownbrandsite.com/", depth: 0, context: "neutral" },
      { url: "https://ownbrandsite.com/weddings", depth: 1, context: "wedding" },
    ];
    expect(pickLegacyWeddingPage(pages)?.url).toBe("https://ownbrandsite.com/weddings");
  });

  test('regression (2026-09-14 calibration re-check, account 507 The Geraghty): a primary '
    + '"/portfolio/wedding-venue" info page is preferred over a shorter but secondary '
    + '"/gallery/wedding" photo gallery, even though the gallery path is shorter', () => {
    const pages: LegacyPage[] = [
      { url: "https://thegeraghty.com/", depth: 0, context: "neutral" },
      { url: "https://thegeraghty.com/portfolio/wedding-venue", depth: 3, context: "wedding" },
      { url: "https://thegeraghty.com/gallery/wedding", depth: 3, context: "wedding" },
    ];
    const result = pickLegacyWeddingPage(pages);
    expect(result?.url).toBe("https://thegeraghty.com/portfolio/wedding-venue");
    expect(result?.isSecondary).toBe(false);
  });

  test("falls back to the secondary gallery page when it's the only strict match at all", () => {
    const pages: LegacyPage[] = [
      { url: "https://thegeraghty.com/", depth: 0, context: "neutral" },
      { url: "https://thegeraghty.com/gallery/wedding", depth: 3, context: "wedding" },
    ];
    const result = pickLegacyWeddingPage(pages);
    expect(result?.url).toBe("https://thegeraghty.com/gallery/wedding");
    expect(result?.isSecondary).toBe(true);
    expect(result?.evidence).toContain("secondary page");
  });
});

// ---------------------------------------------------------------------------
// (b) homepage_link
// ---------------------------------------------------------------------------

describe("pickHomepageLinkWeddingPage", () => {
  const root = "https://venue.com/";

  test("returns null when there are no same-host wedding-relevant links", () => {
    const links = [link("https://venue.com/about", "About"), link("https://other.com/weddings", "Weddings")];
    expect(pickHomepageLinkWeddingPage(links, root)).toBeNull();
  });

  test("strict match on href wins outright", () => {
    const links = [link("https://venue.com/about", "About"), link("https://venue.com/weddings", "Get married here")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result).toEqual({
      url: "https://venue.com/weddings",
      source: "homepage_link",
      evidence: "https://venue.com/weddings",
      isSecondary: false,
    });
  });

  test("strict match via anchor text alone (href itself doesn't match) -- but the href is a "
    + "secondary (\"inquire\") page, so it's used only as a fallback since it's the sole candidate", () => {
    const links = [link("https://venue.com/events/inquire", "Weddings & Celebrations")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result).toEqual({
      url: "https://venue.com/events/inquire",
      source: "homepage_link",
      evidence: "Weddings & Celebrations (secondary page -- no primary wedding page found in homepage links)",
      isSecondary: true,
    });
  });

  test("strict tier beats broad tier: a strict nav-text match wins over a broad-only href", () => {
    const links = [link("https://venue.com/private-events", "Private Events"), link("https://venue.com/celebrate", "Weddings")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result?.url).toBe("https://venue.com/celebrate");
  });

  test("broad fallback only matches on href, never on anchor text alone", () => {
    // "Celebrate" as anchor text with a non-matching href should not qualify at the broad tier.
    const links = [link("https://venue.com/info", "Celebrate With Us")];
    expect(pickHomepageLinkWeddingPage(links, root)).toBeNull();
  });

  test("broad fallback matches an href like /private-events when nothing strict exists", () => {
    const links = [link("https://venue.com/private-events", "Learn more")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result).toEqual({
      url: "https://venue.com/private-events",
      source: "homepage_link",
      evidence: "https://venue.com/private-events",
      isSecondary: false,
    });
  });

  test('regression (2026-09-14 calibration re-check, account 687 Adler Planetarium): when the '
    + "only broad-tier match is a secondary inquiry form, it's still returned (this picker has "
    + "nothing better), flagged isSecondary so the caller can prefer the root URL instead", () => {
    const links = [link("https://venue.com/venue-rentals/private-event-inquiry-form", "Inquire Now")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result?.url).toBe("https://venue.com/venue-rentals/private-event-inquiry-form");
    expect(result?.isSecondary).toBe(true);
    expect(result?.evidence).toContain("secondary page");
  });

  test("a primary broad-tier candidate is preferred over a secondary one in the same tier", () => {
    const links = [
      link("https://venue.com/venue-rentals/private-event-inquiry-form", "Inquire Now"),
      link("https://venue.com/venue-rentals/event-spaces", "Event Spaces"),
    ];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result?.url).toBe("https://venue.com/venue-rentals/event-spaces");
    expect(result?.isSecondary).toBe(false);
  });

  test("nav links are preferred over non-nav links within the same tier", () => {
    const links = [
      link("https://venue.com/blog/our-2024-weddings", "Weddings", false),
      link("https://venue.com/weddings", "Weddings", true),
    ];
    const result = pickHomepageLinkWeddingPage(links, root);
    // The blog link is also urlScore-vetoed (negative), so nav-preference and the veto agree here,
    // but the nav link is picked regardless of ordering in the input array.
    expect(result?.url).toBe("https://venue.com/weddings");
  });

  test("shortest path breaks a tie between two strict matches of equal nav/term priority", () => {
    const links = [link("https://venue.com/weddings/photos/gallery", "Weddings"), link("https://venue.com/weddings", "Weddings")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result?.url).toBe("https://venue.com/weddings");
  });

  test('"wedding" beats "private events": since "wedding" is always a strict match (it\'s part '
    + "of WEDDING_STRICT_RE), a wedding-named page wins outright over a private-events page via "
    + "the strict-tier-before-broad-tier rule, even when the private-events path is shorter", () => {
    const links = [link("https://venue.com/private-events", "Info"), link("https://venue.com/host-your-wedding-day", "Info")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result?.url).toBe("https://venue.com/host-your-wedding-day");
  });

  test("within the broad tier alone (neither candidate is a strict match), term priority still "
    + "orders by wedding-specificity: 'celebrate' outranks 'private events'", () => {
    const links = [link("https://venue.com/private-events", "Info"), link("https://venue.com/celebrate-with-us", "Info")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result?.url).toBe("https://venue.com/celebrate-with-us");
  });

  test("only same-registrable-host links are considered", () => {
    const links = [link("https://booking-partner.com/weddings", "Weddings")];
    expect(pickHomepageLinkWeddingPage(links, root)).toBeNull();
  });

  test("a urlScore-vetoed href (e.g. /blog/wedding-trends) does not count as a strict href match, "
    + "but the strict tier still catches it via anchor text if the text itself says 'wedding' -- "
    + "though as a secondary (\"/blog\") page it's used only because it's the sole candidate", () => {
    const links = [link("https://venue.com/blog/wedding-trends", "Our Favorite Weddings")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result).toEqual({
      url: "https://venue.com/blog/wedding-trends",
      source: "homepage_link",
      evidence: "Our Favorite Weddings (secondary page -- no primary wedding page found in homepage links)",
      isSecondary: true,
    });
  });

  test("a primary candidate in the same tier is preferred over a secondary one, "
    + "regardless of path length or nav preference", () => {
    const links = [link("https://venue.com/weddings/gallery", "Wedding Gallery", true), link("https://venue.com/weddings-info", "Weddings")];
    const result = pickHomepageLinkWeddingPage(links, root);
    expect(result?.url).toBe("https://venue.com/weddings-info");
    expect(result?.isSecondary).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (c) common_path
// ---------------------------------------------------------------------------

/** `fetch`'s first parameter is `RequestInfo | URL` = `string | Request | URL` -- `Request` has
 * `.url`, `URL` has `.href` instead, so a plain `input.url` doesn't typecheck once `input` isn't
 * `any`. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("probeCommonWeddingPaths", () => {
  function fakeFetch(
    responses: Record<string, { status: number; contentType?: string; body?: string; redirectedTo?: string }>
  ): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const canonical = new URL(url).pathname;
      const spec = responses[canonical];
      if (!spec) {
        return new Response("", { status: 404 });
      }
      const finalUrl = spec.redirectedTo ?? url;
      return {
        status: spec.status,
        redirected: spec.redirectedTo !== undefined,
        url: finalUrl,
        headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? spec.contentType ?? null : null) },
        text: async () => spec.body ?? "",
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  const wordyWeddingBody = `<html><body><h1>Weddings</h1><p>${"Plan your wedding day with us. ".repeat(30)}</p></body></html>`;
  const thinSoft404Body = `<html><body><p>Page not found. Redirecting to our homepage. Weddings mentioned once.</p></body></html>`;

  test("returns null when no common path responds", async () => {
    const result = await probeCommonWeddingPaths("https://venue.com/", fakeFetch({}));
    expect(result).toBeNull();
  });

  test("accepts the first common path that is a real, sufficiently long, wedding-matching page", async () => {
    const fetchImpl = fakeFetch({ "/weddings": { status: 200, contentType: "text/html", body: wordyWeddingBody } });
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result).toEqual({ url: "https://venue.com/weddings", source: "common_path", evidence: "/weddings", isSecondary: false });
  });

  test("respects COMMON_WEDDING_PATHS priority order (first listed path wins if multiple qualify)", async () => {
    const fetchImpl = fakeFetch({
      "/weddings": { status: 200, contentType: "text/html", body: wordyWeddingBody },
      "/wedding": { status: 200, contentType: "text/html", body: wordyWeddingBody },
    });
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result?.evidence).toBe(COMMON_WEDDING_PATHS[0]);
  });

  test("rejects a soft-404 shell: thin text even though it mentions 'wedding' once", async () => {
    const fetchImpl = fakeFetch({ "/weddings": { status: 200, contentType: "text/html", body: thinSoft404Body } });
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result).toBeNull();
  });

  test("rejects a long page that never actually mentions wedding/bridal/nuptial", async () => {
    const longNonWeddingBody = `<html><body><p>${"Book your corporate meeting or private event here today. ".repeat(20)}</p></body></html>`;
    const fetchImpl = fakeFetch({ "/weddings": { status: 200, contentType: "text/html", body: longNonWeddingBody } });
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result).toBeNull();
  });

  test("rejects a non-200 status (redirect-to-home masquerading as 200 elsewhere is fine, "
    + "but a 404/301 is not)", async () => {
    const fetchImpl = fakeFetch({ "/weddings": { status: 404, contentType: "text/html", body: wordyWeddingBody } });
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result).toBeNull();
  });

  test("rejects a non-html content-type", async () => {
    const fetchImpl = fakeFetch({ "/weddings": { status: 200, contentType: "application/pdf", body: wordyWeddingBody } });
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result).toBeNull();
  });

  test("a fetch error on one path falls through to try the next", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (new URL(url).pathname === "/weddings") throw new Error("network error");
      if (new URL(url).pathname === "/wedding") {
        return new Response(wordyWeddingBody, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result?.evidence).toBe("/wedding");
  });

  test("accepts a trivial redirect (trailing slash / scheme-www canonicalization) to the same path", async () => {
    const fetchImpl = fakeFetch({
      "/weddings": { status: 200, contentType: "text/html", body: wordyWeddingBody, redirectedTo: "https://www.venue.com/weddings/" },
    });
    const result = await probeCommonWeddingPaths("https://venue.com/", fetchImpl);
    expect(result?.url).toBe("https://www.venue.com/weddings/");
  });

  test('decision: rejects a "did you mean" style redirect to an unrelated path, even though the '
    + "target otherwise passes every other check -- measured 2026-09-14 against "
    + "chicagoreader.com, whose /events/weddings redirects to a film review titled "
    + '"Weddings and Other Disasters" (200, html, long, contains "wedding")', async () => {
    const fetchImpl = fakeFetch({
      "/events/weddings": {
        status: 200,
        contentType: "text/html",
        body: wordyWeddingBody,
        redirectedTo: "https://chicagoreader.com/film-tv/weddings-and-other-disasters/",
      },
    });
    const result = await probeCommonWeddingPaths("https://chicagoreader.com/", fetchImpl);
    expect(result).toBeNull();
  });
});
