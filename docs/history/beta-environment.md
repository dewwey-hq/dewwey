# Beta Environment

## TLDR

A full parallel copy of prod (RDS + Lambda + API Gateway) plus a beta.dewwey.com domain, so we can demo/test without touching real data. Gated behind an app-level password (not Vercel's paid password protection — we're on the free Hobby plan). Status: live and working as of 2026-07-23.

## Status

Live. Last touched: 2026-07-23.

## Architecture (detail)

- RDS: `wedding-app-beta-db`, restored from prod's daily snapshot, same VPC/security group as prod
- Lambda: `wedding-app-vendor-search-beta`, same code as prod, shares prod's IAM execution role
- API Gateway: `rm4ubmuksa` — `GET /vendors`, `GET /vendors/{id}`
- Vercel: `beta.dewwey.com` → bound to `beta` git branch; DNS A record (76.76.21.21) at GoDaddy
- Access: app-level password gate (`middleware.ts` + `BETA_ACCESS_PASSWORD` env var, hostname-scoped so prod stays public)

## Gotchas (read before touching this again)

- Reusing prod's IAM role for the beta Lambda silently breaks CloudWatch logging — its policy only granted `logs:PutLogEvents` on prod's specific log-group ARN. Fixed by widening the policy. See D002.
- Vercel's `ssoProtection: "all_except_custom_domains"` does NOT exempt a non-production custom domain like beta.dewwey.com — only the actual Production domain is exempt. Had to disable SSO project-wide instead. See D003.
- `NextResponse.redirect()` defaults to a 307, which replays POST on redirect — breaks any post-login-redirect flow. Always pass 303 explicitly. See D004.

## Related

- [`environments.md`](environments.md) — the general, evergreen prod/beta runbook
- [`docs/decisions.md`](../decisions.md) — D002, D003, D004
- `ROADMAP.md` — "beta environment" item
