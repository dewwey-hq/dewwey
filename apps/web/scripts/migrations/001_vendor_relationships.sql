-- Migration 001: Vendor Relationships & Wedding Stories
--
-- Adds three tables to support the "preferred vendor network" and
-- "real wedding stories" features.
--
-- vendor_relationships: graph of vendor pairings sourced from vendor
--   self-reporting and real wedding data. Powers recommendations like
--   "vendors who often work with [Venue Name]" on profile pages.
--
-- wedding_stories + wedding_story_vendors: catalog of real weddings
--   (sourced from Instagram posts where photographers tag all vendors).
--   Serves as both the data source for relationship scoring and a
--   "real weddings" content/SEO gallery for couples.

-- ── vendors: add instagram_handle ──────────────────────────────────────────

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(100);

-- ── vendor_relationships ───────────────────────────────────────────────────
-- Directional edge in the vendor graph. vendor_id "knows" related_vendor_id.
-- Edges are sourced from vendor submissions or manual Instagram cataloging.
-- relationship_type: 'preferred_partner' | 'worked_with'
-- source:            'vendor_submitted' | 'instagram_tag' | 'manual'

CREATE TABLE IF NOT EXISTS vendor_relationships (
  id                SERIAL PRIMARY KEY,
  vendor_id         INTEGER NOT NULL REFERENCES vendors(id),
  related_vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  relationship_type VARCHAR(50) NOT NULL,
  source            VARCHAR(50) NOT NULL,
  source_post_url   VARCHAR(500),
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),

  CONSTRAINT no_self_relationship CHECK (vendor_id != related_vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_relationships_vendor_id
  ON vendor_relationships(vendor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_relationships_related_vendor_id
  ON vendor_relationships(related_vendor_id);

-- ── wedding_stories ────────────────────────────────────────────────────────
-- One row per real wedding. Sourced primarily from Instagram posts where
-- photographers caption the full vendor lineup. Also drives the "Real
-- Weddings" gallery (SEO + couple inspiration).

CREATE TABLE IF NOT EXISTS wedding_stories (
  id                SERIAL PRIMARY KEY,
  title             VARCHAR(255) NOT NULL,
  instagram_post_url VARCHAR(500),
  description       TEXT,
  wedding_date      DATE,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- ── wedding_story_vendors ──────────────────────────────────────────────────
-- Junction table linking a wedding story to each vendor who participated.
-- A vendor can appear once per role per story (unique constraint).
-- role: 'venue' | 'photographer' | 'florist' | 'caterer' | 'dj_music' |
--       'hair_makeup' | 'coordinator' | 'dress'
-- Cascades on story delete so orphaned rows don't accumulate.

CREATE TABLE IF NOT EXISTS wedding_story_vendors (
  id               SERIAL PRIMARY KEY,
  wedding_story_id INTEGER NOT NULL REFERENCES wedding_stories(id) ON DELETE CASCADE,
  vendor_id        INTEGER NOT NULL REFERENCES vendors(id),
  role             VARCHAR(50) NOT NULL,

  CONSTRAINT unique_story_vendor_role UNIQUE (wedding_story_id, vendor_id, role)
);
