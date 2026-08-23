# Enrichment quality score — Pass 3

**Scored:** 2026-07-16 (after LLM-forward slate re-enrich `--force`)  
**Change under test:** Closed amenity enums + hygiene on persist; slate IDs `7,16,11,99,478,480,481,483,484,492,494,506,519,525,1`.  
**Run:** `slate-reenrich-1784251058.log` / `run-1784251627056.json`  
**LLM cost this pass:** ≈ **$0.77** (15 venues, Vertex `gemini-3.5-flash`; avg ≈$0.051/venue)

### Headline

| Metric | Pass 2 | Pass 3 | Gate |
|--------|--------|--------|------|
| Batch pipeline | n/a | **15 ok / 0 failed** (10 success / 5 partial) | — |
| Amenity taxonomy (shown) | map-or-omit | **101 / 101 (100%)** | ≥80% |
| Fathead / Privacy junk vendors | omitted | **0 hits** on slate | — |
| River Roast `10–1200` | cleared | still **null** card max | 0 false-positive |
| Venue Pass (spot) | 15/15 | **≥12/15** (see notes) | 12/15 |

**Verdict:** Slate is good enough to scale. Amenities refilled with taxonomy-only labels; known-bad fixtures no longer show experience/footer junk. Soft gaps remain on card capacity for loft/restaurant/stadium partials and Adler’s leftover film-credit “vendors.”

---

## Batch outcomes (slate)

| id | Venue | status | capacity_max | needs_review | cost |
|----|-------|--------|--------------|--------------|------|
| 1 | Greenhouse Loft | success | 175 | false | $0.061 |
| 7 | Galleria Marchetti | success | 450 | false | $0.059 |
| 11 | Chez Wedding Venue | partial | null | true | $0.042 |
| 16 | The Geraghty | partial | null | true | $0.034 |
| 99 | The Joinery | partial | null | true | $0.034 |
| 478 | The Drake Hotel | success | 500 | false | $0.042 |
| 480 | Adler Planetarium | success | 370 | false | $0.071 |
| 481 | Chicago Botanic Garden | success | 300 | false | $0.055 |
| 483 | The Langham, Chicago | success | 250 | false | $0.046 |
| 484 | The Peninsula Chicago | success | 320 | false | $0.053 |
| 492 | Chicago Athletic Association | success | 280 | false | $0.077 |
| 494 | Four Seasons Hotel Chicago | success | 560 | false | $0.071 |
| 506 | LondonHouse Chicago | success | 190 | false | $0.049 |
| 519 | Wrigley Field | partial | null | true | $0.048 |
| 525 | River Roast | partial | null | true | $0.028 |

**Done line:** `queued=15 ok=15 failed=0 cost≈$0.7671`

---

## Priority spot-checks (serving)

| Venue | Amenities | Vendors | Capacity | Notes |
|-------|-----------|---------|----------|-------|
| Wrigley `519` | taxonomy (catering/bar/outdoor/views) | **omitted** | null + review; space names kept | Experiences / Fathead gone |
| River Roast `525` | valet, outdoor ceremony/reception, catering… | **omitted** (hygiene dropped 4) | null (not amalgam span) | Pass on junk columns |
| Geraghty `16` | valet, preferred caterers, bar, AV… | Blue Plate, Paramount, Kehoe, Floral Exhibits | null card; as_stated has wedding 300 | Preferred list preserved |
| Marchetti `7` | ceremony/outdoor/in-house… | omitted | **450** Pavilion/La Pergola | Gold spaces intact |
| Adler `480` | skyline, catering, outdoor, wifi, ADA | 19 leftovers (film credits / inquiry form) | **370** seated | Donor wall still dropped (368); tighten film-credit gate later |

---

## Remaining concerns (non-blocking for full batch)

1. **Adler / museum film walls** — hygiene removes donors; production titles still sneak in as `network_vendors`.
2. **Partial card max** — Geraghty, Chez, Joinery, Wrigley, River Roast correctly cautious (`needs_review`) but UI filter coverage thinner.
3. **Chez vendor names** — still URL-sluggy; precision OK, presentation polish later.
4. **Four Seasons** — stray vendor label `More...` (cosmetic).

---

## Next

Full catalog `--force` re-enrich after this pass (see strategy / README status). Re-score only if serving gates regress.
