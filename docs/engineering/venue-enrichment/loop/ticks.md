# Tick log (append-only; one row per tick, written from DB counts by `runTick.ts`)

Columns: tick · date (CT) · venues in tick · crawled pages / usable (≥ 400 chars) · extracted / skipped
(input_hash) · validated ok / needs_review · repaired · served · compare_ready (cumulative) · excellent
(cumulative) · $ tick · $ cumulative · gate · commit · notes.

| tick | date | venues | pages/usable | extracted/skipped | ok/needs_review | repaired | served | compare_ready | excellent | $ tick | $ cum | gate | commit | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
