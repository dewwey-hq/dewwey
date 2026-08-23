# Scaling & Infrastructure Notes

## Current stack
- **Frontend:** Next.js 16 on Vercel
- **Backend:** AWS Lambda + API Gateway
- **Database:** AWS RDS PostgreSQL
- **Scraping:** Apify (instagram-scraper actor)

## Where things break

### The real bottleneck: RDS connections
Each concurrent Lambda invocation opens its own DB connection (pool max:1 per instance). At 50 concurrent users hitting search simultaneously, you get 50 separate RDS connections. RDS connection caps by instance size:

| Instance | Max connections |
|---|---|
| db.t3.micro | ~60-87 |
| db.t3.small | ~150 |
| db.t3.medium | ~300 |

**Practical ceiling:** ~50-100 concurrent users before you see `too many connections` errors. Daily active user count isn't the issue — it's traffic spikes (wedding expo, press hit, viral TikTok, engagement season Dec/Jan).

### Other limits (less urgent)
- **Lambda cold starts** — noticeable above ~10 req/sec bursts without provisioned concurrency
- **Data volume** — not a concern; indexes + LIMIT/OFFSET pattern handles tens of thousands of vendors fine

## Fix tiers

### Tier 1 — Pre-launch hardening (~$40-70/month)
Add **RDS Proxy** in front of RDS. It pools and multiplexes connections so hundreds of concurrent Lambda invocations share a small number of actual DB connections. No code changes — just point `DB_HOST` at the proxy endpoint instead of RDS directly.
- Cost: ~$10-15/month (scales with DB instance vCPUs)
- Takes you from ~50 concurrent users to comfortably thousands
- **Do this before any press push or launch moment**

### Tier 2 — Growth scale (~$150-300/month)
For thousands of daily users / real launch traffic:
- RDS upsized to db.t3.medium or db.r6g.large
- Provisioned concurrency on search Lambda (kills cold starts, ~$10-30/month for 2-5 warm instances)
- CloudFront in front of API Gateway for caching vendor search results

### Tier 3 — Real scale ($300-1000+/month)
For tens of thousands of users / multi-city expansion:
- Migrate to **Aurora Serverless v2** — autoscales compute, built-in connection pooling (may replace RDS Proxy)
- Read replicas if search traffic heavily outpaces writes (likely, since scraping is infrequent)

## Recommendation
Don't over-build pre-launch. The one thing worth doing early is **RDS Proxy** — low effort, low cost, removes the failure mode that could embarrass you during a traffic spike. Everything else waits until real usage data shows where the next bottleneck is.
