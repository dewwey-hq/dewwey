/**
 * Persist hybrid venue enrichment to RDS (Phase 1).
 *
 * Writes venue_extraction_runs (history) + upserts venue_enrichment (serving).
 * See docs/ai-native-data-plane.md.
 */

const SCHEMA_VERSION = 1;

function provValue(field) {
  if (field == null) return null;
  if (typeof field === "object" && "value" in field) return field.value ?? null;
  return field;
}

function uniqAssetsByUrl(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const url = item?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(item);
  }
  return out;
}

/**
 * Merge rules baseline + optional LLM extraction into the serving `facts` document.
 */
function buildServingFacts(rules, llmExtraction = null) {
  const llm = llmExtraction || null;

  const capacityMax =
    provValue(llm?.capacity_max) ?? rules?.pricing?.capacity_max ?? null;
  const capacityMin = provValue(llm?.capacity_min) ?? rules?.pricing?.capacity_min ?? null;
  const capacityAsStated =
    provValue(llm?.capacity_as_stated) ?? rules?.pricing?.capacity_context ?? null;

  const catering =
    provValue(llm?.policies?.catering) ??
    (rules?.policies?.outside_catering_prohibited
      ? "exclusive_in_house"
      : rules?.policies?.outside_catering_allowed
        ? "open"
        : null);

  const eventInsurance = provValue(llm?.policies?.event_insurance) ?? null;
  const pricingModel = provValue(llm?.pricing_model) ?? null;
  const priceDisplay =
    provValue(llm?.price_display) ?? rules?.pricing?.display ?? null;

  const rulesAssets = Array.isArray(rules?.assets) ? rules.assets : [];
  const discovered = Array.isArray(llm?.discovered_assets) ? llm.discovered_assets : [];
  const assets = uniqAssetsByUrl([
    ...rulesAssets.map((a) => ({
      url: a.url,
      kind: a.type || "other",
      label: a.title || null,
      source_url: a.source_url || null,
      origin: "rules",
    })),
    ...discovered.map((a) => ({
      url: a.url,
      kind: a.kind || "other",
      label: a.label || null,
      source_url: a.source_url || null,
      origin: "llm",
    })),
  ]);

  const about = llm?.about
    ? llm.about
    : rules?.about
      ? {
          value: rules.about.quote_short || rules.about.quote || null,
          quote: rules.about.quote || null,
          source_url: rules.about.source_url || null,
        }
      : null;

  const confidence = typeof llm?.confidence === "number" ? llm.confidence : null;
  const crawlFailed = !rules || rules.status === "failed" || (rules.pages_crawled || []).length === 0;
  const needsReview =
    crawlFailed ||
    capacityMax == null ||
    (confidence != null && confidence < 0.45) ||
    Boolean(llm?.notes && /conflict|unclear|uncertain/i.test(llm.notes));

  const status = crawlFailed
    ? "failed"
    : needsReview || capacityMax == null
      ? "partial"
      : rules?.status === "success"
        ? "success"
        : "partial";

  const facts = {
    about,
    capacity_max: capacityMax,
    capacity_min: capacityMin,
    capacity_as_stated: capacityAsStated,
    capacity_configurations: Array.isArray(llm?.capacity_configurations)
      ? llm.capacity_configurations
      : [],
    capacity_provenance: llm?.capacity_max || null,
    price_display: priceDisplay,
    pricing_model: pricingModel,
    pricing_as_stated: provValue(llm?.pricing_as_stated),
    pricing_provenance: llm?.price_display || null,
    amenities: Array.isArray(llm?.amenities)
      ? llm.amenities
      : Object.keys(rules?.amenities || {}).map((name) => ({
          name,
          quote: null,
          source_url: null,
          origin: "rules",
        })),
    included_inventory: Array.isArray(llm?.included_inventory)
      ? llm.included_inventory
      : rules?.included_inventory || [],
    policies: {
      catering,
      byo_alcohol: provValue(llm?.policies?.byo_alcohol),
      alcohol_provided: provValue(llm?.policies?.alcohol_provided),
      event_insurance: eventInsurance,
      curfew: provValue(llm?.policies?.curfew),
      provenance: llm?.policies || null,
      rules_flags: rules?.policies || {},
    },
    contact: rules?.contact || null,
    social: rules?.social || null,
    network_vendors: rules?.network_vendors || [],
    faqs: rules?.faqs || [],
    assets,
    llm_notes: llm?.notes ?? null,
    llm_confidence: confidence,
    pages_crawled: rules?.pages_crawled || [],
    sources: rules?.sources || [],
  };

  return {
    facts,
    status,
    needs_review: needsReview,
    capacity_max: capacityMax,
    capacity_min: capacityMin,
    capacity_as_stated: capacityAsStated,
    catering,
    event_insurance: eventInsurance,
    pricing_model: pricingModel,
    price_display: priceDisplay,
  };
}

async function insertExtractionRun(client, {
  vendorId,
  method,
  status,
  payload,
  meta,
  crawledAt,
  extractedAt,
}) {
  const { rows } = await client.query(
    `INSERT INTO venue_extraction_runs
       (vendor_id, method, schema_version, status, payload, meta, crawled_at, extracted_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
     RETURNING id`,
    [
      vendorId,
      method,
      SCHEMA_VERSION,
      status || "success",
      JSON.stringify(payload ?? {}),
      meta ? JSON.stringify(meta) : null,
      crawledAt || null,
      extractedAt || new Date().toISOString(),
    ],
  );
  return rows[0].id;
}

/**
 * Upsert serving enrichment + append extraction run rows.
 * @returns {{ enrichment: object, rulesRunId: number|null, llmRunId: number|null }}
 */
async function persistVenueEnrichment(pool, {
  vendorId,
  website,
  rules,
  llm = null,
}) {
  if (!vendorId) throw new Error("vendorId is required to persist enrichment");

  const crawledAt = rules?.crawled_at || llm?.meta?.extracted_at || null;
  const serving = buildServingFacts(rules, llm?.extraction || null);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let rulesRunId = null;
    if (rules) {
      rulesRunId = await insertExtractionRun(client, {
        vendorId,
        method: rules.extraction_method || "rules_v1",
        status: rules.status || "partial",
        payload: rules,
        meta: {
          pages: (rules.pages_crawled || []).length,
          network_vendors: (rules.network_vendors || []).length,
          faqs: (rules.faqs || []).length,
        },
        crawledAt,
        extractedAt: rules.enriched_at || new Date().toISOString(),
      });
    }

    let llmRunId = null;
    if (llm?.extraction) {
      const method = `${llm.meta?.provider || "llm"}:${llm.meta?.model || "unknown"}`;
      llmRunId = await insertExtractionRun(client, {
        vendorId,
        method,
        status: "success",
        payload: llm.extraction,
        meta: llm.meta || null,
        crawledAt,
        extractedAt: llm.meta?.extracted_at || new Date().toISOString(),
      });
    }

    const { rows } = await client.query(
      `INSERT INTO venue_enrichment (
         vendor_id, website, status, needs_review, schema_version,
         capacity_max, capacity_min, capacity_as_stated,
         catering, event_insurance, pricing_model, price_display,
         facts, latest_rules_run_id, latest_llm_run_id,
         crawled_at, extracted_at, enriched_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11, $12,
         $13::jsonb, $14, $15,
         $16, $17, NOW(), NOW()
       )
       ON CONFLICT (vendor_id) DO UPDATE SET
         website = EXCLUDED.website,
         status = EXCLUDED.status,
         needs_review = EXCLUDED.needs_review,
         schema_version = EXCLUDED.schema_version,
         capacity_max = EXCLUDED.capacity_max,
         capacity_min = EXCLUDED.capacity_min,
         capacity_as_stated = EXCLUDED.capacity_as_stated,
         catering = EXCLUDED.catering,
         event_insurance = EXCLUDED.event_insurance,
         pricing_model = EXCLUDED.pricing_model,
         price_display = EXCLUDED.price_display,
         facts = EXCLUDED.facts,
         latest_rules_run_id = COALESCE(EXCLUDED.latest_rules_run_id, venue_enrichment.latest_rules_run_id),
         latest_llm_run_id = COALESCE(EXCLUDED.latest_llm_run_id, venue_enrichment.latest_llm_run_id),
         crawled_at = COALESCE(EXCLUDED.crawled_at, venue_enrichment.crawled_at),
         extracted_at = EXCLUDED.extracted_at,
         enriched_at = NOW(),
         updated_at = NOW()
       RETURNING vendor_id, status, needs_review, capacity_max, catering, pricing_model`,
      [
        vendorId,
        website || rules?.input?.website || null,
        serving.status,
        serving.needs_review,
        SCHEMA_VERSION,
        serving.capacity_max,
        serving.capacity_min,
        serving.capacity_as_stated,
        serving.catering,
        serving.event_insurance,
        serving.pricing_model,
        serving.price_display,
        JSON.stringify(serving.facts),
        rulesRunId,
        llmRunId,
        crawledAt,
        new Date().toISOString(),
      ],
    );

    await client.query("COMMIT");
    return { enrichment: rows[0], rulesRunId, llmRunId, facts: serving.facts };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  SCHEMA_VERSION,
  buildServingFacts,
  persistVenueEnrichment,
};
