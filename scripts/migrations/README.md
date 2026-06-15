# Database Migrations

Migrations are plain SQL files run manually against the RDS instance. They are numbered sequentially and **never edited after being run** — if you need to change something, write a new migration.

## Running a migration

```bash
psql \
  -h wedding-app-prod-db.c8zk0w2mm2mu.us-east-1.rds.amazonaws.com \
  -U postgres \
  -d postgres \
  -f scripts/migrations/001_vendor_relationships.sql
```

You'll be prompted for the password (see `.env.local` → `DB_PASSWORD`).

## Migration index

| File | What it does |
|------|-------------|
| `001_vendor_relationships.sql` | Adds `instagram_handle` to vendors; adds `vendor_relationships`, `wedding_stories`, and `wedding_story_vendors` tables for the preferred vendor network and real weddings features |

## Rules

- Number files sequentially: `001_`, `002_`, etc.
- Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so migrations are safe to re-run.
- Never edit a migration that has already been run in production — write a new one.
