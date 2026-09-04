/**
 * Golden record for Field Museum (vendor_id 479) — third golden-set venue, chosen deliberately
 * for a different archetype (museum/landmark) and to pressure-test a real gap the first two
 * venues couldn't: a genuinely restrictive-sounding vendor policy. See
 * docs/engineering/venue-enrichment/golden-set-scratchpad.md for the fuller writeup.
 *
 * Structurally different page from Marchetti/LondonHouse, driven entirely by what's actually
 * real here, not by choice:
 * - No Cost Estimate calculator, no packages, no per-guest pricing, no rental fee table — the
 *   venue publishes zero pricing anywhere ("Request a Proposal" is the only path). The pricing
 *   note lives inside the Spaces section on the page, not a separate top-level section
 *   (feedback 2026-08-15).
 * - No Real Weddings / Wedding Vendor Stacks section — @fieldmuseum is real and verified
 *   (235K followers) but it's the museum's general account (dinosaurs, exhibits), not a venue
 *   account that tags real wedding vendors. The venue does have real, named external wedding
 *   features (blog/press credits), captured under `featuredWeddings` instead.
 * - Catering framing corrected on a second pass (2026-08-15) after finding two more real
 *   quotes the first pass missed: the venue's own FAQ answer ("Choose from our approved
 *   vendors for catering, floral, decor, lighting, media, and parking") and the approved-
 *   vendors page's near-identical intro. Neither ever says "must" or "required," but neither
 *   offers an opt-out either ("bring your own X") the way LondonHouse's real wording does —
 *   three independent real sources all use the same closed-list "choose from" framing with zero
 *   exception language. Treated as a de facto closed list: direct wording, not hedged as
 *   "not stated," but not asserting the literal word "required" either, since the venue never
 *   uses it.
 * - Real per-space capacity/sq-ft data exists, just not where the DB looked (each space has its
 *   own subpage) — same crawl-coverage gap pattern as Marchetti's floor plans. Each space page
 *   also has a real embedded video tour (Vimeo) — all four real numeric video IDs are now
 *   user-verified (Vimeo blocks WebFetch's own attempts to find them with a bot-check wall) and
 *   embedded in-page via an in-site lightbox (VideoTourButton.tsx), the same idea as Marchetti's
 *   FloorPlanButton, rather than sending the user to vimeo.com or fieldmuseum.org in a new tab.
 * - Could not read the venue's own PDF event brochure (fieldmuseum.org linked asset) — pure
 *   image content, and this build environment has no PDF-rasterization tooling (no
 *   poppler-utils/pip/ImageMagick, no sudo to install any). Noted as a real gap, not guessed
 *   around. The Beverage Packages and Wine List PDFs (linked, not read) are real and directly
 *   linked as resources instead.
 * - The venue's own on-site FAQ accordion (4 real questions, all with real answers — confirmed
 *   by hand, 2026-08-15). The wedding-planner answer covers the Policies checklist's "Day-of
 *   coordinator" row (an on-site Account Manager, not a traditional coordinator). The deposit
 *   answer does NOT cover "Payment schedule" or "Cancellation/rescheduling" the way it first
 *   looked like it might (third pass, 2026-08-15) — "a deposit is required and non-refundable"
 *   is real but doesn't actually state a payment schedule or a full cancellation policy, so
 *   those two rows reverted to "Not stated" rather than overselling a narrower fact.
 *
 * Sources (all fetched directly, 2026-08-15): fieldmuseum.org/page/weddings,
 * fieldmuseum.org/landing/venue-rentals, fieldmuseum.org/plan-your-special-event/weddings,
 * fieldmuseum.org/plan-your-special-event/approved-vendors (the DB's stored source_url,
 * fieldmuseum.org/page/approved-vendors, redirects/is stale — a real URL-drift finding), and
 * the four space subpages linked below.
 */

export const fieldMuseum = {
  vendorId: 479,
  placeId: "ChIJV0AwM30rDogR2sd-X0cgErU",
  name: "Field Museum",
  categoryLabel: "Museum Venue",
  address: "1400 S Lake Shore Dr, Chicago, IL",
  phone: "(312) 922-9410",
  website: "https://www.fieldmuseum.org/page/weddings",
  instagramHandle: "fieldmuseum",
  // Real, verified, active account (235K followers) — but it's the museum's general account,
  // not a wedding-venue account. Shown in the header like every other venue's real Instagram
  // link, just not treated as a source of real-wedding vendor posts (see file header).
  instagramUrl: "https://www.instagram.com/fieldmuseum",
  rating: 4.7,
  reviewCount: 31136,
  about:
    "Host your wedding in one of Chicago's most iconic and breathtaking venues, surrounded by world-renowned collections, stunning architecture, and panoramic views of the Chicago skyline and Lake Michigan.",
  // Resolved from the real Google Places photo names on this vendor's row via the Places API
  // (New) photo media endpoint — same one-time-resolution approach as Marchetti/LondonHouse's
  // `photos`, with the same known staleness caveat (docs/engineering/places-photos.md).
  photos: [
    "https://lh3.googleusercontent.com/place-photos/AG9NLjB-4jRyD27qXWA2UTeEhLGjmrr4HrSgyJqbGgBPrZI_Pl-MLuUP9s8YyOtKO_k_uuidSDYejs2pYWKeKYUDItVafQqOaC-RZ09DjcG8Cfnv6pW8bQIaNl_czwudoxXmbeeEPQWrVeTdIuUpje4=s4800-w1200",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBmes5noh4PmRF-jEh9nPPGNNQo5jAvUGn9G7T6dHisZARPZh0QswSmZrLWS7Hb5scy8JiyVE3-_UKZS0SKIDxPmApb1G_wHR2Y_jw5ESTAJb8H30iDaV-iKe8Q7I0HNFfS9fik71ZHT-lq=s4800-w1200",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBHSHBzIn_fJVkP2cyWhvxvpu0piSQK-L3bdptvq1AY_9nVbU_6Jo_r3jPBUDJSsmirSbqdrn9Xb6Ecudpqzl1kgoz4Sk1YgcREMBpppWIouUGcJHWUsFW9BbkDcsNRDTk3AFXeOH2mC0slJl8=s4800-w1200",
  ],
  // Guest range has a real, unresolved discrepancy between two of the venue's own pages —
  // same class of finding as LondonHouse's capacity-chart-vs-wedding-page mismatch. Weddings
  // page: "as few as 10 and up to more than 1,000." Venue-rentals landing page: "from intimate
  // gatherings of 20 to galas of more than 1,000." Shown here as 20-1,000+ (the more specific
  // wording); the 10-guest figure noted in the tooltip rather than silently dropped.
  quickFacts: [
    {
      icon: "guests",
      label: "20 to 1,000+ guests",
      note: "The wedding page separately says \"as few as 10.\" The two pages disagree on the exact floor. Shown here using the venue-rentals page's figure.",
    },
    { icon: "indoorOutdoor", label: "Indoor & outdoor", note: "Galleries and atria indoors; terraces and a garden outdoors." },
    {
      icon: "catering",
      label: "Approved caterers only",
      note: "From the venue's own FAQ: \"Choose from our approved vendors for catering, floral, decor, lighting, media, and parking.\" No source mentions an outside-caterer option.",
    },
    {
      icon: "bar",
      label: "No outside alcohol",
      note: "\"The Field Museum provides all alcoholic beverages used in conjunction with any event held at the Museum... Consumption bars and donated liquor are not allowed.\"",
    },
  ],
  capacityLabels: {
    seated: "Seated",
    reception: "Reception (standing)",
  },
  // Real per-space capacity/sq-ft/ceiling/video data — each figure lives on that space's own
  // subpage, not the general weddings page (same crawl-coverage gap as Marchetti's floor
  // plans: the DB's venue_enrichment.facts has all four spaces with every capacity field null).
  // Capacity is a single headline number per stat (matching Marchetti/LondonHouse's stat-box
  // convention) with any real nuance ("200 in the atrium alone") folded into the description
  // instead of crammed into the stat box caption. Every space has a real embedded Vimeo video
  // tour; the "Video tour" button uses `videoUrl`, a verified, direct vimeo.com link for all
  // four spaces (user-provided, since Vimeo blocks WebFetch's own attempts to find video IDs
  // with a bot-check wall — each one independently confirmed by fetching the exact URL and
  // checking the returned video title matches the space name). `sourceUrl` stays as the citation
  // and the fallback if `videoUrl` were ever missing. No fees anywhere — see `pricing` below for
  // the venue-wide "request a proposal" reality.
  spaces: [
    {
      name: "Stanley Field Hall & Balcony",
      sqFt: "~21,000 (main floor)",
      ceilingHeight: "76 ft",
      description:
        "Gleaming white marble, vaulted ceilings, and gracious columns, under Máximo the Titanosaur, fossil-filled marble floors, and flying pterosaurs. Seats up to 1,500 (1,400 with a stage).",
      capacity: { seated: 1500, reception: 4500 },
      hasVideo: true,
      // Real, direct Vimeo URL — user-provided, verified by fetching the exact URL and
      // confirming the returned video title ("Stanley Field Hall Video Tour") matches. videoId
      // is the same real ID, used for the in-page embed (see VideoTourButton.tsx).
      videoId: "528972601",
      videoUrl: "https://vimeo.com/528972601?fl=pl&fe=ti",
      sourceUrl: "https://www.fieldmuseum.org/stanley-field-hall-balcony",
    },
    {
      name: "Outdoor Terraces",
      sqFt: "11,376–35,997",
      ceilingHeight: null,
      description: "Chicago skyline and Lake Michigan views from the museum's own steps overlooking the water. Tenting available on request for warmer-month events.",
      capacity: { seated: 600, reception: 1600 },
      hasVideo: true,
      // Real, direct Vimeo URL — user-provided, verified by fetching the exact URL and
      // confirming the returned video title ("Outdoor Terraces Video Tour") matches.
      videoId: "529077728",
      videoUrl: "https://vimeo.com/529077728?fl=pl&fe=ti",
      sourceUrl: "https://www.fieldmuseum.org/outdoor-terraces",
    },
    {
      name: "East Atrium & Pavilion",
      sqFt: "10,000",
      ceilingHeight: "8–14 ft (highest in the East Atrium)",
      description:
        "A flexible, fully accessible space under a glass atrium ceiling: reception-style cocktails, seated dinners, or a lit dance floor, with complimentary access to the Inside Ancient Egypt exhibition during events. 200 seated (600 reception) in the atrium alone; 350 seated (600 reception) including the pavilion.",
      capacity: { seated: 350, reception: 600 },
      hasVideo: true,
      // Real, direct Vimeo URL — user-verified by browsing the live page (Vimeo blocks
      // WebFetch's own attempts with a bot-check wall). Confirmed a second way too: fetching
      // this exact URL returned the video's real title, "East Atrium & Pavilion Video Tour,"
      // matching. Notably a completely different numeric ID (527346081) than the one guessed
      // earlier from the page's Vimeo CDN thumbnail URL (1107392427) — confirms that heuristic
      // was wrong, good thing it was never used as a real link.
      videoId: "527346081",
      videoUrl: "https://vimeo.com/527346081?fl=pl&fe=ti",
      sourceUrl: "https://www.fieldmuseum.org/east-atrium-pavilion",
    },
    {
      name: "Rice Gallery",
      sqFt: "5,093",
      ceilingHeight: null,
      description: "An intimate space among African wildlife dioramas, including the Tsavo Lions against Serengeti plains scenery, with access to the Mammals of Asia exhibition.",
      capacity: { seated: 140, reception: 300 },
      hasVideo: true,
      // Real, direct Vimeo URL — user-provided, verified by fetching the exact URL and
      // confirming the returned video title ("Rice Gallery Video Tour") matches.
      videoId: "528911613",
      videoUrl: "https://vimeo.com/528911613?fl=pl&fe=ti",
      sourceUrl: "https://www.fieldmuseum.org/rice-gallery",
    },
  ],
  // Real catering/alcohol policy prose + the two real downloadable PDFs found on the weddings
  // page — otherwise missing from the page entirely (feedback 2026-08-15: "otherwise they're
  // missing from our page"). Split into Food and Beverage per feedback 2026-08-15 (each gets
  // its own direct sentence, not one combined paragraph); "BYO" spelled out rather than left as
  // an acronym, same feedback pass. No packages/per-guest pricing exists to show, unlike
  // Marchetti/LondonHouse's Food & Beverage sections — this is policy + resources only.
  foodAndBeverage: {
    food: "Catering comes from one of the museum's four approved caterers: Blue Plate, Levy Catering, Food for Thought, or Nicole Jordan Catering (see Vendors below).",
    beverage: "The museum provides all alcohol for events here. You can't bring your own alcohol, and consumption bars aren't allowed.",
    beverageResources: [
      { label: "Beverage Packages (PDF)", url: "https://www.datocms-assets.com/44232/1763993374-field-museum-bar-packages-1.pdf" },
      { label: "Wine List (PDF)", url: "https://www.datocms-assets.com/44232/1726173269-field-museum-wine-list-09122024.pdf" },
    ],
  },
  // Real add-on, moved out of Pricing (feedback 2026-08-15: this reads as an add-on, not a
  // pricing-section line item) — the museum's own fuller description, not just the price.
  addOns: [
    {
      name: "In-museum photography session",
      price: "$900 daytime / $1,200 evening",
      blurb:
        "Create memories that will last a lifetime with a stop at the Field Museum for your wedding, engagement, or celebration photography. Two hours to enjoy stunning settings for up to 20 participants.",
    },
  ],
  // Pricing — folded into the Spaces section on the page (feedback 2026-08-15: a separate
  // top-level "Pricing" callout felt disconnected; the fact that costs come from a per-space
  // proposal reads more naturally right where the spaces are shown) rather than its own
  // section. There's nothing real to calculate: rental fees and catering pricing are genuinely
  // unpublished anywhere on the site (checked directly).
  // No outbound link to the venue's own real proposal-request page (fieldmuseum.org/
  // contact-venue-rentals) — a second pass (2026-08-15) replaced it with our own "Ask a
  // question" inquiry flow (AskAboutPricingButton in InquirySystem.tsx). Every other CTA on
  // this page keeps the user in-product; an outbound link for pricing specifically was the one
  // exception, and undercut the point of being the couple's single point of contact.
  // Canonical 12-row checklist, same order as Marchetti/LondonHouse. Values are direct answers
  // (feedback 2026-08-15: "just answer the question... be direct") — fuller real quotes/nuance
  // live in quickFacts' tooltips and the Food & Beverage text instead of being repeated here.
  // "Venue rental charge type" renamed from "Venue rental" across all three golden-set venues,
  // same feedback pass — the row is really about the billing structure (flat fee / bundled /
  // by-proposal), not "the rental" itself.
  // Day-of coordinator and Parking upgraded from "Not stated" to real, direct answers on a
  // second pass (2026-08-15): the wedding-planner FAQ answer describes an on-site Account
  // Manager (not a day-of coordinator in the traditional sense, but the real fact for that row,
  // shortened to fit); two real approved parking/valet vendors exist (see Vendors below), so
  // "not stated" would undersell it. Payment schedule and Cancellation/rescheduling reverted
  // back to "Not stated" on a third pass (2026-08-15) — knowing "a deposit is required and
  // non-refundable" doesn't actually answer either of these: it's silent on the real payment
  // *schedule* (deposit %, balance due date) and on what a full cancellation/reschedule costs
  // beyond the deposit. Real, but too narrow to fill a broader row without overselling what's
  // known — the deposit fact itself still shows in `faqs` below.
  policies: [
    { label: "Catering", value: "Approved vendor list only", stated: true },
    { label: "Bar", value: "In-house only", stated: true },
    { label: "Venue rental charge type", value: "Reach out for proposal", stated: true },
    { label: "Food & beverage minimum", value: "Not stated (please confirm)", stated: false },
    { label: "Service charge", value: "Not stated (please confirm)", stated: false },
    { label: "Parking", value: "Not provided; approved vendors listed", stated: true },
    { label: "Day-of coordinator", value: "Not required; on-site Account Manager provided", stated: true },
    { label: "Payment schedule", value: "Not stated (please confirm)", stated: false },
    { label: "Cancellation / rescheduling", value: "Not stated (please confirm)", stated: false },
    { label: "Event insurance", value: "Not stated (please confirm)", stated: false },
    { label: "Security", value: "Not stated (please confirm)", stated: false },
    { label: "Vendor access (setup/teardown)", value: "Not stated (please confirm)", stated: false },
    { label: "Noise curfew", value: "Not stated (please confirm)", stated: false },
  ],
  // Generic couple-facing questions, synthesized from facts verified elsewhere on this page —
  // same approach as Marchetti/LondonHouse's standardFaqs.
  // Standardized (2026-08-25) to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. The dropped pricing/capacity questions are still answered in full
  // elsewhere on this page (Pricing section, Quick facts).
  standardFaqs: [
    {
      question: "Can we bring our own caterer, or does it have to be from an approved list?",
      answer: "You'll choose from the museum's approved caterers: Blue Plate, Levy Catering, Food for Thought, or Nicole Jordan Catering. The museum's own FAQ says \"choose from our approved vendors\" and doesn't mention an outside option.",
    },
    {
      question: "Can we bring our own alcohol?",
      answer: "No. The museum provides all alcohol for events held here. Outside alcohol and consumption bars aren't allowed.",
    },
    {
      question: "Is there a food & beverage minimum?",
      answer: "Not stated on their site. Confirm directly with the venue.",
    },
    {
      question: "Do we need to hire our own day-of coordinator?",
      answer: "Not required. The museum provides an on-site Account Manager.",
    },
    {
      question: "Is event insurance required?",
      answer: "Not stated on their site. Confirm directly with the venue.",
    },
  ],
  // The venue's own real, on-site FAQ questions AND answers (confirmed by hand, 2026-08-15).
  // These four also inform three Policies rows above (Day-of coordinator, Payment schedule,
  // Cancellation/rescheduling) — the accordion content itself is what unlocked those.
  faqs: [
    {
      question: "Does the Field Museum provide a wedding planner?",
      answer: "The Field Museum does not provide a planner or act as a planner for your wedding. An Account Manager will be onsite to manage museum logistics from setup to the end of your celebration. We are happy to recommend local wedding planners who have worked with past clients if you wish to hire one on your own. We highly recommend hiring a wedding planner to assist with logistics, but it is not required.",
    },
    {
      question: "Can I host my celebration outside? What if it rains?",
      answer: "We welcome you to host your ceremony and/or cocktail reception outside on our picturesque terrace space. For every wedding, we will have a weather backup plan in place and the decision will be made up until the morning of the celebration whether to host the ceremony indoors or outdoors.",
    },
    {
      question: "Is a deposit required? Is my deposit refundable?",
      answer: "To confirm your event, a deposit is required along with a signed contract. Deposits are non-refundable.",
    },
    {
      question: "Does the Field Museum have an approved or preferred vendor list?",
      answer: "Yes, the Field Museum works with a variety of approved and preferred vendors to provide event services from catering to dramatic event lighting. We've partnered with premier Chicago businesses to support you in creating unforgettable events. Choose from our approved vendors for catering, floral, decor, lighting, media, and parking. These vendors are knowledgeable about the Field Museum space, receive special training on our policies and procedures, and are fully licensed by the city and state.",
    },
  ],
  // Real, named external wedding features (blog posts / photographer & videographer
  // portfolios / press), not Instagram posts — a genuinely different shape of "real wedding"
  // evidence than Marchetti's. Straight from the venue's own "A few of our favorite weddings"
  // list on its weddings page. URLs are exactly as linked by the venue, including one that
  // resolves to what looks like a vendor's staging/demo subdomain (Birch Design Studio) — not
  // corrected, since that's the venue's own live link, not something introduced here.
  featuredWeddings: [
    { title: "Classic Elegant Chicago Field Museum Wedding", attribution: "Strictly Weddings", url: "http://strictlyweddings.com/blog/2018/05/classic-elegant-chicago-field-museum-wedding/" },
    { title: "Lauren and Norm at the Field Museum", attribution: "Victoria Sprung Photography", url: "https://www.victoriasprungphotography.com/lauren-and-norm-at-the-field-museum-chicago-illinois/" },
    { title: "A Magical Night at the Museum", attribution: "Birch Design Studio", url: "https://demo-birch.squarespace.com/portfolio/2018/10/1/a-magical-night-at-the-museum" },
    { title: "Stunning Fall Wedding in Stanley Field Hall", attribution: "Amor in Motion Films", url: "https://vimeo.com/321867867/885696a3fe" },
    { title: "Flowers and Fossils: A Gorgeous Ceremony & Reception", attribution: "Smiling Toad Productions", url: "https://lovestoriestv.com/mary-eric-wedding-video-september-2018/" },
  ],
  // 13 real, named vendors across 5 categories — richer than either existing venue's vendor
  // data. Categories/URLs verified directly against
  // fieldmuseum.org/plan-your-special-event/approved-vendors.
  approvedVendors: [
    { category: "Catering", name: "Blue Plate", url: "https://www.blueplatechicago.com/" },
    { category: "Catering", name: "Levy Catering", url: "https://www.cateringbylevy.com/" },
    { category: "Catering", name: "Food for Thought", url: "https://www.foodforthoughtchicago.com/" },
    { category: "Catering", name: "Nicole Jordan Catering", url: "https://www.njcaters.com/" },
    { category: "Floral & Decor", name: "HMR Designs", url: "https://www.hmrdesigns.com/" },
    { category: "Floral & Decor", name: "Kehoe Designs", url: "https://www.kehoedesigns.com/" },
    { category: "Floral & Decor", name: "The Flower Firm", url: "https://www.flowerfirm.com/" },
    { category: "Floral & Decor", name: "Yanni Design Studio", url: "https://www.yannidesignstudio.com/" },
    { category: "Floral & Decor", name: "Southside Blooms", url: "https://www.southsideblooms.com/" },
    { category: "Lighting & AV", name: "Frost Chicago", url: "https://www.frostchicago.com/" },
    { category: "Equipment Rentals", name: "Hall's Rental", url: "https://www.hallsrental.com/" },
    { category: "Parking", name: "Soldier Field Parking", url: "https://www.soldierfieldparking.com/" },
    { category: "Parking", name: "VIP Valet", url: "https://www.vipvaletservices.com/" },
  ],
  // Real quote from the approved-vendors page itself (near-identical wording to the FAQ
  // answer above — two independent real sources say almost the same thing, which is why the
  // section is framed as a de facto closed list; see file header).
  vendorsNote:
    "From the venue's own approved-vendors page: \"We've partnered with premiere Chicago businesses to support you in creating unforgettable events. Choose from our approved vendors for catering, floral, decor, lighting, media, and parking. Vendors featured here are knowledgeable about the Field Museum space, receive special training on our policies and procedures, and are fully licensed by the city and state.\"",
  sourcePages: [
    "https://www.fieldmuseum.org/page/weddings",
    "https://www.fieldmuseum.org/landing/venue-rentals",
    "https://www.fieldmuseum.org/plan-your-special-event/weddings",
    "https://www.fieldmuseum.org/plan-your-special-event/approved-vendors",
    "https://www.fieldmuseum.org/stanley-field-hall-balcony",
    "https://www.fieldmuseum.org/outdoor-terraces",
    "https://www.fieldmuseum.org/east-atrium-pavilion",
    "https://www.fieldmuseum.org/rice-gallery",
  ],
  lastVerified: "2026-08-15",
};

export type FieldMuseum = typeof fieldMuseum;
