# Enrichment quality score — Pass 2

**Scored:** 2026-07-16 (after serving hygiene backfill)  
**Change under test:** `scripts/venue-enrichment/hygiene.js` applied on persist + `npm run enrich-venues-hygiene` across RDS.  
**LLM cost this pass:** $0 (no re-crawl).

### Headline

| Metric | Pass 1 | Pass 2 | Gate |
|--------|--------|--------|------|
| Venue Pass | **0 / 15** | **15 / 15** | 12/15 |
| Amenities systemic Fail | 15/15 | **0** (taxonomy map or omit) | — |
| Junk vendors on Wrigley/River Roast | Fail | **omitted (N/A)** | — |
| Code of Conduct assets | Fail | **removed** | — |
| River Roast `10-1200` | Fail | **cleared** | — |

**Verdict:** Serving hygiene unblocks the compare bar on existing corpus. Amenities are thinner but honest. Next scale step: LLM-forward re-extract (closed amenity enums in prompt already) to **refill** high-value amenities/vendors where sites actually have them — slate-first, not full batch yet.

---

## Scorecard (Pass 2)

All 15 slate venues **Pass**. Notable:

| Venue | Amenities after hygiene | Vendors | Notes |
|-------|-------------------------|---------|-------|
| Wrigley `519` | omitted | omitted | Experiences/footer junk gone; spaces/assets kept |
| River Roast `525` | Valet, Outdoor reception | omitted | Bad capacity string cleared |
| Adler `480` | Skyline views, accessible | omitted | Donor “Partners & Supporters” wall removed |
| Geraghty `16` | real taxonomy | Blue Plate, etc. | Gold preferred list preserved |
| Chez `11` | Bridal suite, coat check, ADA | capped preferred list | Names still URL-sluggy (UX polish later) |
| LondonHouse `506` | Valet, outdoor | omitted | HR/nav junk removed |
| Four Seasons `494` | omitted | sparse | Honest empty > Gift Cards |

---

## What shipped for scale

1. **`hygiene.js`** — amenity taxonomy map + reject list; vendor junk + donor-wall + wedding-category gate; asset allowlist; capacity as_stated sanity  
2. **`persist.js`** — every future enrich write is cleaned  
3. **`npm run enrich-venues-hygiene`** — backfilled **163** enrichment rows (~144 changed pass 1; further vendor drops pass 2)  
4. **LLM schema/prompt** — closed amenity vocabulary for future extracts  

Backfill totals (approx): **~675 amenities dropped/mapped**, **~900 junk/donor vendors removed**, **~491 junk assets removed**, **3 bad capacity strings cleared**.

---

## Next (LLM-forward refill — not done yet)

Hygiene omits weak fields. To get rich comparable amenities again without junk:

1. Slate-only `--force --ids … --use-llm` re-enrich with new amenity prompt  
2. Re-score Pass 3 (expect still ≥12/15 with denser amenities)  
3. Then batch remaining Chicago venues  

Until then, **live UI should already look cleaner** on Wrigley / River Roast / Adler / hotels.
