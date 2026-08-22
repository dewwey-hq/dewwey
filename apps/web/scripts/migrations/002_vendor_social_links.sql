-- Migration 002: Vendor Social Links & Instagram Posts
--
-- vendor_social_links: stores all social media URLs found on vendor websites,
--   populated by scripts/extract-social-links.js. Also used to populate
--   vendors.instagram_handle for downstream Instagram scraping.
--
-- instagram_posts: stores individual posts scraped from vendor Instagram
--   profiles via Apify, populated by scripts/scrape-instagram.js.
--   location_tag powers the "vendors who work at this venue" relationship
--   graph by matching post locations to venue names.

-- ── vendor_social_links ────────────────────────────────────────────────────
-- One row per (vendor, platform, url) triple. A vendor may have multiple
-- URLs per platform (e.g. a personal and a business Instagram).
-- platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'youtube' | 'pinterest'

CREATE TABLE IF NOT EXISTS vendor_social_links (
  id         SERIAL PRIMARY KEY,
  vendor_id  INTEGER NOT NULL REFERENCES vendors(id),
  platform   VARCHAR(50) NOT NULL,
  url        VARCHAR(500) NOT NULL,
  found_at   TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_vendor_platform_url UNIQUE (vendor_id, platform, url)
);

CREATE INDEX IF NOT EXISTS idx_vendor_social_links_vendor_id
  ON vendor_social_links(vendor_id);

-- ── instagram_posts ────────────────────────────────────────────────────────
-- Recent posts scraped from each vendor's Instagram profile. caption_raw
-- contains the full caption text (often includes tagged vendor handles).
-- location_tag is matched against venue names to infer co-vendor relationships
-- without requiring explicit tagging in the caption.

CREATE TABLE IF NOT EXISTS instagram_posts (
  id           SERIAL PRIMARY KEY,
  vendor_id    INTEGER NOT NULL REFERENCES vendors(id),
  post_url     VARCHAR(500) NOT NULL UNIQUE,
  location_tag VARCHAR(255),
  caption_raw  TEXT,
  scraped_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_vendor_id
  ON instagram_posts(vendor_id);
