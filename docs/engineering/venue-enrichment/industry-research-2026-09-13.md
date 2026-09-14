# How the industry structures venues today (research, 2026-09-13)

Status: reference. Gathered by a web-research agent on 2026-09-13 while planning VenueDetails v3
(D060). Kept because it grounds three schema choices: capacity as (space, layout, min, max) tuples,
controlled vocabularies for catering/alcohol policy, and a normalized pricing model with an explicit
archetype. Sources are linked inline; numbers are as published on the cited pages at research time.

## 1. Marketplace venue-page fields

| Site | Capacity | Pricing shown | Amenities/style | Vendor policy | What's included | FAQ | Social proof | Inquiry |
|---|---|---|---|---|---|---|---|---|
| **The Knot** ([Galleria Marchetti](https://www.theknot.com/marketplace/galleria-marchetti-chicago-il-443406)) | Single max-guest number | `$`–`$$$$$` tier symbols (users call them inaccurate, [forum](https://forums.theknot.com/discussion/976457/venue-price-range-interpretation)) + "Starting at $X" | Checklist tags (ballroom, garden, indoor/outdoor) | Preferred-vendor mentions in copy, not structured | Prose list | Structured Q&A ("site fee?", "peak season?") | Rating, review count, real-weddings gallery | Request-quote form |
| **WeddingWire** ([Galleria Marchetti](https://www.weddingwire.com/biz/galleria-marchetti-chicago/367ca5a449935f38.html)) | Guest capacity field | Price range + starting price | Amenities checklist, settings tags | Site-fee-only venues flagged as needing outside caterer/rentals | Amenities list | Structured FAQ | Reviews, deals | Inquiry form |
| **Zola** ([venue pages](https://www.zola.com/wedding-vendors/wedding-venues/galleria-marchetti)) | Min/max by room, seated vs standing per space | Starting price + explicit per-person price; peak/off-peak site-fee tiers separate from package price | Settings/style tags + services checkboxes (bar, catering, dance floor, staff, pet-friendly, wheelchair) | Catering/bar services toggle | Explicit "included rentals" list distinct from amenities | Structured FAQ (fees/season/parking) | Rating, review count, AI review summary | Request pricing / tour |
| **Wedding Spot** ([how it works](https://www.wedding-spot.com/how-it-works/), [Greenhouse Loft](https://www.wedding-spot.com/venue/1533/greenhouse-loft/)) | Per-space min/max, ceremony vs reception vs combined | **Spot Estimate**: guest count + date (with a flexibility toggle for off-peak) drives a computed "starting at $X for N guests", savable and comparable side by side; rate card hidden behind the estimate | Standard amenities | Catering/bar arrangement per venue | Amenities | none distinguishing | Reviews | Account required to see results |
| **Here Comes The Guide** ([Key to Terms](https://www.herecomestheguide.com/help/key-to-terms)) | Ceremony (standing/seated) vs cocktail vs reception-seated vs reception-standing as **separate controlled fields** | `$`/`$$`/`$$$` + itemized fee types: rental fee, ceremony fee, package price, F&B minimum | Controlled vocabularies for catering type, alcohol policy, dance floor, dressing area, parking, kitchen (ample/moderate/minimal/prep-only/n/a), outdoor lighting, wheelchair access | Catering as **in-house / no-BYO / preferred-list / in-house-or-BYO / BYO-licensed**; alcohol as in-house / BYO / BYO-with-corkage / not-allowed | Implied by catering/rental fields | Editorial tags | Editorial reviews | Contact venue |
| **Eventective / Peerspace / Tagvenue** | Hourly-rate, capacity-only listings; Tagvenue has 100+ filterable attributes | Hourly or half/full-day; Eventective is lead-gen with add-on services | Amenity tag clouds | Rarely encodes "required vendor" | Minimal | none | Light reviews | Instant book vs lead form |

Common denominator: capacity, a price anchor, an amenities checklist, lead capture. Only Here Comes The
Guide and Zola encode catering/alcohol policy as a controlled field. That is the most useful prior art
for comparability, since "all-inclusive vs à la carte" is exactly the ambiguity couples hit.

## 2. Pricing archetypes observed in Chicago

1. **All-inclusive per-head banquet package** — [Diamond Garden](https://www.diamondgardenhall.com/build-your-own-package): day-of-week × season rate matrix per person, 150-guest minimum, plus a separate hall-rental-only matrix.
2. **Room rental + F&B minimum, in-house or exclusive caterer** — [Galleria Marchetti](https://www.galleriamarchetti.com/weddings) (site fee by day, ceremony fee separate, per-guest packages), [Chicago Illuminating Company](https://www.theknot.com/marketplace/chicago-illuminating-company-chicago-il-890198) (preferred-caterer F&B plus service/tax on top).
3. **Raw space + open/BYO catering** — [Greenhouse Loft](https://www.greenhouseloft.com/faq) (rental by season, open caterer list, DJ/photobooth bundled), [Salvage One](https://www.benramosphotos.com/blog/salvage-one-chicago-wedding-venue) (BYOB, approved bar-service caterer only).
4. **Museum rental + mandatory exclusive caterer roster** — [Field Museum](https://www.fieldmuseum.org/page/weddings): usage fee by room, three named exclusive caterers; the fee bundles security/housekeeping/electrician, not food.
5. **Hotel package with room block** — [LondonHouse](https://londonhousechicago.com/weddings/): per-person tiers covering hors d'oeuvres/bar/dinner/cake; room block attach not itemized publicly.
6. **Industrial venue with liquor-license-tied F&B minimum** — [The Geraghty](https://thegeraghty.com/faq/), [Ivy Room](https://www.ivyroomchicago.com/weddings/): modest flat rental plus an in-house-alcohol minimum that floats by day/season.

Archetypes 1 and 5 make cross-venue math easy ($/head). 2, 3, 4, 6 separate a fixed site fee from a
variable, caterer-set F&B line that couples cannot get without a quote. Two "starting price" numbers
are not commensurable unless the model normalizes on effective cost per guest at a fixed guest count.

## 3. Field list by public availability (High/Med/Low = how often a venue's own site states it)

- **Identity/About**: name, address/neighborhood, venue type [High]; history/ownership [Med]; description [High]; photos [High]; website/social [High].
- **Spaces & capacity**: number of bookable spaces [High]; per-space sq ft [Med]; per-space capacity split by ceremony-seated / ceremony-standing / reception-seated / reception-standing / cocktail [Med; most sites give one blended max]; indoor/outdoor per space [High]; same-room flip for ceremony+reception [Low]; guest minimums [Med].
- **Pricing model**: archetype [Low; must be inferred]; rental/site fee by season and day [Med-High]; ceremony fee [Med]; F&B minimum by season/day [Med]; per-person package price [High for all-inclusive, Low elsewhere]; deposit schedule [Low-Med]; overtime rate [Low]; guest-count break points [Med].
- **Food & beverage**: catering arrangement type [High, HCTG vocabulary]; named exclusive/preferred caterers [Med]; bar arrangement in-house / BYO / BYO+corkage / dry [High]; bar per-person rate [Med]; service charge % [Low-Med; usually only in proposals]; sales tax applicability [Low]; cake-cutting fee [Low]; kitchen level [Low].
- **Vendor policy**: required vendors (security, coordinator, valet) [Med]; vendor insurance [Low]; preferred list [Med]; coordinator mandatory/included [Med]; outside-vendor fee [Low].
- **Logistics**: rental hours [High]; setup/teardown windows [Med]; music curfew [Med]; overtime terms [Low-Med]; load-in [Low].
- **Restrictions**: open flame [Med]; confetti/sparklers [Med]; amplified music [Med]; decor [Low]; pets [Med].
- **Accessibility/parking/lodging**: wheelchair access [Med-High]; parking/valet cost [Med]; hotel block [Low-Med]; transit [Low]; getting-ready space [High].
- **Resources**: floor plan [Low]; pricing sheet/brochure [Low, usually gated]; sample menu [Low]; galleries [High]; reviews [High].

Anything requiring a real quote (service charge, tax, overtime, deposit schedule) routinely surfaces
only in a PDF sent after an inquiry. That is the gap a standardized model targets: structured
extraction from linked PDFs where they exist, and an honest "ask the venue" state otherwise.

## 4. Capacity ambiguity

The Knot/WeddingWire give one blended max; Zola and Wedding Spot break it per room; Here Comes The
Guide alone splits ceremony vs cocktail vs reception-seated vs reception-standing as first-class
fields. Venues compound this (Marchetti quotes a whole-venue figure and 150-400 per room; museums
quote per-room ranges tied to layout). Nobody models same-room flip time. A comparability schema
should store capacity as (space, layout, min, max) tuples with a derived headline for browse.

## 5. Standards and AI tooling

schema.org `EventVenue` exposes `maximumAttendeeCapacity` and `amenityFeature`; nothing models pricing
archetypes or catering policy. [The Knot's "Make it Yours"](https://www.theknot.com/content/ai-weddings)
and [Zola's "Split the Decisions"](https://www.forbes.com/sites/angelachan/2024/04/03/say-i-do-to-equal-wedding-planning-with-zolas-new-ai-driven-tool/)
are recommendation layers over unstructured listings, not comparability schemas. No incumbent does
structured venue-offer normalization.

## 6. Hidden costs couples report

Service charge (20-25% of F&B, not gratuity) and Chicago sales tax (~11.75%) stack on quoted per-person
prices; cake-cutting ($2-5/guest) and corkage ($10-40/bottle, or ~$10/person at The Geraghty) are
frequent add-ons; overtime bills hourly; vendor meals are often required; mandatory day-of coordinator,
security, and valet are common surcharges; deposits and cancellation terms rarely appear pre-quote.
([Here Comes The Guide hidden costs](https://www.herecomestheguide.com/wedding-ideas/hidden-wedding-costs),
[24Shelby fee guide](https://24shelby.com/blog/hidden-costs-wedding-venues/).) The highest-leverage
comparison feature is "headline price" vs "likely all-in cost at your guest count", which Wedding Spot
and Here Comes The Guide each partially attempt and neither combines with a pricing-archetype tag.
