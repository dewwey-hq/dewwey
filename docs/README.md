# docs

One documentation universe for the whole monorepo. Conventions inherited from
Jeremy's repo: append-only `decisions.md` (cite entries by ID), `ROADMAP.md`
at the repo root with a "Now" section.

## Live

- [STATE.md](STATE.md) — **read first**: the one living status page, rewritten at the end of
  every session (mission, live numbers, blocked-on-user, next actions, landmines)
- [engineering/working-across-sessions.md](engineering/working-across-sessions.md) — the
  protocol for daily work across context windows (three tiers of state, session shape, batch
  and on-behalf-review protocols)
- [decisions.md](decisions.md) — append-only decision log (D001–…); D055 is the active mission
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
- [engineering/graph-strengthening/](engineering/graph-strengthening/) — stack
  parser → Jeremy candidates → reconciliation. 143 high-conf ingested (D023);
  268 ambiguous audited and **not** ingested (D030,
  `graph-strengthening/ambiguous-tier-audit-handoff.md`). Non-wedding
  `venue_tagged` posts on serving feeds: 65 retired across two batches,
  `role_shape_v1` locked as a regression test, all 105 hand labels promoted
  into `golden_set` (656 rows) (D040–D042, `graph-strengthening/non-wedding-posts.md`)
- [engineering/human-labeling/](engineering/human-labeling/) — `/label` queues and, since D055,
  the per-post venue review at `/label/candidates` (verdicts → `post_venue_verdicts` →
  `candidate_review_derived` → batched creation with snapshot/revert provenance)
- [engineering/vendor-feed-gap/](engineering/vendor-feed-gap/) — applying the
  parser to Ben's own `posts` (Case A committed D027; Case B declined D031)
- [engineering/places-photos.md](engineering/places-photos.md) — Places photo
  billing mechanics (still applies to the browse UI)
- [engineering/ai-constitution.md](engineering/ai-constitution.md) — standing
  rules for AI work; env/deploy specifics predate the merge, see root CLAUDE.md

## History (retired architecture — don't build against these)

- [history/](history/) — the pre-merge wedding-app README/ROADMAP/docs index,
  beta environment, RDS scaling notes, env machinery, photo-refresh cron plans.
  Kept because the decisions log cites them; superseded by the merge (D006–D008).
