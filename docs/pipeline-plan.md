# dewwey — the wedding vendor graph

A Postgres-backed pipeline that scrapes Instagram wedding "stacks" (the vendor
credit blocks photographers put in captions), normalizes them, and builds a
collaboration graph of who actually works with whom. Chicago first.

**Thesis:** preferred-vendor lists on The Knot/WeddingWire are pay-to-play ads.
Credit stacks are revealed preference. Nobody has that graph.

Proven in the 2026-08-20 POC (`poc/`): one $0.10 scrape of posts tagging
@galleriamarchetti → 21 posts → 4 stacks → 3 deduped weddings → 45 vendors,
427 edges, one wedding independently confirmed by two vendors' posts.

---

## Architecture

```
seeds (venues) ──► apify tagged-scraper ──► raw posts (jsonb)
                                               │
                                    parse: regex → LLM fallback
                                               │
        accounts ◄── new handles ──── post_mentions (role_raw, in_stack)
           │                                   │
  profile enrichment                 wedding dedup (vendor-set Jaccard + date)
  (bio, website, category)                     │
           │                          weddings / wedding_vendors
      account_tags ◄──── role votes ───────────┤
           │                                   ▼
   account_locations                 edges (materialized view)  ◄── THE PRODUCT
     (venue geo = Chicago filter)
```

Schema: `schema.sql`. Everything keyed on natural IDs (post shortcode, username)
so re-scrapes upsert idempotently. Raw actor payloads kept in `posts.raw` jsonb —
the parser can be rerun over history without re-paying Apify.

## Data model (what lives where)

| Table | Answers |
|---|---|
| `posts` | original post: url, date, poster, full caption, raw payload |
| `post_mentions` | lookup of every @mention per post, with raw role text ("Florals") and whether it sat in a credit block |
| `accounts` | every handle seen: ig url, name, bio, external website, followers |
| `account_tags` | what we think they are (florist), with source + confidence + evidence count |
| `account_locations` | venue geo → `in_metro` → is this a Chicago wedding |
| `weddings`, `wedding_posts`, `wedding_vendors` | deduped events; multiple posts about one wedding merge here (merges = confirmations) |
| `crawl_frontier` | recursion control: hops, priority, status per account |
| `edges` (matview) | vendor↔vendor: weddings together, confirmations, recency |

## Parsing: greedy regex first, LLM as the janitor

Three layers, cheapest first:

1. **Regex** over caption lines: `^Role[:|–-] @handle(s)`. POC parser caught all
   4 well-formed stacks. Handles ~80% because photographers copy each other's
   format. Store `role_raw` verbatim.
2. **LLM fallback** (Haiku-class, ~$0.0003/caption): only for captions with ≥3
   mentions that regex couldn't structure — multiline prose credits, emoji
   separators, "flowers by my girl @x". Also normalizes `role_raw` →
   `vendor_role` enum ("HMU" → hair+makeup, "Blooms" → florist).
3. **Account-level tagging is a vote**, not a lookup: an account credited as
   "florist" across 9 posts and "rentals" once is a florist (evidence_count).
   IG's own `business_category` from profile enrichment is a second vote.
   Disagreements surface for manual review instead of silently corrupting.

Never trust one post; trust the distribution.

## Chicago scoping: the venue anchors the wedding

Vendors travel — videographers fly in. Venues don't. Rule:

- **A wedding is a Chicago wedding iff its venue is in the Chicago metro.**
- Venue geo comes from: IG profile (business address / linked website) →
  cross-check against The Knot/Google Maps → `account_locations.in_metro`.
- Non-venue vendors get a *home market* inferred later from the distribution of
  venues they appear at (a photographer 80% at Chicago venues is a Chicago
  photographer). Never gate the crawl on vendor location — only on venue.

## Recursion control (how it doesn't explode)

The frontier is priority-ordered, not FIFO:

- **Hop 0:** hand-seeded Chicago venue list (~300–500 handles, bootstrapped free
  from The Knot/WeddingWire/Zola directory pages + venue hashtags).
- **Only venues get crawled deeply.** New non-venue vendors are recorded +
  profile-enriched but not tagged-feed-crawled by default.
- **New venues discovered in stacks** (hotels, rehearsal-dinner restaurants,
  actual ceremony venues) enter the frontier at high priority *after* geo check.
- Photographers/planners get shallow crawls (their own recent posts, which are
  stack-dense) only when budget remains — they bridge venues and backfill
  weddings at venues we haven't crawled yet.

This keeps the graph metro-bounded by construction: every crawl dollar is spent
within arm's reach of a Chicago venue.

## Budget: what $29/mo of Apify buys

Apify's Instagram actors are pay-per-result, ≈$2.30 per 1,000 items; a paid plan
also unlocks pagination past the first ~21 tagged posts. So **$29 ≈ ~12,500
results/month**. Allocation:

| Monthly spend | What | Yield |
|---|---|---|
| ~$21 | 350 venues × ~26 recent tagged posts | ~9,100 posts |
| ~$5 | profile enrichment, ~2,200 new accounts | bios, websites, categories |
| ~$3 | slack: deeper crawl of hot venues, photographer backfill | |

At the POC's hit rate (~20–30% of tagged posts carry a parseable stack, ~25%
duplicate rate): **≈2,000–2,700 stack posts → ≈1,500–2,000 unique weddings/mo**,
each contributing 8–25 vendors and their clique of edges. Cook County runs
~30k marriages/yr (~2.5k/mo), and only a fraction are IG-credited at all —
so this budget plausibly captures a large share of *recent, credited* Chicago
weddings every month. "Conquer Chicago recency" is realistic at $29; it's the
historical backfill that would need a bigger month.

LLM parsing cost is noise: ~3k captions/mo through Haiku ≈ $1–2.

## Milestones

- [x] **M0 — POC**: one venue, parser, graph demo (done 2026-08-20, see `poc/`)
- [x] **M1 — Foundation**: docker-compose Postgres, `schema.sql` applied,
      POC data loaded as first rows (done 2026-08-20)
- [x] **M2 — Venue seed list**: The Knot/WeddingWire blocked plain HTTP (403) →
      pivoted to Google Maps (`compass/crawler-google-places`): 631 metro places,
      364 IG handles resolved from venue websites, geo-verified by construction.
      267 venues without handles parked in `poc/venues_no_ig.json` ($3.08)
- [x] **M3 — Ingest pipeline**: `pipeline.py` — frontier → tagged-scraper →
      upsert → regex parse, recursive (hop-1 venues/planners/photogs), budget-
      guarded. Crawl nº1 (2026-08-20, $24.58): 308 seeds, 6,370 posts, 981
      stack posts, 11,043 accounts, 1,399 enriched
- [ ] **M4 — Normalizer**: LLM fallback parse + role normalization (7,283
      accounts untagged; 1,310 unparsed captions with 3+ mentions to sweep —
      likely a few hundred more weddings hiding in there, ~$1 of Haiku)
- [x] **M5 — Wedding dedup + edges**: 800 weddings (126 multi-source confirmed),
      34,504 edges; repeat backbone: 335 vendors / 979 pairs at ≥3 weddings
- [ ] **M6 — Recency cron**: monthly re-crawl of venue feeds (new posts only,
      shortcode dedupe), frontier re-prioritization
- [ ] **M7 — Face on it**: graph explorer reading live from Postgres (current
      artifact is a static snapshot of crawl nº1)

## Open questions

- **Where does Postgres live?** Local docker-compose to start (this folder);
  Supabase when it needs to be reachable by a web frontend. Schema is vanilla,
  moves with `pg_dump`.
- **Couple accounts:** stacks sometimes credit the couple. Detectable
  (no business category, low posts, name-like handle) — tag `other`, exclude
  from edges? Probably yes.
- **Multi-metro later:** nothing in the schema is Chicago-specific;
  `in_metro` generalizes to a `metros` table when it's time.
- **ToS posture:** public-post metadata, aggregate graph, no content
  republishing — the defensible flavor. Revisit before anything is public.
