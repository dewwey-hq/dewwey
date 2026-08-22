# Environments (beta + prod)

Stable beta for demos and experiments; prod for launch. Code promotes via Git branches; data promotes via migrations and batch jobs run in order.

## Architecture

| Layer | Prod | Beta |
|-------|------|------|
| **Git branch** | `main` | `beta` |
| **Vercel** | `dewwey.com` (production) | `beta.dewwey.com` → `beta` branch |
| **Lambda** | `vendor-search` | `vendor-search-beta` |
| **API Gateway** | `kfln0omb31` | `rm4ubmuksa` |
| **RDS** | `wedding-app-prod-db` | `wedding-app-beta-db` |
| **Apify / Vertex / Google APIs** | shared accounts | same |

Frontend and Next.js API routes deploy with Vercel — no second Vercel project. Only env vars change per environment.

## Git + Vercel workflow

```
feature/foo  →  PR → beta  →  validate on beta.dewwey.com  →  PR → main  →  prod
```

1. **Vercel project** → Settings → Git → Production Branch = `main`.
2. **Domains** → `beta.dewwey.com` assigned to branch `beta` (done).
3. **Environment variables** (Settings → Environment Variables):

| Variable | Production (`main`) | Preview / `beta` branch |
|----------|-------------------|-------------------------|
| `NEXT_PUBLIC_VENDOR_API_URL` | `https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors` | `https://rm4ubmuksa.execute-api.us-east-1.amazonaws.com/vendors` |
| `BETA_ACCESS_PASSWORD` | *(unset)* | shared demo password — gates **beta.dewwey.com** only |

Set `BETA_ACCESS_PASSWORD` on **Production and Preview** in Vercel if the beta custom domain does not receive Preview env vars. `dewwey.com` stays public because middleware only gates `beta.dewwey.com`.
| `NEXT_PUBLIC_GOOGLE_*` | same keys | same keys |
| Google referrer allowlist | prod + beta domains | prod + beta domains |

4. Feature branches get Preview URLs automatically. Use those for quick checks; use `beta` for stable demos.

**Code promotion = merge.** Merging to `beta` deploys beta. Merging `beta` → `main` deploys prod.

**Data promotion = manual.** Git does not move database rows. Run migrations and enrichment on beta first, then prod when validated.

---

## AWS setup checklist

Do these once in the AWS console (or CLI). Either you or Claude Code can run CLI steps if credentials are configured locally.

### 1. Beta RDS

- [x] Create `wedding-app-beta-db` (restored from prod snapshot).
- [ ] Note the exact endpoint hostname in `.env.local` (see AWS console).

### 2. Beta Lambda + API Gateway

- [x] `vendor-search-beta` Lambda → beta RDS credentials.
- [x] HTTP API `rm4ubmuksa` with `GET /vendors` and `GET /vendors/{id}`.
- [x] Beta API base URL: `https://rm4ubmuksa.execute-api.us-east-1.amazonaws.com/vendors`.

See [lambdas/vendor-search/README.md](../../lambdas/vendor-search/README.md) for deploy steps.

### 3. Google Cloud

- [ ] Add `https://beta.dewwey.com/*` to browser key HTTP referrer restrictions (Maps / Places).

### 4. Local env files

Copy [env.example](./env.example) → `.env.local` and point `DB_HOST` at **beta**.

```bash
cp docs/engineering/env.example .env.local
# edit values
```

Optional:

- `.env.beta` — used when `WEDDING_APP_ENV=beta`
- `.env.prod` — used when `WEDDING_APP_ENV=prod` (requires `ALLOW_PROD_DB=true` for scripts)

### 5. Create `beta` branch

- [x] `origin/beta` exists; `beta.dewwey.com` wired in Vercel.

---

## Migrations

Always **beta first**, then prod.

```bash
# Beta
psql -h wedding-app-beta-db....rds.amazonaws.com -U postgres -d postgres \
  -f scripts/migrations/00N_description.sql

# After validation on beta app
ALLOW_PROD_DB=true WEDDING_APP_ENV=prod psql -h wedding-app-prod-db....rds.amazonaws.com ...
```

See [scripts/migrations/README.md](../../scripts/migrations/README.md).

---

## Scripts and prod safety

Scripts read DB credentials from `.env.local` (or `.env.beta` / `.env.prod`).

`scripts/lib/db.js` refuses connections to hosts matching `prod` unless:

```bash
ALLOW_PROD_DB=true WEDDING_APP_ENV=prod node scripts/your-script.js
```

New scripts should use:

```js
const { createPool } = require("./lib/db");
const pool = createPool();
```

Existing scripts still use inline `Pool` config — migrate over time.

---

## What we are not doing yet

- Feature flag SaaS (beta branch is the gate)
- Vercel Pro password protection (using app-level `BETA_ACCESS_PASSWORD` on beta instead)
- Separate AWS accounts
- RDS Proxy (see [scaling.md](scaling.md))
- Automated beta DB refresh (manual snapshot monthly is enough for now)

---

## Quick reference

| I want to… | Do this |
|------------|---------|
| Build a feature | branch `feature/x`, open PR |
| Demo to someone | merge to `beta`, share beta URL |
| Ship to prod | merge `beta` → `main` |
| Run a migration | beta RDS → validate → prod RDS |
| Run enrichment batch | `DB_HOST` = beta in `.env.local` |
| Touch prod data from script | `ALLOW_PROD_DB=true WEDDING_APP_ENV=prod` |
