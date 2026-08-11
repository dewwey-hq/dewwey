# Database Migrations

Migrations are plain SQL files run manually against the RDS instance. They are numbered sequentially and **never edited after being run** — if you need to change something, write a new migration.

## Running a migration

**Beta first**, then prod. See [docs/engineering/environments.md](../../docs/engineering/environments.md).

```bash
# Beta
psql \
  -h wedding-app-beta-db.CHANGE_ME.us-east-1.rds.amazonaws.com \
  -U postgres \
  -d postgres \
  -f scripts/migrations/001_vendor_relationships.sql

# Prod (after beta validation)
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
| `002_vendor_social_links.sql` | Adds `vendor_social_links` (social URLs extracted from vendor websites) and `instagram_posts` (posts scraped via Apify) tables |
| `003_instagram_posts_fields.sql` | Adds `post_timestamp`, `image_url`, `likes_count`, `owner_username` to `instagram_posts` |
| `004_instagram_posts_mentions.sql` | Adds `mentions`, `hashtags`, `post_type`, `images` to `instagram_posts` — mentions replaces caption parsing for vendor relationship graph |
| `005_instagram_posts_media_dimensions.sql` | Adds `media_width`, `media_height` to `instagram_posts` for accurate Instagram embed sizing |
| `006_venue_enrichment.sql` | Adds `venue_extraction_runs` (versioned rules/LLM payloads) and `venue_enrichment` (current serving row + indexed capacity/catering/`needs_review`) |
| `007_create_readonly_app_role.sql` | Creates `app_readonly`, a non-superuser, SELECT-only role for the vendor-search Lambda. Not a schema change — run it once per RDS instance. See D005. |

**Related ops (not SQL):** venue website photos use Places photo names that expire — see [docs/engineering/places-photos.md](../../docs/engineering/places-photos.md) and `npm run refresh-place-photos`.

## Rules

- Number files sequentially: `001_`, `002_`, etc.
- Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so migrations are safe to re-run.
- Never edit a migration that has already been run in production — write a new one.
