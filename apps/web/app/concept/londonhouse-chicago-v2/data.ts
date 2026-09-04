/**
 * Golden record v2 for LondonHouse Chicago (vendor_id 506) — brings the page up to
 * golden-set-template.md's now-locked format, most of which was written after v1 shipped
 * (Diamond Garden's, Greenhouse Loft's, and Geraghty's builds, then applied back to
 * `galleria-marchetti-v4`). v1 stays frozen/untouched at `apps/web/app/concept/londonhouse-chicago/`
 * for comparison, same as v3/v2 stay frozen under Marchetti's later versions. Same underlying
 * venue data as v1 (spaces, packages, fees, FAQs, sourcing) — nothing here is re-researched from
 * the live site — except where a fact is called out below as newly restored or corrected.
 *
 * Structural changes in this pass (2026-08-26):
 * - **`indoorOutdoor` quickFacts icon key renamed to `setting`** — Diamond Garden's naming won
 *   (template §3); LondonHouse was still on the older key, same fix already applied to Marchetti.
 * - **Policies rows re-rendered as pills** (§2's Greenhouse Loft-derived row format: a short
 *   pill for the value, an optional detail line only where the pill alone doesn't cover a real
 *   nuance) instead of v1's plain left/right text row. A couple of rows picked up a genuinely
 *   useful detail line in the split (Parking's $80/night hotel rate, Bar's corkage-fee carve-out).
 * - **FAQ lists re-rendered to the locked bare-row format** (§2): full-width rows with their own
 *   bottom rule and a right-side chevron, no outer bordered box — v1 had the boxed-card-with-
 *   left-chevron look that predates this rule.
 * - **What's Included regrouped** from three ungrouped lists (Physical items / Services / Perks,
 *   each item a bare label with no detail) into the label+detail row format with small labeled
 *   subcategories (§2, Greenhouse Loft's fix): Furniture, Catering, Services, Perks. Every item
 *   now has a one-line detail instead of a bare label — "Tables" alone doesn't say what's real
 *   about the table setup the way "Tables: included for your reception" does. Labels standardized
 *   to match the rest of the golden set where the same concept already exists elsewhere
 *   (§2's cross-venue icon/label check) — "Hotel chairs" → "Chairs", "BBJ linen (choice of 30
 *   colors)" → "Linens" (detail keeps the BBJ/30-colors specifics), "Wedding coordinator" →
 *   "Coordinator" (matches Greenhouse Loft's exact label for the same role). `galleria-marchetti-v4`'s
 *   own header comment already assumed LondonHouse used "Linens"/Palette — this pass makes that
 *   true.
 * - **Restored "parent upgrades"** as a real Perks item. v1's file header (finding #5) documented
 *   three real overnight-accommodation perks — "complimentary suite for 60+ guest weddings,
 *   parent upgrades, discounted room block" — but only two ever made it into `includedPerks`. The
 *   third was a real, already-verified finding that just never got wired into the data; added
 *   here rather than re-researched.
 * - **Add-ons & extras converted to per-item cards** (§2, Field Museum/Greenhouse Loft shape:
 *   icon, name, price, one-line description) instead of v1's mixed chip-row + prose-paragraph
 *   layout. Each add-on here is one discrete real thing, not a menu of tiers, so the card shape
 *   (not a category+table) is the right one per §2's axis-counting rule. The ceremony fee is a
 *   real conditional add-on (only charged if the ceremony is held at the hotel) — named
 *   "On-site ceremony fee" so the condition reads in the item's own name, matching Marchetti's
 *   fix for the same kind of fee (§2).
 * - **Food & Beverage pills added.** v1's Food & Beverage section never rendered the BYO / À la
 *   carte / All-Inclusive pills §3 requires. Re-checked the wedding menu PDF and catering page
 *   directly (already-fetched sources, not a new fetch): no à la carte option exists for either
 *   food or bar, and food has no BYO option either, so Food correctly shows a single
 *   "All-Inclusive" pill. **Correction, 2026-08-27:** Bar was also first logged as
 *   All-Inclusive-only, but the corkage fee already sitting in this same file's `addOns` is
 *   itself proof of a real, if narrow, BYO exception (wine/liquor only) — the fee only makes
 *   sense as a fee for something the venue would otherwise not serve. Bar now correctly shows
 *   both All-Inclusive and BYO pills, additive per §3, and Food/Bar are split back into their
 *   own labeled subsections (collapsed into one row on 2026-08-27's earlier pass, when both
 *   looked identical — they no longer are once Bar's BYO fact is rendered).
 * - **Cost Estimate calculator: sales tax and service charge moved under their own "Taxes" group
 *   header** (§2's locked rule: "give the tax line its own group header row... don't let it just
 *   trail as the last line item under whatever group happens to render immediately above it"),
 *   instead of v1's shape where both lines sat inside the "Food & beverage" group with no header
 *   of their own. The food/bar charge itself now gets its own single-line "Food & beverage"
 *   group; venue rental, taxes, and the conditional ceremony fee are each their own group, same
 *   as every other golden-set venue's calculator.
 * - **Section order fixed**: v1 had Add-ons → Policies → Cost Estimate → FAQs; the locked
 *   canonical order (§1) is Add-ons → Cost Estimate → Policies → FAQs. Calculator moved up.
 * - **Video resource moved from About to Spaces.** The real YouTube video
 *   ("LondonHouse Wedding," the venue's own channel) isn't about any one specific space, but
 *   it's a "what does this look like" resource, which belongs with Space per §2's placement-by-
 *   topic rule, not with About (About's exception is for a document broad enough that no single
 *   section is a topical match — a wedding video doesn't meet that bar the way a consolidated
 *   brochure does). The brochure PDF stays linked from About; it genuinely spans Food & Beverage,
 *   Add-ons, and Policies at once.
 * - **Vendors section still correctly omitted.** Only one real named vendor exists (Bittersweet
 *   Bakery, wedding cake) — below §4's "≥2 real names" bar. Data stays in `preferredVendors`
 *   below, unused on the page, same as v1.
 *
 * Follow-up (2026-08-26, caught in review): the `ResourceLink` button (Brochure, Floor plan,
 * Video) was still v1's older, larger "D2 swatch" size (px-3.5/py-2, text-sm, 14px icon) —
 * visibly bigger than the compact button the rest of the golden set has since converged on
 * (Greenhouse Loft's catering-guidelines/service-agreement buttons, Marchetti v4's Brochure
 * button: px-3/py-1.5, text-xs, 13px icon). Resized to match — see page.tsx's `ResourceLink`.
 * Same pass also found `galleria-marchetti-v4` was missing the §3 Food & Beverage pills
 * entirely (fixed there, see that page's own data.ts/page.tsx comments).
 *
 * See v1's file header (`apps/web/app/concept/londonhouse-chicago/data.ts`, or git history) for
 * the original sourcing research: the wedding-menu-PDF corrections to the ceremony fee, real
 * tax/service-charge percentages, the three named package tiers, the hand-found venue FAQs, the
 * overnight-accommodations perk, the Bittersweet Bakery relationship, and the confirmation that
 * there's no separate reception venue-rental fee. None of that research changed in this pass.
 *
 * Feedback pass (2026-08-27), applied at each field above with its own dated comment:
 * - About rewritten to include the venue's own real "experienced wedding planning services"
 *   distinction alongside the views, since it's a genuine differentiator the venue leads with.
 * - Dropped the 5th quickFacts pill (Room block) — not distinctive enough to earn the slot.
 * - Food & Beverage section: deleted the two prose paragraphs under Food/Bar (redundant with
 *   the package cards below) and collapsed Food/Bar into a single pill row, since once the
 *   prose was gone both sides said the exact same thing (All-Inclusive, in-house only) — see
 *   page.tsx.
 * - Add-ons: "Not published" → "No published rate" (more descriptive); dropped the
 *   ceremony fee's "(+15.75% tax)" price suffix, since every add-on carries sales tax and the
 *   actual math now lives in the calculator, not the static card.
 * - What's Included: "Perks" category renamed "Lodging" (nondescript → concrete).
 * - Policies: Parking's pill changed from "Valet only" to "Not included" (parking itself isn't
 *   included; valet is the paid option, now in the detail line); Food & beverage minimum's
 *   pill changed from "Amount varies" to "Yes" (does a minimum apply — yes — with the actual
 *   variability in the detail line).
 * - Cost Estimate calculator: reordered so Ceremony (and now Add-ons) sit with the other real
 *   charges, taxes moved to one consolidated group at the bottom right before the total — see
 *   CostCalculator.tsx header for the reasoning.
 *
 * Second feedback pass, same day (2026-08-27) — catches a real research/consistency gap the
 * first pass introduced:
 * - **Bar corrected from "in-house only" to in-house + a real BYO carve-out.** The corkage fee
 *   was always in the data (`addOns`), but the first pass's Food/Bar collapse (above) treated
 *   Food and Bar as identical without checking whether a fee that only makes sense for BYO
 *   alcohol actually implies BYO is allowed. It does. `CORKAGE_NOTE` (defined once below) is now
 *   reused in Policies, standardFaqs, and the F&B section so the fact reads the same everywhere.
 *   **Rendering, third pass same day:** this round's first attempt split Food/Bar back into
 *   labeled subsections with a dedicated BYO pill for Bar — reverted per direct feedback ("i
 *   dont like this... think we can revert") as more structure than the one-fact caveat needed.
 *   Landed shape: Food & Beverage stays one plain pill row (All-Inclusive, In-house), with
 *   `CORKAGE_NOTE` as a small caption underneath — same weight/format as `horsDoeuvresNote`
 *   right below it (`text-xs text-gray-400`), not a full prose paragraph.
 * - quickFacts labels changed to colon style ("Catering: In-house", "Bar: In-house") to match
 *   Greenhouse Loft's existing convention ("Catering: BYO (open list)", "Bar: BYOB").
 * - Removed the on-page "two sources, see note" microcopy on each Space card (the grey "—" tile
 *   for the unstated seated-with-dance figure already communicates the gap on its own); the
 *   underlying `capacitySourceNote` sourcing detail stays in the data for provenance.
 * - Resource links (Brochure, Wedding menu, Floor plan/capacity chart, Video) converted from
 *   new-tab links to the shared `ResourceLightboxButton` in-page viewer — see page.tsx and
 *   `_shared/ResourceLightboxButton.tsx` for the embeddability checks behind this.
 */

// feedback 2026-08-27: a corkage fee only makes sense as a fee for something the venue
// otherwise wouldn't serve — its existence is itself proof the bar isn't strictly
// in-house-only, it's in-house *plus* a BYO carve-out for wine/liquor specifically. Written
// once here so Policies and pricing.corkageNote (used in the F&B section) state the same fact
// instead of each re-describing it slightly differently (v2's first pass called Bar "In-house
// only" in one row while its own detail line described a BYO exception — self-contradictory).
const CORKAGE_NOTE = "LondonHouse's own bar service is included in every package. Beyond that, you can bring your own wine or liquor for a $50/bottle corkage fee.";

export const londonhouse = {
  vendorId: 506,
  placeId: "ChIJS-Hf_a4sDogRmcrVlxAacIU",
  photoNames: [
    "places/ChIJS-Hf_a4sDogRmcrVlxAacIU/photos/AWCwydiUBF0DRXfUZ6IqGQ45MjNfc0UUhkpwwhwz1_EC2BXuzSFrZc_HY0qZM5RWNMQRasKfOq9lVU74uqMtGhmeO_4cA8AD31kNfZp2gcz9mF2L12J0oGlD7hxQ9vSm7HdfmesKXe1RHdlr_-XSSk4BW9MV9I0R0Ww5IqlLgfNScqH8qzhPsPMTliHM8LuXC768Xq7DxGNoVt8fJSD9IUkLZPtuk2CuirD-MbfvMO_cU_ylq04C1ytoqd_lBFVZx1aHJIL8dG4J9q20YYcHpUMGBFa6tqKWIi039rpVNcecLCLHVBW4NBascQNyhsVGZ5FoLKw0eZYG7kPlnKX1ISfVpHSiM6gg0u1FUCagwLXQbUMiDEq5Pn6iHbXZaQoMqNKoeVEBUe2rAV9Vq1xxbxGHjVkA7kNtLEfjB1kU7OyvyQBXVBs",
  ],
  // Found by hand, not the pipeline. Confirmed via YouTube's oEmbed API (no JS rendering
  // needed): titled "LondonHouse Wedding," published by the venue's own channel
  // (@londonhousechicago7413), not a third party. Real content, and this venue has no
  // Instagram real-wedding posts to lean on otherwise. Placed as a Spaces resource, not About
  // (see file header) — it's a "what does this look like" resource, not a broad consolidated
  // document.
  youtubeUrl: "https://www.youtube.com/watch?v=tAQ1JfyvG24",
  name: "LondonHouse Chicago",
  fullBrandName: "LondonHouse Chicago, Curio Collection by Hilton",
  categoryLabel: "Hotel Venue",
  address: "85 E Wacker Dr, Chicago, IL",
  neighborhood: "Loop",
  phone: "(312) 357-1200",
  website: "https://londonhousechicago.com/weddings",
  brochureUrl: "https://londonhousechicago.com/assets/uploads/documents/LHC_weddings_brochure.pdf",
  instagramHandle: "lhchicago",
  instagramUrl: "https://instagram.com/lhchicago",
  rating: 4.5,
  reviewCount: 6564,
  reviewCountNote: "Hotel-wide review count (stays + events combined), not wedding-specific.",
  // feedback 2026-08-27: About was missing a real distinction the venue's own site leads
  // with ("...with its unparalleled views of the city and experienced wedding planning
  // services") — added the planning-team fact (already backed by the Coordinator/Banquet
  // Captain facts in sharedIncludes below) alongside the views.
  about:
    "LondonHouse Chicago is a luxury hotel wedding venue that blends historic charm with modern luxury in the heart of Downtown Chicago. Its riverfront and skyline views set the scene, and an experienced in-house wedding planning team supports you from the first conversation through the big day.",
  photos: [
    "https://lh3.googleusercontent.com/place-photos/AJRVUZMjUhzCRNqzjCTcEZQTjMgd_JakUBtWfTcEdsxi_ec0nkVgXnvye3msGghzzg0s2HxLnJurJtC7xiAaYwEtTTSbzUs1iE3bd9leU31tV39opcjZyRW4Qe-V5a2QOo04TQZN0dAJd0qFVXq3iw=s4800-w1200",
    "https://lh3.googleusercontent.com/place-photos/AJRVUZOlylEF_vpzIPLs5F1fQAsodmoNG8xlOyji4NMtLZwwzAagwFsQfd3G4J2L90CrwcIF6RDOfzyPJIbiQp9oxkSMeESnA_R4xYsqZbMMtJWGoh-gNK2yoQPRh4ovLW7Pyv15-lRkRR8bFWmg=s4800-w1023",
    "https://lh3.googleusercontent.com/place-photos/AJRVUZN1q6Avo_ebaHuXZXvuaMXqOIU_2bmm22CZ3ZBIMBLcaETyYUcs_-BTWo_1esOfG7-PYyEIht-E2A1yo-XiuObet45IPWpOiF2a_6Uzl1qsMG0Xnx6kHIHcL3sSkgTx2m1vBWoUzmJel6rqiWU=s4800-w1024",
  ],
  capacityLabels: {
    seatedDining: "Seated",
    seatedWithDance: "Seated (w/ dance floor)",
    standingReception: "Cocktail (standing)",
  },
  // Heating/A/C checked directly on /amenities — not mentioned anywhere on the site. Left out
  // rather than assumed, even though "hotel ballroom" makes it a safe bet — same "don't invent"
  // standard as everything else here. "60–190" was misleading in the DB facts — those are two
  // different rooms' individual max capacities, not a real venue-wide min/max (there's no stated
  // minimum for either room). Just show the max.
  // Re-checked 2026-08-27 (§2's "check HVAC/ADA even after the main pass feels done" rule,
  // prompted directly: "think there's some known what's included with like a/c right?"):
  // re-fetched /amenities and /weddings (including its own FAQ accordion, which is where the
  // faqs[] list below actually lives — it's on this page, not a separate URL) directly. Neither
  // climate control/HVAC nor wheelchair accessibility/ADA is mentioned anywhere on either page.
  // Still correctly omitted from What's Included — "empty beats wrong" — not a fact we have.
  // feedback 2026-08-27: dropped the 5th "Room block" pill — not a distinctive-enough,
  // decision-relevant fact to earn the archetype-specific pill slot (§3); the room-block/
  // suite-upgrade facts still live in sharedIncludes' Lodging group below.
  quickFacts: [
    { icon: "guests", label: "Up to 190 guests" },
    { icon: "setting", label: "Indoor" },
    // feedback 2026-08-27: colon style matches Greenhouse Loft's quickFacts labels ("Catering:
    // BYO (open list)", "Bar: BYOB") — golden-set convention, not a LondonHouse-specific choice.
    { icon: "catering", label: "Catering: In-house" },
    { icon: "bar", label: "Bar: In-house" },
  ],
  // Re-verified 2026-08-27 ("is it really same cost for both spaces?"): /weddings states one
  // flat pricing structure ("Wedding packages range from $220 to $300 per person, plus tax and
  // service charge") with no room-specific rate mentioned anywhere on the page, matching the one
  // `packages` list below used for both spaces. The full wedding-menu PDF (14MB) is over
  // WebFetch's size limit to re-check directly, but nothing in any already-fetched source
  // suggests a per-room price split — the "same rate regardless of room" line in Spaces is real,
  // not assumed.
  spaces: [
    {
      name: "Juliette Grand Ballroom",
      level: "Level 3",
      sqFt: 3737,
      description: "With floor-to-ceiling windows, this column-free event space offers stunning views of the riverfront and city skyline.",
      capacity: { seatedDining: 190, seatedWithDance: null, standingReception: 350 },
      capacitySourceNote:
        "Seated: from the wedding page. Cocktail: from the venue's own capacity chart (\"Reception\" column), which also lists a higher seated figure (275) without a dance floor.",
      includesSummary: "Adjoins the 900 sq ft Grand Pre-Function space, typically used for cocktail hour.",
    },
    {
      name: "Étoile",
      level: "Level 21",
      sqFt: 1346,
      description: "Étoile offers an unparalleled setting for small weddings, rehearsal dinners, and brunches. This space features a private terrace with breathtaking views of the Chicago skyline.",
      capacity: { seatedDining: 60, seatedWithDance: null, standingReception: 100 },
      capacitySourceNote: "Seated: from the wedding page. Cocktail: from the capacity chart, which also lists a higher seated figure (90) without a dance floor.",
      includesSummary: "A private terrace (Étoile Terrace, 3,536 sq ft) for cocktail hour or photos.",
    },
  ],
  notableSpot: {
    name: "The Cupola",
    sqFt: 237,
    receptionMax: 15,
    description: "A 22-story rooftop landmark with a dramatic ring of columns and a domed top, popular for first-look photos and small gatherings, not a reception venue in its own right.",
  },
  capacityChartUrl: "http://londonhousechicago.com/assets/uploads/documents/LH_Capacity_Chart.pdf",
  // Real named tiers from Wedding_Menu_2026_LondonHouse.pdf — the DB never captured any of
  // this (assets[] pointed at the wrong PDF, a spa menu, for "menu_pdf").
  weddingMenuUrl: "https://londonhousechicago.com/assets/uploads/general/Wedding_Menu_2026_LondonHouse.pdf",
  packages: [
    {
      key: "elegance",
      name: "Elegance",
      perGuest: 220,
      bar: "Four-hour deluxe bar",
      inclusions: [
        "Four passed hors d'oeuvres",
        "Three-course plated dinner (soup or salad, choice of three entrées: poultry, fish, vegetarian)",
        "Wedding cake, champagne toast, wine service with dinner",
      ],
    },
    {
      key: "luxury",
      name: "Luxury",
      perGuest: 260,
      bar: "Five-hour premium bar",
      inclusions: [
        "Everything in Elegance",
        "Five passed hors d'oeuvres",
        "Four-course plated dinner (soup and salad, choice of three entrées, now including beef)",
      ],
    },
    {
      key: "opulence",
      name: "Opulence",
      perGuest: 300,
      bar: "Five-hour premium bar + one specialty cocktail",
      inclusions: ["Everything in Luxury", "One stationed item", "Tableside entrée service"],
    },
  ],
  horsDoeuvresNote: "Hors d'oeuvres selection spans both cold and warm options. Full list is in the wedding menu.",
  pricing: {
    ceremonyFee: 750,
    ceremonyFeeTaxPercent: 15.75,
    ceremonyFeeNote: "Only if the ceremony is held at the hotel. Includes use of the rehearsal space, not just the ceremony itself.",
    salesTaxPercent: 11.75,
    serviceChargePercent: 25,
    fbMinimum: "Amount determined by guest count and date.",
    // feedback 2026-08-27: every add-on is subject to sales tax, same as food & beverage —
    // worth a real number here so the calculator can tax a selected add-on (corkage) at the
    // general rate rather than leaving it untaxed. The ceremony fee's own rate (15.75%,
    // above) is genuinely different/higher and stays its own field.
    corkagePerBottle: 50,
    corkageNote: CORKAGE_NOTE,
  },
  // Restructured to per-item cards (§2, Field Museum/Greenhouse Loft shape) — each of these is
  // one discrete real thing, not a menu of tiers, so a card reads better than a table here.
  // Corkage and the ceremony fee moved in from their old standalone "Situational fees" prose
  // block; the ceremony fee is a real conditional add-on, so its name states the condition
  // directly ("On-site ceremony fee") rather than leaving it as a bare, unlabeled line item.
  // feedback 2026-08-27: "Not published" wasn't descriptive enough on its own (read like a
  // missing-data placeholder rather than a real fact about the venue) — changed to "No
  // published rate" so it's clear this is what LondonHouse itself discloses, not a sourcing
  // gap. Also dropped the "(+15.75% tax)" suffix from the ceremony fee's price: every add-on
  // carries sales tax, so calling it out only here read as a one-off; the actual tax math now
  // lives in the Cost Estimate calculator instead (see CostCalculator.tsx).
  addOns: [
    { name: "Pre-reception snacks", price: "No published rate", blurb: "Available per LondonHouse's own FAQ page; no pricing published." },
    { name: "Late-night snacks", price: "No published rate", blurb: "Available per LondonHouse's own FAQ page; no pricing published." },
    { name: "Corkage fee", price: "$50/bottle", blurb: "For wine or liquor you bring yourself, beyond the bar already included in your package." },
    { name: "On-site ceremony fee", price: "$750", blurb: "Only if the ceremony is held at the hotel. Includes use of the rehearsal space, not just the ceremony itself." },
  ],
  // Restructured (§2, Greenhouse Loft's fix) from three ungrouped flat lists of bare labels
  // into label+detail rows under small subcategories. Labels standardized to match the rest of
  // the golden set where the same concept already exists elsewhere — see file header.
  sharedIncludes: [
    {
      category: "Furniture",
      items: [
        { label: "Tables", detail: "Included for your reception" },
        { label: "Chairs", detail: "Hotel chairs, included" },
        { label: "Dance floor", detail: "Included" },
        { label: "Stage", detail: "A stage for a live band" },
        { label: "Linens", detail: "BBJ linen, your choice of 30 colors" },
      ],
    },
    {
      category: "Catering",
      items: [{ label: "Wedding cake", detail: "A custom cake from Bittersweet Bakery, Chicago" }],
    },
    {
      category: "Services",
      items: [
        { label: "Coordinator", detail: "A wedding coordinator supports you from first contact through the event" },
        { label: "Banquet Captain", detail: "Manages food & beverage service on the wedding day" },
      ],
    },
    {
      // feedback 2026-08-27: "Perks" was nondescript; every item here is actually a lodging
      // benefit (suite upgrade, room block), so name the group after what it concretely is.
      category: "Lodging",
      items: [
        { label: "Complimentary suite", detail: "2 nights for the couple, on weddings over 60 guests" },
        // Restored (§ file header) — a real, already-verified finding from v1's own header
        // comment that never made it into the rendered data.
        { label: "Parent upgrades", detail: "Room upgrades for parents, on top of the couple's complimentary suite" },
        { label: "Room block", detail: "Discounted rates for your guests" },
      ],
    },
  ],
  // Canonical 13-row checklist, same order/wording as every other golden-set venue. Re-rendered
  // as pills below (§2); a couple of rows picked up a real detail line in the split rather than
  // staying one long sentence crammed into the pill itself.
  // Ordered by decision priority, not topic grouping: financial/dealbreaker items first
  // (catering, bar, and every real cost driver), then risk/compliance, then day-of logistics
  // last — roughly the order a couple would actually want to triage these in.
  policies: [
    { label: "Catering", value: "In-house only", stated: true },
    // feedback 2026-08-27: "In-house only" contradicted the corkage detail sitting right next
    // to it — a corkage fee is a real BYO carve-out for wine/liquor, so "only" was wrong.
    { label: "Bar", value: "In-house", detail: CORKAGE_NOTE, stated: true },
    { label: "Venue rental charge type", value: "No separate fee", detail: "Included in the per-guest package price, same rate regardless of which space you book.", stated: true },
    // feedback 2026-08-27: "Amount varies" as the pill made it unclear whether a minimum even
    // applies — led with "Yes" (it does) and moved the "varies by guest count/date" nuance to
    // the detail line, matching the simple-pill-then-nuance shape the rest of the section uses.
    { label: "Food & beverage minimum", value: "Yes", detail: "Amount varies by guest count and date. Ask directly for a number.", stated: true },
    { label: "Service charge", value: "25%", detail: "On all food & beverage.", stated: true },
    // feedback 2026-08-27: "Valet only" read as if parking is available/covered — the real
    // answer is that self-parking isn't offered and valet isn't complimentary, so the pill now
    // leads with "Not included" and the valet option/rate moves to the detail line.
    { label: "Parking", value: "Not included", detail: "Valet only, at the standard hotel rate ($80/night). No wedding-day rate published.", stated: true },
    { label: "Day-of coordinator", value: "Not required", detail: "LondonHouse provides a wedding coordinator plus a Banquet Captain on the day.", stated: true },
    { label: "Payment schedule", value: "Not stated (please confirm)", stated: false },
    { label: "Cancellation / rescheduling", value: "Not stated (please confirm)", stated: false },
    { label: "Event insurance", value: "Not stated (please confirm)", stated: false },
    { label: "Security", value: "Not stated (please confirm)", stated: false },
    { label: "Vendor access (setup/teardown)", value: "Not stated (please confirm)", stated: false },
    { label: "Noise curfew", value: "Not stated (please confirm)", stated: false },
  ],
  // Correctly excluded from the page (§4's ≥2-real-names bar) — one real relationship is known
  // (the cake), just wasn't filed as a vendor by the original extraction. Kept here in case a
  // future pass finds more.
  preferredVendors: {
    requirementNote: "Preferred, not required, per the venue's own wording. You're free to bring your own vendors for these categories.",
    categories: [
      { category: "Music" },
      { category: "Florals" },
      { category: "Wedding cake", known: { name: "Bittersweet Bakery", location: "Chicago" } },
      { category: "AV" },
    ],
    categoriesNote: "No names published for Music, Florals, or AV. Ask directly.",
  },
  // Locked to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. The dropped parking question is still answered in Policies.
  standardFaqs: [
    { question: "Can we bring our own caterer, or does it have to be from an approved list?", answer: "In-house only. LondonHouse's own catering team handles all food & beverage." },
    // feedback 2026-08-27: fixed a self-contradiction ("no BYO option, though a corkage fee
    // applies if you supply your own..." — that's a BYO option, just a fee-gated one).
    { question: "Can we bring our own alcohol?", answer: `Not fully. ${CORKAGE_NOTE}` },
    { question: "Is there a food & beverage minimum?", answer: "Yes. The amount is determined by guest count and date. Ask directly for specifics." },
    { question: "Do we need to hire our own day-of coordinator?", answer: "No. LondonHouse provides a wedding coordinator for planning support and a Banquet Captain to manage service on the wedding day." },
    { question: "Is event insurance required?", answer: "Not stated on their site. Confirm directly with the venue." },
  ],
  // Real, found by hand on the live site — not a crawl-coverage gap the venue itself is honest
  // about, a gap on our side.
  faqsPublished: true,
  faqCoverageNote: "These exist on the live site but weren't captured by the current pipeline (likely a JS-rendered accordion the HTTP-only crawler can't see). Added by hand here.",
  faqs: [
    {
      question: "What's the price range for a wedding and what fees should we expect?",
      answer: "Wedding packages range from $220 to $300 per person, plus tax and service charge. Common add-ons are pre-reception and late-night snacks. If the ceremony is held at the hotel, there is a $500 ceremony fee.",
      answerNote: "Venue FAQ says $500, but wedding menu PDF says $750 (we use the max so there's no surprises).",
    },
    {
      question: "What's included in the wedding packages?",
      answer: "We include tables, hotel chairs, a dance floor, a stage for a band, as well as BBJ linen with a choice of 30 colors, and a custom-designed wedding cake from Bittersweet, located in Chicago.",
    },
    {
      question: "How many guests can your spaces comfortably host?",
      answer: "We have 25,000 square feet of catering, social, and event space. Whether you want an intimate celebration or a grand reception, you can choose the ideal layout for your needs. Our event spaces host as few as 15 guests to upwards of 300, depending on your chosen seating arrangement.",
    },
    {
      question: "Is there a food and beverage minimum?",
      answer: "Yes. This will be determined based on the number of guests you are anticipating and the date you select.",
    },
    {
      question: "Do you provide a Coordinator or a Banquet Captain?",
      answer: "Yes, we provide both. From the moment you contact us, through planning the details and on your wedding day, our Director of Weddings will be with you each step of the way. Our Banquet Captain will also assist on the day of the wedding.",
    },
  ],
  sourcePages: [
    "https://londonhousechicago.com/weddings",
    "https://londonhousechicago.com/catering",
    "https://londonhousechicago.com/amenities",
    "https://londonhousechicago.com/assets/uploads/general/Wedding_Menu_2026_LondonHouse.pdf",
    "http://londonhousechicago.com/assets/uploads/documents/LH_Capacity_Chart.pdf",
  ],
  lastVerified: "2026-08-26",
};

export type Londonhouse = typeof londonhouse;
