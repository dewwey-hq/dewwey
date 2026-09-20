# f1, before the `no_junk_vendor_names` fix

Kept as evidence, not as a second tick. These two files are the f1 run over all **30** targeted
venues, as it stood when the universal must-not gate first failed:

- `mustnot.md` — the failing gate: 6 venues, 8 flagged vendor entries. Five of the eight
  ("Bittersweet", "Marryment", "Limelight" ×2, "Shutterbooth", "Tablescapes") are real one-word
  Chicago businesses whose own domain vouches for them; the rule judged names by length alone and
  therefore also missed 4 of the 7 category headings `@salvatoreschicago` had ingested as vendors.
- `coverage.md` — the crawl coverage for all 30 (the served run's copy covers only the 27 served).
- `validate-2.md` — the second validation pass over all 30.

The fixed rule and the re-run live in `../f1/`; the reasoning is in `docs/decisions.md` D060,
addendum 2026-09-20 (Phase 3 fill tick f1), and the row in `../../ticks.md`.
