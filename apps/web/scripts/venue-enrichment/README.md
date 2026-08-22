# Venue website enrichment

Extract wedding planning facts, assets, contact/social, and **network vendors** (preferred caterers, florists, photographers, niche vendors) from venue websites.

**Strategy notes (why / phases / AI-native store):**

- [Venue enrichment strategy](../../docs/product/venue-enrichment.md)
- [AI-native data plane](../../docs/engineering/venue-enrichment/data-plane.md)

## Phases (not just Cheerio vs LLM)

| Phase | What | DB | LLM |
|-------|------|----|-----|
| **0 — Spike** | Crawl + extract → **stdout JSON** | No | No (rules); pilot optional |
| **0b — LLM pilot** | Compare rules vs LLM on 10 venues | No | Yes (one call/venue) |
| **1 — Persist** | Migration, save rows, API + venue modal UI | Yes | Yes (hybrid recipe) |
| **2 — Batch** | All Chicago venues, `needs_review`, re-run | Yes | Yes; focus on failures/gaps |
| **3 — Product** | Browse filters on capacity, policies, assets | Yes | Optional |

**Phase 0** proves extraction quality. Production path is **hybrid** (rules + one LLM call/venue) — see strategy docs above.

## Phase 0 / 1 CLI

```bash
# By URL (no database)
npm run enrich-venue -- --url https://www.wcofe-events.com/

# By vendor id (loads website from RDS)
npm run enrich-venue -- --vendor-id 42

# Phase 1 — crawl + rules + LLM + persist to RDS
npm run enrich-venue -- --vendor-id 42 --use-llm --persist

# Seed from existing llm-pilot JSON (no re-crawl / no LLM spend)
npm run enrich-venue -- --persist-pilot --venue "Artifact Events"
npm run enrich-venue -- --persist-pilot --all-pilot

# Options
npm run enrich-venue -- --url https://example.com --max-depth 3 --max-pages 30 --pretty
```

Stdout: `{ rules, llm }` JSON. With `--persist`, also upserts `venue_extraction_runs` + `venue_enrichment` (migration `006_`).

## Phase 2 — batch all venues

**Done** for the original Chicago venue set. **Expanded catalog** (hotels/museums/clubs, often `id >= ~478`) — pin lifted after hygiene pilots; Jul 2026 remaining batch: **37 success / 23 partial / 22 failed** (~$3.37 Vertex; see strategy status + `sample-output/batch-enrich/run-1784000898170.json`). Re-run skips `success` unless `--force`.

```bash
# Remaining venues (skip status=success; re-run failed / never enriched)
npm run enrich-venues-batch

# Preview queue only
npm run enrich-venues-batch -- --dry-run

# Cap for a smoke test
npm run enrich-venues-batch -- --limit 5

# Also re-run needs_review rows, or force everyone
npm run enrich-venues-batch -- --include-review
npm run enrich-venues-batch -- --force
```

Single venue (preferred for spot-checks):

```bash
npm run enrich-venue -- --vendor-id 478 --use-llm --persist
```

### Spaces backfill (no LLM)

Rebuilds `facts.spaces[]` from existing `capacity_configurations` and bumps `schema_version` to 2:

```bash
npm run enrich-venues-backfill-spaces
npm run enrich-venues-backfill-spaces -- --vendor-id 7
npm run enrich-venues-backfill-spaces -- --dry-run --limit 15
```

### Expanded catalog pilots + batch

Wave 1 (spaces): Drake `478`, Field `479`, Adler `480`, Langham `483`, Art Institute `489`, CAA `492`.  
Wave 2: Botanic `481`, Peninsula `484`, LondonHouse `506`, Palmer House `505`, Shedd `546`.

**Status:** pilots done; **full remaining-venue batch DONE** (82 processed ≈$3.37; enrichment ~37 success / 23 partial / 22 failed — mostly 403/empty). Palmer `505` / Field `479` → **`partial`** after capacity guards. Peninsula `484` → **failed** (HTTP 403). Strategy status block is source of truth.

Hygiene: lodging URL skip; museum rental bias; ADR `price_display` reject; null `≤0` caps; wedding-space filter; labeled Ceremony / Banquet / Reception + seated with|without dance → `spaces[]` fields.

Dumps: `sample-output/pilot-hygiene/` · `sample-output/pilot-wave2/stdout-{id}.json`. Details in [venue-enrichment.md](../../docs/product/venue-enrichment.md) status block.

Gold-test multi-space venue: Galleria Marchetti `7` (fees + descriptions + sq ft).

```bash
# Re-enrich one venue after extractor changes
npm run enrich-venue -- --vendor-id 478 --use-llm --persist
```

Writes run reports under `scripts/venue-enrichment/sample-output/batch-enrich/`.

## Crawl rules

- Start at the venue homepage (or `--url`)
- **Wedding-focused by default** — skip corporate, mitzvahs, blog/calendar; museum public programs (`/our-events`, educational) skipped when possible
- Prefer wedding / venue-rental / private-events / banquet / ballroom paths; **hard-skip hotel lodging** (`/rooms`, `/accommodations`, `/stay`, rates, reservations)
- Follow **nav/header/footer links** + links whose URL matches wedding/event/policy/vendor keywords
- Same origin only, **max depth 3**, **max pages ~30**
- Skip images, PDFs, and `/wp-content/uploads/` paths (assets extracted from HTML, not crawled as pages)
- Optional `--probe-seeds`: also try common paths like `/weddings`, `/venue-rentals`, `/private-events` (off by default — many sites 404)
- Optional `--all-events`: disable wedding filter and include corporate/social pages

## FAQs (`faqs[]`)

Structured Q&A from `/faq` pages **and** in-page FAQ sections (e.g. homepage `#faqs` / Framer accordions):

```json
{
  "question": "Are candles allowed?",
  "answer": "Yes, but they must be contained in a votive or hurricane...",
  "source_url": "https://venue.com/faqs"
}
```

Dedupe by normalized question text per venue.

## Network vendors (`network_vendors[]`)

Venues publish **preferred / recommended vendor lists** — strong ecosystem signals beyond Instagram @mentions.

Each entry:

```json
{
  "name": "Big Delicious Catering",
  "url": "https://bigdelicious.com",
  "relationship": "preferred",
  "categories": ["caterer"],
  "labels": ["Preferred Caterers"],
  "specialty": null,
  "instagram_handle": null,
  "source_url": "https://venue.com/preferred-caterers/",
  "raw_context": null
}
```

- **`categories`**: Dewy taxonomy when guessable (`venue`, `caterer`, `florist`, `photographer`, `dj_music`, `hair_makeup`, `other`)
- **`specialty`**: free text for niche vendors (linens, candles, rentals) when category is `other`
- **`relationship`**: `preferred` | `recommended` | `local_resource` | `partner` | `vendor_link`
- **`labels`**: heading on the page (`list_title`) for traceability

Dedupe by normalized URL or normalized name per venue.

## Full output schema (v1 rules / v2 serving)

See `enrich.js` for rules baseline. Major sections: `about`, `contact`, `social`, `amenities`, `policies`, `pricing`, `spaces`, `included_inventory`, `addons`, `assets`, `network_vendors`, `faqs`, `raw_lists`, `sources`, `pages_crawled`.

### Serving spaces (`facts.spaces[]`, schema_version 2)

One vendor row; rooms are JSONB child facts — **no new tables**.

```json
{
  "name": "Pavilion",
  "bookable_separately": true,
  "description": "Glass-enclosed main hall…",
  "sq_ft": 10000,
  "capacity": {
    "seated_max": 450,
    "seated_with_dance": 350,
    "cocktail_max": 900,
    "ceremony_max": null,
    "as_stated": null
  },
  "setting": "indoor",
  "amenities": [],
  "included_inventory": [],
  "fees": [
    { "day": "saturday", "season": null, "amount": 6000, "unit": "venue_fee_usd", "includes": null }
  ],
  "assets": [],
  "source_url": "https://…"
}
```

Built in `persist.js` via `spaces.js`:

1. Roll up `capacity_configurations[]` → named spaces + capacity breakdown  
2. Merge LLM `spaces[]` (description, sq_ft, room fees)  
3. Attach matching `fee_schedule[]` rows onto `spaces[].fees`; unmatched fees stay venue-level  

**Card `capacity_max` guards:** ignore amalgam room names (`Combined`, `Three Ballrooms`, …); never promote cocktail/reception alone to the card scalar; `≥1000` → null + `needs_review` / `partial`. Prefer seated / banquet / with-dance from labeled tables when present.

Backfill existing rows without re-LLM: `npm run enrich-venues-backfill-spaces`.

## LLM pilot (Phase 0b)

Compare **rules baseline** vs **Gemini** on the same crawled HTML (two models per venue).

**Preferred provider: Vertex AI** (uses GCP billing credits). AI Studio API keys need Prepay and do **not** draw from Free Trial welcome credits.

```bash
# .env.local (Vertex):
# GOOGLE_CLOUD_PROJECT=wedding-app-499122
# GOOGLE_CLOUD_LOCATION=global
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json

# Crawl + rules + Vertex Gemini 3.5 Flash + 3.1 Flash-Lite
npm run enrich-venue-llm-pilot -- --provider vertex

# Re-use cached HTML (recommended after first run)
npm run enrich-venue-llm-pilot -- --use-cache --provider vertex

# LLM only on cached HTML (Flash only — cheaper verify)
npm run enrich-venue-llm-pilot -- --llm-only --models flash --provider vertex

# LLM only on cached HTML (3 venues)
npm run enrich-venue-llm-pilot -- --llm-only --limit 3 --provider vertex

# Rules + cache only (no LLM)
npm run enrich-venue-llm-pilot -- --rules-only
```

**Pilot models:**
- `gemini-3.5-flash` — primary (quality)
- `gemini-3.1-flash-lite` — cheap scale comparison
- `--models flash|lite|all` to choose which to run

LLM schema notes (v3 + spaces):
- **Capacity:** `capacity_max` (seated-preferring) + `capacity_as_stated` + `capacity_configurations[]` + `spaces[]`
- **Pricing:** `price_display` + `pricing_model` (+ `mixed`) + `pricing_as_stated` + `fee_schedule[]`
- **Assets:** rules `assets[]` ∪ LLM `discovered_assets[]` — **URLs only**, never PDF binaries; prompt gets capped `ASSET CANDIDATES` link list

Output per venue: `{slug}-rules.json`, `{slug}-llm-gemini-3-5-flash.json`, `{slug}-llm-gemini-3-1-flash-lite.json`, `_summary.json`.

### Vertex setup checklist

1. Enable **Vertex AI API** (`aiplatform.googleapis.com`) on project `wedding-app-499122`
2. Service account `wedding-app-gemini@…` → role **Vertex AI User** (`roles/aiplatform.user`)
3. Create + download SA JSON key → set `GOOGLE_APPLICATION_CREDENTIALS` in `.env.local`
4. Confirm **Billing → Credits** still shows remaining balance

### Provenance model (quote + source)

Every LLM field uses `{ value, quote, source_url }`:

```json
{
  "capacity_max": {
    "value": 300,
    "quote": "Wedding - Ceremony, Reception & Afterparty 300 Guests",
    "source_url": "https://thegeraghty.com/floor-plans"
  }
}
```

This is the product-facing pattern: show the fact **and** where it came from. Cheap to store, essential for trust and re-verification.

LLM schema notes (v2):
- **Capacity stays broad:** `capacity_max` (one primary wedding number) + `capacity_as_stated` (verbatim wording). Normalize seated/standing later.
- **Catering enum:** `open` | `preferred_list_required` | `exclusive_in_house` | `unknown`
- **Event insurance:** `required` | `not_required` | `venue_covers` | `unknown`
- **Amenities + included_inventory:** thorough space features vs countable rental inclusions (tables, chairs, drape, etc.)

Crawl notes:
- Partner/caterer paths (`/caterers-partners`, `/partners`) are wedding-relevant and high priority.
- FAQ extractor supports `<p><strong>Question?</strong></p>` patterns (e.g. Geraghty).

Rules extraction already uses `sources[]` with `{ field, url, quote }` — same mental model.

### Fetch strategy: HTTP first, Playwright fallback

Batch enrichment uses plain `fetch` — no Playwright by default. Escalate only for empty SPA shells / JS-rendered tables. **Known deferral:** Langham Chicago wedding-venues comparison table (caps thin without SPA render) — Playwright later, not blocking hotel batch.

### Object storage (S3/R2): defer for now

Claude’s “store raw HTML by content-hash in object storage” is right **at scale** (re-extract with a better model without re-crawling). For ~85 venues and the pilot:

- **Now:** local `sample-output/llm-pilot/cache/` (same layout you’d use in S3)
- **Phase 2:** move cache to R2/S3 when batch re-runs or HTML volume grows

Hybrid split in production:

| Layer | Tool |
|-------|------|
| Crawl | Heuristics (current `crawl.js`) |
| Contact, social, vendors, PDFs | Rules (current `extract.js` + `pdf-vendors.js`) |
| Amenities, policies, capacity, pricing, about | LLM (one call/venue, provenance schema) |
| Validate | Schema + null-if-not-stated |
