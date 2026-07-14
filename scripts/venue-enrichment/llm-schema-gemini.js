/** Gemini responseSchema (uppercase types, nullable flags). */

function provString(desc) {
  return {
    type: "OBJECT",
    properties: {
      value: { type: "STRING", nullable: true, description: desc },
      quote: { type: "STRING", nullable: true },
      source_url: { type: "STRING", nullable: true },
    },
    required: ["value", "quote", "source_url"],
  };
}

function provNumber(desc) {
  return {
    type: "OBJECT",
    properties: {
      value: { type: "NUMBER", nullable: true, description: desc },
      quote: { type: "STRING", nullable: true },
      source_url: { type: "STRING", nullable: true },
    },
    required: ["value", "quote", "source_url"],
  };
}

function provBoolean(desc) {
  return {
    type: "OBJECT",
    properties: {
      value: { type: "BOOLEAN", nullable: true, description: desc },
      quote: { type: "STRING", nullable: true },
      source_url: { type: "STRING", nullable: true },
    },
    required: ["value", "quote", "source_url"],
  };
}

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    about: provString("1-3 sentence venue description for wedding couples."),
    capacity_max: provNumber(
      "Primary wedding guest capacity. Prefer largest seated wedding/reception figure when seated and standing both exist. Null if not stated. Ignore contact-form guest-count dropdowns.",
    ),
    capacity_min: provNumber("Minimum guest count if stated, else null."),
    capacity_as_stated: provString(
      "Verbatim or near-verbatim capacity wording (e.g. '200 seated dinner, 514 standing'). Null if not stated.",
    ),
    capacity_configurations: {
      type: "ARRAY",
      description:
        "One row per distinct space x style when listed. Empty if only a single undifferentiated number.",
      items: {
        type: "OBJECT",
        properties: {
          space: {
            type: "STRING",
            nullable: true,
            description: "Room/space name if stated.",
          },
          setting: {
            type: "STRING",
            nullable: true,
            description: "indoor | outdoor | either | unknown",
          },
          style: {
            type: "STRING",
            nullable: true,
            description: "seated | standing | cocktail | theater | ceremony | mixed | unknown",
          },
          guests: { type: "NUMBER", description: "Guest count for this row." },
          quote: { type: "STRING", nullable: true },
          source_url: { type: "STRING", nullable: true },
        },
        required: ["space", "setting", "style", "guests", "quote", "source_url"],
      },
    },
    price_display: provString(
      "Short pricing as shown on site. Null if inquire-only or not stated.",
    ),
    pricing_model: {
      type: "OBJECT",
      properties: {
        value: {
          type: "STRING",
          nullable: true,
          description: "flat, per_head, package, inquire_only, mixed, unknown, or null",
        },
        quote: { type: "STRING", nullable: true },
        source_url: { type: "STRING", nullable: true },
      },
      required: ["value", "quote", "source_url"],
    },
    pricing_as_stated: provString(
      "Verbatim pricing nuances (peak/off-peak, Fri/Sat/Sun). Null if inquire-only or not stated.",
    ),
    discovered_assets: {
      type: "ARRAY",
      description:
        "Wedding-relevant asset URLs from ASSET CANDIDATES (preferred) or clear page links. Cap 15. Do not invent URLs. Empty if none.",
      items: {
        type: "OBJECT",
        properties: {
          url: { type: "STRING" },
          kind: {
            type: "STRING",
            description: "brochure_pdf | package_pdf | vendor_list_pdf | floor_plan | pdf | other",
          },
          label: { type: "STRING", nullable: true },
          source_url: { type: "STRING", description: "Page where the link appeared." },
        },
        required: ["url", "kind", "label", "source_url"],
      },
    },
    amenities: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quote: { type: "STRING", nullable: true },
          source_url: { type: "STRING", nullable: true },
        },
        required: ["name", "quote", "source_url"],
      },
    },
    included_inventory: {
      type: "ARRAY",
      description:
        "Items included with the venue rental (tables, chairs, bars, drape, AV, etc.) with counts when stated.",
      items: {
        type: "OBJECT",
        properties: {
          item: { type: "STRING" },
          quote: { type: "STRING", nullable: true },
          source_url: { type: "STRING", nullable: true },
        },
        required: ["item", "quote", "source_url"],
      },
    },
    policies: {
      type: "OBJECT",
      properties: {
        catering: {
          type: "OBJECT",
          properties: {
            value: {
              type: "STRING",
              nullable: true,
              description:
                "open | preferred_list_required | exclusive_in_house | unknown | null. preferred_list_required = must use venue preferred/approved caterers. exclusive_in_house = only venue/in-house catering. open = any outside caterer allowed.",
            },
            quote: { type: "STRING", nullable: true },
            source_url: { type: "STRING", nullable: true },
          },
          required: ["value", "quote", "source_url"],
        },
        byo_alcohol: provBoolean("True if BYOB allowed."),
        alcohol_provided: provBoolean("True if venue provides bar service."),
        event_insurance: {
          type: "OBJECT",
          properties: {
            value: {
              type: "STRING",
              nullable: true,
              description:
                "required | not_required | venue_covers | unknown | null. required = clients/vendors must provide event/liability insurance.",
            },
            quote: { type: "STRING", nullable: true },
            source_url: { type: "STRING", nullable: true },
          },
          required: ["value", "quote", "source_url"],
        },
        curfew: provString("Music or event end time policy if stated."),
      },
      required: ["catering", "byo_alcohol", "alcohol_provided", "event_insurance", "curfew"],
    },
    confidence: { type: "NUMBER", description: "0-1 self-rated confidence." },
    notes: { type: "STRING", nullable: true },
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
};

/** Default pilot models — primary quality vs cheap scale. */
const PILOT_GEMINI_MODELS = [
  { id: "gemini-3.5-flash", slug: "gemini-3-5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-flash-lite", slug: "gemini-3-1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
];

module.exports = { GEMINI_RESPONSE_SCHEMA, PILOT_GEMINI_MODELS };
