# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every
working session; history lives in `decisions.md`, preferences in Claude's memory, in-flight
detail nowhere else. If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-11 ~01:05 CT** (after the D056 stage-2 migration). `origin/main` =
`297ac5e` (pushed 2026-09-09 21:30 CT). Local commits since, NOT pushed: `7972972`, `c2b1893`,
`5b3472f`, `39e29aa`, `c89cdb1`, `9c54d07`, `8b9d5d0`, `8ee9aa3`, `fba7e0a`, plus tonight's
checkpoint. Run `git log --oneline -12` and `git status` to confirm before trusting this line.

## Mission in flight

**D055 — "squeeze the 47k"**: turn Jeremy's 47,623-post Instagram corpus into as many real,
credible, venue-anchored documented weddings as possible, then write the residue table and move
on. Plan: `~/.claude/plans/i-have-a-prompt-flickering-creek.md` (the "Coverage strategy" section
at the top: **D056 stages 0-2 done, stage 3 UI next**; coverage item 1 done, items 2-8
not approved). Roles (cost rule): Fable strategizes/reviews, Sonnet builds, Haiku reads; the
user spot-checks and says "create" for every batch.

## Numbers (live DB, 2026-09-10 18:40 CT)

| | |
|---|---|
| `weddings` | **6,018** (3,541 at D055 start; +2,477; est. 1-3% duplicate pairs) |
| `wedding_posts` / `wedding_vendors` / `accounts` | 6,842 / 49,487 / 22,974 |
| D056 tables | `wedding_vendor_credits` 42,656 · `wedding_participants` 82 · `ceremony_venue_id` set on 63 · `vendor_roles` 54 · `edges` 141,714 |
| Batches (revertable by `batch_id`) | b1 13 · b2 60 · b3 651 · b4 371 · b5 641 · rescue 72 · b6 172 · a1-batch1 228 · **poolb-v2 202 · poolb-a1 67** |
| Other provenance tables | `wedding_vendor_recredits` (venuelogic, 189), `account_alias_remaps` (548, alias remap applied) |
| **`/venues` listing** | **626 venues / 5,564 countable weddings** (417 / 4,178 on the morning of 09-10) — role tags from wedding credits (+anchor bonus, venue tie-break), hotels/accommodations-as-venues rule, alias cards excluded, 64 location rows added, 18 new venues minted |
| Still hidden from `/venues` | 268 venue accounts with no location row (93 weddings) · 39 not-metro (45) · 26 mis-anchored (41) · 105 old weddings whose anchored venue has no credit row |
| Reader verdicts | user 744 W / 234 N / 20 V · Fable 600 W · Haiku 1,309 W written |
| Pool-B venue discovery | 2,013 posts read ($11.42) → 334 resolver anchors + 54 hand-mapped + 18 new venues → 269 weddings; 226 leads: 44 existing, 18 new, 15 not metro, 40 unclear |
| OpenRouter spend, whole reader effort | $42.95 (`post_extraction_runs.cost_usd`, 6,393 posts read) |
| Aliases / location-tag map | 58 / 166 |

## Blocked on the user

1. **D056 stage 3 (UI)** — separate approval: context chips on wedding stacks ("Reception venue",
   "Getting-ready hotel"), vendor page "credited as" + per-wedding role in "worked with", venue
   page hosted vs also-credited, `/vendors` browse by category, `/venues` `venue_type` filter.
2. Decisions: (a) `/venues` bar (recommend venue/accommodations top role AND ≥1 documented
   wedding; 150 zero-wedding venues still list); (b) coverage items 2-5 after Apify credits
   (09-11): thin-venue text read + vision slice, own + tagged crawl; (c) push of the local commits
   (17 unpushed).
3. Bulk DB writes are refused by the auto-mode classifier; run Claude's `!` commands from
   `apps/web`.

## Next actions (Claude, when unblocked)

1. D056 stage 3 UI on approval; reader `extract-v1.3` with `credits[]` in the D056 vocabulary
   for the 1,838 weddings with no labeled stack (mention inference covered 365 posts).
2. Re-anchor pass: 26 mis-anchored accounts (41 weddings) + 105 old weddings whose anchored venue
   has no credit row; seed `accounts.venue_type` (house_of_worship/hotel/restaurant/…).
3. Duplicate merge pass using `wedding_participants` (same bride/groom handles = same wedding).
4. 09-11: Apify crawl of thin venues' own + tagged feeds; vision slice by coverage bucket.

## Landmines (things that bit us; check before repeating)

- **`/venues` lists by `v_account_role` (top `account_tags` row) + `account_locations.in_metro`**,
  not by Places rows. Wedding creation must be followed by
  `refreshAccountRoleTagsFromWeddings.ts --apply` or new venues stay invisible. The refresh gives
  the venue role an anchor bonus and the view breaks ties toward venue (D056).
- `vendor_role` enum is now the D056 vocabulary (`beauty_services`, `jewelry`, `photo_booth`,
  `live_music`, 30 new values; `hotel` retired from use). Any script inserting roles must use it.
- A dev-server 500 on `/venues` after a role change usually means a text literal compared to the
  enum that is not (yet) a value — cast `var.role::text`.
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

- Decision log: `docs/decisions.md` (D056 at the top with its stages 1-2 addendum; D055 closed with
  the residue table).
- Coverage: `scripts/graph/reportVenueCoverage.ts` (standing metric; output in
  `tmp_analysis/venue_coverage_2026-09-10.md`), `refreshAccountRoleTagsFromWeddings.ts` (run
  after EVERY batch), `recreditManagementCompany.ts`, `remapWeddingsToCanonicalAccounts.ts`,
  `backfillAccountLocationsFromPlaces.ts`, `backfillVenueLocationsViaWebSearch.ts` (batch 3),
  `applyPoolBLeadMap.ts` + `tmp_analysis/poolb_lead_map_2026-09-10.json`.
- D056: `vendorRoleRules.ts` (+test), `applyVendorTaxonomySchema.ts`, `migrateVendorRolesV2.ts` (+`vendorRoleMigration.ts`, test),
  revert SQL printed by the migration (provenance `vendor_role_migrations`, batch `d056-migration-1`),
  `stackParser.ts` `parseCaptionV2` (+`stackParserV2.test.ts`), `runStackParserV10.ts`,
  `applyStackEntriesV2Schema.ts` (tables `stack_extraction_entries_v2`, `stack_extraction_runs_v2`),
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
