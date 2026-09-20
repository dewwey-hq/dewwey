# VenueDetails v3 fill loop — protocol

Started 2026-09-19 (D060, Phases 2–3). The loop that fills the venue Details schema for every listed venue
from the venue's own website, in ticks, with gates, so that a context loss anywhere costs at most one
tick. Status lives in `docs/STATE.md`; history in `docs/decisions.md` D060; the plan of record is
`~/.claude/plans/hello-alright-want-to-quizzical-sparrow.md` ("Execution loop for Phases 2–3"). This file
is the protocol; `ticks.md` is the log; `reports/<tick>/` holds what each tick printed.

## Units

- **Calibration tick** (`c0`, `c1`, …): the golden six as live venues + the rubric's must-not slate
  (`apps/web/scripts/venue-details/mustnot/account-map.csv`). `c0` is crawl + coverage only (the crawl-only
  checkpoint; no model spend). `c1`… is one tick per prompt version: extract → validate → repair → validate
  → score against the golden fixtures + must-not assertions. A prompt bump changes `input_hash`, so only the
  new prompt's calls are paid for.
- **Fill tick** (`f1`, `f2`, …): ~30 venues from `targets.ts` in wedding-count order (band 20+ weddings
  first, then 6–19, then 1–5; within a band, venues with a wedding page first). Same steps, then serve.

## The tick command

```
cd apps/web
bun run scripts/venue-details/targets.ts --band 20+ --limit 30 --ids-file scripts/graph/tmp_analysis/vd_f1.ids   # fill only
bun run scripts/venue-details/runTick.ts --tick f1 --ids-file scripts/graph/tmp_analysis/vd_f1.ids --max-cost-usd 10
   # crawl → coverage → extract → validate → repair → validate → must-not → serve DRY-RUN → funnel → row
   # read docs/engineering/venue-enrichment/loop/reports/f1/*, check the gate below
bun run scripts/venue-details/runTick.ts --tick f1 --ids-file … --skip-crawl --apply-serve                 # gate green only
```
Then: append the printed row to `ticks.md`, rewrite the D060 section of `docs/STATE.md` from the funnel,
commit `vd tick f1: …`. Calibration ticks use `--golden` (+ the must-not ids via `--account-ids`) and
`--crawl-only` for `c0`.

Batch ids: crawl `vd-crawl-<tick>`, serve `vd-serve-<tick>`, discovery `vd-discovery-1`. Every write carries
its batch id; `rollbackVenueDetails.ts --undo-batch vd-serve-<tick>` reverts a tick's serve.

## Gates (a tick never `--apply-serve`s until its gate is green; a failed gate is a report, not a retry)

- **C0 — crawl checkpoint.** ≥ 5 pages with ≥ 400 chars for each golden; Marchetti's brochure and Field
  Museum's wine list reached through `seeds/golden-seeds.csv`; every must-not venue crawled or recorded as
  shell/unreachable; a second run creates 0 new snapshots.
- **C1…Cn — calibration, per prompt version.** On extractor-tagged golden fields: critical accuracy ≥ 95%,
  critical numeric grounding 100%, important ≥ 85%, headline capacity exact ≥ 5/6, estimateCost within 2%
  on the four calculator venues, zero must-not assertion failures. Each prompt bump is a commit naming the
  failure classes it targets; the scorecard before/after is in `reports/<tick>/scorecard.md`. Stop at 6
  prompt versions or $10 and hand the failure classes to the user.
- **F — every fill tick.** 0 critical grounding failures on the runs about to be served; the six universal
  must-not assertions green on every served venue; only `validation.ok` runs served (never
  `--allow-needs-review` inside the loop); tick spend ≤ cap; served and compare-ready counts reported beside
  the tick's shell / image-PDF rate. **F2 also**: repeatability — 10 venues re-extracted with `--force`,
  ≥ 90% agreement on the four closed enums.
- **Phase 3 end.** ≥ 70 served, ≥ 50 compare-ready with the `excellent` count beside it, overall grounding
  mismatch ≤ 5%, human spot-check of 10 (`/lab/venue?u=<username>`), one `--undo-batch` rollback rehearsed.

## Budget

Calibration ≤ $10 total. Phase 3 ≤ $40 total (`--max-cost-usd 10` per tick). At the expected $0.10–0.30
per venue that covers the 20+ and 6–19 bands (~176 verified venues); the 1–5 band is a second approval.
The cumulative figure in `ticks.md` is `sum(venue_details_runs.cost_usd)`, a DB fact, never a running
estimate.

## Human touchpoints (front-loaded, not per tick)

1. One approval covered: pushing `main`, discovery apply, crawls into R2, extraction under the caps, serving
   into the `venue_details*` tables (only `/lab/venue?u=` reads them; production is Phase 4, a separate go).
2. Spot-checks: after `f1` (5 venues) and at Phase 3 end (10 venues), on `/lab/venue?u=`; the tick row lists
   the URLs. Fixes go through `addCorrection.ts` (append-only, stable field paths).
3. The calibration failure classes, if the C gate is not met within the stop rule.

## Recovery after a context loss

`git log --oneline -5` → `docs/STATE.md` (last tick row, next tick id) → `bun run
scripts/venue-details/reportVenueDetailsFunnel.ts` (live truth) → `ticks.md`. If the last tick's row or
commit is missing, re-run that tick's command: crawl dedupes by content hash (unchanged pages cost a fetch,
not a snapshot), extract skips runs whose `input_hash` exists, repair selects only runs with remaining
`validation.repairs`, serve is a dry-run unless `--apply-serve`, and a second `--apply-serve` on the same
run writes a new version equal to the previous one (visible in the funnel, harmless).

## Naming and files

- `reports/<tick>/coverage.md`, `validate-1.md`, `validate-2.md`, `scorecard.md` (calibration) or
  `mustnot.md` (fill), `serve-dry-run.md`, `serve-apply.md`, `funnel.md`, `tick-row.md`.
- Scratch inputs (`*.ids`, manual CSVs) stay in `apps/web/scripts/graph/tmp_analysis/` (untracked).
- `docs/STATE.md` D060 section: mission line, the tick table (copied from `ticks.md`), blocked-on-user, next
  tick, landmines. Rewritten every tick.
