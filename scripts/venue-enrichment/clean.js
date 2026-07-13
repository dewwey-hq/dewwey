const cheerio = require("cheerio");

const STRIP_SELECTORS =
  "script, style, noscript, svg, iframe, nav, footer, header, [role='navigation'], .cookie, .popup, #cookie";

const MAX_CHARS_PER_PAGE = parseInt(process.env.ENRICH_CLEAN_MAX_CHARS || "12000", 10);
/** Cap listed hrefs per page so the LLM prompt stays small. */
const MAX_ASSET_LINKS_PER_PAGE = parseInt(process.env.ENRICH_MAX_ASSET_LINKS || "12", 10);
/**
 * Global unique URLs in ASSET CANDIDATES for the LLM.
 * Vendor *names* are a rules job (network_vendors) — do not dump every vendor profile here.
 */
const MAX_ASSET_LINKS_TOTAL = parseInt(process.env.ENRICH_MAX_ASSET_LINKS_TOTAL || "40", 10);
/** Max vendor category hub URLs (photography/, flowers/, …) in the LLM candidate list. */
const MAX_VENDOR_HUBS = parseInt(process.env.ENRICH_MAX_VENDOR_HUBS || "15", 10);

function pageTitle($) {
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;
  return $("title").text().trim();
}

function mainRoot($) {
  const sel = $("main, article, [role='main'], .entry-content, .page-content, #content, .content");
  if (sel.length) return sel.first();
  return $("body");
}

function classifyAssetHref(href, label) {
  const h = `${href} ${label}`.toLowerCase();
  const isPdf = /\.pdf(\?|$)/i.test(href);

  if (isPdf) {
    if (/vendor|caterer|preferred|partner|florist|photo/.test(h)) return "vendor_list_pdf";
    if (/package|pricing|rate|menu/.test(h)) return "package_pdf";
    if (/brochure|lookbook|guide/.test(h)) return "brochure_pdf";
    if (/floor.?plan|seating|capacity/.test(h)) return "floor_plan";
    return "pdf";
  }

  if (/floor.?plan|seating.?chart/i.test(h)) return "floor_plan";
  if (/brochure|lookbook|package|pricing/i.test(h)) return "package_page";

  // Index: /wedding-vendors/ or /preferred-caterers/
  if (
    /\/(preferred-)?vendors?\/?$/i.test(href) ||
    /\/wedding-vendors\/?$/i.test(href) ||
    /\/(preferred-)?caterers?\/?$/i.test(href) ||
    /\/caterers?-?partners\/?$/i.test(href)
  ) {
    return "vendor_index";
  }

  // Category hub: /wedding-vendors/photography/ — not /wedding-vendor/paramount/
  if (/\/wedding-vendors\/[a-z0-9-]+\/?$/i.test(href) || /\/vendors\/[a-z0-9-]+\/?$/i.test(href)) {
    return "vendor_category_hub";
  }

  return "other";
}

function isIndividualVendorProfile(url) {
  return /\/wedding-vendor\/[^/]+\/?$/i.test(url) || /\/vendors?\/[^/]+\/[^/]+\/?$/i.test(url);
}

/**
 * Collect likely asset URLs for the LLM prompt.
 * Full vendor inventories stay a rules job (network_vendors). Here we only surface:
 * - real PDFs / floor plans / package docs
 * - vendor index + category hub pages (not every individual vendor profile)
 */
function extractAssetCandidateLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  $("a[href]").each((_, el) => {
    if (links.length >= MAX_ASSET_LINKS_PER_PAGE) return false;
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    let abs;
    try {
      abs = new URL(href, pageUrl).href;
    } catch {
      return;
    }
    if (isIndividualVendorProfile(abs)) return;

    const path = abs.split("?")[0].toLowerCase();
    const label = $(el).text().replace(/\s+/g, " ").trim().slice(0, 120);
    const looksPdf = /\.pdf$/i.test(path) || /\.pdf(\?|$)/i.test(abs);
    const looksFloorImg =
      /floor.?plan|seating/i.test(`${path} ${label}`) &&
      /\.(jpg|jpeg|png|webp|svg)(\?|$)/i.test(path);
    const looksPackage =
      looksPdf ||
      /brochure|lookbook|package.*pdf|pricing.*pdf/i.test(`${path} ${label}`);
    const looksVendorHub =
      /\/(preferred-)?vendors?\/?$/i.test(path) ||
      /\/wedding-vendors\/?$/i.test(path) ||
      /\/wedding-vendors\/[a-z0-9-]+\/?$/i.test(path) ||
      /\/vendors\/[a-z0-9-]+\/?$/i.test(path) ||
      /\/(preferred-)?caterers?\/?$/i.test(path) ||
      /\/caterers?-?partners\/?$/i.test(path);

    if (!looksPdf && !looksFloorImg && !looksPackage && !looksVendorHub) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    links.push({
      url: abs,
      label: label || null,
      kind: classifyAssetHref(abs, label || ""),
    });
  });

  return links;
}

function formatAssetCandidates(links) {
  if (!links.length) return "";
  const lines = links.map((l) => {
    const label = l.label ? ` "${l.label}"` : "";
    return `- ${l.url} [${l.kind}]${label}`;
  });
  return `\nASSET CANDIDATES (downloads + vendor hubs — report wedding-relevant ones in discovered_assets; vendor *names* are extracted separately by rules; do not invent URLs):\n${lines.join("\n")}`;
}

/** Strip boilerplate and return readable text for one crawled page. */
function cleanPageHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const assetCandidates = extractAssetCandidateLinks(html, pageUrl);
  $(STRIP_SELECTORS).remove();
  const root = mainRoot($);
  const title = pageTitle($);
  let text = root.text().replace(/\s+/g, " ").trim();
  if (text.length > MAX_CHARS_PER_PAGE) {
    text = `${text.slice(0, MAX_CHARS_PER_PAGE)}…`;
  }
  return {
    url: pageUrl,
    title,
    text,
    asset_candidates: assetCandidates,
    char_count: text.length,
  };
}

function assetRank(a) {
  if (/\.pdf(\?|$)/i.test(a.url)) return 0;
  if (/brochure_pdf|package_pdf|floor_plan|package_page/.test(a.kind)) return 1;
  if (a.kind === "vendor_index") return 2;
  if (a.kind === "vendor_category_hub" || a.kind === "vendor_list_pdf") return 3;
  return 4;
}

/** Concatenate cleaned pages with source markers for one LLM extraction call per venue. */
function buildVenueDocument(pages) {
  const cleanedPages = pages.map((p) => cleanPageHtml(p.html, p.url));

  const ranked = cleanedPages
    .flatMap((p) => p.asset_candidates.map((a) => ({ ...a, source_url: p.url })))
    .sort((a, b) => assetRank(a) - assetRank(b) || a.url.localeCompare(b.url));

  const globalSeen = new Set();
  const globalAssets = [];
  let vendorHubCount = 0;

  for (const a of ranked) {
    if (globalSeen.has(a.url)) continue;
    const isHub = a.kind === "vendor_category_hub" || a.kind === "vendor_index";
    if (isHub && vendorHubCount >= MAX_VENDOR_HUBS) continue;
    globalSeen.add(a.url);
    globalAssets.push(a);
    if (isHub) vendorHubCount += 1;
    if (globalAssets.length >= MAX_ASSET_LINKS_TOTAL) break;
  }
  const allowed = new Set(globalAssets.map((a) => a.url));

  const chunks = [];
  let totalChars = 0;
  for (const cleaned of cleanedPages) {
    const pageAssets = cleaned.asset_candidates.filter((a) => allowed.has(a.url));
    const assetBlock = formatAssetCandidates(pageAssets);
    const block = `--- PAGE: ${cleaned.url} ---\nTITLE: ${cleaned.title}\n\n${cleaned.text}${assetBlock}`;
    chunks.push(block);
    totalChars += block.length;
  }
  return {
    document: chunks.join("\n\n"),
    page_count: pages.length,
    char_count: totalChars,
    asset_candidate_count: globalAssets.length,
    pages: cleanedPages,
  };
}

module.exports = {
  cleanPageHtml,
  buildVenueDocument,
  extractAssetCandidateLinks,
};
