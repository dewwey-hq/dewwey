/**
 * Golden record v4 for Galleria Marchetti (vendor_id 7) — brings the page up to
 * golden-set-template.md's now-locked format, most of which was written after v3 shipped
 * (Greenhouse Loft's and Geraghty's builds). v3 stays frozen/untouched for comparison, same as
 * v2 before it. Same underlying venue data as v3 (spaces, packages, add-ons, real Instagram
 * posts, photographer list) except where a fact is called out below as newly re-verified.
 *
 * New in this pass (2026-08-26):
 * - **Broken vendor-category icons fixed.** v3's VendorStackDeck pointed at
 *   `/icons/*-svgrepo-com.svg` files deleted by the 2026-08-23 Phosphor-icon sweep (which never
 *   touched /concept) — those were broken images in production. Rebuilt with lucide-react
 *   icons, same fix `geraghty` already made and confirmed working (see template §2).
 * - **Section order fixed to match the now-locked canonical order (§1).** v3 had Photos at the
 *   very bottom of the page (after FAQs, Vendors); the locked order puts it right after the
 *   wedding stack and before Spaces, for any venue that has real IG wedding content. Moved.
 * - **`indoorOutdoor` quickFacts icon key renamed to `setting`** — Diamond Garden's naming won
 *   (template §3); Marchetti was the one page still using the older key.
 * - **Policies rows re-rendered as pills** (§2's Greenhouse Loft-derived row format: a short
 *   pill for the value, an optional detail line only where the pill alone doesn't cover a real
 *   nuance) instead of v3's plain left/right text row.
 * - **Parking and Payment schedule upgraded from "not stated" to real, sourced facts**, found by
 *   reading galleriamarchetti.com/legal/terms-conditions directly (not checked in v2 or v3):
 *   valet parking can be arranged for a fee (inquire for rates); a non-refundable retainer is due
 *   at booking, then an installment 180 days out, then a final payment 10 business days out.
 *   (Payment schedule gets revised again below once the real wedding brochure turns up a
 *   discrepancy with this page.) Re-checked the same terms-conditions page plus /contact and
 *   /thepavilion for Day-of coordinator, Event insurance, Security, Vendor access, and Noise
 *   curfew at this point — none of those five were addressed anywhere on the site yet.
 * - **FAQ list re-rendered to the locked bare-row format** (§2): full-width rows with their own
 *   bottom rule and a right-side chevron, no outer bordered box — v3 still had the older boxed-
 *   card-with-left-chevron look.
 * - **What's Included added after all**, reversing this pass's own first draft (feedback
 *   2026-08-26: "is there stuff that is included we should flag e.g. heating and a/c,
 *   disability/ada... i think we need a what's included section even if it's more bare").
 *   The first draft's research was right — every real page on the site (all 8 in the sitemap:
 *   home, weddings, thepavilion, lapergola, about-us, contact, legal/terms-conditions — blog
 *   posts skipped, not amenity content) was already checked for ADA/tables/chairs/parking/coat
 *   check, and none of those are stated anywhere; that conclusion didn't change. What changed is
 *   the call on Heating & A/C: rather than defend keeping it exclusively as the `climate`
 *   quickFacts pill, moved it into `sharedIncludes` (see that field's own comment for the fuller
 *   reasoning — the "converted industrial loft" framing that justified the pill in the first
 *   place doesn't actually describe this venue). `sharedIncludes` ends up genuinely bare (2
 *   items at this point in the pass: Heating & A/C, and floor-length linens pulled out of the
 *   Argento package card since it's real and shared by all three packages via inheritance) —
 *   bare because that's honestly all that's real, not because the section was phoned in. A third
 *   item (Bridal suite) was added later the same day, once the real wedding brochure turned up a
 *   fact /about-us alone didn't fully capture — see the brochure bullet list below.
 *   `/about-us` (previously unchecked) did turn up one more real fact along the way: a
 *   description of La Pergola's Wedding Salon getting-ready space, at this point folded into
 *   that space's `includesSummary` below as space-specific. That call turned out to be
 *   incomplete once the brochure was read (see below) — corrected the same day.
 * - **Differentiator spotlight deliberately NOT added.** Nothing on the venue's site rises to
 *   "truly unique or notable with real specifics," as opposed to marketing language, beyond
 *   what's already covered by What's Included and the Wedding Experiences add-ons — so per
 *   template §4's "most venues won't qualify," this section is correctly omitted rather than
 *   forced.
 * - **Real wedding brochure found and used to enrich the page**, in a third round the same day
 *   (feedback: "looks like there's a wedding brochure here... if you didn't use it to enrich the
 *   results, consider it please"). A 22-page PDF with a genuine text layer (`brochureUrl`,
 *   linked as a resource button on Food & Beverage), far more complete than any single page on
 *   the live site, and the source of several real facts and one correction that weren't
 *   available anywhere else checked so far:
 *   - **Ceremony fee** — genuinely new: $1,000 (La Pergola) / $2,000 (The Pavilion), on top of
 *     the venue rental fee and only charged if the ceremony is held on-site (clarified after a
 *     follow-up question — the brochure names "Venue Fee" and "Ceremony Fee" as two separate
 *     charges, nothing suggests either is bundled into the other, same structure as LondonHouse's
 *     ceremony fee). Includes white garden chairs and a dedicated arbor; The Pavilion's fee also
 *     covers a matching indoor arbor as weather backup. Nothing like this existed on the page
 *     before — v3's own old comment even noted "no situational fees known for this venue (unlike
 *     LondonHouse's corkage/ceremony fees)," which turned out to be a research gap, not a real
 *     absence. Added to `enhancements` (Add-ons & extras' rentals table).
 *   - **Coat check** — genuinely new: available, fee varies by staffing, no fixed price
 *     published. Also added to `enhancements`.
 *   - **Pavilion seated capacity corrected**: 450 -> 425. The brochure prints "Seated Reception:
 *     up to 425" for The Pavilion; 450 doesn't appear anywhere in it. Its "+ Dance Floor: 375"
 *     figure matches what was already here, so only the one number was wrong. See `spaces` for
 *     the fuller note on why this is treated as the correction (the live page doesn't expose a
 *     capacity number to cross-check against).
 *   - **Food & beverage minimum, Vendor access, and Day-of coordinator** upgraded from "not
 *     stated" to real (if partial) facts — a minimum genuinely applies (amount not published);
 *     outside vendors need proof of insurance and paperwork (exact setup/teardown windows still
 *     aren't published); the venue's own team provides in-house coordination as part of every
 *     package (not framed as one dedicated named role).
 *   - **Payment schedule revised, not just confirmed**: the brochure agrees with
 *     terms-conditions on the retainer and the 180-day installment, but gives a different
 *     remaining-balance deadline (15 business days, matching its own final-guest-count deadline)
 *     than terms-conditions did (10 business days). Flagged as a real conflict between two of the
 *     venue's own documents in the Policies row's detail, rather than silently picking one.
 *   - Three new real FAQ entries (menu tastings, AV services, children's/vendor menus), and the
 *     existing "what happens if weather doesn't cooperate" FAQ sharpened with the brochure's
 *     actual indoor-ceremony-backup plan instead of generic "indoor and outdoor options" text.
 *   - Checked and genuinely NOT in the brochure either: ADA/accessibility, tables/chairs count,
 *     a stated Security policy, or a Noise curfew — those rows stay honest "not stated."
 * - **Fourth pass, same day (2026-08-26), after re-reading the brochure a second time**:
 *   - **Bridal suite added to What's Included**, correcting the earlier "space-specific" call
 *     above: the brochure's own Space Highlights list "Private Wedding Salon for getting ready
 *     and pre-ceremony moments" under BOTH The Pavilion and La Pergola, not only La Pergola as
 *     /about-us alone had suggested. Genuinely venue-wide. Standardized under Greenhouse Loft's
 *     own "Bridal suite" label (its equivalent real item) instead of a Marchetti-specific
 *     coinage, per feedback to keep icons/labels consistent venue to venue.
 *   - **Bar Collections distinction surfaced**: the brochure names Villa/Tenuta/Riserva as
 *     "progressively elevated wine, spirit, and cocktail selections" that build on each other,
 *     not just three different names. Added a shared note plus 3 real example spirits per tier
 *     (see `packages`) so the escalation from Argento to Oro to Platino is visible on the page,
 *     not just implied by the bar's name changing.
 *   - **Ceremony FAQ answer sharpened** with the brochure's own real framing (a couple asked
 *     directly what "remaining together in one beautiful setting throughout the celebration"
 *     meant): each space's outdoor ceremony setting "transition[s] naturally into cocktail hour
 *     and the reception that follows," so the point is that guests never leave the property
 *     between ceremony and reception — not a claim about skipping a mid-event room flip (Il
 *     Cortile/the Pergola garden and the indoor reception rooms are already separate rooms
 *     either way).
 *   - **Add-ons & extras restructured** to Greenhouse Loft's icon-card format (see `ENHANCEMENT_ICONS`
 *     in page.tsx), replacing this pass's own first-draft category+table shape.
 *   - **Stray AI-sounding em dashes removed** from user-facing copy only (What's Included,
 *     Ceremony fee, Day-of coordinator, two FAQ answers) — kept only where one would be a literal
 *     quote from a source (none were). Comments/doc-prose elsewhere in this file are unaffected;
 *     dense em-dash-heavy header comments are this codebase's own established documentation
 *     style (see Greenhouse Loft's file), not something this cleanup touches.
 * - **Fifth pass, same day (2026-08-26)**:
 *   - **About sharpened with the family legacy** (feedback: "since 1924," family-owned, kept
 *     concise) — one added sentence, condensed from /about-us's real "Our History" copy: Giuseppe
 *     Marchetti's original Como Inn (1924), still family-owned and operated today.
 *   - **"Per the brochure"-style citations removed from rendered copy** (feedback: "don't say
 *     stuff like per wedding brochure... this is so much simpler with [a plain fact]") — Bridal
 *     suite, Food & beverage minimum, Service charge, Day-of coordinator, Cancellation, Event
 *     insurance, and Vendor access all now state the fact plainly; sourcing moved into that
 *     field's own code comment instead. Payment schedule keeps naming both documents, since that
 *     row is specifically about them disagreeing, not a decorative citation.
 *   - **Food & beverage experience cards get icons**, Space & rentals reverted back to a table
 *     (feedback: "the table was best way of showing that... what should be changed is the food
 *     and bev") after this pass's own same-day detour through Greenhouse Loft's icon-card format
 *     for both — see page.tsx's `EXPERIENCE_ICONS`.
 * - Everything else (Cost Estimate's grouped subtotals, standardFaqs' 5 canonical questions,
 *   the 13-row Policies checklist itself) already matched the locked template going into this
 *   pass — v3 was built against LondonHouse's pattern before the template doc existed, and later
 *   venues confirmed rather than changed most of it.
 *
 * Follow-up (2026-08-26, caught while building `londonhouse-chicago-v2`): this page never
 * rendered the BYO / À la carte / All-Inclusive Food & Beverage pill §3 requires on every
 * venue — a real gap this v4 pass itself should have caught but didn't. Added now: a single
 * All-Inclusive pill (the quickFacts catering/bar notes already state "No outside caterer
 * option" and "Bar in-house," no BYO/à la carte anywhere), same shape as Marchetti's own
 * precedent cited in template §3. No data.ts change needed — the fact was already here in
 * `quickFacts`, just never surfaced as the required pill in page.tsx.
 *
 * Second follow-up, same day (feedback: "no need to do food, bar and the new lines... redundant.
 * concise clear simple intuitive"): the first version of this fix split Food and Bar into their
 * own labeled subsections, each with its own pill and a prose sentence — cut back to one plain
 * pill with no subheaders or prose. Food and Bar have the identical value here, and the prose
 * was just restating what the package cards immediately below (and the quickFacts notes above)
 * already say. See golden-set-template.md §3's new layout rule and page.tsx's own comment.
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
  // Real wedding brochure (2026-08-26, feedback) — a 22-page PDF with a genuine text layer
  // (read directly via pdftotext, no OCR needed). Far richer than any single page on the live
  // site: it's the actual source for the ceremony fees, F&B-minimum policy, and vendor-insurance
  // requirement added this pass (see the relevant fields' own comments), and it also corrected
  // one number that was wrong (Pavilion's seated capacity — see `spaces` below). Linked as a
  // resource button on About (feedback 2026-08-26, moved from an initial placement on Food &
  // Beverage): it covers enough ground across the page — Food & Beverage, Add-ons, Policies —
  // that no single later section is a clean "closest topical match" the way a scoped PDF like
  // a catering-guidelines doc would be, so it sits at the top instead, where a reader can grab
  // the whole document before diving into any one section.
  brochureUrl: "https://framerusercontent.com/assets/t5zh6XzrzAPCFcL4XEKWnAd5E.pdf",
  instagramHandle: "galleriamarchetti",
  instagramUrl: "https://www.instagram.com/galleriamarchetti",
  rating: 4.5,
  reviewCount: 379,
  // Family-legacy sentences added (2026-08-26, feedback: highlight "since 1924," family-owned,
  // kept concise), condensed from /about-us's real copy ("Rooted in Chicago since 1924, the
  // Marchetti family legacy began with Italian immigrant Giuseppe Marchetti and the legendary
  // Como Inn... Today, it remains proudly family-owned and operated") plus one fact from the
  // wedding brochure's own cover letter, re-read the same day: its title page is stamped
  // "EST. 1978" and says "for nearly five decades, Galleria Marchetti has been one of Chicago's
  // most distinctive destinations." Correction: 1924 and 1978 are two different real dates, not
  // one — 1924 is when the family's restaurant lineage began (Como Inn, per /about-us), 1978 is
  // when this specific venue opened (per the brochure). The first draft's single sentence blurred
  // the two together; written as two sentences below so neither date misrepresents the other.
  // The brochure is also signed "JP & Corey Marchetti," but feedback 2026-08-26 called naming
  // them here superfluous, so that detail is left out of the rendered copy.
  about: "Galleria Marchetti is a garden oasis in the heart of Chicago, offering a timeless setting for weddings of every size. With two distinct event spaces, this enchanting urban oasis features elegant indoor spaces and romantic courtyards that adapt seamlessly to your vision. The Marchetti family's Chicago roots go back to 1924 with Giuseppe Marchetti's original Como Inn. Galleria Marchetti itself opened in 1978 and remains family-owned and operated today.",
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
  //
  // v4 (2026-08-26, feedback): the 5th "climate" pill (Heating & A/C) is dropped — it now lives
  // in `sharedIncludes` below instead, alongside the venue's other real, package-wide inclusion.
  // Earlier passes (and golden-set-template.md §3's own example text) treated this as Marchetti's
  // "genuinely distinctive 5th pill," reasoning it was a converted-industrial-loft venue where
  // climate control was in doubt — but Marchetti's own copy calls itself a "garden oasis," not a
  // loft conversion (that description fits Greenhouse Loft/Geraghty, not this venue), so the
  // "in doubt, therefore distinctive" case doesn't actually hold up on a second look. Heating &
  // A/C is a real, decision-relevant fact, but it reads as a standard included amenity once
  // named accurately, not a stand-out one — so it belongs in What's Included like it would for
  // any other venue, not as a bespoke pill. Back to the base 4 pills; nothing else about this
  // venue clears the "genuinely distinctive" bar for a 5th.
  quickFacts: [
    // 450 -> 425 (2026-08-26): the real wedding brochure states The Pavilion seats "up to 425,"
    // not 450 — see `spaces` below for the full correction and where 450 apparently came from.
    { icon: "guests", label: "Up to 425 guests", note: "Across two bookable spaces; more if you book the entire venue. No minimum guest count published." },
    // Icon key renamed indoorOutdoor -> setting (2026-08-26) to match Diamond Garden's naming,
    // the one golden-set-template.md §3 standardized on.
    { icon: "setting", label: "Indoor & outdoor", note: "Both spaces combine a tented/glass-enclosed room with an open-air courtyard or retractable roof." },
    { icon: "catering", label: "Catering in-house", note: "No outside caterer option. Food comes from the venue's own kitchen." },
    { icon: "bar", label: "Bar in-house" },
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
      // Added (2026-08-26, feedback: "i think we should more prominently say it's tented" — it
      // was only in the paragraph description before, easy to miss) — rendered next to sq ft on
      // the space card so it's visible without reading the full paragraph. "Tented ballroom" is
      // the venue's own term (see `description` below); genuinely a different physical structure
      // from La Pergola's glass-enclosed room with a retractable roof, not interchangeable.
      structureLabel: "Tented ballroom",
      // Verbatim from the venue's own site (galleriamarchetti.com/thepavilion) — the comma is theirs.
      description:
        "The larger of our two venues, is our three-space option featuring a lush courtyard, a beautiful old-world anteroom, and a state-of-the-art 6,000 sq ft tented ballroom with lighting, heating, and air conditioning.",
      includesSummary: "Il Cortile (courtyard), the tented ballroom, and the Montecatini Room (3,000 sq ft).",
      // seatedDining corrected 450 -> 425 (2026-08-26): the real wedding brochure states "Seated
      // Reception: up to 425" for The Pavilion, printed right next to "Seated Reception + Dance
      // Floor: up to 375" — which already matched what was here. 450 doesn't appear anywhere in
      // the brochure; unclear where it originally came from (predates this pass, and the live
      // /thepavilion page doesn't expose a capacity number in its rendered text to cross-check
      // against). Treating the brochure's printed number as the correction since it's a real,
      // directly-read, wedding-specific document. standingReception (900) isn't addressed either
      // way in the brochure — it has no cocktail/standing figure for either space — so it's left
      // as-is, sourced from the original build.
      capacity: { seatedDining: 425, seatedWithDance: 375, standingReception: 900 },
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
      // Genuinely different from The Pavilion's tent (see that space's own comment) — a
      // permanent glass-enclosed room with a motorized retractable roof, not a tent.
      structureLabel: "Glass-enclosed, retractable roof",
      description:
        "Our intimate venue features a 3,000 sq ft glass-enclosed ballroom with Moroccan brass sconces, travertine flooring, heating, air conditioning, and a motorized retractable roof, creating a warm and elegant setting for unforgettable events.",
      // Wedding Salon description added v4 (2026-08-26) — real, verbatim-adjacent quote found on
      // /about-us: "an intimate, ornate retreat designed for quiet moments before the
      // celebration begins," with "rich details, soft lighting, and elegant finishes" for
      // "preparation, reflection, and connection." Originally treated as La Pergola-only, since
      // /about-us doesn't mention The Pavilion's version; the brochure's Space Highlights lists
      // later confirmed both spaces have their own Wedding Salon (see `sharedIncludes`'s "Bridal
      // suite" row), so this description stays here as this space's own flavor/color, not as a
      // claim that La Pergola is the only one with one.
      includesSummary: "The Lucca Room (1,500 sq ft) and its own Wedding Salon, an intimate, ornate getting-ready retreat with soft lighting for preparation before the celebration begins.",
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
  // What's Included — added v4 (2026-08-26, feedback: "is there stuff that is included we
  // should flag e.g. heating and a/c, disability/ada"). Deliberately bare: these are the only
  // two facts that are both real and genuinely shared across every package/space, after
  // specifically re-checking every real page on the site for tables/chairs/parking/coat-check/
  // ADA (see file header) — none of those are stated anywhere, so they don't get invented rows
  // here. Heating & A/C used to be the 5th quickFacts pill; moved here instead (see that field's
  // own comment for why). Flat, ungrouped list — golden-set-template.md §2's subcategory
  // grouping is a readability fix for volume ("more than ~6-8 real items"), not a mandatory
  // shape, and forcing categories onto 2 items would be worse than just listing them.
  // Label wording standardized against Greenhouse Loft's own What's Included entries (feedback
  // 2026-08-26: keep icons/text consistent venue to venue). "Heating & A/C" label matches
  // Greenhouse Loft's exactly. "Linens" (not "Floor-length linens") as the label, with the
  // specific description moved into the detail, matching the category-noun-label convention
  // every other venue's items already use (e.g. Greenhouse Loft's "Tables:", not "25 farm
  // tables:").
  // "Bridal suite" added (2026-08-26, second read of the brochure): its Space Highlights list
  // "Private Wedding Salon for getting ready and pre-ceremony moments" for BOTH The Pavilion and
  // La Pergola, correcting the earlier call that this was a La Pergola-only fact (see file
  // header). Label matches Greenhouse Loft's own "Bridal suite" item exactly, same standardization
  // reasoning as the two rows above.
  sharedIncludes: [
    { label: "Heating & A/C", detail: "Both The Pavilion and La Pergola are climate-controlled year-round." },
    { label: "Linens", detail: "Floor-length linens included in every package. Oro and Platino each build on top of Argento, which includes them." },
    { label: "Bridal suite", detail: "Both The Pavilion and La Pergola have their own Private Wedding Salon for getting ready and pre-ceremony moments." },
  ],
  // v1-style cards restored — comparison table was rejected as confusing.
  // `barExamples` and `barCollectionsNote` added (2026-08-26, feedback: "maybe we want to include
  // the bar distinction between villa bar, tenuta bar and riserva bar from argento thru
  // platino") — the brochure names these as real, distinct spirit/wine collections, not just
  // three names for the same bar with a longer pour time. Examples below are each tier's own
  // liquor lineup from the brochure's "BAR SERVICE" page, trimmed to 3 representative names per
  // tier rather than the full published list (10-20+ items each).
  packages: [
    {
      key: "argento",
      name: "Argento",
      perGuest: 190,
      bar: "Villa Bar (5 hr)",
      barExamples: "Tito's, Tanqueray, Maker's Mark",
      inheritsFrom: null,
      inclusions: ["Four passed hors d'oeuvres", "Passed white wine & sparkling wine", "Tableside wine service & sparkling toast", "Three-course dinner", "Floor-length linens"],
    },
    {
      key: "oro",
      name: "Oro",
      perGuest: 235,
      bar: "Tenuta Bar (5 hr)",
      barExamples: "Ketel One, Hendrick's, Woodford Reserve",
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
      barExamples: "Grey Goose, Macallan 12, Patron Reposado",
      inheritsFrom: "Oro",
      inclusions: ["Two signature cocktails", "Two signature moments", "Two chef experiences", "Late-night Neapolitan pizza station", "Dance floor"],
    },
  ],
  // Shared line rendered once below the package cards, as a footnote (2026-08-26, feedback:
  // "feels like a note underneath not on top/above the bar packages") — paraphrased from the
  // brochure's own "BAR SERVICE" intro ("Villa, Tenuta, and Riserva Bar Collections offer
  // progressively elevated wine, spirit, and cocktail selections... As each collection builds
  // upon the last, guests enjoy an increasingly refined beverage experience") rather than quoted
  // verbatim, so it reads as this page's own voice, not lifted marketing copy.
  barCollectionsNote: "Villa, Tenuta, and Riserva Bar Collections build on each other. Each package's bar offers a more elevated wine, spirit, and cocktail selection than the one before it.",
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
  // `priceRange` added (2026-08-26, feedback: "garden aperitivo hour then $12-20/guest... that
  // way its easier to scan quickly") — a headline price line above the blurb, matching Greenhouse
  // Loft's own add-on card shape (name, then a big price line, then the description). The tier
  // breakdown below still repeats each tier's own price, since the headline range alone doesn't
  // say which tier costs what.
  experiences: [
    {
      category: "Garden Aperitivo Hour",
      priceRange: "$12–20/guest",
      blurb: "Elevate cocktail hour with the warmth of an Italian aperitivo.",
      tiers: [
        { name: "Signature Moments", price: "$12/guest", examples: ["Aperol Spritz Bar", "Limoncello Spritz Bar"] },
        { name: "Signature Experiences", price: "$20/guest", examples: ["Antipasti Station", "Live Fire Skewer Station"] },
      ],
    },
    {
      category: "Chef Experiences",
      priceRange: "$40/guest",
      blurb: "Interactive, chef-attended culinary moments during cocktail hour.",
      tiers: [{ name: "Chef Experiences", price: "$40/guest", examples: ["Coastal Crudo & Sushi Experience", "Wood-Fired Beef Tagliata Station"] }],
    },
    {
      category: "Late Night Experiences",
      priceRange: "$12–20/guest",
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
    // Ceremony fee — real, added v4 (2026-08-26, feedback), sourced from the wedding brochure.
    // Not previously on this page at all; v3's old Add-ons comment even said "no situational
    // fees known for this venue (unlike LondonHouse's corkage/ceremony fees)," which this
    // corrects. Both fees include white garden chairs and a dedicated ceremony arbor; The
    // Pavilion also includes a matching indoor arbor as weather backup (an indoor ceremony
    // location beneath The Pavilion, used if the outdoor courtyard isn't an option).
    {
      category: "Ceremony fee",
      // Clarified v4 (2026-08-26, feedback: "should the ceremony fee be on top of the rental or
      // is that included? im confused on that piece"). The brochure names these as two separate
      // charges — "Venue Fee" (the day-of-week rental, see Spaces) and "Ceremony Fee" — with
      // nothing suggesting either is bundled into the other, so: additional, on top of the venue
      // rental, and only charged if you hold your ceremony on-site (reception-only bookings
      // don't pay it) — same structure as LondonHouse's ceremony fee.
      note: "On top of the venue rental fee, only if your ceremony is held on-site. Includes white garden chairs and a dedicated ceremony arbor; The Pavilion's fee also covers a matching indoor arbor for weather backup.",
      // Named "On-site ceremony" instead of the usual `name: null` (2026-08-26, feedback: "i
      // think instead of ceremony fee add it should be like ceremony on-site yes, no" — this fee
      // is genuinely conditional on a real decision, unlike Dance floor/Bistro lights' style
      // options, so it reads better labeled by the condition that triggers it than as a bare
      // "Add"). Stage and Chiavari chairs stay `name: null`: they're plain optional add-ons with
      // no comparable yes/no condition gating them, so relabeling those wouldn't add clarity.
      variants: [{ name: "On-site ceremony", pergola: "$1,000", pavilion: "$2,000" }],
    },
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
    // Coat check — real, added v4 (2026-08-26), sourced from the wedding brochure: "Coat check
    // service may be arranged in advance. Additional charges apply based on staffing
    // requirements." No fixed price is published (staffing-dependent), so shown honestly as
    // "available, fee varies" rather than a specific number — same instinct as Greenhouse Loft's
    // cleaning fee. Genuinely venue-wide, not per-space, hence the identical text in both
    // columns; still fits this table's existing name:null row shape without a new component.
    {
      category: "Coat check",
      variants: [{ name: null, pergola: "Available (fee varies)", pavilion: "Available (fee varies)" }],
    },
  ],
  // Canonical checklist ported from LondonHouse's build, same decision-priority order:
  // financial/dealbreaker items first, then risk/compliance, then day-of logistics last.
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
  //
  // v4 (2026-08-26): "Parking" and "Payment schedule" first upgraded from placeholders to real
  // facts sourced from galleriamarchetti.com/legal/terms-conditions; then, later the same pass
  // (feedback: use the real wedding brochure), "Food & beverage minimum," "Vendor access," and
  // "Day-of coordinator" upgraded too, and "Payment schedule" revised again after the brochure
  // turned up a real conflict with the terms-conditions page (see that row's own comment).
  // Event insurance (for the couple, not vendors), Security, and Noise curfew were re-checked
  // against the terms-conditions page, /contact, /thepavilion, and now the brochure too, and are
  // still genuinely unaddressed anywhere — real "not stated" rows, not an unfinished gap.
  policies: [
    { label: "Catering", value: "In-house only", stated: true },
    { label: "Bar", value: "In-house only", stated: true },
    // Detail expanded (2026-08-26, second read of the brochure) with its "EVENT TIMING &
    // EXTENDED SERVICE" section: event times are fixed in the contract, and running over is
    // subject to approval and extra cost, not a given.
    { label: "Venue rental charge type", value: "Flat per-day fee", stated: true, detail: "See Spaces for each room's day-by-day rates. Event times are set in your contract; running past your scheduled end time is subject to availability and approval, and may cost extra." },
    {
      label: "Food & beverage minimum",
      value: "Applies (amount not published)",
      stated: true,
      // Source: the wedding brochure. Kept out of the rendered detail per feedback 2026-08-26
      // ("don't say stuff like per wedding brochure") — plain facts read better than citations.
      detail: "A minimum applies to every event; any shortfall is added to the final balance. Dollar figures aren't published.",
    },
    { label: "Service charge", value: "25% on food & beverage", stated: true, detail: "Called a \"production fee\" on Marchetti's own site. Taxable, not a gratuity." },
    { label: "Parking", value: "Valet available", stated: true, detail: "Arranged for an additional fee; inquire with the venue for current rates." },
    {
      label: "Day-of coordinator",
      value: "In-house coordination included",
      stated: true,
      // Source: the wedding brochure ("the ease of in-house coordination"). Citation dropped from
      // the rendered text per the same feedback as above.
      detail: "The venue's own team coordinates every Wedding Experience package. It isn't framed as one dedicated named role, so confirm exactly what's covered.",
    },
    {
      label: "Payment schedule",
      value: "Retainer, then 180 days out",
      stated: true,
      detail:
        "A non-refundable retainer is due at booking, then an installment 180 days before the event, on both the terms & conditions page and the wedding brochure. They disagree on the remaining-balance deadline. The brochure says 15 business days before the event, matching its final guest-count guarantee deadline; the terms page says 10 business days. Confirm which applies.",
    },
    {
      label: "Cancellation / rescheduling",
      value: "Not stated (please confirm)",
      stated: false,
      detail: "No standalone cancellation policy is published, but all deposits/retainers are non-refundable once paid.",
    },
    // Source: the wedding brochure, for outside-vendor insurance. Citation dropped from the
    // rendered text per feedback 2026-08-26.
    { label: "Event insurance", value: "Not stated (please confirm)", stated: false, detail: "Outside vendors are required to carry proof of insurance (see Vendor access below), but nothing is stated about event insurance for the couple." },
    { label: "Security", value: "Not stated (please confirm)", stated: false },
    {
      label: "Vendor access (setup/teardown)",
      value: "Insurance & documentation required",
      stated: true,
      // Source: the wedding brochure. Citation dropped from the rendered text per feedback 2026-08-26.
      detail: "Outside vendors must comply with the venue's requirements, provide proof of insurance, and complete paperwork before the event. Exact setup/teardown time windows aren't published.",
    },
    { label: "Noise curfew", value: "Not stated (please confirm)", stated: false },
  ],
  // Same shape/format for standard + venue FAQs so they render identically. Phrasing tightened
  // to match the couple-voiced style established on LondonHouse's page (e.g. "can we bring our
  // own X, or is it Y" rather than "is X Y, or can we bring our own").
  // Standardized (2026-08-25) to the same 5 questions, same order, every golden-set venue — see
  // golden-set-template.md §2. The dropped payment-schedule/noise-curfew questions are still
  // honest gaps in Policies; the real 25% service charge fact lives there too.
  // F&B minimum, Day-of coordinator, and Event insurance answers updated v4 (2026-08-26) with
  // real facts from the wedding brochure — question wording stays locked/unchanged.
  standardFaqs: [
    { question: "Can we bring our own caterer, or does it have to be from an approved list?", answer: "Exclusive in-house. Galleria Marchetti's own kitchen produces all food as part of the wedding packages, with no outside-caterer option." },
    { question: "Can we bring our own alcohol?", answer: "In-house only, as part of the same exclusive wedding packages. There's no BYO option." },
    { question: "Is there a food & beverage minimum?", answer: "Yes, a minimum applies to every event, though Marchetti doesn't publish the dollar amount. If your event doesn't reach it, the difference is added to your final balance." },
    { question: "Do we need to hire our own day-of coordinator?", answer: "Marchetti's own team provides in-house coordination as part of every Wedding Experience package. It isn't framed as one dedicated day-of coordinator role, though, so confirm exactly what's covered before deciding you don't need your own." },
    { question: "Is event insurance required?", answer: "Not stated for couples specifically. Outside vendors are required to carry proof of insurance, but nothing is stated about whether couples need their own event insurance. Confirm directly." },
  ],
  faqs: [
    { question: "What size events can Galleria Marchetti accommodate?", answer: "Our venues are designed to host a wide range of events, from intimate gatherings to large-scale celebrations. Flexible indoor and outdoor spaces allow us to adapt layouts based on your guest count and event style." },
    // Sharpened v4 (2026-08-26, second read of the brochure, after a couple asked directly what
    // "remaining together in one beautiful setting throughout the celebration" meant) with the
    // brochure's own "CEREMONY AT GALLERIA MARCHETTI" framing. It's about not relocating to a
    // separate building or site between ceremony and reception, not a claim about skipping a
    // mid-event room flip (Il Cortile/La Pergola's garden and the indoor reception rooms are
    // already separate rooms either way).
    { question: "Can we host both the ceremony and reception on-site?", answer: "Yes. Each space's own outdoor ceremony setting is designed to transition naturally into cocktail hour and the reception that follows, so your guests stay together in one setting for the whole celebration instead of traveling between locations." },
    // Sharpened v4 (2026-08-26) with the brochure's specific weather-backup fact — the old answer
    // was generic "indoor and outdoor options" boilerplate; this is the actual real plan.
    { question: "What happens if the weather doesn't cooperate?", answer: "The Pavilion has a beautifully appointed indoor ceremony location, with a matching arbor to the outdoor one, so a rained-out ceremony still moves forward smoothly rather than getting improvised at the last minute." },
    { question: "Do you host weekday or evening events?", answer: "Yes. Galleria Marchetti welcomes weekday events and often offers seasonal incentives or special pricing for weekday bookings." },
    { question: "Do you provide event planning or coordination support?", answer: "Our experienced team works closely with clients throughout the planning process, offering guidance on space selection, layout options, and event logistics to ensure a smooth experience." },
    { question: "Can we work with our own vendors?", answer: "To ensure a high level of quality and a seamless event experience, Galleria Marchetti works with a curated list of trusted vendors. Our team is happy to share approved options and guide you through selections that align with your vision while ensuring smooth execution on event day." },
    // Three new real FAQ entries added v4 (2026-08-26), all sourced from the wedding brochure's
    // "Wedding Event Information and Policies" pages — genuinely useful, decision-relevant
    // details that had no other home on this page.
    { question: "Can we do a menu tasting before we book our final selections?", answer: "Yes. A complimentary tasting for up to four guests is available once your event is booked, limited to plated dinner selections, and must be scheduled in advance." },
    { question: "Does Galleria Marchetti provide audio/visual equipment, like a sound system?", answer: "No, AV services are arranged through outside providers. The venue's team can help with recommendations and coordination, but the equipment, setup, and technical support are the AV provider's responsibility, so give them advance notice." },
    { question: "Do you offer a children's menu, or accommodate vendor meals?", answer: "Yes to both. Special menu options and pricing are available for children ages 3 through 11, and for your event's vendors, though Galleria Marchetti doesn't serve alcoholic beverages to vendors while they're working your event." },
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
    "https://www.galleriamarchetti.com/legal/terms-conditions",
    "https://www.galleriamarchetti.com/about-us",
    "https://framerusercontent.com/assets/t5zh6XzrzAPCFcL4XEKWnAd5E.pdf",
  ],
  lastVerified: "2026-08-26",
};

export type Marchetti = typeof marchetti;
