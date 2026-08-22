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
                "seated | seated_with_dance | banquet | standing | cocktail | reception | theater | ceremony | mixed | unknown. Use seated_with_dance when the site lists a lower seated count with dance floor. Use banquet for Banquet: N. Use ceremony / reception labels when the site uses those words.",
            },
            guests: { type: "number", description: "Guest count for this row (use the high end of a range)." },
            guests_min: {
              type: ["number", "null"],
              description: "Low end when the site states a range (e.g. Banquet 100-500 → guests_min=100, guests=500). Null if a single number.",
            },
            quote: { type: ["string", "null"] },
            source_url: { type: ["string", "null"] },
          },
          required: ["space", "setting", "style", "guests", "guests_min", "quote", "source_url"],
        },
      },
      spaces: {
        type: "array",
        description:
          "WEDDING / event-rental rooms only (ballrooms, halls, plazas marketed for weddings). Do NOT include private dining, restaurant buyouts, meeting rooms, or package products like 'Petite Weddings'. Hotels: only the venues listed under Weddings / Wedding Venues (often 2–4 rooms). Museums: named halls/galleries on venue-rental pages. Empty ONLY if one undifferentiated space. Use null (not 0) for unknown capacity fields.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", description: "Space name as marketed." },
            bookable_separately: {
              type: ["boolean", "null"],
              description: "True if couples can book this space without the others.",
            },
            description: {
              type: ["string", "null"],
              description: "1–3 sentence description of this space for wedding couples.",
            },
            sq_ft: { type: ["number", "null"], description: "Square footage if stated." },
            capacity: {
              type: "object",
              additionalProperties: false,
              properties: {
                seated_min: {
                  type: ["number", "null"],
                  description: "Low end of banquet/seated range when stated (e.g. Banquet 100-500 → 100).",
                },
                seated_max: {
                  type: ["number", "null"],
                  description: "Banquet / seated without dance floor (high end of range).",
                },
                seated_with_dance: {
                  type: ["number", "null"],
                  description: "Seated capacity with dance floor when listed separately.",
                },
                cocktail_max: {
                  type: ["number", "null"],
                  description: "Reception / cocktail / standing capacity.",
                },
                ceremony_max: {
                  type: ["number", "null"],
                  description: "Ceremony capacity when listed separately.",
                },
                as_stated: { type: ["string", "null"] },
              },
              required: [
                "seated_min",
                "seated_max",
                "seated_with_dance",
                "cocktail_max",
                "ceremony_max",
                "as_stated",
              ],
            },
            setting: {
              type: ["string", "null"],
              description: "indoor | outdoor | either | unknown",
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
            assets: {
              type: "array",
              description: "Floor plans / assets specific to this space. Empty if none.",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  url: { type: "string" },
                  kind: { type: "string" },
                  label: { type: ["string", "null"] },
                  source_url: { type: ["string", "null"] },
                },
                required: ["url", "kind", "label", "source_url"],
              },
            },
            source_url: {
              type: ["string", "null"],
              description: "Primary page describing this space.",
            },
          },
          required: [
            "name",
            "bookable_separately",
            "description",
            "sq_ft",
            "capacity",
            "setting",
            "amenities",
            "included_inventory",
            "assets",
            "source_url",
          ],
        },
      },
      fee_schedule: {
        type: "array",
        description:
          "Venue fee / package amounts keyed by space × day × season when stated (e.g. Saturday Pavilion $6000). Empty if inquire-only or not published. Prefer separate rows per space/day; use space=null for whole-property fees.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            space: {
              type: ["string", "null"],
              description: "Space name if fee is room-specific; null for entire venue.",
            },
            day: {
              type: ["string", "null"],
              description:
                "friday | saturday | sunday | weekday | monday | tuesday | wednesday | thursday | any | null",
            },
            season: {
              type: ["string", "null"],
              description: "peak | off_peak | holiday | null",
            },
            amount: { type: "number", description: "Fee amount in currency units." },
            currency: { type: "string", description: "Usually USD." },
            unit: {
              type: "string",
              description: "venue_fee_usd | per_guest_usd | package_usd | other",
            },
            includes: {
              type: ["string", "null"],
              description: "What the fee includes if stated (hours, getting-ready time, etc).",
            },
            quote: { type: ["string", "null"] },
            source_url: { type: ["string", "null"] },
          },
          required: [
            "space",
            "day",
            "season",
            "amount",
            "currency",
            "unit",
            "includes",
            "quote",
            "source_url",
          ],
        },
      },
      price_display: provenanceString(
        "Event/venue pricing as shown on site (e.g. 'from $5,000', 'packages start at $85/person', 'Fri $6k / Sat $7k'). Null if inquire-only, not stated, OR if the only prices are hotel guest-room / nightly ADR rates (e.g. 'From $163', '$289/night').",
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
      "spaces",
      "fee_schedule",
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
- Prefer wedding / private-event / venue-rental / banquet / ballroom pages over hotel lodging, guest-room, reservations, or room-rate pages. Ignore accommodations marketing.
- Capacity (keep broad — do not over-normalize):
  - Prefer WEDDING ceremony/reception capacity over gala/corporate-only numbers when both exist.
  - capacity_max: one primary guest number for wedding reception filters/cards. Prefer the largest *seated without dance* / banquet figure across spaces — NOT cocktail/reception standing-room max and NOT combined-ballroom totals. Example: Solarium seated-with-dance 320 + seated 370 + reception 477 → capacity_max=370; keep all three in capacity_configurations and spaces[].capacity. If only cocktail/reception figures exist (no seated), set capacity_max to null.
  - capacity_as_stated: copy their capacity wording broadly (Ceremony/Banquet/Reception lines, seated with/without dance, etc.).
  - capacity_configurations: emit ONE ROW PER LABELED STYLE. If the site says "Ceremony: 495 Banquet: 100-500 Reception: 900", emit three rows (ceremony 495; banquet/seated guests=500 guests_min=100; reception 900). If "320: Seated with dance floor / 370: Seated without dance floor / 477: Reception", emit seated_with_dance 320, seated 370, reception 477. Guest counts must be > 0; never emit 0. Include guests_min for ranges.
  - spaces: WEDDING venues only. Hotels: only rooms under Weddings / Wedding Venues (e.g. Devonshire Ballroom, Langham Plaza, Cambridge — typically 2–4), NOT private dining, Travelle tables, restaurant buyouts, or "Petite Weddings" packages. Do NOT invent amalgam spaces like "Grand Ballroom & State Combined" or "Three Ballrooms" unless the site lists that as a separately priced package — prefer one object per named room. Museums/clubs: named halls on venue-rental pages. For each space fill capacity.ceremony_max / seated_min / seated_max / seated_with_dance / cocktail_max from labeled tables (Reception→cocktail_max, Banquet→seated_*, Ceremony→ceremony_max). Empty array ONLY when one undifferentiated space.
  - capacity_max: Prefer the largest *seated without dance* / banquet figure across individual rooms — NOT combined-ballroom reception totals and NOT cocktail-only standing room. If the site only publishes cocktail/reception figures with no seated counts, set capacity_max to null.
  - fee_schedule: room × day × season venue fees when published (e.g. Sat Pavilion $6000, Sun Pergola $1000, Entire Venue $9000). Empty if inquire-only. Also capture per-guest package amounts as unit=per_guest_usd when clearly stated.
  - Ignore contact-form guest-count dropdowns (e.g. "0-49 … 1000+") as capacity — those are form options, not venue capacity.
- Pricing:
  - price_display: short card-friendly EVENT/VENUE pricing only (e.g. "Fri $6k / Sat $7k" or "from $12,000" or "$85/person"). Null when inquire-only.
  - NEVER put hotel guest-room or nightly ADR into price_display (reject "From $163", "$289/night", "rooms starting at…"). Those are lodging rates, not wedding venue fees.
  - pricing_as_stated: richer verbatim peak/off-peak / weekday nuances when present (event fees only).
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
