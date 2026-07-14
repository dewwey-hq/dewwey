const { CATEGORY_KEYWORDS, SPECIALTY_KEYWORDS } = require("./constants");

function guessCategory(text) {
  const hay = text.toLowerCase();
  for (const { category, patterns } of CATEGORY_KEYWORDS) {
    if (patterns.some((p) => p.test(hay))) return category;
  }
  return "other";
}

function guessSpecialty(text) {
  const hay = text.toLowerCase();
  for (const { specialty, patterns } of SPECIALTY_KEYWORDS) {
    if (patterns.some((p) => p.test(hay))) return specialty;
  }
  return null;
}

function guessRelationship(url, pageTitle) {
  const hay = `${url} ${pageTitle}`.toLowerCase();
  if (/local-resource|hotels-and-parking|\/local\//.test(hay)) return "local_resource";
  if (/preferred/.test(hay)) return "preferred";
  if (/recommended/.test(hay)) return "recommended";
  if (/partner/.test(hay)) return "partner";
  return "vendor_link";
}

/**
 * Hotel guest lodging / booking paths — emit room-rate noise and burn page budget.
 * Keep bridal-suite / event "rooms" via the wedding|events|banquet overrides below.
 */
const LODGING_PATH_RE =
  /accommodat|guest-?rooms?|hotel-rooms?|rooms-and-suites|book-a-room|room-rates?|\/rooms(?:\/|$)|\/suites?(?:\/|$)|\/rates(?:\/|$)|\/reservations?(?:\/|$)|\/stay(?:\/|$)|lodging|book-your-stay|book-now|offers?\/rooms?|\/sleep(?:\/|$)/i;

/** Paths we skip entirely — corporate, blog, calendar, museum public programming, etc. */
const NON_WEDDING_PATH_RE =
  /corporate|corportate|mitzvah|quincea|bar-?bat|private-parties|other-events|social-events|not-for-profit|public-events|fundraising|recyclery|corporate-guidelines|corporate-photo|mitzvahs|colvin_concerts|colvin_public|corporavents|cooking-events|networking-events|tourism|\/blog|\/calendar|educational-resources|professional-development|free-wednesdays|playlab|poetry-pop-up|press-room|exhibitions?(?:-and-events)?|our-events(?:\/|$)/i;

/**
 * Explicit wedding / event-rental sections.
 * Museums/hotels often bury ballrooms under private-events / venue-rental (not /weddings).
 */
const WEDDING_PATH_RE =
  /wedding|bridal|ceremony|reception|marriage|loftyweddings|preferred-cater|preferred-vendor|planning-your-wedding|usage-polic|amenities-polic|ceremonyand|caterers?-partners?|venue-rental|host-an-event|host-your|facility-rental|event-spaces?|private-events?|private-dining|banquet|ballroom|celebrate|spaces-to-rent|rent-(?:our|the)|hold-an-event|plan-an-event|events-weddings|weddings-events/i;

/** Shared pages that may contain wedding facts (contact, floor plans, catering list). */
const NEUTRAL_WEDDING_PATH_RE =
  /^\/$|contact|about|floor|faq|direction|tour|map|catering|caterers?|amenit|package|local-resource|schedule|testimonial|space|room|facilit|events|galler|photo|360|inquire|policy|guideline|preferred|vendor|partner|resource|parking|usage|planning|virtual-tour|hotels-and-parking|meeting/i;

/** Pathname only — avoid `pathname + " " + search` breaking `/rates$` matches. */
function urlPathname(pageUrl) {
  try {
    return new URL(pageUrl).pathname.toLowerCase();
  } catch {
    return String(pageUrl || "").toLowerCase();
  }
}

/** True for hotel ADR / guest-room booking URLs (skip crawl + classify as non_wedding). */
function isLodgingPath(pageUrl) {
  const path = urlPathname(pageUrl);
  // Event / wedding room pages win over lodging keywords (e.g. /weddings/bridal-suite).
  if (WEDDING_PATH_RE.test(path)) return false;
  if (/\/events?(?:\/|$)|\/meetings?(?:\/|$)|\/banquet|\/ballroom|floor-?plan|capacity/i.test(path)) {
    return false;
  }
  return LODGING_PATH_RE.test(path);
}

function classifyPageContext(pageUrl, title = "") {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase();
    const hay = `${path} ${title}`.toLowerCase();
    if (isLodgingPath(pageUrl)) return "non_wedding";
    if (/\/blog|-blog\/|-blog$|\/calendar|recyclery|wedding-ideas|\/ideas\//.test(path)) return "non_wedding";
    if (NON_WEDDING_PATH_RE.test(hay)) return "non_wedding";
    if (WEDDING_PATH_RE.test(hay)) return "wedding";
    if (path === "/" || path === "") return "neutral";
    if (NEUTRAL_WEDDING_PATH_RE.test(path)) return "neutral";
    return "non_wedding";
  } catch {
    return "non_wedding";
  }
}

function isVenueContactPage(pageUrl) {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase();
    return path === "/" || path === "" || /contact|inquire|schedule-a-tour|book-a-tour/i.test(path);
  } catch {
    return false;
  }
}

function pageHasWeddingFocus(text) {
  return /\bweddings?\b|\bbridal\b|\bceremony\b|\breception\b|\bmarry/i.test(text);
}

/** Whether to extract wedding policies, amenities, vendors, inventory from this page. */
function useWeddingExtraction(pageUrl, title, bodyText = "") {
  const context = classifyPageContext(pageUrl, title);
  if (context === "non_wedding") return false;
  if (context === "wedding") return true;
  const path = new URL(pageUrl).pathname.toLowerCase();
  if (/\/floor|\/plan|\/capacity|\/room|\/facilit|\/amenit|\/polic|\/guideline|\/cater|\/partner|\/package|\/preferred|\/vendor|\/usage|\/events/i.test(path)) {
    return true;
  }
  return pageHasWeddingFocus(bodyText);
}

module.exports = {
  guessCategory,
  guessSpecialty,
  guessRelationship,
  classifyPageContext,
  isLodgingPath,
  isVenueContactPage,
  pageHasWeddingFocus,
  useWeddingExtraction,
};
