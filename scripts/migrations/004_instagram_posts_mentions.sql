-- Migration 004: Add mentions, hashtags, post_type, images to instagram_posts
--
-- mentions   — array of @handles already extracted by Apify (replaces caption parsing)
-- hashtags   — array of hashtags extracted by Apify
-- post_type  — "Image", "Video", or "Sidecar" (carousel with multiple photos)
-- images     — JSON array of all image URLs (carousel posts have multiple; single posts
--              have one). Replaces image_url for multi-photo posts.

ALTER TABLE instagram_posts
  ADD COLUMN IF NOT EXISTS mentions   JSONB,
  ADD COLUMN IF NOT EXISTS hashtags   JSONB,
  ADD COLUMN IF NOT EXISTS post_type  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS images     JSONB;
