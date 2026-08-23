# Enrichment quality score — Pass 1

**Scored:** 2026-07-16  
**Method:** Serving `venue_enrichment` rows (what the UI can show) + rubric in `docs/engineering/venue-enrichment/quality-rubric.md`.  
**Grounding:** Heuristic scan of facts, then human calibration on junk vs wedding-comparable signal.  
**Gate:** ≥12/15 venue Pass → **0/15** (miss).

### Headline

| Metric | Result | Gate |
|--------|--------|------|
| Venue Pass | **0 / 15** | 12/15 |
| Systemic Fail column | **Amenities** (15/15 Fail) — open marketing/experience strings, not taxonomy |
| Also frequent Fail | **Vendors** (junk/nav) · **Assets** (Code of Conduct) on bad fixtures |
| Often OK | Capacity/spaces · policies enum · inventory · FAQs (when present) · event pricing |

**Verdict:** Pipeline is not comparison-ready. Regex/link-vacuum + unconstrained LLM amenities are the main poison. Do **not** full-batch re-enrich until amenities/vendors/assets serving gates land.

---

## Scorecard

P = Pass · F = Fail · — = N/A (correctly empty / not on site)

| Venue | Cap | Price | Pol | Amen | Inv | Vend | FAQ | Asset | Venue | Top Failures |
|-------|-----|-------|-----|------|-----|------|-----|-------|-------|--------------|
| Galleria Marchetti `7` | P | P | P | F | P | — | P | — | **F** | Amenities marketing (“architecturally rich…”) |
| The Geraghty `16` | P | — | P | F | P | P | P | P | **F** | Amenities mix sq-ft marketing with real features |
| Chez Wedding Venue `11` | — | P | P | F | P | P* | P | P | **F** | Amenities; *vendors=137 URL-slugs (noisy but not footer junk) |
| The Joinery `99` | — | — | P | F | P | — | P | P | **F** | Amenities prose; no card capacity/spaces |
| The Drake Hotel `478` | P | — | P | F | — | — | — | P | **F** | Amenities too thin/marketing |
| Adler Planetarium `480` | P | P | P | F | — | F | P | P | **F** | Amenities experiences; **390 “vendors”** (Donate, Account Login…) |
| Chicago Botanic Garden `481` | P | — | P | F | — | F | — | P | **F** | Amenities views; vendors=tourism partners not wedding list |
| The Langham `483` | P | — | P | F | P | — | — | P | **F** | Amenities mixed; caps thin |
| The Peninsula `484` | P | — | P | F | — | — | — | P | **F** | Amenities = services/cake/Packard not taxonomy |
| Chicago Athletic Assn `492` | P | — | P | F | — | — | P | P | **F** | Hotel lifestyle amenities (bikes, fitness, Topgolf) |
| Four Seasons `494` | P | — | P | F | P | F | — | P | **F** | Vendors: Itinerary / Check Rates / Gift Cards |
| LondonHouse `506` | P | P | P | F | P | F | — | P | **F** | Vendors: Reserve A Room / Best Rate Guarantee… |
| **Wrigley Field `519`** | P | — | P | F | — | F | — | F | **F** | Experiences as amenities; footer junk vendors; Conduct PDF |
| **River Roast `525`** | F | — | P | F | — | F | — | F | **F** | `10-1200 Guests`; Order Online/Fathead vendors; Conduct PDF |
| Greenhouse Loft `1` | P | P | P | F | P | P | P | P | **F** | Amenities include DJ package / photobooth as “amenities” |

\*Chez vendor list is a real preferred-vendor crawl but names are low-quality slugs (`Tpgchi`, `Blueplatechicago`) — Pass on “not footer junk,” Fail-adjacent for compare UX.

---

## Column rollup

| Column | Pass | Fail | N/A | Notes |
|--------|-----:|-----:|----:|-------|
| Capacity / spaces | 11 | 1 | 3 | River Roast Fail (`10-1200`). Joinery/Chez thin spaces. |
| Pricing | 5 | 0 | 10 | Event event prices OK when present (Marchetti packages, LondonHouse $/person). |
| Policies | 15 | 0 | 0 | Enum usually present; not deeply audited vs live site this pass. |
| **Amenities** | **0** | **15** | 0 | **Systemic.** Needs closed taxonomy + drop marketing/experiences. |
| Included inventory | 9 | 0 | 6 | Relatively strong when present (tables/chairs/bars). |
| Preferred vendors | 4 | 5 | 6 | Empty is fine; Fail = nav/footer/partner junk or inflated lists. |
| FAQs | 7 | 0 | 8 | OK when present (Geraghty, Chez, CAA…). |
| Assets | 11 | 2 | 2 | Wrigley + River Roast ship Code of Business Conduct. |

---

## Fixture detail (worst)

### Wrigley `519`
- **Vendors shown:** download catering menu · Privacy Request · Code of Business Conduct · fathead design → **0% precision**
- **Amenities:** batting cage / trophy / tours / alumni / organist → experiences, not wedding amenities
- **Assets:** includes Code of Business Conduct PDF
- **Spaces:** actually useful (1914 Club, W Club, …) — keep; fix the other columns

### River Roast `525`
- **Capacity:** `10-1200 Guests` with no spaces → Fail
- **Vendors:** Order Online · Reservations · Gift Cards · Follow on FB/IG · Privacy · Fathead
- **Amenities:** marketing views + some real (valet, patio)
- **Assets:** Conduct PDF again (Compass/Levy footer pattern)

### Adler `480`
- **Vendors count 390** including Account Login, Donate, Cosmic Cafe — treat as Fail even if not classic footer strings
- Telescope / exhibition “amenities” Fail taxonomy

---

## What this means for the approach

1. **Regex is not the path for amenities / vendor meaning** — confirm. Inventory/FAQs/contact can stay rules-assisted.
2. **Serving gates would flip several Venue Fails to closer to Pass** without re-crawl: hide amenities not in taxonomy; hide vendors matching junk + nav; allowlist asset kinds; null River Roast capacity card.
3. **LLM-forward re-extract** still needed so amenities come back as enums (not “hide everything”).
4. **Re-score Pass 2** after: (a) serving hygiene gates, (b) slate-only LLM amenity/vendor/asset pass.

### Suggested Pass 2 target
- Amenities: taxonomy-only or omit → expect many N/A or Pass  
- Vendors: omit if &lt;2 clean names → Wrigley/River Roast/Four Seasons/LondonHouse/Adler/Botanic should become N/A Pass  
- Assets: drop Conduct/privacy  
- Then expect Venue Pass **roughly 8–12/15** before full LLM amenity fill

Raw machine dump: `scripts/venue-enrichment/sample-output/slate-score-pass1.json`
