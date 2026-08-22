# dewwey

Wedding vendor intelligence for Chicago. Two projects merged into one:

- **Ben's graph pipeline** — scrapes Instagram wedding credit stacks
  (`Planning: @x / Venue: @y`) into a collaboration graph of who actually works
  with whom. Weddings are the unit of truth; duplicate posts are confirmations;
  roles are votes. 1,384 weddings / 54k vendor-pair edges and counting.
- **Jeremy's app** (`apps/web`) — Next.js marketplace UI: venue browse + map,
  Google-Places-seeded vendor identity, LLM venue enrichment with provenance.

Directory listings (The Knot) are pay-to-play. Credit stacks are revealed
preference. Nobody else has that graph.

## Layout

```text
apps/web/    Next.js app (Vercel). API routes replaced the old Lambda.
pipeline/    Crawler + parser (Python today, TypeScript port planned).
docs/        Merge evaluation, plans, decisions.
```

## Stack — deliberately few variables

| Concern | Choice | Replaces |
| --- | --- | --- |
| Database | **Supabase Postgres** (Dewwey org, us-east-1) | AWS RDS ×2, RDS Proxy plans |
| App + API | **Next.js on Vercel**, route handlers | Lambda + API Gateway ×2 |
| Environments | **Vercel preview branches** | beta branch/domain/DB/Lambda stack |
| Images | **Cloudflare R2** (zero egress) | IG/Places hotlinks + refresh cron |
| LLM | **OpenRouter** (one key, any model) | Gemini + Vertex SA + OpenAI paths |
| Scraping | **Apify** (one account) | two Apify setups |

The full environment contract is [.env.example](.env.example) — if a change
needs a new env var, that's a design smell first and a PR discussion second.

## Scraping strategy (the layered hybrid)

1. **Identity layer** — Google Places seeds `vendors` (addresses, ratings,
   photos, websites). Script-time only, never a runtime dependency.
2. **Graph layer (the core loop)** — venue tagged-feed crawl → credit-stack
   parse → wedding dedup (Jaccard > 0.5 within 21 days = confirmation, not
   noise) → `edges` materialized view. A wedding is Chicago iff its venue is.
3. **Enrichment layer** — profile scrapes for bio/avatar/followers, venue
   website extraction (capacity, catering, insurance) with per-claim
   provenance. Selective, not per-post.

Raw payloads are always kept so parsers can re-run without re-paying Apify.

## Running

```bash
# App
cd apps/web && npm install && npm run dev

# Pipeline (against local Docker Postgres for rehearsals, Supabase for real)
cd pipeline && docker compose up -d
python3 pipeline.py [m2|ingest|enrich|dedup|report|all]
```

## Status / near-term

- [ ] Data migration into Supabase (Ben's graph DB + Jeremy's vendors/posts)
- [ ] R2 bucket + move avatars (60 MB) and venue photos off hotlinks
- [ ] Link repo to Vercel, point dewwey.com here
- [ ] Re-parse Jeremy's 47k stored captions through the Haiku sweep
- [ ] TypeScript port of the pipeline (926 lines of Python)
