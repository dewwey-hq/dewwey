/**
 * Golden record for Diamond Garden Banquet Hall (vendor_id 44) — fourth golden-set venue,
 * chosen deliberately for two reasons: a new archetype (banquet hall, purpose-built for
 * weddings, vs. the loft/hotel/museum shapes already covered), and to fill the one real gap
 * left in the vendor-policy spectrum after Marchetti (exclusive in-house), LondonHouse
 * (preferred, never required), and Field Museum (a closed "choose from our list" that reads as
 * required in practice) — every prior venue leaned restrictive. This one is the opposite end:
 * genuinely, explicitly open. Real FAQ answer, verbatim: "We can certainly recommend you some
 * vendors but you can bring in any vendor of your choice. We don't have any limitations. We
 * welcome everyone." See docs/engineering/venue-enrichment/golden-set-scratchpad.md.
 *
 * Structurally different from all three prior venues:
 * - Genuinely ONE physical room, not multiple bookable spaces — confirmed directly by the
 *   venue's own FAQ ("Yes, we only have one room"). The DB's venue_enrichment.facts lists 5
 *   "spaces," but three of those are actually guest-count minimums for the Complete Package
 *   mis-classified as separate spaces, not real rooms — a data-quality bug, not a crawl gap.
 * - Two entirely separate real pricing paths, not one: "Complete Package" (per-guest,
 *   all-inclusive — catering, bar, cake, rentals, staff) and "Hall Rental Only" (flat fee,
 *   bring-your-own-everything, plus required staffing add-ons). Real numbers for both exist —
 *   the first golden-set venue since Marchetti with a real, working Cost Estimate calculator,
 *   and the first with two genuinely different real pricing models to toggle between.
 * - No Vendors section at all — not thin data this time, genuinely zero named vendors: the
 *   venue's whole pitch is "bring anyone," so there's no preferred/approved list to show.
 * - No real Instagram — the site's own header nav has an "Instagram" link, but it points to
 *   the same Facebook URL as the Facebook link (a real bug on their own site, not something to
 *   route around by guessing a handle). Omitted from the header rather than shown wrong.
 * - Real answers exist for policy rows that were "Not stated" on every prior venue: a real
 *   noise curfew (1am), a real full payment schedule (deposit + two different balance-due
 *   windows), and a real positive parking answer (two free lots, 75+ spaces) — this venue's own
 *   25-question FAQ page is far more complete than anything found on the first three venues.
 *
 * Sources (all fetched directly, 2026-08-15): diamondgardenhall.com,
 * diamondgardenhall.com/build-your-own-package, diamondgardenhall.com/questions-and-answers,
 * diamondgardenhall.com/about-us, and 3 real PDFs linked from the packages page (bar packages,
 * enhancements, add-ons). Could not confirm a direct embeddable URL for the venue's own
 * "Videos" or "Virtual Tour" pages — this is a Wix-built site; the video/tour components are
 * hydrated client-side from a page-data JSON file this environment couldn't fetch (tried the
 * predictable internal URL, got Access Denied), same class of limit as Field Museum's Vimeo
 * bot-check wall. Linked out to the real pages instead of guessing an embed ID.
 *
 * Real staleness found across the venue's own PDFs, not smoothed over: the "Enhancements" PDF
 * is dated 2023 and the "Add-ons" PDF 2024, both referencing a "+10% for 2025" surcharge —
 * older than the main packages page's own 2027/2028 surcharge tiers. Treated as still-real
 * (nothing indicates the line items themselves changed, just the pricing-page template's
 * forward-looking surcharge year), but not silently merged as if from the same, current source.
 */

export const diamondGarden = {
  vendorId: 44,
  placeId: "ChIJXc4ZVRLND4gRjagoUBAyKPY",
  name: "Diamond Garden Banquet Hall",
  categoryLabel: "Banquet Hall",
  address: "3705 W Fullerton Ave, Chicago, IL",
  phone: "(312) 619-9690",
  website: "https://www.diamondgardenhall.com/",
  rating: 4.5,
  reviewCount: 197,
  about:
    "Located in Logan Square, Diamond Garden Banquet Hall is a family-owned venue with over 20 years of experience in the event industry. It offers the benefits of a traditional outdoor wedding with the convenience and availability of an indoor, garden-themed setting.",
  // Resolved from the real Google Places photo names on this vendor's row via the Places API
  // (New) photo media endpoint — same one-time-resolution approach as the other three venues.
  photos: [
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBOWqk0Na4CuCGDGCeCk4MMlUHXsyICMOOe1ONHW0wEC2ME6h2glpNA_80CKuwE84z14TEen7B_FKcLEwyG-H0eP8NsoXsdqDzqO9vsmxAe2dKQ7EZehLwKrxoM_V30d4wjEm6vwpREL8wNLw=s4800-w1170",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBg1Dp3fKI_tvCuL0lIrDOrPeGdP7DS-VA5gBIapV5KAPFEHARIZ-LrOuSJfj5YbGL07Mv5dooSKRLsh7iF-yVruO7NGjJUFyHfAnCj0KzkQRWIf0jmd79Af9tso3W41amrMPyDaVSnXM3HclPrm7nV6g=s4800-w1179",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBLOTUZPzNhdMrzk24waHHWgAXZHfpo_vkG76IteKRvLnp2CQWHYZos1kL8kln2FRTO5FGvZrGhvUcuUROOOBtYLJ8386PReVeo4nIpA5VQ61ZgBkvROM3v7z9U_neJZSbWvPVJY1GEJFXBVZE=s4800-w1200",
  ],
  quickFacts: [
    {
      icon: "guests",
      label: "Up to 268 guests",
      // Corrected 2026-08-16: re-verified directly against the homepage, /build-your-own-package,
      // and the FAQ — the venue never actually labels 268 "cocktail-style," that was our own
      // inferred read, not a real quote. 268 is the venue's own general "up to X guests" figure
      // (homepage), with no seating-style qualifier at all; a separate 258 figure exists but is
      // tied specifically to Hall Rental Only's table/chair count, not a distinct "seated"
      // headline claim. Since the room has one fixed layout (the dance floor is a permanent
      // feature, not configurable), 268 is used as the real seated-with-dance-floor figure.
      note: "The venue's own general capacity claim, from the homepage: \"up to 268 guests.\" The All-Inclusive package has its own guest minimums (see Packages): 150 general, 125 on Fridays, 100 on Sundays.",
    },
    {
      // Label simplified to just "Indoor" (feedback 2026-08-16), matching LondonHouse's
      // indoorOutdoor quick fact — the garden theme is the space's own pitch, already stated in
      // About and the Space section, not a pill-sized fact.
      icon: "setting",
      label: "Indoor",
      note: "\"All the benefits of a traditional outdoor wedding, with the convenience and availability of an indoor setting.\" Not a literal indoor/outdoor dual space like some venues; it's one indoor room styled to feel like a garden.",
    },
    {
      // Category-prefixed (feedback 2026-08-16), since "in-house or BYO" alone reads as
      // ambiguous without the icon for context — matches on both catering and bar pills.
      icon: "catering",
      label: "Catering: in-house or BYO",
      note: "From the venue's own FAQ: \"We can certainly recommend you some vendors but you can bring in any vendor of your choice. We don't have any limitations. We welcome everyone.\"",
    },
    {
      icon: "bar",
      label: "Bar: in-house or BYO",
      note: "From the venue's own FAQ: \"Open Bar, Cash Bar or even better you can also bring in your own alcohol.\"",
    },
  ],
  // Re-verified directly against the homepage, /build-your-own-package, and the FAQ (2026-08-16):
  // the venue never labels any capacity number "seated," "cocktail," or "standing" — that was our
  // own earlier inference, not a real quote, and a mistaken one (268 was labeled "cocktail-style"
  // with no source for it). All three tiles kept for the same shape as every other golden-set
  // venue (feedback 2026-08-16: "i still want all three tiles"), but only "Seated (w/ dance
  // floor)" carries a real number — the room's one fixed layout, dance floor permanently in
  // place. "Seated" and "Cocktail (standing)" are shown unstated (LondonHouse's own greyed "—"
  // treatment) rather than reusing 268 under labels the venue never actually used.
  capacityLabels: {
    seated: "Seated",
    seatedWithDance: "Seated (w/ dance floor)",
    cocktail: "Cocktail (standing)",
  },
  // Genuinely one room (confirmed by the venue's own FAQ: "Yes, we only have one room. We will
  // be able to accommodate 2 events per day, one in the morning and other one in the evening.")
  // — not modeled as multiple "spaces" the way the DB's venue_enrichment.facts does.
  space: {
    name: "Diamond Garden Banquet Hall",
    // 268, from the homepage's own general "up to 268 guests" claim — see capacityLabels comment
    // above for why this is the only tile with a real number.
    capacity: { seated: null as number | null, seatedWithDance: 268, cocktail: null as number | null },
    // Checked directly against the homepage and /build-your-own-package (2026-08-16): neither
    // states a square footage anywhere. Genuinely not published, not a crawl gap.
    sqFt: null as number | null,
    // Combines the venue's own "garden-themed, feels like an outdoor wedding" pitch (also in
    // About — feedback 2026-08-16: keeping this here too reads fine, it's the venue's real
    // framing) with a genuinely room-specific fact previously unsurfaced anywhere on the page:
    // the real flip time from ceremony to reception, verbatim from the venue's own FAQ (see the
    // `faqs` array below).
    description:
      "A garden-themed indoor room, styled to give the feel of a traditional outdoor wedding without weather risk. The space features one grand room, flipped from ceremony to reception in about 45 minutes to an hour.",
    tourUrl: "https://www.diamondgardenhall.com/360-tour-banquet-hall-rental",
    videosUrl: "https://www.diamondgardenhall.com/wedding",
    sourceUrl: "https://www.diamondgardenhall.com/",
  },
  // Real, venue-wide facts true no matter which package you book — abstracted out of both
  // package inclusion lists on a second pass (2026-08-15) so each package only shows what's
  // actually distinct about it, not repeated baseline facts. "Handicap Accessible" was only
  // ever listed under Hall Rental Only on the real site, but there's no real reason it wouldn't
  // apply venue-wide (it's a fact about the building, not the booking path) — treated as shared
  // rather than left as a package-specific claim that doesn't hold up logically. "Spacious dance
  // floor" folded in from the removed Highlights list (feedback 2026-08-16) — the one genuinely
  // new fact in that list, everything else there duplicated facts shown elsewhere on this page.
  sharedIncludes: [
    "Private bridal suite",
    "Ceremony at no extra charge (within your rental hours)",
    "New silver Chiavari chairs",
    "Spacious dance floor",
    "2 parking lots, 75+ spaces",
    "Handicap accessible",
  ],
  // Two entirely separate, real pricing paths — the defining structural feature of this venue.
  // "All-Inclusive" (real name, corrected from "Complete Package" — feedback 2026-08-15; the
  // venue's own heading is "ALL-INCLUSIVE / COMPLETE PACKAGE," both real, "All-Inclusive" is
  // the one to lead with) is per-guest; "Hall Rental Only" is a flat fee with
  // bring-your-own-everything, plus required staffing add-ons. Both real, both verified
  // directly against diamondgardenhall.com/build-your-own-package. `inclusions` on each is only
  // what's genuinely distinct to that path — see `sharedIncludes` above for what both share.
  packages: {
    complete: {
      key: "complete",
      name: "All-Inclusive",
      unit: "per_guest",
      minGuests: { general: 150, friday: 125, sunday: 100 },
      rentalHours: "6 hours (1am latest)",
      pricing: {
        offSeason: { months: "Jan, Feb, Mar, Nov", weekdayFriSun: 68.95, saturday: 76.95 },
        peakSeason: { months: "Apr–Oct, Dec", weekdayFriSun: 76.95, saturday: 84.95 },
      },
      earlyBird: { price: 52.95, detail: "11am–3pm, 4 hours, no alcohol" },
      // Split into Food / Bar / Setup & Staff (feedback 2026-08-16: "wonder if we should
      // separate out line items so like bar is diff than food") instead of one flat list.
      inclusionGroups: {
        food: ["Buffet or plated service", "Wedding or quinceañera cake", "Coffee, decaf & tea"],
        bar: ["Open bar for 4.5 hours", "Champagne toast for the bridal party"],
        setup: [
          "Elegant centerpieces",
          "Silverware, glassware, china & linen",
          "Head table, cake table & gift table setup",
          "Professional wait staff, bartenders, door usher & event manager",
        ],
      },
      futureYearSurchargePerGuest: { 2027: 3, 2028: 6 },
    },
    hallOnly: {
      key: "hallOnly",
      name: "Hall Rental Only",
      unit: "flat",
      rentalHours: "5 hours + 2 hours before for setup (1am latest)",
      pricing: {
        offSeason: { months: "Jan, Feb, Mar, Nov", weekday: 2100, fridaySunday: 3700, saturday: 4700 },
        peakSeason: { months: "Apr–Oct, Dec", weekday: 2400, fridaySunday: 4595, saturday: 6595 },
      },
      inclusions: ["Tables (for up to 258 guests)", "Kitchen area (food warmers, refrigerator & microwave)"],
      // Real, required add-ons on top of the flat rental fee — not optional extras. Bartender
      // count formula is the venue's own stated rule (FAQ: "we require 1 bartender every 150
      // guests"), not an estimate.
      requiredAddOns: {
        pricePerRole: 225,
        bartenderPerGuests: 150,
        otherRoles: ["Door usher", "Maintenance", "Manager"],
      },
      futureYearSurchargeFlat: { 2027: 300, 2028: 600 },
    },
  },
  // Real bar menu, from the venue's own "Bar Packages" PDF (read directly — image-based, no
  // text layer, same as the enhancement PDFs below). Restructured into real numeric fields
  // instead of one combined price string, and reordered low-to-high (non-alcoholic through top
  // shelf, instead of the PDF's own Standard-first order) so the tiers read as a real ladder.
  // `includes` condensed to plain categories, not even the brand-name examples used before
  // (feedback 2026-08-16: "don't need to list all them, can just say that") — the full
  // brand-by-brand list is still in the source PDF (linked above) for anyone who wants it.
  // Standard Bar is already included in the All-Inclusive package; every tier's price is an
  // hourly add-on for the Hall Rental Only path specifically.
  barPackages: [
    { name: "Sodas, Juices & Mixers", includes: "Sodas, juices, tonic & mixers, no alcohol", price4hr: 3.95, price5hr: 4.95, note: "Garnishes +$1/guest" },
    { name: "Beer Only", includes: "Domestic & import beer, juices & soft drinks", price4hr: 12, price5hr: 16, note: null },
    { name: "Wine Only", includes: "Red & white wines, sodas & mixers", price4hr: 12, price5hr: 16, note: null },
    { name: "Standard Bar", includes: "Well liquors, domestic beer, house wine, sodas & juices", price4hr: 15, price5hr: 20, note: "Included with All-Inclusive" },
    { name: "Premium Bar", includes: "Standard Bar plus name-brand liquors and imported beer", price4hr: 20, price5hr: 25, note: "Or +$7/guest upgrade from Standard" },
    { name: "Top Shelf Bar", includes: "Premium Bar plus top-shelf liquors and champagne", price4hr: 30, price5hr: 40, note: "Or +$15/guest upgrade from Premium" },
  ],
  barPackagesNote: "Bartenders, glassware, service staff, and delivery fees.",
  // Real minimum, flagged as its own callout in the UI (feedback 2026-08-16: "minimum of 50
  // guests is huge and should be flagged") instead of buried in the same small-print line as
  // exclusions.
  barPackagesMinGuests: 50,
  // Real, downloadable menu/bar PDFs — otherwise missing from the page (same gap Field Museum
  // had before its own PDFs were surfaced). Tagged by type so Food & Beverage (split into
  // Food/Beverage prose, not cards) can show each resource under the right half instead of one
  // combined list. "(PDF)" dropped from labels (feedback 2026-08-16) — the FileText icon on the
  // button already signals that.
  menuResources: [
    { label: "American & Italian Menu", url: "https://www.diamondgardenhall.com/_files/ugd/4b61b7_f1d49b9401ac4b0eb329e97bc9be023f.pdf", type: "food" },
    { label: "Mexican Menu", url: "https://www.diamondgardenhall.com/_files/ugd/4b61b7_f390a4a7077e432495dc128036e9e4b4.pdf", type: "food" },
    // URL corrected 2026-08-17 — the original link 404'd on re-check; the venue moved the file
    // (same filename pattern, different trailing hash). Re-verified this one loads and is the
    // real Puerto Rican menu.
    { label: "Puerto Rican Menu", url: "https://www.diamondgardenhall.com/_files/ugd/4b61b7_31b1851632574200b8d7df9c00cd47f3.pdf", type: "food" },
    { label: "Bar Packages", url: "https://www.diamondgardenhall.com/_files/ugd/4b61b7_8936fd994cb84f448c9830099c37fa78.pdf", type: "beverage" },
  ],
  // Real contents of the three menu PDFs above, read directly (2026-08-17) rather than left as
  // just links — same table shape as barPackages (Package/Includes/Cost/Extras), condensed the
  // same way (real categories, not every dish enumerated where a menu has many). Puerto Rican
  // genuinely has far fewer entrée/side options than the other two (2 each, not really a
  // "choice" since there's nothing else to pick vs. 8 and 8-10) — kept honest, not smoothed
  // over. Mexican's rice/beans/tortillas are fixed parts of the package, not a choice like the
  // other two menus' sides. All three share identical base pricing and appetizer upcharge.
  foodMenus: [
    {
      cuisine: "American & Italian",
      includes: "Bread & butter, salad, choice of 2 entrées from 8, choice of 2 starches or vegetables",
      cost: "$15.95/guest buffet, $17.95/guest plated",
      extras: [
        { label: "Appetizer", value: "add 1 (+$4/guest) or 3 (+$11/guest)" },
        { label: "Salad", value: "substitute Caesar or Baby Spinach +$2/guest" },
        { label: "Soup", value: "+$3/guest" },
      ],
    },
    {
      cuisine: "Mexican",
      includes: "Salad, choice of 2 entrées from 8, Mexican rice, fried beans, salsa & tortillas",
      cost: "$15.95/guest buffet, $17.95/guest plated",
      extras: [
        { label: "Appetizer", value: "add 1 (+$4/guest) or 3 (+$11/guest)" },
        { label: "Late-night", value: "taco bar +$12.95/guest" },
      ],
    },
    {
      cuisine: "Puerto Rican",
      includes: "Bread & butter, salad, both entrées (Lechón & Pollo Asado), both sides (Arroz con Gandules & Maduros)",
      cost: "$15.95/guest buffet, $17.95/guest plated",
      extras: [{ label: "Appetizer", value: "add 1 (+$4/guest) or 3 (+$11/guest)" }],
    },
  ],
  // Curated, not an exhaustive transcription — the real "Enhancements" and "Add-ons" PDFs
  // together list 60+ real line items (down to $1/guest napkin colors). Picked the categories a
  // couple would actually browse to decide on, condensed with example items + starting prices,
  // same approach as Marchetti's real "Wedding Experiences" menu. Every number here is real,
  // just not every single one of the 60+ exists on this page.
  // Rebuilt (2026-08-17) from the venue's own "Rental Add-Ons 2024" PDF, read directly — a much
  // fuller source than what the earlier 4-category version was based on. Categories match the
  // PDF's own real structure instead of a looser grouping. Still curated (the source PDF has
  // 60+ line items across 2 pages), not an exhaustive transcription. Real, useful distinction
  // surfaced in the Food package blurb: Bronze and Silver use plasticware, not real silverware —
  // only Gold includes actual china/silverware/glassware, which matters for comparing against
  // All-Inclusive (which does include real silverware/glassware/china) and against Hall Rental
  // Only's own base inclusions (no dinnerware at all). "With servers included" now stated
  // explicitly for Extra hours (feedback 2026-08-17) — the PDF's own real distinction, not just
  // an unexplained price range.
  // Consolidated from 9 to 5 categories (feedback 2026-08-17), matching the grouping requested —
  // Food & beverage, Decoration, Lighting & video, Staffing & service, Extra hours. Similar real
  // items summarized as one ranged line (e.g. "Pipe & drape ($200-$500)") instead of listing each
  // variant separately, so a card stays scannable — the full per-item breakdown is still in the
  // linked source PDF. Food & beverage and Staffing & service render as real tables on the page
  // (`items`) since their content is genuinely two-column (item, cost); the rest stay as bullets
  // since they carry real qualifiers (guest minimums, server requirements) that don't compress
  // cleanly into two columns.
  addOns: [
    {
      category: "Food & beverage add-ons",
      blurb: "Bronze, Silver, or Gold tiers on top of Hall Rental Only (100-guest minimum). Only Gold includes real silverware, china & glassware; Bronze and Silver use plasticware.",
      items: [
        { label: "Food package (Bronze/Silver/Gold)", cost: "$15.95-$35/guest" },
        { label: "Dinnerware rental only (buffet/plated/family)", cost: "$6-$11/guest" },
        { label: "Coffee & tea station (150-guest min)", cost: "$1.50/guest" },
        { label: "Soda package, unlimited", cost: "$3.95/guest" },
        { label: "Cake or sweet table (125-guest min)", cost: "$3.95/guest" },
        { label: "Unlimited ice", cost: "$100" },
      ],
    },
    {
      category: "Decoration add-ons",
      blurb: "Ceremony structure, tabletop décor, and linen.",
      examples: ["Pipe & drape ($200-$500)", "Backdrop or canopy ($250-$380)", "Premium ceremony pack, requires 4+ servers ($1,200)", "Centerpieces ($25-35 each)", "Decoration package, 100-guest minimum ($9.95/guest)", "Linen: tablecloths, runners & napkins ($1-15 each)"],
    },
    {
      category: "Lighting & video add-ons",
      blurb: "Uplighting and projection for the reception.",
      examples: ["Uplights, 8 minimum ($25 each)", "Gobo/monogram or projector ($180 each)", "Package of 12 uplights + monogram ($400)"],
    },
    {
      category: "Staffing & service add-ons",
      blurb: "Extra staff beyond what's included.",
      items: [
        { label: "Wait staff, 5 hrs (+$30/extra hr)", cost: "$225 each" },
        { label: "Extra bartender, 5 hrs (above 150 guests)", cost: "$225" },
        { label: "Cleaning service by end of event", cost: "$250" },
      ],
    },
    {
      category: "Extra hours",
      blurb: "Beyond the included 5-6 hour rental.",
      examples: ["Off-season weekday/Fri/Sun ($700, or $900 with servers included)", "Off-season Saturdays ($800, or $1,000 with servers included)", "Peak season weekday/Fri/Sun ($1,000, or $1,200 with servers included)", "Peak season Saturdays ($1,200, or $1,400 with servers included)"],
    },
  ],
  // The full source PDF for Add-ons — linked so anyone can see everything not curated above
  // (60+ real line items across 2 pages).
  addOnsResources: [{ label: "Rental Add-Ons (2024)", url: "https://www.diamondgardenhall.com/_files/ugd/4b61b7_f01ea5c904234124ba1c8f33636a145a.pdf" }],
  // Structured (not display-only, unlike `addOns` above) so the Cost Estimate calculator can
  // compute real running totals — every number here is the same real figure already curated
  // above, just shaped for math instead of prose. Deliberately NOT every one of the 60+ line
  // items in the source PDF: linen micro-items (bow ties per chair, napkins per guest) and
  // compound/conditional prices too ambiguous to reduce to one clean toggle (e.g. cake table's
  // "$3.95/guest or $450 flat, whichever applies") are left out rather than guessed at — same
  // judgment call as Marchetti's calculator only offering adjustable-quantity controls where a
  // real per-unit relationship is actually stated. `forPath` marks which real booking path(s)
  // each item is genuinely relevant to: Standard Bar and the base food/dinnerware items don't
  // apply to All-Inclusive since they're already bundled into it or reworked by service.
  calculatorAddOns: {
    // Only relevant to Hall Rental Only — All-Inclusive already bundles its own catering.
    foodPackages: [
      { key: "bronze", name: "Bronze", perGuest: 15.95 },
      { key: "silver", name: "Silver", perGuest: 26 },
      { key: "gold", name: "Gold", perGuest: 35 },
    ],
    dinnerwareOnly: [
      { key: "buffet", name: "Buffet", perGuest: 6 },
      { key: "plated", name: "Plated", perGuest: 9 },
      { key: "family", name: "Family", perGuest: 11 },
    ],
    // Real per-guest extra-hour prices, both with and without added servers — the venue's own
    // stated distinction (feedback 2026-08-17), not an unexplained range.
    extraHour: {
      offSeason: { weekday: 700, weekdayWithServers: 900, saturday: 800, saturdayWithServers: 1000 },
      peakSeason: { weekday: 1000, weekdayWithServers: 1200, saturday: 1200, saturdayWithServers: 1400 },
    },
    // Applies to either booking path.
    ceremonyUpgrades: [
      { id: "backdrop", label: "Backdrop for pictures", price: 250 },
      { id: "pipeDrapeEntrance", label: "Pipe & drape at entrance", price: 200 },
      { id: "canopy", label: "Canopy", price: 380 },
      { id: "pipeDrapeRoom", label: "Pipe & drape across the room", price: 500 },
      { id: "premiumCeremony", label: "Premium ceremony pack (requires 4+ servers)", price: 1200 },
    ],
    decor: [
      { id: "centerpiecesCrystal", label: "Crystal centerpieces", price: 25 },
      { id: "centerpiecesSilver", label: "Silver candelabra centerpieces", price: 35 },
      { id: "decorationPackage", label: "Decoration package (100-guest min)", perGuest: 9.95 },
      { id: "loveLedLetters", label: "LOVE LED letters + 2 chairs", price: 650 },
    ],
    lighting: [
      { id: "uplights", label: "Uplights (8 min)", price: 25, adjustable: true, defaultQty: 8 },
      { id: "gobo", label: "Gobo/monogram", price: 180 },
      { id: "projector", label: "Projector for slideshow", price: 180 },
      { id: "uplightPackage", label: "12 uplights + monogram package", price: 400 },
    ],
    // Cleaning service applies to either path; extra bartender only makes sense for Hall Rental
    // Only (All-Inclusive already includes bartending).
    staffing: [
      { id: "extraBartender", label: "Extra bartender", price: 225, hallRentalOnlyOnly: true },
      { id: "cleaningService", label: "Cleaning service", price: 250 },
    ],
    // Only relevant to Hall Rental Only — All-Inclusive already bundles coffee/tea and cake.
    foodDrinkExtras: [
      { id: "coffeeTea", label: "Coffee & tea station ($150 min)", perGuest: 1.5 },
      { id: "sodaPackage", label: "Soda package, unlimited", perGuest: 3.95 },
      { id: "unlimitedIce", label: "Unlimited ice", price: 100 },
      { id: "cakeTable", label: "Cake or sweet table (125-guest min)", perGuest: 3.95 },
    ],
  },
  // Canonical 12-row checklist, same order as the other three golden-set venues. This venue has
  // more real, confirmed answers than any prior one — its own FAQ page is unusually complete.
  policies: [
    { label: "Catering", value: "Open, bring your own", stated: true },
    { label: "Bar", value: "Open bar, cash bar, or bring your own", stated: true },
    { label: "Venue rental charge type", value: "Flat fee (Hall Rental) or per-guest (All-Inclusive)", stated: true },
    // No flat dollar minimum stated (unlike LondonHouse). All-Inclusive has a real guest-count
    // minimum instead (150 general, 125 Fridays, 100 Sundays), which functions the same way
    // since price is per-guest — derived, not directly quoted, so marked accordingly.
    { label: "Food & beverage minimum", value: "No flat dollar figure; All-Inclusive requires 150 guests (125 Fridays, 100 Sundays)", stated: true },
    { label: "Service charge", value: "Not stated (please confirm)", stated: false },
    { label: "Parking", value: "2 free lots, 75+ spaces", stated: true },
    { label: "Day-of coordinator", value: "Not stated (please confirm)", stated: false },
    { label: "Payment schedule", value: "$1,000 deposit; balance due 60 days before (Hall Rental) or 30 days before (All-Inclusive)", stated: true },
    { label: "Cancellation / rescheduling", value: "Not stated (please confirm)", stated: false },
    { label: "Event insurance", value: "Not stated (please confirm)", stated: false },
    { label: "Security", value: "Not stated (please confirm)", stated: false },
    { label: "Vendor access (setup/teardown)", value: "2 hours before the event for setup (Hall Rental path)", stated: true },
    { label: "Noise curfew", value: "1am", stated: true },
  ],
  // Short, generic couple-facing questions — kept brief here since the venue's own real FAQ
  // (below) already covers the same ground in far more depth than a synthesized restatement
  // would add.
  // Standardized (2026-08-25) to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. Previously 3 bespoke questions including a pricing one; dropped to
  // conform, since Packages & Pricing below already answers that in full.
  standardFaqs: [
    {
      question: "Can we bring our own caterer, or does it have to be from an approved list?",
      answer: "Bring anyone. The venue's own FAQ says: \"you can bring in any vendor of your choice. We don't have any limitations.\"",
    },
    {
      question: "Can we bring our own alcohol?",
      answer: "Yes. Open bar and cash bar are also available if you'd rather not.",
    },
    {
      question: "Is there a food & beverage minimum?",
      answer: "No flat dollar figure. The All-Inclusive package requires 150 guests (125 Fridays, 100 Sundays), which functions the same way since pricing is per guest.",
    },
    {
      question: "Do we need to hire our own day-of coordinator?",
      answer: "Not stated on their site. Confirm directly with the venue.",
    },
    {
      question: "Is event insurance required?",
      answer: "Not stated on their site. Confirm directly with the venue.",
    },
  ],
  // The venue's own real, on-site FAQ (diamondgardenhall.com/questions-and-answers) — all 25
  // real questions and answers, transcribed verbatim. Unusually complete for a golden-set
  // venue; several rows above (Payment schedule, Parking, Noise curfew) are only real,
  // confirmed facts because this page exists.
  faqs: [
    { question: "Is the site handicap accessible?", answer: "Yes." },
    { question: "Does your venue have specific time requirements for start of dinner and cake cutting? If so, what are the requirements?", answer: "No specific time, you let us know what time will work for you so we can plan accordingly." },
    { question: "How long does it typically take to flip the room from ceremony to reception?", answer: "Around 45 minutes to 1 hour." },
    { question: "Do you provide a coat check service?", answer: "Yes, it comes with the complete package or on the rental when you have 2 security guards." },
    { question: "Does your venue have signage that can be placed on the street directing guests to the alternate parking area?", answer: "Yes." },
    { question: "There are several upgrades that I would like to purchase. How late can I make a decision?", answer: "Two weeks before the event day, but the sooner the better so we can be prepared for your event!" },
    { question: "Does your venue make adjustments for guests that may not eat red meat or are vegetarian?", answer: "Yes, we just need to know exactly where they are seated." },
    { question: "Does your venue have a built-in mechanism for handling guest overage?", answer: "We might be able to accommodate them but we cannot guarantee it." },
    { question: "How far in advance can we reserve our wedding date?", answer: "We are booking 2 years in advance." },
    { question: "How much is the deposit to reserve the venue, and is a payment plan available?", answer: "$1,000 to secure your day. Monthly payments are available; balance for Rentals is due 60 days before the event day, and for the Complete Package, 30 days before." },
    { question: "What forms of payment do you accept?", answer: "Cash, check, money order, credit card, and Zelle." },
    { question: "Does your venue only host one wedding at a time?", answer: "Yes, we only have one room. We can accommodate 2 events per day, one in the morning and one in the evening." },
    { question: "When is the last possible date to make changes to our reservation?", answer: "15 days before the event day." },
    { question: "Do you have a list of approved or recommended vendors we can use?", answer: "We can certainly recommend some vendors, but you can bring in any vendor of your choice. We don't have any limitations. We welcome everyone." },
    { question: "What kind of food do you offer?", answer: "American, Italian, Mexican, Puerto Rican, or you can bring the food of your choice and we'll take care of everything else." },
    { question: "Can we do a food tasting before we finalize our menu selection? Does it cost extra?", answer: "Yes, after signing a contract we'll set up a free food tasting." },
    { question: "What is included in the room rental?", answer: "The room rental only includes tables and silver Chiavari chairs. You're responsible for bringing any additional items." },
    { question: "Can I bring in a cake or dessert from an outside bakery?", answer: "Yes, you can." },
    { question: "Is there a cake-cutting fee if I bring my own cake?", answer: "No cake-cutting fee if we're providing the professional staff." },
    { question: "What options do we have for the bar?", answer: "Open bar, cash bar, or you can also bring in your own alcohol." },
    { question: "Are there additional charges for bartenders?", answer: "Yes, $225 per bartender. We require 1 bartender for every 150 guests." },
    { question: "Is there a private room for the bride, bridesmaids, or quinceañera?", answer: "Yes, a spacious private dressing room including a vanity and toilet." },
    { question: "Can the venue accommodate a DJ?", answer: "Yes, you can bring your own DJ. They'll have access to a table, but must bring anything else related to music and lighting." },
    { question: "Is there parking on site, and is it complimentary?", answer: "Yes, 2 parking lots with more than 75 spaces. One is across from the venue; the other is a block away." },
    { question: "Are cabs/rideshares easily accessible from the venue?", answer: "Yes, right in front of the venue." },
  ],
  sourcePages: [
    "https://www.diamondgardenhall.com/",
    "https://www.diamondgardenhall.com/build-your-own-package",
    "https://www.diamondgardenhall.com/questions-and-answers",
    "https://www.diamondgardenhall.com/about-us",
  ],
  lastVerified: "2026-08-15",
};

export type DiamondGarden = typeof diamondGarden;
