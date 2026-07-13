const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function urlHash(url) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function cacheDirForVenue(baseDir, venueName) {
  return path.join(baseDir, slugify(venueName));
}

function saveCrawlCache(baseDir, venueName, pages, startUrl) {
  const dir = cacheDirForVenue(baseDir, venueName);
  fs.mkdirSync(dir, { recursive: true });
  const crawledAt = new Date().toISOString();
  const manifest = {
    saved_at: crawledAt,
    crawled_at: crawledAt,
    start_url: startUrl,
    page_count: pages.length,
    pages: pages.map((p) => ({
      url: p.url,
      depth: p.depth,
      file: `${urlHash(p.url)}.html`,
      bytes: Buffer.byteLength(p.html, "utf8"),
    })),
  };
  for (const page of pages) {
    const file = path.join(dir, `${urlHash(page.url)}.html`);
    fs.writeFileSync(file, page.html);
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

function loadCrawlCache(baseDir, venueName) {
  const dir = cacheDirForVenue(baseDir, venueName);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const pages = manifest.pages.map((entry) => ({
    url: entry.url,
    depth: entry.depth ?? 0,
    html: fs.readFileSync(path.join(dir, entry.file), "utf8"),
  }));
  return { dir, manifest, pages };
}

module.exports = { slugify, saveCrawlCache, loadCrawlCache, cacheDirForVenue };
