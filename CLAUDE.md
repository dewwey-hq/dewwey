# dewwey monorepo

Wedding vendor intelligence, Chicago first. Merge of Ben's credit-stack graph
pipeline and Jeremy's marketplace app. Read `README.md` for the thesis and
stack; `docs/merge-eval.md` for why the merge is shaped this way.

## Layout

- `apps/web` — Next.js 16 app (was Jeremy's repo, subtree'd with history).
  Vendor search/detail live in `lib/server/vendors.ts`; client components hit
  `/api/vendors` route handlers. The old Lambda/API Gateway is deleted.
- `pipeline/` — Ben's crawler/parser (Python; TypeScript port planned).
  `schema.sql` is the graph schema. Local rehearsal DB: `docker compose up -d`
  in `pipeline/` (Postgres 16 on localhost:5442, user/pass/db all `dewwey`).
- `docs/` — merge evaluation, pipeline plan.

## Infrastructure (state as of 2026-08-22)

- **Supabase**: project `dewwey`, ref `ljcbslfdlfehgjrdnfco`, **Dewwey org**,
  us-east-1, free tier. Graph schema applied; **all tables empty** — data
  import is deliberately paused until the merged schema is designed with Ben.
  Connection string in `.env.local` (gitignored; password also in dashboard).
  Note: the claude.ai Supabase connector only sees the FirstMover org — use
  the `supabase` CLI (logged in, sees Dewwey org) or direct psql instead.
- **GitHub**: `dewwey-hq/dewwey` (private). The `dewwey` GitHub username is
  squatted by a dormant account; the org is `dewwey-hq`.
- **Vercel**: not linked yet. Plan: this repo, root directory `apps/web`,
  previews replace any "beta" environment. Ben's account, not Jeremy's hobby team.
- **Cloudflare R2**: decided but not provisioned (needs Ben's credentials).
  Destination for `avatars/` (60 MB, in old pipeline folder) + venue photos.
- **LLM**: OpenRouter (one key, swappable models) — replaces Anthropic-direct
  in `pipeline/normalize.py` and the Gemini/Vertex paths in
  `apps/web/scripts/venue-enrichment/` (not yet ported).
- Old assets not yet migrated: Ben's populated local DB (1,384 weddings,
  54k edges — still source of truth), Jeremy's beta RDS (5,029 vendors,
  47,623 posts; schema-only DDL dumped, nothing imported).

## Design decisions (carry over; don't relitigate without reason)

- A wedding is Chicago iff its venue is. Duplicate posts are confirmation,
  not noise (Jaccard > 0.5 within 21 days merges). Roles are votes across
  posts. Raw payloads are always kept so parsers rerun free.
- Scraping is layered: Google Places = identity layer (script-time only),
  venue tagged-feed crawl = the graph loop, profile scrapes = enrichment only.
  Jeremy's 29% own-profile wedding hit-rate is why profiles aren't the loop.
- `vendors` (Places identity) and `accounts` (IG-observed) stay separate,
  bridged by lowercased IG handle; Jeremy's posts land in a staging schema
  and get re-parsed through the stack parser — his `appearances` table is
  superseded, but steal its `wedding_score` idea.
- Env contract is `.env.example`, ~7 variables total. A new env var is a
  design smell first.

## Working agreements

- **Ask Ben before**: moving data between databases, placing infrastructure
  in an org/account, anything outward-facing or hard to reverse.
- Don't touch Jeremy's RDS except read-only, and prefer not at all now that
  DDL is captured. His repo conventions (decisions log, ROADMAP "Now"
  section, PRs to main) are the house style here.
- Jeremy hasn't seen the merge plan yet — coordinate with Ben before
  anything that reads as replacing Jeremy's architecture publicly.

## Open threads (priority order)

1. Merged-schema design session with Ben → then data loads into Supabase.
2. Link Vercel; then dewwey.com/beta domain story.
3. R2 bucket + port `avatars.py` paths from local files to R2 keys.
4. Ben ↔ Jeremy conversation about the merge (docs/merge-eval.md is the case).
5. TS port of pipeline (926 lines); fold in OpenRouter at the same time.
