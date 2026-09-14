# Venue Details (VenueDetails v3)

Status: In Progress
Started: 2026-09-13 · Last updated: 2026-09-13
Related: ROADMAP.md "Now" (points at STATE.md), docs/decisions.md D060; predecessors
`docs/product/venue-enrichment.md` (the retired automated pipeline) and
`docs/engineering/venue-enrichment/golden-set-template.md` (the locked page format, §7 named this fork)

## TLDR

The venue Details tab is where Dewwey does the heavy organizing for couples: one page that says what a
venue is, what it costs, what the catches are, in the same shape for every venue so A vs B is a real
comparison. Six hand-built golden pages proved what "organized" looks like. This work turns that into
one typed schema (a fixed comparison spine plus a venue-shaped detail layer), a generic renderer, and a
provenance-first loop that fills it for every listed venue from the venue's own website.

## Problem

Couples compare Venue A (all-inclusive, odd policies) with Venue B (à la carte, required vendors) and
the terms don't line up. Today the product shows six rows from a retired pipeline for 109 venues and
nothing for the rest. The hand pages are rich but bespoke: five pricing shapes, five capacity
vocabularies, prose that has to be authored per venue. Nothing is comparable and nothing scales.

## Approach (detail)

Plan of record: `~/.claude/plans/hello-alright-want-to-quizzical-sparrow.md` (approved 2026-09-13);
decision record: D060. In one breath:

- **Schema** `apps/web/lib/venueDetails/types.ts`: a tri-state comparison spine (37 closed-enum/scalar
  fields, every venue, `stated{value,quote,source_url,snapshot_id}` / `not_stated` / `conflicting`),
  capacity as (space, layout, min, max) tuples that never sum rooms, a normalized cost model (archetype,
  pricing paths of fixed fees × day × season, per-guest tiers, minimums, rates, add-ons) behind one
  generic calculator, a `food_beverage` display object, verbatim FAQs, one `resources[]`.
- **Renderer** `apps/web/app/components/venue/*` over the schema in the template's locked formats, with a
  source popover on every stated fact; lab at `/lab/venue` (`?golden=`, `?u=`, `?compare=1`).
- **Loop** `apps/web/scripts/venue-details/*`: discover website → crawl to immutable snapshots (text in
  R2, metadata in DB) → extract (Haiku, two tool calls) → deterministic validation → targeted repair →
  validate → serve as a new version (pointer move) or review. Golden fixtures + the rubric's 15 must-not
  venues are the eval for every prompt version; human corrections are append-only and evidence-bound.
- **Two bars**: `compare_ready` (safe on the checklist; inquire-only counts) and `excellent`
  (compare-ready plus a filled cost path or human verification). Reports show both with the crawl ceiling.
- **Invariants**: unknown beats wrong; specific beats generic; evidence beats inference; comparable beats
  bespoke.

## Non-goals

Compare page and budget planner UI (next missions, they read the spine); browse filters; Playwright or
other JS-rendered crawling; OCR of image-only PDFs (they stay links); Places Photos to R2; re-scoring the
legacy `venue_enrichment` table; editing the `/concept/*` pages; any new env var; a public version-history UI.

## Gotchas

- `venue_enrichment` is keyed on Places `vendors.id`; the listing is keyed on `accounts.id` and ~199
  listed venues have no `vendors` row. Everything new is keyed on `accounts.id` (D060).
- The old pipeline stored page text inside run payloads (140 MB of a 747 MB database). Snapshot text
  goes to R2; Postgres holds metadata and keys only (D007 convention).
- Only 109 of ~475 listed venues have a website on record. The crawl ceiling (JS shells, image-only PDFs)
  is measured and published before any model spend; it is a product number, not a prompt problem.
- Verbatim venue FAQs are kept on the page by decision (D060), an exception to data-plane.md's
  "never republish prose". Hotel-guest FAQ contamination (rubric, CAA pattern) is still filtered.
- Grounding by token coverage cannot see "right page, wrong room" (rubric, Adler). Budget human
  spot-checks for that class every batch.

## Status log

- 2026-09-13 — Plan approved after three review rounds (user, ChatGPT, Grok ×2). D060 written. Phase 0
  docs landed; Phase 1a (types + pure libs + golden fixtures) in progress.
