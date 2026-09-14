/**
 * HTML -> plain text + link extraction for the venue-details crawl, via Bun's built-in
 * `HTMLRewriter` (no cheerio — see the plan). `.transform()` runs synchronously against the
 * input as it streams through a `Response` body; we drive that stream with `.text()` and
 * accumulate chunks in element/text handlers rather than reading the (unused) rewritten
 * output.
 */

export interface HtmlLink {
  /** Resolved absolute URL, or the raw href if it couldn't be resolved against baseUrl. */
  href: string;
  text: string;
  fromNav: boolean;
}

export interface ExtractHtmlResult {
  text: string;
  title: string;
  /** Non-PDF links (candidate crawl targets). */
  links: HtmlLink[];
  /** PDF links found in the page (`crawlVenue.ts` treats these as fetchable assets). */
  assetCandidates: { href: string; text: string }[];
  /** `text.length < 400` — a strong signal of a JS-rendered shell with no server text. */
  isJsShell: boolean;
}

/** Tags whose content must never reach the flowing text (script/style/etc.) or the title
 * (head — captured separately by the dedicated title handler below). */
const SKIP_SELECTOR = "script, style, noscript, svg, template, iframe, head";
const NAV_SELECTOR = "nav, header, footer, [role='navigation']";
const BLOCK_SELECTOR = "p, div, section, article, li, tr, h1, h2, h3, h4, h5, h6, br, dt, dd, blockquote";
const CELL_SELECTOR = "td, th";

function resolveHref(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

/** `el.onEndTag` throws "No end tag" for void/self-closing elements (e.g. `<br>`, a
 * self-closed `<iframe/>`) — fall back to running the callback immediately for those. */
function onEndTagSafe(el: HTMLRewriterTypes.Element, cb: () => void): void {
  try {
    el.onEndTag(cb);
  } catch {
    cb();
  }
}

function collapseWhitespace(raw: string): string {
  return raw
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractHtml(html: string, baseUrl: string): Promise<ExtractHtmlResult> {
  const textParts: string[] = [];
  const links: HtmlLink[] = [];
  const assetCandidates: { href: string; text: string }[] = [];

  let title = "";
  let inTitle = false;
  let skipDepth = 0;
  let navDepth = 0;
  let currentHref: string | null = null;
  let currentLinkParts: string[] = [];
  let currentLinkFromNav = false;
  // Per the HTML spec, a `<base href>` (only the first one counts) overrides the document URL
  // as the base for every relative link on the page -- common on CMS sites (WordPress, this
  // repo's LondonHouse fixture) whose nav uses bare relative paths meant to resolve from root
  // regardless of how deep the current URL's own path is. Without this, following e.g.
  // `href="amenities/"` from `.../weddings/` wrongly nests to `.../weddings/amenities/` (404)
  // instead of the real `.../amenities/`.
  let baseHref: string | null = null;

  const rewriter = new HTMLRewriter()
    .on("base[href]", {
      element(el) {
        if (baseHref === null) baseHref = el.getAttribute("href");
      },
    })
    .on(SKIP_SELECTOR, {
      element(el) {
        skipDepth++;
        onEndTagSafe(el, () => {
          skipDepth = Math.max(0, skipDepth - 1);
        });
      },
    })
    .on(NAV_SELECTOR, {
      element(el) {
        navDepth++;
        onEndTagSafe(el, () => {
          navDepth = Math.max(0, navDepth - 1);
        });
      },
    })
    .on("title", {
      element(el) {
        inTitle = true;
        onEndTagSafe(el, () => {
          inTitle = false;
        });
      },
      text(chunk) {
        if (inTitle) title += chunk.text;
      },
    })
    .on(BLOCK_SELECTOR, {
      element(el) {
        onEndTagSafe(el, () => {
          textParts.push("\n");
        });
      },
    })
    .on(CELL_SELECTOR, {
      element(el) {
        onEndTagSafe(el, () => {
          textParts.push(" | ");
        });
      },
    })
    .on("a[href]", {
      element(el) {
        const href = el.getAttribute("href") ?? "";
        currentHref = href;
        currentLinkParts = [];
        currentLinkFromNav = navDepth > 0;
        onEndTagSafe(el, () => {
          const href2 = currentHref;
          const text = currentLinkParts.join("").replace(/\s+/g, " ").trim();
          currentHref = null;
          if (!href2 || href2.startsWith("#") || /^mailto:/i.test(href2) || /^tel:/i.test(href2) || /^javascript:/i.test(href2)) {
            return;
          }
          const effectiveBase = baseHref ? resolveHref(baseHref, baseUrl) : baseUrl;
          const resolved = resolveHref(href2, effectiveBase);
          if (/\.pdf(\?|#|$)/i.test(resolved)) {
            assetCandidates.push({ href: resolved, text });
          } else {
            links.push({ href: resolved, text, fromNav: currentLinkFromNav });
          }
        });
      },
      text(chunk) {
        if (currentHref !== null) currentLinkParts.push(chunk.text);
      },
    })
    .on("*", {
      text(chunk) {
        if (skipDepth === 0) textParts.push(chunk.text);
      },
    });

  const response = rewriter.transform(new Response(html));
  await response.text();

  const text = collapseWhitespace(textParts.join(""));

  return {
    text,
    title: title.replace(/\s+/g, " ").trim(),
    links,
    assetCandidates,
    isJsShell: text.length < 400,
  };
}
