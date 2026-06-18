require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const { ApifyClient } = require("apify-client");

// Actor: apify/instagram-scraper
// Docs: https://apify.com/apify/instagram-scraper
const ACTOR_ID = "apify/instagram-scraper";
const POSTS_SINCE = "2024-01-01";  // pull all posts from 2024 onward
const POSTS_LIMIT = 200;           // ceiling so prolific accounts don't run away

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

  // --test <handle>  runs against a single vendor only
  // --limit N        cap how many vendors to scrape this run (for free tier pacing)
  const testHandle = (() => {
    const idx = process.argv.indexOf("--test");
    return idx !== -1 ? process.argv[idx + 1] : null;
  })();
  const limitArg = (() => {
    const idx = process.argv.indexOf("--limit");
    return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : null;
  })();

  try {
    const { rows: vendors } = await pool.query(`
      SELECT id, name, instagram_handle
      FROM vendors
      WHERE instagram_handle IS NOT NULL
        AND id NOT IN (SELECT DISTINCT vendor_id FROM instagram_posts)
        ${testHandle ? "AND instagram_handle = $1" : ""}
      ORDER BY id
    `, testHandle ? [testHandle] : []);

    if (vendors.length === 0) {
      console.log("No vendors to scrape — all handles already have posts.");
      return;
    }

    const batch = limitArg ? vendors.slice(0, limitArg) : vendors;

    console.log("\n" + "═".repeat(60));
    console.log(`SCRAPE INSTAGRAM — ${batch.length} of ${vendors.length} vendors queued`);
    console.log(`Posts since ${POSTS_SINCE}, ceiling ${POSTS_LIMIT} per vendor`);
    console.log("═".repeat(60));

    const stats = { scraped: 0, posts: 0, failed: 0 };

    // One Apify run per vendor — all returned posts are attributed to that vendor.
    // The actor returns posts by AND tagged at the profile, all of which are
    // associated with that vendor for the relationship graph.
    for (const vendor of batch) {
      console.log(`\n▸ [${vendor.id}] @${vendor.instagram_handle} (${vendor.name})`);

      let items;
      try {
        const run = await apify.actor(ACTOR_ID).call({
          directUrls: [`https://www.instagram.com/${vendor.instagram_handle}/`],
          resultsType: "posts",
          resultsLimit: POSTS_LIMIT,
          onlyPostsNewerThan: POSTS_SINCE,
        });
        const dataset = await apify.dataset(run.defaultDatasetId).listItems();
        items = dataset.items;
        console.log(`  → ${items.length} posts returned from Apify`);
      } catch (err) {
        console.error(`  ✗ [${vendor.id}] @${vendor.instagram_handle} — ${err.message}`);
        stats.failed++;
        stats.failedVendors = stats.failedVendors || [];
        stats.failedVendors.push(`[${vendor.id}] @${vendor.instagram_handle} (${vendor.name})`);
        await sleep(2000);
        continue;
      }

      for (const item of items) {
        const postUrl = item.url ||
          (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : null);
        if (!postUrl) continue;

        // Normalize timestamp — Apify returns Unix seconds or ISO string
        let postTimestamp = null;
        if (item.timestamp) {
          postTimestamp = typeof item.timestamp === "number"
            ? new Date(item.timestamp * 1000).toISOString()
            : item.timestamp;
        }

        // Instagram hides likes on some posts and returns -1
        const likesCount = (item.likesCount == null || item.likesCount < 0)
          ? null : item.likesCount;

        // For carousel (Sidecar) posts use the images array; otherwise wrap displayUrl
        const images = item.images?.length
          ? item.images
          : (item.displayUrl ? [item.displayUrl] : null);

        try {
          const result = await pool.query(
            `INSERT INTO instagram_posts
               (vendor_id, post_url, location_tag, caption_raw,
                post_timestamp, image_url, likes_count, owner_username,
                mentions, hashtags, post_type, images)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (post_url) DO NOTHING`,
            [
              vendor.id,
              postUrl,
              item.locationName || null,
              item.caption || null,
              postTimestamp,
              item.displayUrl || null,
              likesCount,
              item.ownerUsername || null,
              item.mentions?.length ? JSON.stringify(item.mentions) : null,
              item.hashtags?.length ? JSON.stringify(item.hashtags) : null,
              item.type || null,
              images ? JSON.stringify(images) : null,
            ]
          );
          if (result.rowCount > 0) {
            stats.posts++;
            const loc = item.locationName ? ` @ ${item.locationName}` : "";
            const date = postTimestamp ? ` (${postTimestamp.slice(0, 10)})` : "";
            console.log(`    ✓${loc}${date}`);
          } else {
            console.log(`    – duplicate: ${postUrl}`);
          }
        } catch (err) {
          console.error(`    ✗ insert failed: ${err.message}`);
        }
      }

      stats.scraped++;

      if (vendor !== batch[batch.length - 1]) {
        console.log("  waiting 2s…");
        await sleep(2000);
      }
    }

    console.log("\n" + "═".repeat(60));
    console.log("SUMMARY");
    console.log("═".repeat(60));
    console.log(`  Handles scraped  : ${stats.scraped}`);
    console.log(`  Posts inserted   : ${stats.posts}`);
    console.log(`  Failed           : ${stats.failed}`);
    if (stats.failedVendors?.length) {
      console.log("\nFailed vendors:");
      stats.failedVendors.forEach((v) => console.log(`  ✗ ${v}`));
    }
    console.log("═".repeat(60) + "\n");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("scrape-instagram failed:", err);
  process.exit(1);
});
