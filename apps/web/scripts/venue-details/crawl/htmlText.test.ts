import { describe, expect, test } from "vitest";
import { canonicalVideoUrl, decodeHtmlEntities, extractHtml, parseAssetsBlock } from "./htmlText";

const BASE = "https://venue.com/weddings";

describe("extractHtml", () => {
  test("drops script/style content from the flowing text", async () => {
    const html = `<html><head><title>T</title><style>.a{color:red}</style></head><body>
      <script>var x = 1; document.write("bad");</script>
      <p>Real content</p>
    </body></html>`;
    const { text } = await extractHtml(html, BASE);
    expect(text).toContain("Real content");
    expect(text).not.toContain("document.write");
    expect(text).not.toContain("color:red");
  });

  test("captures the title separately from body text", async () => {
    const html = `<html><head><title>Galleria Marchetti</title></head><body><p>Hello</p></body></html>`;
    const { title, text } = await extractHtml(html, BASE);
    expect(title).toBe("Galleria Marchetti");
    expect(text).not.toContain("Galleria Marchetti");
  });

  test("joins table cells with ' | '", async () => {
    const html = `<table><tr><td>Seated</td><td>150</td></tr></table>`;
    const { text } = await extractHtml(html, BASE);
    expect(text).toContain("Seated | 150 |");
  });

  test("resolves relative links against baseUrl and separates pdf asset candidates", async () => {
    const html = `<a href="/private-events">Private Events</a><a href="/docs/brochure.pdf">Brochure</a>`;
    const { links, assetCandidates } = await extractHtml(html, BASE);
    expect(links).toEqual([{ href: "https://venue.com/private-events", text: "Private Events", fromNav: false }]);
    expect(assetCandidates).toEqual([{ href: "https://venue.com/docs/brochure.pdf", text: "Brochure" }]);
  });

  test("a <base href> overrides the document URL for relative link resolution", async () => {
    // LondonHouse-shaped fixture: fetched at /weddings/, but <base href> points at root, and
    // nav links are bare relative paths meant to resolve from root, not from /weddings/.
    const html = `<head><base href="https://londonhousechicago.com"></head><body><a href="amenities/">Amenities</a></body>`;
    const { links } = await extractHtml(html, "https://londonhousechicago.com/weddings/");
    expect(links).toEqual([{ href: "https://londonhousechicago.com/amenities/", text: "Amenities", fromNav: false }]);
  });

  test("without a <base> tag, relative links resolve against the document URL as before", async () => {
    const html = `<a href="amenities/">Amenities</a>`;
    const { links } = await extractHtml(html, "https://venue.com/weddings/");
    expect(links).toEqual([{ href: "https://venue.com/weddings/amenities/", text: "Amenities", fromNav: false }]);
  });

  test("only the first <base> tag counts", async () => {
    const html = `<base href="https://one.example/"><base href="https://two.example/"><a href="x">X</a>`;
    const { links } = await extractHtml(html, "https://venue.com/");
    expect(links).toEqual([{ href: "https://one.example/x", text: "X", fromNav: false }]);
  });

  test("detects nav/header/footer ancestry", async () => {
    const html = `
      <nav><a href="/weddings">Weddings</a></nav>
      <header><a href="/about">About</a></header>
      <main><a href="/random">Random</a></main>
      <footer><a href="/contact">Contact</a></footer>
    `;
    const { links } = await extractHtml(html, BASE);
    const byHref = Object.fromEntries(links.map((l) => [l.href, l.fromNav]));
    expect(byHref["https://venue.com/weddings"]).toBe(true);
    expect(byHref["https://venue.com/about"]).toBe(true);
    expect(byHref["https://venue.com/contact"]).toBe(true);
    expect(byHref["https://venue.com/random"]).toBe(false);
  });

  test("skips mailto/tel/hash-only links", async () => {
    const html = `<a href="mailto:a@venue.com">Email</a><a href="tel:+13125551234">Call</a><a href="#top">Top</a>`;
    const { links, assetCandidates } = await extractHtml(html, BASE);
    expect(links).toHaveLength(0);
    expect(assetCandidates).toHaveLength(0);
  });

  test("collapses whitespace and caps consecutive newlines at 3", async () => {
    const html = `<p>One</p>\n\n\n\n\n\n<p>Two</p>`;
    const { text } = await extractHtml(html, BASE);
    expect(text).not.toMatch(/\n{4,}/);
  });

  test("isJsShell is true for very short text (JS-rendered app shell)", async () => {
    const html = `<html><body><div id="root"></div></body></html>`;
    const { isJsShell, text } = await extractHtml(html, BASE);
    expect(text.length).toBeLessThan(400);
    expect(isJsShell).toBe(true);
  });

  test("isJsShell is false once there is real page content", async () => {
    const html = `<body><p>${"Real venue content. ".repeat(30)}</p></body>`;
    const { isJsShell } = await extractHtml(html, BASE);
    expect(isJsShell).toBe(false);
  });

  describe("assets (D061 resources fix)", () => {
    test("a youtube iframe is a video asset", async () => {
      const html = `<h2>Watch our space</h2><iframe src="https://www.youtube.com/embed/abc123" title="Venue Tour"></iframe>`;
      const { assets } = await extractHtml(html, BASE);
      // Canonicalized to the /watch form (tick c5) so this same video, cited elsewhere on the
      // page as a /watch link, dedupes to one asset -- see canonicalVideoUrl.
      expect(assets).toEqual([{ kind: "video", url: "https://www.youtube.com/watch?v=abc123", label: "Venue Tour" }]);
    });

    test("a matterport iframe is a virtual_tour asset, labeled from the preceding heading when it has no title", async () => {
      const html = `<h2>360 Walkthrough</h2><iframe src="https://my.matterport.com/show/?m=xyz"></iframe>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toEqual([{ kind: "virtual_tour", url: "https://my.matterport.com/show/?m=xyz", label: "360 Walkthrough" }]);
    });

    test("an iframe embedding an unrelated widget is not an asset", async () => {
      const html = `<iframe src="https://maps.google.com/embed?pb=abc"></iframe>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toHaveLength(0);
    });

    test("a <video src> is always a video asset, self-hosted host included", async () => {
      const html = `<video src="/media/reception.mp4"></video>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toEqual([{ kind: "video", url: "https://venue.com/media/reception.mp4", label: "" }]);
    });

    test('an <img alt="Floor Plan"> is a floor_plan asset', async () => {
      const html = `<img src="/images/plan1.jpg" alt="Floor Plan">`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toEqual([{ kind: "floor_plan", url: "https://venue.com/images/plan1.jpg", label: "Floor Plan" }]);
    });

    test("an unlabeled floor-plan image inherits the nearest preceding heading (Marchetti shape)", async () => {
      const html = `<h3>Floor Plans</h3><img src="https://framerusercontent.com/images/abc.jpg">`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toEqual([{ kind: "floor_plan", url: "https://framerusercontent.com/images/abc.jpg", label: "Floor Plans" }]);
    });

    test("an ordinary content image (no floor-plan signal anywhere) is not an asset", async () => {
      const html = `<h2>Our Ballroom</h2><img src="/images/ballroom-glam-shot.jpg" alt="A beautifully set ballroom">`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toHaveLength(0);
    });

    test("an <a href> to a floor-plan image under a Floor Plans heading (Geraghty shape) is a floor_plan asset", async () => {
      // Geraghty's own captions ("Ceremony & Reception (300 guests)") don't say "floor plan" --
      // the page's own "Floor Plans" heading is what marks the section as a floor-plan gallery.
      const html = `<h1>Floor Plans</h1><a href="/wp-content/uploads/2025/06/Wedding-1-Web-2048x1583.png">Ceremony & Reception (300 guests)</a>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toEqual([
        { kind: "floor_plan", url: "https://venue.com/wp-content/uploads/2025/06/Wedding-1-Web-2048x1583.png", label: "Ceremony & Reception (300 guests)" },
      ]);
    });

    test("an <a href> to a 360 tour page on the venue's own host is a virtual_tour asset", async () => {
      const html = `<a href="/360-tour-banquet-hall-rental">360 Tour</a>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toEqual([{ kind: "virtual_tour", url: "https://venue.com/360-tour-banquet-hall-rental", label: "360 Tour" }]);
    });

    test("dedupes assets by resolved URL, keeping the first label seen", async () => {
      const html = `
        <img src="/images/plan.jpg" alt="Floor Plan">
        <img src="/images/plan.jpg" alt="Floor Plan (duplicate)">
      `;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toHaveLength(1);
      expect(assets[0].label).toBe("Floor Plan");
    });

    test("appends a trailing --- ASSETS --- block to text, one line per asset, and omits it when there are none", async () => {
      const withAssets = await extractHtml(`<img src="/images/plan.jpg" alt="Floor Plan">`, BASE);
      expect(withAssets.text).toContain("--- ASSETS ---");
      expect(withAssets.text).toContain("floor_plan | https://venue.com/images/plan.jpg | Floor Plan");

      const withoutAssets = await extractHtml(`<p>Just some copy.</p>`, BASE);
      expect(withoutAssets.text).not.toContain("ASSETS");
    });
  });

  describe("tick c5 fixes: PDF anchors, entity decoding, junk filtering, video canonicalization", () => {
    test("a PDF anchor is mirrored into the ASSETS block as kind pdf, labeled from its anchor text", async () => {
      const html = `<a href="/_files/ugd/4b61b7_abc123.pdf">American & Italian Menu</a>`;
      const { text, assets, assetCandidates } = await extractHtml(html, BASE);
      expect(assets).toContainEqual({
        kind: "pdf",
        url: "https://venue.com/_files/ugd/4b61b7_abc123.pdf",
        label: "American & Italian Menu",
      });
      expect(text).toContain("pdf | https://venue.com/_files/ugd/4b61b7_abc123.pdf | American & Italian Menu");
      // assetCandidates (the pre-existing PDF pipeline) is untouched by the mirror.
      expect(assetCandidates).toEqual([
        { href: "https://venue.com/_files/ugd/4b61b7_abc123.pdf", text: "American & Italian Menu" },
      ]);
    });

    test("a PDF anchor with no text falls back to the nearest preceding heading", async () => {
      const html = `<h2>Bar Packages</h2><a href="/docs/bar.pdf"></a>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toContainEqual({ kind: "pdf", url: "https://venue.com/docs/bar.pdf", label: "Bar Packages" });
    });

    test("a PDF anchor with no text and no preceding heading falls back to the filename", async () => {
      const html = `<a href="/_files/ugd/4b61b7_hashedname.pdf"></a>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toContainEqual({ kind: "pdf", url: "https://venue.com/_files/ugd/4b61b7_hashedname.pdf", label: "4b61b7_hashedname.pdf" });
    });

    test("decodes &amp; in an img src (Marchetti floor-plan shape)", async () => {
      const html = `<h3>Floor Plans</h3><img src="/images/plan.jpg?width=792&amp;height=612">`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toEqual([
        { kind: "floor_plan", url: "https://venue.com/images/plan.jpg?width=792&height=612", label: "Floor Plans" },
      ]);
    });

    test("a data: URI image is never an asset, even with a floor-plan alt (Field Museum shape)", async () => {
      const html = `<img src="data:image/svg+xml;base64,PHN2ZyAvPg==" alt="Floor Plan">`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toHaveLength(0);
    });

    test("a tracking pixel / 1x1 image is not an asset even with floor-plan wording nearby", async () => {
      const html1 = `<h2>Floor Plans</h2><img src="/px/pixel.gif">`;
      expect((await extractHtml(html1, BASE)).assets).toHaveLength(0);
      const html2 = `<img src="/images/plan.jpg" alt="Floor Plan" width="1" height="1">`;
      expect((await extractHtml(html2, BASE)).assets).toHaveLength(0);
    });

    test("a youtube channel/user/handle URL is not a video asset", async () => {
      const urls = [
        "https://www.youtube.com/@SomeVenue",
        "https://www.youtube.com/channel/UC12345",
        "https://www.youtube.com/user/someuser",
        "https://www.youtube.com/c/somevenue",
      ];
      for (const href of urls) {
        const html = `<a href="${href}">Follow us</a>`;
        const { assets } = await extractHtml(html, BASE);
        expect(assets, href).toHaveLength(0);
      }
    });

    test("a vimeo user/channel URL (non-numeric path) is not a video asset", async () => {
      const html = `<a href="https://vimeo.com/someuser">Our Vimeo</a>`;
      const { assets } = await extractHtml(html, BASE);
      expect(assets).toHaveLength(0);
    });

    test("a youtube watch URL is kept and canonicalized, matching an equivalent embed URL", async () => {
      const watch = await extractHtml(`<a href="https://www.youtube.com/watch?v=abc123&list=xyz">Watch</a>`, BASE);
      expect(watch.assets).toEqual([{ kind: "video", url: "https://www.youtube.com/watch?v=abc123", label: "Watch" }]);

      const embed = await extractHtml(`<iframe src="https://www.youtube.com/embed/abc123" title="Watch"></iframe>`, BASE);
      expect(embed.assets).toEqual([{ kind: "video", url: "https://www.youtube.com/watch?v=abc123", label: "Watch" }]);
    });

    test("a youtu.be short link is kept and canonicalized to the same watch URL", async () => {
      const { assets } = await extractHtml(`<a href="https://youtu.be/abc123">Video</a>`, BASE);
      expect(assets).toEqual([{ kind: "video", url: "https://www.youtube.com/watch?v=abc123", label: "Video" }]);
    });

    test("a vimeo URL with tracking query params is canonicalized, dropping the query", async () => {
      const { assets } = await extractHtml(`<a href="https://vimeo.com/123456789?fl=pl&amp;fe=ti">Tour</a>`, BASE);
      expect(assets).toEqual([{ kind: "video", url: "https://vimeo.com/123456789", label: "Tour" }]);
    });

    test("a vimeo URL with a privacy hash segment keeps the hash when canonicalized", async () => {
      const { assets } = await extractHtml(`<a href="https://vimeo.com/123456789/abcdef1234?extra=1">Tour</a>`, BASE);
      expect(assets).toEqual([{ kind: "video", url: "https://vimeo.com/123456789/abcdef1234", label: "Tour" }]);
    });

    test("a player.vimeo.com embed with an h= privacy hash canonicalizes to the same URL as the vimeo.com link", async () => {
      const { assets } = await extractHtml(
        `<iframe src="https://player.vimeo.com/video/123456789?h=abcdef1234&amp;fl=pl" title="Tour"></iframe>`,
        BASE
      );
      expect(assets).toEqual([{ kind: "video", url: "https://vimeo.com/123456789/abcdef1234", label: "Tour" }]);
    });
  });
});

describe("decodeHtmlEntities", () => {
  test("decodes named entities", () => {
    expect(decodeHtmlEntities("a &amp; b")).toBe("a & b");
    expect(decodeHtmlEntities("&quot;hi&quot;")).toBe('"hi"');
    expect(decodeHtmlEntities("a &lt; b &gt; c")).toBe("a < b > c");
    expect(decodeHtmlEntities("it&apos;s")).toBe("it's");
  });

  test("decodes numeric and hex entities", () => {
    expect(decodeHtmlEntities("width=792&#38;height=612")).toBe("width=792&height=612");
    expect(decodeHtmlEntities("width=792&#x26;height=612")).toBe("width=792&height=612");
  });

  test("leaves plain strings and unrecognized entities untouched", () => {
    expect(decodeHtmlEntities("https://venue.com/a?b=1")).toBe("https://venue.com/a?b=1");
    expect(decodeHtmlEntities("&notarealentity;")).toBe("&notarealentity;");
  });

  test("returns the input as-is when there is no ampersand at all", () => {
    expect(decodeHtmlEntities("no entities here")).toBe("no entities here");
  });
});

describe("canonicalVideoUrl", () => {
  test("canonicalizes youtube watch/embed/short-link forms to the same URL", () => {
    expect(canonicalVideoUrl("https://www.youtube.com/watch?v=abc123&list=xyz")).toBe("https://www.youtube.com/watch?v=abc123");
    expect(canonicalVideoUrl("https://www.youtube.com/embed/abc123")).toBe("https://www.youtube.com/watch?v=abc123");
    expect(canonicalVideoUrl("https://youtu.be/abc123")).toBe("https://www.youtube.com/watch?v=abc123");
  });

  test("canonicalizes vimeo forms, keeping a privacy hash and dropping query params", () => {
    expect(canonicalVideoUrl("https://vimeo.com/123456789?fl=pl&fe=ti")).toBe("https://vimeo.com/123456789");
    expect(canonicalVideoUrl("https://vimeo.com/123456789/abcdef1234?extra=1")).toBe("https://vimeo.com/123456789/abcdef1234");
    expect(canonicalVideoUrl("https://player.vimeo.com/video/123456789?h=abcdef1234&fl=pl")).toBe(
      "https://vimeo.com/123456789/abcdef1234"
    );
    expect(canonicalVideoUrl("https://player.vimeo.com/video/123456789")).toBe("https://vimeo.com/123456789");
  });

  test("leaves non-video URLs (including channel/user pages) unchanged", () => {
    expect(canonicalVideoUrl("https://www.youtube.com/channel/UC12345")).toBe("https://www.youtube.com/channel/UC12345");
    expect(canonicalVideoUrl("https://vimeo.com/someuser")).toBe("https://vimeo.com/someuser");
    expect(canonicalVideoUrl("https://venue.com/media/reception.mp4")).toBe("https://venue.com/media/reception.mp4");
  });

  test("returns the input unchanged when it isn't a valid URL", () => {
    expect(canonicalVideoUrl("not a url")).toBe("not a url");
  });
});

describe("parseAssetsBlock", () => {
  it("keeps a clean URL when the label is empty (dangling separator)", () => {
    const text = "page text\n\n--- ASSETS ---\nvideo | https://vimeo.com/325970909 | \n";
    expect(parseAssetsBlock(text)).toEqual([{ kind: "video", url: "https://vimeo.com/325970909", label: "" }]);
  });
  test("round-trips extractHtml's own appended block", async () => {
    const html = `<h2>Floor Plans</h2><img src="/images/plan.jpg" alt="Floor Plan"><iframe src="https://www.youtube.com/embed/abc" title="Tour Video"></iframe>`;
    const { text } = await extractHtml(html, BASE);
    const assets = parseAssetsBlock(text);
    expect(assets).toEqual(
      expect.arrayContaining([
        { kind: "floor_plan", url: "https://venue.com/images/plan.jpg", label: "Floor Plan" },
        { kind: "video", url: "https://www.youtube.com/watch?v=abc", label: "Tour Video" },
      ])
    );
    expect(assets).toHaveLength(2);
  });

  test("returns [] for text with no ASSETS block", () => {
    expect(parseAssetsBlock("Just some plain crawled page text.")).toEqual([]);
  });

  test("ignores a line with an unrecognized kind", () => {
    const text = `Some page text.\n\n--- ASSETS ---\nbogus_kind | https://venue.com/x.jpg | Something\nvideo | https://venue.com/v.mp4 | A Video`;
    expect(parseAssetsBlock(text)).toEqual([{ kind: "video", url: "https://venue.com/v.mp4", label: "A Video" }]);
  });

  test("a label containing ' | ' is rejoined rather than truncated", () => {
    const text = `\n\n--- ASSETS ---\nvideo | https://venue.com/v.mp4 | Ceremony | Reception Tour`;
    expect(parseAssetsBlock(text)).toEqual([{ kind: "video", url: "https://venue.com/v.mp4", label: "Ceremony | Reception Tour" }]);
  });
});
