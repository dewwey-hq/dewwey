# D063 Stage 0 -- mentions vs tagged, and the date filter

Generated 2026-09-21T03:06:40.264Z. Read-only against our DB; two paid Apify runs.
Actor under test: `apify~instagram-scraper` with `resultsType: "mentions"`.
Baseline: shortcodes already held from `apify/instagram-tagged-scraper` pulls.

- run A (no date filter): **100** items
- run B (onlyPostsNewerThan=2024-01-01): **13** items
- Apify usage before $28.1812 -> after $28.4112 = **$0.2300 billed**
- billed per item: $0.00204 (PRICE_USD assumes $0.0023)

## Q1. Is `mentions` the same content as the tagged actor?

| venue | held (tagged) | run A returned | of which already held | overlap % |
|---|---|---|---|---|
| @hiltonchicagonorthbrook | 25 | 100 | 25 | 25% |

Overall overlap: **25%** of run A's items were already held.
A high overlap means the two actors surface the same feed (we already hold ~100 recent posts
per venue, so most of a fresh 25-post pull SHOULD be familiar). A near-zero overlap would mean
`mentions` is a different content type and the swap is unsafe.

## Q2. Does `onlyPostsNewerThan` actually filter?

- items returned: 13
- UNPINNED items older than 2024-01-01: **0** (real violations)
- pinned items older than 2024-01-01: 0 (documented exception, harmless)
- filter honoured: **YES**
- run B / run A item ratio: 0.13

**PASS** -- the filter fires and returns strictly newer posts (pinned posts excepted, as Apify documents). Incremental depth pulls are viable: a deepen tick can skip everything it already holds instead of re-paying for it.

## Cost note

Both actors bill per result written to the dataset at the same tiered rate (BRONZE $0.0023).
Switching actors is therefore cost-neutral per result; the saving comes entirely from fetching
fewer results.
