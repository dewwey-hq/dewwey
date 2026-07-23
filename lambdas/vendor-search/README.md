# vendor-search Lambda

HTTP API backend for vendor list + detail. Deploy **prod** and **beta** as separate Lambdas with different `DB_*` env vars (see [docs/engineering/environments.md](../../docs/engineering/environments.md)).

## Prod

- **Function:** `wedding-app-vendor-search`
- **API:** `https://kfln0omb31.execute-api.us-east-1.amazonaws.com`
- **Routes:** `GET /vendors`, `GET /vendors/{id}`
- **DB:** `wedding-app-prod-db` (via Lambda env vars)

## Beta

- **Function:** `wedding-app-vendor-search-beta`
- **API:** `https://rm4ubmuksa.execute-api.us-east-1.amazonaws.com`
- **Routes:** `GET /vendors`, `GET /vendors/{id}`
- **DB:** `wedding-app-beta-db` (via Lambda env vars)
- **Vercel env:** `NEXT_PUBLIC_VENDOR_API_URL=https://rm4ubmuksa.execute-api.us-east-1.amazonaws.com/vendors` (Preview)

## Deploy / update code

From repo root:

```bash
cd lambdas/vendor-search
npm ci --omit=dev
zip -r function.zip index.js node_modules package.json package-lock.json
```

Upload `function.zip` to the target Lambda (AWS Console → Lambda → Upload from `.zip`, or AWS CLI):

```bash
# Prod
aws lambda update-function-code \
  --function-name wedding-app-vendor-search \
  --zip-file fileb://function.zip

# Beta
aws lambda update-function-code \
  --function-name wedding-app-vendor-search-beta \
  --zip-file fileb://function.zip
```

After code upload, confirm environment variables on each function:

| Variable | Prod | Beta |
|----------|------|------|
| `DB_HOST` | prod RDS endpoint | beta RDS endpoint |
| `DB_PORT` | `5432` | `5432` |
| `DB_NAME` | `postgres` | `postgres` |
| `DB_USER` | `postgres` | `postgres` |
| `DB_PASSWORD` | (secret) | (secret) |

## API Gateway notes

Prod uses HTTP API `kfln0omb31`; beta uses `rm4ubmuksa`. For vendor detail (`GET /vendors/{id}`), API Gateway needs a route with `{id}` path param and a Lambda resource policy allowing invoke on `/vendors/*`.

## Smoke test

```bash
# Prod
curl "https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors?limit=1&city=Chicago"
curl "https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors/7"

# Beta
curl "https://rm4ubmuksa.execute-api.us-east-1.amazonaws.com/vendors?limit=1&city=Chicago"
curl "https://rm4ubmuksa.execute-api.us-east-1.amazonaws.com/vendors/7"
```
