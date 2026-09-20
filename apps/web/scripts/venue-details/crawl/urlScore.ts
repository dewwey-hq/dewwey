/**
 * Pure URL scoring for the venue-details BFS crawl (crawlVenue.ts). Higher score = fetch
 * sooner. Weights transcribed from the plan's "Scripts" section, crawl/urlScore.ts bullet.
 * No I/O, no DB -- unit tested in urlScore.test.ts.
 */

export interface ScoreUrlOptions {
  /** Link was found inside a nav/header/footer/[role=navigation] element. */
  fromNav?: boolean;
  /** Visible anchor text for the link, used only for the PDF wedding-relevance check. */
  anchorText?: string;
  /** Score of the page the link was found on. A link from a wedding/event/policy page (>= 5)
   * inherits +3: Field Museum's four space pages are linked only from /page/weddings and lost
   * the 30-page budget to staff profiles and legal statements (tick c3, 2026-09-20). */
  parentScore?: number | null;
}

/** Space-page names in the path ("/stanley-field-hall-balcony", "/east-atrium-pavilion",
 * "/rooftop", "/the-loft"): +4. Lodging words stay penalized by LODGING_RE. */
const SPACE_NAME_RE =
  /\b(hall|ballroom|terrace|terraces|atrium|gallery|pavilion|garden|gardens|loft|rooftop|salon|lounge|courtyard|conservatory|chapel|barn|greenhouse|patio|deck|theater|theatre|library|parlor|solarium|veranda|winery|mezzanine|penthouse)\b/i;


/** Non-html/pdf file extensions the crawler must never fetch as a page. */
const SKIP_EXTENSIONS =
  /\.(jpg|jpeg|png|gif|webp|svg|ico|zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx|mp4|mov|mp3|wav|avi|css|js|json|xml|woff2?|ttf|eot|dmg|exe)$/i;

const WEDDING_RE = /\/wedding(s)?\b|\/bridal\b/i;
const EVENT_RENTAL_RE =
  /\/private-events?\b|\/special-events?\b|\/events?\b|\/venue-rental\b|\/host-an-event\b|\/facility-rental\b|\/celebrate\b|\/rentals?\b|\/packages?\b|\/pricing\b|\/rates?\b|\/investment\b/i;
const POLICY_RE =
  /\/faq\b|\/policies\b|\/questions\b|\/terms\b|\/legal\b|\/contract\b|\/agreement\b|\/guidelines\b|\/planning\b/i;
const CAPACITY_RE = /floor-?plans?|\/capacit|\/ballroom\b|\/venues?\b/i;
const SPACE_RE = /\/spaces?\b|\/rooms?\b/i;
const SPACE_CONTEXT_RE = /event|wedding|ballroom|venue/i;
const NETWORK_RE = /\/preferred\b|\/vendors?\b|\/partners?\b|\/caterers?\b|\/approved\b|\/resources?\b/i;
const INFO_RE =
  /\/about\b|\/contact\b|\/amenities\b|\/features\b|\/gallery\b|\/tour\b|\/virtual-tour\b|\/sustainability\b/i;

/** PDFs are +5 when the URL or anchor text is wedding/pricing/capacity-relevant, else -5. */
const PDF_RELEVANCE_RE =
  /wedding|brochure|menu|bar|beverage|package|pricing|rate|capacity|floor|plan|vendor|contract|agreement|guideline|catering|faq/i;

const LODGING_RE =
  /\/rooms?(?!.*(event|wedding))|\/accommodations?\b|\/stay\b|\/suites?\b|\/reservations?\b|\/book(ing)?\b|\/offers?\b|\/spa\b|\/dining(?!.*private)/i;

const NOISE_RE =
  /\/blog\b|\/news\b|\/press\b|\/careers?\b|\/jobs?\b|\/shop\b|\/cart\b|\/login\b|\/account\b|\/wp-json\b|\/feed\b|\/tag\/|\/category\/|\/author\/|\/page\/\d+|\/calendar\b|\/exhibit\b|\/visit\b|\/tickets?\b|\/membership\b|\/education\b|\/donate\b|\/mitzvah\b|\/corporate\b|\/meetings?\b|\?replytocom|\?utm_|\?s=|#|\/staff\b|\/people\b|\/team\b|\/leadership\b|\/profile\/|\/internships?\b|\/volunteer|\/donate\b|\/member(ship)?\b|\/history\b|\/licensing\b|\/copyright|\/privacy|\/non-discrimination|\/land-acknowledg|\/statement\b|\/website-terms|\/traveling-|\/workplace\b|\/business-services\b|\/centers-and-offices\b|\/education\b|\/research\b|\/collections?\b|\/science\b|\/learn\b|\/exhibitions?\b|\/annual-report/;

/** Returns the registrable host (lowercased, `www.` stripped), or null if unparsable. */
function registrableHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Same host ignoring scheme and a leading `www.`. */
export function sameRegistrableHost(a: string, b: string): boolean {
  const ha = registrableHost(a);
  const hb = registrableHost(b);
  return ha !== null && ha === hb;
}

/** An off-site PDF (different host than the venue's own) is only worth following when the URL
 * or its anchor text is wedding/pricing/capacity-relevant -- the plan's Marchetti
 * framerusercontent.com brochure is the motivating case. */
export function isOffsitePdfAllowed(url: string, anchorText?: string): boolean {
  const hay = `${url} ${anchorText ?? ""}`;
  return PDF_RELEVANCE_RE.test(hay);
}

/**
 * Score a discovered URL for crawl priority. Returns `null` when the URL should be skipped
 * outright (non-html/pdf extension, `/wp-content/uploads/` non-PDF asset, `mailto:`, `tel:`,
 * or an unparsable URL) -- distinct from a negative score, which is still followed at
 * low priority (crawlVenue.ts only requires `score >= 0 || depth <= 1`).
 */
export function scoreUrl(url: string, options: ScoreUrlOptions = {}): number | null {
  if (/^mailto:/i.test(url) || /^tel:/i.test(url) || /^javascript:/i.test(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const path = parsed.pathname.toLowerCase();
  const fullPathAndQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`.toLowerCase();
  const isPdf = /\.pdf$/i.test(path);

  if (!isPdf) {
    if (SKIP_EXTENSIONS.test(path)) return null;
    if (/\/wp-content\/uploads\//i.test(path)) return null;
  }

  let score = 0;

  if (WEDDING_RE.test(path)) score += 6;
  if (EVENT_RENTAL_RE.test(path)) score += 5;
  if (POLICY_RE.test(path)) score += 6; // as high as /weddings, per review
  if (CAPACITY_RE.test(path)) score += 4;
  if (SPACE_RE.test(path) && SPACE_CONTEXT_RE.test(path)) score += 4;
  if (NETWORK_RE.test(path)) score += 3;
  if (INFO_RE.test(path)) score += 2;
  if (options.fromNav) score += 2;
  if (SPACE_NAME_RE.test(path.replace(/[-_/]+/g, " "))) score += 4;
  if ((options.parentScore ?? 0) >= 5) score += 3;

  if (isPdf) {
    score += isOffsitePdfAllowed(url, options.anchorText) ? 5 : -5;
  }

  if (LODGING_RE.test(path)) score -= 10;
  if (NOISE_RE.test(fullPathAndQuery)) score -= 10;

  return score;
}
