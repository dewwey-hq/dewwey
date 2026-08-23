# Decisions

Append-only log, newest entry on top. Not every choice goes here — only ones that would be genuinely annoying to re-derive or re-debug in 3 months. Any doc can cite an entry by ID (e.g. "see D002") instead of re-explaining it.

---

## D008 — 2026-08-22 — apps/web: Bun, graph-first queries, dead architecture removed

Status: Accepted
Context: The monorepo merge (see docs/merge-eval.md) left the app querying Jeremy's old table shape against an empty database, on npm, with the retired AWS/beta machinery still in the tree.
Decision: (1) `lib/server/vendors.ts` now reads the graph (`accounts`/`v_account_role`/`account_locations`/`weddings`/`edges`) as the source of truth, with the Places `vendors` layer as a LEFT JOIN that enriches rows when populated — "frequently works with" comes from the `edges` matview (real weddings together), replacing read-time mention counting. (2) Switched to Bun (`bun.lock`; Vercel auto-detects). (3) Deleted dead code: beta password gate (middleware + routes), the `/api/venue-photo` proxy plane, all RDS-targeting `scripts/`, the subtree'd `.github/` CI (workflows can't run from a subdirectory), and 10 script-only dependencies. Jeremy's docs moved to root `docs/` (live) and `docs/history/` (retired architecture) — one documentation universe.
Why: The app had no data behind Jeremy's shape (his import waits on the merge conversation); the graph side has 1,384 weddings today. Ben explicitly requested the Bun switch and dead-code removal.
Related: docs/merge-eval.md, D006, D007

## D007 — 2026-08-22 — Cloudflare R2 for images; DB stores keys, never URLs

Status: Accepted
Context: IG avatar CDN URLs and Google Places photo URLs both expire — the root cause of Jeremy's photo-refresh machinery.
Decision: Bucket `dewwey` (Ben's Cloudflare account, ENAM). All 1,361 avatars uploaded under `avatars/` — keys equal `accounts.avatar_path` verbatim. The DB stores object keys; the app composes `NEXT_PUBLIC_R2_PUBLIC_URL` + key at read time, so the serving domain (r2.dev now, custom later) can change without touching rows. Venue photos will follow via `vendors.photo_keys`. Bucket management via `cf` CLI; object I/O via the S3-compatible API.
Why: Zero egress fees, and download-once-at-ingest kills the entire expiring-URL problem class (Jeremy's refresh scripts + cron TODO are retired).
Related: D008, docs/history/place-photo-automation-todo.md

## D006 — 2026-08-22 — Merged schema: how Jeremy's layer joins the graph (designed with Ben)

Status: Accepted
Context: Two datasets — Ben's wedding-centric graph (source of truth) and Jeremy's Places-seeded vendor directory — needed one schema (see docs/merge-eval.md).
Decision: (1) `vendors` is a slim typed core (~20 columns) + full Places payload in `raw` jsonb — Jeremy's 50-column table is not resurrected. (2) The bridge is `vendors.account_id` FK + `account_matched_by`, not a mapping table — one canonical IG account per business. (3) `venue_enrichment`/`venue_extraction_runs` adopted wholesale. (4) `posts` gains `source` (`venue_tagged`|`own_profile`) and `wedding_score` (his idea, kept as the ingest filter — only 29% of own-profile posts are credible weddings). (5) His `instagram_post_appearances` is never imported — superseded by the stack parser. (6) His raw data lands in a `staging` schema for re-parse, only after the Ben↔Jeremy conversation.
Related: pipeline/schema.sql, docs/jeremy-ddl.sql, docs/merge-eval.md

## D005 — 2026-08-10 — Moved the vendor-search Lambda (beta + prod) off the `postgres` superuser onto a least-privilege `app_readonly` role

Status: Accepted
Context: The Lambda (`vendor-search-beta`/`vendor-search`) and all scripts connected to RDS as `DB_USER=postgres` — the instance superuser. This app has no write path today (no user accounts, no in-UI create/update — the Lambda only `SELECT`s), so the superuser was pure unneeded blast radius. It's also a real future landmine: Postgres RLS policies are bypassed by superusers and table owners by default, so if per-user RLS is ever added (see venue-enrichment/multi-tenant discussion), it would silently do nothing while the app connects as `postgres`. Also noted in passing: prod and beta currently share the same `postgres` password — not addressed here, a candidate for a future decision.
Decision: Added `scripts/migrations/007_create_readonly_app_role.sql`, which creates `app_readonly` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, `SELECT`-only via `GRANT` + `ALTER DEFAULT PRIVILEGES` so future tables are covered automatically). Run and verified on both beta and prod 2026-08-10/11 — confirmed `SELECT` works and `INSERT`/`CREATE TABLE` are denied on both. Rotated both Lambdas' (`vendor-search-beta`, `vendor-search`) `DB_USER`/`DB_PASSWORD` env vars to the new role and confirmed each is still serving live traffic afterward (beta and prod `/vendors` endpoints both returned real data post-rotation). Migration/admin scripts (which run schema changes) still use the `postgres` role — only the read-only Lambda path moved.
Related: docs/engineering/environments.md, docs/engineering/ai-constitution.md

## D004 — 2026-07-23 — Beta login redirects must use 303, not default 307

Status: Accepted
Context: The beta password-gate login POSTs to `/api/beta-access`; the success redirect used `NextResponse.redirect(destination)` with no explicit status, which defaults to 307.
Decision: All three redirects in `app/api/beta-access/route.ts` now pass status `303` explicitly.
Why: A 307 preserves the original request method on the follow-up request. Since the destination (`/`) is a GET-only page route, the browser replayed the redirect as a POST and got a 405. 303 forces the browser to GET regardless of the original method — the standard post-login-redirect pattern.
Related: docs/engineering/beta-environment.md

## D003 — 2026-07-23 — Disabled Vercel SSO protection project-wide, added an app-level password gate instead

Status: Accepted
Context: `beta.dewwey.com` redirected visitors to `vercel.com/login`. The project's `ssoProtection: "all_except_custom_domains"` setting turned out to only exempt the actual **Production** domain — a non-production custom domain bound to the `beta` branch was still gated.
Decision: Disabled `ssoProtection` entirely at the project level; added an app-level password gate (`middleware.ts` + `BETA_ACCESS_PASSWORD`, hostname-scoped to `beta.dewwey.com` so prod stays public) instead of Vercel's built-in password protection.
Why: Vercel Pro password protection isn't available on the free Hobby plan this project is on. The app-level gate achieves the same "shareable for demos, not indexed/walk-in-able" outcome at zero added cost.
Related: docs/engineering/beta-environment.md

## D002 — 2026-07-23 — Widened the shared Lambda execution role's CloudWatch log policy for beta

Status: Accepted
Context: The beta Lambda (`wedding-app-vendor-search-beta`) reuses prod's IAM execution role to save setup time. Its CloudWatch logging policy (`logs:CreateLogStream` / `logs:PutLogEvents`) was scoped by resource ARN to only prod's specific log group.
Decision: Added the beta function's log-group ARN to the same managed policy (new policy version).
Why: Beta executed and returned correct responses fine, but every invocation's logs were silently dropped — no error surfaced anywhere, the log group simply never got created. This is an easy trap to hit again if a future Lambda reuses an existing role rather than getting its own.
Related: docs/engineering/beta-environment.md

## D001 — 2026-07-22 — Adopted this decisions log

Status: Accepted
Decision: Going forward, decisions worth not re-deriving get an entry here, in this one file, newest on top.
Prior decisions remain documented inline as informal "Status:" sections inside their originating docs (`docs/product/`, `docs/engineering/`) and are **not** retroactively backfilled into this log — only new decisions from this point forward.
