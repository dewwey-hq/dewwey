# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every working
session; history lives in `decisions.md`, preferences in Claude's memory, in-flight detail nowhere else.
If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-20 ~11:45 (machine clock)** by the D060 window, hand-off for a new session
(the user is switching models). Two windows commit to local `main` in parallel (this one = D060
VenueDetails; the other = D061 acquisition loop, see "Second mission"). Check
`git log --oneline origin/main..HEAD` for what is unpushed; the user pushes.

## How to resume (5 minutes)

1. `git log --oneline -10`, `git status`, `git log --oneline origin/main..HEAD | wc -l` from the repo root.
2. Read `docs/engineering/venue-enrichment/loop/README.md` (protocol) and the last three rows of
   `loop/ticks.md` (c6, serve-c6, review-1, refresh-1). The plan of record is
   `~/.claude/plans/hello-alright-want-to-quizzical-sparrow.md` ("Execution loop for Phases 2–3").
3. Re-check one live number: from `apps/web`, `bun run scripts/venue-details/reportVenueDetailsFunnel.ts`
   should show 6 served / 6 compare-ready; `bunx --bun vitest run lib/venueDetails app/components/venue
   scripts/venue-details` should be ~890 green. Dev server: `nohup bun run dev` from `apps/web`
   (`/lab/venue?u=<username>` renders the served six).
4. Then the "Blocked on the user" list. **No model spend without the user's go on the Phase 3 cap.**

## Mission in flight — D060 VenueDetails v3: calibration done and served; Phase 3 fill loop teed up

The venue Details tab becomes one typed schema (comparison spine + detail layer) filled by a
provenance-first loop for every listed venue, rendered by one generic component. Narrative:
`docs/decisions.md` D060 + its 2026-09-19/20 addenda. Product doc: `docs/product/venue-details.md`.

**Done (all committed):** Phases 0–2; seven golden-render rounds; schema applied; discovery applied
(421 listed → 307 candidates → 257 verified, `vd-discovery-1`); calibration ticks c0–c6 (prompt v3.0 →
v3.5, stop rule reached); **the six goldens are served** (`vd-serve-c6`; Geraghty v3 and Diamond Garden
v2 after the review, Diamond Garden carrying human correction #1 from `vd-corr-1`); the user's review of
the served pages folded into general rules; golden resources refreshed. Gates on the served runs:
critical 61/65 = 93.8% (95% gate, missed by run-to-run variance; c5 re-validated at 96.9% on the same
prompt family), resources 27/29 = 93.1% (80% gate, green), all six compare-ready, cost delta 0% where a
golden total exists. Spend: first $10 cap spent, second cap ≈ $5.5 of $10 used.

**How to run the FIRST FILL TICK (f1) once the user says go** — from `apps/web`:
```
bun run scripts/venue-details/targets.ts --band 20+ --limit 30 --ids-file scripts/graph/tmp_analysis/vd_f1.ids
OPENROUTER_FAIL_DIR=/tmp bun run scripts/venue-details/runTick.ts --tick f1 --ids-file scripts/graph/tmp_analysis/vd_f1.ids --max-cost-usd 10
   # crawl → coverage → extract → validate → repair → validate → universal must-not → serve DRY-RUN → funnel → row
   # read docs/engineering/venue-enrichment/loop/reports/f1/{coverage,validate-2,mustnot,serve-dry-run}.md
bun run scripts/venue-details/runTick.ts --tick f1 --ids-file scripts/graph/tmp_analysis/vd_f1.ids --skip-crawl --apply-serve
```
Gate F (loop README): 0 critical grounding failures on the runs about to be served, universal must-nots
green, only `validation.ok` runs served, tick spend ≤ cap. Then append the printed row to `loop/ticks.md`,
rewrite this section, commit `vd tick f1: …`, and give the user 5 `/lab/venue?u=` URLs to spot-check.
The 30 targets (2026-09-20): bridgeportartcenter 202 weddings, the.arbory 149, rockwellontheriver 143,
waldenchicago 111, thedalcy 97, adlerplanet 97, chicagowinery 95, mortonarb 95, fairliechicago 84,
chicagobotanic 75 … lmstudiochi 44. Run the targets command again rather than trusting the ids file (it is
untracked scratch). Expect ≈ $6/tick; the Phase 3 cap the plan proposes is $40 (top two bands).
Landmines for the tick: run it as ONE background command with absolute paths (a cwd slip made a tick
fail before it started); never chain on `pgrep`; count spend from the OpenRouter key's `usage_daily`.

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

## Blocked on the user

1. **"Go" for Phase 3 fill tick f1** with the cap (plan: $40 for the 20+ and 6–19 bands, ~$6 per tick of
   30). The command sequence is in the mission section above; the first tick returns 5 lab URLs to
   spot-check.
2. **Push** (`git push origin main`) — the classifier blocks Claude from pushing.
3. Carried over: re-anchor human queue (17 weddings) — see D055/D056.

## Second mission (parallel window) — D061 Acquisition loop: month 1 COMPLETE incl. remainder ticks + the human-verdict creation pass; reader v1.3 shipped (2026-09-20)

Decision + narrative: `docs/decisions.md` D061 and its addenda. Plan of record
`~/.claude/plans/on-1-what-do-joyful-church.md` (rev 2). README `docs/engineering/acquisition-loop/README.md`.
All code committed on local `main` (not pushed). Scripts: `apps/web/scripts/acquire/{applyAcquisitionSchema,
apifyClient,ingest,runTick,targets,measure,reportAcquisitionFunnel,reportSpotCheck}.ts`; chain runner for a
batch: scratchpad `chain.sh <batch>` (parse → cluster v2 → cluster A1 → reconcile → reader v2 → reader A1
→ creation dry-runs → funnel; **never `head` its output**).

**Day 1 result (2026-09-19 → 20, final):** weddings **5,972 → 6,571**, **600 created by the loop** (+34 Tigerlily
re-anchored, not added; 1 retired after spot-check). Spend: **Apify $19.48** of $29 (≈ $9.50 left this cycle),
**OpenRouter $5.35**. 7,851 post results fetched (7,148 new) + 544 profiles; images in R2.

| Tick | Targets | $ | New posts | Weddings | w/post | thin-venue weddings | venues → 6+ |
|---|---|---|---|---|---|---|---|
| Pilot (proven venues) | 10 | 0.58 | 98 | 53 | 0.213 | 0 | 0 |
| Canary vendor feeds | 5 | 0.29 | 82 | 26 | 0.208 | 6 | 0 |
| Canary thin venues | 20 | 1.13 | 477 | 38 | 0.078 | 34 | 7 (funnel) |
| Legacy: Ben's posts at zero venues | 75 | 0 | 1,541 | 6 | 0.004 | 6 | 0 (46 venues dead) |
| **Probes A** (thin venues + alias siblings) | 223 | 9.84 | 3,965 | **333** | 0.079 | 225 | **27** (funnel; +1 venue 0 → 1) |
| Low-types (hotels/restaurants/churches at 1-5) | 41 | 2.26 | 900 | 49 | 0.050 | 33 | 7 |
| Probes B (zero-wedding venues) | 60 | 2.87 | 1,201 | 18 | 0.015 | 14 | 0 (3 venues 0 → 1; 39 dead) |
| Vendor tick (tier-A planners/florists) | 22 | 1.27 | 425 | 104 | 0.190 | 6 | 0 |
| **Probe6** (6-15 venues, own feed never crawled; 2026-09-20 afternoon, reader v1.3) | 55 | 3.00 | 1,149 | **208** | 0.160 | 1 | 1 (16 venues 6-15 → 16-49) |
| Discovered (hop-1 frontier venues, metro + venue role) | 22 | 1.16 | 398 | 84 | 0.168 | 0 | 0 |
| Deepen calibration (8 proven venues 25 → 100; 45% already had) | 8 | 1.84 | 439 | 105 | 0.132 (0.24 per NEW post) | 0 | 0 (1 venue → 50+) |

Coverage (metro venue accounts, morning → end of night): 0: 170 → **165** · 1-5: 302 → **270** · 6-15: 78 → **108**
· 16-49: 64 → 64 · 50+: 27 → **33**. After the remainder ticks (2026-09-20 17:50 UTC): 0: 165 · 1-5: 270 · 6-15: 93 ·
16-49: 78 · 50+: 34. **After the human-verdict creation pass (2026-09-20 21:10 UTC): 0: 165 · 1-5: 266 · 6-15: 96 ·
16-49: 79 · 50+: 34.** Weddings **6,995** (day: 5,972 → 6,995; the loop created 1,025, 1 retired after spot-check, 1
pre-loop styled wedding 725 retired). **Apify $25.69 of $29** (stop $28.50; ≈ $2.8 left, unchanged — the creation pass
spent nothing), OpenRouter ≈ $8. Remainder ticks: probe6
47/55 promising (5 dead), discovered 17/22 (3 dead), deepen 8/8; HUMAN_STYLED 0 on all three; 48 candidates to the queue.
Deepen lesson: 100 posts at a proven venue = $0.018 per wedding (best of any tick) but 45% of results were already held
(the actor re-pays the first 25 + overlap with staging) — the next deepening should use `--only-newer-than` the last crawl.

**Human-verdict creation pass (2026-09-20 ~21:00 UTC, no spend).** The user labeled 93 verdicts (64 THIS_VENUE,
28 NOT_WEDDING, 1 OTHER_VENUE) over 89 posts / 80 candidates in `probe6` / `probesA` / `vendor`. Creating from those
plus 9 older eligible-but-uncreated human candidates (`pilot`, `canary`, `canary-vendor`) through the unchanged
`createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --acquisition-batch` path, both clustering pools,
6 batches × 2 runs: **63 eligible → 56 created**, 0 WOULD_ATTACH, 0 weak matches. The 7 not created: 3
`chicago_unconfirmed` (@liven_events, @tigerlillyevents, @maliboulakelodge), 3 `wrong_venue_no_correction` (venue
marked wrong, no correction named), 1 `HUMAN_STYLED` (styled-shoot gate, probesA). Creation batches
`{probe6-create-3/4, probesA-create-5/6, canary-vendor-create-3/4, canary-create-6, vendor-create-3}` — revertable
one at a time. Weddings 6,939 → **6,995**; 5 venues changed bucket: @southshoreccac 4→6, @chateaudelmarevents 5→7,
@belvedereeventsandcatering 5→7, @events.at.ethereal 5→6 (all probesA, 1-5 → 6-15) and @heritageprairiefarm 15→16
(probe6, 6-15 → 16-49). The 0 bucket did not move. Pre-write snapshot:
`scripts/graph/snapshots/2026-09-20T20-51-35-719Z-pre-human-verdict-create-20260920`. `measure.ts --apply` re-ran on
all six batches (priors appended; the tick table above carries the new totals). Human queue left, by undecided posts:
vendor 72 · probesA 46 · deepen 43 · discovered 26 · probe6 10 · probesB 9 · lowtypes 8 · canary-vendor 2.

**Gates:** Gate 0 PASS (pilot), pilot spot-check **95.7% PASS**, Gate 1a PASS (canary 0.076), Gate 1 PASS
(probes A 0.072 vs 0.03). **Probes A spot-check DONE (user, 97 posts): model THIS_VENUE precision 65/67 =
97% → PASS**, overall 81.4% (`tmp_analysis/spot_check_acq-20260919-probesA_2026-09-20.md`). Same two miss
patterns as the pilot (NOT_WEDDING on real recaps ×7, OTHER_VENUE inversion ×8) → `extract-v1.3` backlog.
Probes B and the vendor tick are **released to auto-create**.

**2026-09-20 morning (user approved items 2-4):** reader **`extract-v1.3` shipped** — 79-post eval from the two
spot-checks: THIS_VENUE precision **52/52** (v1.2 40/41), recall **52/62** (v1.2 40/62), 0 false positives, all 40
agreed posts kept; four rounds, ≈ $1.05 (`tmp_analysis/d061_reader_v13_{evalset,score}.sql`, `runExtract.ts
--eval-urls-file`). Alias-family fold in `decideVerdictWrite` + `venue_same_family_handles` in the prompt.
**Styled-shoot auto-create gate** live (`HUMAN_STYLED` in the creation summary; probes A dry-run 0). Remainder
tiers `probe6` (55) / `discovered` (22 unique after `probe6`) / `deepen` (8 → 100 posts) added to `targets.ts`, ≈ $6.3 of ≈ $8.8 left.
**Remainder ticks all DONE (2026-09-20 17:50 UTC). Nothing in flight.** Wedding 725 (@thelogantheatre styled shoot,
pre-loop) retired on the user's word, batch `acq-20260920-styled-retire-1`; credited vendor pitches stay in the human queue
(user's call).

**Blocked on the user:** nothing. Optional: keep labeling — the queue after the creation pass, by undecided posts
(`/label/candidates?batch=<id>`): `acq-20260920-vendor` 72, `acq-20260919-probesA` 46, `acq-20260920-deepen` 43,
`acq-20260920-discovered` 26, `acq-20260920-probe6` 10, `acq-20260920-probesB` 9, `acq-20260919-probesA-lowtypes` 8,
`acq-20260919-canary-vendor` 2 — say when done and I create from the verdicts again (the pass above is the recipe).
Also: name the correct venue on the 3 `wrong_venue_no_correction` candidates (14296, 14304, 14564) and decide the
1 `HUMAN_STYLED` probesA candidate if it is a real wedding; push (commits local: 5eec47b reader v1.3, the close-out,
and this creation pass). (Spot-check follow-up: wedding 12804 Chicago Forte promo retired via
`retireNonWeddingPosts.ts --from-audit`, batch `acq-20260919-probesA-spotcheck-retire-1`; 12866 Sable Creek kept,
verdict flipped under `jeremy`, `tmp_analysis/d061_spotcheck2_keep_one.sql`; 5 more probes A weddings created
from the user's confirmations. Weddings **6,450**.)

**Next (Claude):** month 2 planning once the Apify cycle resets (10-16) or credit is added: monthly recency at
promising targets with `--only-newer-than`, alias-family feeds, deepen the 47 + 17 newly promising venues (measured
priors in `ops.crawl_targets`); the 1-5 bucket (266) is what is left of the coverage problem and its own feeds are
now crawled — the next lever there is vendor tagged feeds at those venues' credited vendors. Then: typo-handle alias rule;
`event_context` credit for side-event posts at creation; re-pin the two pre-D061 `graphStrengthening`
invariants (D059 owner); the user's 164-post human queue (`/label/candidates?batch=…`).

**D061 landmines (all still apply):**
- Pooler is transaction-mode: only `begin; set local statement_timeout …` lengthens the 2-min limit.
- Structural view: no `distinct on`/OR-on-a-setting in the universe CTE (planner collapse, > 15 min); the
  batch-scoped FUNCTION scales badly — clustering reads the full view (~25 s) with a url filter.
- Never pipe a script through `head` (SIGPIPE kills it mid-run). `pgrep -f` matches its own shell.
- Two ingests at once deadlocked on `accounts` (fixed: sorted pre-upsert); still run one tick at a time.
- `post_extraction_runs` unique key (post_url, prompt_version): a second reader run over another clustering
  version overwrites the row for a post shared by two candidates.
- `revertWeddingBatch.ts --retire-verdicts` supersedes THIS_VENUE model verdicts only; re-create after a
  revert by replaying verdicts from history.
- Multi-day weddings (sangeet/mehndi/rehearsal at a side venue): the reader inverts toward the narrative
  venue; label W when the page's venue is the `Venue:` credit, V otherwise.
- Typo handles in credits mint bare accounts (Acquaviva); the creation gate is now alias-aware.
- Management companies credited as venues (Tigerlily): recredit + re-anchor, fact-check the site first.
- `measure.ts` counts only weddings created after the run was ingested (legacy registrations carry old links).
- Venue types are priors, not exclusions: the excluded hotels/restaurants/churches yielded 0.05 w/post.

## Next actions (Claude, when unblocked)

1. f1 as above → gate F → `--apply-serve` → row, STATE.md, commit → 5 spot-check URLs to the user.
2. f2: F2 repeatability check (10 venues re-extracted with `--force`, ≥ 90% agreement on the four closed
   enums) alongside the tick; then f3… through the 20+ band and the 6–19 band until ≥ 50 compare-ready
   or the cap; Phase 3 report; one `--undo-batch` rollback rehearsal.
3. Punch list (no spend): Marchetti headline 450 (homepage) vs 425 (brochure) — a "wedding page beats
   homepage" tuple-conflict rule at validation; Diamond Garden's per-guest floor picks the lunch special;
   "All-Inclusive" bar pill wording; LondonHouse corkage surfaced only on some runs.

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
- **Never chain a tick behind `until ! pgrep -f …`**: it matches its own shell and the D061 window's
  `scripts/acquire/runTick.ts`. Run ticks as plain background commands.
- **The DB `cost_usd` sum under-counts spend**: failed/truncated calls write no run row and a forced
  re-run overwrites the row. Read the OpenRouter key's `usage_daily` for the truth.
- **Haiku sometimes returns a tool array as a JSON string** (Adler FAQs, Greenhouse/Diamond Garden
  pricing paths); the assembler coerces/recovers, a shape retry is queued in the extractor.
- **Score selection = latest `validation.ok` run for the prompt version**, so a repair run's document
  can be the one scored; that is intended (repair child preferred) but remember it when reading numbers.
- **Golden facts are excluded from scoring when their source URL was not crawled** — the scorecard now
  prints every exclusion with its URL; read that block before believing a tier number.
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
