import { describe, expect, it } from "vitest";
import { isCompareReady } from "../../../lib/venueDetails/tiers";
import { headlineCapacity } from "../../../lib/venueDetails/derive";
import type { RawPricingResult, RawSpineResult } from "../contract";
import { assembleDocument, computeSalesTaxSource, tileFor, type AssemblePage } from "./assemble";

function emptyPricing(): RawPricingResult {
  return {
    archetype: null,
    paths: [],
    rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, taxes_included_in_rental: null, cc_fee_pct: null, quote: null, source_url: null },
    add_ons: [],
    add_on_categories: [],
    food_beverage: { food_pills: [], bar_pills: [], caption: null, food_note: null, bar_note: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    required_third_party: [],
    faqs: [],
    seasons: null,
    notes: null,
  };
}

function emptySpine(): RawSpineResult {
  return { spine: {}, about: null, differentiator: null, spaces: [], capacities: [], inclusions: [], resources: [], vendor_lists: [], press_features: [], notes: null };
}

const PAGE1: AssemblePage = {
  url: "https://example.com/weddings",
  text:
    "The Grand Ballroom is an indoor space. Our Grand Ballroom seats up to 200 guests for a seated dinner. " +
    "Catering is open, any caterer welcome. Bar service is in-house only.",
  snapshot_id: 1,
};
const PAGE2: AssemblePage = {
  url: "https://example.com/pricing",
  text: "Saturday rental is $6,000 for the Grand Ballroom. Sales tax is 11.75 percent.",
  snapshot_id: 2,
};
const PAGE3: AssemblePage = {
  url: "https://example.com/faq",
  text: "There is no food and beverage minimum required for weekday events.",
  snapshot_id: 3,
};

function miniVenueSpine(): RawSpineResult {
  const s = emptySpine();
  s.spine.venue_kind = { status: "stated", value: "banquet_hall", quote: "Grand Ballroom seats up to 200 guests", source_url: PAGE1.url };
  s.spine.setting = { status: "stated", value: "indoor", quote: "Grand Ballroom is an indoor space", source_url: PAGE1.url };
  s.spine.catering = { status: "stated", value: "open", quote: "Catering is open, any caterer welcome", source_url: PAGE1.url };
  s.spine.bar = { status: "stated", value: "in_house", quote: "Bar service is in-house only", source_url: PAGE1.url };
  s.spine.pricing_archetype = { status: "stated", value: "rental_plus_fb_minimum", quote: "Saturday rental is $6,000 for the Grand Ballroom", source_url: PAGE2.url };
  s.spaces = [
    {
      id: "ballroom",
      name: "Grand Ballroom",
      structure_label: null,
      sq_ft: null,
      sq_ft_label: null,
      sq_ft_outdoor: null,
      ceiling_ft: null,
      ceiling_label: null,
      setting: "indoor",
      bookable_separately: true,
      description: null,
      includes_summary: null,
      source_url: PAGE1.url,
    },
  ];
  s.capacities = [
    { space_id: "ballroom", layout: "seated_dinner", min: null, max: 200, as_stated_label: "Seated dinner", condition: null, quote: "Grand Ballroom seats up to 200 guests for a seated dinner", source_url: PAGE1.url },
  ];
  return s;
}

function miniVenuePricing(): RawPricingResult {
  const p = emptyPricing();
  p.archetype = "rental_plus_fb_minimum";
  p.paths = [
    {
      id: "standard",
      name: "Standard",
      description: null,
      applies_to_spaces: "all",
      fixed_fees: [{ applies_to: "whole_venue", space_id: null, day: "sat", season: "peak", amount: 6000, unit: "flat", label: "Rental", includes: [], key: "rental", quote: "Saturday rental is $6,000 for the Grand Ballroom", source_url: PAGE2.url }],
      per_guest_tiers: [],
      minimums: [],
      required_staffing: null,
      rental_hours: null,
      year_surcharges: [],
      promotions: [],
      includes: [],
      terms: [],
      quote: "Saturday rental is $6,000 for the Grand Ballroom",
      source_url: PAGE2.url,
    },
  ];
  p.rates = { service_charge_pct: null, service_charge_base: null, sales_tax_pct: 11.75, sales_tax_base: "fb_and_rentals", taxes_included_in_rental: null, cc_fee_pct: null, quote: "Sales tax is 11.75 percent", source_url: PAGE2.url };
  return p;
}

function assembleMiniVenue(overrides: { spine?: RawSpineResult; pricing?: RawPricingResult | null; pages?: AssemblePage[] } = {}) {
  return assembleDocument({
    accountId: 1,
    name: "Mini Venue",
    websiteUrl: "https://example.com",
    runId: 42,
    promptVersion: "venue-details-v3.0",
    model: "anthropic/claude-haiku-4.5",
    extractedAt: "2026-09-13T00:00:00.000Z",
    spineRaw: overrides.spine ?? miniVenueSpine(),
    pricingRaw: overrides.pricing !== undefined ? overrides.pricing : miniVenuePricing(),
    pages: overrides.pages ?? [PAGE1, PAGE2, PAGE3],
    assetCandidateUrls: [],
  });
}

describe("tileFor", () => {
  it("maps the three named layouts directly", () => {
    expect(tileFor("seated_dinner", "Seated")).toBe("seated");
    expect(tileFor("seated_with_dance", "Seated w/ dance")).toBe("seated_dance");
    expect(tileFor("cocktail_standing", "Cocktail")).toBe("cocktail");
  });

  it("infers a tile for 'other' from the as_stated_label", () => {
    expect(tileFor("other", "Seated with a live band")).toBe("seated");
    expect(tileFor("other", "Reception / standing")).toBe("cocktail");
  });

  it("returns null for ceremony/theater layouts", () => {
    expect(tileFor("ceremony_seated", "Ceremony")).toBeNull();
    expect(tileFor("theater", "Theater style")).toBeNull();
  });
});

describe("computeSalesTaxSource", () => {
  it("is stated when a rate + quote are present", () => {
    expect(computeSalesTaxSource({ sales_tax_pct: 11.75, quote: "q", taxes_included_in_rental: null }, false)).toBe("stated");
  });
  it("is included when taxes_included_in_rental is true", () => {
    expect(computeSalesTaxSource({ sales_tax_pct: null, quote: null, taxes_included_in_rental: true }, false)).toBe("included");
  });
  it("is chicago_default when unknown but per-guest tiers exist", () => {
    expect(computeSalesTaxSource({ sales_tax_pct: null, quote: null, taxes_included_in_rental: null }, true)).toBe("chicago_default");
  });
  it("is unknown otherwise", () => {
    expect(computeSalesTaxSource({ sales_tax_pct: null, quote: null, taxes_included_in_rental: null }, false)).toBe("unknown");
  });
});

describe("assembleDocument -- end to end on a mini venue", () => {
  it("produces a compare-ready document", () => {
    const result = assembleMiniVenue();
    expect(result.ok).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.criticalFailures).toBe(0);
    expect(
      isCompareReady(result.document, { criticalGroundingFailures: result.criticalFailures, needsReview: result.needsReview })
    ).toBe(true);
    expect(headlineCapacity(result.document).headline).toBe(200);
  });

  it("resolves snapshot ids and pages into sources", () => {
    const result = assembleMiniVenue();
    expect(result.document.sources.snapshot_ids.sort()).toEqual([1, 2, 3]);
    expect(result.document.sources.pages).toEqual([PAGE1.url, PAGE2.url, PAGE3.url]);
  });

  it("fills the extraction block from runId/promptVersion/model", () => {
    const result = assembleMiniVenue();
    expect(result.document.extraction).toEqual({ run_id: 42, prompt_version: "venue-details-v3.0", model: "anthropic/claude-haiku-4.5", extracted_at: "2026-09-13T00:00:00.000Z" });
  });

  it("assigns tile=seated to the headline capacity tuple", () => {
    const result = assembleMiniVenue();
    expect(result.document.capacities[0].tile).toBe("seated");
  });

  it("counts spine_stated_count as stated + conflicting fields", () => {
    const result = assembleMiniVenue();
    expect(result.spineStatedCount).toBe(5); // venue_kind, setting, catering, bar, pricing_archetype
  });

  it("computes sales_tax_source=stated on the assembled rates", () => {
    const result = assembleMiniVenue();
    expect(result.document.pricing.rates.sales_tax_source).toBe("stated");
  });
});

describe("assembleDocument -- tier consequences", () => {
  it("a stripped critical field (fb_minimum, ungrounded) yields critical_failures=1 and needs_review", () => {
    const spine = miniVenueSpine();
    spine.spine.fb_minimum = { status: "stated", value: { applies: true, amount_usd: 9900, detail: null }, quote: "a minimum of nine thousand nine hundred applies", source_url: PAGE3.url };
    const result = assembleMiniVenue({ spine });
    expect(result.criticalFailures).toBe(1);
    expect(result.needsReview).toBe(true);
    expect(result.issues.some((i) => i.code === "ungrounded_spine" && i.path === "/spine/fb_minimum" && i.tier === "critical")).toBe(true);
  });

  it("a stripped secondary field (an ungrounded inclusion) does not affect critical_failures/needs_review", () => {
    const spine = miniVenueSpine();
    spine.inclusions = [{ label: "Parking", label_raw: "Free parking", detail: null, category: "Space", quote: "totally unrelated made-up text nowhere in the crawl", source_url: PAGE1.url }];
    const result = assembleMiniVenue({ spine });
    expect(result.criticalFailures).toBe(0);
    expect(result.needsReview).toBe(false);
    expect(result.document.inclusions).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "ungrounded_item" && i.tier === "secondary")).toBe(true);
  });

  it("generates a repair for the ungrounded critical spine field, with the right tier and keyword hits", () => {
    const spine = miniVenueSpine();
    spine.spine.fb_minimum = { status: "stated", value: { applies: true, amount_usd: 9900, detail: null }, quote: "a minimum of nine thousand nine hundred applies", source_url: PAGE3.url };
    const result = assembleMiniVenue({ spine });
    const repair = result.repairs.find((r) => r.field_path === "/spine/fb_minimum");
    expect(repair).toBeDefined();
    expect(repair?.tier).toBe("critical");
    expect(repair?.evidence_hint.snapshot_ids).toContain(3); // PAGE3 mentions "minimum"
    expect(repair?.evidence_hint.keyword_hits).toContain("minimum");
  });
});

describe("assembleDocument -- corkage_implies_byo", () => {
  it("overrides bar=in_house to byo_with_corkage when a corkage add-on is present, and adds a bar_pill", () => {
    const pricing = miniVenuePricing();
    pricing.add_ons = [
      {
        id: "corkage",
        name: "Corkage fee",
        category: "bar",
        variant: null,
        group: "fb",
        price: 25,
        price_max: null,
        unit: "per_guest",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: null,
        quote: "Corkage fee $25/guest for outside wine",
        source_url: PAGE2.url,
        note: null,
        selection_group: null,
      },
    ];
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Corkage fee $25/guest for outside wine.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    const bar = result.document.spine.bar;
    expect(bar.status).toBe("stated");
    if (bar.status === "stated") expect(bar.value).toBe("byo_with_corkage");
    expect(result.document.food_beverage.bar_pills.some((p) => p.value === "byo")).toBe(true);
    expect(result.issues.some((i) => i.code === "corkage_implies_byo")).toBe(true);
  });
});

describe("assembleDocument -- round 3 fields", () => {
  it("carries sq_ft_label/ceiling_label through onto the assembled space", () => {
    const spine = miniVenueSpine();
    spine.spaces[0].sq_ft_label = "~21,000 (main floor)";
    spine.spaces[0].sq_ft = 21000;
    spine.spaces[0].ceiling_label = "8-14 ft";
    spine.spaces[0].ceiling_ft = 8;
    const result = assembleMiniVenue({ spine });
    const ballroom = result.document.spaces.find((s) => s.id === "ballroom");
    expect(ballroom?.sq_ft_label).toBe("~21,000 (main floor)");
    expect(ballroom?.ceiling_label).toBe("8-14 ft");
  });

  it("keeps a path's includes[] item that appears verbatim on the path's cited page", () => {
    const pricing = miniVenuePricing();
    pricing.paths[0].includes = ["tables and chairs"];
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Includes tables and chairs.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    expect(result.document.pricing.paths[0].includes).toEqual(["tables and chairs"]);
  });

  it("drops a path's includes[] item not found on the cited page, with an issue, and omits an empty includes", () => {
    const pricing = miniVenuePricing();
    pricing.paths[0].includes = ["a totally unsupported item"];
    const result = assembleMiniVenue({ pricing });
    expect(result.document.pricing.paths[0].includes).toBeUndefined();
    expect(result.issues.some((i) => i.code === "unsupported_includes_item")).toBe(true);
  });

  it("normalizes an add-on's selection_group to a stable slug", () => {
    const pricing = miniVenuePricing();
    pricing.add_ons = [
      {
        id: "food-a",
        name: "Chicken package",
        category: "food",
        variant: null,
        group: "fb",
        price: 60,
        price_max: null,
        unit: "per_guest",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: null,
        note: null,
        selection_group: "Food Package",
        quote: "Chicken package $60/guest",
        source_url: PAGE2.url,
      },
    ];
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Chicken package $60/guest.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    expect(result.document.pricing.add_ons[0].selection_group).toBe("food_package");
  });

  it("keeps an add_on_categories entry referenced by an add-on, dropping one that isn't", () => {
    const pricing = miniVenuePricing();
    pricing.add_ons = [
      {
        id: "swag-a",
        name: "Welcome swag",
        category: "guest favors",
        variant: null,
        group: "other",
        price: 25,
        price_max: null,
        unit: "per_guest",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: null,
        note: null,
        selection_group: null,
        quote: "Welcome swag $25/guest",
        source_url: PAGE2.url,
      },
    ];
    pricing.add_on_categories = [
      { category: "guest favors", blurb: "Give your guests something to remember.", examples: ["candles", "koozies"], source_url: PAGE2.url },
      { category: "unreferenced category", blurb: null, examples: [], source_url: PAGE2.url },
    ];
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Welcome swag $25/guest.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    expect(result.document.pricing.add_on_categories).toHaveLength(1);
    expect(result.document.pricing.add_on_categories?.[0]).toMatchObject({ category: "guest favors", blurb: "Give your guests something to remember.", examples: ["candles", "koozies"] });
    expect(result.issues.some((i) => i.code === "add_on_category_unreferenced")).toBe(true);
  });

  it("keeps seasons text found on the cited page and drops the half that isn't found", () => {
    const pricing = miniVenuePricing();
    pricing.seasons = { peak: "Apr-Oct, Dec", off: "a made-up off season nowhere in the crawl", source_url: PAGE2.url };
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Peak season is Apr-Oct, Dec.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    expect(result.document.pricing.seasons).toEqual({ peak: "Apr-Oct, Dec", off: null });
    expect(result.issues.some((i) => i.code === "unsupported_season_text" && i.path === "/pricing/seasons/off")).toBe(true);
  });

  it("omits seasons entirely when neither half is supported", () => {
    const pricing = miniVenuePricing();
    pricing.seasons = { peak: "nowhere in the crawl", off: "also nowhere", source_url: PAGE2.url };
    const result = assembleMiniVenue({ pricing });
    expect(result.document.pricing.seasons).toBeUndefined();
  });
});

describe("assembleDocument -- round 4 fields", () => {
  it("keeps a path term whose text appears verbatim on the term's own cited page", () => {
    const pricing = miniVenuePricing();
    pricing.paths[0].terms = [{ label: "Access", text: "Access begins at 10am", quote: "Access begins at 10am on the day of your event", source_url: PAGE2.url }];
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Access begins at 10am on the day of your event.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    expect(result.document.pricing.paths[0].terms).toEqual([{ label: "Access", text: "Access begins at 10am", evidence: { source_url: "example.com/pricing", snapshot_id: 2 } }]);
  });

  it("drops a path term not found on its cited page, with an issue, and omits an empty terms", () => {
    const pricing = miniVenuePricing();
    pricing.paths[0].terms = [{ label: "Access", text: "a totally unsupported term", quote: "a totally unsupported term", source_url: PAGE2.url }];
    const result = assembleMiniVenue({ pricing });
    expect(result.document.pricing.paths[0].terms).toBeUndefined();
    expect(result.issues.some((i) => i.code === "unsupported_term_text")).toBe(true);
  });

  it("keeps food_note/bar_note when digit-safe and their source is crawled", () => {
    const pricing = miniVenuePricing();
    pricing.food_beverage.food_note = { text: "All food must come from our exclusive in-house caterer.", quote: "All food must come from our exclusive in-house caterer.", source_url: PAGE1.url };
    pricing.food_beverage.bar_note = { text: "Outside wine is welcome with a corkage fee.", quote: "Outside wine is welcome with a corkage fee.", source_url: PAGE1.url };
    const result = assembleMiniVenue({ pricing });
    expect(result.document.food_beverage.food_note).toEqual({
      value: "All food must come from our exclusive in-house caterer.",
      quote: "All food must come from our exclusive in-house caterer.",
      source_url: "example.com/weddings",
      snapshot_id: 1,
    });
    expect(result.document.food_beverage.bar_note?.value).toBe("Outside wine is welcome with a corkage fee.");
  });

  it("drops food_note with an unsupported number, code note_numeric_hygiene", () => {
    const pricing = miniVenuePricing();
    pricing.food_beverage.food_note = { text: "A minimum of $500 applies to all food orders.", quote: "A minimum of $500 applies to all food orders.", source_url: PAGE1.url };
    const result = assembleMiniVenue({ pricing });
    expect(result.document.food_beverage.food_note).toBeNull();
    expect(result.issues.some((i) => i.code === "note_numeric_hygiene" && i.path === "/food_beverage/food_note")).toBe(true);
  });

  it("drops bar_note whose source_url was never crawled", () => {
    const pricing = miniVenuePricing();
    pricing.food_beverage.bar_note = { text: "The bar closes at midnight.", quote: "The bar closes at midnight.", source_url: "https://example.com/never-crawled" };
    const result = assembleMiniVenue({ pricing });
    expect(result.document.food_beverage.bar_note).toBeNull();
    expect(result.issues.some((i) => i.code === "note_numeric_hygiene" && i.path === "/food_beverage/bar_note")).toBe(true);
  });
});

describe("assembleDocument -- round 5 fields", () => {
  it("carries a stated capacity_max_guests spine value through like any other tri-state field", () => {
    const spine = miniVenueSpine();
    spine.spine.capacity_max_guests = { status: "stated", value: 200, quote: "Grand Ballroom seats up to 200 guests", source_url: PAGE1.url };
    const result = assembleMiniVenue({ spine });
    const field = result.document.spine.capacity_max_guests;
    expect(field.status).toBe("stated");
    if (field.status === "stated") expect(field.value).toBe(200);
  });

  it("keeps an add-on's own valid category_std from the model", () => {
    const pricing = miniVenuePricing();
    pricing.add_ons = [
      {
        id: "dj",
        name: "DJ package",
        category: "Music",
        category_std: "entertainment",
        variant: null,
        group: "other",
        price: 800,
        price_max: null,
        unit: "flat",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: null,
        note: null,
        selection_group: null,
        quote: "DJ package $800",
        source_url: PAGE2.url,
      },
    ];
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} DJ package $800.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    expect(result.document.pricing.add_ons[0].category_std).toBe("entertainment");
  });

  it("defaults category_std from group (fb->fb, ceremony->ceremony, service->services_staffing, rental/other->space_rentals) when the model omits it", () => {
    const groupCases: { group: "fb" | "rental" | "service" | "ceremony" | "other"; expected: string }[] = [
      { group: "fb", expected: "fb" },
      { group: "ceremony", expected: "ceremony" },
      { group: "service", expected: "services_staffing" },
      { group: "rental", expected: "space_rentals" },
      { group: "other", expected: "space_rentals" },
    ];
    for (const { group, expected } of groupCases) {
      const pricing = miniVenuePricing();
      pricing.add_ons = [
        {
          id: `addon-${group}`,
          name: `Add-on ${group}`,
          category: "Misc",
          variant: null,
          group,
          price: 100,
          price_max: null,
          unit: "flat",
          per_space_prices: null,
          applies_to: "all",
          path_ids: null,
          condition: null,
          priceable: true,
          tax_pct_override: null,
          min_guests: null,
          as_stated_price: null,
          note: null,
          selection_group: null,
          quote: `Add-on ${group} $100`,
          source_url: PAGE2.url,
        },
      ];
      const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Add-on ${group} $100.`, snapshot_id: 2 }, PAGE3];
      const result = assembleMiniVenue({ pricing, pages });
      expect(result.document.pricing.add_ons[0].category_std).toBe(expected);
    }
  });
});

describe("assembleDocument -- FAQ off-topic gate", () => {
  it("drops hotel-guest FAQs and flags contamination when they're the majority", () => {
    const pricing = miniVenuePricing();
    pricing.faqs = [
      { question: "What time is check-in?", answer: "Check-in is at 4pm for hotel guests.", source_url: PAGE2.url },
      { question: "Do you have wifi pricing for guest rooms?", answer: "Wifi price for guest rooms is $10/night.", source_url: PAGE2.url },
    ];
    const pages = [PAGE1, { url: PAGE2.url, text: `${PAGE2.text} Check-in is at 4pm for hotel guests. Wifi price for guest rooms is $10/night.`, snapshot_id: 2 }, PAGE3];
    const result = assembleMiniVenue({ pricing, pages });
    expect(result.document.faqs).toHaveLength(0);
    expect(result.reviewReasons).toContain("hotel_faq_contamination");
  });
});
