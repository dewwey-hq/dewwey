# dewwey monorepo

Wedding vendor intelligence, Chicago first. Merge of Ben's credit-stack graph
pipeline and Jeremy's marketplace app. Read `README.md` for the thesis and
stack; `docs/merge-eval.md` for why the merge is shaped this way.

## Layout

- `apps/web` — Next.js 16 app (was Jeremy's repo, subtree'd with history),
  **Bun** for packages/scripts (`bun install`, `bun run dev`). Queries the
  merged schema: `/vendors` browse and `/vendors/<username>` detail
  (`listVendors`/`getVendorProfile`) live in `lib/server/graph.ts`, reading
  the graph (accounts/edges/weddings) with the Places `vendors` layer as a
  LEFT JOIN that lights up when Jeremy's data lands. `lib/server/vendors.ts`
  is a separate, smaller query layer used only by `/venues`, `/api/vendors`,
  and the homepage's 3 featured vendors (confirmed 2026-09-04, D026 — this
  line used to say vendors.ts was the browse/detail layer; it isn't
  anymore). Vendor detail Feed paginates 20 per page (`?page=`), badge uses
  `feedTotal` (D026); browse `n_chicago` can still disagree (`is_chicago` gap,
  out of scope). The old Lambda/API Gateway, beta
  password gate, his data-acquisition `scripts/`, and the CI workflow are
  deleted (2026-08-22). Layout: `app/` is routes+components only; everything
  else is `lib/` (`lib/server/` = server-only).
- `pipeline/` — Ben's crawler/parser (Python; TypeScript port planned).
  `schema.sql` is the graph schema. Local rehearsal DB: `docker compose up -d`
  in `pipeline/` (Postgres 16 on localhost:5442, user/pass/db all `dewwey`).
- `docs/` — ONE documentation universe (Jeremy's docs merged in 2026-08-22):
  `docs/decisions.md` is the append-only decision log (D001–D031…),
  `docs/README.md` the index, `docs/history/` the retired pre-merge
  architecture. Root `ROADMAP.md` has the "Now" section — check it before
  starting a thread.

## Infrastructure (state as of 2026-08-22)

- **Supabase**: project `dewwey`, ref `ljcbslfdlfehgjrdnfco`, **Dewwey org**,
  us-east-1, free tier. **Merged schema applied and Ben's graph data loaded**
  (2026-08-22): 1,384 weddings, 11,043 accounts, 6,370 posts, 54,271 edges,
  3,786 frontier rows — counts verified identical to the local DB. Jeremy's
  data is ALSO loaded (same day, on Ben's explicit authorization — "Jeremy
  trusts me"): his 5 tables verbatim in `staging`, transformed into
  `public.vendors` (5,029, full original rows in `raw`), bridge = 1,896
  handle-exact matches to `accounts`, enrichment (163) + runs (572) re-keyed.
  Still pending: drop `staging` only after the remaining ~43k unclassified posts
  are explicitly retired (D029/D030 — the 4,033 INCLUDE captions are already
  parsed; that was never a separate re-parse). Connection string in `.env.local`
  (gitignored; password also in dashboard). Note: the claude.ai Supabase
  connector only sees the FirstMover org — use the `supabase` CLI (logged in,
  sees Dewwey org) or direct psql instead.
- **GitHub**: `dewwey-hq/dewwey` (private). The `dewwey` GitHub username is
  squatted by a dormant account; the org is `dewwey-hq`.
- **Vercel**: live (2026-08-22). Project `dewwey` on Ben's hobby team
  (`ben-wallaces-projects`), linked to `dewwey-hq/dewwey`, root `apps/web`,
  production = `main`, previews per branch. **Hobby blocks deploys whose
  git authors aren't on the team** — `Co-authored-by: Cursor
  <cursoragent@cursor.com>` fails the GitHub Vercel check instantly
  (Claude's `noreply@anthropic.com` trailer does not). Strip the Cursor
  trailer before pushing a preview. The repo was made **public**
  (Ben's call — hobby plan can't deploy private org repos; full-history
  secrets scan came back clean first). Production:
  dewwey-ben-wallaces-projects.vercel.app. Env vars set for
  production+preview via CLI/API. The `vercel` CLI is installed globally
  (bun) and logged in as benfwalla.
- **Cloudflare R2**: live (2026-08-22). Bucket `dewwey` on Ben's account
  (`bewal416@gmail.com`), ENAM region. All 1,361 avatars uploaded under
  `avatars/` — keys match `accounts.avatar_path` verbatim. Public dev URL
  (`NEXT_PUBLIC_R2_PUBLIC_URL`) is r2.dev — rate-limited, swap for a custom
  domain when the dewwey.com domain story is settled. Manage buckets with the
  `cf` CLI (installed, OAuth'd); objects go via S3 API (`aws` CLI / SDKs)
  with the R2 keys in `.env.local`. Venue photos not migrated yet.
- **LLM**: OpenRouter (one key, swappable models) — replaces Anthropic-direct
  in `pipeline/normalize.py` and the Gemini/Vertex paths in
  `apps/web/scripts/venue-enrichment/` (not yet ported).
- Ben's local Docker DB is migrated to Supabase (2026-08-22) — keep the
  local container as the migration-rehearsal copy, but **Supabase is now the
  source of truth**. Jeremy's beta RDS (5,029 vendors, 47,623 posts) is NOT
  imported; his DDL is captured in `docs/jeremy-ddl.sql`.

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
- Merged schema (designed with Ben, 2026-08-22): `vendors` is a **slim**
  typed core + full Places payload in `raw` jsonb — don't resurrect Jeremy's
  50 columns. Bridge is `vendors.account_id` FK (+ `account_matched_by`),
  not a mapping table. Jeremy's `instagram_post_appearances` is never
  imported — superseded outright. `posts` carries `source`
  (`venue_tagged`/`own_profile`) and `wedding_score` (his idea, our filter).
- The DB stores R2 **keys** (e.g. `avatars/<username>.jpg`), never full
  URLs — the app composes `NEXT_PUBLIC_R2_PUBLIC_URL` + key at render time,
  so the bucket domain can change without touching rows.

## Working agreements

- **Ask Ben before**: moving data between databases, placing infrastructure
  in an org/account, anything outward-facing or hard to reverse.
- Don't touch Jeremy's RDS except read-only, and prefer not at all now that
  DDL is captured. His repo conventions (decisions log, ROADMAP "Now"
  section, PRs to main) are the house style here.
- Jeremy hasn't seen the merge plan yet — coordinate with Ben before
  anything that reads as replacing Jeremy's architecture publicly.

## Open threads (priority order)

1. Link Vercel (this repo, root `apps/web`, Ben's account); then the
   dewwey.com domain story.
2. Ben ↔ Jeremy conversation about the merge (docs/merge-eval.md is the
   case). Blocks anything that reads as replacing Jeremy's architecture
   publicly. His data is already in Supabase (2026-08-22).
3. TS port of pipeline (926 lines); fold in OpenRouter + `avatars.py`→R2
   upload at the same time.
4. Jeremy-side **1–2 vendor-role evidence gap** (ROADMAP Next): attach sparse
   posts to existing `jeremy_wedding_candidates` only, never seed new ones.
   The Ben-side analog (Case B) was sized and declined (D031). Do not re-open
   the 268-candidate ambiguous tier (D030, audited, not ingested) or re-parse
   the 4,033 INCLUDE captions (already done, D029).
