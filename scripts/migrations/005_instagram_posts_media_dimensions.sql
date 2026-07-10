-- Migration 005: Store first-slide media dimensions from Apify for embed sizing.
-- media_width / media_height = display dimensions of the post frame (first carousel slide).

ALTER TABLE instagram_posts
  ADD COLUMN IF NOT EXISTS media_width  INTEGER,
  ADD COLUMN IF NOT EXISTS media_height INTEGER;
