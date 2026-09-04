# V3 production canary — sample methodology

**Purpose:** a representative (not adversarial) sample of the real `staging.instagram_posts`
corpus, to learn how the frozen V3 classifier behaves on the actual 47,623-post distribution
before committing to the full run.

## Selection method

`canary_v3_3000_query.sql` is the exact, runnable query. Reproducible via `select setseed(0.42)`
before sampling (Postgres's `random()` becomes deterministic for the rest of that session).

**Stratified by the one dimension that most affects classifier behavior and cost — whether the
free deterministic tier (`det-only-v3`) already resolved the post — sampled proportionally to
its real corpus share, uniform random within each stratum:**

| stratum | corpus share | canary target | actual |
|---|---|---|---|
| `deterministic_excluded` (det-only-v3 says EXCLUDE, free) | 33.4% (15,929/47,623) | 1,002 | 1,002 |
| `deferred_to_llm` (det-only-v3 defers, needs cheap/expensive tier) | 66.6% (31,694/47,623) | 1,998 | 1,998 |
| **Total** | | **3,000** | **3,000** |

This is deliberately the *only* explicit stratum — a large uniform-random sample within each
half already tracks every other dimension by the law of large numbers, which was verified
directly rather than assumed:

| dimension | canary | corpus | 
|---|---|---|
| vendor_category=venue | 32.60% | 32.13% |
| vendor_category=photographer | 21.10% | 21.37% |
| vendor_category=(null) | 11.80% | 12.19% |
| vendor_category=florist | 9.37% | 8.95% |
| vendor_category=dj_music | 7.17% | 7.73% |
| vendor_category=hair_makeup | 7.80% | 7.73% |
| vendor_category=caterer | 7.13% | 6.95% |
| vendor_category=planner | 2.53% | 2.60% |
| vendor_category=baker | 0.50% | 0.36% |
| location_tag: no_tag | 42.17% | 44.85% |
| location_tag: other_tag | 32.17% | 34.74% |
| location_tag: chicago_tag | 25.67% | 26.71% |
| post_year=2024 | 18.63% | 20.60% |
| post_year=2025 | 36.17% | 37.58% |
| post_year=2026 | 41.40% | 43.91% |

No hand-picking anywhere in this process — every row is `staging.instagram_posts`/`vendors`
data, selected purely by the query above.

## Files

- `canary_v3_3000_query.sql` — the exact query (run with `psql -f`)
- `canary_v3_3000.csv` — the 3,000 selected `post_url`s + which stratum each came from
- (this file) — methodology

## To reproduce

```bash
psql "$DATABASE_URL" -f scripts/classify/data/canary_v3_3000_query.sql
```
