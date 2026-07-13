/** Dewy vendor categories (matches scripts/config/search-terms.js). */
const DEWY_CATEGORIES = [
  "venue",
  "caterer",
  "florist",
  "photographer",
  "dj_music",
  "hair_makeup",
  "other",
];

/** Map URL/title keywords → Dewy category. Order matters (first match). */
const CATEGORY_KEYWORDS = [
  { category: "caterer", patterns: [/cater/i, /culinar/i, /food\b/i, /dining/i, /banquet/i] },
  { category: "florist", patterns: [/flor/i, /flower/i, /botanical/i, /bouquet/i] },
  { category: "photographer", patterns: [/photo/i, /videograph/i, /film/i] },
  { category: "dj_music", patterns: [/\bdj\b/i, /\bband\b/i, /music/i, /entertainment/i] },
  { category: "hair_makeup", patterns: [/hair/i, /makeup/i, /beauty/i, /salon/i, /stylist/i] },
  { category: "venue", patterns: [/hotel/i, /lodging/i, /accommodat/i] },
];

/** Niche specialties when category stays `other`. */
const SPECIALTY_KEYWORDS = [
  { specialty: "rentals", patterns: [/rental/i, /linen/i, /tablescape/i, /furniture/i] },
  { specialty: "planning", patterns: [/planner/i, /coordination/i, /event planning/i] },
  { specialty: "bakery", patterns: [/cake/i, /bakery/i, /dessert/i] },
  { specialty: "transportation", patterns: [/transport/i, /limo/i, /shuttle/i] },
  { specialty: "officiant", patterns: [/officiant/i, /ceremony/i] },
  { specialty: "lighting", patterns: [/lighting/i, /uplight/i] },
  { specialty: "security", patterns: [/security/i] },
  { specialty: "stationery", patterns: [/stationery/i, /invitation/i] },
];

const CRAWL_LINK_KEYWORDS =
  /wedding|event|policy|policies|cater|floor|plan|package|faq|contact|parking|hotel|vendor|partner|resource|tour|usage|brochure|preferred|recommended|local-|amenities|guidelines/i;

const SEED_PATHS = [
  "/",
  "/weddings",
  "/wedding",
  "/events",
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/our-story",
  "/faq",
  "/packages",
  "/preferred-caterers",
  "/preferred-vendors",
  "/caterers-partners",
  "/partners",
  "/local-resources",
  "/planning-your-wedding",
];

const NETWORK_PAGE_KEYWORDS =
  /preferred|recommended|vendor|partner|resource|cater|florist|photo|dj|planner|local-/i;

const SOCIAL_PLATFORMS = [
  { name: "instagram", domains: ["instagram.com"] },
  { name: "facebook", domains: ["facebook.com", "fb.com"] },
  { name: "tiktok", domains: ["tiktok.com"] },
  { name: "twitter", domains: ["twitter.com", "x.com"] },
  { name: "youtube", domains: ["youtube.com", "youtu.be"] },
  { name: "pinterest", domains: ["pinterest.com", "pin.it"] },
];

const IG_SKIP_PATHS = new Set([
  "p", "reel", "reels", "stories", "explore",
  "accounts", "about", "sharer", "share", "web",
]);

const JUNK_EMAIL =
  /noreply|no-reply|wordpress|sentry|wixpress|example\.com|@email\.com|^name@|^test@|^user@|^email@|\.com[a-z]{2,}/i;

const JUNK_LINK_NAMES =
  /^(inquiry|website|click here|read more|learn more|book now|contact|email|phone|here|link|instagram|facebook|tiktok|youtube|pinterest)$/i;

/** Vendor list noise — CTAs, directories, addresses, copyright. */
const JUNK_VENDOR_NAME =
  /the knot|wedding\s*wire|yelp|zola|follow us|follow @|download your|view on instagram|google maps|all rights reserved|copyright|linkedin|^\s*careers\s*$|^\s*events\s*$|\b\d{3,5}\s+(north|south|east|west|n\.|s\.|e\.|w\.)\b|\b(street|st\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|road|rd\.?)\b/i;

const JUNK_VENDOR_URL =
  /theknot\.com|weddingwire\.com|yelp\.com|zola\.com|google\.com\/maps|maps\.google|facebook\.com\/sharer|twitter\.com\/intent|weddingpro\.com|linkedin\.com/i;

function isValidEmail(email) {
  if (!email || JUNK_EMAIL.test(email)) return false;
  const normalized = email.toLowerCase().trim();
  const parts = normalized.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length < 1 || local.length > 64) return false;
  if (!/^[\w.+-]+$/.test(local)) return false;
  if (/\d{6,}/.test(local)) return false;
  const domainParts = domain.split(".");
  if (domainParts.length < 2) return false;
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || tld.length > 12 || !/^[a-z]+$/.test(tld)) return false;
  if (domainParts.some((p) => !p || p.length > 63)) return false;
  return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(normalized);
}

function isValidPhone(raw) {
  if (!raw) return false;
  let phone = raw.trim();
  try {
    phone = decodeURIComponent(phone);
  } catch {
    // keep raw
  }
  if (/999[\s.-]?999[\s.-]?9999/.test(phone)) return false;
  if (/^%/.test(raw.trim())) return false;
  if (!/\d{3}/.test(phone)) return false;
  return true;
}

const FETCH_UA = "Mozilla/5.0 (compatible; DewweyBot/1.0; +https://dewwey.com)";

module.exports = {
  DEWY_CATEGORIES,
  CATEGORY_KEYWORDS,
  SPECIALTY_KEYWORDS,
  CRAWL_LINK_KEYWORDS,
  SEED_PATHS,
  NETWORK_PAGE_KEYWORDS,
  SOCIAL_PLATFORMS,
  IG_SKIP_PATHS,
  JUNK_EMAIL,
  JUNK_LINK_NAMES,
  JUNK_VENDOR_NAME,
  JUNK_VENDOR_URL,
  isValidEmail,
  isValidPhone,
  FETCH_UA,
  DEFAULT_MAX_DEPTH: 3,
  DEFAULT_MAX_PAGES: 30,
  FETCH_DELAY_MS: 800,
};
