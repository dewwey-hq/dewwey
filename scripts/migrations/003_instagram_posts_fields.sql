-- Migration 003: Add fields to instagram_posts
--
-- Adds post metadata captured from Apify that supports:
--   post_timestamp — filter/sort by recency, skip stale content
--   image_url      — display actual wedding photos in a real weddings gallery
--   likes_count    — engagement signal for ranking vendor posts
--   owner_username — who posted (photographer vs venue), aids relationship inference

ALTER TABLE instagram_posts
  ADD COLUMN IF NOT EXISTS post_timestamp TIMESTAMP,
  ADD COLUMN IF NOT EXISTS image_url      VARCHAR(500),
  ADD COLUMN IF NOT EXISTS likes_count    INTEGER,
  ADD COLUMN IF NOT EXISTS owner_username VARCHAR(100);
