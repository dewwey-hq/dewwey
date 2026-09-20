# Acquisition funnel report -- acq-20260919-canary

## Per tier

| Tier | Runs | $ | Fetched | New posts | Already had | Stack posts | Candidates |
|---|---|---|---|---|---|---|---|
| canary | 2 | $1.1270 | 489 | 477 | 12 | 53 | 59 |
| TOTAL | 2 | $1.1270 | 489 | 477 | 12 | 53 | 59 |

## Creation decisions (batch-total, no tier breakdown -- see file header)

- acq-20260919-canary-create-1: CREATE: 33
- acq-20260919-canary-create-2: CREATE: 1
- acq-20260919-canary-create-3: CREATE: 2
- acq-20260919-canary-create-3: SKIP: 2
- acq-20260919-canary-create-4: CREATE: 1
- acq-20260919-canary-create-4: SKIP: 1
- acq-20260919-canary-create-5: SKIP: 1
- acq-20260919-canary-create-6: CREATE: 1

## Weddings created

- Weddings created (`jeremy_weddings_created.batch_id like 'acq-20260919-canary-create-%'`): **38**
- Venues crossing 0 -> 1 documented wedding: **0**
- Venues crossing into 6+ (previously 1-5): **7**
- $ per created wedding: $0.03
- $ per new wedding at a venue that had < 6 before: $0.03

## Three clocks

- `posts.posted_at` (Instagram) range: 2021-12-05T17:14:57.000Z .. 2026-09-19T21:56:56.000Z
- `observed_at` (fetch) range: 2026-09-20T01:49:21.513Z .. 2026-09-20T01:57:05.136Z
- `jeremy_weddings_created.created_at` (decision) range: 2026-09-20T02:23:54.233Z .. 2026-09-20T21:05:37.405Z
