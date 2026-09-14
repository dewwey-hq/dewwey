# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every working
session; history lives in `decisions.md`, preferences in Claude's memory, in-flight detail nowhere else.
If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-13 ~23:30 CT** (mid-session checkpoint during the D060 build). Local `main`
= `6161c13`, **three commits ahead of `origin/main` (`dd5bd44`), not pushed**: `07bcd4e` (D060 docs),
`1dd161a` (Phase 1a libs), `6161c13` (fixtures + renderer). Run `git log --oneline -6` and `git status`
to confirm before trusting this line.

## Mission in flight — D060 VenueDetails v3 (2026-09-13 →)

The venue Details tab becomes one typed schema (comparison spine + detail layer) filled by a
provenance-first loop for every listed venue, rendered by one generic component. Plan of record:
`~/.claude/plans/hello-alright-want-to-quizzical-sparrow.md` (approved after three review rounds;
its "Build log / follow-ups" section is the running punch list). Decision: `docs/decisions.md` D060.
Product doc: `docs/product/venue-details.md`. Research: `docs/engineering/venue-enrichment/
industry-research-2026-09-13.md`.

**Phase 0 — done, committed.** D060, product doc, research, docs index.

**Phase 1a — done, committed.** `apps/web/lib/venueDetails/` (types, derive, diff, merge, inputHash,
tiers, golden registry) + six golden fixtures `apps/web/scripts/venue-details/golden/<slug>.json`
(from `importGoldenSet.ts`, `--check` clean, fields tagged `eval: extractor|human_only`). Calculator
totals pinned to the concept calculators: Marchetti 55,240 / 57,475; Greenhouse 12,420; LondonHouse
44,451 / 44,675; Diamond Garden 12,742.50 / 7,495. Golden account ids (hard map, the concept
`vendorId`s are wrong): galleriamarchetti 31, greenhouseloft 477, thegeraghty 507, fieldmuseum 1131
(alias 5172), lhchicago 2785, diamondgardenbanquet 27389.

**Phase 1b — done, committed.** `apps/web/app/components/venue/*` (`VenueDetailsView`, `FactSource`
popover, `CostEstimate`, `PoliciesList`, `FaqList`, `ResourceMenuButton`, `format.ts`) and
`apps/web/app/lab/venue/page.tsx` (`?golden=<slug>`, `?u=<username>`, `?compare=1`, noindex). All six
goldens render at desktop and phone width; screenshots reviewed by Claude (user review still open).
235 tests: `bunx vitest run lib/venueDetails app/components/venue scripts/venue-details`.

**Phase 2 — in progress (non-LLM infrastructure building; nothing applied to the DB or R2 yet).**
A builder is writing `apps/web/scripts/venue-details/`: `applyVenueDetailsSchema.ts` (DDL, also
transcribed into `pipeline/schema.sql`), `universe.ts` (listed-venue predicate, alias-aware),
`discoverWebsites.ts`, `crawl/*` (urlScore, htmlText via Bun HTMLRewriter, robots, pdfText via the new
`unpdf` devDependency, r2 via `Bun.S3Client`, cache), `crawlVenue.ts` (snapshots to R2, insert-only,
dedupe by sha256), `reportCrawlCoverage.ts`. Not yet written: `venueDetailsPrompt.ts`,
`extractVenueDetails.ts`, `validateVenueDetails.ts`, `repairVenueDetails.ts`, `serveVenueDetails.ts`,
`rollbackVenueDetails.ts`, `addCorrection.ts`, `scoreAgainstGolden.ts` (+ must-not assertion
fixtures for the rubric's 15), `reportVenueDetailsFunnel.ts`.

## Numbers (live DB, unchanged by this mission so far)

See the 2026-09-10/13 table in git history of this file (`git show 7577935:docs/STATE.md`) — the graph
numbers did not move today. New this mission: 0 rows in any `venue_*` v3 table (none created yet);
OpenRouter spend for D060 = $0; database size 747 MB (140 MB of it is legacy `venue_extraction_runs`
page text — the reason v3 snapshots go to R2).

## Blocked on the user

1. **Review `/lab/venue?golden=<slug>` for all six goldens** on localhost (desktop + phone). Lost facts
   fail; lost flourishes go on the punch list in the plan. Nothing else in Phase 2 depends on this, but
   Phase 4 (production promotion) does.
2. **Apply the v3 schema** when the builder lands it: `bun run scripts/venue-details/
   applyVenueDetailsSchema.ts` from `apps/web` (idempotent; `--print` shows the DDL). The classifier
   usually blocks DDL from Claude; run it with `!` if so.
3. **Say "go" for the first R2 + DB crawl writes** (golden six + the rubric's 15, `--crawl-batch
   vd-golden-crawl-1`) once the dry-run manifests look right, and for the first OpenRouter spend
   (`extractVenueDetails.ts --golden`, budget < $5).
4. Carried over: Apify credits (coverage items), re-anchor human queue (17 weddings) — see D055/D056.

## Next actions (Claude, when unblocked)

1. Land Phase 2 infra (in flight) → dry-run crawl on the golden six → coverage table.
2. Build the LLM half: prompt module (two tools), extract (input_hash, `--max-cost-usd`), validate
   (grounding + gates + `repairs[]`), repair, serve (versions + pointer), rollback, addCorrection,
   tier-weighted scorer with the rubric's 15 must-not assertions, funnel report.
3. Calibrate on the golden six as live venues until critical accuracy ≥ 95% and critical numeric
   grounding = 100% on extractor-tagged fields; then Phase 3 (the 109) behind the crawl-only checkpoint.
4. Renderer punch list (plan "Build log"): Greenhouse F&B sub-rows, "book both" day order, lightbox,
   band axis, last-changed date.

## Landmines (things that bit us; check before repeating)

- **Tests that touch Bun APIs (`HTMLRewriter`, `Bun.S3Client`) must run as `bunx --bun vitest run …`**;
  plain `bunx vitest` spawns Node workers where those globals are undefined.
- **Marchetti's brochure PDF is a client-rendered (Framer) link**, invisible to a plain-fetch crawl;
  known off-site documents need a manual seed list, not a smarter URL scorer.
- **`tsc --noEmit` with `incremental: true` can report clean from a stale `tsconfig.tsbuildinfo`**;
  three real type errors in new files were hidden that way today. `rm -f tsconfig.tsbuildinfo` before
  trusting a clean typecheck.
- **Lucide icon component references cannot cross the server→client boundary** in Next 16 (500 with
  the detail stripped from the client). Pass a pre-rendered `ReactNode`. Dev-server errors are in the
  process's stdout (`/proc/<pid>/fd/1`), not the browser.
- The concept pages' `vendorId`s point at unrelated re-keyed `vendors` rows; use the account map above.
- `accounts.venue_type` is `park_outdoor` for Marchetti and Greenhouse (keyword-rule misfire; D056
  round-2 territory).
- `weekday` in the cost model means Mon-Thu; a Fri/Sun shared price is two explicit rows.
- Everything from the 2026-09-13 19:00 rewrite still applies (D059 migration invariant, IG embed rules,
  `/venues` listing bar, verify-logged-inserts, enum casts, `!` for bulk writes, `--limit` semantics,
  pgrep self-match, `vendors.city` default, brand handles, promo-only venues, wedding counting, hashtag
  "chicago", `post_url` scoping, temp tables, template-literal escapes, 120 s DB tests, model W ≥ 0.8
  only, golden labels propose).

## Where things live

- D060: `apps/web/lib/venueDetails/` (schema + pure libs + tests), `apps/web/scripts/venue-details/`
  (importer, fixtures, pipeline scripts), `apps/web/app/components/venue/` (renderer),
  `apps/web/app/lab/venue/` (lab), `apps/web/lib/server/venueDetails.ts` (server read, returns null
  until `venue_details` exists), `pipeline/schema.sql` `-- VENUE DETAILS v3` banner (once landed).
- Legacy enrichment reference (deleted code): `git show 13dd9b6^:apps/web/scripts/venue-enrichment/…`.
- Feed card, coverage scripts, D056/D059 scripts, review UI, provenance tables, tests, reader, venue
  discovery, OpenRouter key: unchanged from the previous rewrite (`git show 7577935:docs/STATE.md`).
