require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

// Platforms to detect and their known domains
const SOCIAL_PLATFORMS = [
  { name: "instagram", domains: ["instagram.com"] },
  { name: "facebook",  domains: ["facebook.com", "fb.com"] },
  { name: "tiktok",    domains: ["tiktok.com"] },
  { name: "twitter",   domains: ["twitter.com", "x.com"] },
  { name: "youtube",   domains: ["youtube.com", "youtu.be"] },
  { name: "pinterest", domains: ["pinterest.com", "pin.it"] },
];

// Instagram paths that aren't profile handles
const IG_SKIP_PATHS = new Set([
  "p", "reel", "reels", "stories", "explore",
  "accounts", "about", "sharer", "share", "web",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function detectPlatform(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const p of SOCIAL_PLATFORMS) {
      if (p.domains.some((d) => hostname === d || hostname.endsWith("." + d))) {
        return p.name;
      }
    }
  } catch {}
  return null;
}

function extractInstagramHandle(url) {
  try {
    const pathname = new URL(url).pathname.replace(/^\/|\/$/g, "");
    const handle = pathname.split("/")[0];
    if (!handle || IG_SKIP_PATHS.has(handle) || handle.startsWith("?")) return null;
    return handle;
  } catch {}
  return null;
}

function parseSocialLinks(html) {
  const found = new Map(); // platform → Set<url>
  const hrefRe = /href=["']([^"']{10,500})["']/gi;
  let match;
  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1];
    if (!href.startsWith("http")) continue;
    const platform = detectPlatform(href);
    if (!platform) continue;
    try {
      const u = new URL(href);
      // Normalize: strip query string, fragment, and trailing slash
      const clean = `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/$/, "");
      if (!found.has(platform)) found.set(platform, new Set());
      found.get(platform).add(clean);
    } catch {}
  }
  return found;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DewyBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const { rows: vendors } = await pool.query(`
      SELECT id, name, website
      FROM vendors
      WHERE website IS NOT NULL AND instagram_handle IS NULL
      ORDER BY id
    `);

    console.log("\n" + "═".repeat(60));
    console.log(`EXTRACT SOCIAL LINKS — ${vendors.length} vendors to check`);
    console.log("═".repeat(60));

    const stats = { checked: 0, withLinks: 0, failed: 0, instagram: 0 };

    for (const vendor of vendors) {
      console.log(`\n▸ [${vendor.id}] ${vendor.name}`);
      console.log(`  ${vendor.website}`);

      let html;
      try {
        html = await fetchHtml(vendor.website);
        stats.checked++;
      } catch (err) {
        console.log(`  ✗ fetch failed: ${err.message}`);
        stats.failed++;
        await sleep(1000);
        continue;
      }

      const socialLinks = parseSocialLinks(html);

      if (socialLinks.size === 0) {
        console.log("  – no social links found");
        await sleep(1500);
        continue;
      }

      stats.withLinks++;
      let igHandle = null;

      for (const [platform, urls] of socialLinks) {
        for (const url of urls) {
          await pool.query(
            `INSERT INTO vendor_social_links (vendor_id, platform, url)
             VALUES ($1, $2, $3)
             ON CONFLICT (vendor_id, platform, url) DO NOTHING`,
            [vendor.id, platform, url]
          );
          console.log(`  ✓ ${platform}: ${url}`);

          if (platform === "instagram" && !igHandle) {
            igHandle = extractInstagramHandle(url);
          }
        }
      }

      if (igHandle) {
        await pool.query(
          `UPDATE vendors SET instagram_handle = $1 WHERE id = $2`,
          [igHandle, vendor.id]
        );
        console.log(`  → instagram_handle: @${igHandle}`);
        stats.instagram++;
      }

      await sleep(1500);
    }

    console.log("\n" + "═".repeat(60));
    console.log("SUMMARY");
    console.log("═".repeat(60));
    console.log(`  Vendors checked    : ${stats.checked}`);
    console.log(`  Had social links   : ${stats.withLinks}`);
    console.log(`  Instagram handles  : ${stats.instagram}`);
    console.log(`  Failed to fetch    : ${stats.failed}`);
    console.log("═".repeat(60) + "\n");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("extract-social-links failed:", err);
  process.exit(1);
});
