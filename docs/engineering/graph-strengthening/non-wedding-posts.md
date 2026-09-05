# Non-wedding posts on the serving graph — find the gate that failed, then remove at that layer

**Status (2026-09-05): loop kicked off, tick 0 done.** 11 user-flagged posts are confirmed
false positives on live vendor/wedding feeds. They are **not** from the Jeremy
identity-creation write (D035–D039). Durable checklist for a `/loop` mission — read this
file first every wake-up, re-run the sizer, then work the next unchecked item. Do not
delete anything until a rule has beaten a labeled sample *and* a known-good regression
slice. Full narrative: `docs/decisions.md` D040.

## How to run this loop

Give Claude Code this file and the seeds, then `/loop` it. Each tick:

1. Re-read this file. Do not skip to deletion because the 11 examples are obvious.
2. Re-run `cd apps/web && bun run scripts/graph/sizeNonWeddingVenueTagged.ts` and compare
   to "Tick 0 findings." If counts moved, say so before doing anything else.
3. Do the next unchecked checklist item. Check it off only after live re-verification.
4. Stop and hand the user the exact command (with a `!` prefix if auto-mode blocks it)
   for any real DB write. Same bar as D023/D035.
5. Append what you learned to "Baseline findings" in this file before the tick ends.
   A decision that would be expensive to re-derive also goes in `docs/decisions.md`.

A valid complete outcome is "sized the failure, wrote a gate, removed N rows, regression
clean" **or** "the similar-set is too mixed to auto-remove, here is a hand-review list."
Do not force a bulk delete to hit a number. That is D030/D031/D033's standard, applied to
a serving-graph cleanup.

## Why this exists

User saw concerts, a gala, a birthday, a block party, and a venue-marketing post on
feeds that are supposed to be real Chicago weddings, and asked for an iterate-and-eval
loop rather than a one-shot delete of the URLs they happened to notice.

The product bar is the same one the classifier already uses
(`docs/engineering/post-classification/README.md`,
`apps/web/scripts/classify/data/labeling_rubric.md`): a false positive reaching a user is
worse than a false negative. These 11 are already on the serving graph
(`wedding_posts` → vendor Feed / date-sorted wedding lists), so this is a production
precision bug, not a staging-corpus quality issue.

## Tick 0 findings (2026-09-05, verified live — re-verify if stale)

Queried the 11 URLs against Supabase. **Do not relitigate this without a fresh query.**

| claim | result |
|---|---|
| In `public.posts`? | 11/11 |
| `posts.source` | **all `venue_tagged`** (Ben's tagged-feed crawler) |
| `jeremy_evidence`? | **0/11** |
| On a `jeremy_weddings_created` wedding? | **0/11** |
| V3 classification (`post_classification_runs` v3)? | **none** |
| In `jeremy_wedding_candidates`? | **none** |
| In `staging.instagram_posts`? | 1/11 (`DcJQjFJgIbN`, candidate-score 8 — below the V1 cutoff of 12) |
| Wedding shape | **11 distinct weddings, each 1 post** |
| `event_date_est` | equals the post's `posted_at` date (Ben's `phase_dedup` proxy) |
| Wedding IDs | 1306–1380, inside the original Ben ID space (≤1384), **before** D035's 1415+ |

Seeds (user labels, also in `apps/web/scripts/graph/data/non_wedding_seeds.json`):

| shortcode | venue | what it actually is | roles on the wedding |
|---|---|---|---|
| `DcNUEvvMvIk` | `garcias_chicago` | concert (Sneezy) | musician, other, venue |
| `DcNx6TSnMb2` | `lh_schubas` | concert (Choker / Lincoln Hall) | band, musician, venue |
| `DcOHR6qx7kB` | `_thefirehouse_` | TV hit for a block party | officiant, other, venue |
| `DcLmlMnNS91` | `thegeraghty` | RMHC fundraiser gala | catering, florist, other, venue |
| `DcKuJQ-NDop` | `navypiereventcenter` | Zhu show / shuffle dancing | musician, photographer, venue |
| `DcKp-bOjpUb` | `hobchicago` | concert (Jutes) | content_creator, musician, venue |
| `DcL46UADhss` | `hobchicago` | concert (WILT opening for Jutes) | band, musician, photographer, venue |
| `DcJvqkRt-1X` | `rcchicago` | milestone birthday | cake, catering, musician, rentals, venue |
| `DcMEf72FUi8` | `reggieslive` | concert announcement | band, photographer, venue |
| `DcJQjFJgIbN` | `revelspace` | WNBA/Deloitte venue marketing | catering, planner, rentals, venue |
| `DcJhXRTET86` | `hobchicago` | concert (Jay Wheeler) | content_creator, musician, venue |

Corpus context the same day: 6,370 `venue_tagged` posts vs 273 `jeremy_evidence`. 356
weddings dated Aug 2026 or later. A *caption heuristic* (concert/gala/birthday language —
not a label) already hits 86 weddings / 96 posts. House of Blues has 7 "weddings," all
since 2026-07-17; Garcia's 5, all since 2026-08-11; Lincoln Hall 3, all since 2026-08-14.
Date-sorted Chicago feeds (`listWeddingStacks` orders `event_date_est DESC`) put these
next to real weddings from the same week — that is why they look newly introduced even
though they are Ben-crawl rows, not D035–D039 inserts.

## Working root-cause hypothesis (confirm or replace on tick 1–2; do not skip this)

Ben's `phase_dedup()` (`pipeline/pipeline.py`) builds a wedding from every post with
`has_stack` (≥3 distinct vendor roles). There is no `is_wedding` gate. The tagged-feed
crawl is "pre-filtered by construction" only in the weak sense that the post appeared on
a venue's Instagram — and many of those venues also host concerts, galas, corporate, and
birthdays. A concert photographer tagging `@hobchicago` plus two musicians is
structurally identical to a wedding credit stack.

The V1 classifier (`prefilter.ts` → V3 in `llmClassifier.ts`) exists specifically because
own-profile posts are mostly *not* real weddings. It was **never run on Ben's
`venue_tagged` corpus**, by design: `docs/engineering/post-classification/README.md`
"Where the posts live" treats `public.posts` as already-wedding. That assumption is what
broke here.

Predicted (measure, don't assume) gap in reusing `prefilter.ts` as-is: `hasWeddingSignal`
returns true if the caption mentions a known graph vendor. These posts mention real
venues in our graph, so the free tier will likely **defer** them rather than EXCLUDE.
That is the same known-vendor over-match that `prefilter-v2` tried to remove and
`prefilter-v3` put back to save two real weddings (see post-classification README,
adversarial validation round). A new high-precision EXCLUDE rule may be needed; do not
silently loosen `prefilter-v3` to catch concerts and re-break those two weddings.

**Wrong layer, do not "fix" here:** rolling back D035–D039, reclassifying the 4,033
INCLUDE corpus, or unfreezing V3's prompt. V3 may later be *run* on a Ben-post sample as
a scoring tool; changing its prompt is not tick 1.

## AI eval rules (non-negotiable — this is the loop, not a sidebar)

Copied from the classifier's own failure history, because "fixed the motivating URLs"
already shipped a regression once (`prefilter-v2`: 4 new wrong EXCLUDEs, 2 of them real
weddings). Same discipline here:

1. **Seeds are not the population.** The 11 URLs are a discovery sample. Expand to a
   similar-set before writing a delete list. The user said there are more.
2. **Independent labels.** Hand-label against
   `apps/web/scripts/classify/data/labeling_rubric.md`, citing caption evidence. Do not
   rubber-stamp the caption heuristic, V3, or `has_stack`. INCLUDE / EXCLUDE / REVIEW
   only. Prefer REVIEW or EXCLUDE when unsure (precision-first).
3. **Split.** After expanding, hold out a slice you did not look at while designing the
   rule. Tune on the rest. The 11 seeds are burned for tuning the moment this doc named
   them — they are regression cases, not a test set.
4. **Removal is EXCLUDE-precision, not INCLUDE-precision.** V3 was optimized to avoid
   false INCLUDEs and is allowed to wrong-EXCLUDE. Using "V3 said EXCLUDE" as a delete
   trigger would drop real weddings. A delete rule must be measured on EXCLUDE precision
   against the labeled sample, and on false-EXCLUDE rate against a **known-good** slice
   of serving-graph weddings (use captions that unambiguously name a couple + wedding,
   e.g. the 2026-08-19 Galleria / ULC / Arbory posts sitting next to the junk in the
   date-sorted head). **Bar, fixed now (before tune-split numbers exist, so it can't be
   softened after seeing them): ≥98% EXCLUDE precision on the tune split, and 0
   false-EXCLUDEs — zero tolerance, not a rate — on the known-good slice.**
5. **Propose → implement → re-run the same eval → compare.** Checking only the 11 seeds
   after a change is not an eval. If a rule catches all 11 and also EXCLUDEs Gisela +
   Charles (`DcL6RrLx5Hd`, wedding 1352), it is a failed iteration.
6. **Deterministic first, LLM second.** Size and try a free rule (caption + venue
   identity + role shape) before spending OpenRouter. If you do run frozen V3, treat it
   as a prior, not a delete switch, and log cost.
7. **Do not write to `golden_set` from a classifier.** If a Ben-post labeled set is worth
   keeping, it gets its own `source_note` via `loadGoldenSet.ts` from a hand-edited JSON
   file, after a human has agreed the labels are ground truth. Do not dump heuristic
   hits into `golden_set`.
8. **Surgical writes, never `phase_dedup()` truncate.** Truncating `weddings` /
   `wedding_posts` / `wedding_vendors` wipes D023/D027/D035–D039 and renumbers IDs.
   Provenance table, `--dry-run` rollback, `on conflict`/`where id in (...)`, refresh
   `edges`, update the snapshot literals in `graphStrengthening.test.ts` (they have
   already drifted five times this arc — expected, still required).

## Constraints

- Ask before any real DELETE/UPDATE on Supabase. Working agreement: data moves that are
  hard to reverse need a human in the moment. Dry-run output is the review artifact.
- Additive provenance for every retired row (post_url, wedding_id, reason, ruled_by,
  retired_at) so this is reversible without guessing.
- Do not delete a `weddings` row that still has a remaining *kept* `wedding_posts` row.
  The 11 seeds are currently 1-post weddings; the expanded set may not be. If a wedding
  mixes a real wedding post and a concert recap, detach the concert post only.
- Do not invent a new classifier version as the first move. Measure existing tools
  (`prefilter.ts`, caption heuristic, venue identity) against labels first.
- `/feed` (`v1_content_corpus`) is a different surface. Only one seed is even in staging
  and it scored 8, so it is not in `/feed`. Do not "fix" `/feed` as a proxy for this bug.

## Checklist (work top to bottom; check off only after live re-verification)

- [x] **Tick 0: identify the layer** (2026-09-05) — 11/11 are Ben `venue_tagged`
      single-post weddings, not Jeremy creation. Sizer:
      `apps/web/scripts/graph/sizeNonWeddingVenueTagged.ts`. Seeds:
      `apps/web/scripts/graph/data/non_wedding_seeds.json`.
- [x] **Tick 1: expand the similar-set, don't delete yet** (2026-09-05) — from the seeds, pull
      overlapping populations *separately* so you can see which signal actually
      generalizes. Suggested buckets (add/drop with evidence, don't treat as gospel):
      1. Same venue accounts (`hobchicago`, `lh_schubas`, `reggieslive`,
         `garcias_chicago`, `navypiereventcenter`, `revelspace`, `rcchicago`,
         `thegeraghty`, `_thefirehouse_`) — read a sample of *all* their weddings, not
         just heuristic hits. Some of these venues do host real weddings (Geraghty,
         Revel, RC).
      2. Caption heuristic already in the sizer (86 weddings / 96 posts as of tick 0).
      3. Role-shape: `wedding_vendors` is only musician/band/venue (no planner /
         florist / photo+video wedding-day stack) — concerts cluster here; verify it
         doesn't also cluster real weddings that only credited a band.
      4. Newest 50 Chicago `venue_tagged` weddings (the feed head). Hand-mark each
         INCLUDE/EXCLUDE/REVIEW.
      Union the buckets, dedupe by `post_url`, write the unlabeled pool to
      `apps/web/scripts/graph/data/non_wedding_similar_pool.json` (url, wedding_id,
      venue, bucket tags). Report sizes. Do not delete.
- [x] **Tick 2: hand-label a sample + a known-good regression slice** (2026-09-05) — follow
      `labeling_rubric.md`. Label (a) every seed (already done), (b) a stratified sample
      of the similar-pool large enough to estimate EXCLUDE precision (start ~40–60, not
      all 86 heuristic hits in one pass), (c) ≥20 serving-graph posts you are confident
      are real Chicago weddings (date-sorted head already contains several — Gisela +
      Charles, Galleria 08.15.26, Arbory Claire/Kevin, etc.). Write labels to
      `apps/web/scripts/graph/data/non_wedding_labels.json` in the same shape as the
      seeds file. Hold out ~1/3 of (b)+(c) as `heldout` via a `split` field *before*
      designing a rule. If a post is mixed/unclear, REVIEW — it does not go on a delete
      list.
- [x] **Tick 3: score existing screens against those labels** (2026-09-05) — for each labeled post,
      record what `prefilter.ts` would decide (you will need a thin adapter: Ben posts
      live in `public.posts`, not `staging.instagram_posts`; do not pretend `source.ts`
      already does this). Also record the caption heuristic and the role-shape rule.
      Print a confusion table vs hand labels, **including the known-good slice**. The
      question is not "does it catch the 11." The question is EXCLUDE precision on the
      tune split and false-EXCLUDE count on known-good. Write the numbers into Baseline
      findings.
- [x] **Tick 4: one rule, or stop** (2026-09-05) — if a deterministic rule clears the fixed bar from
      rule 4 above (≥98% EXCLUDE precision on tune *and* 0 false EXCLUDEs on known-good),
      lock it (name + version string) and
      freeze it before looking at held-out. Then score held-out once. If held-out
      false-EXCLUDEs a real wedding, the rule is not ready — iterate the rule, do not
      eyeball-delete the held-out miss. If no free rule is safe, the complete outcome
      is a hand-review delete list of labeled EXCLUDEs only, plus a recommendation for
      a later Ben-corpus screen (possibly frozen V3 as a prior, not a trigger). Either
      way, the delete set is explicit post_urls, not "all heuristic hits."
- [x] **Tick 5: dry-run surgical retirement** (2026-09-05, dry-run + committed by the user) — script, `--dry-run` first, transaction
      rollback. For each labeled-EXCLUDE post_url in the approved set: detach
      `wedding_posts`; if that wedding now has 0 posts, retire the `weddings` row and
      its `wedding_vendors` (do not leave empty weddings in the graph); log every id
      into a new provenance table (e.g. `non_wedding_posts_retired`). Refresh `edges`
      only on a real commit. Print before/after counts for `weddings`, `wedding_posts`,
      `wedding_vendors`, `edges`. The 11 seeds must all appear in the dry-run plan.
      Hand the user the non-dry-run command. Do not run it in auto-mode.
- [x] **Tick 6: gate so a future crawl does not put them back** (2026-09-05) — Ben's Python pipeline
      still has no `is_wedding` check. At minimum: document the rule in this file and
      `pipeline/pipeline.py` comments, and add a TS test that the locked rule EXCLUDEs
      the seed shortcodes and INCLUDEs the known-good slice. A pipeline-side filter is
      in scope only if it is the same locked rule, not a parallel invention. Do not
      re-run `phase_dedup()` to "rebuild clean."
- [x] **Docs close-out** (2026-09-05) — `docs/decisions.md` (what was removed, what rule shipped,
      eval numbers), `ROADMAP.md` Now, snapshot literals in
      `graphStrengthening.test.ts` if counts moved. `measureFeedCoverage.ts` may move;
      report the delta, don't "fix" coverage by putting junk back.
      Done: D041 added to `docs/decisions.md` (full tick-by-tick summary); `ROADMAP.md`
      moved this mission from "Now" to "Shipped"; `graphStrengthening.test.ts` snapshot
      literals updated (weddings 1624→1584, wedding_posts 1941→1895, wedding_vendors
      14918→14664/untouched 14818→14564) and a new "non-wedding-posts role_shape_v1 gate"
      describe block added (tick 6); `pipeline.py`'s `phase_dedup()` documents the
      `is_wedding` gap. `measureFeedCoverage.ts` delta: numerator unchanged (303 weddings
      still trace to `/feed`, none of the 40 retired weddings were Jeremy-created or
      Jeremy-matched), denominator dropped 1624→1584, so the reported rate moved
      **18.7% → 19.1%** — a byproduct of removing junk, not new /feed coverage work.

## Mission status: CLOSED (2026-09-05) — all 6 ticks + docs close-out done.

## Baseline findings

*(tick 0 is in "Tick 0 findings" above; later ticks append here)*

### Tick 1 (2026-09-05) — similar-set pool built, no deletions

Re-ran the sizer first: counts unchanged from tick 0 (6,370 `venue_tagged` /
273 `jeremy_evidence` posts, 11/11 seeds, 86 weddings / 96 posts on the
caption heuristic). No drift.

Built `apps/web/scripts/graph/buildNonWeddingSimilarPool.ts` (read-only) and
wrote `apps/web/scripts/graph/data/non_wedding_similar_pool.json`: **191
unique posts**, unioned from four buckets, all 11 seeds present.

| bucket | unique posts | notes |
|---|---|---|
| `same_venue` (the 9 seed venue accounts, all their weddings) | 67 | not filtered to `venue_tagged`-looking captions — includes venues' real weddings too |
| `caption_heuristic` (concert/gala/birthday regex, `venue_tagged` only) | 96 | matches sizer exactly once venue join was fixed (see below) |
| `role_shape` (wedding_vendors role set ⊆ {venue, band, musician}) | 10 | includes seed `DcNx6TSnMb2` (band,musician,venue); several with `photographer` in the mix were excluded by design (not a pure subset) |
| `feed_head` (newest 50 Chicago `venue_tagged` weddings) | 50 | left **unlabeled** here on purpose — tick 2 hand-labels a sample of the pool, not this script |

Bug caught before trusting the numbers: the first pass of the pool script
used `join accounts va on va.id = w.venue_id` for the caption-heuristic and
role-shape buckets, which silently dropped 15 posts whose wedding has a null
`venue_id` (96 → 81). Switched every bucket except `same_venue` (which
filters on venue username by construction) to `left join accounts va`.
Re-ran and `caption_heuristic` now matches the sizer's own 96 exactly.
**Lesson for later ticks: default to `left join accounts` on `venue_id`
unless the query is explicitly filtering by venue — an inner join silently
shrinks the population instead of erroring.**

Spot-checked a few `caption_heuristic`-only rows: several carry a full
wedding-day stack (`cake,catering,florist,photographer,planner,venue`, etc.)
— i.e. the regex is hitting real weddings that mention "birthday" or similar
in passing, exactly the risk flagged in "Open questions." This is expected
and is why tick 2 hand-labels rather than trusting any single bucket.

No labeling, scoring, or deletion happened this tick. Next: tick 2 (hand-
label a stratified sample of the pool + a known-good slice).

### Tick 2 (2026-09-05) — hand-labeled 75 posts + split, no deletions

Read the full caption of every post (not the 160-char heads) against
`labeling_rubric.md`. Labeled: 50 similar-pool sample posts (13 INCLUDE / 34
EXCLUDE / 3 REVIEW) and 25 known-good candidates (21 INCLUDE / 4 REVIEW — the
21 INCLUDE ones are the known-good regression slice, comfortably over the
≥20 floor). Wrote `data/tick2_hand_labels_source.json` (the labels) and
`data/non_wedding_labels.json` (labels + a seeded tune/heldout split, ~1/3
heldout per group, assigned **before** any rule was scored).

Calibration rule applied consistently while labeling: INCLUDE requires a
named couple/individual **or** an unrepeatable, event-specific fact (e.g. "a
chimpanzee ring bearer," "the groom sang the opera and did his own concert at
his wedding," a real church cross-reference). A full vendor-credit stack
alone — even 15+ roles — does NOT clear the bar by itself if the caption is
generic marketing copy with no name or unique fact; those went to REVIEW
(`insufficient_evidence`), not INCLUDE. This matters: several known-good
*candidates* that were auto-selected for having a full wedding-day stack
(planner + photographer + 4+ roles) turned out to be generic vendor-
portfolio copy on inspection (`Db_4ebxJuff`, `Db6FQRdFT0n`, `DbszcXZj3er`,
`DbmHqAnGep4`) — confirms the mission's own warning not to rubber-stamp a
heuristic prefilter (here, the query used to *find* known-good candidates)
as ground truth.

Also confirmed real findings inside the "junk" buckets: `Db37U0ivH5m` is a
genuine wedding held **at** House of Blues Chicago (named couple, explicit
"our first ever wedding" caption) — direct evidence that `hobchicago` isn't
purely a concert venue, exactly the risk the doc flagged for Geraghty/Revel/
RC. `DbWqZZFjpTI` and `DZvUebBoCdY` are real weddings but not in Chicago
(Tuscany; likely Grand Rapids, MI) — EXCLUDE `not_chicago`, a reason the caption
heuristic and role-shape rule don't even target.

### Tick 3 (2026-09-05) — scored 3 screens against the labels, no deletions

Built `scripts/graph/scoreScreensTick3.ts` with a thin `public.posts`
adapter for `prefilter.ts` (per the doc's own warning, `source.ts` only
reads `staging.instagram_posts`) — pulls caption/hashtags/mentions/location
from `posts.raw` jsonb, and resolves `known_vendor_mentions` roles for real
via `v_account_role`, instead of leaving that array empty. Confusion tables
on the **tune** split (50 pool + 21 known-good, seeds shown separately):

| screen | tune EXCLUDE precision | tune n excluded | false-EXCLUDEs on known-good (tune, 15) | seeds caught (of 11) |
|---|---|---|---|---|
| `prefilter-v3` | n/a (0 excluded) | 1/50 | 0 | 0/11 |
| caption heuristic | **0.80** (12/15) | 15/50 | 0 | 8/11 |
| role-shape (⊆{venue,band,musician}) | **1.00** (5/5) | 5/50 | 0 | 1/11 |

**`prefilter-v3` confirms the doc's predicted gap exactly**: it defers
(returns `null`, i.e. no gate — the post stays on the serving graph exactly
like an INCLUDE) on effectively everything, because Ben's `venue_tagged`
posts mention accounts that are already known graph vendors
(`known_vendor_mentions` fires and defers). It is not a usable screen here
without a new EXCLUDE-side rule — confirmed, not just predicted.

**Caption heuristic fails the locked bar** (rule 4: ≥98% tune precision):
80% precision, and its 3 false EXCLUDEs are structurally explainable, not
noise — `DZamFCXJ32J` and `Db37U0ivH5m` are real weddings whose captions
contain the literal word "concert" (one describes a groom's own opera
performance, the other is the House of Blues wedding above), and
`DcJTVimP2su` false-triggers on a `Live Music: @parkweststrings` **credit
line**. A tighter version would need to exclude matches that fall inside a
"Role: @handle" credit line and matches that co-occur with strong wedding
language ("wedding day," a named couple) — not attempted this tick; the
mission's own rule 6 (deterministic first) doesn't require inventing that
fix if a simpler rule already clears the bar (see below).

**Role-shape clears the locked bar**: 100% precision on tune, 0 false
EXCLUDEs on the known-good slice (tune AND full 21), and it independently
also excludes 1 of the 11 original seeds. Low recall (5/34 tune EXCLUDEs,
~15%) — it is not a general junk filter, it is a narrow, safe one. Per the
mission's own valid-outcome definition, low recall does not disqualify it:
"the complete outcome is a hand-review delete list of labeled EXCLUDEs
only" is explicitly allowed to sit alongside a locked rule for the slice it
does cover.

**Decision, frozen before looking at heldout**: lock role-shape
(`role_shape_v1`: wedding has ≥1 `wedding_vendors` row and every row's role
∈ {venue, band, musician}) as the one automated rule this mission ships.
Do not lock the caption heuristic. Scoring heldout (25 posts) once now to
confirm — see below.

**Heldout (scored once, after freezing role_shape_v1, not used to change it)**:

| screen | heldout EXCLUDE precision | false-EXCLUDEs on heldout known-good |
|---|---|---|
| caption heuristic | 0.667 (4/6) | 2 |
| role-shape (`role_shape_v1`) | **1.00 (3/3)** | **0** |

Confirms tick 3's decision: `role_shape_v1` holds at 100% precision / 0 false
EXCLUDEs on heldout too (3/3). Caption heuristic fails heldout as well
(66.7%, 2 more false EXCLUDEs of real weddings) — correctly not locked.

### Tick 4 (2026-09-05) — rule locked, delete candidates sized, no deletion

**Locked rule `role_shape_v1`**: a wedding qualifies iff it has ≥1
`wedding_vendors` row and every row's role is in `{venue, band, musician}`.
100% EXCLUDE precision and 0 false EXCLUDEs across tune (5/5), known-good
(0/21), and heldout (3/3) — 8/8 correct with zero regressions across every
slice measured. Low recall by design (catches 1 of the 11 seeds, ~15% of
the tune similar-pool's true EXCLUDEs) — it is a narrow, safe automated
rule, not a general junk filter.

**Corpus-wide application** (venue_tagged-sourced weddings only, excludes
anything touched by Jeremy candidate creation — out of scope per "Deliberately
not touched"): **10 weddings** match, 5 `is_chicago = true`, 5
`is_chicago = null` (garcias_chicago x2, cobralounge, beatkitchenbar,
citywinerynsh, raviniafestival x2, huntingtonbankpavilion, lh_schubas,
reggieslive — ids 1235, 1256, 1267, 1268, 1271, 1272, 1360, 1368, 1371,
1376). All single-post weddings. One (1371, `lh_schubas`) is seed
`DcNx6TSnMb2`. Note: `is_chicago = null/false` weddings still appear on a
vendor's own Feed page (only the date-sorted Chicago list filters on
`is_chicago`), so all 10 are in scope for the "serving graph" this mission
is about, not just the 5 flagged Chicago ones.

**Outcome, per the mission's valid-complete-outcome definition**: both
branches, not either/or — `role_shape_v1` auto-covers 10 weddings
corpus-wide; everything else labeled EXCLUDE (45 post_urls: the 11 seeds +
34 hand-labeled pool EXCLUDEs, individually cited against the rubric) is a
**hand-review delete list**, not a rule generalized beyond what was actually
checked. The caption-heuristic's 96 hits and the same-venue bucket's
remaining posts are explicitly NOT a delete list — only individually
hand-labeled EXCLUDEs are. Total distinct delete-candidate posts across both
branches: see `data/non_wedding_delete_candidates.json` (tick 5 prep).

### Tick 5 (2026-09-05) — dry run only, NOT committed

`data/non_wedding_delete_candidates.json`: 11 seeds + 34 hand-labeled pool
EXCLUDEs + 10 `role_shape_v1` corpus-wide matches, deduped to **46 distinct
posts**. Ran `scripts/graph/retireNonWeddingPosts.ts` (default dry-run: real
SQL inside `begin ... rollback`, nothing persisted):

- 46 posts detached from `wedding_posts` (all 11 seeds included, 11/11).
- 40 of those weddings drop to 0 remaining posts and are retired (their
  `wedding_vendors` rows retired too) — matches tick 0's "11 distinct
  weddings, each 1 post" plus the other single-post junk weddings found in
  ticks 1–4.
- 6 posts detached from weddings that keep other, non-junk posts (mixed
  weddings — only the concert/gala/birthday post is detached, the wedding
  itself is untouched), per the mission's own constraint on mixed weddings.
- Before → after (within the rolled-back transaction): `weddings` 1,624 →
  1,584 (-40), `wedding_posts` 1,941 → 1,895 (-46), `wedding_vendors`
  14,918 → 14,664 (-254, from the 40 fully-retired weddings' vendor rows).

**Not committed.** Per Constraints ("ask before any real DELETE/UPDATE on
Supabase"), the exact command for a human to run is:

```
! cd apps/web && bun run scripts/graph/retireNonWeddingPosts.ts --commit
```

This also creates `non_wedding_posts_retired` (provenance: post_url,
shortcode, wedding_id, wedding_also_retired, reason, ruled_by, retired_at)
if it doesn't exist yet, and logs all 46 rows into it on commit. `edges`
still needs `refresh materialized view edges` afterward (not run
automatically by the script — only on a real commit, per the mission's own
rule).

**Committed by the user (2026-09-05)**, from their own shell, matching the
dry run exactly: 46 posts detached (11/11 seeds), 40 weddings fully
retired, `weddings` 1,624 → 1,584, `wedding_posts` 1,941 → 1,895,
`wedding_vendors` 14,918 → 14,664. `non_wedding_posts_retired` created and
populated with all 46 rows. Ran `refresh materialized view edges`
immediately after (required — edges still reflected the retired vendor
pairs until refreshed): `edges` 63,229 → 61,848 (-1,381 vendor-pair rows,
from the 40 retired weddings' 254 `wedding_vendors` rows).

**Remaining before this mission can close**: tick 6 (gate — lock
`role_shape_v1` into a TS regression test, and consider a `pipeline.py`-side
filter using the same rule, not a new one) and docs close-out (`docs/decisions.md`
D040 numbers + `ROADMAP.md` + `graphStrengthening.test.ts` snapshot literals,
now that the counts above are final, not projected).

## Open questions, not resolved here

- How many of the 86 caption-heuristic hits are real weddings that mention "birthday"
  or "tour" in passing? Tick 2 must answer this before any heuristic becomes a delete
  rule.
- Should music venues that never host weddings (`hobchicago`, `lh_schubas`,
  `reggieslive`, `garcias_chicago`) be dropped from the venue frontier entirely, rather
  than post-filtered? Out of scope until the post-level rule is measured — that is an
  identity-layer change (Places search strings are `'wedding venue'`, `'wedding
  reception venue'`, `'banquet hall'` in `pipeline.py`, so these accounts hopped in
  some other way).
- `/feed` V1 INCLUDE precision is a separate corpus. Do not open V4 here.

## Deliberately not touched this mission

- Jeremy candidate creation, reconciliation, or `jeremy_evidence` posts (wrong layer
  for the 11 seeds; only reopen if a later tick finds actual Jeremy FPs).
- V3 prompt / rubric / routing (frozen unless a production-blocking *classifier* bug;
  this bug is "classifier never ran," not "V3 was wrong").
- `phase_dedup()` rebuild, staging drop, 1–2 role attach gap, D022 clustering fix.
