/**
 * Wedding-page finder (2026-09-14 follow-up: "we want the wedding site variant, not just Field
 * Museum but Field Museum *for weddings* if they have it; same with hotels"). Today
 * `discoverWebsites.ts` resolves one URL per venue and it's usually the homepage; this module
 * finds, in priority order, the venue's dedicated wedding/private-events page:
 *
 *   (a) legacy_enrichment_pages -- URLs Ben's Python crawler already visited for this account
 *       (`venue_enrichment.facts->'pages_crawled'`, joined via `vendors.account_id`,
 *       alias-aware) that match the strict wedding regex. Free -- no network call.
 *   (b) homepage_link -- a same-host link on the venue's own homepage whose href or anchor
 *       text names a wedding/private-event page.
 *   (c) common_path -- a probe of a short list of conventional paths (`/weddings`, etc.) on the
 *       venue's own host, verified to be a real page (not a soft-404 shell).
 *
 * Returns null honestly when nothing qualifies -- a venue without a dedicated wedding page is a
 * real product signal, not a bug to work around.
 *
 * Pure where possible: `pickLegacyWeddingPage` and `pickHomepageLinkWeddingPage` take
 * already-fetched data and do no I/O, so they're unit tested directly. `fetchLegacyEnrichmentPages`
 * (DB), `fetchHomepageLinks` (network) and `probeCommonWeddingPaths` (network) are the I/O
 * shells; `findWeddingPage` wires them together in priority order.
 */
import type { Pool } from "pg";
import { accountAliasSet } from "../universe";
import { extractHtml, type HtmlLink } from "./htmlText";
import { VENUE_BOT_USER_AGENT } from "./robots";
import { sameRegistrableHost, scoreUrl } from "./urlScore";

const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------

/** Broad "this page is wedding/private-event relevant" test -- used for the homepage-link
 * fallback tier (href only, per spec) and as the umbrella set for term-priority ordering. */
export const WEDDING_PAGE_RE =
  /wedding|bridal|nuptial|celebrat|private[-_ ]?event|special[-_ ]?event|social[-_ ]?event|host[-_ ]?an[-_ ]?event|venue[-_ ]?rental/i;

/** Strict "this page is *about weddings*" test -- used for legacy pages, the homepage-link
 * primary tier (href OR anchor text), and to verify a common-path probe's body text. */
export const WEDDING_STRICT_RE = /wedding|bridal|nuptial/i;

/**
 * A page whose path matches this is a real wedding-adjacent page but the *wrong kind* to hand a
 * couple as "the wedding page" -- a photo gallery, an inquiry/contact form, a blog post, an FAQ,
 * or an RSVP/registry/guest page for someone else's wedding, rather than the venue's own
 * wedding-info landing page. `pickLegacyWeddingPage` and `pickHomepageLinkWeddingPage` prefer
 * any matching candidate that ISN'T secondary and only fall back to a secondary one when no
 * primary candidate exists at all. Follow-up (2026-09-14 calibration re-check): account 507
 * (The Geraghty) picked `/gallery/wedding` over the real `/portfolio/wedding-venue` info page;
 * account 687 (Adler Planetarium) picked `/venue-rentals/private-event-inquiry-form/` over its
 * own root `/venue-rentals/` info page -- both purely on "shortest path"/tier-order, with no
 * notion that a gallery or a form is a worse answer than an actual info page.
 */
export const SECONDARY_PAGE_RE = /gallery|photos?|inquir|form|contact|blog|faq|rsvp|registry|guest/i;

function isSecondaryPage(url: string): boolean {
  return SECONDARY_PAGE_RE.test(pathOf(url));
}

/**
 * Term priority within the broad regex, most wedding-specific first -- "wedding" beats
 * "private events" per spec: when two links both qualify (e.g. one says "Weddings", the other
 * "Private Events"), the more specific wedding term wins the tie-break ahead of path length.
 * Every strict match is priority 0 by construction (strict is a subset of index 0's pattern).
 */
const WEDDING_TERM_PRIORITY: RegExp[] = [
  /wedding|bridal|nuptial/i,
  /celebrat/i,
  /private[-_ ]?event|special[-_ ]?event|social[-_ ]?event/i,
  /host[-_ ]?an[-_ ]?event/i,
  /venue[-_ ]?rental/i,
];

function weddingTermPriority(s: string): number | null {
  for (let i = 0; i < WEDDING_TERM_PRIORITY.length; i++) {
    if (WEDDING_TERM_PRIORITY[i].test(s)) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function pathLength(url: string): number {
  try {
    return new URL(url).pathname.length;
  } catch {
    return url.length;
  }
}

/**
 * A URL "matches" a wedding regex when its pathname does AND `urlScore` doesn't veto it as
 * noise or as a non-page asset. This is the decision documented for `/blog/wedding-trends`
 * (task 6): the path contains "wedding", but `/blog` drags `scoreUrl` negative, so it's
 * rejected -- whereas `/wedding-guest-info` (a hotel's logistics page) is accepted: nothing in
 * `urlScore` penalizes it, so by design the strict regex alone decides that case, even though
 * the page itself may turn out to be about staying at the hotel during someone else's wedding
 * rather than a page for booking one. That's an accepted false-positive risk of a fast
 * regex-first heuristic, not a bug -- `mustnot/`-style review of the extracted content is what
 * catches it downstream.
 *
 * `scoreUrl` returning `null` (not merely negative) means "skip this URL outright" -- a
 * non-html/pdf asset extension or a `/wp-content/uploads/` non-PDF path. That must veto here
 * too: measured 2026-09-14, account 58 (offshorerooftop.com) picked
 * `.../wp-content/uploads/2022/05/Host-an-event-with-us.jpg` -- a JPEG, not a page -- as its
 * "wedding page" via the broad `host-an-event` term, because the original check only tested
 * `score < 0` and a `null` score is neither `< 0` nor caught by that comparison.
 */
export function isWeddingUrlCandidate(url: string, re: RegExp): boolean {
  if (!re.test(pathOf(url))) return false;
  const score = scoreUrl(url);
  if (score === null || score < 0) return false;
  return true;
}

/** Convenience for discoverWebsites.ts's "candidate URL is already a wedding page" check
 * (strict: contains wedding/bridal/nuptial) -- and not itself a secondary page, so a root that
 * happens to be a gallery/form page doesn't short-circuit the search. */
export function urlIsWeddingPage(url: string): boolean {
  return isWeddingUrlCandidate(url, WEDDING_STRICT_RE) && !isSecondaryPage(url);
}

/** Broader than `urlIsWeddingPage`: true when the root is a decent wedding/private-events page
 * even without the literal word "wedding" (e.g. Adler Planetarium's `/venue-rentals/`, Chicago
 * Botanic Garden's `/private-events`) -- used only as a last-resort fallback, when nothing
 * better (non-secondary) was found anywhere else. */
export function isRootUsableWeddingPage(url: string): boolean {
  return isWeddingUrlCandidate(url, WEDDING_PAGE_RE) && !isSecondaryPage(url);
}

export type WeddingUrlSource = "legacy_enrichment_pages" | "homepage_link" | "common_path" | "manual";

export interface WeddingPageResult {
  url: string;
  source: WeddingUrlSource;
  /** The matched href/anchor text (homepage_link, legacy) or probed path (common_path); a
   * secondary-page fallback appends a note explaining why (see `isSecondary`). */
  evidence: string;
  /** True when no primary (non-`SECONDARY_PAGE_RE`) candidate existed and this is a fallback --
   * a gallery/form/contact/etc. page. `findWeddingPage`'s caller (`computeWeddingForRoot` in
   * discoverWebsites.ts) prefers the root URL itself over accepting a secondary result when the
   * root is itself a usable (broad-match, non-secondary) wedding/private-events page. */
  isSecondary: boolean;
}

// ---------------------------------------------------------------------------
// (a) legacy_enrichment_pages
// ---------------------------------------------------------------------------

export interface LegacyPage {
  url: string;
  depth?: number;
  context?: string;
}

function registrableHostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Pure: picks the shortest-path legacy-crawled URL that matches the strict regex (and isn't
 * urlScore-vetoed noise), scoped to the same "property" as the page it was crawled from.
 *
 * `aliasSet`-joined `pages_crawled` can legitimately mix pages from more than one crawl -- a
 * chain hotel's own domain (many properties under one host) or a hotel + its in-house
 * restaurant (two `vendors` rows sharing one `account_id`, two different hosts). Without
 * scoping, "shortest path wins" can pick a page that isn't even about this venue: measured
 * 2026-09-14 against the live universe, account 654 (The Ritz-Carlton, Chicago) picked
 * `.../hotels/tfsrz-the-ritz-carlton-abama/weddings` -- The Ritz-Carlton **Abama**, a resort in
 * Tenerife -- over the correct `.../hotels/chirz-the-ritz-carlton-chicago/weddings`, purely
 * because "tfsrz-the-ritz-carlton-abama" is one character shorter than
 * "chirz-the-ritz-carlton-chicago".
 *
 * Fix: group by host, and within each host require the candidate to share the path prefix of
 * that host's own shallowest (lowest-depth, normally depth 0 -- the actual crawl root) entry,
 * up to but not including that entry's own last segment. A same-domain multi-tenant/chain URL
 * for a *different* property fails this prefix and is excluded; an ordinary single-property
 * site's root has at most one path segment, so the required prefix is empty and every same-host
 * page is eligible exactly as before this fix.
 */
export function pickLegacyWeddingPage(pages: LegacyPage[]): WeddingPageResult | null {
  const byHost = new Map<string, LegacyPage[]>();
  for (const page of pages) {
    if (!page || typeof page.url !== "string") continue;
    const host = registrableHostOf(page.url);
    if (!host) continue;
    const list = byHost.get(host) ?? [];
    list.push(page);
    byHost.set(host, list);
  }

  // Two pools, scored independently: a primary (non-secondary) match always wins over a
  // secondary (gallery/form/contact/etc.) one, regardless of path length -- only when NO
  // primary candidate exists anywhere (across every in-scope host) do we fall back to the
  // shortest-path secondary match. See SECONDARY_PAGE_RE's docstring (account 507, The
  // Geraghty: "/gallery/wedding" was picked over the real "/portfolio/wedding-venue").
  let bestPrimary: string | null = null;
  let bestSecondary: string | null = null;

  for (const hostPages of byHost.values()) {
    const anchor = hostPages.reduce((a, b) => ((b.depth ?? Infinity) < (a.depth ?? Infinity) ? b : a));
    const requiredPrefix = pathSegments(anchor.url).slice(0, -1);

    const seen = new Set<string>();
    for (const page of hostPages) {
      if (seen.has(page.url)) continue;
      seen.add(page.url);
      if (!isWeddingUrlCandidate(page.url, WEDDING_STRICT_RE)) continue;
      const candidateSegments = pathSegments(page.url);
      const inScope = requiredPrefix.every((seg, i) => candidateSegments[i] === seg);
      if (!inScope) continue;
      if (isSecondaryPage(page.url)) {
        if (bestSecondary === null || pathLength(page.url) < pathLength(bestSecondary)) bestSecondary = page.url;
      } else {
        if (bestPrimary === null || pathLength(page.url) < pathLength(bestPrimary)) bestPrimary = page.url;
      }
    }
  }

  if (bestPrimary !== null) {
    return { url: bestPrimary, source: "legacy_enrichment_pages", evidence: bestPrimary, isSecondary: false };
  }
  if (bestSecondary !== null) {
    return {
      url: bestSecondary,
      source: "legacy_enrichment_pages",
      evidence: `${bestSecondary} (secondary page -- no primary wedding page found in legacy_enrichment_pages)`,
      isSecondary: true,
    };
  }
  return null;
}

/** Impure: reads `venue_enrichment.facts->'pages_crawled'` for every alias in `aliasSet`
 * (join via `vendors.account_id`), same pattern as discoverWebsites.ts's own candidate lookup. */
export async function fetchLegacyEnrichmentPages(pool: Pool, aliasSet: number[]): Promise<LegacyPage[]> {
  const { rows } = await pool.query<{ pages_crawled: unknown }>(
    `select ve.facts->'pages_crawled' as pages_crawled
     from venue_enrichment ve
     join vendors v on v.id = ve.vendor_id
     where v.account_id = any($1::bigint[]) and ve.facts ? 'pages_crawled'`,
    [aliasSet]
  );
  const pages: LegacyPage[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.pages_crawled)) continue;
    for (const entry of row.pages_crawled) {
      if (entry && typeof entry === "object" && typeof (entry as { url?: unknown }).url === "string") {
        const e = entry as { url: string; depth?: number; context?: string };
        pages.push({ url: e.url, depth: e.depth, context: e.context });
      }
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// (b) homepage_link
// ---------------------------------------------------------------------------

type LinkMatchVia = "href" | "text";

function linkMatch(link: HtmlLink, re: RegExp, allowText: boolean): LinkMatchVia | null {
  if (isWeddingUrlCandidate(link.href, re)) return "href";
  if (allowText && re.test(link.text)) return "text";
  return null;
}

/** Ranks one candidate pool (already all same tier -- strict or broad) by nav preference, term
 * specificity, then path length -- but a primary (non-secondary) candidate always outranks a
 * secondary one, regardless of those three, and secondary is used at all only when the whole
 * pool is secondary (account 687, Adler Planetarium: the only broad-tier match on its homepage
 * was `/venue-rentals/private-event-inquiry-form/`, a secondary inquiry form -- see
 * discoverWebsites.ts's root-URL fallback for how that case is actually resolved). */
function bestLinkCandidate(candidates: { link: HtmlLink; via: LinkMatchVia }[]): WeddingPageResult {
  const primary = candidates.filter((c) => !isSecondaryPage(c.link.href));
  const usingSecondary = primary.length === 0;
  const pool = usingSecondary ? candidates : primary;

  const scored = pool.map((c) => ({
    ...c,
    navRank: c.link.fromNav ? 0 : 1,
    termPriority: Math.min(weddingTermPriority(c.link.href) ?? Infinity, weddingTermPriority(c.link.text) ?? Infinity),
    pathLen: pathLength(c.link.href),
  }));
  scored.sort((a, b) => a.navRank - b.navRank || a.termPriority - b.termPriority || a.pathLen - b.pathLen);
  const best = scored[0];
  const evidenceBase = best.via === "href" ? best.link.href : best.link.text;
  return {
    url: best.link.href,
    source: "homepage_link",
    evidence: usingSecondary ? `${evidenceBase} (secondary page -- no primary wedding page found in homepage links)` : evidenceBase,
    isSecondary: usingSecondary,
  };
}

/**
 * Pure: given a homepage's extracted links, picks the best same-host wedding page link.
 * Priority: strict match (href OR anchor text) beats a broad match (href only, per spec --
 * anchor text alone is too noisy at the broad tier, e.g. a nav item just called "Celebrate").
 * Within a tier: a primary (non-secondary) candidate always wins; among those, nav links
 * first, then the more wedding-specific term ("wedding" beats "private events"), then the
 * shortest path.
 */
export function pickHomepageLinkWeddingPage(links: HtmlLink[], rootUrl: string): WeddingPageResult | null {
  const sameHost = links.filter((l) => sameRegistrableHost(l.href, rootUrl));

  const strict = sameHost
    .map((link) => ({ link, via: linkMatch(link, WEDDING_STRICT_RE, true) }))
    .filter((c): c is { link: HtmlLink; via: LinkMatchVia } => c.via !== null);
  if (strict.length > 0) return bestLinkCandidate(strict);

  const broad = sameHost
    .map((link) => ({ link, via: linkMatch(link, WEDDING_PAGE_RE, false) }))
    .filter((c): c is { link: HtmlLink; via: LinkMatchVia } => c.via !== null);
  if (broad.length > 0) return bestLinkCandidate(broad);

  return null;
}

/** Impure: fetches + parses the venue's homepage (reusing the crawler's UA/timeout shape and
 * `extractHtml`) for callers that haven't already fetched it themselves during their own probe.
 * Returns null on any fetch error, non-html response, or a JS-shell page (nothing to search). */
export async function fetchHomepageLinks(
  rootUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<HtmlLink[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(rootUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": VENUE_BOT_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html/i.test(contentType)) return null;
    const html = await res.text();
    const { links, isJsShell } = await extractHtml(html, res.url || rootUrl);
    if (isJsShell) return null;
    return links;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// (c) common_path
// ---------------------------------------------------------------------------

export const COMMON_WEDDING_PATHS = [
  "/weddings",
  "/wedding",
  "/weddings-events",
  "/events/weddings",
  "/private-events/weddings",
  "/celebrations/weddings",
  "/weddings/",
];

const SOFT_404_MIN_CHARS = 400;

/** A redirect to a differently-shaped path is not "the same page" -- some sites (WordPress
 * "did you mean" / search-redirect plugins) send an unknown path to whatever existing content
 * fuzzy-matches it, which can land on a real, unrelated, wedding-titled article rather than a
 * 404. Measured 2026-09-14: chicagoreader.com (a news site, not a venue -- its own root
 * candidate is itself a mis-resolved article URL, a separate pre-existing data issue) redirects
 * `/events/weddings` to a film review titled "Weddings and Other Disasters", which otherwise
 * passes every other check (200, html, >= 400 chars, contains "wedding"). A same-path redirect
 * (trailing slash, scheme/www upgrade) is still accepted. */
function isTrivialRedirectTarget(requestedUrl: string, finalUrl: string): boolean {
  try {
    const normalize = (p: string) => p.replace(/\/+$/, "").toLowerCase();
    return normalize(new URL(requestedUrl).pathname) === normalize(new URL(finalUrl).pathname);
  } catch {
    return false;
  }
}

/** Impure: probes each common path in order on `rootUrl`'s host, stopping at the first one that
 * is a real page: HTTP 200, html content-type, not a redirect to an unrelated path, >= 400
 * chars of extracted text, and that text itself matches the strict regex (a thin/soft-404
 * "page not found, but here's our homepage content" response won't satisfy both the length and
 * the regex check together). */
export async function probeCommonWeddingPaths(
  rootUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<WeddingPageResult | null> {
  for (const path of COMMON_WEDDING_PATHS) {
    let url: string;
    try {
      url = new URL(path, rootUrl).toString();
    } catch {
      continue;
    }
    const finalUrl = await probeOneCommonPath(url, fetchImpl, timeoutMs);
    if (finalUrl) return { url: finalUrl, source: "common_path", evidence: path, isSecondary: false };
  }
  return null;
}

async function probeOneCommonPath(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": VENUE_BOT_USER_AGENT },
      signal: controller.signal,
    });
    if (res.status !== 200) return null;
    if (res.redirected && !isTrivialRedirectTarget(url, res.url || url)) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html/i.test(contentType)) return null;
    const html = await res.text();
    const { text } = await extractHtml(html, res.url || url);
    if (text.length < SOFT_404_MIN_CHARS) return null;
    if (!WEDDING_STRICT_RE.test(text)) return null;
    return res.url || url;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface FindWeddingPageOptions {
  pool: Pool;
  accountId: number;
  /** Pass the homepage links already extracted by the caller's own root probe
   * (discoverWebsites.ts's `--probe` step) to avoid a second polite fetch of the same URL.
   * Omit (or pass `undefined`) to let `findWeddingPage` fetch the homepage itself; pass `null`
   * to explicitly skip the homepage-link tier (e.g. the root is known unreachable). */
  homepageLinks?: HtmlLink[] | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Runs the full priority chain: legacy_enrichment_pages -> homepage_link -> common_path.
 * Returns null when none of the three produced a qualifying page. */
export async function findWeddingPage(root: string, opts: FindWeddingPageOptions): Promise<WeddingPageResult | null> {
  const aliasSet = await accountAliasSet(opts.pool, opts.accountId);
  const legacyPages = await fetchLegacyEnrichmentPages(opts.pool, aliasSet);
  const legacy = pickLegacyWeddingPage(legacyPages);
  if (legacy) return legacy;

  const links = opts.homepageLinks !== undefined ? opts.homepageLinks : await fetchHomepageLinks(root, opts.fetchImpl, opts.timeoutMs);
  if (links) {
    const homepageLink = pickHomepageLinkWeddingPage(links, root);
    if (homepageLink) return homepageLink;
  }

  return probeCommonWeddingPaths(root, opts.fetchImpl, opts.timeoutMs);
}
