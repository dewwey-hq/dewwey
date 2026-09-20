# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every working
session; history lives in `decisions.md`, preferences in Claude's memory, in-flight detail nowhere else.
If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-19 ~21:00 CT** (D060 window; golden-render round 7 landed as `36295c5`). Two
windows are committing to local `main` in parallel (this one = D060 VenueDetails; the other = D061
acquisition loop, see "Second mission"); **local `main` is ~54 commits ahead of `origin/main`
(`dd5bd44`), not pushed** (the user has not asked for a push). Run `git log --oneline -15` and
`git status` to confirm; the `apps/web/scripts/graph/tmp_analysis/*` untracked files belong to the D061
window — leave them.

## How to resume (5 minutes)

1. `git log --oneline -15` and `git status` from the repo root. Everything through add-ons round 7
   (`36295c5`) is committed; no builder was running at hand-off. Dev server may still be up on :3000
   (`nohup bun run dev` from `apps/web` if not).
2. Re-check one live number: `bun run scripts/venue-details/importGoldenSet.ts --check` from `apps/web`
   prints six `[OK]` lines, and `bunx --bun vitest run lib/venueDetails app/components/venue
   scripts/venue-details` is 765 green.
3. Then work the "Blocked on the user" list below, top to bottom. Nothing in the D060 pipeline has
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

**Phase 1b — done, committed; SEVEN review rounds landed 2026-09-18 → 09-19 (narrative: D060 addendum
in `decisions.md`; per-round spec: the plan file's "Round 2…7" sections).** Latest commits: `65fd615`
(decor / lighting_av split), `36295c5` (round 7: `AddOn.day/season`, extra-hours grid, Diamond Garden
fixture completed against the venue's 2024 add-ons sheet, 34 → 59 add-ons; example folding dedupes
across the whole card; importer money() shows cents). 765 tests. Schema fields added by the rounds
(all optional, all in the extractor tool schema): `add_on_categories`, `PricingPath.includes/terms/
subtitle`, `Pricing.seasons`, `AddOn.selection_group/category_std/day/season`, `food_note/bar_note`,
`capacity_max_guests`, `EstimateInput.band`. Pushbacks kept (Field Museum 1,500 not "1,000+";
LondonHouse range not 60–190; all 13 policy rows; LondonHouse ceremony stays an add-on with a Yes/No
toggle). Open: Top Shelf bar $35 (add-ons sheet) vs $30/$40 (bar PDF) — verify against the bar PDF
before it matters. `apps/web/app/components/venue/*` (`VenueDetailsView`, `FactSource` popover,
`CostEstimate`, `PoliciesList`, `FaqList`, `ResourceMenuButton`, `format.ts`, `icons.ts`) and
`apps/web/app/lab/venue/page.tsx` (`?golden=<slug>`, `?u=<username>`, `?compare=1`, noindex). Headless
screenshots: chrome at `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` (full page) or the
playwright install at `/tmp/bunx-1000-playwright@latest/node_modules/playwright/index.mjs` for
element-scoped shots (`locator(sel).screenshot`), imported by absolute path.

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

**Ticks 2 and 2b ran on the user's "lets go" (2026-09-20 ~01:20–02:00 UTC):**
- Tick 2 profiles: 541 accounts, 11 runs, $1.24; 539 profiled, 478 with followers, 110 bios naming
  another handle (alias-candidate CSVs `tmp_analysis/acq_alias_candidates_<run>.csv`), 460 avatars.
- Canary, vendor half (`acq-20260919-canary-vendor`, 3 tier-A planners + 2 florists × 25): $0.29,
  125 fetched / 82 new, 33 stacks, 37 candidates, **23 weddings** (22 v2 + 1 A1), 5 at venues that had
  < 6 ($0.06 each). 0.18 weddings per fetched post — the vendor band clears Gate 1a.
- Canary, venue half (`acq-20260919-canary`, 20 thin venues from the top prior band × 25): $1.13,
  489 fetched / **477 new** (never-crawled venues barely overlap), 53 stacks, 59 candidates, **34
  weddings** (33 v2 + 1 A1), 9 thin venues gained weddings, **5 crossed into 6+**; $0.04 per new
  wedding at a venue that had < 6. **0.069 weddings per fetched post → Gate 1a PASS** (bar 0.03).
  22 + 3 candidates the reader would not commit to are in `/label/candidates?batch=acq-20260919-canary`
  (vendor canary: 6, `?batch=acq-20260919-canary-vendor`).
- **Probes A launched** (`acq-20260919-probesA`, 223 targets × 25, $12.82 projected, detached
  `nohup`, log `scratchpad/probesA.log`; ~23 Apify runs, 80-90 min incl. image ingest). When done:
  parse → cluster (v2, then A1) → reconcile → reader (both pools) → creation dry-run → create →
  refresh role tags → funnel → Gate 1. **Use `tail`, never `head`, on the script output.**
- Running totals 2026-09-20 02:30 UTC: weddings **6,082** (110 from acquisition today), Apify
  $3.23 ingested + $12.82 in flight, OpenRouter ≈ $1.20, 657 acquisition posts, 1,369 images in R2.

- **Tigerlily Events recredit (user-caught, 2026-09-20):** a catering / venue-management company
  credited as the venue (64 weddings). Fact-checked on tlilyevents.com: all 15 of its spaces are on
  Lincoln Park Zoo grounds. `recreditManagementCompany.ts --handle tigerlilyevents
  --exclude-wedding-ids 4723,5619,9744` (76 credits → other, 30 re-anchored by tag/credit), then
  `tmp_analysis/d061_tigerlily_reanchor_remaining.sql` (user's rule: Café Brauer when the caption names
  it, else the zoo; 10 + 24, provenance batch `d061-tigerlily-reanchor-1`). Now zoo 72, Café Brauer 26,
  Tigerlily 0. Café Brauer's account is still bare (user declined a profile scrape for now).

**Blocked on the user:** nothing at the moment — Gate 1a decides probes A; the user asked to be told
before that spend.

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
- **Never pipe a pipeline script through `head`.** `head -N` closes the pipe after N lines and the
  next console.log kills the process with SIGPIPE mid-run: the venue canary's clustering wrote its 54
  candidates but died before the chicago_status step, so the reader selected 0 posts. Use `tail` or
  write the log to a file. Re-running the clustering for the batch repairs it (the status step covers
  every candidate of the version).
- Non-venue hop-0 seeds (caterers/planners/DJs) out-yield venues 0.37 vs 0.14 weddings per tagged
  post and fill thin venues 3.5× faster per post — vendor tagged feeds are tick 3b.

## Next actions (Claude, when unblocked)

1. After approval 2 (schema) and 3 (writes): discovery apply → calibration crawl → coverage table →
   `extractVenueDetails.ts --golden --max-cost-usd 5` → validate → repair → `scoreAgainstGolden.ts
   --source runs --mustnot`; iterate the prompt until critical accuracy ≥ 95% and critical numeric
   grounding = 100% on extractor-tagged fields; then Phase 3 (the 146) behind the crawl-only checkpoint.
2. Fixture/render punch list (plan "Build log" + rounds): lightbox (new-tab links until
   `checkResourceEmbeddability.ts`), Photos slot (production only), Marchetti real-wedding decks,
   version `created_at` in the footer once versions exist, Top Shelf bar price check, the Field Museum
   1,400-with-stage capacity as a tuple, the Cupola non-bookable spot.
3. Extractor schema is ahead of any run: re-measure SPINE_TOOL/PRICING_TOOL token counts before the
   first extraction (`venueDetailsPrompt.test.ts` pins them).

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
- **Selection-group add-ons are single-select in the calculator AND must still render in the static
  Add-ons section** unless the same facts already render elsewhere (bar ladders, menus); hiding them
  wholesale silently dropped Diamond Garden's extra hours for six rounds. Add-ons priced by day/season
  carry `day`/`season` per row; the calculator filters by the chosen axes.
- The importer has its own `money()`; keep it identical to the renderer's (cents when fractional) or
  fixtures print "$1.5/guest".
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
