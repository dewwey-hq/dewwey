# Decisions

Append-only log, newest entry on top. Not every choice goes here — only ones that would be genuinely annoying to re-derive or re-debug in 3 months. Any doc can cite an entry by ID (e.g. "see D002") instead of re-explaining it.

---

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
