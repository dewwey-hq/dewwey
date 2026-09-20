# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every working
session; history lives in `decisions.md`, preferences in Claude's memory, in-flight detail nowhere else.
If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-18** (session resumed; wedding-page finder + renderer punch list landed). Local
`main` is **twenty-four commits ahead of `origin/main` (`dd5bd44`), not pushed** (the user has not asked
for a push): `07bcd4e` D060 docs · `1dd161a` Phase 1a libs · `6161c13` fixtures + renderer ·
`ef5f4ce` Phase 2 infra · `de1c8f9` crawler seeds + `<base href>` · `4b1909e` LLM half · `6f649a0`
dry-run checkpoint · then this docs commit. Run `git log --oneline -10` and `git status` to confirm.

## How to resume (5 minutes)

1. `git log --oneline -14` and `git status` from the repo root. Everything through the wedding-page
   finder and its ranking fix (`d7a9629`) is committed; the working tree was clean at hand-off and no
   builder was running.
2. Re-check one live number: `bun run scripts/venue-details/discoverWebsites.ts --batch-id x
   --dry-run --limit 20` from `apps/web` should still print `listed: 421`.
3. Then work the "Blocked on the user" list below, top to bottom. Nothing in the pipeline has
   written to the database, R2, or OpenRouter yet, so there is nothing to undo.

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

**Phase 1b — done, committed; three review rounds landed 2026-09-18 (`3d8e709`, `5a6e346`).** Round 2:
every resource kind routed (`placeResources`, invariant-tested), concept spacing, as-stated sizes. Round 3
(Diamond Garden as the proving venue, all rules data-driven): four optional schema fields
(`add_on_categories`, `PricingPath.includes`, `Pricing.seasons`, `AddOn.selection_group`), multi-path
pricing cards, curated add-on categories, single-select calculator extras, `path_ids` honored, tier axis
only on distinct names, grouped What's Included. Nits landed (`9bea7d8`) and the extractor tool schema +
assembler + scorer learned the new fields (`01fde35`, SPINE_TOOL ≈ 12k tokens, PRICING_TOOL ≈ 3.2k).
614 tests. **Round 4 (2026-09-19, user's six-venue review) landed as `d88f49f` (extractor: rental terms +
sided food/bar notes), `7478ca6` (fixtures: notes for all six, Greenhouse terms/seasons, Diamond Garden
concept path names, trimmed Marchetti note, Geraghty nonprofit fee moved into the bar note), `a6bfef1`
(renderer/calculator: guest range from the venue's own max, calendar day order + chronological seasons
with months, terms lines, standard resource labels, single-space resources in the card, a Venue rental
line on every space card incl. "on request" + Ask about pricing, two-column F&B with sided notes and
tables in their column, fixed pill order, F&B minimum line, money in calculator pills, Live band axis,
extras collapsed by category, add-ons as category tables, uniform inclusion rows, concept-shaped pricing
cards). 704 tests. Pushbacks kept (Field Museum 1,500 not "1,000+"; LondonHouse range not 60–190; all 13
policy rows; LondonHouse ceremony stays an add-on with a Yes/No toggle). `apps/web/app/components/venue/*` (`VenueDetailsView`, `FactSource`
popover, `CostEstimate`, `PoliciesList`, `FaqList`, `ResourceMenuButton`, `format.ts`) and
`apps/web/app/lab/venue/page.tsx` (`?golden=<slug>`, `?u=<username>`, `?compare=1`, noindex). All six
goldens render at desktop and phone width; screenshots reviewed by Claude (user review still open).
235 tests: `bunx vitest run lib/venueDetails app/components/venue scripts/venue-details`.

**Phase 2 — code complete and committed (`ef5f4ce`, `de1c8f9`, `4b1909e`); nothing applied to the DB
or R2, zero OpenRouter calls.** `apps/web/scripts/venue-details/`: `applyVenueDetailsSchema.ts` (DDL,
transcribed into `pipeline/schema.sql`), `universe.ts`, `discoverWebsites.ts`, `crawl/*` (Bun
HTMLRewriter, robots, `unpdf`, `Bun.S3Client`, cache) + `crawlVenue.ts --seed-urls` +
`seeds/golden-seeds.csv`, `reportCrawlCoverage.ts`, `contract.ts`, `venueDetailsPrompt.ts` (two tools,
≈12k + 2.7k tokens), `extractVenueDetails.ts`, `validateVenueDetails.ts` + `validate/*`,
`repairVenueDetails.ts`, `serveVenueDetails.ts`, `rollbackVenueDetails.ts`, `addCorrection.ts`,
`score.ts` + `scoreAgainstGolden.ts`, `mustnot/*` (rubric's 15 as assertions; `account-map.csv`
resolves them to accounts), `reportVenueDetailsFunnel.ts`. 445 tests (`bunx --bun vitest run
lib/venueDetails app/components/venue scripts/venue-details`). Dry-runs done: discovery over the
universe and the 16-venue calibration crawl (tables below).

## Numbers (live DB, unchanged by this mission so far)

See the 2026-09-10/13 table in git history of this file (`git show 7577935:docs/STATE.md`) — the graph
numbers did not move today. New this mission: 0 rows in any `venue_*` v3 table (none created yet);
OpenRouter spend for D060 = $0; database size 747 MB (140 MB of it is legacy `venue_extraction_runs`
page text — the reason v3 snapshots go to R2).

| Discovery dry-run (2026-09-14, `discoverWebsites.ts --dry-run --probe`, log in `tmp_analysis/`) | |
|---|---|
| Listed venues (live `searchVendors` predicate) | **421** |
| Have a website candidate | **166** (111 `vendors.website`, 55 IG bio link) |
| Probed: verified / js_shell / unreachable | **146** / 7 / 13 |
| No candidate at all (Phase 5 discovery) | 255 |
| **Wedding page found** (2026-09-18 re-run with the wedding-page finder) | **97 of 166** (legacy pages 39 · homepage link 56 · common path 2) · none 69 |

Calibration wedding URLs (dry-run): Marchetti `/weddings`, Diamond Garden `/wedding`, LondonHouse
`/weddings/`, Field Museum `/page/weddings`, Chez `/wedding-venue`, Joinery `/events/weddings`, Drake
`/weddings/plan-your-wedding/`, Botanic Garden `/private-events`, Langham `/events/weddings/`, Peninsula
`/events/hotel-wedding-venues-chicago`, CAA `/weddings/`, River Roast `/private-events`, Greenhouse none
(single-page site; homepage is the wedding page). Two picks flagged for a ranking fix in flight:
Geraghty chose `/gallery/wedding`, Adler chose an inquiry form.

| Calibration crawl dry-run (2026-09-14, local cache only; `tmp_analysis/venue_details_crawl_coverage_2026-09-14.md`) | |
|---|---|
| Venues crawled | 15 of 16 (Four Seasons blocks bots; Wrigley has no account) |
| Venues with ≥ 5 usable pages | **15 / 15** |
| Text-layer PDFs found | 42 (LondonHouse 8, River Roast 8, Greenhouse 6, Adler 5, Drake 4, Langham 4, …) |
| Image-only PDFs | Diamond Garden 4 (its menus, expected), CAA 5, Langham 1 |
| Seeded off-site docs reached | Marchetti brochure (text layer), Field Museum ×2 |

## Blocked on the user (all Phase 2 code is committed; these are the three approvals it waits on)

1. **Review `/lab/venue?golden=<slug>` for all six goldens** on localhost (desktop + phone). Lost facts
   fail; lost flourishes go on the punch list in the plan. Phase 4 (production promotion) depends on this.
2. **Apply the v3 schema**: from `apps/web`, `bun run scripts/venue-details/applyVenueDetailsSchema.ts`
   (idempotent; `--print` shows the DDL). Creates 6 empty tables + 1 view; no existing table is touched.
   The classifier usually blocks DDL from Claude; run it with `!` if so.
3. **Say "go" for the first real writes**, in this order, each a dry-run first:
   - `discoverWebsites.ts --batch-id vd-discovery-1 --probe --apply` (writes the 166 candidate rows).
   - `crawlVenue.ts --account-ids <golden 6 + must-not 10> --crawl-batch vd-cal-crawl-1 --seed-urls
     seeds/golden-seeds.csv` (writes snapshots to R2 + fetch rows; the same pages already sit in the
     local cache, so this re-fetch is cheap and polite).
   - `extractVenueDetails.ts --golden --max-cost-usd 5` — the first OpenRouter spend, Haiku, ~$1-2.
     Then validate → repair → `scoreAgainstGolden.ts --source runs --mustnot` and iterate the prompt.
4. Carried over: re-anchor human queue (17 weddings) — see D055/D056.

## Second mission (parallel window, 2026-09-19) — D061 Acquisition loop: commit 1 + pilot done, Gate 0 passed

Decision: `docs/decisions.md` D061. Plan of record `~/.claude/plans/on-1-what-do-joyful-church.md`
(rev 2). README `docs/engineering/acquisition-loop/README.md`. Spend so far: **Apify $0.575**
(cycle 09-17 → 10-16, $28.29 left), **OpenRouter $0.30**.

**State:** schema applied (`ops.crawl_targets/crawl_runs/crawl_run_seeds/post_observations/
creation_decisions`, `post_images`, `v_ig_posts`, `structural_post_vendor_evidence` re-sourced +
`structural_post_vendor_evidence_for_batch(batch_id)`); pilot tick `acq-20260919-pilot` fetched 249
posts (98 new), parsed (49 full stacks), clustered (55 candidates), read (47 THIS_VENUE ≥ 0.8),
created **53 weddings** (`-create-2` = 2 A1, `-create-3` = 43 v2, `-create-4` = 8 human-confirmed;
`-create-1` was reverted and re-created as the rollback rehearsal). Weddings **6,025**. Funnel:
`tmp_analysis/acquisition_funnel_acq-20260919-pilot_2026-09-19.md`. Provenance drill works
(`tmp_analysis/d061_post_provenance.sql -v wedding_id=…`).

**Blind spot-check done (user, 2026-09-19 night, 55 posts via `/label/candidates?spotcheck=acq-…&n=100`):**
model THIS_VENUE precision **45/47 = 95.7% → PASS** (bar 95%), overall agreement 45/55 = 81.8%.
Report: `tmp_analysis/spot_check_acq-20260919-pilot_2026-09-20.md`. Resolution (user's calls): all 8
candidates the human verdicts confirmed were created (`create-4`, incl. 3 vendor posts with a venue
credit and no couple — the user's coverage standard, now in memory + backlog); both model-created
weddings the human had labeled NOT_WEDDING were **kept** (superseding THIS_VENUE rows under `jeremy`,
`tmp_analysis/d061_spotcheck_keep_two.sql`). Pilot total: **53 weddings** (2 + 43 + 8), weddings
**6,025**. Reader recall misses (6 at 0.95) are a backlog item (future-date misread; vendor-pitch
standard) — plan file / README.

**Blocked on the user:**
1. Say "go" for tick 2 (profiles, ~$1.0) and the canary (20 probe venues + 5 vendor feeds, ~$1.4).
   Probes may auto-create (spot-check bar met).

**Next actions (Claude):** commit 2 = `targets.ts` (priors from README §1 + vendor tier),
`measure.ts` (yield → prior update, tri-state status, writes `pipeline_versions`),
`spotCheckSample.ts`; then canary → Gate 1a → probes A/3b/B under the gates.

**D061 landmines (new today):**
- The pooler is transaction-mode: only `begin; set local statement_timeout…; …; commit` lengthens
  the 2-minute timeout. Scripts that need it must use one client + one transaction.
- Never put a `distinct on` or an `OR` on a session setting in the structural universe CTE: the
  planner's estimate collapses and the view goes from seconds to > 15 minutes. Batch scoping is the
  generated function, never a filter on the view.
- `post_extraction_runs` is unique on (post_url, prompt_version): a second reader run over another
  clustering version overwrites the row's `candidate_id`/result for a post shared by two candidates.
- `revertWeddingBatch.ts --retire-verdicts` supersedes THIS_VENUE model verdicts only; to re-create
  after a revert, replay verdicts from history (`tmp_analysis/d061_replay_verdicts_after_rollback.sql`).
- The creation script's `--from-confirmed-candidates` did not consult reconciliation before D061;
  under `--acquisition-batch` it now does (≥ 0.7 → WOULD_ATTACH skip).
- Multi-day weddings (sangeet / mehndi / rehearsal dinner / welcome party at a different venue than
  the `Venue:` credit): the seed venue hosted an *event*, not the wedding. The reader inverts toward
  the narrative venue (pilot: OTHER_VENUE = thewellsley on a Dalcy-anchored candidate at 0.95). Human
  verdict: **W** when the page's venue is the `Venue:` credit, **V** + `Venue:` handle when it is the
  side-event venue; reader rule + event-context credit is a backlog item (plan file, README). Sized: 231 South-Asian-event captions (87 with a venue credit line) + 975 other side events.
- Non-venue hop-0 seeds (caterers/planners/DJs) out-yield venues 0.37 vs 0.14 weddings per tagged
  post and fill thin venues 3.5× faster per post — vendor tagged feeds are tick 3b.

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
