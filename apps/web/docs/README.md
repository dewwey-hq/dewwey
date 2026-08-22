# Docs index

Single source of truth for product, business, and engineering — for you and for any AI tool working in this repo. Read `AGENTS.md`'s "Start Here" section first if you haven't.

## Where to look

- **`ROADMAP.md`** (repo root) — what's actively being worked on right now. Check "Now" before starting a thread.
- **`docs/decisions.md`** — running log of non-obvious/expensive-to-rederive decisions. Skim the top 5-10 before touching a related area.
- **`docs/product/`** — what we're building and why (feature/initiative specs, roadmap-level detail).
- **`docs/engineering/`** — how it's built and run (architecture, infra, environments, deploy, scaling, QA/verification).
- **`docs/strategy/`** — business strategy (business model, pricing, GTM — founder-authored, not AI-generated).
- **`docs/bugs/`** — individual bugs live in GitHub Issues. This folder only holds *recurring patterns* worth documenting once fixed twice.

## Doc pattern

Every substantial doc leads with a short **TLDR** (plain language, for a human skim) followed by full **detail** (for an agent picking up related work — architecture specifics, gotchas, resource IDs). One file, not two — see `docs/engineering/beta-environment.md` for a worked example.

## Product

- [`venue-enrichment.md`](product/venue-enrichment.md) — why we aggregate venue data beyond Google Places, what fields matter, phased rollout
- [`real-weddings-lightbox.md`](product/real-weddings-lightbox.md) — Instagram embed lightbox feature
- [`instagram-embed-todo.md`](product/instagram-embed-todo.md) — Instagram embed fix checklist
- [`TEMPLATE.md`](product/TEMPLATE.md) — start any new feature/initiative doc from here

## Engineering

- [`ai-constitution.md`](engineering/ai-constitution.md) — standing rules for AI tools (and humans) working in this repo: architecture, security, database, AI workflow, deployment
- [`environments.md`](engineering/environments.md) — prod/beta architecture, git→Vercel promotion, AWS setup
- [`env.example`](engineering/env.example) — env var template
- [`scaling.md`](engineering/scaling.md) — current bottlenecks, fix tiers (RDS Proxy, etc.)
- [`beta-environment.md`](engineering/beta-environment.md) — the beta stack: what's live, gotchas
- [`places-photos.md`](engineering/places-photos.md) — Places photo cost/caching architecture and debug checklist
- [`place-photo-automation-todo.md`](engineering/place-photo-automation-todo.md) — future automation for photo refresh
- [`venue-enrichment/`](engineering/venue-enrichment/) — data-plane architecture + QA/verification framework for enrichment
  - [`README.md`](engineering/venue-enrichment/README.md), [`data-plane.md`](engineering/venue-enrichment/data-plane.md), [`quality-rubric.md`](engineering/venue-enrichment/quality-rubric.md), `score-pass-*.md`

## Strategy

- [`business-model.md`](strategy/business-model.md) — business model template (fill in as decided)

## Using this with tools that can't read the repo

**ChatGPT / other no-repo-access tools:** paste `ROADMAP.md` plus the specific relevant doc(s) at the start of a planning session. Don't maintain a separate digest file for this — it becomes a second thing to keep in sync.
