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

/** A resource embed/image found on the page — D061 resources fix (see the plan note on golden
 * resources recall: iframe/video/matterport embeds and floor-plan images were previously invisible
 * to the extractor). `pdf` (tick c5 fix) is a PDF anchor mirrored into this block so its label
 * survives even when `venue_source_snapshots.title` is null for an already-crawled PDF
 * (insert-only) — `assetCandidates` still carries every PDF anchor independently, unchanged. */
export type AssetKind = "video" | "virtual_tour" | "floor_plan" | "pdf";

export interface Asset {
  kind: AssetKind;
  /** Resolved absolute URL. */
  url: string;
  /** alt/title/anchor/heading text, trimmed. May be empty. */
  label: string;
}

export interface ExtractHtmlResult {
  text: string;
  title: string;
  /** Non-PDF links (candidate crawl targets). */
  links: HtmlLink[];
  /** PDF links found in the page (`crawlVenue.ts` treats these as fetchable assets). */
  assetCandidates: { href: string; text: string }[];
  /** Asset embeds/images (video/virtual_tour/floor_plan/pdf) — same objects appended to
   * `text` as the trailing "--- ASSETS ---" block (`parseAssetsBlock` reads that block back out).
   * PDFs also always appear in `assetCandidates` above (unchanged); this is a label-preserving
   * mirror, not a replacement. */
  assets: Asset[];
  /** `text.length < 400` — a strong signal of a JS-rendered shell with no server text. */
  isJsShell: boolean;
}

/** Marker for the trailing assets block appended to `extractHtml`'s `text` — kept in one place so
 * `parseAssetsBlock` (the reader) and `extractHtml` (the writer) can never drift apart. */
const ASSETS_MARKER = "\n\n--- ASSETS ---\n";

const ASSET_KINDS: readonly AssetKind[] = ["video", "virtual_tour", "floor_plan", "pdf"];

/** Hosts whose embeds/links are a video (YouTube/Vimeo). Subdomains match via the leading
 * `(^|\.)` anchor (e.g. "player.vimeo.com"). Matching this host is necessary but not sufficient —
 * see `extractYouTubeId`/`extractVimeoId`: a channel/user/profile page on these same hosts is not
 * a video and must not fall through to the generic tour-keyword check below. */
const VIDEO_HOST_RE = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/i;
/** Hosts whose embeds/links are a virtual tour (Matterport/Kuula), independent of URL wording. */
const VIRTUAL_TOUR_HOST_RE = /(^|\.)(matterport\.com|kuula\.co)$/i;
/** Any other host is still a virtual tour when the URL or its label says so ("360", "tour",
 * "my.venue.com/360-tour-banquet-hall-rental" — Diamond Garden's own-host 360 page). */
const TOUR_KEYWORD_RE = /360|tour/i;

/** Extracts a YouTube video id from a `/watch?v=`, `/embed/<id>`, or `youtu.be/<id>` URL — the
 * only YouTube URL shapes that are actually a video. A `/@handle`, `/channel/…`, `/user/…`, or
 * `/c/…` URL (a channel/profile link, tick c5: seen in the wild alongside real embeds) returns
 * null. Shared by `classifyMediaUrl` (is this a video asset at all) and `canonicalVideoUrl`
 * (normalize two citations of the same video to one URL). */
function extractYouTubeId(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  if (/(^|\.)youtu\.be$/i.test(host)) {
    return u.pathname.split("/").filter(Boolean)[0] ?? null;
  }
  if (!/(^|\.)youtube\.com$/i.test(host)) return null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const embedMatch = u.pathname.match(/^\/embed\/([^/?#]+)/i);
  return embedMatch ? embedMatch[1] : null;
}

/** Extracts a Vimeo video id (+ optional privacy hash segment) from a `vimeo.com/<digits>`,
 * `vimeo.com/<digits>/<hash>`, or `player.vimeo.com/video/<digits>` URL — the only Vimeo shapes
 * that are a video, as opposed to a user/channel/showcase page on the same host. */
function extractVimeoId(u: URL): { id: string; hash: string | null } | null {
  const host = u.hostname.toLowerCase();
  if (/(^|\.)player\.vimeo\.com$/i.test(host)) {
    const m = u.pathname.match(/^\/video\/(\d+)/);
    return m ? { id: m[1], hash: u.searchParams.get("h") } : null;
  }
  if (!/(^|\.)vimeo\.com$/i.test(host)) return null;
  const m = u.pathname.match(/^\/(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/);
  return m ? { id: m[1], hash: m[2] ?? null } : null;
}

/** Normalizes a YouTube/Vimeo URL to one canonical form so the same video cited two ways (an
 * `/embed/<id>` iframe and a `/watch?v=<id>` link, or a `player.vimeo.com/video/<id>?h=<hash>`
 * iframe and a `vimeo.com/<id>/<hash>` link) dedupes to a single asset. Any other URL (a
 * self-hosted `<video src>`, a non-video YouTube/Vimeo page) is returned unchanged. */
export function canonicalVideoUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const ytId = extractYouTubeId(u);
  if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;
  const vimeo = extractVimeoId(u);
  if (vimeo) return `https://vimeo.com/${vimeo.id}${vimeo.hash ? `/${vimeo.hash}` : ""}`;
  return url;
}

/** Which of the embed kinds (if any) a media URL/label pair is — used for `<iframe src>`,
 * `<a href>`, and any URL discovered outside a literal `<video>`/`<source>` tag (those are always
 * `video`, handled separately). Returns null when the URL isn't a recognized media embed at all
 * (an ordinary iframe — a map widget, a booking form — is not an asset; nor is a YouTube/Vimeo
 * channel/profile URL, even though it shares a host with real video embeds). */
function classifyMediaUrl(url: string, label: string): AssetKind | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (extractYouTubeId(u) || extractVimeoId(u)) return "video";
  const host = u.hostname.toLowerCase();
  // A known video host but not a recognized watch/embed/player path (channel, user, profile,
  // showcase, …) is explicitly not a video — must not fall through to the tour-keyword guess.
  if (VIDEO_HOST_RE.test(host)) return null;
  if (VIRTUAL_TOUR_HOST_RE.test(host)) return "virtual_tour";
  if (TOUR_KEYWORD_RE.test(url) || TOUR_KEYWORD_RE.test(label)) return "virtual_tour";
  return null;
}

/** Decodes the handful of HTML entities that can show up literally inside an href/src attribute
 * value (tick c5: Marchetti's floor-plan images came through as `…jpg?width=792&amp;height=612`).
 * Named entities cover the common cases; numeric (`&#38;`) and hex (`&#x26;`) escapes are decoded
 * generically via `String.fromCodePoint`. Anything that isn't a recognized entity is left as-is
 * (no false-positive decoding of a literal "&text;" that happens to appear in a URL). */
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes("&")) return input;
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const name = body.toLowerCase();
    return name in NAMED_HTML_ENTITIES ? NAMED_HTML_ENTITIES[name] : match;
  });
}

/** data:-URI assets (tick c5: the Field Museum's base64-inlined SVG/JPEG images matched
 * `FLOOR_PLAN_RE` on their alt text but carry no fetchable URL at all) never belong in `assets` or
 * `assetCandidates`. */
function isDataUri(url: string): boolean {
  return /^data:/i.test(url);
}

/** Tracking pixels / spacer GIFs (tick c5: filename says so, or the element declares itself
 * 1x1-or-smaller) that would otherwise slip in as a "floor plan" when they sit near floor-plan
 * copy. */
const JUNK_IMAGE_RE = /pixel|spacer|blank/i;

function isTinyDimensionAttr(value: string | null): boolean {
  if (!value) return false;
  const n = parseFloat(value);
  return Number.isFinite(n) && n <= 2;
}

/** Floor plan / seating chart / capacity diagram / site map — matched against an image's own
 * src/alt/title, or the nearest preceding heading/anchor text when the image itself is unlabeled
 * (Marchetti: framerusercontent.com/images/*.jpg sit under a "Floor Plans" section heading with no
 * alt text of their own). */
const FLOOR_PLAN_RE = /floor ?plan|seating|layout|capacity|site ?map/i;

/** Image-extension links (`<a href="…jpg|png|webp">`) worth checking against FLOOR_PLAN_RE — a
 * plain `<img>` is covered separately via the `img[src]` handler. */
const IMAGE_EXT_RE = /\.(jpe?g|png|webp)(\?|#|$)/i;

/** Parses the trailing "--- ASSETS ---" block `extractHtml` appends to its `text` result back
 * into `Asset[]` — pure, so `extractVenueDetails.ts` (building ASSET CANDIDATES) and
 * `validate/assemble.ts` (grounding/augmenting resources[]) can both read it without re-crawling.
 * Returns `[]` when the text has no such block (plain page text, a PDF's extracted text, or a test
 * fixture written before this existed). */
export function parseAssetsBlock(text: string): Asset[] {
  const idx = text.indexOf(ASSETS_MARKER);
  if (idx === -1) return [];
  const block = text.slice(idx + ASSETS_MARKER.length);
  const assets: Asset[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(" | ");
    if (parts.length < 2) continue;
    const kind = parts[0].trim();
    const url = parts[1]?.trim() ?? "";
    const label = parts.slice(2).join(" | ").trim();
    if (!url || !(ASSET_KINDS as readonly string[]).includes(kind)) continue;
    assets.push({ kind: kind as AssetKind, url, label });
  }
  return assets;
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

/** Last-resort PDF label when there's no anchor text and no preceding heading — the bare file
 * name (Diamond Garden's menus are hashed filenames like `4b61b7_....pdf`, but that still beats an
 * empty label). */
function filenameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").pop();
    return last || url;
  } catch {
    return url.split("/").pop() || url;
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
  const assetsByUrl = new Map<string, Asset>();

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
  // The most recent non-empty heading (h1-h6) or anchor text seen -- used as the fallback label
  // for an unlabeled asset image/embed that follows it (Marchetti's floor-plan JPGs sit under a
  // "Floor Plans" heading with no alt text of their own).
  let lastHeadingOrLinkText = "";
  let inHeading = false;
  let headingBuf = "";

  const effectiveBase = () => (baseHref ? resolveHref(baseHref, baseUrl) : baseUrl);

  function addAsset(kind: AssetKind, url: string, label: string): void {
    if (!url || isDataUri(url)) return;
    // Canonicalize before the dedupe check, not after, so the same video cited two ways (an
    // `/embed/<id>` iframe and a `/watch?v=<id>` link) collapses to one asset.
    const finalUrl = kind === "video" ? canonicalVideoUrl(url) : url;
    if (!assetsByUrl.has(finalUrl)) assetsByUrl.set(finalUrl, { kind, url: finalUrl, label: label.trim() });
  }

  const rewriter = new HTMLRewriter()
    .on("base[href]", {
      element(el) {
        if (baseHref === null) {
          const raw = el.getAttribute("href");
          if (raw) baseHref = decodeHtmlEntities(raw);
        }
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
    // Heading tracking is split across two handlers on purpose: `el.onEndTag` only honors the
    // LAST registration made for a given element (verified empirically -- a second `.on()` for
    // the same selector silently wins over an earlier one's `onEndTag`, though `element()`/
    // `text()` callbacks from both DO all fire). BLOCK_SELECTOR below already registers an
    // `onEndTag` for every h1-h6 (to push a paragraph break) and is registered after this handler,
    // so it's the one that actually finalizes `lastHeadingOrLinkText` -- this handler only opens
    // the heading and buffers its text.
    .on("h1, h2, h3, h4, h5, h6", {
      element() {
        inHeading = true;
        headingBuf = "";
      },
      text(chunk) {
        if (inHeading) headingBuf += chunk.text;
      },
    })
    .on("iframe[src]", {
      element(el) {
        const rawSrc = el.getAttribute("src");
        if (!rawSrc) return;
        const src = decodeHtmlEntities(rawSrc);
        const resolved = resolveHref(src, effectiveBase());
        const label = el.getAttribute("title") ?? lastHeadingOrLinkText;
        const kind = classifyMediaUrl(resolved, label);
        if (kind) addAsset(kind, resolved, label);
      },
    })
    .on("video[src], source[src]", {
      element(el) {
        const rawSrc = el.getAttribute("src");
        if (!rawSrc) return;
        const src = decodeHtmlEntities(rawSrc);
        const resolved = resolveHref(src, effectiveBase());
        const label = el.getAttribute("title") ?? lastHeadingOrLinkText;
        addAsset("video", resolved, label);
      },
    })
    .on("img[src]", {
      element(el) {
        const rawSrc = el.getAttribute("src");
        if (!rawSrc) return;
        const src = decodeHtmlEntities(rawSrc);
        if (isDataUri(src) || JUNK_IMAGE_RE.test(src)) return;
        if (isTinyDimensionAttr(el.getAttribute("width")) || isTinyDimensionAttr(el.getAttribute("height"))) return;
        const alt = el.getAttribute("alt") ?? "";
        const titleAttr = el.getAttribute("title") ?? "";
        const hay = `${src} ${alt} ${titleAttr} ${lastHeadingOrLinkText}`;
        if (!FLOOR_PLAN_RE.test(hay)) return;
        const resolved = resolveHref(src, effectiveBase());
        const label = alt || titleAttr || lastHeadingOrLinkText;
        addAsset("floor_plan", resolved, label);
      },
    })
    .on(BLOCK_SELECTOR, {
      element(el) {
        const tag = el.tagName;
        onEndTagSafe(el, () => {
          textParts.push("\n");
          // See the heading handler above for why this lives here rather than there.
          if (inHeading && /^h[1-6]$/.test(tag)) {
            inHeading = false;
            const trimmed = headingBuf.replace(/\s+/g, " ").trim();
            if (trimmed) lastHeadingOrLinkText = trimmed;
            headingBuf = "";
          }
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
        const rawHref = el.getAttribute("href") ?? "";
        currentHref = rawHref ? decodeHtmlEntities(rawHref) : rawHref;
        currentLinkParts = [];
        currentLinkFromNav = navDepth > 0;
        onEndTagSafe(el, () => {
          const href2 = currentHref;
          const text = currentLinkParts.join("").replace(/\s+/g, " ").trim();
          currentHref = null;
          if (!href2 || href2.startsWith("#") || /^mailto:/i.test(href2) || /^tel:/i.test(href2) || /^javascript:/i.test(href2)) {
            return;
          }
          // Captured before this anchor's own text overwrites it below -- "the nearest PRECEDING
          // heading/anchor text" must mean the label that came before this link, never the link's
          // own text describing itself (Geraghty: an image captioned "Ceremony & Reception (300
          // guests)" only reads as a floor plan because of the page's own "Floor Plans" heading
          // above it, not because of its own caption).
          const precedingLabel = lastHeadingOrLinkText;
          if (text) lastHeadingOrLinkText = text;
          const resolved = resolveHref(href2, effectiveBase());
          if (/\.pdf(\?|#|$)/i.test(resolved)) {
            assetCandidates.push({ href: resolved, text });
            // Mirrored into the ASSETS block (tick c5) so its label survives even when
            // `venue_source_snapshots.title` is null for an already-crawled PDF -- the label
            // preference is anchor text, then the nearest preceding heading/link text, then the
            // bare filename. `assetCandidates` above is untouched.
            addAsset("pdf", resolved, text || precedingLabel || filenameFromUrl(resolved));
            return;
          }
          links.push({ href: resolved, text, fromNav: currentLinkFromNav });
          const mediaKind = classifyMediaUrl(resolved, text || precedingLabel);
          if (mediaKind) {
            addAsset(mediaKind, resolved, text || precedingLabel);
          } else if (IMAGE_EXT_RE.test(resolved) && FLOOR_PLAN_RE.test(`${resolved} ${text} ${precedingLabel}`)) {
            addAsset("floor_plan", resolved, text || precedingLabel);
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

  const bodyText = collapseWhitespace(textParts.join(""));
  const assets = [...assetsByUrl.values()];
  // Appended so the ASSETS block travels with the page's cached/snapshotted text (content-addressed
  // together): both the extractor's ASSET CANDIDATES block and the assembler's resource
  // augmentation/grounding read it back out via `parseAssetsBlock`, even after the crawl is over.
  const assetsBlock = assets.length > 0 ? `${ASSETS_MARKER}${assets.map((a) => `${a.kind} | ${a.url} | ${a.label}`).join("\n")}` : "";
  const text = `${bodyText}${assetsBlock}`;

  return {
    text,
    title: title.replace(/\s+/g, " ").trim(),
    links,
    assetCandidates,
    assets,
    // Judged on the flowing body text alone -- the appended ASSETS block is metadata, not server
    // content, and must never make a real JS-rendered shell look like a real page.
    isJsShell: bodyText.length < 400,
  };
}
