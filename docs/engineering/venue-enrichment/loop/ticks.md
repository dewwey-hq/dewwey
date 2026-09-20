# Tick log (append-only; one row per tick, written from DB counts by `runTick.ts`)

Columns: tick · date (CT) · venues in tick · crawled pages / usable (≥ 400 chars) · extracted / skipped
(input_hash) · validated ok / needs_review · repaired · served · compare_ready (cumulative) · excellent
(cumulative) · $ tick · $ cumulative · gate · commit · notes.

| tick | date | venues | pages/usable | extracted/skipped | ok/needs_review | repaired | served | compare_ready | excellent | $ tick | $ cum | gate | commit | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c0 | 2026-09-19 23:14 | 16 (golden 6 + must-not 10) | 364 usable / 1 js_shell page / 10 image-only PDFs; 4 Seasons unreachable | 0 / 0 | – | – | 0 | 0 | 0 | $0 | $0 | C0: every golden ≥ 9 usable pages; Marchetti brochure + Field Museum wine list reached via seeds; re-crawl of the six: 144 fetches all `unchanged`, 0 new snapshots → **PASS** | 8b7059e | crawl-only checkpoint; Greenhouse + Four Seasons have no wedding page (Greenhouse is single-page; Four Seasons blocks bots) |
