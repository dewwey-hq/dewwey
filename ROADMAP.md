# Roadmap

Single prioritized view across all in-flight and near-term work. Update this file in place — don't create new backlog docs elsewhere. Each item links to its deeper doc rather than duplicating detail. Update the status here whenever a feature doc's Status changes.

**Before starting a thread, check "Now" below** — two sessions colliding on the same in-flight work (this happened with the beta environment setup) is exactly what this section is meant to prevent.

## Now (actively being worked)

- Venue enrichment quality — CAA-pattern hotel-FAQ contamination unresolved (Pass 4: 14/15) — [docs/engineering/venue-enrichment/quality-rubric.md](docs/engineering/venue-enrichment/quality-rubric.md)
- Docs/workflow reorganization (this migration) — [docs/README.md](docs/README.md)

## Next (scoped, queued)

- RDS Proxy — pre-launch hardening before any press/traffic spike — [docs/engineering/scaling.md](docs/engineering/scaling.md)
- Instagram embed Layer 3 — `embed_available` DB column + backfill, so availability doesn't need a live check per render — [docs/product/instagram-embed-todo.md](docs/product/instagram-embed-todo.md)
- Place photo cron automation — [docs/engineering/place-photo-automation-todo.md](docs/engineering/place-photo-automation-todo.md)
- Business model — monetization not yet decided — [docs/strategy/business-model.md](docs/strategy/business-model.md)

## Later / Someday

- Instagram embed Layer 4 — tune "real wedding" heuristics from real venue samples, optional LLM pass on captions
- Sales/vendor-outreach tracking — add `docs/strategy/sales.md` once there's real GTM activity to log

## Recently shipped

- 2026-08-11 — `vendor-search` Lambda (beta + prod) moved off the `postgres` superuser onto a least-privilege, read-only `app_readonly` DB role — [docs/decisions.md](docs/decisions.md) D005
- 2026-07-23 — Beta environment (RDS + Lambda + API Gateway + domain + password gate) — [docs/engineering/beta-environment.md](docs/engineering/beta-environment.md)
- 2026-07-23 — Frontend wired to per-environment vendor API URL (beta vs. prod)
- Venue enrichment Phase 0/0b/1/2 batch — [docs/product/venue-enrichment.md](docs/product/venue-enrichment.md)
- Real weddings Instagram lightbox — [docs/product/real-weddings-lightbox.md](docs/product/real-weddings-lightbox.md)

## Parking lot

Half-formed ideas that don't deserve a doc yet. Promote to "Later" once they have a shape.

- (empty — add as they come up)
