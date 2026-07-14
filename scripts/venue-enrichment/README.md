# Venue website enrichment

Extract wedding planning facts, assets, contact/social, and **network vendors** (preferred caterers, florists, photographers, niche vendors) from venue websites.

**Strategy notes (why / phases / AI-native store):**

- [Vendor aggregation strategy](../../docs/vendor-aggregation-strategy.md)
- [AI-native data plane](../../docs/ai-native-data-plane.md)

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

Writes a run report under `scripts/venue-enrichment/sample-output/batch-enrich/`.

## Crawl rules

- Start at the venue homepage (or `--url`)
- **Wedding-focused by default** — skip corporate, mitzvahs, blog/calendar, private events
- Follow **nav/header/footer links** + links whose URL matches wedding/event/policy/vendor keywords
- Same origin only, **max depth 3**, **max pages 18**
- Skip images, PDFs, and `/wp-content/uploads/` paths (assets extracted from HTML, not crawled as pages)
- Optional `--probe-seeds`: also try common paths like `/weddings`, `/contact-us` (off by default — many sites 404)
- Optional `--all-events`: disable wedding filter and include corporate/social pages

## FAQs (`faqs[]`)

Structured Q&A from `/faq` and similar pages:

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

## Full output schema (v1)

See `enrich.js`. Major sections: `about`, `contact`, `social`, `amenities`, `policies`, `pricing`, `spaces`, `included_inventory`, `addons`, `assets`, `network_vendors`, `faqs`, `raw_lists`, `sources`, `pages_crawled`.

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

LLM schema notes (v3):
- **Capacity:** `capacity_max` + `capacity_as_stated` + `capacity_configurations[]` (space × setting × style × guests)
- **Pricing:** `price_display` + `pricing_model` (+ `mixed`) + `pricing_as_stated`
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

Batch 1–3 (~30 venues) succeeded with plain `fetch` — no Playwright. Treat headless browser as **escalation only** when a page is an empty SPA shell or content is JS-rendered. Not the default path.

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
