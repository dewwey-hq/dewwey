/**
 * Golden record v3 for Galleria Marchetti (vendor_id 7) — ports the design/content standards
 * established while building LondonHouse Chicago's page (canonical Policies checklist,
 * grouped Cost Estimate subtotals, tighter FAQ phrasing) onto Marchetti's data. v2 stays
 * frozen/untouched for comparison. Content is otherwise identical to v2 — same spaces,
 * packages, add-ons, real Instagram posts, and photographer list, since none of that was
 * about a data problem, just presentation standards that hadn't existed yet when v2 was built.
 *
 * New in this pass (2026-08-14):
 * - Policies expanded from 5 rows to the same 12-row canonical checklist LondonHouse uses,
 *   in the same decision-priority order. Two rows are real, newly-added facts: "Service
 *   charge" (25% on food & beverage — already tracked in `additionalCosts` but never had a
 *   matching Policies row, an inconsistency flagged during LondonHouse's build) and "Parking"
 *   (checked directly against galleriamarchetti.com during v2's build — not published there, deliberately
 *   left out of quickFacts at the time; now surfaced honestly as "not stated" in Policies,
 *   which is exactly the checklist's job). The rest (F&B minimum, Day-of coordinator,
 *   Cancellation/rescheduling, Security, Vendor access) are placeholders, not yet verified
 *   against the live site the way LondonHouse's were — a real follow-up, not done in this pass.
 * - Cost Estimate now groups line items into Venue and Food & Beverage subtotals (see
 *   CostCalculator.tsx), matching LondonHouse's grouped table.
 * - standardFaqs phrasing tightened to match LondonHouse's couple-voiced question style.
 */

const capacityLabels = {
  seatedDining: "Seated",
  seatedWithDance: "Seated (w/ dance floor)",
  standingReception: "Cocktail (standing)",
};

export const marchetti = {
  vendorId: 7,
  placeId: "ChIJudKeYtIsDogRfWhiR7GzovE",
  photoNames: [
    "places/ChIJudKeYtIsDogRfWhiR7GzovE/photos/AWCwydjlzyMpRuNtfCp9VC3VFmuRig5DiIRe0_828W8vItEjA_pf8dxUeUfQjL5YUuS2vGuGzv3ZezbM4CAuLRqRAPrCPxcIRp8cJWYUVqf_vq-bKSqXkA9M1M8-fOYpFKqCsrf0BsVxZ8qqttS_KTE1TXeZJQFQu62nlWaXsuAuSXnW72sHYunvaASggfusPfeIkZKNgDmf11MxiKq4Ju7HiyKUWsf5Kepm5fYG8i5d7V9myGeNGpImf_CHG4XW_S9zMqjZ520Qofhu3wUdbIsO9JWQtlvgRB-oVEgJhCUB56bBJSQYrtXhxl4rkRs74ArwCXaGpc8HDxvZExSz6GiaCpIpvtOQNuYSHtAgCHzOOhq0IDO2xcm3uZAv156fcTwVP-A8EEl_odLe_ZDH9DG5DmvW9ETanic0ojZdHckq7yJweN08JsKYAf85y-KCgS8s",
  ],
  name: "Galleria Marchetti",
  categoryLabel: "Event Space",
  address: "825 W Erie St, Chicago, IL",
  neighborhood: "River West",
  phone: "(312) 563-0495",
  website: "https://www.galleriamarchetti.com/",
  instagramHandle: "galleriamarchetti",
  instagramUrl: "https://www.instagram.com/galleriamarchetti",
  rating: 4.5,
  reviewCount: 379,
  about: "Galleria Marchetti is a garden oasis in the heart of Chicago, offering a timeless setting for weddings of every size. With two distinct event spaces, this enchanting urban oasis features elegant indoor spaces and romantic courtyards that adapt seamlessly to your vision.",
  photos: [
    "https://lh3.googleusercontent.com/place-photos/AJRVUZOIQUSzUtRwcoKwkNC3H58BCtvHkBfVU2IJUeKrZ-u8q5mJl_5W7-tqKNYNN6h3Sd_m_DDI70z1-y8v07nzvU1QhCp6CveBG9yoZfGNCjGP02QYIEVbiPzoksv7WHqGeVPq3aDtJQW5uWcrUHZ8RrgkKw=s4800-w1200",
    "https://lh3.googleusercontent.com/place-photos/AJRVUZO7R5qvBCPYgxrPOL20pNbIxBn9LBUR6krb4CgCt6hkB3hKeQ-LcGWarhqVvzGb1_qfracDCgMU_NUeXzvrnbaKtKjrk_HYfehhHqe7XfZcuQxV1dX0zX4fbp531PFOSvmPPlmDm2mtZhCg=s4800-w1200",
    "https://lh3.googleusercontent.com/place-photos/AJRVUZMdg1u2tPOQrX-fpKliwLqOncttYXU1U7nrixKuPVecz60qEGGhILYRxHdc36CPkFiIPF6fylif3SsH9c3jzTrx9uqGI6ev5lkH6l5V4ISrzjybh6c-IpnQdZCVK8zcimIxGgjghchv2Qisbpo=s4800-w1200",
  ],
  // Parking deliberately dropped from quickFacts: it's only in the Google Places listing, not
  // stated anywhere on galleriamarchetti.com — per feedback, if it's not on the venue's own
  // site, don't show it as a fact here (Places/reviews aren't trusted as a source for this).
  // Now surfaced honestly in Policies as "not stated" instead of silently omitted everywhere.
  // `icon` is a lookup key resolved to a lucide icon in page.tsx (data files shouldn't import JSX).
  // Guest pill: "180-450" was two different rooms' individual maxes presented as if it were
  // one venue-wide min-max range (same issue caught and fixed on LondonHouse's "60-190" pill).
  // No venue-wide minimum is published, so just show the max, consistent with LondonHouse.
  // Catering/bar split into two pills, also matching LondonHouse's convention.
  quickFacts: [
    { icon: "guests", label: "Up to 450 guests", note: "Across two bookable spaces; more if you book the entire venue. No minimum guest count published." },
    { icon: "indoorOutdoor", label: "Indoor & outdoor", note: "Both spaces combine a tented/glass-enclosed room with an open-air courtyard or retractable roof." },
    { icon: "catering", label: "Catering in-house", note: "No outside caterer option. Food comes from the venue's own kitchen." },
    { icon: "bar", label: "Bar in-house" },
    { icon: "climate", label: "Heating & A/C", note: "Climate-controlled year-round in both spaces." },
  ],
  capacityLabels,
  entireVenueFees: [
    { day: "Friday", amount: 6000 },
    { day: "Saturday", amount: 9000 },
    { day: "Sunday", amount: 3000 },
  ],
  spaces: [
    {
      name: "The Pavilion",
      sqFt: 6000,
      // Verbatim from the venue's own site (galleriamarchetti.com/thepavilion) — the comma is theirs.
      description:
        "The larger of our two venues, is our three-space option featuring a lush courtyard, a beautiful old-world anteroom, and a state-of-the-art 6,000 sq ft tented ballroom with lighting, heating, and air conditioning.",
      includesSummary: "Il Cortile (courtyard), the tented ballroom, and the Montecatini Room (3,000 sq ft).",
      capacity: { seatedDining: 450, seatedWithDance: 375, standingReception: 900 },
      fees: [
        { day: "Friday", amount: 4000 },
        { day: "Saturday", amount: 6000 },
        { day: "Sunday", amount: 2000 },
      ],
      floorPlans: [
        { label: "East Courtyard: Ceremony & Cocktail Hour", imageUrl: "https://framerusercontent.com/images/IaDlK3og22dGjetrJJ2mYXMl7zA.jpg?width=792&height=612" },
        { label: "Dance Floor with Stage", imageUrl: "https://framerusercontent.com/images/NLtiiAwoPXzUn41RZttyAmSSLe0.jpg?width=792&height=612" },
        { label: "Banquet, With Stage", imageUrl: "https://framerusercontent.com/images/2pDBev1QBf1fmdQo2FJkvtkVeM.jpg?width=792&height=612" },
      ],
      sourceUrl: "https://www.galleriamarchetti.com/thepavilion",
    },
    {
      name: "La Pergola",
      sqFt: 3000,
      description:
        "Our intimate venue features a 3,000 sq ft glass-enclosed ballroom with Moroccan brass sconces, travertine flooring, heating, air conditioning, and a motorized retractable roof, creating a warm and elegant setting for unforgettable events.",
      includesSummary: "The Lucca Room (1,500 sq ft) and The Wedding Salon getting-ready space.",
      capacity: { seatedDining: 180, seatedWithDance: 150, standingReception: 250 },
      fees: [
        { day: "Friday", amount: 2000 },
        { day: "Saturday", amount: 3000 },
        { day: "Sunday", amount: 1000 },
      ],
      floorPlans: [
        { label: "Banquet Setup", imageUrl: "https://framerusercontent.com/images/EG7ddnTJ3taJz3T2B6s8KJE3Ws.jpg?width=792&height=612" },
        { label: "Cocktail Setup", imageUrl: "https://framerusercontent.com/images/yNcIWBw9Ef6t6w56lPqRmqwRa9E.jpg?width=792&height=612" },
        { label: "Reception with Dance Floor", imageUrl: "https://framerusercontent.com/images/inbGCvAhjXJgHr4HIdFLUCivSws.jpg?width=792&height=612" },
        { label: "Ceremony", imageUrl: "https://framerusercontent.com/images/dXRjrbrzVeZlH3vmo56egUhlvtQ.jpg?width=792&height=612" },
      ],
      sourceUrl: "https://www.galleriamarchetti.com/thepavilion",
    },
  ],
  // v1-style cards restored — comparison table was rejected as confusing.
  packages: [
    {
      key: "argento",
      name: "Argento",
      perGuest: 190,
      bar: "Villa Bar (5 hr)",
      inheritsFrom: null,
      inclusions: ["Four passed hors d'oeuvres", "Passed white wine & sparkling wine", "Tableside wine service & sparkling toast", "Three-course dinner", "Floor-length linens"],
    },
    {
      key: "oro",
      name: "Oro",
      perGuest: 235,
      bar: "Tenuta Bar (5 hr)",
      // "Everything in X" pulled out of the bullet list into its own field — it was reading
      // as just another checklist item, same rose-dot marker as everything else, instead of
      // the "inherits from" framing it actually is (see Clay's pricing page for the pattern).
      inheritsFrom: "Argento",
      inclusions: ["One signature cocktail", "One signature moment", "One chef experience", "Stage & Chiavari chairs"],
    },
    {
      key: "platino",
      name: "Platino",
      perGuest: 280,
      bar: "Riserva Bar (5 hr)",
      inheritsFrom: "Oro",
      inclusions: ["Two signature cocktails", "Two signature moments", "Two chef experiences", "Late-night Neapolitan pizza station", "Dance floor"],
    },
  ],
  additionalCosts: {
    productionFeePercent: 25,
    // Not published on the venue's own site (which just says "sales tax will be added").
    // This is Chicago's standard restaurant/prepared-food tax rate — a public, government
    // rate, not venue-specific, and the same figure LondonHouse's own site states for the
    // identical purpose. Used here so users always see a full, tax-inclusive number rather
    // than a silently understated one; flagged as inferred, not confirmed for this venue.
    salesTaxPercent: 11.75,
  },
  // Real "Wedding Experiences" add-on menu — condensed with example items per category so a
  // price isn't just an abstract number, without dumping the full published list.
  experiences: [
    {
      category: "Garden Aperitivo Hour",
      blurb: "Elevate cocktail hour with the warmth of an Italian aperitivo.",
      tiers: [
        { name: "Signature Moments", price: "$12/guest", examples: ["Aperol Spritz Bar", "Limoncello Spritz Bar"] },
        { name: "Signature Experiences", price: "$20/guest", examples: ["Antipasti Station", "Live Fire Skewer Station"] },
      ],
    },
    {
      category: "Chef Experiences",
      blurb: "Interactive, chef-attended culinary moments during cocktail hour.",
      tiers: [{ name: "Chef Experiences", price: "$40/guest", examples: ["Coastal Crudo & Sushi Experience", "Wood-Fired Beef Tagliata Station"] }],
    },
    {
      category: "Late Night Experiences",
      blurb: "Keep the celebration going after dinner.",
      tiers: [
        { name: "Signature Moments", price: "$12/guest", examples: ["Italian Gelato Cart", "S'mores Station"] },
        { name: "Signature Experiences", price: "$20/guest", examples: ["Neapolitan Pizza Station", "Chicago Station"] },
      ],
    },
  ],
  // Rentals/enhancements — re-verified directly against the live weddings page (2026-08-14).
  // The old collapsed "$625–$1,000" ranges were actively misleading: dance floor and bistro
  // lights each have named variants at fixed prices, not a fuzzy range, and the previous
  // Pavilion bistro-lights range ($1,400–$4,400) skipped two real price points entirely
  // (7-swag vs 13-swag options). Restructured as category + variant, one flat table can't
  // represent this correctly.
  enhancements: [
    {
      category: "Dance floor",
      variants: [
        { name: "White", pergola: "$625", pavilion: "$1,725" },
        { name: "Black & white", pergola: "$1,000", pavilion: "$2,500" },
      ],
    },
    {
      category: "Bistro lights",
      variants: [
        { name: "Standard", pergola: "$1,250", pavilion: "$1,400 (7 swags) / $2,200 (13 swags)" },
        { name: "With faux greenery", pergola: "$2,250", pavilion: "$2,500 (7 swags) / $4,400 (13 swags)" },
      ],
    },
    {
      category: "Chiavari chairs",
      variants: [{ name: null, pergola: "$10 each", pavilion: "$10 each" }],
    },
    {
      category: "Stage",
      note: "Includes black skirting and stairs.",
      variants: [{ name: null, pergola: "$175 / 4×8 section", pavilion: "$175 / 4×8 section" }],
    },
  ],
  // Canonical checklist ported from LondonHouse's build, same decision-priority order:
  // financial/dealbreaker items first, then risk/compliance, then day-of logistics last.
  // "Service charge," "Venue rental," and "Parking" are real, confirmed facts; the rest are
  // honest placeholders not yet verified against the live site (see file header).
  // Label standardized to "Service charge" to match LondonHouse's Policies row — Policies is
  // our standardized checklist, so it uses our own consistent language rather than each
  // venue's own term. (Marchetti's site actually calls it a "production fee" — exact wording:
  // "A 25% taxable production fee will be added to all food and beverage items to cover
  // service & support staff" — that real term still shows up in the F&B section prose
  // elsewhere on this page, just not here.)
  // Kept distinct from "Venue rental" below, which is a genuinely different thing (the cost
  // of the space itself, not a F&B surcharge) — Marchetti has both as real, separate line
  // items; LondonHouse only has the surcharge, since its venue rental is bundled into the
  // per-guest package (see LondonHouse's own "Venue rental" Policies row).
  policies: [
    { label: "Catering", value: "In-house only", stated: true },
    { label: "Bar", value: "In-house only", stated: true },
    { label: "Venue rental charge type", value: "Flat per-day fee (see Spaces)", stated: true },
    { label: "Food & beverage minimum", value: "Not stated (please confirm)", stated: false },
    { label: "Service charge", value: "25% on food & beverage, taxable", stated: true },
    { label: "Parking", value: "Not stated (please confirm)", stated: false },
    { label: "Day-of coordinator", value: "Not stated (please confirm)", stated: false },
    { label: "Payment schedule", value: "Not stated (please confirm)", stated: false },
    { label: "Cancellation / rescheduling", value: "Not stated (please confirm)", stated: false },
    { label: "Event insurance", value: "Not stated (please confirm)", stated: false },
    { label: "Security", value: "Not stated (please confirm)", stated: false },
    { label: "Vendor access (setup/teardown)", value: "Not stated (please confirm)", stated: false },
    { label: "Noise curfew", value: "Not stated (please confirm)", stated: false },
  ],
  // Same shape/format for standard + venue FAQs so they render identically. Phrasing tightened
  // to match the couple-voiced style established on LondonHouse's page (e.g. "can we bring our
  // own X, or is it Y" rather than "is X Y, or can we bring our own").
  // Standardized (2026-08-25) to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. The dropped payment-schedule/noise-curfew questions are still
  // honest gaps in Policies; the real 25% service charge fact lives there too.
  standardFaqs: [
    { question: "Can we bring our own caterer, or does it have to be from an approved list?", answer: "Exclusive in-house. Galleria Marchetti's own kitchen produces all food as part of the wedding packages, with no outside-caterer option." },
    { question: "Can we bring our own alcohol?", answer: "In-house only, as part of the same exclusive wedding packages. There's no BYO option." },
    { question: "Is there a food & beverage minimum?", answer: "Not stated on their site. Confirm directly with the venue." },
    { question: "Do we need to hire our own day-of coordinator?", answer: "Not stated on their site. Confirm directly with the venue." },
    { question: "Is event insurance required?", answer: "Not stated on their site. Confirm directly with the venue." },
  ],
  faqs: [
    { question: "What size events can Galleria Marchetti accommodate?", answer: "Our venues are designed to host a wide range of events, from intimate gatherings to large-scale celebrations. Flexible indoor and outdoor spaces allow us to adapt layouts based on your guest count and event style." },
    { question: "Can we host both the ceremony and reception on-site?", answer: "Yes. Many couples choose to host their entire wedding experience at Galleria Marchetti, including ceremony, cocktail hour, and reception, creating a seamless flow for guests." },
    { question: "What happens if the weather doesn't cooperate?", answer: "Our venue offers indoor and outdoor options that allow for smooth transitions in the event of inclement weather, ensuring your celebration remains beautiful and uninterrupted." },
    { question: "Do you host weekday or evening events?", answer: "Yes. Galleria Marchetti welcomes weekday events and often offers seasonal incentives or special pricing for weekday bookings." },
    { question: "Do you provide event planning or coordination support?", answer: "Our experienced team works closely with clients throughout the planning process, offering guidance on space selection, layout options, and event logistics to ensure a smooth experience." },
    { question: "Can we work with our own vendors?", answer: "To ensure a high level of quality and a seamless event experience, Galleria Marchetti works with a curated list of trusted vendors. Our team is happy to share approved options and guide you through selections that align with your vision while ensuring smooth execution on event day." },
    { question: "How do we get started?", answer: "The best first step is to reach out and tell us about your event. Our team will provide availability, capacity details, and next steps to help bring your vision to life." },
  ],
  // Genuinely different data from a "preferred vendor" list, and shouldn't be presented the
  // same way: Marchetti's own site has no published preferred/required vendor categories at
  // all (checked directly, 2026-08-14) — the one relevant mention is a real FAQ answer below
  // ("a curated list of trusted vendors... approved options"), which names no one and no
  // categories. What we do have is real evidence, in two different shapes:
  //
  // 1. `weddingStacks` — the real vendor lineup from a SINGLE real wedding, grouped by the
  //    post it came from, not flattened by category. Flattening (the first version of this
  //    section) threw away real signal: it's the difference between "here's everyone we've
  //    ever seen" and "here's who actually worked together on one real wedding here." Ranges
  //    from a full multi-vendor lineup (Carrie + Mike, 8 categories) down to just a single
  //    photo credit (3 others) — per user feedback 2026-08-15, "some posts will have a stack,
  //    some won't" is the real shape of this data, so one unified list that scales per-post
  //    beats artificially splitting "has a stack" from "solo credit" into two structures.
  //    Checked directly: none of these 4 posts share a vendor with each other (different
  //    photographer every time) — a "browse by vendor, see other weddings with them" filter
  //    would be genuinely valuable once there's real overlap, but there isn't yet, so it's
  //    not built. This venue has many more real posts than the 6 pulled so far, most of which
  //    likely have their own stacks too — this list will keep growing as more get pulled.
  // 2. `soloVendorCredits` — real names with no specific real-wedding post tying them to one
  //    (a previously-curated photographer list with unclear original sourcing). Kept separate
  //    since, unlike the four above, there's no post to attach them to.
  //
  // Every name verified directly against its own Instagram bio, not guessed from the handle.
  // Two tags dropped as likely personal accounts, not vendors (emileemeador, catycanon — no
  // vendor-pattern in the name or bio, plausibly the couple themselves).
  weddingStacks: [
    {
      postUrl: "https://www.instagram.com/p/DYzgn0JANJJ/",
      postTimestamp: "2026-05-26T19:14:29.000Z",
      postCaption: "it's always a great time with Carrie + Mike ❤️ the absolute best day with the best vibes!",
      postImageUrl:
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707781285_18054944306726607_3594396248535157128_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=Qux9ldGMRKoQ7kNvwFJjYUx&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_aBsvUDpsqLdT-aPX9ucZxtE68wGOG0hsDA4nom26ryg&oe=6A390152&_nc_sid=10d13b",
      vendors: [
        { category: "Photography", name: "Mayah Lee Photography", url: "https://instagram.com/mayahleephotography" },
        { category: "Videography", name: "Kyrie Copeland Films", url: "https://instagram.com/kyriecopelandfilms" },
        { category: "Florals", name: "Flowerchild Floral Design", url: "https://instagram.com/flowerchild_floraldesign" },
        { category: "Hair & Makeup", name: "Elizabeth Scott Company", url: "https://instagram.com/elizabethscottcompany" },
        { category: "Music & Entertainment", name: "Greenline Talent", url: "https://instagram.com/greenlinetalent" },
        { category: "Music & Entertainment", name: "The High Hat Second Line", url: "https://instagram.com/highhatsecondline" },
        { category: "Planning", name: "Clementine Custom Events", url: "https://instagram.com/clementinechicago" },
        { category: "Attire", name: "Generation Tux", url: "https://instagram.com/generationtux" },
        { category: "Attire", name: "Weddings 826", url: "https://instagram.com/weddings826" },
        { category: "Stationery", name: "Something Blue Studio", url: "https://instagram.com/some.thingbluestudio" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/DZsy-Lalc2t/",
      postTimestamp: "2026-06-18T01:11:32.000Z",
      postCaption: "There is no better feeling than saying ‘I do’ surrounded by the people you love most 🤍",
      postImageUrl:
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/726432470_18552570166069058_1322375997990265924_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGVhE0geC4cS7a_Zl9mQ9FChomo04UGDz9t2NJyoQ4Ms91P3ctJqRd-a7tsZKUt2Kw&_nc_ohc=CHWjnltRffsQ7kNvwH72fdq&_nc_gid=g8fT-bXod8fsTE5mEQNc5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af__pc28ovDZdTBPrjJaBBJ7M82lkBzn-LT6iHQ4sEXM7Q&oe=6A38F5A0&_nc_sid=10d13b",
      vendors: [{ category: "Photography", name: "Kayleen Nyshell Photography", url: "https://instagram.com/kayleennyshellphotography" }],
    },
    {
      postUrl: "https://www.instagram.com/p/DZIQMpfFT7i/",
      postTimestamp: "2026-06-03T20:35:01.000Z",
      postCaption: "Walking into the Pavilion never gets old 🥰✨",
      postImageUrl:
        "https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/716610256_18549232579069058_8406895133058604792_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-lga3-3.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gE4DTgU6xKo6t6O5zwbPnF-q9RjGOcSY_qcOwnf49tC-4OJwVws7jTj5QfTfj1YKRw&_nc_ohc=T4ndHt__PIMQ7kNvwFBiCN9&_nc_gid=WS0zfHn73x_5HNvSdepMQg&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_tb80JIsJRdVEFqZELBvMxo8ilMoKIoAuoerMRWo26Ag&oe=6A38F0E9&_nc_sid=10d13b",
      vendors: [{ category: "Photography", name: "Sally O'Donnell Photography", url: "https://instagram.com/sallyodonnellphotography" }],
    },
    {
      postUrl: "https://www.instagram.com/p/DZDYZX4lTgG/",
      postTimestamp: "2026-06-01T23:10:27.000Z",
      postCaption: "Obsessed with this bright colored reception 💐",
      postImageUrl:
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/711531321_18548774245069058_2770383815083348542_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=2lvKeQKB56QQ7kNvwFAlDl4&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_rbU-UgVILOekLq3L3WvgrDoVDQN7Mae4a7ON7opaVtg&oe=6A38EBE7&_nc_sid=10d13b",
      vendors: [{ category: "Photography", name: "Lindsey Kay Photography", url: "https://instagram.com/lindseykay_photography" }],
    },
  ],
  soloVendorCredits: [
    { category: "Photography", name: "Brooke and David", url: "http://brookeanddavid.com" },
    { category: "Photography", name: "Danielle Heinson Photography", url: "http://danielleheinson.com" },
    { category: "Photography", name: "Fox + Ivory", url: "http://foxandivory.com" },
    { category: "Photography", name: "Gerber + Scarpelli Photography", url: "http://gerberscarpelliweddings.com" },
    { category: "Photography", name: "Ian Rempel Photography", url: "http://rempelphotography.com" },
  ],
  // The venue's own real FAQ (below) mentions a curated list exists for other categories too,
  // but names nothing — genuinely unpublished, not a gap on our end.
  vendorsNote: "Marchetti also mentions working with a curated list of trusted vendors for other categories, but doesn't publish names. Ask directly.",
  // Full RealWeddingPost shape — reused directly by the app's real RealWeddingsSection
  // component (imported from VenuesClient), not a custom-built grid.
  realWeddings: [
    {
      post_url: "https://www.instagram.com/p/DZsy-Lalc2t/",
      post_timestamp: "2026-06-18T01:11:32.000Z",
      mentions: ["kayleennyshellphotography"],
      likes_count: 14,
      image_url:
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/726432470_18552570166069058_1322375997990265924_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGVhE0geC4cS7a_Zl9mQ9FChomo04UGDz9t2NJyoQ4Ms91P3ctJqRd-a7tsZKUt2Kw&_nc_ohc=CHWjnltRffsQ7kNvwH72fdq&_nc_gid=g8fT-bXod8fsTE5mEQNc5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af__pc28ovDZdTBPrjJaBBJ7M82lkBzn-LT6iHQ4sEXM7Q&oe=6A38F5A0&_nc_sid=10d13b",
      images: [
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/726432470_18552570166069058_1322375997990265924_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGVhE0geC4cS7a_Zl9mQ9FChomo04UGDz9t2NJyoQ4Ms91P3ctJqRd-a7tsZKUt2Kw&_nc_ohc=CHWjnltRffsQ7kNvwH72fdq&_nc_gid=g8fT-bXod8fsTE5mEQNc5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af__pc28ovDZdTBPrjJaBBJ7M82lkBzn-LT6iHQ4sEXM7Q&oe=6A38F5A0&_nc_sid=10d13b",
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/726432486_18552570178069058_5809524762842866304_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGVhE0geC4cS7a_Zl9mQ9FChomo04UGDz9t2NJyoQ4Ms91P3ctJqRd-a7tsZKUt2Kw&_nc_ohc=4RS3Zf3QdrUQ7kNvwE7UBs6&_nc_gid=g8fT-bXod8fsTE5mEQNc5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8tqvLT4szhJMGc1pEszunu4lLm6m4APx2RFiwLh0RKeQ&oe=6A38EB65&_nc_sid=10d13b",
      ],
      caption: "There is no better feeling than saying ‘I do’ surrounded by the people you love most 🤍",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DZIQMpfFT7i/",
      post_timestamp: "2026-06-03T20:35:01.000Z",
      mentions: ["sallyodonnellphotography"],
      likes_count: 28,
      image_url:
        "https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/716610256_18549232579069058_8406895133058604792_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-lga3-3.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gE4DTgU6xKo6t6O5zwbPnF-q9RjGOcSY_qcOwnf49tC-4OJwVws7jTj5QfTfj1YKRw&_nc_ohc=T4ndHt__PIMQ7kNvwFBiCN9&_nc_gid=WS0zfHn73x_5HNvSdepMQg&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_tb80JIsJRdVEFqZELBvMxo8ilMoKIoAuoerMRWo26Ag&oe=6A38F0E9&_nc_sid=10d13b",
      images: [
        "https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/716610256_18549232579069058_8406895133058604792_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-lga3-3.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gE4DTgU6xKo6t6O5zwbPnF-q9RjGOcSY_qcOwnf49tC-4OJwVws7jTj5QfTfj1YKRw&_nc_ohc=T4ndHt__PIMQ7kNvwFBiCN9&_nc_gid=WS0zfHn73x_5HNvSdepMQg&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_tb80JIsJRdVEFqZELBvMxo8ilMoKIoAuoerMRWo26Ag&oe=6A38F0E9&_nc_sid=10d13b",
        "https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/714303819_18549232588069058_811166229684264846_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-lga3-3.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gE4DTgU6xKo6t6O5zwbPnF-q9RjGOcSY_qcOwnf49tC-4OJwVws7jTj5QfTfj1YKRw&_nc_ohc=82AmlSIHOvgQ7kNvwHG-wjR&_nc_gid=WS0zfHn73x_5HNvSdepMQg&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af9JZD-MpPo5_4bOBS1JTNNX7YFr1Mvu9yoxsNp80qssGQ&oe=6A38E762&_nc_sid=10d13b",
      ],
      caption: "Walking into the Pavilion never gets old 🥰✨",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DZDYZX4lTgG/",
      post_timestamp: "2026-06-01T23:10:27.000Z",
      mentions: ["lindseykay_photography"],
      likes_count: 34,
      image_url:
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/711531321_18548774245069058_2770383815083348542_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=2lvKeQKB56QQ7kNvwFAlDl4&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_rbU-UgVILOekLq3L3WvgrDoVDQN7Mae4a7ON7opaVtg&oe=6A38EBE7&_nc_sid=10d13b",
      images: [
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/711531321_18548774245069058_2770383815083348542_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=2lvKeQKB56QQ7kNvwFAlDl4&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_rbU-UgVILOekLq3L3WvgrDoVDQN7Mae4a7ON7opaVtg&oe=6A38EBE7&_nc_sid=10d13b",
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/714823139_18548774254069058_2676811098927646795_n.jpg?stp=dst-jpg_s1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=XYieCSrjhN8Q7kNvwEioM3t&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_J2ohPKZ2i77y9M7xB-B_lBawZ30LF2YyNKEhS__p1sA&oe=6A38E3B8&_nc_sid=10d13b",
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/712504470_18548774263069058_4199382269554720602_n.jpg?stp=dst-jpg_p1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=8lqXNxpTqWMQ7kNvwFtC1hH&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_6Xmf9-empfB-zstoeowBhR7k-mXAJAy2MeFz9dagwAw&oe=6A390066&_nc_sid=10d13b",
      ],
      caption: "Obsessed with this bright colored reception 💐",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DY7ihg3FWJo/",
      post_timestamp: "2026-05-29T22:05:01.000Z",
      mentions: ["emileemeador"],
      likes_count: 19,
      image_url:
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/709708878_18547983364069058_5765095130752624234_n.jpg?stp=dst-jpg_e35_s1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGm58FTDddE-PmYggiCJPN6aiEq8GNcyWJ3IMLqNwNIOpQJDpPyM9tk82Qe-vYEgEo&_nc_ohc=2TnFdGejlqkQ7kNvwGoflv4&_nc_gid=T3swg5MKCngyis5ZfwsesQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_wgHrHrhqNabwOKDlMFkcuivwcE99nuMtOKOd59Ixbjg&oe=6A38D1BC&_nc_sid=10d13b",
      images: [
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/709708878_18547983364069058_5765095130752624234_n.jpg?stp=dst-jpg_e35_s1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGm58FTDddE-PmYggiCJPN6aiEq8GNcyWJ3IMLqNwNIOpQJDpPyM9tk82Qe-vYEgEo&_nc_ohc=2TnFdGejlqkQ7kNvwGoflv4&_nc_gid=T3swg5MKCngyis5ZfwsesQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_wgHrHrhqNabwOKDlMFkcuivwcE99nuMtOKOd59Ixbjg&oe=6A38D1BC&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/709014479_18547983376069058_6827378750259830799_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGm58FTDddE-PmYggiCJPN6aiEq8GNcyWJ3IMLqNwNIOpQJDpPyM9tk82Qe-vYEgEo&_nc_ohc=OeMiNco8FLgQ7kNvwFt6IkA&_nc_gid=T3swg5MKCngyis5ZfwsesQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_nmfmJXi0XRr7Gn0tTVT7y16lXlrx6QhMv5vhgeDp69Q&oe=6A38D23C&_nc_sid=10d13b",
      ],
      caption: "La Pergola is the perfect space to celebrate under the starry night sky ✨",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DY2VhvQlXq2/",
      post_timestamp: "2026-05-27T21:35:15.000Z",
      mentions: ["catycanon"],
      likes_count: 20,
      image_url:
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/708451069_18547479712069058_6556353182371314386_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=sYOyswsOD3wQ7kNvwGF9yVZ&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8o7dfQwH43OIQL-obNDO_zJmWZV1HXOUu-jjjGdFRK2Q&oe=6A38D392&_nc_sid=10d13b",
      images: [
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/708451069_18547479712069058_6556353182371314386_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=sYOyswsOD3wQ7kNvwGF9yVZ&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8o7dfQwH43OIQL-obNDO_zJmWZV1HXOUu-jjjGdFRK2Q&oe=6A38D392&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/710157659_18547479721069058_7093406707186093195_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=WfUIisdjc7EQ7kNvwHWza_c&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af9IbXJ2SkPRsgcZuwz2DoMvAVIPQrSvh9y1vP07IzkSRg&oe=6A38E5A0&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/708979733_18547479733069058_5844118200576021493_n.jpg?stp=dst-jpg_s1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=jYb4Fk9i1xAQ7kNvwEVAs9z&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_RJSm17sZmi4hUeTcazamBBICQ8YOtXzX19L4eix_7fg&oe=6A38E514&_nc_sid=10d13b",
      ],
      caption: "Every step you take in Galleria Marchetti has a touch of our rich history!",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DYzgn0JANJJ/",
      post_timestamp: "2026-05-26T19:14:29.000Z",
      mentions: [
        "mayahleephotography",
        "clementinechicago",
        "kyriecopelandfilms",
        "galleriamarchetti",
        "elizabethscottcompany",
        "flowerchild_floraldesign",
        "greenlinetalent",
        "highhatsecondline",
        "weddings826",
        "generationtux",
        "some.thingbluestudio",
      ],
      likes_count: 328,
      image_url:
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707781285_18054944306726607_3594396248535157128_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=Qux9ldGMRKoQ7kNvwFJjYUx&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_aBsvUDpsqLdT-aPX9ucZxtE68wGOG0hsDA4nom26ryg&oe=6A390152&_nc_sid=10d13b",
      images: [
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707781285_18054944306726607_3594396248535157128_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=Qux9ldGMRKoQ7kNvwFJjYUx&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_aBsvUDpsqLdT-aPX9ucZxtE68wGOG0hsDA4nom26ryg&oe=6A390152&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707763835_18054944312726607_7067221347974530269_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=CivDlHQLhW8Q7kNvwEwFQnl&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8FMkNhlphUYfL9ddSSeq-PDingmO1yjYF8rUuWdVHYoA&oe=6A38EBA4&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707617904_18054944324726607_4902927331398516576_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=ASp-BvXEzSIQ7kNvwGqxDuR&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af-Xy-5R6nmA7rBi6YB8KytMskpeyocCG_hdAuH3cOfILg&oe=6A38EEFA&_nc_sid=10d13b",
      ],
      caption: "it’s always a great time with Carrie + Mike ❤️ the absolute best day with the best vibes!",
      post_type: "Sidecar",
    },
  ],
  sourcePages: [
    "https://www.galleriamarchetti.com/",
    "https://www.galleriamarchetti.com/weddings",
    "https://www.galleriamarchetti.com/contact",
    "https://www.galleriamarchetti.com/thepavilion",
    "https://www.galleriamarchetti.com/lapergola",
  ],
  lastVerified: "2026-08-14",
};

export type Marchetti = typeof marchetti;
