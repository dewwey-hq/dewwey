# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every
working session; history lives in `decisions.md`, preferences in Claude's memory, in-flight
detail nowhere else. If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-10 ~00:45 CT** (after the A1 batch). `origin/main` = `297ac5e`
(pushed 2026-09-09 21:30 CT). Local commits since, NOT pushed: `7972972`, `c2b1893`,
`5b3472f`, plus this session's checkpoint (A1 batch + docs). Run `git log --oneline -6` and
`git status` to confirm before trusting this line.

## Mission in flight

**D055 — "squeeze the 47k"**: turn Jeremy's 47,623-post Instagram corpus into as many real,
credible, venue-anchored documented weddings as possible, then write the residue table and move
on. Plan: `~/.claude/plans/i-have-a-prompt-flickering-creek.md` (approved 2026-09-08; the
newest sections — coverage strategy, alias detection, geography leak, parser backlog — sit at
the top of that file). Phase 0 done; Phase 1 (reader + batched creation) is the active loop;
the strong push (stages 1-3) is executed; **the coverage strategy is analysed, not approved.**

Roles the user set (cost rule, 2026-09-09): **Fable** strategizes, writes prompts/evals,
reviews numbers, decides what enters creation — never bulk-reads posts; **Sonnet 5**
subagents build; **Haiku 4.5** reads every post (`scripts/classify/runExtract.ts`, prompt
`extract-v1.2`, 0.5-0.8 band escalated to Sonnet); the user labels breadth, spot-checks blind,
and says "create" for every batch (the A1 batch was pre-approved: "create when the read
finishes").

## Numbers (live DB, 2026-09-10 00:40 CT)

| | |
|---|---|
| `weddings` | **5,749** (3,541 at D055 start; +2,208; 1,484 of those landed 09-09/10) |
| `wedding_posts` / `wedding_vendors` / `accounts` | 6,560 / 40,674 / 22,941 |
| Batches (all revertable by `batch_id`) | b1 13 · b2 60 · b3 651 · b4 371 · b5 641 · rescue 72 (+65 attachments) · b6 172 · **a1-batch1 228** |
| Candidates | 9,000 total; structural-v2 4,230; structural-v3-a1 1,250 |
| Verdicts, user (`jeremy`) | 744 W / 234 N / 20 V (incl. 222 blind spot-checks: 96.8% agreement; ≥0.9 band 98.4%, 0.8-0.9 band 88.2%, author-anchored 83.3%) |
| Verdicts, Fable (`fable-structured`) | 600 W / 296 N / 11 V |
| Verdicts, Haiku (`haiku-extract-v1`, current) | 1,309 W (only THIS_VENUE at ≥0.8 is ever written) |
| Confirmed-venue candidate posts with no verdict | ~2,000 (mostly the reader's NOT/UNSURE, badged in the queue; not a labeling target) |
| Aliases / location-tag map | 58 (rounds 1-7b) / 166 tags |
| Metro Places venues by documented weddings | 11 at 0 · 88 at 1-5 · 50 at 6-15 · 75 at 16+ (top 50 = 70%, top 100 = 90%) |
| OpenRouter spend, whole reader effort | $39.03 (`post_extraction_runs.cost_usd`; pool-B $8 of it so far) |

## In flight right now

- **Pool-B read** (`runExtract.ts --mode pool-b`, log in the session scratchpad
  `poolb_full.log`, ~1,350/2,000, cap $14). When it exits: `resolveDiscoveredVenues.ts
  --dry-run` then `--apply` (tier A handle anchors, tier B name anchors, tier C leads) →
  `runJeremyWeddingClustering.ts --evidence-source structural` (dry-run, real) and the relaxed
  `--eligibility venue-anchor-plus-wedding-keyword --clustering-version structural-v3-a1` →
  reader over the new candidates (~$1.5) → a web-check agent over `discovered_venue_leads`
  with metro-yes votes **before any account is minted** (D052 rule) → dry-run → user's "create".

## Blocked on the user

1. **Coverage strategy** (plan file, "Coverage strategy — analysis 2026-09-10"): items 1-8,
   none approved. Cheapest first: bridge the 27 documented-but-unlisted venue accounts and
   recredit `venuelogic` (free); read the 133 untouched wedding-text posts at 0-5 venues and
   the vision slice ordered by coverage bucket (~$8, after 09-11 Apify); the Apify own+tagged
   crawl of the ~99 thin metro venues (~$50, after 09-11) — the real breadth lever.
2. **Human queue, small and high-value:** ~45 golden-WEDDING posts in confirmed-venue
   candidates with no venue verdict (plan item 7; do not auto-create), plus author-anchored
   reader W in the 0.8-0.9 band at thin venues (e.g. Chicago Theater Works "Thank you
   Timothy"). Needs a `?class=` filter in `/label/candidates` — not built.
3. **Apify credits (2026-09-11)** before the vision slice and the crawl; Vertex/AWS provider
   decision for vision then.
4. Parked approvals in the plan file: parser backlog #1 emoji stacks (615 posts) + #2 event
   keywords; reader-resolved geography for 593 ambiguous venues (~$2.70); the 27-post
   answer-key correction link; alias signal S8 (venue caption announces its weddings handle).

## Next actions (in order, when unblocked)

1. Finish the pool-B pipeline above (no user word needed until the create dry-run).
2. Count honestly (coverage item 1) — free, changes the `/venues` picture without new data.
3. Build the `?class=` queue filter and serve the ~45 + thin-venue band to the user.
4. 09-11: Apify crawl of thin venues' own + tagged feeds → staging → parser → cluster → reader.
5. Phase 3 residue table — the exit criterion.

## Landmines (things that bit us; check before repeating)

- `vendors.city` DEFAULTS to `'Chicago'` — evidence only with `discovery_source='google_places'`.
- A "chicago" inside a hashtag is a vendor's market, not the wedding's location. Venue decides.
- Venue accounts that post promotions ("Wedding Cake Wednesday", "now booking 2026") are thin
  because nothing was ever fetched for them, not because the reader misses recaps — check
  `staging.instagram_posts` supply per venue before suspecting the pipeline.
- Vendor pages count a venue's weddings in ANY role (Biagio: 2 venue + 1 planner + 1 other = 4).
- Per-candidate work must scope `stack_extraction_entries` by `post_url` first; the evidence
  views are corpus-wide per call (statement timeouts).
- Pooled Postgres backends can carry a leftover `temp table` — `drop table if exists` first.
- SQL inside JS template literals eats `\y` / `\s` (D049's regex was inert for two days).
- `candidate_review_derived.included_post_urls` holds THIS_VENUE posts only; WRONG_VENUE
  candidates create from their OTHER_VENUE posts.
- A post can exist in `posts` with no `wedding_posts` row; creation must link, not skip.
- `createWeddingsFromJeremyEvidence.ts` only sees `structural-v2` unless
  `--clustering-version` is passed; author-anchored candidates need `--author-min-confidence`.
- Six DB tests need 120 s, not 15 s; run suites on a quiet DB.
- Subagents that "wait for the test run" never return — tell them to run tests and report.
- The model's NOT_WEDDING and OTHER_VENUE calls are NOT reliable; only its W at ≥0.8 is
  written; author-anchored W is held to ≥0.9.
- A uniform random spot-check inherits the corpus run's ordering — stratify by venue
  (`?spotcheck=<reviewer>&n=20` does; CHICAGO_CONFIRMED only).
- Early golden WEDDING labels include marketing slips (Le Loft "POV: bridal suite"); a golden
  label proposes, the venue queue confirms.
- Re-pin test literals by grepping `toBe(<old>)`, not by line number — the same literal
  appears in two blocks of `graphStrengthening.test.ts`.

## Where things live

- Decision log: `docs/decisions.md` (D055 is the long entry; newest addendum "A1 batch +
  coverage audit").
- On-behalf verdict SQL, replayable: `apps/web/scripts/graph/tmp_analysis/d055_*_verdicts.sql`;
  alias reports `tmp_analysis/alias_candidates_2026-09-10.{md,json}`.
- Review UI: `/label/candidates` (`app/components/PostVenueReviewClient.tsx`,
  `lib/server/postVenueReview.ts`). Keys: W/N/V/D/U/Space/B, `/` note. Modes:
  `?spotcheck=<reviewer>&n=20`, `?post=a,b,c`; alias hints from the alias JSON.
- Provenance: `jeremy_weddings_created.batch_id`, `jeremy_wedding_post_attachments`,
  `snapshotGraphTables.ts`, `revertWeddingBatch.ts`; snapshots dir is gitignored.
- Tests: `bunx vitest run scripts/graph/*.test.ts scripts/classify/*.test.ts --testTimeout=120000 --hookTimeout=120000`.
- Reader: `scripts/classify/extractPrompt.ts` (prompt v1.2 + pool-B system prompt + write
  gate), `runExtract.ts` (`--mode calibration|corpus|venue-calibration|pool-b`,
  `--escalate-band 0.5-0.8 --escalate-model anthropic/claude-sonnet-5`, `--only-this-venue`,
  `--clustering-version`, `--include-ambiguous`, `--max-cost-usd`); results in
  `post_extraction_runs` (`pool`, `cost_usd`).
- Creation: `scripts/graph/createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates
  --batch-id … [--clustering-version v] [--author-min-confidence 0.9] [--dry-run]`,
  `--from-golden-legacy`.
- Venue discovery: `resolveDiscoveredVenues.ts`, `discoveredVenueLeads.ts`,
  `extracted_venue_anchors`, `discovered_venue_leads`; aliases
  `applyAccountAliasesSchema.ts` (rounds 1-7b) + `findVenueAliasCandidates.ts`.
- OpenRouter: `NEW_OPENROUTER_API_KEY` in `apps/web/.env.local` (never print it).
