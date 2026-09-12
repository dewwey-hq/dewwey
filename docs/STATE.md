# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every
working session; history lives in `decisions.md`, preferences in Claude's memory, in-flight
detail nowhere else. If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-11 ~19:30 CT** (after promoting the D058 feed card). `origin/main` =
`297ac5e` (pushed 2026-09-09). Everything since is LOCAL and NOT pushed — ~50 commits, the
latest `80ae5aa` (D058 promotion). Run `git log --oneline -12` and `git status` to confirm
before trusting this line. No DB writes this session; the numbers below are unchanged.

## Mission in flight — UI (D058, 2026-09-11)

The feed card was redesigned in `/lab/feed` and **promoted to production today**: every vendor
page Feed tab and `/weddings` now render `app/components/feed/WeddingCard.tsx` (official
embed.js embed, no crop, stack panel beside it, carousel for multi-post weddings, Caption/Photo
flip). Full write-up: `docs/decisions.md` D058. Verified with headless screenshots at 1280 and
400 on `/vendors/bridgeportartcenter`, `/vendors/abefernandez.fotos`, `/weddings`.
**Not yet deployed**: nothing is pushed; production (dewwey.com) still runs the old card.
Next UI round (user's call): the venue detail page around the card (`/lab/venue`), then the
homepage `HeroStack`. Data follow-ups that improve the card: word-splitter for run-together
handles; real names/avatars via profile scrape (Apify credits).

## Data mission (paused while UI ran)

**D055 — "squeeze the 47k"**: turn Jeremy's 47,623-post Instagram corpus into as many real,
credible, venue-anchored documented weddings as possible, then write the residue table and move
on. Plan: `~/.claude/plans/i-have-a-prompt-flickering-creek.md` (the "Coverage strategy" section
at the top: **D056 stages 0-3 done + maintenance batch**; coverage item 1 done, items 2-8
not approved). Roles (cost rule): Fable strategizes/reviews, Sonnet builds, Haiku reads; the
user spot-checks and says "create" for every batch.

## Numbers (live DB, 2026-09-10 18:40 CT)

| | |
|---|---|
| `weddings` | **5,972** (3,541 at D055 start; 46 duplicates merged 2026-09-11) |
| `wedding_posts` / `wedding_vendors` / `accounts` | 6,842 / 51,275 / 22,974 |
| D056 tables | `wedding_vendor_credits` 43,500 · `wedding_participants` 74 · `ceremony_venue_id` on 63 · `vendor_roles` 54 · `wedding_merges` 46 · `accounts.venue_type` on 1,037 · `edges` 144,413 |
| Batches (revertable by `batch_id`) | b1 13 · b2 60 · b3 651 · b4 371 · b5 641 · rescue 72 · b6 172 · a1-batch1 228 · **poolb-v2 202 · poolb-a1 67** |
| Other provenance tables | `wedding_vendor_recredits` (venuelogic, 189), `account_alias_remaps` (548, alias remap applied) |
| **`/venues` listing** | **476 venues / 5,523 countable weddings** — bar = venue/accommodations top role AND ≥1 documented wedding (user, 09-11); 626 tagged venues would list without the bar |
| Still hidden from `/venues` | 268 venue accounts with no location row (93 weddings) · 39 not-metro · 22 mis-anchored (36; 17 in the re-anchor human queue) · 150 zero-wedding venue accounts (by the bar) |
| Reader verdicts | user 744 W / 234 N / 20 V · Fable 600 W · Haiku 1,309 W written |
| Pool-B venue discovery | 2,013 posts read ($11.42) → 334 resolver anchors + 54 hand-mapped + 18 new venues → 269 weddings; 226 leads: 44 existing, 18 new, 15 not metro, 40 unclear |
| OpenRouter spend, whole reader effort | $42.95 (`post_extraction_runs.cost_usd`, 6,393 posts read) |
| Aliases / location-tag map | 58 / 166 |

## Blocked on the user

1. Apify credits (09-11): coverage items 1-2 (vision slice on ~11,300 image-only venue-anchored
   posts, ~$57; own + tagged crawl of ~99 thin venues, ~$50).
2. Re-anchor human queue: 17 weddings anchored on caterers/planners/photographers with no
   alternative credit (list in the `d056-reanchor-1` output; e.g. ashyanabanquets ×4, venuelogic
   ×3, blueplatechicago, boweryandbash) — `/label/candidates?post=` on their posts.
3. Bulk DB writes are refused by the auto-mode classifier; run Claude's `!` commands from
   `apps/web` (your shell usually sits there already).

## Next actions (Claude, when unblocked)

0. UI: on the user's word, push a `d058-card` branch for a Vercel preview (real-phone check),
   then `main`. Then `/lab/venue` for the venue detail page. Screenshot tooling: memory
   `headless-chromium-screenshots` + the CDP script pattern (`shot.ts`, session scratchpad —
   recreate from that memory if needed).
1. Reader `extract-v1.3` with `credits[]` in the D056 vocabulary for the 1,536 documented
   weddings with no labeled stack (mention inference covered 362 posts) — ~$2, approval.
2. 68 mention-inferred credits still without a `wedding_vendors` row (small; find why).
3. Venue-type rules round 2 (341 "other": City Cruises, whirlyball, wisconsinunion…) and the
   `/venues` type chips in the toolbar.
4. Coverage items 1-2 when Apify credits land.

## Landmines (things that bit us; check before repeating)

- Instagram embeds: never crop/overlay/resize the frame (Meta terms); embed.js sets a 12px
  bottom margin on its iframe and reports its own (sometimes wrong) height; an unprocessed
  blockquote is 56px tall — hold the placeholder height or lazy-mounting cascades down the
  page. Headless screenshots need real-time waits (CDP), not `--virtual-time-budget`.
- **`/venues` lists by `v_account_role` (top `account_tags` row) + `account_locations.in_metro`**,
  not by Places rows. Wedding creation must be followed by
  `refreshAccountRoleTagsFromWeddings.ts --apply` or new venues stay invisible. The refresh gives
  the venue role an anchor bonus and the view breaks ties toward venue (D056).
- A migration is verified only after its LOGGED inserts are reconciled against the pre-run snapshot
  (pass 1 logged 4,037 no-op inserts whose revert would have deleted real venue credits).
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

- Feed card (production): `app/components/feed/WeddingCard.tsx` (+ `InstagramPostEmbed`,
  `FallbackCard`, `VendorAvatar`, `embed-script`, `measurement-context`, `cardLayout`);
  helpers `lib/feedDesign.ts` (+test, 51). Lab: `app/lab/feed` (Card wrapper with URL knobs,
  `/lab/feed/swatch` for micro-decisions). Old `WeddingFeedCard` deleted; `InstagramEmbed.tsx`
  (old primitive) remains for labeling tools + concept pages only.
- Decision log: `docs/decisions.md` (D056 at the top with its stages 1-2 addendum; D055 closed with
  the residue table).
- Coverage: `scripts/graph/reportVenueCoverage.ts` (standing metric; output in
  `tmp_analysis/venue_coverage_2026-09-10.md`), `refreshAccountRoleTagsFromWeddings.ts` (run
  after EVERY batch), `recreditManagementCompany.ts`, `remapWeddingsToCanonicalAccounts.ts`,
  `backfillAccountLocationsFromPlaces.ts`, `backfillVenueLocationsViaWebSearch.ts` (batch 3),
  `applyPoolBLeadMap.ts` + `tmp_analysis/poolb_lead_map_2026-09-10.json`.
- D056: `vendorRoleRules.ts` (+test), `applyVendorTaxonomySchema.ts`, `migrateVendorRolesV2.ts` (+`vendorRoleMigration.ts`, test),
  `fixMigrationProvenance.ts`, `reanchorWeddings.ts`, `mergeDuplicateWeddings.ts`, `seedVenueTypes.ts` (+`weddingMaintenance.ts`, test),
  `runStackParserV10.ts --refresh-matching`; provenance in `vendor_role_migrations` (batches d056-migration-1/2,
  d056-reanchor-1, d056-venue-type-1) and `wedding_merges` (d056-dedupe-1),
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
