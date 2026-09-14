/* eslint-disable @typescript-eslint/no-explicit-any -- tests probe hand-written JSON-schema objects whose shape is the thing under test */
import { describe, expect, it } from "vitest";
import {
  BAR_POLICIES,
  CATERING_POLICIES,
  CEREMONY_FEE_POLICIES,
  COAT_CHECK,
  COORDINATOR_POLICIES,
  DAYS,
  FB_PILLS,
  INCLUSION_CATEGORIES,
  INCLUSION_LABELS,
  INSURANCE_POLICIES,
  LAYOUTS,
  PARKING_POLICIES,
  PRICING_ARCHETYPES,
  RESOURCE_KINDS,
  SECURITY_POLICIES,
  SEASONS,
  SETTINGS,
  SPINE_KEYS,
  VENDOR_LIST_POLICIES,
  VENUE_KINDS,
} from "../../lib/venueDetails/types";
import {
  PRICING_TOOL,
  SPINE_TOOL,
  buildDocument,
  buildPricingUserMessage,
  buildRepairTool,
  buildRepairUserMessage,
  buildSpineUserMessage,
  validateShape,
  type DocPage,
  type JsonSchema,
} from "./venueDetailsPrompt";

// ---------------------------------------------------------------------------
// Schema tree walk helpers
// ---------------------------------------------------------------------------

function isSchemaObject(v: unknown): v is JsonSchema {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursively collects every violation of "an object schema's `required` lists exactly its
 * `properties` keys" -- the house invariant every strictObject() call in venueDetailsPrompt.ts
 * is supposed to guarantee. */
function collectRequiredViolations(schema: unknown, path = "$"): string[] {
  const violations: string[] = [];
  if (!isSchemaObject(schema)) return violations;

  const type = schema.type;
  const isObjectType = type === "object" || (Array.isArray(type) && type.includes("object"));
  if (isObjectType && isSchemaObject(schema.properties)) {
    const propKeys = Object.keys(schema.properties).sort();
    const required = Array.isArray(schema.required) ? [...schema.required].sort() : [];
    if (JSON.stringify(propKeys) !== JSON.stringify(required)) {
      violations.push(`${path}: required=${JSON.stringify(required)} !== properties keys=${JSON.stringify(propKeys)}`);
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      violations.push(...collectRequiredViolations(sub, `${path}.${key}`));
    }
  }
  if (schema.type === "array" && isSchemaObject(schema.items)) {
    violations.push(...collectRequiredViolations(schema.items, `${path}[]`));
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((s, i) => violations.push(...collectRequiredViolations(s, `${path}.anyOf[${i}]`)));
  }
  return violations;
}

/** Collects every field whose schema carries a top-level derived-field name -- these must never
 * appear anywhere in the raw extraction schemas (they're computed by validate/assemble.ts). */
const DERIVED_FIELD_NAMES = ["tile", "embeddable", "sales_tax_source", "headline", "headline_capacity", "headline_layout", "headline_space_id"];

function collectPropertyNames(schema: unknown, acc: Set<string> = new Set()): Set<string> {
  if (!isSchemaObject(schema)) return acc;
  if (isSchemaObject(schema.properties)) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      acc.add(key);
      collectPropertyNames(sub, acc);
    }
  }
  if (isSchemaObject(schema.items)) collectPropertyNames(schema.items, acc);
  if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((s) => collectPropertyNames(s, acc));
  return acc;
}

// ---------------------------------------------------------------------------
// SPINE_TOOL / PRICING_TOOL structural invariants
// ---------------------------------------------------------------------------

describe("SPINE_TOOL", () => {
  it("has exactly one spine property per SPINE_KEYS entry, both directions", () => {
    const spineProps = Object.keys((SPINE_TOOL.parameters as JsonSchema).properties as JsonSchema);
    expect(spineProps).toContain("spine");
    const spineSchema = (SPINE_TOOL.parameters as any).properties.spine as JsonSchema;
    const spineFieldKeys = Object.keys(spineSchema.properties as JsonSchema).sort();
    expect(spineFieldKeys).toEqual([...SPINE_KEYS].sort());
  });

  it("every object schema's required lists exactly its properties", () => {
    expect(collectRequiredViolations(SPINE_TOOL.parameters)).toEqual([]);
  });

  it("never includes a derived field", () => {
    const names = collectPropertyNames(SPINE_TOOL.parameters);
    for (const derived of DERIVED_FIELD_NAMES) {
      expect(names.has(derived)).toBe(false);
    }
  });

  it("spine enum fields equal the exact types.ts const arrays", () => {
    const spineSchema = (SPINE_TOOL.parameters as any).properties.spine as JsonSchema;
    const enumOf = (key: string) => ((spineSchema.properties as any)[key].properties.value.enum ?? null) as string[] | null;
    // value is nullable so its schema has type:[X,"null"] and enum:[...] -- present regardless.
    const pairs: [string, readonly string[]][] = [
      ["venue_kind", VENUE_KINDS],
      ["setting", SETTINGS],
      ["catering", CATERING_POLICIES],
      ["bar", BAR_POLICIES],
      ["parking", PARKING_POLICIES],
      ["day_of_coordinator", COORDINATOR_POLICIES],
      ["event_insurance", INSURANCE_POLICIES],
      ["security", SECURITY_POLICIES],
      ["coat_check", COAT_CHECK],
      ["ceremony_fee", CEREMONY_FEE_POLICIES],
      ["vendor_list_policy", VENDOR_LIST_POLICIES],
      ["pricing_archetype", PRICING_ARCHETYPES],
    ];
    for (const [key, arr] of pairs) {
      expect(enumOf(key)).toEqual([...arr]);
    }
  });

  it("capacities/resources/inclusions enums equal types.ts const arrays", () => {
    const props = (SPINE_TOOL.parameters as any).properties;
    expect(props.capacities.items.properties.layout.enum).toEqual([...LAYOUTS]);
    expect(props.resources.items.properties.kind.enum).toEqual([...RESOURCE_KINDS]);
    expect(props.inclusions.items.properties.label.enum).toEqual([...INCLUSION_LABELS]);
    expect(props.inclusions.items.properties.category.enum).toEqual([...INCLUSION_CATEGORIES]);
  });

  it("stays within the ~12,000-token (48,000 char) per-tool schema-size budget", () => {
    const chars = JSON.stringify(SPINE_TOOL.parameters).length;
    expect(chars / 4).toBeLessThan(12_000);
  });
});

describe("PRICING_TOOL", () => {
  it("every object schema's required lists exactly its properties", () => {
    expect(collectRequiredViolations(PRICING_TOOL.parameters)).toEqual([]);
  });

  it("never includes a derived field (sales_tax_source in particular)", () => {
    const names = collectPropertyNames(PRICING_TOOL.parameters);
    expect(names.has("sales_tax_source")).toBe(false);
    for (const derived of DERIVED_FIELD_NAMES) {
      expect(names.has(derived)).toBe(false);
    }
  });

  it("never includes the 5 standard (derived) FAQs -- faqs is a plain verbatim array", () => {
    const faqsSchema = (PRICING_TOOL.parameters as any).properties.faqs as JsonSchema;
    expect(faqsSchema.type).toBe("array");
    expect(Object.keys((faqsSchema.items as JsonSchema).properties as JsonSchema).sort()).toEqual(["answer", "question", "source_url"]);
  });

  it("day/season enums on fixed_fees/per_guest_tiers/minimums equal DAYS/SEASONS", () => {
    const props = (PRICING_TOOL.parameters as any).properties;
    const feeItem = props.paths.items.properties.fixed_fees.items.properties;
    // day/season are nullable -- enum lives alongside the nullable type array.
    expect(feeItem.day.enum).toEqual([...DAYS]);
    expect(feeItem.season.enum).toEqual([...SEASONS]);
    const tierItem = props.paths.items.properties.per_guest_tiers.items.properties;
    expect(tierItem.day.enum).toEqual([...DAYS]);
    expect(tierItem.season.enum).toEqual([...SEASONS]);
  });

  it("food_beverage pill enums equal FB_PILLS", () => {
    const fb = (PRICING_TOOL.parameters as any).properties.food_beverage.properties;
    expect(fb.food_pills.items.properties.value.enum).toEqual([...FB_PILLS]);
    expect(fb.bar_pills.items.properties.value.enum).toEqual([...FB_PILLS]);
  });

  it("stays within the ~12,000-token (48,000 char) per-tool schema-size budget", () => {
    const chars = JSON.stringify(PRICING_TOOL.parameters).length;
    expect(chars / 4).toBeLessThan(12_000);
  });
});

// ---------------------------------------------------------------------------
// buildDocument
// ---------------------------------------------------------------------------

describe("buildDocument", () => {
  const pageA: DocPage = { url: "https://a.com/wedding", text: "A".repeat(100), score: 10, kind: "html" };
  const pageB: DocPage = { url: "https://b.com/pricing", text: "B".repeat(100), score: 5, kind: "html" };
  const pageC: DocPage = { url: "https://c.com/faq", text: "C".repeat(100), score: 5, kind: "html" };

  it("orders pages by score desc, then URL asc", () => {
    const doc = buildDocument([pageC, pageA, pageB], 10_000);
    expect(doc.pagesUsed).toEqual([pageA.url, pageB.url, pageC.url]);
  });

  it("is stable under input reordering", () => {
    const doc1 = buildDocument([pageA, pageB, pageC], 10_000);
    const doc2 = buildDocument([pageC, pageB, pageA], 10_000);
    expect(doc1.text).toBe(doc2.text);
    expect(doc1.pagesUsed).toEqual(doc2.pagesUsed);
  });

  it("truncates at page boundaries, dropping the lowest-score page(s) first", () => {
    // Each formatted page is ~137 chars; a budget that fits exactly one page (200) but not two
    // (~276) must drop both lower-scored pages entirely, never emit a half-page fragment of them.
    const doc = buildDocument([pageA, pageB, pageC], 200);
    expect(doc.pagesUsed).toEqual([pageA.url]);
    expect(doc.text).toContain("A".repeat(100));
    expect(doc.text).not.toContain("B");
    expect(doc.text).not.toContain("C");
  });

  it("hard-truncates the single remaining page's text when even one page exceeds the budget", () => {
    const doc = buildDocument([pageA], 50);
    expect(doc.pagesUsed).toEqual([pageA.url]);
    expect(doc.text.length).toBeLessThanOrEqual(50);
  });

  it("appends an ASSET CANDIDATES block only when asset candidates are given", () => {
    const withAssets = buildDocument([pageA], 10_000, [{ url: "https://a.com/brochure.pdf", anchorText: "Wedding Brochure" }]);
    expect(withAssets.text).toContain("--- ASSET CANDIDATES ---");
    expect(withAssets.text).toContain("https://a.com/brochure.pdf :: Wedding Brochure");

    const withoutAssets = buildDocument([pageA], 10_000);
    expect(withoutAssets.text).not.toContain("ASSET CANDIDATES");
  });
});

describe("buildSpineUserMessage / buildPricingUserMessage", () => {
  it("includes the venue name, website, and document text", () => {
    const msg = buildSpineUserMessage({ name: "Test Venue", websiteUrl: "https://test.com", documentText: "--- PAGE: x ---\nhello" });
    expect(msg).toContain("VENUE: Test Venue");
    expect(msg).toContain("https://test.com");
    expect(msg).toContain("hello");
  });

  it("pricing message includes the spine summary space ids so both calls agree", () => {
    const msg = buildPricingUserMessage(
      { name: "Test Venue", websiteUrl: "https://test.com", documentText: "doc" },
      { spaces: [{ id: "ballroom", name: "Grand Ballroom" }], archetypeHint: "rental_plus_fb_minimum" }
    );
    expect(msg).toContain("ballroom");
    expect(msg).toContain("Grand Ballroom");
    expect(msg).toContain("rental_plus_fb_minimum");
  });
});

// ---------------------------------------------------------------------------
// buildRepairTool
// ---------------------------------------------------------------------------

describe("buildRepairTool", () => {
  it("yields a valid schema for a spine field_path", () => {
    const tool = buildRepairTool(["/spine/catering"]);
    expect(Object.keys((tool.parameters as any).properties)).toEqual(["spine"]);
    expect(Object.keys((tool.parameters as any).properties.spine.properties)).toEqual(["catering"]);
    expect(collectRequiredViolations(tool.parameters)).toEqual([]);
  });

  it("yields a valid schema for capacities", () => {
    const tool = buildRepairTool(["/capacities/ballroom:seated_dinner/max"]);
    expect(Object.keys((tool.parameters as any).properties)).toEqual(["capacities"]);
  });

  it("yields a valid schema for pricing.add_ons", () => {
    const tool = buildRepairTool(["/pricing/add_ons/corkage/price"]);
    expect(Object.keys((tool.parameters as any).properties)).toEqual(["pricing"]);
    expect(Object.keys((tool.parameters as any).properties.pricing.properties)).toEqual(["add_ons"]);
  });

  it("combines multiple roots into one schema", () => {
    const tool = buildRepairTool(["/spine/catering", "/spine/bar", "/pricing/rates", "/capacities/ballroom:seated_dinner/max"]);
    const keys = Object.keys((tool.parameters as any).properties).sort();
    expect(keys).toEqual(["capacities", "pricing", "spine"]);
    expect(Object.keys((tool.parameters as any).properties.spine.properties).sort()).toEqual(["bar", "catering"]);
  });

  it("rejects an unknown top-level root", () => {
    expect(() => buildRepairTool(["/nonsense/foo"])).toThrow(/unknown field_path root/);
  });

  it("rejects an unknown spine key", () => {
    expect(() => buildRepairTool(["/spine/not_a_real_key"])).toThrow(/no such spine key/);
  });

  it("rejects an unknown pricing sub-field", () => {
    expect(() => buildRepairTool(["/pricing/not_a_real_field"])).toThrow(/no such pricing field/);
  });

  it("throws on an empty field_path list", () => {
    expect(() => buildRepairTool([])).toThrow();
  });
});

describe("buildRepairUserMessage", () => {
  it("renders each repair item's instruction and the page excerpts", () => {
    const msg = buildRepairUserMessage(
      [
        {
          field_path: "/spine/fb_minimum",
          issue_code: "ungrounded_spine",
          tier: "critical",
          instruction: "quote must contain the number",
          evidence_hint: { snapshot_ids: [1], keyword_hits: ["minimum"] },
        },
      ],
      [{ url: "https://x.com/pricing", text: "the food and beverage minimum is $6,000" }]
    );
    expect(msg).toContain("/spine/fb_minimum");
    expect(msg).toContain("quote must contain the number");
    expect(msg).toContain("https://x.com/pricing");
    expect(msg).toContain("$6,000");
  });
});

// ---------------------------------------------------------------------------
// validateShape
// ---------------------------------------------------------------------------

describe("validateShape", () => {
  it("names the allowed enum for an out-of-enum spine value", () => {
    const violations = validateShape({ spine: { catering: { status: "stated", value: "bogus_policy", quote: "q", source_url: "u", candidates: [] } } });
    expect(violations.some((v) => v.includes("spine.catering.value") && v.includes("bogus_policy") && v.includes("open"))).toBe(true);
  });

  it("names the allowed status enum for an out-of-enum status", () => {
    const violations = validateShape({ spine: { catering: { status: "MAYBE", value: null, quote: null, source_url: null, candidates: [] } } });
    expect(violations.some((v) => v.includes("spine.catering.status"))).toBe(true);
  });

  it("accepts a well-formed spine reply with no violations", () => {
    const violations = validateShape({
      spine: { catering: { status: "stated", value: "open", quote: "any caterer welcome", source_url: "https://x.com", candidates: [] } },
    });
    expect(violations).toEqual([]);
  });

  it("names an out-of-enum pricing archetype", () => {
    const violations = validateShape({ archetype: "made_up", paths: [], rates: {}, add_ons: [], food_beverage: {} });
    expect(violations.some((v) => v.includes("archetype") && v.includes("made_up"))).toBe(true);
  });

  it("names an out-of-enum fixed_fee day", () => {
    const violations = validateShape({
      archetype: null,
      rates: {},
      add_ons: [],
      food_beverage: {},
      paths: [{ fixed_fees: [{ day: "someday", season: "peak", unit: "flat", applies_to: "space" }], per_guest_tiers: [], minimums: [] }],
    });
    expect(violations.some((v) => v.includes("fixed_fees[0].day") && v.includes("someday"))).toBe(true);
  });

  it("returns no violations for a non-object input", () => {
    expect(validateShape(null)).toEqual([]);
    expect(validateShape(undefined)).toEqual([]);
    expect(validateShape("string")).toEqual([]);
  });
});
