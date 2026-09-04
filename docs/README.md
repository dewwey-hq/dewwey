# docs

One documentation universe for the whole monorepo. Conventions inherited from
Jeremy's repo: append-only `decisions.md` (cite entries by ID), `ROADMAP.md`
at the repo root with a "Now" section.

## Live

- [decisions.md](decisions.md) — append-only decision log (D001–…)
- [merge-eval.md](merge-eval.md) — evaluation of Jeremy's wedding-app and the
  case for the merge; the schema/scraping analysis behind D006
- [jeremy-ddl.sql](jeremy-ddl.sql) — schema-only dump of his beta RDS tables
- [pipeline-plan.md](pipeline-plan.md) — crawler/parser plan (TS port pending)
- [strategy/business-model.md](strategy/business-model.md)
- [product/](product/) — feature docs (venue enrichment, lightbox, embeds)
- [engineering/venue-enrichment/](engineering/venue-enrichment/) — the
  venue-website extraction data plane (adopted wholesale in the merged schema)
- [engineering/post-classification/](engineering/post-classification/) — the
  AI-native pipeline deciding which of the ~45k staged Instagram posts are
  credible real Chicago weddings (D009)
- [engineering/places-photos.md](engineering/places-photos.md) — Places photo
  billing mechanics (still applies to the browse UI)
- [engineering/ai-constitution.md](engineering/ai-constitution.md) — standing
  rules for AI work; env/deploy specifics predate the merge, see root CLAUDE.md

## History (retired architecture — don't build against these)

- [history/](history/) — the pre-merge wedding-app README/ROADMAP/docs index,
  beta environment, RDS scaling notes, env machinery, photo-refresh cron plans.
  Kept because the decisions log cites them; superseded by the merge (D006–D008).
