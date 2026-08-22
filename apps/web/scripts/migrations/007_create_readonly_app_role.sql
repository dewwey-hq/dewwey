-- Least-privilege role for the vendor-search Lambda (read-only production traffic).
-- The app has no write path today (no user accounts, no in-UI create/update) — the
-- Lambda only SELECTs. It should not be able to connect as the `postgres` superuser,
-- which bypasses row-level security by default and can drop/alter anything.
--
-- This script contains no secret: the password is supplied at run time via a psql
-- variable, e.g.
--
--   psql -h <host> -U postgres -d postgres \
--     -v app_readonly_password="$(openssl rand -base64 24)" \
--     -f scripts/migrations/007_create_readonly_app_role.sql
--
-- Save the generated password directly into the Lambda's environment config
-- (AWS Console / `aws lambda update-function-configuration`) — do not put it in any
-- file in this repo, tracked or not.
--
-- Run beta first, validate, then prod (see docs/engineering/environments.md).

-- psql does not substitute :'vars' inside dollar-quoted (DO $$ ... $$) blocks,
-- so build the CREATE ROLE statement as a string and run it via \gexec instead.
SELECT 'CREATE ROLE app_readonly LOGIN PASSWORD ''' || :'app_readonly_password' ||
       ''' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_readonly')
\gexec

GRANT CONNECT ON DATABASE postgres TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

-- So tables added by future migrations (run as postgres) are readable without
-- a manual GRANT each time.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
