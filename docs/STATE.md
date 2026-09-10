# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every
working session; history lives in `decisions.md`, preferences in Claude's memory, in-flight
detail nowhere else. If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-10 ~18:45 CT** (after the pool-B batches). `origin/main` =
`297ac5e` (pushed 2026-09-09 21:30 CT). Local commits since, NOT pushed: `7972972`, `c2b1893`,
`5b3472f`, `39e29aa`, `c89cdb1`, `9c54d07`, `8b9d5d0`, `8ee9aa3`, `fba7e0a`, plus tonight's
checkpoint. Run `git log --oneline -12` and `git status` to confirm before trusting this line.

## Mission in flight

**D055 — "squeeze the 47k"**: turn Jeremy's 47,623-post Instagram corpus into as many real,
credible, venue-anchored documented weddings as possible, then write the residue table and move
on. Plan: `~/.claude/plans/i-have-a-prompt-flickering-creek.md` (the "Coverage strategy" section
at the top: **D056 vendor-stack nomenclature approved 2026-09-10, stage 0 next**; coverage item 1 done, items 2-8
not approved). Roles (cost rule): Fable strategizes/reviews, Sonnet builds, Haiku reads; the
user spot-checks and says "create" for every batch.

## Numbers (live DB, 2026-09-10 18:40 CT)

| | |
|---|---|
| `weddings` | **6,018** (3,541 at D055 start; +2,477; est. 1-3% duplicate pairs) |
| `wedding_posts` / `wedding_vendors` / `accounts` | 6,842 / 41,038 / 22,974 |
| Batches (revertable by `batch_id`) | b1 13 · b2 60 · b3 651 · b4 371 · b5 641 · rescue 72 · b6 172 · a1-batch1 228 · **poolb-v2 202 · poolb-a1 67** |
| Other provenance tables | `wedding_vendor_recredits` (venuelogic, 189), `account_alias_remaps` (548, alias remap applied) |
| **`/venues` listing** | **612 venues / 5,546 countable weddings** (417 / 4,178 this morning) — role tags refreshed, hotels-as-venues rule, alias cards excluded, 64 location rows added, 18 new venues minted |
| Still hidden from `/venues` | 233 venue accounts with no location row (80 weddings) · ~41 not-metro · 36 mis-anchored on caterers/planners (49) |
| Reader verdicts | user 744 W / 234 N / 20 V · Fable 600 W · Haiku 1,309 W written |
| Pool-B venue discovery | 2,013 posts read ($11.42) → 334 resolver anchors + 54 hand-mapped + 18 new venues → 269 weddings; 226 leads: 44 existing, 18 new, 15 not metro, 40 unclear |
| OpenRouter spend, whole reader effort | $42.95 (`post_extraction_runs.cost_usd`, 6,393 posts read) |
| Aliases / location-tag map | 58 / 166 |

## Blocked on the user

1. **D056 stage 0 is done** — settle the 20 judgment calls in
   `apps/web/scripts/graph/tmp_analysis/d056_golden_disagreements.csv` (fill `your_call`), then stage 1 (parser v10) can start. Stage 2 migration later needs your "run it".
2. Decisions: (a) `/venues` bar — recommend venue-or-hotel top role AND ≥1 documented
   wedding (today 0-wedding venue accounts still list, 148 of them); (b) coverage items 2-5
   after 09-11 Apify credits (thin-venue text read + vision slice; own + tagged crawl);
   (c) push of the local commits.
3. Bulk DB writes are refused by the auto-mode classifier; when Claude hands you a `!`
   command, run it from `apps/web` (your shell already sits there).

## Next actions (Claude, when unblocked)

1. **D056 stage 1** after the user settles the disagreements: parser v10 (Sonnet), additive re-parse,
   coverage report; stage 2 migration dry-run on the local Docker copy.
2. Phase 3 residue table for D055 (numbers are in the newest addendum) — the exit criterion.
3. Duplicate merge pass (same couple at the same venue; participants table in D056 will make
   this exact) — $0.
4. 36 mis-anchored weddings (restaurants credited as catering are probably real venues;
   caterers/management re-anchor) and the 5 lead-map handles with no account row.
5. 09-11: Apify crawl of thin venues' own + tagged feeds; vision slice by coverage bucket.

## Landmines (things that bit us; check before repeating)

- **`/venues` lists by `v_account_role` (top `account_tags` row) + `account_locations.in_metro`**,
  not by Places rows. Wedding creation must be followed by
  `refreshAccountRoleTagsFromWeddings.ts --apply` or new venues stay invisible.
- The auto-mode classifier blocks bulk `update`/DDL scripts; have the user run them with `!`.
- `runExtract.ts --limit N` selects N posts AFTER excluding already-read ones — a "resume"
  reads N NEW posts. Pass the remaining count, not the original limit. **Corpus reads need
  `--write-verdicts`** or nothing reaches creation (replay: `writeVerdictsFromExtractionRuns.ts`).
- Watchers that `pgrep -f` a pattern match their own shell; pgrep the `^bun run …` command.
- `vendors.city` DEFAULTS to `'Chicago'` — evidence only with `discovery_source='google_places'`.
- Brand-level handles (`marriottbonvoy`, `trumphotels`, `intercontinental`) can carry one
  property's Places row; never a venue location on the brand alone.
- Venue accounts that post promotions ("Wedding Cake Wednesday", "now booking 2026") are thin
  because nothing was fetched for them; check corpus supply before suspecting the reader.
- Vendor pages count a venue's weddings in ANY role (Biagio 2 venue + 1 planner + 1 other = 4;
  Congress Plaza 3 hosted vs 6 in feed). `weddings.event_date_est` is the POST date.
- A "chicago" inside a hashtag is a vendor's market, not the wedding's location. Venue decides.
- Per-candidate work must scope `stack_extraction_entries` by `post_url` first.
- Pooled Postgres backends can carry a leftover `temp table` — `drop table if exists` first.
- SQL inside JS template literals eats `\y` / `\s`; perl one-liners eat `${}` in TS templates.
- `candidate_review_derived.included_post_urls` holds THIS_VENUE posts only.
- `createWeddingsFromJeremyEvidence.ts` only sees `structural-v2` unless `--clustering-version`;
  author-anchored candidates need `--author-min-confidence 0.9`.
- Six DB tests need 120 s; re-pin literals by grepping `toBe(<old>)` (same literal in two blocks).
- The model's NOT_WEDDING / OTHER_VENUE calls are NOT reliable; only its W at ≥0.8 is written.
- Early golden WEDDING labels include marketing slips; a golden label proposes, the queue confirms.

## Where things live

- Decision log: `docs/decisions.md` (D055; newest addenda "A1 batch + coverage audit", "Count
  honestly", "Count honestly, session 2").
- Coverage: `scripts/graph/reportVenueCoverage.ts` (standing metric; output in
  `tmp_analysis/venue_coverage_2026-09-10.md`), `refreshAccountRoleTagsFromWeddings.ts` (run
  after EVERY batch), `recreditManagementCompany.ts`, `remapWeddingsToCanonicalAccounts.ts`,
  `backfillAccountLocationsFromPlaces.ts`, `backfillVenueLocationsViaWebSearch.ts` (batch 3),
  `applyPoolBLeadMap.ts` + `tmp_analysis/poolb_lead_map_2026-09-10.json`.
- D056 taxonomy: `docs/decisions.md` D056 + plan file section; `scripts/graph/vendorRoleRules.ts` (+test),
  `reportLabelCoverage.ts`; `tmp_analysis/d056_labels_v9.csv`, `d056_label_map.csv`, `d056_golden_sample.csv`, `d056_golden_disagreements.csv`.
- Review UI: `/label/candidates` (`?spotcheck=<reviewer>&n=20`, `?post=a,b,c`).
- Provenance: `jeremy_weddings_created.batch_id`, `jeremy_wedding_post_attachments`,
  `wedding_vendor_recredits`, `account_alias_remaps`; `snapshotGraphTables.ts`,
  `revertWeddingBatch.ts`.
- Tests: `bunx vitest run scripts/graph/*.test.ts scripts/classify/*.test.ts --testTimeout=120000 --hookTimeout=120000`.
- Reader: `scripts/classify/extractPrompt.ts`, `runExtract.ts` (`--mode calibration|corpus|
  venue-calibration|pool-b`, `--escalate-band`, `--only-this-venue`, `--clustering-version`,
  `--max-cost-usd`); results in `post_extraction_runs`.
- Venue discovery: `resolveDiscoveredVenues.ts`, `discoveredVenueLeads.ts`,
  `extracted_venue_anchors`, `discovered_venue_leads`; aliases `applyAccountAliasesSchema.ts`
  + `findVenueAliasCandidates.ts`.
- OpenRouter: `NEW_OPENROUTER_API_KEY` in `apps/web/.env.local` (never print it).
