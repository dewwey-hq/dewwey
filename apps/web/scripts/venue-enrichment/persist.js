/**
 * Persist hybrid venue enrichment to RDS (Phase 1).
 *
 * Writes venue_extraction_runs (history) + upserts venue_enrichment (serving).
 * See docs/engineering/venue-enrichment/data-plane.md.
 */

const SCHEMA_VERSION = 2;

const { buildSpacesServing, isAmalgamSpaceName, isNoiseSpaceName } = require("./spaces");

function provValue(field) {
  if (field == null) return null;
  if (typeof field === "object" && "value" in field) return field.value ?? null;
  return field;
}

const CAPACITY_MAX_REVIEW_THRESHOLD = 1000;

/**
 * Prefer seated (or seated+dance / mixed) over cocktail/standing for the indexed max.
 * Never returns cocktail/reception-only LLM max — that poisons guest filters (Palmer 1690).
 */
function preferSeatedCapacityMax(llmExtraction, rulesFallback, configsOverride = null) {
  const configs = Array.isArray(configsOverride)
    ? configsOverride
    : Array.isArray(llmExtraction?.capacity_configurations)
      ? llmExtraction.capacity_configurations
      : [];

  const seatedish = configs.filter((c) => {
    if (isAmalgamSpaceName(c?.space) || isNoiseSpaceName(c?.space)) return false;
    const style = String(c?.style || "").toLowerCase();
    const guests = Number(c?.guests);
    if (!Number.isFinite(guests) || guests <= 0) return false;
    if (
      style === "cocktail" ||
      style === "standing" ||
      style === "reception" ||
      style === "ceremony"
    ) {
      return false;
    }
    if (
      /\b(reception|cocktail|standing|ceremony)\b/i.test(String(c?.quote || "")) &&
      !/\bseated\b/i.test(String(c?.quote || ""))
    ) {
      return false;
    }
    return (
      style === "seated" ||
      style === "seated_with_dance" ||
      style === "banquet" ||
      style === "mixed" ||
      style === "theater" ||
      (/seat|dinner|plated|banquet|with\s+dance|without\s+dance/i.test(String(c?.quote || "")) &&
        !/cocktail|standing|reception/i.test(String(c?.quote || "")))
    );
  });

  if (seatedish.length) {
    return Math.max(...seatedish.map((c) => Number(c.guests)));
  }

  // LLM capacity_max only if as_stated clearly gives a seated figure lower than cocktail prose.
  const llmMax = provValue(llmExtraction?.capacity_max);
  if (llmMax != null) {
    const asStated = String(provValue(llmExtraction?.capacity_as_stated) || "");
    const seatedMatch = asStated.match(/seated[^0-9]{0,40}(\d{2,4})/i);
    if (seatedMatch) {
      const seatedN = parseInt(seatedMatch[1], 10);
      if (Number.isFinite(seatedN) && seatedN > 0) return seatedN;
    }
  }

  const rulesN = Number(rulesFallback);
  if (Number.isFinite(rulesN) && rulesN > 0 && rulesN < CAPACITY_MAX_REVIEW_THRESHOLD) {
    // Rules scalar only when modest — avoid promoting combined-hotel prose.
    return rulesN;
  }

  return null;
}

/**
 * Card capacity: largest seated / with-dance on non-amalgam rooms only.
 * Do not fall back to cocktail/reception — null + needs_review is safer for filters.
 */
function capacityMaxFromSpaces(spaces, fallback = null) {
  if (!Array.isArray(spaces) || spaces.length === 0) return fallback ?? null;
  const bookable = spaces.filter(
    (s) => !isAmalgamSpaceName(s?.name) && !isNoiseSpaceName(s?.name),
  );
  const seated = bookable
    .map((s) => Number(s?.capacity?.seated_max))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (seated.length) return Math.max(...seated);
  const withDance = bookable
    .map((s) => Number(s?.capacity?.seated_with_dance))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (withDance.length) return Math.max(...withDance);
  return fallback ?? null;
}

function capacityNeedsReview(capacityMax, spaces) {
  if (capacityMax == null) return true;
  if (capacityMax >= CAPACITY_MAX_REVIEW_THRESHOLD) return true;
  const bookable = (spaces || []).filter(
    (s) => !isAmalgamSpaceName(s?.name) && !isNoiseSpaceName(s?.name),
  );
  const hasSeated = bookable.some((s) => {
    const a = Number(s?.capacity?.seated_max);
    const b = Number(s?.capacity?.seated_with_dance);
    return (Number.isFinite(a) && a > 0) || (Number.isFinite(b) && b > 0);
  });
  const hasCocktailOnly =
    !hasSeated &&
    bookable.some((s) => {
      const c = Number(s?.capacity?.cocktail_max);
      return Number.isFinite(c) && c > 0;
    });
  if (hasCocktailOnly) return true;
  return false;
}

function mergeCapacityConfigurations(rulesConfigs = [], llmConfigs = []) {
  const out = [];
  const seen = new Set();
  const rulesSpaceKeys = new Set(
    (rulesConfigs || [])
      .map((r) => String(r?.space || "").toLowerCase().trim())
      .filter(Boolean),
  );

  function push(row, origin) {
    if (!row || row.guests == null) return;
    const guests = Number(row.guests);
    if (!Number.isFinite(guests) || guests <= 0) return;
    const key = `${String(row.space || "").toLowerCase()}|${String(row.style || "").toLowerCase()}|${guests}|${row.guests_min ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      space: row.space ?? null,
      setting: row.setting ?? null,
      style: row.style ?? null,
      guests,
      guests_min: row.guests_min != null ? Number(row.guests_min) : null,
      quote: row.quote ?? null,
      source_url: row.source_url ?? null,
      origin: row.origin || origin,
    });
  }

  for (const row of rulesConfigs || []) push(row, "rules");
  // When rules already labeled a space (Drake/Adler tables), ignore LLM rows for
  // that space — models often swap neighboring hall capacities.
  for (const row of llmConfigs || []) {
    const sk = String(row?.space || "").toLowerCase().trim();
    if (sk && rulesSpaceKeys.has(sk)) continue;
    push(row, "llm");
  }
  return out;
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
 * Reject hotel ADR / guest-room rates that pollute wedding price_display
 * (e.g. Drake "From $163"). Keep event fees, packages, and per-person F&B.
 */
function sanitizeEventPriceDisplay(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  if (!s) return null;

  if (/\/\s*night|per\s*night|nightly|room\s*rates?|\badr\b|guest\s*room/i.test(s)) {
    return null;
  }

  // Bare "From $163" / "Starting at $189" with a low dollar amount → lodging ADR.
  // Wedding venue fees are almost always $800+ (or explicitly /person|package|guest).
  if (
    /(?:from|starting(?:\s+at)?)\s*\$\s*[\d,]+/i.test(s) &&
    !/(?:\/\s*person|per\s*(?:person|guest|head)|pp\b|package|venue\s*fee|rental|event)/i.test(s)
  ) {
    const amounts = [...s.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)].map((m) =>
      parseFloat(m[1].replace(/,/g, "")),
    );
    const maxAmt = amounts.length ? Math.max(...amounts) : NaN;
    if (Number.isFinite(maxAmt) && maxAmt > 0 && maxAmt < 800) return null;
  }

  return s;
}

/**
 * Merge rules baseline + optional LLM extraction into the serving `facts` document.
 */
function buildServingFacts(rules, llmExtraction = null) {
  const llm = llmExtraction || null;

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
  const priceDisplay = sanitizeEventPriceDisplay(
    provValue(llm?.price_display) ?? rules?.pricing?.display ?? null,
  );

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

  const capacityConfigurations = mergeCapacityConfigurations(
    rules?.pricing?.capacity_configurations || [],
    Array.isArray(llm?.capacity_configurations) ? llm.capacity_configurations : [],
  );

  const { spaces, fee_schedule } = buildSpacesServing({
    capacityConfigurations,
    llmSpaces: Array.isArray(llm?.spaces) ? llm.spaces : [],
    feeSchedule: Array.isArray(llm?.fee_schedule) ? llm.fee_schedule : [],
  });

  // Card scalar: seated on real rooms only — never amalgam cocktail totals.
  const capacityMaxRaw = capacityMaxFromSpaces(
    spaces,
    preferSeatedCapacityMax(
      llm,
      rules?.pricing?.capacity_max ?? null,
      capacityConfigurations,
    ),
  );
  const capacityMax =
    capacityMaxRaw != null && capacityMaxRaw >= CAPACITY_MAX_REVIEW_THRESHOLD
      ? null
      : capacityMaxRaw;

  const crawlFailed = !rules || rules.status === "failed" || (rules.pages_crawled || []).length === 0;
  const needsReview =
    crawlFailed ||
    capacityNeedsReview(capacityMax, spaces) ||
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
    capacity_configurations: capacityConfigurations,
    capacity_provenance: llm?.capacity_max || null,
    spaces,
    fee_schedule,
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
  sanitizeEventPriceDisplay,
  capacityMaxFromSpaces,
  capacityNeedsReview,
  preferSeatedCapacityMax,
  CAPACITY_MAX_REVIEW_THRESHOLD,
};
