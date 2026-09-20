# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every working
session; history lives in `decisions.md`, preferences in Claude's memory, in-flight detail nowhere else.
If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-20 ~01:30 (machine clock)** by the D060 window after calibration ticks c0–c4.
Two windows commit to local `main` in parallel (this one = D060 VenueDetails; the other = D061
acquisition loop, see "Second mission"). **`origin/main` was pushed by the user at `f145277` (2026-09-20);
everything after that is local only** — run `git log --oneline origin/main..HEAD` to see how many. The
`apps/web/scripts/graph/tmp_analysis/*` untracked files belong to the D061 window — leave them.

## How to resume (5 minutes)

1. `git log --oneline -15`, `git status`, `git log --oneline origin/main..HEAD | wc -l`.
2. `docs/engineering/venue-enrichment/loop/ticks.md` — the last row is where the loop stopped (c4) and why.
3. Re-check one live number: `bun run scripts/venue-details/reportVenueDetailsFunnel.ts` from `apps/web`
   (runs, validated, served = 0) and the OpenRouter key's `usage_daily`.
4. Then the "Blocked on the user" list. **No model spend until the user sets a fresh calibration cap**
   (the $10 cap is treated as reached; see the c4 row).

## Mission in flight — D060 VenueDetails v3 (2026-09-13 →): calibration loop, gate not yet met

The venue Details tab becomes one typed schema (comparison spine + detail layer) filled by a
provenance-first loop for every listed venue, rendered by one generic component. Plan of record:
`~/.claude/plans/hello-alright-want-to-quizzical-sparrow.md` ("Execution loop for Phases 2–3"); loop
protocol `docs/engineering/venue-enrichment/loop/README.md`; tick log `loop/ticks.md`; per-tick reports
`loop/reports/<tick>/`; narrative `docs/decisions.md` D060 + addenda (the 2026-09-20 addendum is the
calibration story).

**Done:** Phases 0–2 code; seven golden-render rounds; schema applied (user, 09-19); discovery applied
(421 listed → 307 candidates → 257 verified, batch `vd-discovery-1`); calibration crawl c0 (16 venues,
gate passed); four extraction passes c1–c4 (prompt v3.0 → v3.3) with the fixes listed in the D060
addendum; 820+ tests.

**Where the gate stands (c4, prompt v3.3, aligned scorer):**

| venue | critical | important_core | headline | cost delta | resources found |
|---|---|---|---|---|---|
| Galleria Marchetti | 14/14 | 22/27 | 450 vs 425 (homepage vs brochure) | 0% | 1/8 |
| Field Museum | 8/8 | 8/10 | 1,500 exact | n/a (inquire-only) | 2/6 |
| Geraghty | 7/8 | 5/6 | 300 exact | n/a | 1/3 |
| Greenhouse Loft | 10/11 | 11/23 (paths came back as a string) | 175 exact | none (same cause) | 5/5 |
| LondonHouse | 10/12 | 13/16 | 275 vs 190 (cocktail rows tagged seated) | 0% | 3/3 |
| Diamond Garden | 10/13 | 8/39 | 268 exact | path alignment (scorer) | 1/7 |

Final calibration read (c6, v3.5): critical 61/65 = 93.8%, resources 21/32 = 65.6%. **All six are served** (batch `vd-serve-c6`, 2026-09-20) for lab review; the loop's tick log has the full c0–c6 story.

**Nothing in flight.** Both resource builds and the scorer alignment landed and are committed.

**Next tick (c5) needs, in order:** the user's taxonomy decisions (below) → a re-crawl of the six
(`runTick.ts --tick c5 --account-ids <golden 6 + must-not 10> --crawl-only`; new snapshots because of
the ASSETS block) → prompt v3.4 (the taxonomy rules + the ASSETS mention) → extraction under a fresh cap
(~$1.50 for the six, $2.50 with the must-nots) → scorecard.

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

1. **Review the six served pages** on `localhost:3000/lab/venue?u=<username>` (galleriamarchetti,
   greenhouseloft, diamondgardenbanquet, lhchicago, fieldmuseum, thegeraghty) — served 2026-09-20 09:35
   at the c6 numbers (critical 93.8%, resources 65.6%) on the user's call. Fixes: `addCorrection.ts`
   (append-only, stable field paths) or tell Claude what is wrong and where. Revert the whole batch:
   `rollbackVenueDetails.ts --undo-batch vd-serve-c6 --apply`.
2. **Golden resources refresh** (small, human): re-collect the resource URLs for Marchetti, Geraghty and
   Field Museum from the live pages so the resources gate measures the crawler, not link rot.
3. **Fresh cap for Phase 3 fill ticks** when the review is done ($40 was the plan; ~$6.40 of the second
   calibration $10 is unspent).
4. Carried over: re-anchor human queue (17 weddings) — see D055/D056.

## Second mission (parallel window) — D061 Acquisition loop: month-1 ticks DONE; reader v1.3 shipped (2026-09-20 morning)

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
| Pilot (proven venues) | 10 | 0.58 | 98 | 53 | 0.21 | 0 | 0 |
| Canary vendor feeds | 5 | 0.29 | 82 | 23 | 0.18 | 5 | 0 |
| Canary thin venues | 20 | 1.13 | 477 | 37 | 0.076 | 33 | 5 |
| Legacy: Ben's posts at zero venues | 75 | 0 | 1,541 | 6 | 0.004 | 6 | 0 (46 venues dead) |
| **Probes A** (thin venues + alias siblings) | 223 | 9.84 | 3,965 | **306** | 0.072 | 202 | **24** |
| Low-types (hotels/restaurants/churches at 1-5) | 41 | 2.26 | 900 | 49 | 0.050 | 33 | 7 |
| Probes B (zero-wedding venues) | 60 | 2.87 | 1,201 | 18 | 0.015 | 14 | 0 (3 venues 0 → 1; 39 dead) |
| Vendor tick (tier-A planners/florists) | 22 | 1.27 | 425 | 103 | 0.188 | 5 | 0 |

Coverage (metro venue accounts, morning → end of night): 0: 170 → **165** · 1-5: 302 → **270** · 6-15: 78 → **108**
· 16-49: 64 → 64 · 50+: 27 → **33**.

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
tiers `probe6` (55) / `discovered` (39) / `deepen` (8 → 100 posts) added to `targets.ts`, ≈ $7.3 of ≈ $9.0 left.
**Nothing in flight** unless the remainder ticks below are running (check `acq_logs/` and `ops.crawl_runs`).

**Blocked on the user:** (1) **wedding 725 at @thelogantheatre** (created 2026-08-20, before the loop) is a
"vintage cinema shoot we produced" — a D049 LIKELY styled post that is a wedding row; retire it? (2) the 10
rubric conflicts from the eval (bridal shower, gender reveal, engagement shoot, vendor pitches labeled THIS_VENUE
by you): the reader keeps rejecting non-wedding events and sends credited pitches to your queue — say if you
want them auto-accepted instead. (Spot-check follow-up: wedding 12804 Chicago Forte promo retired via
`retireNonWeddingPosts.ts --from-audit`, batch `acq-20260919-probesA-spotcheck-retire-1`; 12866 Sable Creek kept,
verdict flipped under `jeremy`, `tmp_analysis/d061_spotcheck2_keep_one.sql`; 5 more probes A weddings created
from the user's confirmations. Weddings **6,450**.)

**Next (Claude):** remainder ticks, one at a time: `acq-20260920-probe6` (tagged × 25) → chain → create →
measure; `acq-20260920-discovered` (profile the 1 unprofiled first) → same; `acq-20260920-deepen` (8 venues,
`--results-limit 100`, re-pays their first 25) → same; coverage table; STATE. Then: typo-handle alias rule;
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

1. Land the two in-flight builds (resources; scorer path alignment), suites green, commit.
2. c5: re-crawl the 16 (ASSETS block) → prompt v3.4 with the user's taxonomy rules → extract the six
   under the new cap → score (critical, important_core, resources recall) → if green, serve the six
   (`--apply-serve`) and hand the lab URLs to the user; must-not slate extracted once on the final prompt.
3. F2 repeatability check (10 venues × `--force`) before any fill tick; then `targets.ts --band 20+`.

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
