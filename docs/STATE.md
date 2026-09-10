# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every
working session; history lives in `decisions.md`, preferences in Claude's memory, in-flight
detail nowhere else. If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-10 ~16:15 CT** (after "count honestly" session 2). `origin/main` =
`297ac5e` (pushed 2026-09-09 21:30 CT). Local commits since, NOT pushed: `7972972`, `c2b1893`,
`5b3472f`, `39e29aa`, `c89cdb1`, `9c54d07`, plus this session's final checkpoint. Run
`git log --oneline -8` and `git status` to confirm before trusting this line.

## Mission in flight

**D055 — "squeeze the 47k"**: turn Jeremy's 47,623-post Instagram corpus into as many real,
credible, venue-anchored documented weddings as possible, then write the residue table and move
on. Plan: `~/.claude/plans/i-have-a-prompt-flickering-creek.md` (the "Coverage strategy" section
at the top is the current work; item 1 "count honestly" is approved and mostly done; items 2-8
not approved). Roles (cost rule): Fable strategizes/reviews, Sonnet builds, Haiku reads; the
user spot-checks and says "create" for every batch.

## Numbers (live DB, 2026-09-10 16:10 CT)

| | |
|---|---|
| `weddings` | **5,749** (3,541 at D055 start; 1,484 landed 09-09/10; est. 1-3% duplicate pairs) |
| `wedding_posts` / `wedding_vendors` / `accounts` | 6,560 / 40,675 / 22,941 |
| Batches (revertable by `batch_id`) | b1 13 · b2 60 · b3 651 · b4 371 · b5 641 · rescue 72 · b6 172 · a1-batch1 228 |
| Other provenance tables | `wedding_vendor_recredits` (venuelogic, 189 rows), `account_alias_remaps` (empty until the remap runs) |
| **`/venues` listing** | **595 venues / 5,036 countable weddings** (417 / 4,178 this morning) — role tags refreshed, hotels-as-venues rule, alias cards excluded, 46 location rows added |
| Still hidden from `/venues` | 231 venue accounts with no location row (115 weddings, mostly 0-1 each) · 41 not-metro (54) · 39 mis-anchored on caterers/planners (49) |
| Reader verdicts | user 744 W / 234 N / 20 V · Fable 600 W · Haiku 1,309 W written |
| Pool-B venue-discovery read | 2,013 posts, $11.42: 779 THIS_VENUE (625 ≥0.8), 838 NOT, 396 UNSURE; metro yes 425 / no 252 |
| OpenRouter spend, whole reader effort | ≈ $50.5 |
| Aliases / location-tag map | 58 / 166 |

## Blocked on the user — run these (the auto-mode classifier refuses bulk DB writes)

From `/home/jhoffen/dewwey/apps/web`, in this order (each prints a revert or is additive):

1. `! cd apps/web && bun run scripts/graph/remapWeddingsToCanonicalAccounts.ts --batch-id d055-alias-remap-1 --apply`
   — 243 weddings + 305 credits from alias handles (chicagomuseumevents, post433events,
   cbgweddings, totlspecialevents…) to their canonical accounts. Then re-run
   `refreshAccountRoleTagsFromWeddings.ts --apply` (idempotent) so the alias accounts drop
   their venue vote.
2. `! cd apps/web && bun run scripts/graph/resolveDiscoveredVenues.ts --apply`
   — writes 334 pool-B venue anchors (tier A 313 handle, B 21 name) + 226 new-venue leads.
   Dry-run already reviewed. Then Claude continues: clustering (`runJeremyWeddingClustering.ts
   --evidence-source structural`, then `--eligibility venue-anchor-plus-wedding-keyword
   --clustering-version structural-v3-a1`), reader over the new candidates (~$1.5), web-check
   of metro-yes leads before any account is minted, create dry-run → your "create".
3. Decisions: (a) `/venues` bar — recommend venue-or-hotel top role AND ≥1 documented wedding
   (today 0-wedding venue accounts still list); (b) coverage items 2-5 after 09-11 Apify
   credits; (c) push.

## Next actions (Claude, when unblocked)

1. Pool-B pipeline (item 2 above) → create batch on the user's word.
2. Duplicate merge pass: same couple name at the same venue (16 exact pairs found on 1,230
   named weddings; normalize &/+/and, first names), batch-provenanced, $0.
3. Hand-pass the 19 resolver near-misses (Cafe Brauer, Field Museum, Ritz-Carlton, Navy Pier,
   Skyline Loft → existing accounts) and the 39 mis-anchored weddings (restaurants credited as
   catering: Boka, Sepia, Avec, The Gage — probably real venues; caterers/management — re-anchor).
4. Venue card: show "weddings hosted" (anchored) separately from the any-role feed count;
   church-anchored weddings with a reception venue credited → anchor on the reception.
5. Alias signal S8 (venue caption announces its weddings handle, e.g. `leloftchicago_weddings`).
6. 09-11: Apify crawl of thin venues' own + tagged feeds; vision slice by coverage bucket.
7. Phase 3 residue table — the exit criterion.

## Landmines (things that bit us; check before repeating)

- **`/venues` lists by `v_account_role` (top `account_tags` row) + `account_locations.in_metro`**,
  not by Places rows. Wedding creation must be followed by
  `refreshAccountRoleTagsFromWeddings.ts --apply` or new venues stay invisible.
- The auto-mode classifier blocks bulk `update`/DDL scripts; have the user run them with `!`.
- `runExtract.ts --limit N` selects N posts AFTER excluding already-read ones — a "resume"
  reads N NEW posts. Pass the remaining count, not the original limit.
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
  `tmp_analysis/venue_coverage_2026-09-10.md`), `refreshAccountRoleTagsFromWeddings.ts`,
  `recreditManagementCompany.ts`, `remapWeddingsToCanonicalAccounts.ts`,
  `backfillAccountLocationsFromPlaces.ts`, `backfillVenueLocationsViaWebSearch.ts` (batch 3).
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
