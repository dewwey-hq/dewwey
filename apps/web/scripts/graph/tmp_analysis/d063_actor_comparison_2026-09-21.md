# D063 Stage 0 -- mentions vs tagged, and the date filter

Generated 2026-09-21T00:32:56.163Z. Read-only against our DB; two paid Apify runs.
Actor under test: `apify~instagram-scraper` with `resultsType: "mentions"`.
Baseline: shortcodes already held from `apify/instagram-tagged-scraper` pulls.

- run A (no date filter): **75** items
- run B (onlyPostsNewerThan=2026-08-22): **45** items
- Apify usage before $26.8594 -> after $27.0894 = **$0.2301 billed**
- billed per item: $0.00192 (PRICE_USD assumes $0.0023)

## Q1. Is `mentions` the same content as the tagged actor?

| venue | held (tagged) | run A returned | of which already held | overlap % |
|---|---|---|---|---|
| @ivyroomchicago | 100 | 25 | 25 | 100% |
| @chicagowinery | 99 | 25 | 24 | 96% |
| @belvederechateau1 | 100 | 25 | 25 | 100% |

Overall overlap: **99%** of run A's items were already held.
A high overlap means the two actors surface the same feed (we already hold ~100 recent posts
per venue, so most of a fresh 25-post pull SHOULD be familiar). A near-zero overlap would mean
`mentions` is a different content type and the swap is unsafe.

## Q2. Does `onlyPostsNewerThan` actually filter?

- items returned: 45
- items OLDER than 2026-08-22: **1**
- filter honoured: **NO**
- run B / run A item ratio: 0.60

**FAIL** -- items older than the cutoff came back. The filter cannot be relied on for cost control; keep the tagged actor and defer incremental depth.

## Cost note

Both actors bill per result written to the dataset at the same tiered rate (BRONZE $0.0023).
Switching actors is therefore cost-neutral per result; the saving comes entirely from fetching
fewer results.
