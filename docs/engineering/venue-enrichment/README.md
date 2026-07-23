# Venue enrichment — engineering

## TLDR

The "how it's built and verified" half of venue enrichment. For "why we aggregate this data and what fields matter," see [`docs/product/venue-enrichment.md`](../../product/venue-enrichment.md) instead — that's the product-facing story this folder implements and verifies.

## Contents

- [`data-plane.md`](data-plane.md) — storage/schema architecture: source vs. derived vs. serving layers, provenance design
- [`quality-rubric.md`](quality-rubric.md) — the QA/verification framework: field/column/venue scoring, automated grounding + repeatability checks, ship gates
- [`score-pass-1.md`](score-pass-1.md), [`score-pass-2.md`](score-pass-2.md), [`score-pass-3.md`](score-pass-3.md) — dated scorecard runs against the rubric

Run a new scoring pass by following the steps in `quality-rubric.md`; add the result as `score-pass-N.md` and link it from the rubric's "Pass history" section.
