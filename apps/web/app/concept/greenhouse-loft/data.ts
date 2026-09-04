/**
 * Golden record for Greenhouse Loft (vendor_id 1300, `venue_enrichment` row 1300 — the "1" that
 * appears in quality-rubric.md/score-pass docs is that doc's own eval-slate row number, not this
 * table's id; confirmed directly against the DB before building) — fifth golden-set venue, and
 * the first deliberately *ordinary* one. The 4 built before this are all non-standard: a grand
 * multi-room event venue (Marchetti), a museum (Field Museum), a hotel (LondonHouse), and a
 * purpose-built banquet hall (Diamond Garden). Greenhouse Loft is picked specifically because
 * it's the opposite: a plain, single-space Chicago event loft — probably the single highest-
 * volume real archetype in the catalog (golden-set-template.md §6) — chosen so the template
 * isn't over-fit to 4 unusual venues.
 *
 * Also chosen because three real, already-documented gaps from quality-rubric.md needed a real
 * fix, not a hypothetical one:
 * - `policies.catering_conditions` — "open" catering, but with a real composting/sustainability
 *   caveat sourced from a linked PDF. Read that PDF directly (2026-08-24, image-based, no text
 *   layer — same as Diamond Garden's menu PDFs, read via the file reader, not WebFetch's HTML
 *   parser): LEED Platinum certified building, mandatory recycling + composting at every event,
 *   no plastic disposables. See `cateringGuidelinesUrl` and the Policies/Food & Beverage sections.
 * - The prior automated extraction pass missed ~7 of 18 published "what's included" items (DJ
 *   services, photobooth, parking count, candle treatment, security, dedicated venue manager).
 *   Re-verified by reading the real homepage's "included amenities" block directly, line by
 *   line — it's genuinely 18 items, transcribed verbatim below in `sharedIncludes`, all 18 now
 *   present including every one of the 7 previously missed.
 * - The venue's own site linking to itself, previously misclassified as its own "vendor" — the
 *   DB's `network_vendors` field for this venue is now empty (own-domain guard already fixed
 *   upstream), reconfirmed directly: the real site has no preferred/approved vendor list at all
 *   ("Do you take commissions from other vendors? Absolutely not."), so there's no Vendors
 *   section here — not thin data, genuinely nothing to list, same as Diamond Garden.
 *
 * Structurally different from all four prior venues:
 * - Genuinely ONE rental, not multiple bookable spaces or pricing paths — "the entire loft space
 *   + adjacent outdoor garden + art gallery space" rents together as a single flat per-event fee
 *   that varies only by season and day of week (real 2026-2027 rate grid, both fetched directly
 *   from the homepage and cross-checked against the DB's `fee_schedule`). Structurally closest to
 *   Diamond Garden's "one room" simplicity, but even simpler: Diamond Garden had two real,
 *   independent pricing paths (rental-only vs. all-inclusive); this venue has exactly one. No
 *   standalone Pricing section per golden-set-template.md's own rule ("only as its own section
 *   when the venue has multiple real pricing paths") — the one real rate grid lives in the Space
 *   section instead, same placement precedent as LondonHouse/Field Museum before Diamond Garden
 *   introduced the split.
 * - Both catering AND bar are single-pill BYO — "open catering list" (any licensed/insured
 *   caterer) and BYOB (no in-house bar service, venue provides the physical bar + mobile bars
 *   only). A real, confirmed single-pill finding on both counts, not a research gap — checked the
 *   FAQ, amenities page, and homepage directly for all three pill types before concluding neither
 *   à la carte nor all-inclusive apply to either.
 * - What's Included is unusually rich for this venue specifically because the venue is genuinely
 *   all-inclusive-by-rental: DJ (Style Matters), photobooth, videowall/projector + graphic design,
 *   two event liaisons, security, candle treatment, and parking are all bundled into the one flat
 *   fee, not sold as add-ons — a real, decision-relevant difference from a venue that charges for
 *   each of those separately. Add-ons & extras is correspondingly thin (just parking upgrade and
 *   rehearsal — the only two things this venue genuinely sells piecemeal) — a real finding about this venue's
 *   shape, not a research gap.
 * - Real, LEED-Platinum-certified sustainability angle, genuinely decision-relevant (own tagline:
 *   "Chicago's most sustainable event venue") — used as the 5th quick-fact pill per
 *   golden-set-template.md §3's bar for a distinctive, non-invented 5th pill (same precedent as
 *   Marchetti's climate pill, LondonHouse's hotel pill), and as the first "Differentiator
 *   spotlight" section (see `differentiator` below and golden-set-template.md §4) — a generic
 *   slot for whatever's genuinely unique about a specific venue, not a sustainability section
 *   every future venue gets by default.
 * - Real, correctly-labeled 3-tile capacity match: the venue's own site states three distinct,
 *   separately-labeled maximums (seated w/ DJ: 175, seated w/ band: 150, cocktail: 200) — the
 *   first golden-set venue where all three tiles get real, distinctly-labeled numbers instead of
 *   1-2 tiles greyed out.
 * - The DB's automated extraction split the outdoor space into two separate "spaces" (Outdoor
 *   Garden + Skygarden). Re-checked directly against the real site: these are the same physical
 *   outdoor area, described in two different contexts (a capacity sentence on the homepage vs. a
 *   dedicated page section on /amenities-1) — merged into one real space here, not modeled as two,
 *   same class of fix as Diamond Garden's mis-split "spaces" (§ the DB facts listed 5 "spaces"
 *   for Diamond Garden that were really guest-count minimums, not rooms).
 *
 * Real conflicts found directly on the venue's own site, resolved with one number each rather
 * than shown as on-page hedges (feedback 2026-08-24: "let's be consistent" / "let's go with min
 * sq ft" — pick one and move on, rather than making the couple read two numbers and a caveat):
 * - Square footage: the FAQ page states "5000 sq ft skygarden, 3600 sq ft loft, 2000 sq ft art
 *   gallery" (verbatim); the /amenities-1 page states the outdoor space is "3500 sq ft." Resolved
 *   to the smaller, more conservative number (3,500) for the on-page Indoor/Outdoor split; the
 *   5,000 figure is dropped rather than shown as a caveat.
 * - Furniture counts: the homepage's own "included amenities" list says "25 8'x30" custom farm
 *   tables" and "200 white Tolix chairs (indoors) + 200 natural wood folding chairs (outdoors)";
 *   the /amenities-1 page says 23 farm tables and 175 of each chair type. Resolved to the
 *   homepage's numbers (25 / 200 / 200) without an on-page caveat, since that's the page framing
 *   this as one bundled inclusions list — the source of truth for "what's included."
 * - Cocktail-style maximum: the homepage's own structured capacity line says "cocktail style
 *   reception - maximum of 175 guests"; its FAQ separately says "at our maximum capacity, we can
 *   host events such as a cocktail party reception for up to 200 people." Resolved to 200
 *   everywhere on the page (quick facts and the capacity tile both now say 200) rather than
 *   showing 175 on the tile with a 200 footnote.
 * - Payment schedule: the homepage states the remaining 50% balance is "due 10 days prior to your
 *   wedding"; the FAQ separately says "the remaining balance about a month out." Both real, both
 *   quoted in the Policies row — not reconciled into one number, since these are two directly
 *   conflicting stated terms (not a rounding/context difference like the ones above), which is
 *   exactly the kind of thing a couple booking this venue should know to double-check.
 *
 * Could not confirm a direct embeddable URL for the venue's own virtual tour: /tour is a
 * Squarespace page whose actual 360° content loads from a third-party script
 * (vtours.360chicagotours.com/public/shareScript.js, keyed to a short tour id found in the raw
 * HTML) — same class of limit as Diamond Garden's Wix tour pages and Field Museum's Vimeo wall.
 * Confirmed directly (curl -I) that /tour itself sends no X-Frame-Options/CSP header, so it's
 * safe to frame the venue's own real page (same PageLightboxButton pattern as the other three
 * venues that hit this limit) rather than guess the third-party tour's real embed URL.
 * /event-gallery has real, wedding-specific photos with photographer credits (Jennifer Shaffer,
 * JPP Studio, Elizabeth Greve, Thomas Slack) baked into image filenames, but none of it is
 * presented as clickable named-wedding features, press, or blog posts — so no Featured Weddings
 * section (golden-set-template.md §4's bar requires real links out, not just uncredited photos).
 * No real Instagram wedding-stack content either: the account (@greenhouseloft, `accounts.id`
 * 477) exists in the graph, but has zero posts and zero wedding_posts rows — confirmed directly
 * against the DB, not assumed. Photos moved up right after Quick facts (Diamond Garden's
 * no-stack placement) accordingly.
 *
 * Added 2026-08-26: the venue's real "GHL Service Agreement" (linked in Policies, see
 * `serviceAgreementUrl`) — a fillable contract template, not a public rate sheet. Confirmed it's
 * genuinely older (dated January 2021) than the live site's pricing, so used only for real,
 * dollar-figure-independent findings: a real 3-tier cancellation fee schedule exists (What's
 * Included row + Policies), an overstay fee and a real building-wide noise rule beyond the
 * midnight cutoff (Noise curfew), a post-event cleaning fee if the space isn't left broom-clean
 * (Add-ons & extras), and — the one genuinely surprising find — GHL may film the event with its
 * own videographer at its own cost and gives the couple a free copy of the edited video, footage
 * usable for GHL's own marketing (What's Included, Entertainment). Every specific dollar amount
 * and percentage in the template itself (deposit %, cancellation tiers, overage rate, cleaning
 * fee, guest caps) is a blank filled in per booking, so none of those numbers are shown as public
 * facts, only the real structure they reveal.
 *
 * Sources (all fetched directly, 2026-08-24 unless noted): greenhouseloft.com, /faq, /amenities-1,
 * /sustainability-1, /contact-1, /tour, /event-gallery, the real
 * "Greenhouse-Loft-Catering-and-Composting-Guidelines.pdf" linked from /amenities-1 (read directly
 * as an image PDF), and the real service agreement PDF above (read 2026-08-26). Photos resolved
 * from the real Google Places photo names on this vendor's row (vendors.id 1300) via the Places
 * API (New) photo media endpoint, same one-time-resolution approach as the other four venues.
 */

export const greenhouseLoft = {
  vendorId: 1300,
  placeId: "ChIJNbokr4bSD4gRsRJAiNhkM68",
  name: "Greenhouse Loft",
  categoryLabel: "Event Loft",
  address: "2545 W Diversey Ave, Chicago, IL 60647",
  phone: "(312) 733-5762",
  website: "https://www.greenhouseloft.com/",
  rating: 4.8,
  reviewCount: 246,
  // Kept venue-level (the pitch), distinct from `space.description` below (the physical
  // layout) — feedback 2026-08-24: the two read too similarly at first draft. "Green Exchange
  // building" is a real fact from the FAQ, added here since it grounds the sustainability pitch
  // in something specific rather than just the tagline. The building-history sentence (feedback
  // 2026-08-25: "you can include some of this history in the about venue part") is condensed from
  // the venue's own real "Green Exchange History" copy on /sustainability-1: built in 1913 as
  // Vassar Swiss Underwear Company's knitting mill, later a Fredrick Cooper Lamps factory
  // (1967–2005), before being redeveloped into today's LEED Platinum building.
  about:
    "Chicago's most sustainable event venue, a fully customizable loft on the second floor of the Green Exchange building in Logan Square. Built in 1913 as a knitting mill and later a lamp factory, the building was redeveloped into today's LEED Platinum home for green commerce. One flat-fee rental covers the entire space, so you're not choosing between rooms or piecing together a package.",
  // Resolved from the real Google Places photo names on this vendor's row via the Places API
  // (New) photo media endpoint — same one-time-resolution approach as the other four venues.
  photos: [
    "https://lh3.googleusercontent.com/place-photos/AG9NLjAUbPfhv_tAgl8oVRsGyKsJTmwDQXByqvjnH08pqke_IC2SvTDtYGxY0ggoEGwP39FNYmexwIsdFC6fRNZB0IG5-k5AxAX8ZbUD3bCR7WALe7OveaoASHhbS2Mb16jmhJmcWagpkVQKBBWEso3TF_7gzg=s4800-w1600",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjDsyba8UUu2nCNgCht1M5Zkzt7LsOZN-5VSHtJ0wUM3NuxQC-gHhLbf2acOwaQ_LalJO-9bGk0jDXoKUMB-8pyuFcUlFU82xeMgIDIJnJqIwWeOKL_uh2_KdcaRKJhFJT_xhFB9EtuRsMVJ=s4800-w900",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjCWYzDCs3EFlPoIhA8E1RCOjfQ_4GRiikMsAcQDoMdwcRsYqVmyvRCw_XdwYZzT_HowZPVBDDR-ly0zJu9rqdRQu1jWJgtQjq4Hw6P8KmrkahwFq4ZwxYzX14v8Me8gpZa6dJGtcCk3D_WyOGs=s4800-w1600",
  ],
  quickFacts: [
    {
      icon: "guests",
      label: "25 – 200 guests",
      note: "The venue's own FAQ: \"We can create an intimate gathering for groups as small as 25, or design a sit-down meal for 175. At our maximum capacity, we can host events such as a cocktail party reception for up to 200 people.\"",
    },
    {
      icon: "setting",
      label: "Indoor & outdoor",
      note: "The main glasshouse loft is indoor, and it opens onto an outdoor Skygarden. Both are included in every rental, since only one event is ever booked here at a time.",
    },
    {
      icon: "catering",
      label: "Catering: BYO (open list)",
      note: "The venue's own FAQ: \"We have an open catering list because we think you'll appreciate having a choice. Select any licensed and insured caterer you'd like.\" Caterers must follow Greenhouse Loft's own composting/sustainability guidelines (see Policies).",
    },
    {
      icon: "bar",
      label: "Bar: BYOB",
      note: "The venue's own FAQ: \"Bar packages are insane at other venues. Do you have one? Absolutely not. We're BYO.\" Greenhouse Loft provides the physical bar and mobile bars, not alcohol or bartending service.",
    },
    // 5th pill, per golden-set-template.md §3: a genuinely distinctive, decision-relevant fact,
    // not invented to fill space. This venue's own tagline is "Chicago's most sustainable event
    // venue," and the real LEED claim (not found on the main site nav — only in the linked
    // catering PDF, read directly) backs it up.
    {
      icon: "sustainability",
      label: "LEED Platinum certified",
      note: "From the venue's own Catering & Composting Guidelines PDF: \"Our building is Certified Platinum LEED, the highest ranking possible from the U.S. Green Building Council.\" This isn't stated on the main site nav, only in this linked document.",
    },
  ],
  // Not a "sustainability section" as a category every future venue gets by default (feedback
  // 2026-08-24: "not a generic slot... only include it if there's something on their website that
  // makes it truly unique or notable, as this one has"). This section exists here specifically
  // because Greenhouse Loft's own /sustainability-1 page backs up its tagline with real, specific,
  // verifiable practices, most of which weren't surfaced anywhere else on this page before now
  // (only the LEED claim, via a quick-fact pill). See golden-set-template.md §4 (Differentiator
  // spotlight).
  //
  // Two subsections (feedback 2026-08-25), matching the venue's own real page structure, shown
  // Highlights-first then Reduce/Reuse/Recycle (feedback 2026-08-25) — the building highlights
  // are the more immediately compelling, photo-friendly facts (the sky garden, LEED cert), so
  // they lead. The 5 highlights picked are the ones a couple would actually find compelling out
  // of the real page's 6 (skipped the co-op vegetable garden as the least decision-relevant one).
  // LEED Platinum stays as a highlight bullet, not a separate pill (feedback 2026-08-25: a
  // standalone pill here duplicated the quick-facts pill above it). No link out to the
  // sustainability page itself (feedback 2026-08-25: "that's not like a core resource") — the
  // content is fully surfaced here instead, unlike the catering guidelines PDF, which stays
  // link-only since it's a full document. Bullets condensed to short phrases (feedback 2026-08-25:
  // the section was taking up too much space) — every real fact is kept, just worded as tightly
  // as the venue's own page already does, not full restated sentences.
  //
  // Real correction worth flagging: the URL originally used here (greenhouseloft.com/sustainability)
  // turned out to be a stale, unlinked page missing "Highlights" and "Green Exchange History"
  // entirely; the real, currently-linked page (confirmed via the live site nav) is
  // /sustainability-1, which is what every fact below is actually sourced from.
  differentiator: {
    title: "Sustainability",
    highlights: [
      "LEED Platinum certified, the top rating from the U.S. Green Building Council",
      "8,000 sq ft sky garden with native prairie plants",
      "Indoor air quality sensors & filtration",
      "Low-VOC paints & eco-friendly materials",
      "A green escalator (30% less energy)",
    ],
    reduce: [
      "Locally sourced catering encouraged",
      "Bulk serving, not single-use plastics",
      "Water-efficient fixtures & non-toxic cleaning",
      "Energy-efficient windows & HVAC (22% more efficient)",
    ],
    reuse: [
      "A restored former manufacturing facility",
      "Hardwood floors from reclaimed 120-year-old wood",
      "Restored mid-century furniture",
    ],
    recycle: ["Recycling & composting divert 90% of event waste"],
  },
  // Real, distinctly-labeled venue vocabulary — all three tiles get real numbers here, unlike
  // most prior golden-set venues. "Cocktail (standing)" uses 200 (feedback 2026-08-24: use one
  // consistent number rather than 175 on the tile with a 200 footnote — see header comment).
  capacityLabels: {
    seatedDj: "Seated (w/ DJ)",
    seatedBand: "Seated (w/ band)",
    cocktail: "Cocktail (standing)",
  },
  // Genuinely one rental spanning three named areas — confirmed directly: "Use of our entire
  // loft space + adjacent outdoor garden + art gallery space" is the venue's own first line of
  // what's included, not three separately bookable spaces. The DB's automated extraction split
  // the outdoor area into two "spaces" (Outdoor Garden + Skygarden); re-checked directly against
  // the real site — same physical space, described in two different contexts. Merged into one
  // here. `sqFtIndoor`/`sqFtOutdoor` are the two headline numbers a couple actually wants
  // (feedback 2026-08-24: "what does bride and groom quickly want to know on sq ft" — indoor vs.
  // outdoor, not a 3-way area breakdown); the Art Gallery's own sq ft is still named in `areas`
  // for the "Includes:" line, matching Marchetti's "Includes: Il Cortile (courtyard), the tented
  // ballroom, and the Montecatini Room (3,000 sq ft)" pattern of naming one distinctive room's
  // size inline rather than giving every room its own headline figure.
  space: {
    name: "Greenhouse Loft",
    capacity: { seatedDj: 175, seatedBand: 150, cocktail: 200 },
    sqFtIndoor: 3600,
    sqFtOutdoor: 3500,
    areas: [
      { name: "the Loft", note: "the main glasshouse room" },
      { name: "the outdoor Skygarden", note: null },
      { name: "the Art Gallery", sqFt: 2000, note: "used for cocktail hour" },
    ],
    // Distinct from `about` above on purpose — About is the pitch, this is the room-by-room
    // physical layout (feedback 2026-08-24). HVAC moved to What's Included > Space instead
    // (feedback 2026-08-26: "it goes better there") — see `sharedIncludes` below.
    description:
      "A glasshouse loft with 16' ceilings and floor-to-ceiling windows along the east wall, opening onto the outdoor Skygarden. A separate Art Gallery space serves as the cocktail-hour room. Only one event is ever booked here at a time, and every rental includes all three areas.",
    tourUrl: "https://www.greenhouseloft.com/tour",
    galleryUrl: "https://www.greenhouseloft.com/event-gallery",
    sourceUrl: "https://www.greenhouseloft.com/",
  },
  // Real 2026-2027 rate grid — the venue's only real pricing path (a flat per-event fee, not
  // per-guest), so it lives here in Space rather than in a standalone Pricing section per
  // golden-set-template.md §4 ("only as its own section when the venue has multiple real pricing
  // paths"). Fetched directly from the homepage and cross-checked against the DB's fee_schedule
  // (identical numbers). Split into short labeled fields (feedback 2026-08-24: the old single
  // `rentalHours`/`note` blob paragraphs were "hard to read") rather than one prose paragraph;
  // the "no additional or hidden fees" fact moved to the Policies "Service charge" row below,
  // since that's a policy fact, not a pricing-page footnote.
  // Split into three short, single-purpose fields (feedback 2026-08-25) instead of one Access
  // blob and one Saturday-rate footnote: access window, event length, and holiday pricing are
  // three different facts, not one.
  pricing: {
    offSeason: { months: "Jan – Mar", friday: 6000, saturday: 8000, sunday: 5000 },
    peakSeason: { months: "Apr – Dec", friday: 9000, saturday: 12000, sunday: 7000 },
    access: "Noon–12am, Fri/Sat/Sun (hard stop at midnight).",
    eventHours: "Sat/Sun events run up to 7 hrs; Friday starts 6pm or later. Weekdays are case-by-case.",
    holidayRates: "NYE and Memorial/Labor Day weekend Sundays are priced at the Saturday rate.",
  },
  // Real, all-18-facts-present, restructured (feedback 2026-08-24) as short label + detail pairs
  // instead of one flat sentence per row, so it reads at a glance ("Tables: ..." not a sentence
  // you have to parse to find out it's about tables) — fixes the documented quality-rubric.md gap
  // (a prior automated pass missed 7 of 18: DJ services, photobooth, parking count, candle
  // treatment, security, dedicated venue manager — every one of those facts is still present
  // below, just merged under a shared label where two homepage lines were about the same thing
  // — e.g. the DJ + DJ booth/sound lines, and the two bar lines). Numbers use the homepage's own
  // "included amenities" figures (25 tables / 200 / 200 chairs) without the amenities-page
  // caveat — see header comment.
  // "Coordinator" (not "Liaison") is the label, standardized to match how the Policies "Day-of
  // coordinator" row names this same role on every other golden-set venue (feedback 2026-08-24:
  // "isn't this something we have for other vendors, but it's called something different... word
  // it similarly at a high level and then describe it how the venue does"). The venue's own term
  // ("Greenhouse Loft Liaison") is kept in the detail text.
  // Grouped into 5 clusters (feedback 2026-08-24: "should we organize what's included better" —
  // a flat 15-item grid had started to blur together). Groups follow the real category lines
  // (space vs. furniture vs. entertainment vs. services vs. ambiance), not the venue's own
  // homepage order, which just lists everything in one undifferentiated block.
  sharedIncludes: [
    // "Bar space" moved here (feedback 2026-08-26, previously grouped under Furniture) — it's a
    // fixed, built-in part of the room (a 25' *permanent* bar), the same kind of fact as Bridal
    // suite/Coat check (fixtures of the space itself), not something guests sit at or that gets
    // rearranged the way Tables/Chairs do.
    {
      category: "Space",
      items: [
        // Reworded (feedback 2026-08-26, three passes: "this is a key feature right, it's all
        // yours, not many events at once" → "maybe we want to say exclusively yours: or like the
        // point is it's just yours" → "sequence and verbage is a bit odd... when you book you're
        // the only wedding that day, the loft, outdoor skygarden, and art gallery are exclusively
        // yours"). Leads with the human-terms version of the fact (you're the only wedding that
        // day) before the concrete list of what that means (the three named spaces) — matches the
        // venue's own real FAQ framing ("How many events per day do you hold? One. Yours.").
        { label: "Exclusively yours", detail: "When you book, you're the only wedding that day. The loft, outdoor Skygarden, and art gallery are exclusively yours." },
        { label: "Bridal suite", detail: "A private bridal suite / green room" },
        { label: "Bar space", detail: "A 25' permanent bar, plus mobile bars for the outdoor space and art gallery" },
        { label: "Parking", detail: "A 30-car lot, included" },
        { label: "Coat check", detail: "Multiple coat racks in the welcome area" },
        // Added (feedback 2026-08-26), from the venue's own real FAQ ("Are you wheelchair
        // accessible? Absolutely. The building is ADA accessible, with an elevator just off the
        // main entrance.") — real, decision-relevant, previously only sitting unsurfaced in the
        // raw FAQ list below.
        { label: "Accessibility", detail: "ADA accessible, with an elevator just off the main entrance to the second-floor loft" },
        // Moved here from Space's `description` (feedback 2026-08-26: "it goes better there") —
        // from the venue's own real FAQ ("How's the HVAC system? High tech! It cools quickly in
        // the summer and is nice and toasty in the winter.") — a real, decision-relevant fact for
        // an all-glass loft, same fixed-feature-of-the-room bucket as Accessibility/Parking.
        { label: "Heating & A/C", detail: "The space is fully climate-controlled with central heating and air conditioning, year-round" },
      ],
    },
    // Catering dropped entirely (feedback 2026-08-25: "open catering list isn't included... idk if
    // that's something we should highlight as what's included") — an open catering list is a
    // policy (you're allowed to pick), not something the venue provides; it's already covered in
    // Food & Beverage and the Policies checklist, so listing it here was the same category error
    // as the earlier Bar "(BYOB)" cleanup.
    {
      category: "Furniture",
      items: [
        { label: "Tables", detail: "25 farm tables (8'×30\") and 10 cocktail tables (28\")" },
        { label: "Chairs", detail: "200 white Tolix chairs indoors and 200 natural wood folding chairs outdoors" },
      ],
    },
    {
      // Split DJ (the talent) from Sound & AV (the equipment) instead of one merged "DJ & sound"
      // line (feedback 2026-08-25: "should be explicit that it includes a DJ, and Style Matters
      // is the company") — DJ names the real company; Sound & AV groups the booth, speakers, and
      // screens together as the technical setup, same distinction talent vs. equipment draws
      // everywhere else on this page (e.g. Coordinator vs. Security are both staff, kept apart
      // from furniture).
      category: "Entertainment",
      items: [
        { label: "DJ", detail: "DJ services from Style Matters DJs, with a DJ hand-picked for your event" },
        { label: "Sound & AV", detail: "A custom DJ booth with in-house VOID sound system indoors and out, plus a videowall/projector with in-house graphic design services" },
        { label: "Photobooth", detail: "A custom vintage photobooth with 2\"×6\" photostrips, digital copies delivered within a week" },
        // New (2026-08-26), found in the venue's own real service agreement (linked in Policies
        // below), not anywhere on the marketing site itself: contract §3.6.2 reads "Client grants
        // GHL Events, LLC permission to assign a videographer... for the purposes of marketing and
        // website content." No checkbox, no opt-out clause — worded as GHL's own right, not a
        // perk the couple selects (unlike the checkbox-gated items on the contract's cover page),
        // so "reserves the right to" rather than "may," to not read as something optional for the
        // couple. Both halves stated plainly: the free copy, and that GHL can use the footage.
        // "GHL" itself is real (the contract's own party name is "GHL Events, LLC"), but it's
        // never introduced to the reader anywhere else on this page, so spelled out here as
        // "Greenhouse Loft" for a couple reading this cold, matching the page's voice everywhere
        // else — "GHL" stays fine in dev-facing comments and citations.
        { label: "Videography", detail: "Greenhouse Loft reserves the right to film your event with its own videographer, at no cost to you; you'll get a free copy of the final edited video, and footage may also be used for the venue's own marketing" },
      ],
    },
    {
      // Split out of the old "Staff & extras" (feedback 2026-08-25) — Coordinator and Security
      // are genuinely people/services, while Candle treatment and Décor are ambiance items with
      // nothing to do with staffing; lumping them together wasn't a real category.
      category: "Services",
      items: [
        { label: "Coordinator", detail: "A dedicated Greenhouse Loft Liaison who works with you and your vendors leading up to and on the day of your event" },
        { label: "Security", detail: "Security personnel" },
      ],
    },
    {
      category: "Ambiance",
      items: [
        { label: "Candle treatment", detail: "Votives and hurricane glasses placed throughout the space" },
        { label: "Décor", detail: "A track & drape system" },
      ],
    },
  ],
  // Genuinely thin — this venue bundles almost everything (DJ, photobooth, security, liaison,
  // candle treatment, parking) into the one flat rental fee rather than selling it piecemeal, so
  // there's real structurally little left to add on top. A true finding about this venue's shape,
  // not a research gap — same "empty/thin beats padded" standard as everywhere else on this page.
  // Required insurance and the credit card fee used to be listed here too, but neither is a real
  // purchasable add-on the way parking/rehearsal are (feedback 2026-08-25: "I don't think these
  // are add-ons or extras... add-ons and extras are like corkage fee or ceremony fee") — both are
  // already covered as policy facts in the Policies section (Event insurance, Payment schedule),
  // so listing them again here was redundant and mislabeled. Shape changed (feedback 2026-08-25)
  // to flat per-item cards — name, price, then description — matching Field Museum's Add-ons
  // pattern instead of a category+table shape that only made sense with more line items per
  // category than this venue actually has (one real add-on each).
  addOns: [
    { name: "Additional Parking", price: "$500 flat", blurb: "75 more spaces available indoors, beyond the included 30-space lot." },
    { name: "Rehearsal", price: "$250/hr", blurb: "Bookable 6 weeks before your event, if the space isn't already rented the night before." },
    // New (2026-08-26), from the real service agreement (linked in Policies below) — a real,
    // contingent cost, not a purchasable extra like the two above, but the same "if this happens,
    // here's the cost" shape. Correction (2026-08-26, re-read of the PDF): the flat-fee figure is
    // NOT blank in the template — Section 2.3.1(C) states it plainly as $500.00, the greater of
    // that or GHL's actual cleaning cost. Shown as a real number, not "not stated."
    { name: "Cleaning Fee", price: "If not left broom-clean", blurb: "The greater of $500 or the venue's actual cleaning cost." },
  ],
  calculatorAddOns: {
    extraParking: { price: 500 },
    rehearsal: { pricePerHour: 250 },
    insuranceEstimate: 175,
    ccFeeRate: 0.035,
  },
  // Real Catering & Composting Guidelines PDF, read directly (2026-08-24, image-based, no text
  // layer) — a LEED Platinum building requiring mandatory recycling/composting at every event,
  // no plastic disposables, and detailed caterer load-in/load-out rules via a west-side freight
  // entrance. This is the real source of `catering_conditions` for the Policies section below.
  cateringGuidelinesUrl:
    "https://www.greenhouseloft.com/s/Greenhouse-Loft-Catering-and-Composting-Guidelines.pdf",
  // Real venue and event services contract, linked from Policies (feedback 2026-08-25/26: it's
  // entirely contract terms, cancellation, insurance, rules, fees, so it belongs with the section
  // that already summarizes those, not with Space's tour/gallery/floor-plan buttons). Read
  // directly (2026-08-26, image-based PDF, no ToUnicode CMap — same class of no-text-layer PDF as
  // Diamond Garden's menus, decoded via a manual stream-and-glyph extraction since this one wasn't
  // even OCR-friendly). It's a fillable template dated January 2021 — noticeably older than the
  // live site's "2026-2027" pricing, and every dollar figure and percentage in it (deposit %,
  // cancellation-tier percentages, per-hour overage rate, cleaning-fee flat amount, guest caps)
  // is a blank filled in per booking, not a public number. Treated as a real source for structure
  // and policy facts (a cancellation schedule exists, a cleaning fee exists, overstay is billed
  // hourly, GHL may film for its own marketing) rather than for any specific dollar amount.
  serviceAgreementUrl:
    "https://static1.squarespace.com/static/5489bdc5e4b0563d578c5190/t/600f1b64a4f4466e7d415241/1611602788773/GHL+SERVICE+AGREEMENT+January+2021.pdf",
  // Real, working floor-plan PDFs linked from the homepage — rendered as buttons in the Space
  // section (feedback 2026-08-24: floor plans belong next to the space itself, not in Add-ons).
  // The FAQ also links an older-dated third file ("GHL-Floor-Plans-07-22-19_NEWEST.pdf") for the
  // same "refer to our floorplans" band-capacity answer — treated as the same real resource, not
  // linked separately, to avoid presenting near-duplicates as distinct documents. A "Meetings"
  // floor plan also exists but is corporate-specific, not wedding-relevant, so omitted here.
  floorPlanResources: [
    { label: "Floor plans", url: "https://www.greenhouseloft.com/s/WEDDING-FLOORPLANS.pdf" },
    { label: "Floor plans <50 guests", url: "https://www.greenhouseloft.com/s/GHL-50_Or_Less_Floor_Plans.pdf" },
  ],
  // Canonical 13-row checklist, same order/wording as every other golden-set venue. Only 1 row
  // is genuinely unstated — this venue's FAQ (25 real questions) is unusually complete.
  // Restructured (feedback 2026-08-24) into a short, clear `value` plus an optional smaller-font
  // `detail` line, instead of one long sentence per row: "maybe we need clear answers, then in
  // smaller font the specifics... state more in smaller font from venue specifically." Verbatim
  // venue quotes are paraphrased down to a plain fact here rather than quoted in full — the real
  // quotes already live in the FAQ sections below, so a policy row doesn't need to repeat them.
  policies: [
    {
      label: "Catering",
      value: "BYO (open list)",
      detail: "Any licensed & insured caterer, following the catering guidelines (PDF above).",
      stated: true,
    },
    {
      label: "Bar",
      value: "BYOB",
      detail: "Greenhouse Loft provides the bar itself, not alcohol or bartending.",
      stated: true,
    },
    // Collapsed to one line (feedback 2026-08-25: Policies had gotten too text-heavy) — this fact
    // is simple enough not to need a separate detail line.
    { label: "Venue rental charge type", value: "Flat fee per event (varies by season & day)", stated: true },
    // Detail dropped (feedback 2026-08-25) — the Catering/Bar rows right above already say BYO,
    // so restating it here was redundant weight, not new information.
    { label: "Food & beverage minimum", value: "None", stated: true },
    {
      label: "Service charge",
      value: "None",
      detail: "Taxes are included in the rental rate; no hidden fees.",
      stated: true,
    },
    { label: "Parking", value: "30 spaces included", detail: "After 6pm weekdays, and all weekend. 75 more spaces are available indoors for $500.", stated: true },
    {
      label: "Day-of coordinator",
      value: "Included",
      detail: "Two Greenhouse Loft Liaisons (venue staff, not an independent planner) work every event, opener to closer.",
      stated: true,
    },
    {
      label: "Payment schedule",
      value: "50% deposit (non-refundable)",
      detail: "Balance due 10 days before the event per the homepage, though the FAQ separately says about a month out, so it's worth confirming. Credit card payments carry a 3.5% fee.",
      stated: true,
    },
    // Upgraded from a flat "Not stated" (feedback 2026-08-26) after reading the real service
    // agreement. Correction (2026-08-26, re-read of the PDF, §2.4.1): the 3-tier percentages
    // are NOT blank in the template — they're stated plainly in a table, not per-booking blanks.
    {
      label: "Cancellation / rescheduling",
      value: "25% / 50% / 100% by notice given",
      detail: "180+ days out: 25% of the fee. 61–179 days: 50%. 60 or fewer: 100%. Deposits already paid are credited toward whatever's owed.",
      stated: true,
    },
    {
      label: "Event insurance",
      value: "Required",
      detail: "About $175 through a third-party provider like WedSure or WedSafe. The real contract requires $1M/$2M general liability and $1M dram shop coverage.",
      stated: true,
    },
    // Detail dropped (feedback 2026-08-25) — "Included" already says it; What's Included covers
    // the same fact.
    { label: "Security", value: "Included", stated: true },
    {
      label: "Vendor access (setup/teardown)",
      value: "Noon to midnight",
      detail: "Caterers load in through the west-side freight entrance.",
      stated: true,
    },
    // Detail added (feedback 2026-08-26) from the real service agreement: staying past the
    // agreed end time is billed at the same hourly rate as extra rehearsal time, and there's a
    // real sound rule beyond the time cutoff itself.
    {
      label: "Noise curfew",
      value: "Midnight",
      detail: "Staying past your end time is billed at the same hourly rate as extra time. Music can't be audible outside the building.",
      stated: true,
    },
  ],
  // Standardized (2026-08-25) to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. The dropped DJ/photobooth question is a real, venue-specific find
  // — kept as a real point of interest, but it's now covered by What's Included instead of a
  // bespoke standard question.
  standardFaqs: [
    {
      question: "Can we bring our own caterer, or does it have to be from an approved list?",
      answer: "Yes, Greenhouse Loft keeps an open catering list. Bring any licensed and insured caterer, as long as they follow its catering and composting guidelines.",
    },
    {
      question: "Can we bring our own alcohol?",
      answer: "Yes, Greenhouse Loft is BYOB, giving you the choice and flexibility to build your own bar and keep costs down. The space includes a bar itself, a 25' permanent bar plus mobile bars, but not alcohol or bartending.",
    },
    {
      question: "Is there a food & beverage minimum?",
      answer: "No. Catering and bar are both BYO, so there's no minimum tied to either.",
    },
    {
      question: "Do we need to hire our own day-of coordinator?",
      answer: "No, one is included. Two Greenhouse Loft Liaisons work every event, one from around noon to 7pm and another from 5pm until close.",
    },
    {
      question: "Is event insurance required?",
      answer: "Yes, it's required, about $175 through a third-party provider like WedSure or WedSafe.",
    },
  ],
  // The venue's own real, on-site FAQ (greenhouseloft.com/faq) — all 25 real questions and
  // answers, transcribed verbatim directly from the page (2026-08-24). Re-verified against the
  // raw HTML after finding the DB's automated extraction had mismatched one Q&A pair (the
  // "square footage" question was paired with the rehearsal-booking answer in the DB facts —
  // fixed here with the venue's real, correctly-paired answer).
  faqs: [
    { question: "What is your maximum capacity?", answer: "We can create an intimate gathering for groups as small as 25, or design a sit-down meal for 175. At our maximum capacity, we can host events such as a cocktail party reception for up to 200 people." },
    { question: "Do you have a preferred or exclusive catering list?", answer: "Neither. We have an open catering list because we think you'll appreciate having a choice. Select any licensed and insured caterer you'd like and we will work hand-in-hand with them to achieve the highest standard of responsible and sustainable catering." },
    { question: "Your rental fee includes a lot. When can we come in for a tour?", answer: "You tell us! We show the space seven days a week." },
    { question: "What does your hold and booking process look like?", answer: "You can put a 14 day courtesy hold on any one available date you'd like. This must be done in writing via email. The hold starts the day you see Greenhouse Loft in person. Once two weeks has passed, if there's another party interested in the same date, you will have 48 hours to make your decision. After two weeks, we will honor your hold until another party challenges. If you decide to move forward, our agreement is in the Forms section of the website. Fill that out, shoot it back, and put your 50% deposit in the mail. Easy peasy." },
    { question: "What is your rental period?", answer: "For Fri/Sat/Sun events, you have access at 12:00pm. You can host an event up to seven hours on Saturdays and Sundays and events on Fridays must begin at 6pm or after. Events can not go past 12:00am. Weekday rentals are on a case-by-case basis." },
    { question: "Is parking available to my guests?", answer: "Parking is included in all rentals after 6pm weekdays and between 6:00pm Friday and 6:00am Monday. It's a 30 car lot just east of our building at Maplewood & Diversey. 75 more spaces are available underground for a $500 fee." },
    { question: "Where is Greenhouse Loft located?", answer: "2545 W. Diversey Avenue, Chicago, IL 60647. Greenhouse Loft is located on the second floor of the Green Exchange building, in the Logan Square neighborhood." },
    { question: "What is the square footage of your space?", answer: "5000 sq ft skygarden, 3600 sq ft loft, 2000 sq ft art gallery." },
    { question: "Bar packages are insane at other venues. Do you have one?", answer: "Absolutely not. We're BYO. Give Prestige a jingle and create a drink package that reflects your personalities. They'll reimburse you for anything that wasn't consumed. Your licensed and insured caterer will happily serve your guests. Cheers to that." },
    { question: "Do you have a private green room and/or wedding party suite?", answer: "Yes. We have a large private space available right outside of the garden ceremony area." },
    { question: "We understand that a DJ from Style Matters is included in the rental rate. How does that work?", answer: "About four to six weeks before your event, we will start determining who the best fit for your party might be. Style Matters is a large collective and you're going to have a lot of options." },
    { question: "How's the HVAC system?", answer: "High tech! It cools quickly in the summer and is nice and toasty in the winter." },
    { question: "Do you offer coat check?", answer: "Yes, there are multiple coat racks in our welcome area." },
    { question: "How many tables, chairs, and highboys do you have?", answer: "25 8' tables, 2 4' tables, 6 28\" highboys, 4 28\" cabaret tables." },
    { question: "We have a handful of guests in wheelchairs. Are you wheelchair accessible?", answer: "Absolutely. The building is ADA accessible, with an elevator just off the main entrance." },
    { question: "We need Wifi throughout the course of our event.", answer: "No problem, there's robust Wifi in the entire building." },
    { question: "What's the bathroom situation?", answer: "7 stalls in the women's, 7 in the men's, with a private family bathroom." },
    { question: "Do you have someone onsite during our event?", answer: "Yes, there will be two different Event Liaisons at your event. The opener will be there from 12-7pmish, and the closer from 5pm-very late." },
    { question: "Can we bring our dog to our event?", answer: "Yes, we are pet friendly. You may bring your dog to the ceremony." },
    { question: "How many events per day do you hold?", answer: "One. Yours." },
    { question: "We'd really like to have a band perform at our party. Is that allowed?", answer: "Yes. The recommended max guest count with a band is 125. Please refer to our floorplans." },
    { question: "Your rates are posted on the website but what additional fees might we incur?", answer: "All applicable state and federal taxes are built in to the rental rate and there are no additional or hidden fees. It is required that you purchase insurance, which should only be about $175 from sites like www.wedsure.com and www.wedsafe.com. We take 50% down and the remaining balance about a month out." },
    { question: "Do you take commissions from other vendors?", answer: "Absolutely not." },
    { question: "Can we bring in additional decor? Who will be responsible for setting it up and when would that happen?", answer: "Yes, you can bring your own decor. You will be responsible for setting it up and tearing it down." },
    { question: "Can we hold a short rehearsal the day before the event?", answer: "Yes, provided nobody else has rented the space the night before your event. You can book your rehearsal six weeks before your event for a $250/hr fee." },
    { question: "Your amenities list includes \"candle treatment\". What does that mean?", answer: "We will provide small candles in small votives and place them along ledges in the glasshouse and on the bar and center island. We will also provide mercury and hurricane glasses on the highboys, coffee tables, and end tables. You are responsible for bringing in your own decor for the dining tables." },
  ],
  sourcePages: [
    "https://www.greenhouseloft.com/",
    "https://www.greenhouseloft.com/faq",
    "https://www.greenhouseloft.com/amenities-1",
    "https://www.greenhouseloft.com/sustainability-1",
    "https://www.greenhouseloft.com/contact-1",
    "https://www.greenhouseloft.com/s/Greenhouse-Loft-Catering-and-Composting-Guidelines.pdf",
    "https://static1.squarespace.com/static/5489bdc5e4b0563d578c5190/t/600f1b64a4f4466e7d415241/1611602788773/GHL+SERVICE+AGREEMENT+January+2021.pdf",
  ],
  lastVerified: "2026-08-26",
};

export type GreenhouseLoft = typeof greenhouseLoft;
