# D065 arm comparison -- identical metrics

Arms: `acq-20260920-d065A`, `acq-20260920-d065C`, `acq-20260920-d065D`, `acq-20260921-d065scale`. Generated 2026-09-22T04:01:20.917Z.

Scoring rule: every arm is measured against ONE shared baseline -- each venue's wedding count
excluding weddings created by **any** compared arm -- so no arm's "before" is polluted by another's
creations. `$` is `ops.crawl_runs.cost_usd` (the conservative PRICE_USD projection, identical
basis across arms).

## Headline

| Arm | Feed | Accts | $ | Fetched | New | Stack | Cand | Weddings | w/new post | **weddings/$** | $/wedding | w at <6 venues | thin-w/$ | **crossed 1-5 -> 6+** | crossed 0 -> 1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A depth-thin | tagged | 15 | $3.45 | 1496 | 1074 | 26 | 34 | **20** | 0.019 | **5.8** | $0.17 | 12 | 3.5 | **2** | 0 |
| C vendor-thin-conn | tagged | 12 | $2.76 | 1182 | 794 | 373 | 311 | **147** | 0.185 | **53.3** | $0.02 | 24 | 8.7 | **4** | 3 |
| D own-profile | own | 8 | $0.46 | 200 | 145 | 56 | 55 | **25** | 0.172 | **54.3** | $0.02 | 1 | 2.2 | **0** | 0 |
| SCALE vendorthin x56 | tagged | 56 | $11.64 | 4923 | 3624 | 1299 | 1125 | **632** | 0.174 | **54.3** | $0.02 | 65 | 5.6 | **13** | 3 |

## Overlap check (is the per-arm credit double counted?)

- Per-arm sum of `crossed 1-5 -> 6+`: **19**
- UNION of all arms' creations against the same baseline: **19** crossings (0->1: 6)
- Venues created into by more than one arm: **73** (5741, 4641, 4386, 1132, 666, 583, 1660, 271, 27393, 1437, 18631, 4433, 11081, 483, 2631, 20812, 541, 68, 1370, 2785, 19194, 18945, 530, 27405, 1598, 4604, 20332, 3389, 58, 590, 586, 21174, 2342, 700, 580, 578, 305, 1461, 577, 1205, 519, 521, 484, 591, 263, 520, 1131, 595, 4420, 8023, 592, 3970, 529, 31, 687, 547, 194, 127, 236, 515, 280, 2221, 20671, 1923, 248, 2245, 5680, 27424, 1433, 4551, 474, 1057, 2379)
- Union equals the per-arm sum: the arms are NOT competing for the same crossings, so per-arm credit is clean.

## Per arm

### A depth-thin `acq-20260920-d065A`

- venues touched by its created weddings: 9
- crossed **1-5 -> 6+**: 5741 (4->6), 34248 (4->11)
- crossed 0 -> 1: (none)
- already-held share of fetched: 28.2%

### C vendor-thin-conn `acq-20260920-d065C`

- venues touched by its created weddings: 79
- crossed **1-5 -> 6+**: 1437 (2->12), 18631 (5->6), 18676 (5->6), 21178 (5->6)
- crossed 0 -> 1: 664 (0->1), 21415 (0->1), 71064 (0->1)
- already-held share of fetched: 32.8%

### D own-profile `acq-20260920-d065D`

- venues touched by its created weddings: 21
- crossed **1-5 -> 6+**: (none)
- crossed 0 -> 1: (none)
- already-held share of fetched: 27.5%

### SCALE vendorthin x56 `acq-20260921-d065scale`

- venues touched by its created weddings: 175
- crossed **1-5 -> 6+**: 596 (4->6), 648 (5->6), 1209 (5->6), 1437 (2->10), 4382 (5->6), 4409 (5->6), 11085 (5->12), 18631 (5->7), 18940 (5->9), 27393 (3->7), 27404 (5->6), 27429 (5->6), 27455 (5->6)
- crossed 0 -> 1: 617 (0->2), 55070 (0->1), 57917 (0->1)
- already-held share of fetched: 26.4%
