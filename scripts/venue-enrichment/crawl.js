const cheerio = require("cheerio");
const {
  CRAWL_LINK_KEYWORDS,
  SEED_PATHS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_PAGES,
  FETCH_DELAY_MS,
} = require("./constants");
const { classifyPageContext } = require("./classify");
const { fetchHtml, sleep } = require("./fetch");

function normalizeUrl(url, base) {
  try {
    const u = new URL(url, base);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return null;
  }
}

function siteHost(url) {
  return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
}

/** Same registrable host — ignores http/https and www vs bare domain. */
function sameSite(url, referenceUrl) {
  try {
    return siteHost(url) === siteHost(referenceUrl);
  } catch {
    return false;
  }
}

/** @deprecated use sameSite */
function sameOrigin(url, origin) {
  return sameSite(url, origin);
}

function isLikelyPageUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|zip|doc|docx|mp4|mov|mp3|wav|css|js)$/i.test(path)) {
      return false;
    }
    if (/\/wp-content\/uploads\//i.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

function shouldFollow(url) {
  try {
    const u = new URL(url);
    const path = `${u.pathname} ${u.search}`.toLowerCase();
    return CRAWL_LINK_KEYWORDS.test(path);
  } catch {
    return false;
  }
}

function extractLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    const abs = normalizeUrl(href, pageUrl);
    if (abs && isLikelyPageUrl(abs)) links.add(abs);
  });
  return [...links];
}

function extractNavLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  const selectors = "nav a[href], header a[href], footer a[href], [role='navigation'] a[href]";
  $(selectors).each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    const abs = normalizeUrl(href, pageUrl);
    if (abs && isLikelyPageUrl(abs)) links.add(abs);
  });
  return [...links];
}

function seedUrls(origin) {
  const urls = new Set();
  for (const path of SEED_PATHS) {
    const u = normalizeUrl(path, origin);
    if (u) urls.add(u);
  }
  return [...urls];
}

function linkPriority(link) {
  if (/wedding-ideas|\/ideas\/|\/blog\//i.test(link)) return 5;
  if (
    /\/wedding-vendors\/|\/resources\/|preferred-vendor|preferred-cater|local-resource|caterers?-partners?|\/partners?\/|approved-cater/i.test(
      link,
    )
  ) {
    return 0;
  }
  if (/preferred|vendor|partner|resource|policy|floor|package|cater|guideline|amenit/i.test(link)) return 0;
  if (/wedding|bridal|ceremony|reception/i.test(link) && !/wedding-ideas/i.test(link)) return 1;
  if (/contact|about|tour|faq|floor|plan|package|amenit/i.test(link)) return 2;
  return 3;
}

/** Venue-published vendor profile pages — extract from listing pages, don't crawl each profile. */
const VENDOR_PROFILE_PATH_RE = /\/wedding-vendor\/[^/?#]+/i;

function shouldCrawlLink(url, weddingOnly = true) {
  if (!isLikelyPageUrl(url)) return false;
  try {
    if (VENDOR_PROFILE_PATH_RE.test(new URL(url).pathname)) return false;
  } catch {
    return false;
  }
  if (!weddingOnly) return true;
  return classifyPageContext(url) !== "non_wedding";
}

function isVendorDirectoryHub(pageUrl) {
  try {
    const path = new URL(pageUrl).pathname.replace(/\/$/, "").toLowerCase();
    return /\/(wedding-vendors|resources|preferred-vendors|local-resources|recommended-vendors|caterers-partners|partners|approved-caterers)$/.test(
      path,
    );
  } catch {
    return false;
  }
}

/** Category subpages linked from a vendor directory hub (e.g. /wedding-vendors/catering). */
function extractVendorHubCategoryLinks(html, pageUrl, siteRoot) {
  if (!isVendorDirectoryHub(pageUrl)) return [];
  const hubPath = new URL(pageUrl).pathname.replace(/\/$/, "");
  const $ = cheerio.load(html);
  const links = new Set();
  $("a[href]").each((_, el) => {
    const abs = normalizeUrl($(el).attr("href"), pageUrl);
    if (!abs || !sameSite(abs, siteRoot)) return;
    try {
      const path = new URL(abs).pathname.replace(/\/$/, "");
      if (path !== hubPath && path.startsWith(`${hubPath}/`)) links.add(abs);
    } catch {
      // ignore
    }
  });
  return [...links];
}

function collectChildLinks(html, pageUrl, siteRoot, seen, options = {}) {
  const weddingOnly = options.weddingOnly !== false;
  const navLinks = extractNavLinks(html, pageUrl);
  const allLinks = extractLinks(html, pageUrl);
  const childLinks = new Set();

  for (const link of navLinks) {
    if (!sameSite(link, siteRoot) || seen.has(link)) continue;
    if (shouldCrawlLink(link, weddingOnly)) childLinks.add(link);
  }

  for (const link of allLinks) {
    if (!sameSite(link, siteRoot) || seen.has(link)) continue;
    if (!shouldCrawlLink(link, weddingOnly)) continue;
    if (navLinks.includes(link) || shouldFollow(link)) childLinks.add(link);
  }

  return [...childLinks].sort((a, b) => linkPriority(a) - linkPriority(b));
}

/**
 * BFS crawl within same origin. Returns [{ url, html, depth }].
 *
 * Default: start at homepage, follow nav + keyword-matched links only.
 * Pass probeSeeds: true to also try common /weddings, /contact-us, etc. (many 404).
 */
async function crawlSite(startUrl, options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const delayMs = options.delayMs ?? FETCH_DELAY_MS;
  const probeSeeds = options.probeSeeds ?? false;
  const weddingOnly = options.weddingOnly !== false;

  const start = normalizeUrl(startUrl);
  if (!start) throw new Error(`Invalid start URL: ${startUrl}`);

  let siteRoot = start;
  const seen = new Set();
  const queue = [{ url: start, depth: 0 }];

  if (probeSeeds) {
    for (const url of seedUrls(start)) {
      if (url !== start) queue.push({ url, depth: 0 });
    }
  }

  const pages = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);

    let html;
    let pageUrl = url;
    try {
      process.stderr.write(`  crawl [d${depth}] ${url}\n`);
      const fetched = await fetchHtml(url);
      html = fetched.html;
      pageUrl = normalizeUrl(fetched.finalUrl) || url;
      if (depth === 0) siteRoot = pageUrl;
    } catch (err) {
      process.stderr.write(`  skip ${url}: ${err.message}\n`);
      continue;
    }

    pages.push({ url: pageUrl, html, depth });
    await sleep(delayMs);

    if (depth >= maxDepth) continue;

    const childLinks = collectChildLinks(html, pageUrl, siteRoot, seen, { weddingOnly });
    const hubLinks = extractVendorHubCategoryLinks(html, pageUrl, siteRoot).filter(
      (link) => !seen.has(link) && shouldCrawlLink(link, weddingOnly),
    );
    const high = [...new Set([...hubLinks, ...childLinks.filter((link) => linkPriority(link) <= 1)])];
    const low = childLinks.filter((link) => linkPriority(link) > 1 && !high.includes(link));
    for (let i = high.length - 1; i >= 0; i--) {
      queue.unshift({ url: high[i], depth: depth + 1 });
    }
    for (const link of low) {
      queue.push({ url: link, depth: depth + 1 });
    }
  }

  return pages;
}

module.exports = {
  crawlSite,
  normalizeUrl,
  extractLinks,
  extractNavLinks,
  sameSite,
  sameOrigin,
  siteHost,
  isLikelyPageUrl,
  shouldFollow,
};
