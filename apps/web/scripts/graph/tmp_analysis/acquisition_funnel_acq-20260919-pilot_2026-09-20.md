# Acquisition funnel report -- acq-20260919-pilot

## Per tier

| Tier | Runs | $ | Fetched | New posts | Already had | Stack posts | Candidates |
|---|---|---|---|---|---|---|---|
| pilot | 1 | $0.5750 | 249 | 98 | 151 | 49 | 56 |
| TOTAL | 1 | $0.5750 | 249 | 98 | 151 | 49 | 56 |

## Creation decisions (batch-total, no tier breakdown -- see file header)

- acq-20260919-pilot-create-1: CREATE: 43
- acq-20260919-pilot-create-1: REVERTED: 43
- acq-20260919-pilot-create-2: CREATE: 2
- acq-20260919-pilot-create-3: CREATE: 43
- acq-20260919-pilot-create-4: CREATE: 8
- acq-20260919-pilot-create-4: SKIP: 2

## Weddings created

- Weddings created (`jeremy_weddings_created.batch_id like 'acq-20260919-pilot-create-%'`): **53**
- Venues crossing 0 -> 1 documented wedding: **0**
- Venues crossing into 6+ (previously 1-5): **0**
- $ per created wedding: $0.01
- $ per new wedding at a venue that had < 6 before: n/a (0 qualifying weddings)

## Three clocks

- `posts.posted_at` (Instagram) range: 2026-08-20T18:04:41.000Z .. 2026-09-19T01:13:04.000Z
- `observed_at` (fetch) range: 2026-09-19T20:01:09.145Z .. 2026-09-19T20:01:09.145Z
- `jeremy_weddings_created.created_at` (decision) range: 2026-09-19T20:40:35.490Z .. 2026-09-20T01:04:58.906Z
