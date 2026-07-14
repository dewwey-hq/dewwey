/** JSON schema for OpenAI structured output — every extracted field carries quote + source. */

function provenanceString(description) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      value: { type: ["string", "null"], description },
      quote: {
        type: ["string", "null"],
        description: "Verbatim snippet from the page supporting this value, or null if not stated.",
      },
      source_url: {
        type: ["string", "null"],
        description: "URL from a --- PAGE: --- block where the quote appears, or null.",
      },
    },
    required: ["value", "quote", "source_url"],
  };
}

function provenanceNumber(description) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      value: { type: ["number", "null"], description },
      quote: { type: ["string", "null"] },
      source_url: { type: ["string", "null"] },
    },
    required: ["value", "quote", "source_url"],
  };
}

function provenanceBoolean(description) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      value: { type: ["boolean", "null"], description },
      quote: { type: ["string", "null"] },
      source_url: { type: ["string", "null"] },
    },
    required: ["value", "quote", "source_url"],
  };
}

const LLM_EXTRACTION_SCHEMA = {
  name: "venue_wedding_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      about: provenanceString("1–3 sentence venue description for wedding couples."),
      capacity_max: provenanceNumber(
        "Primary wedding guest capacity number as the venue states it. Prefer wedding ceremony/reception figures over gala/corporate. Null if not stated.",
      ),
      capacity_min: provenanceNumber("Minimum guest count if stated, else null."),
      capacity_as_stated: provenanceString(
        "Verbatim capacity wording from the site (e.g. '200 seated, 514 standing' or 'Wedding — 300 guests'). Capture as stated; do not normalize. Null if not stated.",
      ),
      capacity_configurations: {
        type: "array",
        description:
          "Structured capacity rows when the site lists multiple spaces or styles (seated vs standing, indoor vs outdoor). Empty array if only a single undifferentiated number.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            space: {
              type: ["string", "null"],
              description: "Room/space name if stated (e.g. Grand Ballroom, Courtyard).",
            },
            setting: {
              type: ["string", "null"],
              description: "indoor | outdoor | either | unknown",
            },
            style: {
              type: ["string", "null"],
              description:
                "seated | standing | cocktail | theater | ceremony | mixed | unknown",
            },
            guests: { type: "number", description: "Guest count for this row." },
            quote: { type: ["string", "null"] },
            source_url: { type: ["string", "null"] },
          },
          required: ["space", "setting", "style", "guests", "quote", "source_url"],
        },
      },
      price_display: provenanceString(
        "Pricing as shown on site (e.g. 'from $5,000', 'packages start at $85/person'). Null if inquire-only or not stated.",
      ),
      pricing_model: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: {
            type: ["string", "null"],
            description:
              "One of: flat, per_head, package, inquire_only, mixed, unknown. Null if not stated. Use mixed when peak/off-peak or weekday/weekend amounts differ.",
          },
          quote: { type: ["string", "null"] },
          source_url: { type: ["string", "null"] },
        },
        required: ["value", "quote", "source_url"],
      },
      pricing_as_stated: provenanceString(
        "Verbatim pricing nuances (peak/off-peak, Fri/Sat/Sun, package names). Null if inquire-only or not stated.",
      ),
      discovered_assets: {
        type: "array",
        description:
          "Wedding-relevant download/asset URLs from ASSET CANDIDATES or clear page links (PDFs, floor plans, brochures, vendor lists). Prefer entries from ASSET CANDIDATES. Do not invent URLs. Cap at 15. Empty if none.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            url: { type: "string" },
            kind: {
              type: "string",
              description:
                "brochure_pdf | package_pdf | vendor_list_pdf | floor_plan | pdf | other",
            },
            label: { type: ["string", "null"] },
            source_url: {
              type: "string",
              description: "Page URL where this link appeared.",
            },
          },
          required: ["url", "kind", "label", "source_url"],
        },
      },
      amenities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            quote: { type: ["string", "null"] },
            source_url: { type: ["string", "null"] },
          },
          required: ["name", "quote", "source_url"],
        },
      },
      included_inventory: {
        type: "array",
        description:
          "Items included with the venue rental (tables, chairs, bars, drape, AV, etc.) with counts when stated.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item: { type: "string" },
            quote: { type: ["string", "null"] },
            source_url: { type: ["string", "null"] },
          },
          required: ["item", "quote", "source_url"],
        },
      },
      policies: {
        type: "object",
        additionalProperties: false,
        properties: {
          catering: {
            type: "object",
            additionalProperties: false,
            properties: {
              value: {
                type: ["string", "null"],
                description:
                  "open | preferred_list_required | exclusive_in_house | unknown. preferred_list_required = must use preferred/approved caterers.",
              },
              quote: { type: ["string", "null"] },
              source_url: { type: ["string", "null"] },
            },
            required: ["value", "quote", "source_url"],
          },
          byo_alcohol: provenanceBoolean("True if BYOB allowed."),
          alcohol_provided: provenanceBoolean("True if venue provides bar service."),
          event_insurance: {
            type: "object",
            additionalProperties: false,
            properties: {
              value: {
                type: ["string", "null"],
                description:
                  "required | not_required | venue_covers | unknown. required = clients/vendors must provide event/liability insurance.",
              },
              quote: { type: ["string", "null"] },
              source_url: { type: ["string", "null"] },
            },
            required: ["value", "quote", "source_url"],
          },
          curfew: provenanceString("Music/event end time policy if stated."),
        },
        required: ["catering", "byo_alcohol", "alcohol_provided", "event_insurance", "curfew"],
      },
      confidence: {
        type: "number",
        description: "0–1 self-rated confidence for this extraction overall.",
      },
      notes: {
        type: ["string", "null"],
        description: "Optional caveats (e.g. pricing not public, conflicting pages).",
      },
    },
    required: [
      "about",
      "capacity_max",
      "capacity_min",
      "capacity_as_stated",
      "capacity_configurations",
      "price_display",
      "pricing_model",
      "pricing_as_stated",
      "discovered_assets",
      "amenities",
      "included_inventory",
      "policies",
      "confidence",
      "notes",
    ],
  },
};

const SYSTEM_PROMPT = `You extract wedding-planning facts from venue website text for a wedding app.

Rules:
- Use ONLY the provided document. Each section starts with --- PAGE: <url> ---.
- If a field is not clearly stated, set value to null and quote/source_url to null. Do NOT guess or invent.
- Capacity (keep broad — do not over-normalize):
  - Prefer WEDDING ceremony/reception capacity over gala/corporate-only numbers when both exist.
  - capacity_max: one primary guest number for wedding reception filters/cards. Prefer the largest *seated* (or seated+dance) figure across spaces — NOT cocktail/standing standing-room max. Example: Pavilion seated 450 + cocktail 900 → capacity_max=450; keep cocktail in capacity_configurations and capacity_as_stated. Only use cocktail/standing as capacity_max if the venue markets no seated figure.
  - capacity_as_stated: copy their capacity wording broadly (seated/standing/cocktail/floor-plan lines are fine in one string).
  - capacity_configurations: when the site lists multiple spaces or styles, emit one row per distinct (space × style) with guests, setting (indoor/outdoor/either/unknown), and style (seated/standing/cocktail/theater/ceremony/mixed/unknown). Empty array if only a single undifferentiated number. Do not invent rows.
  - Ignore contact-form guest-count dropdowns (e.g. "0-49 … 1000+") as capacity — those are form options, not venue capacity.
- Pricing:
  - price_display: short card-friendly string (e.g. "Fri $6k / Sat $7k" or "from $12,000").
  - pricing_as_stated: richer verbatim peak/off-peak / weekday nuances when present.
  - pricing_model: flat | per_head | package | inquire_only | mixed | unknown (mixed when amounts differ by day/season).
- discovered_assets:
  - List wedding-relevant PDFs/floor plans/brochures/vendor-list links from ASSET CANDIDATES blocks (preferred) or clearly stated URLs in text.
  - Do NOT invent URLs. Cap at 15. Empty array if none. This is URL discovery only — you are not reading PDF contents.
- Amenities: be thorough. Include space features from Features/Amenities pages (sq ft, ceilings, parking, restrooms, bridal/VIP suites, coat check, exclusive use, outdoor areas, AV, etc.). Prefer 8–20 concrete items when the page lists them — do not stop after a short sample.
- included_inventory: rental inclusions with counts when stated (tables, chairs, bars, lounge furniture, drape, chandeliers, plants, microphones, etc.). Separate from amenities when it is countable inventory.
- Catering policy value must be one of: open, preferred_list_required, exclusive_in_house, unknown (or null if not mentioned).
  - preferred_list_required when couples must use preferred/approved caterers.
  - exclusive_in_house when only venue/in-house catering is allowed.
  - open when any outside caterer is allowed.
- event_insurance: required | not_required | venue_covers | unknown (or null). Use required when clients/vendors must provide liability/event insurance.
- quote must be a short verbatim snippet from the page text that supports the value.
- source_url must match the --- PAGE: --- URL where the quote appears.
- Every non-null scalar value MUST have quote + source_url.
- Boolean policies: true only when explicitly supported; null if not mentioned (not false).`;

module.exports = { LLM_EXTRACTION_SCHEMA, SYSTEM_PROMPT };
