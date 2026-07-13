-- Migration 006: Venue website enrichment (AI-native serving + run history)
--
-- venue_extraction_runs: versioned rules/LLM outputs (never silent overwrite).
-- venue_enrichment: one current serving row per vendor — indexed scalars for
--   filters + JSONB facts with provenance for UI / future agents.
--
-- HTML page cache stays local/object-store (not mirrored in RDS) for now.
-- See docs/ai-native-data-plane.md and docs/vendor-aggregation-strategy.md.

-- ── venue_extraction_runs ──────────────────────────────────────────────────
-- method examples: 'rules_v1' | 'vertex:gemini-3.5-flash' | 'gemini:gemini-3.5-flash'
-- status: 'success' | 'partial' | 'failed'
-- payload: full extraction JSON (rules shape or LLM extraction shape)
-- meta: { cost_usd, latency_ms, page_count, input_chars, usage, provider, model, … }

CREATE TABLE IF NOT EXISTS venue_extraction_runs (
  id              SERIAL PRIMARY KEY,
  vendor_id       INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  method          VARCHAR(80) NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  status          VARCHAR(32) NOT NULL DEFAULT 'success',
  payload         JSONB NOT NULL,
  meta            JSONB,
  crawled_at      TIMESTAMPTZ,
  extracted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venue_extraction_runs_vendor_id
  ON venue_extraction_runs(vendor_id);

CREATE INDEX IF NOT EXISTS idx_venue_extraction_runs_method
  ON venue_extraction_runs(method);

CREATE INDEX IF NOT EXISTS idx_venue_extraction_runs_extracted_at
  ON venue_extraction_runs(extracted_at DESC);

-- ── venue_enrichment (serving) ─────────────────────────────────────────────
-- One row per vendor. Upsert on re-enrich; history lives in extraction_runs.
-- catering: 'open' | 'preferred_list_required' | 'exclusive_in_house' | 'unknown'
-- event_insurance: 'required' | 'not_required' | 'venue_covers' | 'unknown'
-- pricing_model: 'flat' | 'per_head' | 'package' | 'inquire_only' | 'mixed' | 'unknown'
-- status: 'success' | 'partial' | 'failed'

CREATE TABLE IF NOT EXISTS venue_enrichment (
  vendor_id                  INTEGER PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  website                    TEXT,
  status                     VARCHAR(32) NOT NULL DEFAULT 'partial',
  needs_review               BOOLEAN NOT NULL DEFAULT FALSE,
  schema_version             INTEGER NOT NULL DEFAULT 1,

  -- Indexed / filter-friendly scalars
  capacity_max               INTEGER,
  capacity_min               INTEGER,
  capacity_as_stated         TEXT,
  catering                   VARCHAR(64),
  event_insurance            VARCHAR(64),
  pricing_model              VARCHAR(64),
  price_display              TEXT,

  -- Full merged serving document (provenance nested inside)
  facts                      JSONB NOT NULL DEFAULT '{}'::jsonb,

  latest_rules_run_id        INTEGER REFERENCES venue_extraction_runs(id) ON DELETE SET NULL,
  latest_llm_run_id          INTEGER REFERENCES venue_extraction_runs(id) ON DELETE SET NULL,

  crawled_at                 TIMESTAMPTZ,
  extracted_at               TIMESTAMPTZ,
  enriched_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venue_enrichment_capacity_max
  ON venue_enrichment(capacity_max);

CREATE INDEX IF NOT EXISTS idx_venue_enrichment_needs_review
  ON venue_enrichment(needs_review)
  WHERE needs_review = TRUE;

CREATE INDEX IF NOT EXISTS idx_venue_enrichment_catering
  ON venue_enrichment(catering);

CREATE INDEX IF NOT EXISTS idx_venue_enrichment_status
  ON venue_enrichment(status);
