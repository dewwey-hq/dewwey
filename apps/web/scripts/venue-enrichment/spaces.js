/**
 * Multi-space venue rollup for venue_enrichment.facts.
 *
 * Spaces are bookable rooms under one vendor (Pavilion vs Pergola).
 * capacity_configurations remain the provenance-rich rows; spaces[] is the
 * serving/UI shape. fee_schedule captures day/season × space pricing.
 *
 * Capacity buckets (serving):
 *   ceremony_max       ← ceremony
 *   seated_with_dance  ← seated *with* dance floor
 *   seated_max         ← banquet / seated without dance (max)
 *   seated_min         ← banquet range low end when stated (e.g. 100–500)
 *   cocktail_max       ← reception / cocktail / standing
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

function minNum(...vals) {
  const nums = vals.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.min(...nums) : null;
}

/** Positive guest counts only — treat 0 / empty as null. */
function posCapacity(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanAsStated(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
}

/**
 * Map a config row to a serving capacity bucket.
 * Order matters: "without dance" must win over bare /dance/.
 */
function capacityBucket(style, quote) {
  const s = String(style || "").toLowerCase().trim();
  const q = String(quote || "");

  if (s === "ceremony" || /\bceremony\b/i.test(q)) return "ceremony";

  if (
    s === "seated_with_dance" ||
    (/\bwith\s+dance(\s+floor)?\b/i.test(q) && !/\bwithout\s+dance\b/i.test(q))
  ) {
    return "seated_with_dance";
  }

  if (/\bwithout\s+dance\b/i.test(q)) return "seated";

  if (
    s === "cocktail" ||
    s === "standing" ||
    s === "reception" ||
    /\b(reception|cocktail|standing)\b/i.test(q)
  ) {
    return "cocktail";
  }

  if (
    s === "seated" ||
    s === "theater" ||
    s === "banquet" ||
    s === "mixed" ||
    /\b(seated|banquet|dinner|plated|theatre|theater)\b/i.test(q)
  ) {
    return "seated";
  }

  return "unknown";
}

function emptyCapacity() {
  return {
    seated_min: null,
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

function applyGuestsToCapacity(capacity, bucket, guests, guestsMin) {
  if (bucket === "ceremony") {
    capacity.ceremony_max = maxNum(capacity.ceremony_max, guests);
  } else if (bucket === "seated_with_dance") {
    capacity.seated_with_dance = maxNum(capacity.seated_with_dance, guests);
  } else if (bucket === "seated") {
    capacity.seated_max = maxNum(capacity.seated_max, guests);
    if (guestsMin != null) {
      capacity.seated_min = minNum(capacity.seated_min, guestsMin);
    }
  } else if (bucket === "cocktail") {
    capacity.cocktail_max = maxNum(capacity.cocktail_max, guests);
  } else {
    // Unknown single figure (hotel prose "up to N guests") → cocktail until labeled.
    capacity.cocktail_max = maxNum(capacity.cocktail_max, guests);
  }
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

    const guestsMin = posCapacity(row.guests_min);
    const bucket = capacityBucket(row.style, row.quote || "");
    applyGuestsToCapacity(space.capacity, bucket, guests, guestsMin);

    if (row.setting && row.setting !== "unknown") {
      space.setting = space.setting || row.setting;
    }
    if (row.source_url && !space.source_url) space.source_url = row.source_url;

    // Append labeled as_stated snippets
    const quote = cleanAsStated(row.quote);
    if (quote) {
      const prev = space.capacity.as_stated || "";
      if (!prev.includes(quote)) {
        space.capacity.as_stated = prev ? `${prev}; ${quote}` : quote;
      }
    }

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
  const sq = Number(raw.sq_ft);
  base.sq_ft = Number.isFinite(sq) && sq > 0 ? sq : null;
  base.capacity = {
    seated_min: posCapacity(cap.seated_min),
    seated_max: posCapacity(cap.seated_max),
    seated_with_dance: posCapacity(cap.seated_with_dance),
    cocktail_max: posCapacity(cap.cocktail_max),
    ceremony_max: posCapacity(cap.ceremony_max),
    as_stated: cleanAsStated(cap.as_stated),
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
    seated_min: minNum(a?.seated_min, b?.seated_min),
    seated_max: maxNum(a?.seated_max, b?.seated_max),
    seated_with_dance: maxNum(a?.seated_with_dance, b?.seated_with_dance),
    cocktail_max: maxNum(a?.cocktail_max, b?.cocktail_max),
    ceremony_max: maxNum(a?.ceremony_max, b?.ceremony_max),
    as_stated: cleanAsStated(b?.as_stated) || cleanAsStated(a?.as_stated) || null,
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

/** Package products / private dining — not wedding ballrooms. */
function isNoiseSpaceName(name) {
  return /petite\s+weddings?|wedding\s+package|chef'?s\s+table|cellar\s+table|restaurant\s+buyout|private\s+dining/i.test(
    String(name || ""),
  );
}

/**
 * Combined / multi-room marketing totals (Palmer "Grand & State Combined") —
 * useful context but must not drive capacity_max filters.
 */
function isAmalgamSpaceName(name) {
  return /\bcombined\b|entire\s+venue|whole\s+venue|all\s+(?:\d+\s+)?ballrooms?|three\s+ballrooms?|both\s+ballrooms?|adjoining\s+ballrooms?|&\s*(?:the\s+)?state\b/i.test(
    String(name || ""),
  );
}

function isDiningOrMeetingsUrl(url) {
  return /\/dine\/|private-dining|\/restaurants?\/|\/meetings?\//i.test(String(url || ""));
}

function isWeddingishUrl(url) {
  return /wedding|events-and-spaces|event-spaces|venue-rental|private-events|floor-?plan|banquet|ballroom/i.test(
    String(url || ""),
  );
}

/**
 * When wedding-sourced rooms exist, drop private-dining / package-product noise.
 */
function filterWeddingSpaces(spaces) {
  if (!Array.isArray(spaces) || spaces.length <= 1) return spaces || [];

  const cleaned = spaces.filter((s) => !isNoiseSpaceName(s.name));
  const weddingish = cleaned.filter(
    (s) => isWeddingishUrl(s.source_url) && !isDiningOrMeetingsUrl(s.source_url),
  );

  if (weddingish.length >= 1) {
    return cleaned.filter((s) => !isDiningOrMeetingsUrl(s.source_url));
  }
  return cleaned;
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

  let spaces = filterWeddingSpaces([...byKey.values()]);
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
  const existingVenueFees = (f.fee_schedule || []).filter((fee) => !spaceKey(fee?.space));
  f.fee_schedule = [
    ...fee_schedule,
    ...existingVenueFees.filter(
      (a) =>
        !fee_schedule.some(
          (b) => b.amount === a.amount && b.day === a.day && b.space === a.space,
        ),
    ),
  ];
  return f;
}

module.exports = {
  spacesFromConfigurations,
  buildSpacesServing,
  backfillSpacesIntoFacts,
  normalizeFee,
  normalizeLlmSpace,
  capacityBucket,
  filterWeddingSpaces,
  isAmalgamSpaceName,
  isNoiseSpaceName,
};
