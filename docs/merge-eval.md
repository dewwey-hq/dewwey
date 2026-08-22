# Jeremy's wedding-app — evaluation & merge plan

*2026-08-22. Repo cloned to `./wedding-app` (github.com/jhoffen/wedding-app). Live findings
from his **beta** RDS (`wedding-app-beta-db`, explored read-only via creds in `jeremey.ev`).*

## What his stack is

- **Frontend**: Next.js 16 on Vercel — dewwey.com (prod, `main`) + beta.dewwey.com (`beta`
  branch, password gate in middleware). Venue browse w/ Google Maps panel, Instagram
  lightbox, shadcn/Tailwind 4.
- **Backend**: ONE Lambda (`vendor-search`) behind API Gateway, ~2 read-only endpoints:
  `GET /vendors` (search/filter/paginate) and `GET /vendors/{id}` (detail + realWeddings +
  frequentlyWorksWith computed at read time from `instagram_posts.mentions`).
- **DB**: RDS Postgres ×2 (beta + prod, prod restored-from-snapshot workflow, shared
  superuser password — his own roadmap flags rotating it). Lambda uses a read-only
  `app_readonly` role (his D005); scripts still connect as `postgres`.
- **Data acquisition** (all Node scripts run manually from laptop):
  1. `seed.js` — Google Places Text Search → `vendors` (rich: rating, review_count, photos,
     amenity booleans, lat/lng, price_level).
  2. `extract-social-links.js` — crawl vendor websites → `vendor_social_links` → backfill
     `vendors.instagram_handle`.
  3. `scrape-instagram.js` — apify/instagram-scraper per vendor profile → `instagram_posts`
     (mentions/hashtags pre-extracted by Apify).
  4. Venue website enrichment — Gemini/Vertex extraction with provenance + versioned runs
     (`venue_extraction_runs` / `venue_enrichment`). Nicely designed "AI-native data plane"
     (see his docs/engineering/venue-enrichment/) but only 163 venues enriched on beta.
- **Ops maturity is genuinely good**: decisions log, AI constitution, ROADMAP, CI + Vitest,
  beta/prod promotion via PRs.

## What's in his beta DB (live counts, 2026-08-22)

| table | rows | notes |
|---|---|---|
| vendors | 5,029 | 4,925 Chicago; 1,986 have NULL category (discovered via mentions, uncategorized) |
| instagram_posts | 47,623 | 2,817 vendors have posts; 22,506 posts have mentions; 111 MB (raw captions kept) |
| instagram_post_appearances | 86,021 | **his newest work, not yet in repo migrations** — post→vendor links with `capture_method` (mention 38.7k / own_profile 32k / hashtag 14.6k / geotag 0.6k), `wedding_score`, `llm_credible` flag, free-text `role_label` |
| vendor_social_links | 988 | |
| venue_enrichment | 163 | serving rows |
| vendor_relationships, wedding_stories(+vendors) | 0 | designed but never populated — his graph never materialized |

**Overlap with our DB**: 1,896 of his 5,006 IG-handled vendors already exist in our
`accounts` (11,043); 1,714 of those are stack-credited (have `account_tags`). The datasets
are highly complementary, not redundant.

## His data approach vs ours

| dimension | Jeremy | dewwey pipeline | better |
|---|---|---|---|
| Seed universe | Google Places (authoritative biz data: address, rating, photos, phone, website) | IG tagged-feed crawl (revealed activity) | **his** for identity/presentation |
| Unit of truth | post (appearances per post) | **wedding** (dedup'd across posters; duplicates = confirmations) | **ours** — his has no wedding entity, so one wedding posted by 3 vendors counts 3× in any co-occurrence metric |
| Edges | computed at read time in Lambda (mention counts), `vendor_relationships` table empty | `edges` matview, n_weddings per pair, 54,271 rows | **ours** |
| Roles | free-text `role_label` (photography/photographer/photo all distinct) | votes across posts → `v_account_role` | **ours** |
| Credibility | `llm_credible` boolean + `wedding_score` per appearance — decent | caption parse (regex + Haiku) + multi-source confirmation | ours, but his wedding_score idea is worth stealing |
| Geo semantics | city column from Places (clean) | venue-anchored `is_chicago` (true/false/null) | tie — merge gives both |
| Raw payload retention | captions yes | full `posts.raw`/`accounts.raw` jsonb | ours |
| Venue facts (capacity, catering, insurance) | website-crawl + LLM w/ provenance, versioned | none | **his** — adopt wholesale |
| Product surface | live site (dewwey.com), maps UI, beta env | demo artifact only | **his** |

**Verdict: merge, don't pick.** Our wedding-centric graph is the differentiated asset (his
never got built — the tables are empty). His Places-seeded `vendors` layer, venue
enrichment plane, and shipped Next.js app are exactly the parts we lack. Join key:
lowercased IG handle (his `vendors.instagram_handle` ↔ our `accounts.username`), with
`place_id` as the canonical business identity going forward.

## Lambda: not necessary

The Lambda + API Gateway exists only to serve two read-only SQL queries. In a monorepo on
Vercel these become Next.js route handlers (or direct server-component queries) with zero
functional loss. His scaling doc's whole "RDS connection exhaustion → RDS Proxy ($10-15/mo)"
tier-1 worry **disappears with Supabase**, which ships a connection pooler (Supavisor) for
free. Kill list when consolidated: 2 Lambdas, 2 API Gateways, 2 RDS instances, IAM/log-group
juggling, zip-file deploys, CORS headers, the RDS Proxy line item. Beta/prod stays: Vercel
preview/branch deploys + (optionally) a second cheap Supabase project or branch for beta.

## Proposed target architecture

```
Supabase Postgres (one project)
├── public: vendors (Places-seeded, his), venue_enrichment(+runs) (his),
│           weddings / wedding_posts / edges / accounts / account_tags (ours),
│           instagram_posts + appearances (his, mapped into our posts model)
├── ops: crawl_frontier etc (ours)
└── Storage: avatars/ (60MB) + venue photos
Next.js monorepo on Vercel (fork of his app — keep his repo hygiene)
├── app routes replace the Lambda (vendor search/detail)
├── + graph explorer (port from artifact), vendor pages showing REAL n_weddings
│   edges from our `edges` instead of read-time mention counts
└── crons (Vercel cron or GH Actions) for the monthly recrawl
```

Migration mechanics are easy on both sides: both DBs are vanilla Postgres (ours needs
citext, available on Supabase). `pg_dump | pg_restore` each, then a mapping table
`vendor_account_map(place_id, account_id)` built on handle match (1,896 rows day one).

## Watch-outs / hygiene

- `jeremey.ev` holds live secrets (beta DB superuser, Apify, Google, Gemini keys). Keep it
  out of any git repo; recommend Jeremy rotates the shared postgres password (his own
  roadmap item) and the pasted keys after we're merged.
- His scraper attributes every post on a vendor's profile to that vendor and counts
  own-profile posts as appearances; only 9,328 of 32,040 own_profile appearances were
  LLM-credible weddings — his `wedding_score` filter matters when ingesting.
- `instagram_post_appearances` exists only in the DB, not in `scripts/migrations/` — ask
  Jeremy where that pipeline code lives (likely uncommitted or in another branch).
- His 1,986 uncategorized vendors are exactly what our role-voting fixes — good first
  merged-data win.

## Next steps

1. [ ] Decide merge direction with Jeremy (this doc is the case for: our data engine,
       his app shell + vendors layer).
2. [ ] Stand up Supabase project; restore both dumps; build `vendor_account_map`.
3. [ ] Port vendor-search Lambda → Next.js route handlers in the monorepo; point the app
       at Supabase; delete AWS deps.
4. [ ] Swap his read-time "frequentlyWorksWith" for our `edges` (real weddings together).
5. [ ] UI exploration: graph explorer as the differentiator, on top of his venue/browse UI.
