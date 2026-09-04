/**
 * Golden record for LondonHouse Chicago (vendor_id 506), built 2026-08-13, revised same day
 * after reading the actual wedding menu PDF (Wedding_Menu_2026_LondonHouse.pdf) directly,
 * which the pipeline had never captured at all — see file header note in the first version
 * of this file (git history) for the original findings. This revision corrects several
 * things the first pass got wrong or left vague once the real PDF text was available.
 *
 * New corrections (second pass, from the real wedding menu PDF):
 *
 * 1. Ceremony fee was wrong: DB / first draft said $500. The PDF states $750 plus 15.75%
 *    sales tax, and clarifies it includes rehearsal space (not just the ceremony itself).
 * 2. Real percentages exist for tax/service charge — first draft said "not published."
 *    The PDF states: 11.75% sales tax + 25% service charge on all food & beverage, a 3% City
 *    of Chicago tax on a la carte soft drinks, and a $50/bottle corkage fee for
 *    client-supplied wine/liquor.
 * 3. The three real named package tiers are Elegance ($220), Luxury ($260), and Opulence
 *    ($300) — the first draft only had a price range, no tier structure.
 * 4. Venue-specific FAQs DO exist — found by hand on the live site. The empty `faqs: []` in
 *    `venue_enrichment` isn't "this venue has none," it's a crawl/render gap (same class of
 *    problem as Marchetti's floor plans, just a different mechanism — likely a JS-rendered
 *    accordion the HTTP-only crawler can't see, the exact limitation the 2026-08 data-plane
 *    audit already flagged: "no Playwright fallback on beta").
 * 5. A real overnight-accommodations perk exists (complimentary suite for 60+ guest
 *    weddings, parent upgrades, discounted room block) — not captured anywhere.
 * 6. One real preferred-vendor relationship IS known, just not filed under `network_vendors`:
 *    the wedding cake is from Bittersweet Bakery (Chicago), already present in
 *    `included_inventory`. The "no real vendors" framing from the first pass was too broad —
 *    it's "no *published list*," not "we know nothing."
 * 7. Confirmed there's no separate reception venue-rental fee: searched the raw text of the
 *    wedding menu PDF directly (not just the HTML page) for "rental," "facility fee," "site
 *    fee," "room fee" — the only hit anywhere in the document is the $750 ceremony fee itself
 *    ("a rental fee of $750... inclusive of rehearsal space"). Reception room use is genuinely
 *    bundled into the per-guest package price, same rate regardless of which space is booked —
 *    unlike Marchetti, which has a distinct flat venue-rental fee per space per day. Not a gap
 *    on our end; a real structural difference in how this venue prices weddings.
 */

export const londonhouse = {
  vendorId: 506,
  placeId: "ChIJS-Hf_a4sDogRmcrVlxAacIU",
  photoNames: [
    "places/ChIJS-Hf_a4sDogRmcrVlxAacIU/photos/AWCwydiUBF0DRXfUZ6IqGQ45MjNfc0UUhkpwwhwz1_EC2BXuzSFrZc_HY0qZM5RWNMQRasKfOq9lVU74uqMtGhmeO_4cA8AD31kNfZp2gcz9mF2L12J0oGlD7hxQ9vSm7HdfmesKXe1RHdlr_-XSSk4BW9MV9I0R0Ww5IqlLgfNScqH8qzhPsPMTliHM8LuXC768Xq7DxGNoVt8fJSD9IUkLZPtuk2CuirD-MbfvMO_cU_ylq04C1ytoqd_lBFVZx1aHJIL8dG4J9q20YYcHpUMGBFa6tqKWIi039rpVNcecLCLHVBW4NBascQNyhsVGZ5FoLKw0eZYG7kPlnKX1ISfVpHSiM6gg0u1FUCagwLXQbUMiDEq5Pn6iHbXZaQoMqNKoeVEBUe2rAV9Vq1xxbxGHjVkA7kNtLEfjB1kU7OyvyQBXVBs",
  ],
  // Found by hand, not the pipeline (same "no video field in schema at all" gap as floor
  // plans/add-ons). Confirmed via YouTube's oEmbed API (no JS rendering needed): titled
  // "LondonHouse Wedding," published by the venue's own channel (@londonhousechicago7413),
  // not a third party. Real content, and this venue has no Instagram real-wedding posts to
  // lean on otherwise.
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
  about:
    "LondonHouse Chicago is a luxury hotel wedding venue offering elegant spaces that blend historic charm with modern luxury. Located in the heart of Downtown Chicago, it features stunning riverfront and skyline views, perfect for intimate or grand celebrations.",
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
  // Heating/A/C checked directly (WebFetch on /amenities, 2026-08-13) — not mentioned
  // anywhere on the site. Left out rather than assumed, even though "hotel ballroom" makes
  // it a safe bet — same "don't invent" standard as everything else here.
  // "60–190" was misleading — those are two different rooms' individual max capacities, not
  // a real venue-wide min/max (there's no stated minimum for either room). Just show the max.
  quickFacts: [
    { icon: "guests", label: "Up to 190 guests" },
    { icon: "indoorOutdoor", label: "Indoor" },
    { icon: "catering", label: "Catering in-house" },
    { icon: "bar", label: "Bar in-house" },
    { icon: "hotel", label: "Room block", note: "Complimentary 2-night suite for the couple on weddings over 60 guests; discounted room block rates for guests." },
  ],
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
  },
  // New section, matching Marchetti v2's Add-ons & extras. Thinner here — that's honest, not
  // a gap on our end this time: the wedding menu PDF genuinely doesn't itemize pricing for
  // these the way Marchetti's experiences menu does.
  addOns: [
    { name: "Pre-reception snacks", price: "Not published" },
    { name: "Late-night snacks", price: "Not published" },
  ],
  addOnsNote: "Mentioned as available on the venue's own FAQ page; no pricing published for either.",
  corkageFee: "$50 per bottle for client-supplied wine or liquor.",
  includedInventory: ["Tables", "Hotel chairs", "Dance floor", "Stage for a band", "BBJ linen (choice of 30 colors)", "Custom wedding cake from Bittersweet Bakery"],
  includedServices: [
    { name: "Wedding coordinator", note: "Planning support from first contact through the event" },
    { name: "Banquet Captain", note: "Manages food & beverage service on the wedding day" },
  ],
  // Was only in quickFacts before — a real conditional perk belongs here too, not just a
  // skimmable pill up top.
  includedPerks: [
    { name: "Complimentary suite", note: "2 nights for the couple, on weddings over 60 guests" },
    { name: "Room block", note: "Discounted rates for your guests" },
  ],
  // Expanded from the original 5 after a direct check of the catering page confirmed none of
  // the new categories are published anywhere. Adding them anyway is the point: surfacing the
  // right question is real product value even with an honest "not stated" answer — it primes
  // a couple to ask before signing, which a bare venue listing never does.
  // Ordered by decision priority, not topic grouping: financial/dealbreaker items first
  // (catering, bar, and every real cost driver), then risk/compliance, then day-of logistics
  // last — roughly the order a couple would actually want to triage these in.
  policies: [
    { label: "Catering", value: "In-house only", stated: true },
    { label: "Bar", value: "In-house only", stated: true },
    { label: "Venue rental charge type", value: "No separate fee (included in per-guest package)", stated: true },
    { label: "Food & beverage minimum", value: "Amount determined by guest count and date", stated: true },
    { label: "Service charge", value: "25% on food & beverage", stated: true },
    { label: "Parking", value: "Valet only (no wedding-day rate published; $80/night hotel)", stated: true },
    { label: "Day-of coordinator", value: "Not required (venue provides one)", stated: true },
    { label: "Payment schedule", value: "Not stated (please confirm)", stated: false },
    { label: "Cancellation / rescheduling", value: "Not stated (please confirm)", stated: false },
    { label: "Event insurance", value: "Not stated (please confirm)", stated: false },
    { label: "Security", value: "Not stated (please confirm)", stated: false },
    { label: "Vendor access (setup/teardown)", value: "Not stated (please confirm)", stated: false },
    { label: "Noise curfew", value: "Not stated (please confirm)", stated: false },
  ],
  // Corrected from "no real vendors" — that conflated "no published list" with "we know
  // nothing." One real relationship is known (the cake), just wasn't filed as a vendor.
  preferredVendors: {
    // The venue's own wedding page: "LondonHouse works with a list of preferred wedding
    // vendors, which helps ensure quality across services." Preferred, never framed as
    // required anywhere on the site. Ordered by what a couple typically prioritizes booking
    // (music first, AV last since it's a technical/logistics category, not a vendor a couple
    // chooses emotionally — distinct from "Music," which covers the DJ/band itself). Covers
    // only these categories, checked directly, not a crawl gap: no mention anywhere of
    // photography, videography, or hair & makeup.
    requirementNote: "Preferred, not required, per the venue's own wording. You're free to bring your own vendors for these categories.",
    categories: [
      { category: "Music" },
      { category: "Florals" },
      { category: "Wedding cake", known: { name: "Bittersweet Bakery", location: "Chicago" } },
      { category: "AV" },
    ],
    categoriesNote: "No names published for Music, Florals, or AV. Ask directly.",
  },
  // Standardized (2026-08-25) to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. The dropped parking question is still answered in Policies.
  standardFaqs: [
    { question: "Can we bring our own caterer, or does it have to be from an approved list?", answer: "In-house only. The hotel's own catering team handles all food & beverage." },
    { question: "Can we bring our own alcohol?", answer: "In-house only. The hotel's own bar service handles all alcohol; there's no BYO option." },
    { question: "Is there a food & beverage minimum?", answer: "Yes. The amount is determined by guest count and date. Ask directly for specifics." },
    { question: "Do we need to hire our own day-of coordinator?", answer: "No. LondonHouse provides a wedding coordinator for planning support and a Banquet Captain to manage service on the wedding day." },
    { question: "Is event insurance required?", answer: "Not stated on their site. Confirm directly with the venue." },
  ],
  // Real, found by hand on the live site (see file header #4) — not a crawl-coverage gap the
  // venue itself is honest about, a gap on our side.
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
  lastVerified: "2026-08-13",
};

export type Londonhouse = typeof londonhouse;
