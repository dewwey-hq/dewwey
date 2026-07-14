# AI-native data plane for venue enrichment

**Status:** Phase 1 DDL + persist path landed (`006_venue_enrichment.sql`, `venue_extraction_runs` + `venue_enrichment`). HTML still local/cache-only. Complements [vendor-aggregation-strategy.md](./vendor-aggregation-strategy.md).

**Goal:** Store enrichment so the app can query facts *and* future AI features can treat venues as grounded, re-processable knowledge — without bolting RAG/agents onto a one-shot JSON dump later.

---

## Principles

1. **Separate source vs derived vs serving**
   - **Source:** crawled pages (HTML/PDF), addressable by content hash / storage key
   - **Derived:** rules + LLM extraction runs (versioned, replaceable)
   - **Serving:** indexed fields the UI, filters, and tools read as “current”

2. **Provenance is first-class** — every claim keeps `{ value, quote, source_url }` (LLM) or `sources[]` (rules). That powers “show me why,” citations in answers, and hallucination checks.

3. **Never overwrite history blindly** — keep `crawled_at` / `extracted_at` / `schema_version` / `model_id`. A new model = a new derivation row, not a silent replace of the only copy.

4. **Chunkable text (when we need it)** — clean page text or pointers so later we can embed “Geraghty FAQ + amenities” without re-crawling every time.

5. **Feedback loop** — `needs_review`, human corrections, accepted/rejected claims → prompt/eval improvements.

6. **Tool-shaped records** — agents should call something like `get_venue_facts(vendor_id)` and get structured + cited data, not scrape again.

---

## Stack shape

```text
Object store (later)     RDS                              Later AI layer
────────────────────     ───                              ──────────────
page HTML/PDF            vendors (existing)               embeddings / vector index
  by content-hash        venue_enrichment_runs            agent tools
                         venue_facts (JSONB + indexes)    eval / correction sets
                         venue_page_index (optional)
```

| Layer | Store | Role now | AI use later |
|-------|--------|----------|--------------|
| Raw pages | Local cache → R2/S3 | Re-extract without re-crawl | Audit, re-run, optional chunking |
| Extraction runs | RDS | History of rules/LLM jobs | Compare models; rollback |
| Facts + provenance | RDS (JSONB + a few indexed columns) | Modal, filters, API | Cite-backed Q&A; agent tools |
| Clean text chunks | Optional RDS / object + embeddings table | — | Semantic search across venues |
| Reviews / corrections | RDS | Ops queue | Improve prompts / eval |

**Phase 1 can be RDS-first for facts**, with cache paths that match future object keys (`venues/{id}/pages/{hash}.html`). Promote HTML to object storage when batch re-runs or volume needs it — not blocked on S3 for the first persist.

Avoid: one giant blob with no indexes **and** no run history.

---

## Minimal schema mindset (not final DDL)

- **`venue_crawl_runs`** — when, start URL, page_count, status, storage prefix
- **`venue_pages`** — url, content_hash, storage_key, optional cleaned_text_ref
- **`venue_extraction_runs`** — method (`rules_v1` / `vertex:gemini-3.5-flash`), schema_version, cost, latency, status
- **`venue_enrichment` (serving)** — one **current** row per vendor: capacity, catering, insurance, amenities JSON, `capacity_as_stated`, `needs_review`, pointers to latest run ids
- **Claims** stay nested with provenance inside JSONB (or a `venue_claims` table if we go hardcore later)

Default lean choice: **JSONB + a few indexed columns** for serving; normalize further only when query patterns demand it.

### Decisions before coding Phase 1

1. Serving shape: fat JSONB + indexes vs fully normalized tables (JSONB+indexes is fine to start).
2. HTML: local path convention that mirrors future S3 keys; TTL for long-term copies (see legal).
3. One “current” enrichment per vendor **plus** history of runs — don’t only keep latest.

---

## Legal / retention posture (build pattern)

Not legal advice — product defaults so we don’t paint ourselves into a “mirror the internet” corner.

| Practice | Relative risk | Our default |
|----------|---------------|-------------|
| Fetch public pages politely | Lower | Yes — rate limits, same-origin crawl caps |
| Store derived facts + short provenance quotes | Lower–medium | **Primary product store** |
| Ephemeral HTML cache for re-parse (TTL) | Medium | Prefer over forever archives |
| Permanent full HTML/PDF corpus | Higher | Avoid as v1 source of truth |
| Republish their prose / photos / PDFs to users | Highest | **Don’t** — link to `source_url` |

**AI-native ≠ permanent wholesale copies.** Prefer versioned extractions + provenance + optional short-lived source cache. Re-crawl when source text is needed again. Respect `robots.txt` and site ToS where practical; never bypass logins/CAPTCHAs.

---

## Cool AI later this unlocks

Because facts are structured, versioned, and cited:

- **Cite-backed Q&A** — “Does Geraghty require insurance?” → answer + quote + URL
- **Evidence-based compare** — capacity / catering / policies across venues with receipts, not vibes
- **Targeted re-extract** — only `needs_review` or stale runs with a newer model; no full re-crawl tax every time
- **Couple-facing “why this match”** — recommendations grounded in site text we actually extracted
- **Planning agents** — tools that read preferred vendor lists, FAQ policies, and inventory without re-scraping
- **Eval loops** — human corrections become a set to measure the next prompt/model against

Those features want this plane up front. Dumping one JSON blob into a column and “adding RAG later” usually means redoing storage.

---

## Relationship to the aggregation pipeline

```text
Crawl (source)     →  page artifacts (hash / TTL cache)
Rules + LLM        →  extraction_runs (derived, versioned)
Merge / validate   →  venue_enrichment current row (serving)
needs_review       →  ops + future eval
```

Ops, phases, **pipeline algorithm**, and the **field catalog** (owner + pull logic per column) live in [vendor-aggregation-strategy.md](./vendor-aggregation-strategy.md). This doc owns **how we store and evolve** what that pipeline produces so AI features stay cheap to add.
