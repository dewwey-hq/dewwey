/**
 * Golden record for The Geraghty (vendor_id 880 in `vendors`; account_id 507 in `accounts`) —
 * sixth golden-set venue. Pulled from `quality-rubric.md`'s eval slate ("Classic loft + FAQ/
 * vendors... Strong pages, known good baseline") specifically to build around one already-
 * confirmed, real bug: the rubric's "Multi-event-type page confusion" row notes our stored
 * floor plan for this venue was a Gala one, when the venue's own floor-plans page has real
 * wedding-labeled plans we missed. Re-checked directly (2026-08-24): the venue's own
 * thegeraghty.com/floor-plans page currently shows exactly 2 wedding-labeled plans (not 3, as
 * the rubric said when it was written — a real page-content change since then, not a
 * discrepancy to paper over), both capped at 300 guests: "Ceremony, Reception & Afterparty" and
 * "Ceremony & Reception." Both are used below — the `quickFacts` guest figure is deliberately
 * sourced from these two wedding-labeled plans (300), NOT the page's own "Maximum Capacity"
 * gala plan (1,000 seated) or its 650-guest corporate "Annual Meeting" plan, which is exactly
 * the failure mode the rubric flagged.
 *
 * A second, bigger real finding surfaced while building this page, worth documenting because it
 * is a NEW class of bug the golden set hasn't hit yet: this venue's account (id 507) is matched
 * into the graph pipeline, and the `weddings` table has 13 rows with venue_id=507 — but reading
 * every post's real caption directly (not trusting the table) shows only 6 are genuine weddings.
 * The other 7 are real corporate/gala posts that got swept into the wedding graph: a product-
 * launch/awards show for @ardalzaafaranofficial, a Ronald McDonald House Charities gala (co-
 * tagged @ronaldmcdonaldhousechicago as a second "venue"), a Uniting Voices Chicago gala, an
 * explicitly-captioned "Corporate layouts for every part of your day" post, a branded "Pink
 * Effect" event, and one thin "dinner" post with no wedding language and no planner/florist
 * credit. This is the multi-event-type contamination problem, but showing up in the *wedding
 * graph itself*, not just in a stored floor-plan image — a real, confirmed pipeline gap worth a
 * follow-up ticket (the `posts.wedding_score` column is null for every one of these 13 rows,
 * meaning the scorer that's supposed to catch exactly this never ran on them).
 *
 * One boundary case was deliberately excluded rather than smoothed either way: wedding_id 1255
 * ("The Geraghty holds space for both high-energy celebrations and intimate, lingering
 * pauses...") has a real, complete wedding-shaped vendor stack (planner, photographer, DJ,
 * florist) but zero bridal/wedding language and no catering credit — genuinely ambiguous
 * between a wedding and a large private party. Left out of `weddingStacks` below rather than
 * guessed either way; a real judgment call, not a silent omission.
 *
 * Structurally different from all 5 prior venues:
 * - Second venue (after Marchetti) with a real Wedding Stack — but a genuinely different vendor-
 *   policy shape than any prior venue: the venue's own FAQ names Kehoe Designs (décor) and
 *   BlackOak Technical Productions (A/V) as "exclusive event, production partners" — confirmed
 *   independently by every single real wedding post here crediting the identical two accounts
 *   for Floral+Décor and Lighting, while every OTHER category (planner, photographer, caterer,
 *   cake, DJ, hair/makeup, rentals, photobooth) rotates across different real companies wedding
 *   to wedding. So: 2 categories locked in-house, catering is a real "preferred partners" list
 *   with no exclusivity language found anywhere (the FAQ just says "yes, with a link" — genuinely
 *   softer than Field Museum's repeated "choose from our approved vendors" wording), and every
 *   other category is fully open. Not quite Marchetti (all in-house), not quite Field Museum
 *   (closed list), not quite LondonHouse/Diamond Garden (preferred/fully open) — a real middle
 *   shape none of the first 5 venues had. Kehoe Designs and BlackOak are shown separately as
 *   "Built-in partners," not mixed into the couple's-choice vendor category list.
 * - Bar is unambiguous and closed: "The Geraghty is not a BYOB venue... spirits, wine, and beer
 *   for your event are purchased from The Geraghty" (with one narrow carve-out: 501(c)(3)/(4)
 *   nonprofits may donate alcohol, $10/person corkage). Catering, by contrast, is genuinely
 *   unclear — no source anywhere states whether outside caterers are allowed, so the Policies
 *   row and quick-fact pill both say "preferred list" rather than asserting "required" or "open,"
 *   neither of which is backed by a real quote.
 * - Inquire-only pricing, same shape as Field Museum: "Rental prices are quoted upon request" is
 *   the venue's own FAQ answer, word for word. No Cost Estimate calculator, no Pricing section —
 *   folded into Space as an "Ask about pricing" callout, same pattern as Field Museum.
 * - Real "What's Included" section despite having only one space/booking path (no packages to
 *   share inclusions across) — justified anyway because the real list is substantial and
 *   genuinely different in character from every prior venue's: it leans production/AV (an
 *   overhead LED lighting rig, a distributed audio system, 25 stage decks, a VIP Green Room with
 *   its own bar), not just tables and chairs.
 * - No real embeddable virtual tour (checked the live page's HTML directly for a Matterport/
 *   iframe embed — none found), same class of gap as Diamond Garden's Wix tour and Field
 *   Museum's Vimeo wall. Links out via the same in-site PageLightboxButton lightbox instead of a
 *   guessed embed — confirmed thegeraghty.com sends no X-Frame-Options/CSP header that would
 *   block framing (checked directly), so the iframe genuinely works.
 * - This build also turned up a real, unrelated site issue worth flagging separately: the four
 *   prior golden-set pages (Marchetti's VendorStackDeck/RealWeddingDeck and Field Museum's
 *   vendor icons) reference /icons/*-svgrepo-com.svg files that no longer exist in
 *   apps/web/public/icons — the 2026-08-23 "Slot storefront" commit swept the app to one
 *   Phosphor icon family and appears to have deleted the old svgrepo set without anyone
 *   re-checking the /concept pages, which aren't part of the main app's build/lint path. This
 *   page's own vendor-category icons use lucide-react instead (already a dependency here, no
 *   missing-asset risk) rather than repeating the broken pattern — but the other 4 pages' vendor-
 *   category icons are currently broken images in production and out of this page's scope to fix.
 *
 * Sources (all fetched directly, 2026-08-24): thegeraghty.com, /about/, /features-amenities/,
 * /floor-plans/, /faq/, /caterers-partners/, /virtual-tour, /gallery/, /contact/, plus the
 * `vendors`/`accounts`/`weddings`/`wedding_posts`/`wedding_vendors`/`posts` tables in the
 * project's own Supabase DB (real venue-tagged wedding graph data, vendor_id 880 / account_id
 * 507) and the Google Places API (New) photo-media endpoint for `photos` (same one-time-
 * resolution approach as every prior venue).
 *
 * Reformatted 2026-08-26 as the first real test of the best-practice formats locked in on
 * Greenhouse Loft and written up in golden-set-template.md §2: What's Included regrouped into
 * labeled subcategories with label+detail rows, Policies split into a short pill-worthy `value`
 * plus optional `detail`, and both FAQ lists switched to the line-and-caret visual format. No new
 * facts were researched for this pass; two real fixes did surface from just reformatting
 * carefully: a parking-count inconsistency (155 in the old What's Included list vs. the
 * FAQ-sourced 150 everywhere else, corrected to 150) and a real, already-sourced inclusion
 * (the Sales Manager, straight from this file's own `faqs` array) that had never actually been
 * surfaced in What's Included. `lastVerified` intentionally left at the original research date
 * since no new source pages were fetched, only existing sourced facts reorganized.
 */

export const geraghty = {
  vendorId: 880,
  placeId: "ChIJgxr1AZgtDogRz6tUQtgY-NA",
  name: "The Geraghty",
  categoryLabel: "Event Venue",
  address: "2520 S Hoyne Ave, Chicago, IL",
  phone: "(312) 376-0880",
  website: "https://thegeraghty.com/",
  instagramHandle: "thegeraghty",
  instagramUrl: "https://www.instagram.com/thegeraghty/",
  rating: 4.7,
  reviewCount: 418,
  about:
    "A former paper mill transformed into a 25,000-square-foot event space in Chicago's Pilsen neighborhood, named for Mickey Geraghty Kehoe by her son, event designer Tom Kehoe. Uncompromising in its luxury and infinite details, the venue is completely customizable — one open floor with 22-foot ceilings, reconfigured for every event.",
  // Resolved from the real Google Places photo names on this vendor's row via the Places API
  // (New) photo media endpoint — same one-time-resolution approach as every prior venue.
  photos: [
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBoXZy574ex_1njf5OU23IYRkLFmX5VGUDWkEKe641LUenYWJIuLtIGbwtcdUD5BKRfaz7VY-l0KnIVdUhxpX79Bq4LkOZSPomqIYSKezxMc-4dN1N-vhx3NaytCLeW2HNVKOz6sjtM9vxneZY=s4800-w2048",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBNh2tQ69TAWIB2L1nt6fU5Db43qsZt5bLxf7ork5F7qKqor3k4dW1ZeqGqnm4RRdn1Ri7o1X_hz5iwKfn6bb73N_alTnYcSL7aYrbgFTI2FvD_WigjXecHphQkB6UMxZab0oGVkHSB4qAdpLQ=s4800-w4800",
    "https://lh3.googleusercontent.com/place-photos/AG9NLjBZ4DBGiV1WtutNtHgzqIt5Outik4P00Rcvxpts47tLm04Eu1ADcq-nTO_qa--SyE0oeEtvZOf6rnzEsw1rJXf2yXWsGtLChPBYjm8PdJtJJw-QfXkne3cPF9CksLBM9CTpqZOuF-l-f1S8pg=s4800-w2400",
  ],
  quickFacts: [
    {
      icon: "guests",
      label: "Up to 300 guests",
      // Deliberately sourced from the 2 real WEDDING-labeled floor plans (both cap at 300), not
      // the venue's own 1,000-seated "Maximum Capacity" gala plan or 650-guest corporate plan —
      // see file header for why this is the specific bug this venue was picked to re-verify.
      note: "From the venue's own 2 wedding-labeled floor plans (Ceremony, Reception & Afterparty; Ceremony & Reception), both capped at 300 guests. The venue's overall maximum across all event types is higher (1,000 seated, per its gala floor plan), but that's not a real wedding configuration.",
    },
    {
      icon: "setting",
      label: "Indoor",
      note: "One 25,000 sq ft indoor room. The private parking lot \"can be transformed into an outdoor event space\" per the venue's own FAQ, but that's a repurposed lot, not a built outdoor space.",
    },
    {
      icon: "catering",
      label: "Preferred caterer list",
      note: "The venue's own FAQ: \"Do you have a list of approved caterers? Yes\" (with a link). Neither the FAQ nor the caterers page ever says outside caterers are required or disallowed. Genuinely unclear, shown honestly rather than guessed either way.",
    },
    {
      icon: "bar",
      label: "Bar: in-house only",
      note: "\"The Geraghty is not a BYOB venue. The Geraghty maintains a liquor license, and the spirits, wine, and beer for your event are purchased from The Geraghty.\" One narrow carve-out: 501(c)(3)/(4) nonprofits may donate alcohol ($10/person corkage).",
    },
  ],
  capacityLabels: {
    seated: "Seated (wedding layout)",
    receptionAfterparty: "Reception + afterparty",
    cocktail: "Cocktail (standing)",
  },
  // Genuinely one open room (25,000 sq ft, 22 ft ceilings), reconfigured per event — not
  // multiple bookable spaces. Both real wedding floor plans cap at 300; neither the venue's site
  // nor its FAQ publishes a separate seated-only or standing-only wedding figure, so those two
  // tiles are shown unstated (LondonHouse's greyed "—" treatment) rather than reusing 300 under
  // a label the venue never used for it.
  space: {
    name: "The Geraghty",
    capacity: { seated: null as number | null, receptionAfterparty: 300, cocktail: null as number | null },
    sqFt: 25000,
    ceilingHeight: "22 ft",
    description:
      "One open, 25,000 sq ft room with 22 ft ceilings, fully reconfigurable for ceremony, reception, and afterparty in the same space. Includes a private, gated 150-space parking lot and a VIP Green Room with its own bar and restroom.",
    floorPlans: [
      { label: "Ceremony, Reception & Afterparty (300 guests)", imageUrl: "https://thegeraghty.com/wp-content/uploads/2025/06/Wedding-2-Web-1-2048x1583.png" },
      { label: "Ceremony & Reception (300 guests)", imageUrl: "https://thegeraghty.com/wp-content/uploads/2025/06/Wedding-1-Web-2-2048x1583.png" },
    ],
    // No confirmed embeddable virtual tour — checked the live /virtual-tour page's HTML directly
    // for a Matterport/iframe embed (none found), same class of gap as Diamond Garden's Wix tour
    // and Field Museum's Vimeo wall. Links out via the in-site lightbox instead of guessing an
    // embed. thegeraghty.com sends no X-Frame-Options/CSP header (checked directly), so framing
    // its real page genuinely works, unlike a guessed embed URL would.
    tourUrl: "https://thegeraghty.com/virtual-tour",
    sourceUrl: "https://thegeraghty.com/floor-plans/",
  },
  // No packages/per-guest pricing exists to show — "Rental prices are quoted upon request" is
  // the venue's own FAQ answer, word for word. Same shape as Field Museum: no Cost Estimate
  // calculator, no separate Pricing section — "ask about pricing" folded into Space instead.
  foodAndBeverage: {
    food: "Catering comes from the venue's own preferred caterer list (see Vendors below) — the venue's FAQ confirms a list exists but never states whether outside caterers are allowed, so this is shown as \"preferred,\" not \"required.\"",
    beverage: "The Geraghty holds the liquor license and sells all spirits, wine, and beer for your event — not a BYOB venue. One narrow exception: 501(c)(3)/(4) nonprofits may donate alcohol for their own event, with a $10/person (or beverage-minimum, whichever is greater) corkage fee.",
  },
  // Real, substantial baseline inclusions from the venue's own Features & Amenities page and
  // FAQ — shown despite there being only one space/booking path (no packages to share
  // inclusions across) because the real list is genuinely different in character from every
  // prior venue's: it leans production/AV, not just tables and chairs.
  //
  // Reformatted 2026-08-26 to the golden-set-template.md §2 format (built and locked in on
  // Greenhouse Loft): grouped label+detail items instead of a flat 13-string list, using the
  // reference category split (Space / Furniture / Entertainment / Services / Ambiance) applied to
  // this venue's own real content, not copied verbatim from Greenhouse Loft's category names.
  // Two real fixes made in the process, not just a reformat:
  // - The parking count here said "155-space," but Policies and the venue's own FAQ quote
  //   ("Our private, gated parking lot provides 150 parking spaces") both say 150 — a real
  //   internal inconsistency in the prior version of this file, corrected to the FAQ-sourced 150.
  // - Added a "Services" item for the Sales Manager, using a fact already sourced and verified
  //   elsewhere in this same file (the real FAQ: "A dedicated Sales Manager will work directly
  //   with you and your vendors leading up to the event") but never actually surfaced in What's
  //   Included before now — no new research, just no longer leaving a already-confirmed inclusion
  //   out of the one section a couple would look for it in.
  sharedIncludes: [
    {
      category: "Space",
      items: [
        { label: "Coat check", detail: "Coat check included" },
        { label: "Parking", detail: "150-space private, gated parking lot" },
        { label: "Restrooms", detail: "4 restrooms (32 private stalls)" },
        { label: "Green Room", detail: "A VIP Green Room with its own private bar & restroom" },
      ],
    },
    {
      category: "Furniture",
      items: [
        { label: "Tables", detail: "(45) 72\" round dining tables (linen not included)" },
        { label: "Chairs", detail: "(400) lucite chairs" },
        { label: "Bars", detail: "(2) 8' decorative bars" },
        { label: "Lounge", detail: "(2) lounge groupings" },
      ],
    },
    {
      category: "Entertainment & AV",
      items: [
        { label: "Lighting", detail: "An overhead, wall-to-wall LED lighting rig" },
        { label: "Sound", detail: "A distributed audio delay system" },
        { label: "Staging", detail: "(25) 4'×8' stage decks" },
      ],
    },
    {
      category: "Services",
      items: [{ label: "Sales Manager", detail: "A dedicated Sales Manager works with you and your vendors leading up to the event" }],
    },
    {
      category: "Ambiance",
      items: [
        { label: "Décor", detail: "Custom chandeliers and olive trees" },
        { label: "Drape", detail: "200 ft of floor-to-ceiling drape" },
      ],
    },
  ],
  // Canonical 13-row checklist, same order as every golden-set venue. Reformatted 2026-08-26 to
  // the value+optional-detail split locked in on Greenhouse Loft: a short, clear pill-worthy
  // `value` plus a `detail` only where the value alone would drop a real nuance.
  policies: [
    { label: "Catering", value: "Preferred list", detail: "Not stated whether outside caterers are allowed.", stated: true },
    { label: "Bar", value: "In-house only", detail: "Not a BYOB venue.", stated: true },
    { label: "Venue rental charge type", value: "Quoted upon request", stated: true },
    { label: "Food & beverage minimum", value: "Not stated (please confirm)", stated: false },
    { label: "Service charge", value: "Not stated (please confirm)", stated: false },
    { label: "Parking", value: "150 spaces", detail: "Private gated lot; valet available on request.", stated: true },
    { label: "Day-of coordinator", value: "Required", detail: "At minimum, for weddings.", stated: true },
    { label: "Payment schedule", value: "50% deposit", detail: "Non-refundable, due to secure the date.", stated: true },
    { label: "Cancellation / rescheduling", value: "Not stated (please confirm)", detail: "The booking deposit is stated as non-refundable.", stated: false },
    { label: "Event insurance", value: "Required", detail: "From all clients and vendors, due 2 weeks before the event.", stated: true },
    { label: "Security", value: "Not stated (please confirm)", stated: false },
    { label: "Vendor access (setup/teardown)", value: "Not stated (please confirm)", stated: false },
    { label: "Noise curfew", value: "2:00 am", stated: true },
  ],
  // Standardized (2026-08-25) to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. The dropped pricing/capacity questions are real, venue-specific
  // finds (the wedding-vs-gala floor-plan capacity bug especially) — kept in the real FAQ list
  // below instead of as bespoke standard questions.
  standardFaqs: [
    {
      question: "Can we bring our own caterer, or does it have to be from an approved list?",
      answer: "The venue's own FAQ confirms a preferred caterer list exists but never says whether an outside caterer is allowed instead. Genuinely unstated, not a hard requirement we could confirm either way.",
    },
    {
      question: "Can we bring our own alcohol?",
      answer: "No. The Geraghty holds the liquor license and sells all alcohol for your event. The one exception is a 501(c)(3)/(4) nonprofit donating alcohol for its own event, subject to a corkage fee.",
    },
    {
      question: "Is there a food & beverage minimum?",
      answer: "Not stated on their site. Confirm directly with the venue.",
    },
    {
      question: "Do we need to hire our own day-of coordinator?",
      answer: "Yes, a day-of planner is required, at minimum, for weddings. The venue's own Sales Manager also works with you and your vendors leading up to the event.",
    },
    {
      question: "Is event insurance required?",
      answer: "Yes. Event insurance is required from all clients and vendors, and must be submitted two weeks before the event date.",
    },
  ],
  // The venue's own real, on-site FAQ (thegeraghty.com/faq/) — transcribed verbatim, in the
  // order they appear on the page.
  faqs: [
    { question: "Do you offer onsite parking?", answer: "Yes! Our private, gated parking lot provides 150 parking spaces. Overflow and vendor parking is also available along S. Hoyne. Valet parking is available upon request." },
    { question: "Does the venue come with tables and chairs?", answer: "Yes! We include (45) 72\" round dining tables (linen not included) and (400) lucite chairs." },
    { question: "What is the meaning behind the name \"The Geraghty\"?", answer: "Noted event designer Tom Kehoe pays tribute to a lifetime of inspiration from his beloved mother, Mickey Geraghty Kehoe, by naming The Geraghty in her honor." },
    { question: "Where are you located?", answer: "The Geraghty is located at 2520 S. Hoyne Avenue, Chicago, Illinois, 60608." },
    { question: "What is the rental fee for the space?", answer: "Rental prices are quoted upon request." },
    { question: "Do you have a list of approved caterers?", answer: "Yes, with a link to approved caterers provided on our website." },
    { question: "Do you have exclusive event, production partners?", answer: "The Geraghty is owned and operated by Kehoe Designs for décor/design, and works with BlackOak Technical Productions for A/V services." },
    { question: "What is the required deposit, and is it refundable?", answer: "A deposit of 50% of the estimated event total and a signed contract are required to secure the event space and date. The deposit is non-refundable." },
    { question: "Who will I work with from The Geraghty?", answer: "A dedicated Sales Manager will work directly with you and your vendors leading up to the event. For weddings, a day-of planner is required, at minimum." },
    { question: "Can I bring in my own alcohol?", answer: "The Geraghty is not a BYOB venue. The Geraghty maintains a liquor license, and the spirits, wine, and beer for your event are purchased from The Geraghty." },
    { question: "My organization is 501C3, and alcohol is donated for our event. Is that okay?", answer: "The Geraghty allows for charitable donations of alcohol for nonprofit organizations with a current 501c3 or 501c4 only. The corkage fee is $10 per person or beverage minimum (whichever is greater)." },
    { question: "Do you have any outdoor space?", answer: "With views of the Chicago skyline, our parking lot can be transformed into an outdoor event space." },
    { question: "Do you allow candles with real flame?", answer: "Yes! We love the romantic and moody atmosphere that candlelight can create! The flame will need to be enclosed in a vessel (vase, votive, etc.)." },
    { question: "Do I need to provide insurance?", answer: "Event insurance is required by all clients and vendors and must be submitted two weeks before the event date." },
    { question: "What is the latest time the event can go until?", answer: "2:00 am." },
  ],
  // Real, venue-tagged wedding posts from the project's own graph pipeline (weddings.venue_id =
  // 507, wedding_posts, wedding_vendors) — 6 confirmed real weddings, 9 total posts (2 posts
  // each for the 2 weddings with multiple real posts). Each entry is one real Instagram post;
  // `vendors` is exactly the credit list from THAT post's own caption, not merged across a
  // wedding's multiple posts — same granularity as Marchetti's `weddingStacks`. The venue itself
  // and its 2 built-in production partners (Kehoe Designs, BlackOak) are deliberately left out
  // of every `vendors` list here even though they're credited on every single post — they're not
  // a couple's choice (see file header) and are shown separately as `builtInPartners` instead.
  // See file header for which 7 of the 13 real `weddings` rows for this venue were excluded as
  // corporate/gala contamination, and for wedding_id 1255's specific boundary-case exclusion.
  weddingStacks: [
    {
      postUrl: "https://www.instagram.com/p/DW9XFvclYso/",
      postTimestamp: "2026-04-10T17:00:48.000Z",
      postCaption: "A beautiful space is only the beginning. What matters is how it holds once the night starts.",
      postImageUrl:
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/669658708_18575442658053513_2337380446222166663_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=107&ig_cache_key=Mzg3MjM1MTIyNjgyNTg1NTE1NQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTAyNC5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=RVZte4gfgXcQ7kNvwFFsZtq&_nc_oc=Adqddam2gPYZ4LywIJxkfUY-CYHnTjADlAET6KHvlIXcgNJ14OZP-zUWUKwmZlQJ4wE&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_gid=H7eUz8Bcn8UnTwADIIK-Fw&_nc_ss=703ba&oh=00_AQHMuz_JBzMADPMyy2t4tbdrDIj2cw5ZovYHg2gLKZ6V-g&oe=6A8C6855",
      vendors: [
        { category: "Planning", name: "Beth Bernstein Events", url: "https://instagram.com/bethbernstein.events" },
        { category: "Photography", name: "Cristina G Photography", url: "https://instagram.com/cristinagphoto" },
        { category: "Videography", name: "Poetic Productions", url: "https://instagram.com/poeticproductions" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
        { category: "Stationery", name: "Minted", url: "https://instagram.com/minted" },
        { category: "Rentals", name: "BBJ La Tavola", url: "https://instagram.com/bbjlatavola" },
        { category: "Rentals", name: "Tablescapes Event Rentals", url: "https://instagram.com/tablescapeseventrentals" },
        { category: "Cake", name: "Bittersweet Pastry Shop & Cafe", url: "https://instagram.com/bittersweetpastryshop" },
        { category: "Catering", name: "Blue Plate", url: "https://instagram.com/blueplatechicago" },
        { category: "Photobooth", name: "ShutterBooth", url: "https://instagram.com/shutterboothofficial" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/DXhWRSDle74/",
      postTimestamp: "2026-04-24T16:26:18.000Z",
      postCaption: "A ceremony should feel defined before anyone walks down the aisle.",
      postImageUrl:
        "https://scontent-waw2-2.cdninstagram.com/v/t51.82787-15/671873721_18578541913053513_5937673182052080438_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=102&ig_cache_key=Mzg4MjQ4MjI4NDc0NjgzNTMzMg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTAyNC5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=Kz-T-4RscLQQ7kNvwGg7ebE&_nc_oc=Adq7ghorba1V8V0qoUAjnP4mMEziind7bKq_SZ6uZhniE27-1vfd8ojj2qRVFJb96WQ&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-waw2-2.cdninstagram.com&_nc_gid=OnLp5H_GOr6GDRVX07b5WQ&_nc_ss=7a3ba&oh=00_AQECY4oIZEvpkjwmOfEionJUL8i0JIAqqdJx8Hp0BXiXIw&oe=6A8C6F53",
      vendors: [
        { category: "Planning", name: "Beth Bernstein Events", url: "https://instagram.com/bethbernstein.events" },
        { category: "Photography", name: "Cristina G Photography", url: "https://instagram.com/cristinagphoto" },
        { category: "Videography", name: "Poetic Productions", url: "https://instagram.com/poeticproductions" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
        { category: "Stationery", name: "Minted", url: "https://instagram.com/minted" },
        { category: "Rentals", name: "BBJ La Tavola", url: "https://instagram.com/bbjlatavola" },
        { category: "Rentals", name: "Tablescapes Event Rentals", url: "https://instagram.com/tablescapeseventrentals" },
        { category: "Cake", name: "Bittersweet Pastry Shop & Cafe", url: "https://instagram.com/bittersweetpastryshop" },
        { category: "Catering", name: "Blue Plate", url: "https://instagram.com/blueplatechicago" },
        { category: "Photobooth", name: "ShutterBooth", url: "https://instagram.com/shutterboothofficial" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/DZId3i0EUpd/",
      postTimestamp: "2026-06-03T17:34:28.000Z",
      postCaption: "What matters most to us are words like these. Hearing from clients who become family, and knowing we made an impact.",
      postImageUrl:
        "https://scontent-sjc3-1.cdninstagram.com/v/t51.82787-15/715360160_18586636198035177_5311516501497474211_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=106&ig_cache_key=MzkxMTUwMTc2NDE5Njg0NDQ1NA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTA4MC5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=g2f9fbESresQ7kNvwHYsmbS&_nc_oc=AdrTylSZsYIWOjThp3Jpmw9Yy7jqOmhQHT3X2JJdmQVoRnp88RI2PDx5o5iesOUn65Q&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-sjc3-1.cdninstagram.com&_nc_gid=gMqpjJEDfwmWt7cpbuxdPg&_nc_ss=703ba&oh=00_AQE-v9FHaO9Bct7Uq8DW1Hh91j4s4ZsxpMicqacaAoo1gg&oe=6A8C7CF3",
      vendors: [
        { category: "Planning", name: "Stacy Saltzman Swislow", url: "https://instagram.com/sostacyevents" },
        { category: "Photography", name: "Avery House Photography", url: "https://instagram.com/averyhouse" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
        { category: "Music & Entertainment", name: "The Chicago Players", url: "https://instagram.com/thechicagoplayers" },
        { category: "Music & Entertainment", name: "Gold Coast Events", url: "https://instagram.com/goldcoastevents" },
        { category: "Catering", name: "Entertaining Company", url: "https://instagram.com/entertaining_co" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/DZNa4hWEfTm/",
      postTimestamp: "2026-06-05T15:44:35.000Z",
      postCaption: "Creating a vision beyond anything Chloe and Zach imagined, setting the scene for promises of forever.",
      postImageUrl:
        "https://scontent-iad6-1.cdninstagram.com/v/t51.82787-15/717129283_18587200276035177_5623364339595063126_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=100&ig_cache_key=MzkxMjg5ODMwMjg1Mjk3MTM0MQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTM2Mi5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=H8y8q46kQaQQ7kNvwEfnBHB&_nc_oc=AdoNOfgH86A-uiSUzY_7mBCuR2u3TNV6ymmXWbjXCnpg-KtYyebtnfTsB5_Ktwp_N2g&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-iad6-1.cdninstagram.com&_nc_gid=LguiGO50nQ1qbZDc915OiQ&_nc_ss=703ba&oh=00_AQEseh5_6XBDnX4KdIKyg4LThGh9qtM1O5nHfjhPFz2IKw&oe=6A8C4E7D",
      vendors: [
        { category: "Planning", name: "Stacy Saltzman Swislow", url: "https://instagram.com/sostacyevents" },
        { category: "Photography", name: "Avery House Photography", url: "https://instagram.com/averyhouse" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
        { category: "Catering", name: "Entertaining Company", url: "https://instagram.com/entertaining_co" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/DZYGG8Wj3m8/",
      postTimestamp: "2026-06-09T19:14:42.000Z",
      postCaption: "The view down the aisle, the look back at a room full of loved ones, or locking eyes with the love of your life.",
      postImageUrl:
        "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/719624183_18605046595035933_789338715161645770_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=104&ig_cache_key=MzkxNTkwNDc2NzY0MjAwNDExMQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTEwNC5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=FffDMSJmCiYQ7kNvwHPA_oM&_nc_oc=Adrr-h3S1gRBrybn6NEh0yTtbnDJgl0oMHSg4YFC5x9KeI1tB9hQ4JbeAe79jwJENOo&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=LguiGO50nQ1qbZDc915OiQ&_nc_ss=703ba&oh=00_AQHwLUJszrCofxbM02OaF-g4xU8SOT-ofsmIoNd-_eTdLA&oe=6A8C7FDC",
      vendors: [
        { category: "Planning", name: "Stacy Saltzman Swislow", url: "https://instagram.com/sostacyevents" },
        { category: "Photography", name: "Avery House Photography", url: "https://instagram.com/averyhouse" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
        { category: "Catering", name: "Entertaining Company", url: "https://instagram.com/entertaining_co" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/Danptrwjox9/",
      postTimestamp: "2026-07-10T16:45:49.000Z",
      postCaption: "Hands in the air if your love story demands a room that can hold this much energy.",
      postImageUrl:
        "https://scontent-iad6-1.cdninstagram.com/v/t51.82787-15/744741149_18614775016035933_6151966830049007505_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=109&ig_cache_key=MzkzODI5OTQ5MTE4NTgxNzAxNQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMjE3My5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=g2_GziS0OToQ7kNvwFLDodg&_nc_oc=AdraA4xUvvIQqPQEowAzqTweLXu-feCEiZAYfKTb9UN06wufdud5QIYY0HrEpyPaXOo&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-iad6-1.cdninstagram.com&_nc_gid=LguiGO50nQ1qbZDc915OiQ&_nc_ss=703ba&oh=00_AQEv9GylRWRA9mpYaXT6QWomUc1q7O3gpqlmN2ivH8Q2cg&oe=6A8C50C7",
      vendors: [
        { category: "Planning", name: "Hope Weis Consulting", url: "https://instagram.com/hopeweis" },
        { category: "Planning", name: "Stacy Saltzman Swislow", url: "https://instagram.com/sostacyevents" },
        { category: "Photography", name: "Bob & Dawn Davis Photography", url: "https://instagram.com/bobanddawndavis" },
        { category: "Photography", name: "Kent Drake Photography", url: "https://instagram.com/kentdrakephoto" },
        { category: "Photography", name: "Avery House Photography", url: "https://instagram.com/averyhouse" },
        { category: "Photography", name: "Liz - Chicago Wedding Photographer", url: "https://instagram.com/elizabethgrevephoto" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/DaSylTOEXvI/",
      postTimestamp: "2026-07-02T14:19:16.000Z",
      postCaption: "That exact moment you look at each other and realize the wedding of your dreams is no longer just a dream.",
      postImageUrl:
        "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/731163749_18595483531035177_2408525273726191436_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=104&ig_cache_key=MzkzMjQyMzk5MjY5NDQwNjk5NQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMjg5Ny5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=0B_-RV7xe_8Q7kNvwFvC6xb&_nc_oc=AdoCMyidh0aDXOmsstyvEtxguhKpU0uRhJCiWgIMnSrtifoeZpI8TzadHkAGF6mfiHs&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=j0NmDog1_cfMASD8e_YubA&_nc_ss=703ba&oh=00_AQEdSWn-KrY8vxvNAJjeLap9Sri3zpC-rN1wnk_u4a6Mjw&oe=6A8C76DE",
      vendors: [
        { category: "Planning", name: "Stacy Saltzman Swislow", url: "https://instagram.com/sostacyevents" },
        { category: "Photography", name: "Ben Ramos", url: "https://instagram.com/iambenramos" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/Da5gcqlkTZg/",
      postTimestamp: "2026-07-17T15:11:11.000Z",
      postCaption: "We bring the atmosphere. You bring the energy. Meet us on the dancefloor.",
      postImageUrl:
        "https://scontent-sin11-2.cdninstagram.com/v/t51.82787-15/747880944_18599944033035177_3105910499632402405_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_cat=101&ig_cache_key=Mzk0MzMyMDk5MzUxNDQwOTgyOA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMzI4MS5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=llCJfm-7ThYQ7kNvwE_1cJS&_nc_oc=Adp47kwvL3djRljZoP-hQ-pC2jrQhMayTRnjQgiu_XAu9CjSW1rbK9LB4yAbP3mRCsY&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-sin11-2.cdninstagram.com&_nc_gid=DSPzJ2GXEJYXlVwcZhRsZg&_nc_ss=7a3ba&oh=00_AQHCPYfA1ot3EiG-vLYIfqEWaYQmT6a0ox-X8N-hb6K6qQ&oe=6A8C5D78",
      vendors: [
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
        { category: "Planning", name: "Paulette Wolf Events", url: "https://instagram.com/paulettewolfevents" },
        { category: "Photography", name: "Christian's Cameras", url: "https://instagram.com/christians_cameras" },
        { category: "Photography", name: "Kingen Smith", url: "https://instagram.com/kingensmith" },
        { category: "Music & Entertainment", name: "Danny Chaimson", url: "https://instagram.com/goldcoastallstars" },
        { category: "Catering", name: "J&L Catering", url: "https://instagram.com/jandlcatering" },
      ],
    },
    {
      postUrl: "https://www.instagram.com/p/Da8qHibD6OJ/",
      postTimestamp: "2026-07-18T20:33:24.000Z",
      postCaption: "Jessica will forever hold a special place in my heart. I don't think there have ever been so many people around during bridal makeup application — it was a party and I loved every minute of it!",
      postImageUrl:
        "https://scontent-sin2-3.cdninstagram.com/v/t51.82787-15/750815028_18606380599007233_4513496698864239616_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=107&ig_cache_key=Mzk0NDIxMDgwNDMxOTc2NTM2Mg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTQ0MC5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=_UTbWZHpeeMQ7kNvwEfm6PP&_nc_oc=AdopaLcR9TompUXSxNe6lhX_yg6VDZQaLpI5NJy021TAlXYqdo7BnL7xHfPTXHofdU8&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=8&_nc_ht=scontent-sin2-3.cdninstagram.com&_nc_gid=DSPzJ2GXEJYXlVwcZhRsZg&_nc_ss=7a3ba&oh=00_AQF3XhYIRSSZrhdLkhRwd5qzpiFNlrxJ9OGcHX8P4RmJyA&oe=6A8C77B9",
      vendors: [
        { category: "Planning", name: "Alison Ross Events", url: "https://instagram.com/alisonrossevents" },
        { category: "Photography", name: "Kent Drake Photography", url: "https://instagram.com/kentdrakephoto" },
        { category: "Photography", name: "Alex Sattler", url: "https://instagram.com/alexandersattler" },
        { category: "Florals", name: "Kehoe Designs", url: "https://instagram.com/kehoedesigns" },
        { category: "Videography", name: "Xpress Video Productions", url: "https://instagram.com/xpressvideoproductions" },
        { category: "Music & Entertainment", name: "The Music City Allstars", url: "https://instagram.com/themusiccityallstars" },
        { category: "Cake", name: "Sweet Mandy B's Bakery", url: "https://instagram.com/sweetmandybs" },
        { category: "Catering", name: "Entertaining Company", url: "https://instagram.com/entertaining_co" },
        { category: "Hair & Makeup", name: "Chicago Hairstylist", url: "https://instagram.com/tinamarie.hair" },
        { category: "Hair & Makeup", name: "Magda Rod Makeup", url: "https://instagram.com/magdarodmakeup" },
        { category: "Attire", name: "The Wedding Dresser", url: "https://instagram.com/theweddingdresser" },
      ],
    },
  ],
  // Kehoe Designs (décor) and BlackOak Technical Productions (A/V) — the venue's own FAQ names
  // them as "exclusive event, production partners." Shown separately from the couple's-choice
  // vendor categories above, since they aren't a choice: every single real wedding post credits
  // the identical two accounts for these two roles (see file header).
  builtInPartners: [
    { name: "Kehoe Designs", role: "Décor & event design", url: "https://kehoedesigns.com/" },
    { name: "BlackOak Technical Productions", role: "A/V & technical production", url: "https://blackoak.tech/" },
  ],
  // The venue's own published preferred-caterer list (thegeraghty.com/caterers-partners/), 8
  // real names. `seenAtRealWeddings` flags the 2 that also independently appear in the real
  // wedding graph above (Blue Plate, J&L Catering) — the other 6 are venue-published only, not
  // confirmed via a real wedding tag. Entertaining Company shows up repeatedly in real weddings
  // above but is NOT on this published list — real evidence the list undersells how open
  // catering actually is in practice, the same shape of finding as Greenhouse Loft's missed
  // "what's included" items, just for vendors instead of amenities.
  preferredCaterers: [
    { name: "Blue Plate", url: "https://blueplatechicago.com/", seenAtRealWeddings: true },
    { name: "J&L Catering", url: "https://www.jandlcatering.com/", seenAtRealWeddings: true },
    { name: "Boka Catering", url: "https://www.bokacatering.com/", seenAtRealWeddings: false },
    { name: "Catering by Michaels", url: "https://www.cateringbymichaels.com/", seenAtRealWeddings: false },
    { name: "Food for Thought", url: "https://www.foodforthoughtchicago.com/", seenAtRealWeddings: false },
    { name: "Lettuce Entertain You", url: "https://www.lettuce.com/", seenAtRealWeddings: false },
    { name: "Limelight Catering", url: "https://www.limelightcatering.com/", seenAtRealWeddings: false },
    { name: "Paramount Events", url: "https://paramounteventschicago.com/", seenAtRealWeddings: false },
  ],
  sourcePages: [
    "https://thegeraghty.com/",
    "https://thegeraghty.com/about/",
    "https://thegeraghty.com/features-amenities/",
    "https://thegeraghty.com/floor-plans/",
    "https://thegeraghty.com/faq/",
    "https://thegeraghty.com/caterers-partners/",
    "https://thegeraghty.com/virtual-tour",
    "https://thegeraghty.com/contact/",
  ],
  lastVerified: "2026-08-24",
};

export type Geraghty = typeof geraghty;
