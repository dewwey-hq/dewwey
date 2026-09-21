# D065 arm comparison -- identical metrics

Arms: `acq-20260920-d065A`, `acq-20260920-d065C`, `acq-20260920-d065D`. Generated 2026-09-21T05:21:41.100Z.

Scoring rule: every arm is measured against ONE shared baseline -- each venue's wedding count
excluding weddings created by **any** compared arm -- so no arm's "before" is polluted by another's
creations. `$` is `ops.crawl_runs.cost_usd` (the conservative PRICE_USD projection, identical
basis across arms).

## Headline

| Arm | Feed | Accts | $ | Fetched | New | Stack | Cand | Weddings | w/new post | **weddings/$** | $/wedding | w at <6 venues | thin-w/$ | **crossed 1-5 -> 6+** | crossed 0 -> 1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A depth-thin | tagged | 15 | $3.45 | 1496 | 1074 | 26 | 34 | **18** | 0.017 | **5.2** | $0.19 | 10 | 2.9 | **2** | 0 |
| C vendor-thin-conn | tagged | 12 | $2.76 | 1182 | 794 | 373 | 311 | **128** | 0.161 | **46.4** | $0.02 | 20 | 7.2 | **3** | 3 |
| D own-profile | own | 8 | $0.46 | 200 | 145 | 56 | 55 | **25** | 0.172 | **54.3** | $0.02 | 1 | 2.2 | **0** | 0 |

## Overlap check (is the per-arm credit double counted?)

- Per-arm sum of `crossed 1-5 -> 6+`: **5**
- UNION of all arms' creations against the same baseline: **5** crossings (0->1: 3)
- Venues created into by more than one arm: **12** (1132, 666, 583, 19194, 530, 577, 521, 484, 547, 127, 236, 280)
- Union equals the per-arm sum: the arms are NOT competing for the same crossings, so per-arm credit is clean.

## Per arm

### A depth-thin `acq-20260920-d065A`

- venues touched by its created weddings: 9
- crossed **1-5 -> 6+**: 5741 (4->6), 34248 (5->10)
- crossed 0 -> 1: (none)
- already-held share of fetched: 28.2%

### C vendor-thin-conn `acq-20260920-d065C`

- venues touched by its created weddings: 71
- crossed **1-5 -> 6+**: 1437 (2->11), 18631 (5->6), 21178 (5->6)
- crossed 0 -> 1: 664 (0->1), 21415 (0->1), 71064 (0->1)
- already-held share of fetched: 32.8%

### D own-profile `acq-20260920-d065D`

- venues touched by its created weddings: 21
- crossed **1-5 -> 6+**: (none)
- crossed 0 -> 1: (none)
- already-held share of fetched: 27.5%
