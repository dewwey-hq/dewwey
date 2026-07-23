# Venue enrichment quality rubric (v2)

**Purpose:** Decide whether Dewwey's pull-based website facts are good enough for couples to **compare venues**.
**Rule:** Empty / omitted beats wrong or junk. Website URL alone is not enough — every served column must pass hygiene.

**Extractor stance:** Prefer **LLM-forward** (tight schema + closed enums + provenance) for meaning fields. Use rules only for high-precision structure (emails, phones, IG handles, FAQ DOM pairs, PDF URL discovery). Do **not** treat regex/link-vacuum as authority for vendors, amenities, inventory, capacity, or pricing.

**What changed in v2:** v1 scored one Pass/Fail per column per venue, on a fixed 15-venue slate, checked by eyeballing live pages. That missed a whole class of bug: a venue can "Pass" a column while one room inside it is wrong (Adler's Rainbow Lobby), duplicated (Four Seasons' Delaware), or fabricated (Langham's "Wedding Venues" as if it were a room) — none of which flip a coarse per-column score. v2 adds three things the slate-only, eyeball-only approach couldn't: **field-level scoring** (not just column-level), an **automated grounding-fidelity check** (catches mis-citation without a human re-reading every live page), and **whole-catalog checks** (a bug rate measured across all ~163 venues, not just 15 hand-picked ones) — while still asking the same top-down question: would a bride trust this next to five other venues in a compare view?

---

## Scoring model: three layers, not one

1. **Field-level** — every scalar and array item gets its own Pass/Fail/N/A, not bundled into "the capacity column passed." This is what catches a single wrong room inside an otherwise-good `spaces[]` array.
2. **Column-level** — roll up field scores per column (capacity, pricing, policies, amenities, inventory, vendors, FAQs, assets, beverage packages) using the Pass/Fail rules below.
3. **Venue-level** — roll up columns to one Pass/Fail per venue, same aggregation rule as v1 (see Scoring gates).

Score the **serving** payload (`venue_enrichment.facts` + the top-level columns), not raw rules JSON — that's what the UI and any future compare view actually reads.

---

## Eval slate (15 venues) — unchanged roster, still the fast spot-check path

| # | id | Venue | Archetype | Why in slate |
|---|----|--------|-----------|--------------|
| 1 | 7 | Galleria Marchetti | Multi-space loft + fees | Gold spaces / fee_schedule |
| 2 | 16 | The Geraghty | Classic loft + FAQ/vendors | Strong pages, known good baseline |
| 3 | 11 | Chez Wedding Venue | Huge preferred-vendor list | Vendor precision stress test |
| 4 | 99 | The Joinery | Inventory-heavy loft | Included inventory hygiene |
| 5 | 478 | The Drake Hotel | Hotel capacity tables | Hotel labeled caps |
| 6 | 480 | Adler Planetarium | Museum + many spaces | Museum noise / dance-floor labels |
| 7 | 481 | Chicago Botanic Garden | Outdoor / multi-space | Garden / ceremony mix |
| 8 | 483 | The Langham, Chicago | Hotel SPA thin tables | Thin crawl / SPA edge |
| 9 | 484 | The Peninsula Chicago | Luxury hotel (WAF) | Post-unblock quality |
| 10 | 492 | Chicago Athletic Association | Club + FAQs | FAQ quality — **also the confirmed hotel-FAQ-contamination archetype, see below** |
| 11 | 494 | Four Seasons Hotel Chicago | Luxury hotel | Policies + spaces |
| 12 | 506 | LondonHouse Chicago | Hotel + packages | Pricing / inventory |
| 13 | 519 | Wrigley Field | Stadium / experiences | Known bad amenities + junk vendors (fixed — kept as regression case) |
| 14 | 525 | River Roast | Restaurant private dining | PDF-only capacity/pricing archetype |
| 15 | 1 | Greenhouse Loft | Small loft + FAQs | Bread-and-butter Chicago loft |

Re-score after any extractor/prompt/serving-gate change. Keep this list stable unless a venue leaves the catalog. **The slate is a fast proxy, not the whole truth** — see "Whole-catalog checks" below for what it structurally cannot catch (anything that needs >15 venues to show a real rate).

---

## Automated check 1: grounding fidelity (`npm run enrich-venues-grounding-check`)

Every LLM-derived field carries `{value, quote, source_url}`. That's only worth anything if the quote is actually *at* the source_url. `scripts/venue-enrichment/grounding-check.js` re-fetches every cited source (HTML or PDF) and checks token coverage of the quote against the fetched text.

```bash
npm run enrich-venues-grounding-check -- --ids 7,16,11,99,478
npm run enrich-venues-grounding-check -- --vendor-id 480
npm run enrich-venues-grounding-check -- --limit 20
```

**What it catches:** fabricated quotes, and citations pointing at the wrong page/PDF entirely.
**What it does NOT catch:** "right page, right text, wrong room" mis-attribution — e.g. Adler's Rainbow Lobby getting Skyline Terrace's real, on-page "120-150: Reception" number. The text genuinely exists at that source_url, just describes a different room. Token coverage can't verify per-room association; that still needs a human spot-check (see the "Known failure-mode fixtures" table for exactly this pattern, so reviewers know to check it specifically).

**Why token coverage, not exact substring:** verified directly — an exact-substring version of this check ran at 28.6% mismatch on the 15-slate, almost all false positives. Structured fields (`capacity_configurations`, `spaces[].capacity`) are routinely reconstructed by the LLM from a multi-cell table (room name, a "Capacity" label, and a number that are three separate table cells on the real page, never adjacent text) — a correct, well-grounded quote will still fail a literal substring check. Token coverage (≥80% of significant words/numbers in the quote found somewhere in the source) dropped the same run to **2.9% mismatch**, and what's left is real signal: it independently re-flagged Langham's "Wedding Venues" fake space (14% token coverage) without being told about it in advance.

**Gate:** mismatch rate ≤ **5%** on the slate before shipping an extractor/prompt change. Investigate every mismatch below 50% coverage by hand — that's usually a real citation bug, not noise.

---

## Automated check 2: repeatability

LLM output at temperature 0 is *mostly* stable, not perfectly so. Verified directly this session: re-enriching River Roast twice from identical source pages gave `capacity_max` 240 then 200, and beverage-tier names shifted ("Silver/Gold/Platinum" → "Classic/Premium/Platinum"). For a product where couples compare venues, a headline number that changes on re-enrichment is a real trust problem the old rubric never checked — it only ever scored one snapshot.

**Check:** re-run each slate venue twice back-to-back (`--force` both times), diff `capacity_max`, `pricing_model`, `catering`, `event_insurance`. These four should be **stable across runs** — they're closed-enum or single-number fields with an unambiguous right answer given the same source text. Arrays (vendor lists, amenities, beverage tier names/wording) are allowed some run-to-run variance in exact wording; the *substance* (same rooms, same real vendors) should still hold.

**Gate:** the four stability-checked scalars should match on ≥ **90%** of slate venues across two consecutive runs. A flip is not automatically a bug — check which run's value is actually grounded (via the grounding check) before concluding the field is unstable rather than just re-verified differently.

---

## Column rubric (what couples see)

Score each field within a column **Pass / Fail / N/A**.
**N/A** = site truly has no public info *and* we correctly omit the section (not invent).

### 1. Capacity / spaces
| Pass | Fail |
|------|------|
| Seated-preferring card max matches a real room, or null with clear space rows | Fake amalgam ranges (e.g. `10–1200`), hotel ADR as capacity, cocktail-only as card max, swapped room capacities |
| Per-space ceremony / seated / with-dance / cocktail labeled when site states them | Unlabeled guest numbers mashed into one number |
| Multi-room venues show distinct bookable spaces, one row per real room | Private dining / "petite wedding package" products as rooms; the **same physical room counted twice** under two labels (Four Seasons "Delaware" + "Delaware Room" — confirmed in **7/104 venues with spaces, 6.7%**, not a one-off); a **section/category heading treated as if it were a room** (Langham "Wedding Venues" — confirmed in 4/163 venues: ids 2, 79, 483, 540) |
| A room whose real published capacity differs from ours is caught by the grounding check or a manual spot-check | A room shows the *wrong* number pulled from a *different* room on the same page (Adler Rainbook Lobby: our "120–150" was Skyline Terrace's real number, not Rainbow Lobby's actual 125 — grounding check can't catch this class, budget explicit manual spot-checks for it) |
| A landmark-shaped room name (e.g. "Water Tower Park," "Millennium Park" as a hotel's own named function room) is kept when it has real, distinct sq_ft + capacity breakdown | Rejecting a real room because its name coincidentally matches a public park/landmark — verified false-positive risk; check for indoor `setting` + specific (non-round) sq_ft before assuming it's a mistaken external reference |
| Capacity that only exists inside a PDF (menu, package doc) is retrieved via the PDF-enrichment escalation, not left null when a real per-room table exists | Leaving capacity null when a linked PDF has the real per-room breakdown (River Roast: page said "six spaces... 10 to 1,000" in prose, actual 9-room table only existed in the wedding-menu PDF) |

### 2. Pricing / fees / beverage packages
| Pass | Fail |
|------|------|
| Event/venue fees only; inquire-only → null display | Guest-room ADR (`From $163`), unrelated menu prices as venue fee |
| `fee_schedule` / space fees match published day/season when present | Invented dollar amounts |
| `beverage_packages[]` populated with real tier name + real per-tier inclusions + quote/source, when the venue publishes tiers | Inventing tiers that don't exist, or collapsing "has a bar" into a fake single-tier entry |
| Pricing hidden in a PDF (common — verified only ~20% of venues have any `price_display` from HTML alone) surfaced via PDF-enrichment when a menu/package PDF exists | Leaving `pricing_model: inquire_only` + null `price_display` when the linked PDF states real per-guest pricing |

**Corpus baseline (163 venues, informs what "normal" looks like — don't chase 100% coverage where the baseline is naturally thin):** `pricing_model` distribution is 63% `inquire_only`, 17% `mixed`, 10% null, 8% `package` — inquire-only dominance is expected for wedding venues broadly, not a hygiene failure by itself. Only 20% (33/163) have any `price_display` at all; this is a real coverage gap the PDF-enrichment pass targets, not yet fully backfilled across the catalog.

### 3. Policies (catering, alcohol, insurance, curfew, conditions)
| Pass | Fail |
|------|------|
| Catering enum correct: `open` / `preferred_list_required` / `exclusive_in_house` | Wrong exclusive vs open; restaurant "Order Online" implying open catering |
| Insurance / alcohol / curfew only when clearly stated | Guessed policies |
| `policies.catering_conditions` captures a real caveat on an otherwise-plain enum (Greenhouse Loft: "open," but must follow composting/sustainability guidelines, sourced from a linked PDF) | Inventing a caveat that isn't stated anywhere; or dropping a real caveat to fit the plain enum value when a linked guidelines doc clearly states one |

### 4. Amenities (comparable features) — venue-level AND space-level
| Pass | Fail |
|------|------|
| Closed wedding vocabulary only (valet, bridal suite, outdoor ceremony, AV, on-site lodging, accessible, etc.) | Marketing prose ("breathtaking views"), stadium **experiences** (batting cage, trophy photo), spa/fitness, generic fluff |
| ≤12 high-signal items at venue level | Long unfiltered LLM dump |
| A feature true of only ONE named room (only this ballroom has a dance floor, only this terrace is outdoor) lands in that room's `spaces[].amenities`, not just the venue-level array | Room-specific facts only ever surfacing at venue level, making every room in a multi-room venue look identical when they aren't (schema has supported this since Phase 1; verified the LLM wasn't using it until prompt guidance was added — check this specifically after any prompt change, it regresses silently) |

**Target taxonomy (map or drop):**
`valet_parking` · `self_parking` · `bridal_suite` · `getting_ready_rooms` · `outdoor_ceremony` · `outdoor_reception` · `indoor_ceremony` · `in_house_catering` · `preferred_caterers` · `byo_catering` · `in_house_bar` · `byob` · `av_included` · `dance_floor` · `overnight_rooms` · `wheelchair_accessible` · `loading_dock` · `ceremony_on_site` · `reception_on_site`

**Corpus baseline (163 venues):** 23% (38/163) have zero amenities, 51% (83/163) have only 1–3, only 7% (11/163) have a rich 8+ set. Most of the catalog is thin, not wrong — this is the expected shape of "empty beats wrong" applied at scale, not itself a bug to chase to 100%. Treat <3 amenities as a signal worth an LLM-forward re-extract pass, not an automatic Fail.

### 5. Included inventory ("what's included") — venue-level AND space-level
| Pass | Fail |
|------|------|
| Countable rental inclusions (tables, chairs, linens, basic AV, setup hours) | Marketing sentences, add-ons sold separately listed as "included", nav junk |
| Distinct from amenities | Duplicate amenity prose |
| Reasonably complete against the source page — spot-check by counting items on the live "what's included" page and comparing (Greenhouse Loft: missed ~7 of 18 published inclusions — DJ services, photobooth, parking count, candle treatment, security, dedicated venue manager — in one pass; re-verify after any inventory-prompt change) | Silently dropping half the published list without it showing up as a Fail just because *some* items were captured |

### 6. Preferred / network vendors
| Pass | Fail |
|------|------|
| Real business names with wedding categories (photo, florist, DJ, caterer, planner, …) — prefer the page-title/real name over a URL-slug guess | Footer/CTA junk: Privacy Request, Fathead Design, Order Online, Gift Cards, Follow us on…, Code of Business Conduct; sluggy names like "Hmrdesigns" instead of "HMR Designs" (was **31% of all 570 vendor entries catalog-wide** before the LLM-classification fix — re-check this rate after any vendor-extraction change, it's a corpus-wide metric, not a slate-only one) |
| Only from vendor-list / partner hubs (or LLM-confirmed list) | Link vacuum from every page; filming/TV/movie production credits (Adler: "Ironheart (Disney)," "Chicago Fire (NBC)" tagged as photographer partners); the venue linking to its own site, tagged as its own "vendor" (Greenhouse Loft self-reference) |
| Hotel-brand cross-links correctly excluded | Marriott/Hilton/Hyatt investor-relations, loyalty-program, or account pages surfacing as "caterer" category (confirmed pattern across multiple hotel-chain venues) |
| If &lt;2 real vendors after filter → **omit section** (N/A Pass) | Showing 4 junk "vendors" |

### 7. FAQs
| Pass | Fail |
|------|------|
| Real question + substantive answer about weddings/events | Footer text, addresses, copyright as answers |
| Useful for compare (rules, timing, vendors, deposits) | Duplicate / truncated noise |
| **For hotel-category venues specifically:** wedding/event FAQs kept, generic hotel-guest FAQs excluded | **Confirmed systemic, not isolated:** sampled 3 hotel venues (Chicago Athletic Association, Ambassador Gold Coast, Trump International) — all three had FAQ sections **100% generic hotel-guest content** (check-in/out, gift cards, Wi-Fi pricing, cancellation policy, Hyatt/loyalty points, fitness center) and **zero** wedding-relevant questions. A keyword-reject-list fix was attempted and confirmed insufficient — it only catches phrasings already seen, not the wide variety of hotel-FAQ topics. **Unresolved as of this rubric version** — flag any hotel venue whose FAQ list is >90% non-wedding as failing this column until a proper LLM-based relevance pass replaces the keyword list. |

### 8. Assets (outbound docs)
| Pass | Fail |
|------|------|
| Floor plans, capacity sheets, catering menus, wedding packages — labeled, link works | Code of Business Conduct, privacy PDFs, and the same *genre* even under unexpected names (Modern Slavery Statement, investor relations, annual/sustainability report — treat as a genre to recognize, not a fixed string list to match) |
| UI only surfaces allowlisted kinds: `floor_plan`, `menu_pdf`, `package_pdf`, `capacity_sheet`, `brochure_pdf`, `vendor_list_pdf` | Raw `pdf` dump with junk labels; a PDF's actual content doesn't match its label (LondonHouse: `menu_pdf` labeled "Download our spa menu" — a hotel spa treatment list, not a wedding catering menu) |
| **When a venue markets multiple event types on the same page** (wedding, gala, corporate, social), the wedding-labeled floor plan/asset is surfaced | Grabbing whichever floor plan was encountered first regardless of event type (Geraghty: our stored floor plan was a Gala one; the same page has 3 wedding-labeled plans we missed) — a real, confirmed bug; check this specifically on any multi-event-type venue |

### 9. Contact / social (light check)
| Pass | Fail |
|------|------|
| Plausible event email / phone / IG for the venue | Privacy-portal links as contact; designer credit as social |
| Phone numbers are clean, human-readable text | URL-encoding artifacts leaking through (`1%20(312)%20923%209988`, `//17733888165`) — was a real bug, now fixed at the `tel:` href parse step; regression-check if phone extraction code changes |

### 10. Serving honesty
| Pass | Fail |
|------|------|
| Weak fields hidden; `needs_review` when capacity null but site has caps we missed | Showing junk sections; overconfident card capacity |
| `status: success` only assigned when the underlying facts are actually reasonably complete | A "success" status masking a venue that's actually thin everywhere except one field (spot-checked: this has NOT happened in the corpus so far — blank capacity only ever co-occurs with `partial`/`failed` status, never `success`, across all 163 venues — keep verifying this holds after schema changes) |

---

## Whole-catalog checks (not slate-only — the point of this section)

The 15-slate is fast but structurally can't show you a *rate*. These are corpus-wide (163 venues) queries to re-run after any extractor change, cheap because they're pure SQL, no LLM cost:

```sql
-- Fuzzy-duplicate space names (Four Seasons pattern) — informs whether the spaces.js dedup is holding
-- Fake generic-label spaces ("Wedding Venues", "Event Space", "Meeting Rooms") — should trend toward 0
-- Sluggy vendor-name rate (single-word, no-space, >8 chars) — should trend down from the 31% baseline
-- pricing_model / price_display coverage — track against the 63% inquire_only / 20% has-price baseline
-- amenities count distribution — track the 23% zero / 51% thin / 7% rich baseline
```

**Gate:** any of these metrics regressing (moving away from the fixed baseline, not just failing to improve) after a change is a ship-blocker, even if the 15-slate itself still passes — the slate can't see a rate change like this.

---

## Scoring

Per venue:

- Score columns 1–8 at field level (and 9–10 as light checks).
- **Venue Pass** = no **Fail** on columns 1–8, and at least 3 of {spaces/capacity, policies, pricing-or-inquire, assets-or-FAQs} are Pass (not all N/A).
- **Precision-critical:** vendors + amenities + inventory + assets — one Fail each is enough to fail the venue.
- **Grounding-check gate:** ≤5% token-coverage mismatch rate on the slate (see Automated check 1).
- **Repeatability gate:** ≥90% of slate venues have stable `capacity_max` / `pricing_model` / `catering` / `event_insurance` across two consecutive `--force` runs.

**Slate gates (ship extractor change only if):**

| Metric | Gate |
|--------|------|
| Venue Pass rate | ≥ **12 / 15** |
| Preferred-vendor precision (among shown names) | ≥ **90%** (empty section counts as Pass) |
| Amenity taxonomy hit rate (shown items mappable) | ≥ **80%** |
| Junk asset rate in UI | **0%** on allowlisted surface |
| Capacity false-positive (wrong card max) | **0** on slate |
| Grounding-check mismatch rate | ≤ **5%** |
| Repeatability (4 core scalars stable across 2 runs) | ≥ **90%** of slate |
| Whole-catalog metrics (dup spaces, fake spaces, sluggy vendors, coverage) | **No regression** from current baseline |

Cost target while iterating: keep re-extract pilots **≲ $0.15/venue** (Flash + cached HTML when possible); the PDF-enrichment escalation adds ≲ $0.01–0.02/venue when it triggers, only on venues with thin HTML-based capacity/pricing/amenities.

---

## How to run a scoring pass

1. Open each slate venue in the product UI (or serving `venue_enrichment` row).
2. Run `npm run enrich-venues-grounding-check -- --ids <slate ids>` — this replaces most of the manual "open the live page and eyeball it" work; only hand-check what it flags plus the per-room-attribution class it can't see.
3. Re-run the slate twice (`--force` both times) and diff the four repeatability scalars.
4. Re-run the whole-catalog SQL baselines and compare against the fixed numbers above.
5. Fill a score sheet: `venue_id, column, field, Pass|Fail|N/A, note`.
6. File Failures as field-level bugs (not "enrichment bad").
7. After fixes: re-enrich **slate only** first; only then consider full batch.

---

## Known failure-mode fixtures (permanent regression list, not just "fix these once")

These replace the old one-off "known bad fixtures" list — each is a **pattern**, verified to recur, not a single venue's bug:

| Pattern | Confirmed venue(s) | Corpus rate | Fixed? |
|---------|---------------------|-------------|--------|
| Multi-event-type page confusion (gala/corporate floor plan surfacing instead of wedding) | Geraghty `16` | Not yet measured catalog-wide | Prompt guidance added; not independently re-verified post-fix |
| Cross-page duplicate space (same room, two labels) | Four Seasons `494` | 7/104 venues with spaces (6.7%) | Fuzzy-key dedup shipped; re-check rate after next full batch |
| Generic-label fake space ("Wedding Venues", "Event Space", "Meeting Rooms" as if a room) | Langham `483`, ids `2`, `79`, `540` | 4/163 venues | Not yet fixed — grounding check flags it (14% coverage) but no code rejects it yet |
| PDF-only capacity/pricing/policy (real data never in crawlable HTML) | River Roast `525`, Wrigley `519` | Not yet measured catalog-wide | PDF-enrichment escalation shipped |
| Whole-FAQ-page off-topic (hotel-guest content, zero wedding relevance) | Chicago Athletic Association `492`, Ambassador Gold Coast `515`, Trump International `513` | Confirmed in 3/3 sampled hotels | **Not fixed** — keyword-reject attempt confirmed insufficient |
| Junk vendor: filming/TV credits | Adler `480` | — | Fixed (LLM classification) |
| Junk vendor: venue-self-reference | Greenhouse Loft `1` | — | Fixed (own-domain guard) |
| Junk asset: corporate-compliance genre beyond named examples | Four Seasons `494` (Modern Slavery Statement) | — | Fixed (prompt + hygiene regex both generalized to a genre, not a fixed list) |
| Phone number URL-encoding artifacts | Langham `483`, Wrigley `519` | — | Fixed (tel: href decode) |
| Sluggy vendor names (URL-slug instead of real business name) | Chez `11`, catalog-wide | 31% of 570 vendor entries pre-fix | Fixed (LLM reads page-title) — **re-measure this rate catalog-wide after next full batch, it's the single best regression indicator for the vendor-classification fix holding** |
| Landmark-named-room false positive (looks like it should be rejected, isn't actually a bug) | Peninsula `484` ("Water Tower Park", "Grant Park") | — | Verified NOT a bug — keep as a check-before-rejecting reminder |

### Pass history

- **Pass 1** (2026-07-16): 0/15 — systemic amenities Fail, vendor/asset junk. [Scorecard](./venue-enrichment-score-pass1.md)
- **Pass 2** (2026-07-16): 15/15 after serving hygiene shipped. [Scorecard](./venue-enrichment-score-pass2.md)
- **Pass 3** (2026-07-16): ≥12/15 after LLM-forward vendor classification. [Scorecard](./venue-enrichment-score-pass3.md)
- **Pass 4** (2026-07-17): 14/15 after PDF-enrichment escalation, space dedup, gala/wedding asset preference, space-level amenity guidance. Only unresolved: CAA-pattern FAQ contamination. Grounding-check mismatch rate 2.9% (token-based), well under the 5% gate.

---

## Product north star

Couples should compare venues the way Amazon compares products: **same columns, trustworthy values, outbound docs for depth**. Enrichment wins when a bride can scan capacity, catering rules, inclusions, and floor-plan/menu links without opening ten tabs — and never sees Privacy Request as a "preferred vendor," never sees the same room counted twice, and never sees a section heading mistaken for a bookable space.

The comparison lens is the actual bar, not just "not obviously wrong": for each column, ask *if this venue sat next to five others in a compare table right now, is this cell populated, or an honest, explained null* — not just whether the current value happens to be non-junk.
