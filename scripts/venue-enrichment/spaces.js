/**
 * Multi-space venue rollup for venue_enrichment.facts.
 *
 * Spaces are bookable rooms under one vendor (Pavilion vs Pergola).
 * capacity_configurations remain the provenance-rich rows; spaces[] is the
 * serving/UI shape. fee_schedule captures day/season × space pricing.
 */

function normSpaceName(name) {
  if (name == null) return null;
  const s = String(name).replace(/\s+/g, " ").trim();
  if (!s || /^unknown$/i.test(s)) return null;
  return s;
}

function spaceKey(name) {
  return normSpaceName(name)?.toLowerCase() || null;
}

function maxNum(...vals) {
  const nums = vals.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

function isSeatedStyle(style, quote) {
  const s = String(style || "").toLowerCase();
  if (s === "seated" || s === "ceremony" || s === "theater") return true;
  if (s === "mixed") return true;
  return /seat|dinner|reception|dance/i.test(String(quote || ""));
}

function isCocktailStyle(style, quote) {
  const s = String(style || "").toLowerCase();
  if (s === "cocktail" || s === "standing") return true;
  return /cocktail|standing|reception-style/i.test(String(quote || ""));
}

function emptyCapacity() {
  return {
    seated_max: null,
    seated_with_dance: null,
    cocktail_max: null,
    ceremony_max: null,
    as_stated: null,
  };
}

function emptySpace(name) {
  return {
    name,
    bookable_separately: null,
    description: null,
    sq_ft: null,
    capacity: emptyCapacity(),
    setting: null,
    amenities: [],
    included_inventory: [],
    fees: [],
    assets: [],
    source_url: null,
  };
}

/**
 * Build spaces[] from capacity_configurations rows (no LLM required).
 */
function spacesFromConfigurations(configs) {
  if (!Array.isArray(configs) || configs.length === 0) return [];

  const byKey = new Map();
  for (const row of configs) {
    const name = normSpaceName(row?.space);
    if (!name) continue;
    const key = spaceKey(name);
    if (!byKey.has(key)) byKey.set(key, emptySpace(name));
    const space = byKey.get(key);
    const guests = Number(row.guests);
    if (!Number.isFinite(guests) || guests <= 0) continue;

    const style = String(row.style || "").toLowerCase();
    const quote = row.quote || "";

    if (style === "ceremony") {
      space.capacity.ceremony_max = maxNum(space.capacity.ceremony_max, guests);
    } else if (style === "mixed" || /dance/i.test(quote)) {
      space.capacity.seated_with_dance = maxNum(space.capacity.seated_with_dance, guests);
      if (isSeatedStyle(style, quote)) {
        space.capacity.seated_max = maxNum(space.capacity.seated_max, guests);
      }
    } else if (isSeatedStyle(style, quote)) {
      space.capacity.seated_max = maxNum(space.capacity.seated_max, guests);
    } else if (isCocktailStyle(style, quote)) {
      space.capacity.cocktail_max = maxNum(space.capacity.cocktail_max, guests);
    }

    if (row.setting && row.setting !== "unknown") {
      space.setting = space.setting || row.setting;
    }
    if (row.source_url && !space.source_url) space.source_url = row.source_url;

    // multiple named spaces ⇒ treat as separately bookable by default
    space.bookable_separately = true;
  }

  const spaces = [...byKey.values()];
  if (spaces.length === 1) {
    spaces[0].bookable_separately = spaces[0].bookable_separately ?? false;
  }
  return spaces;
}

function normalizeFee(raw) {
  if (!raw || typeof raw !== "object") return null;
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return {
    space: normSpaceName(raw.space),
    day: raw.day != null ? String(raw.day).toLowerCase() : null,
    season: raw.season != null ? String(raw.season).toLowerCase() : null,
    amount,
    currency: raw.currency || "USD",
    unit: raw.unit || "venue_fee_usd",
    includes: raw.includes ?? null,
    quote: raw.quote ?? null,
    source_url: raw.source_url ?? null,
  };
}

function normalizeLlmSpace(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = normSpaceName(raw.name);
  if (!name) return null;
  const cap = raw.capacity && typeof raw.capacity === "object" ? raw.capacity : {};
  const base = emptySpace(name);
  base.bookable_separately =
    typeof raw.bookable_separately === "boolean" ? raw.bookable_separately : null;
  base.description = raw.description ?? null;
  base.sq_ft = Number.isFinite(Number(raw.sq_ft)) ? Number(raw.sq_ft) : null;
  base.capacity = {
    seated_max: Number.isFinite(Number(cap.seated_max)) ? Number(cap.seated_max) : null,
    seated_with_dance: Number.isFinite(Number(cap.seated_with_dance))
      ? Number(cap.seated_with_dance)
      : null,
    cocktail_max: Number.isFinite(Number(cap.cocktail_max)) ? Number(cap.cocktail_max) : null,
    ceremony_max: Number.isFinite(Number(cap.ceremony_max)) ? Number(cap.ceremony_max) : null,
    as_stated: cap.as_stated ?? null,
  };
  base.setting = raw.setting ?? null;
  base.amenities = Array.isArray(raw.amenities) ? raw.amenities : [];
  base.included_inventory = Array.isArray(raw.included_inventory) ? raw.included_inventory : [];
  base.fees = Array.isArray(raw.fees)
    ? raw.fees.map(normalizeFee).filter(Boolean)
    : [];
  base.assets = Array.isArray(raw.assets) ? raw.assets : [];
  base.source_url = raw.source_url ?? null;
  return base;
}

function mergeCapacity(a, b) {
  return {
    seated_max: maxNum(a?.seated_max, b?.seated_max),
    seated_with_dance: maxNum(a?.seated_with_dance, b?.seated_with_dance),
    cocktail_max: maxNum(a?.cocktail_max, b?.cocktail_max),
    ceremony_max: maxNum(a?.ceremony_max, b?.ceremony_max),
    as_stated: b?.as_stated || a?.as_stated || null,
  };
}

function mergeSpace(base, overlay) {
  if (!overlay) return base;
  return {
    name: overlay.name || base.name,
    bookable_separately:
      overlay.bookable_separately != null
        ? overlay.bookable_separately
        : base.bookable_separately,
    description: overlay.description || base.description,
    sq_ft: overlay.sq_ft ?? base.sq_ft,
    capacity: mergeCapacity(base.capacity, overlay.capacity),
    setting: overlay.setting || base.setting,
    amenities: overlay.amenities?.length ? overlay.amenities : base.amenities,
    included_inventory: overlay.included_inventory?.length
      ? overlay.included_inventory
      : base.included_inventory,
    fees: overlay.fees?.length ? overlay.fees : base.fees,
    assets: overlay.assets?.length ? overlay.assets : base.assets,
    source_url: overlay.source_url || base.source_url,
  };
}

/**
 * Merge config rollup + LLM spaces + top-level fee_schedule into serving facts.
 */
function buildSpacesServing({
  capacityConfigurations = [],
  llmSpaces = [],
  feeSchedule = [],
} = {}) {
  const fromConfigs = spacesFromConfigurations(capacityConfigurations);
  const byKey = new Map(fromConfigs.map((s) => [spaceKey(s.name), s]));

  for (const raw of llmSpaces || []) {
    const llmSpace = normalizeLlmSpace(raw);
    if (!llmSpace) continue;
    const key = spaceKey(llmSpace.name);
    if (byKey.has(key)) {
      byKey.set(key, mergeSpace(byKey.get(key), llmSpace));
    } else {
      byKey.set(key, llmSpace);
    }
  }

  const fees = (feeSchedule || []).map(normalizeFee).filter(Boolean);
  const venueFees = [];
  for (const fee of fees) {
    const key = spaceKey(fee.space);
    if (key && byKey.has(key)) {
      byKey.get(key).fees.push(fee);
    } else {
      venueFees.push(fee);
    }
  }

  const spaces = [...byKey.values()];
  if (spaces.length > 1) {
    for (const s of spaces) {
      if (s.bookable_separately == null) s.bookable_separately = true;
    }
  }

  return { spaces, fee_schedule: venueFees };
}

/**
 * Rebuild spaces for an existing facts document (backfill without LLM).
 */
function backfillSpacesIntoFacts(facts) {
  const f = facts && typeof facts === "object" ? { ...facts } : {};
  const { spaces, fee_schedule } = buildSpacesServing({
    capacityConfigurations: f.capacity_configurations || [],
    llmSpaces: Array.isArray(f.spaces) ? f.spaces : [],
    feeSchedule: Array.isArray(f.fee_schedule) ? f.fee_schedule : [],
  });
  f.spaces = spaces;
  // Keep any venue-level fees that weren't attached to a space
  const existingVenueFees = (f.fee_schedule || []).filter((fee) => !spaceKey(fee?.space));
  f.fee_schedule = [...fee_schedule, ...existingVenueFees.filter(
    (a) => !fee_schedule.some((b) => b.amount === a.amount && b.day === a.day && b.space === a.space),
  )];
  return f;
}

module.exports = {
  spacesFromConfigurations,
  buildSpacesServing,
  backfillSpacesIntoFacts,
  normalizeFee,
  normalizeLlmSpace,
};
