# Post classification — is this a credible real Chicago wedding?

**Status (2026-09-03): V1 shipped, V3 frozen.** The classifier itself never got a full-corpus
run — see "Ship/no-ship" for why the 45k run was withheld, and "Candidate-generation pivot" for
what shipped instead. Current live state: **V3 is the frozen classifier** (pooled precision
0.941 on the 3,000-post canary — see "V3 canary" below), a deterministic candidate score
(`candidate-score-v1`, zero LLM cost) narrowed the 47,623-post corpus to a 5,225-post high-signal
pool, and that pool ran through V3 for $116.94 (vs. an estimated ~$470 for the full corpus),
yielding **4,033 INCLUDE posts** — now live in Supabase (`candidate_scores` table,
`v1_content_corpus` view) and reachable in the product at `/feed`. The remaining ~42,398 posts
(candidate score <12) are **not classified**, deliberately — see "V1 shipped" below for why and
what's given up. `OPENROUTER_API_KEY` (the original key) remains exhausted and untouched; all
live work here used `NEW_OPENROUTER_API_KEY`.

**Purpose:** ~45k Instagram posts (see "Where the posts live") need a decision — INCLUDE,
EXCLUDE, or REVIEW — before they can be surfaced. The product bar is explicit: a false
positive (an untrustworthy/non-real/non-Chicago post reaching a user) is worse than a false
negative. This doc is the engineering half; the mission/product framing is in the session
that built this (see the decisions log entry this doc is cited from).

## Where the posts live

The ~45k posts are `staging.instagram_posts` (47,623 rows) — Jeremy's own-profile Instagram
scrape, imported 2026-08-22 per `docs/decisions.md` D006, pending re-parse through the stack
parser per `ROADMAP.md`. They are **not yet** in `public.posts` (which today holds only 6,370
`venue_tagged` posts from the graph crawl, all pre-filtered by construction — a post only
enters that table by being tagged on a venue's feed in the first place). The own-profile
posts are the ones that need this system: a vendor's own feed is mostly *not* documented real
wedding content (see "What the golden set found" below).

**Design consequence:** every table in this system is keyed by `post_url` (a natural key,
unique in both `staging.instagram_posts` and `public.posts`), never by an internal serial id.
Classification results and the golden set survive the eventual staging→public migration and
can reference posts that haven't been imported yet. `source.ts` is the only module that knows
about `staging.instagram_posts`; when own-profile rows land in `public.posts`, add a second
fetch function with the same `PostContext` shape and nothing else changes.

## Time and versioning (D011)

`post_classification_runs` tracks two timestamps that mean different things and must never be
conflated:

- **`classified_at`** — when the classifier made this decision. Drives "current" (the
  `post_classifications_current` view is latest-by-`classified_at` per post) and staleness.
- **`posted_at`** — when the Instagram post itself went up. Snapshotted from
  `staging.instagram_posts.post_timestamp` (`posts.posted_at` is the source of truth once a
  post is in `public.posts`) so classification history stays queryable by post age after
  `staging` is eventually dropped — it is a copy, never authoritative.

**Post age is never evidence of credibility.** An old real Chicago wedding is still a real
Chicago wedding — `llmClassifier.ts`'s system prompt says so explicitly, and nothing in
`prefilter.ts` looks at `posted_at` at all. The only things that legitimately go stale over
time are the *classifier* (an old `classifier_version`/prompt) and the *account picture* (an
account's archetype should reflect its current behavior) — never the post's own realness.

This is what makes continuous improvement structural rather than aspirational:

1. **Account intelligence uses recent history, not a permanent verdict.** `accountClassifier.ts`
   samples each account's `post_timestamp desc` captions (not an arbitrary early sample), and
   `account_classification_runs` is append-only exactly like posts — re-running the account
   classifier adds a new row and `account_classifications_current` picks it up automatically.
2. **New classifier versions can selectively reclassify.** `runClassify.ts --post-urls-file`
   plus the `input_hash` skip logic (only reprocesses posts whose inputs OR policy actually
   changed) means a new version doesn't have to touch all 47,623 posts to move the corpus
   forward.
3. **Stale/low-confidence/REVIEW classifications are queryable, not just conceptually
   trackable.** `findStale.ts` finds posts whose current decision is under an older
   `classifier_version` than a given target, below a confidence threshold, or older than N
   days — and prints a URL list that feeds straight into `runClassify.ts --post-urls-file`.
   Verified live: after the `prefilter-v2`→`v3` regression fix (see "Adversarial validation
   round" below), `findStale.ts --behind det-only-v3` immediately found 1,712 posts still
   carrying `det-only-v2`'s reverted, over-aggressive EXCLUDE as their "current" decision —
   v3 correctly declined to re-decide them deterministically (defers instead), and they'll get
   a fresh decision automatically the next time the real tiered pipeline touches them. No
   special-casing needed; this is the versioning design working as intended, not a bug to fix.
4. **History is preserved, never overwritten.** Already true by construction (append-only runs
   + a `DISTINCT ON` serving view) — reconfirmed, not changed, by this round.

`event_date`/`event_date_confidence` (optional, on `post_classification_runs`) capture the
wedding's own date **only when a post gives direct textual evidence** ("10.4.24," "June 5th
wedding") — never inferred from `posted_at`, never guessed, not required for a decision either
way.

## The contract

`apps/web/scripts/classify/contract.ts` is the single source of truth. Every tier produces a
`ClassificationResult`: `decision` (INCLUDE/EXCLUDE/REVIEW), `confidence`, four tri-state
booleans (`is_wedding`, `is_real_wedding`, `is_chicago`, `is_credible_source` — `null` means
"no evidence either way," not "no"), `exclusion_reason`, a grounded `evidence[]` array
(`{claim, signal, source_field}` — every claim needs an actual quote/hashtag/field value, not
"looks like a wedding"), and version/model/tier/cost/latency for traceability.

`decision`/`tier` are closed (Postgres enums). `exclusion_reason` and account `archetype` are
**free text** on purpose — the mission is explicit that the four-question hypothesis
(is_wedding / is_real_wedding / is_chicago / is_credible_source) is a starting point, not a
locked taxonomy, and evaluation is expected to surface failure modes it doesn't name. This
already happened once during golden-set labeling — see below.

## Data plane

Mirrors the `venue_extraction_runs`/`venue_enrichment` pattern already in this codebase
(`pipeline/schema.sql`) — the closest prior art for "AI-native, versioned, needs-review data
plane" — with one deliberate difference: the serving layer (`post_classifications_current`,
`account_classifications_current`) is a `DISTINCT ON` **view** over the append-only runs
table, not a second table. At tens of thousands of posts that scan is cheap, and it avoids a
second place for "current" to drift from history; posts don't need venue_enrichment's
correction workflow (a post's classification only ever moves forward to a newer
`classifier_version`, never gets hand-patched).

```
post_classification_runs      (append-only: every attempt, every tier, every version)
  → post_classifications_current   (view: latest run per post_url)
golden_set                    (hand-labeled ground truth — no classifier ever writes this)
account_classification_runs   (append-only: account archetype prior)
  → account_classifications_current
```

Every classified post is idempotently skippable on rerun: `input_hash` (in `contract.ts`)
hashes everything fed to the classifier, so a rerun under the same `classifier_version` only
touches posts whose inputs or policy actually changed (`runClassify.ts`'s default behavior;
`--force` overrides).

## Cost-aware tiering

```
deterministic (prefilter.ts, $0)
  → confident EXCLUDE: done
  → else: cheap_model (haiku-4.5, $1/$5 per M tokens)
       → EXCLUDE: trust it — a wrongly-excluded good post is a false negative,
         acceptable under the mission's precision-first tenet
       → INCLUDE or REVIEW: escalate to expensive_model (sonnet-5, $2/$10 per M
         tokens) for confirmation — a cheap model's "yes" is exactly the risky case,
         since INCLUDE precision is the primary optimization target
```

The deterministic tier (`prefilter.ts`) **only ever returns a confident EXCLUDE, or defers**
— never a confident INCLUDE — for the same reason: false positives are the expensive
mistake, so the free tier is only trusted to say "definitely no." Two rules, each verified
independently high-precision against a live sample before being written:

1. **Zero wedding-signal anywhere** (caption, hashtags, credit-stack line, or a mention of an
   account already confirmed as a wedding vendor in our own graph) → `not_wedding_related`.
   Verified case: "Fioretta Steak," a steakhouse, was swept into the Chicago-wedding-venue
   Places search and categorized `venue` — its posts are menu items, not weddings.
2. **`location_tag` positively names a well-known non-Chicago-metro place**, with no Chicago
   counter-signal in caption/hashtags → `not_chicago` / `destination_wedding`. Verified case: a
   Chicago-based vendor's post geotagged "Santorini, Greece" — proof that a Chicago vendor is
   not evidence the *event* was in Chicago.

**Full-corpus result (2026-09-02, `classifier_version=det-only-v1`, deterministic tier only,
$0 spent):** of 47,623 staged posts, **15,744 (33.1%) confidently EXCLUDE** for free —
15,314 `not_wedding_related`, 422 `destination_wedding`, 8 `not_chicago`. The remaining
31,879 (67%) need the LLM tiers. This is a real, measured number, not an estimate.

Account-level archetype (`accountClassifier.ts`, requirement 7 of the mission) runs
separately, ahead of post classification, and is attached to each post as a **prior** — the
system prompt (`llmClassifier.ts`) explicitly tells the model an absent or low-confidence
archetype is not evidence against a post, only a hint. It exists specifically because Google
Places' own category label is unreliable for this (Fioretta Steak again: categorized
`venue`, is not a wedding venue) — the account classifier reads a sample of the account's own
captions as behavioral evidence, not just the Places label.

## Known-vendor cross-reference

`source.ts:loadKnownVendors` pulls every account already in **our own graph**
(`public.accounts`/`v_account_role`/`account_locations` — built from the independent
tagged-feed crawl, not this scrape) into memory once per run. A post mentioning
`@galleriamarchetti` — a venue independently confirmed via 196 IG geotags in our own crawl —
is much stronger evidence of a real Chicago wedding than caption text alone. Its *absence* is
explicitly not held against a post in the prompt (most legitimate vendors aren't in the graph
yet).

## The golden set

`golden_set` is the regression test — **no classifier may ever write to it**; only
`loadGoldenSet.ts` does, from a hand-labeled JSON file. `data/golden_set_v0.json` is a
bootstrap set: 120 posts, stratified 40/40/40 by `location_tag` shape (explicitly
Chicago-tagged / other-tagged / untagged) from `staging.instagram_posts`, each hand-labeled
by reading the actual caption, hashtags, mentions, location_tag, and account data (not by
running any classifier). Loaded via:

```bash
bun run scripts/classify/loadGoldenSet.ts scripts/classify/data/golden_set_v0.json \
  --labeled-by claude-bootstrap-v0 --source-note bootstrap_v0_stratified_sample
```

**This is a starting point, not a finished ground truth.** It was labeled by reading text
carefully, not by an actual human domain reviewer — treat any eval numbers against it as
provisional until a person (ideally Ben or Jeremy, who know what a credible post actually
looks like) has spot-checked or expanded it via `sampleForReview.ts`.

### What the golden set found (v0, n=120)

| decision | n | % |
|---|---|---|
| EXCLUDE | 87 | 72.5% |
| INCLUDE | 25 | 20.8% |
| REVIEW | 8 | 6.7% |

**The single biggest surprise: a vendor's own Instagram feed is mostly not documented real
wedding content.** Only ~21% of a random sample of own-profile posts describe an
identifiable real wedding with real evidence — the rest is generic marketing ("now booking
love stories"), seasonal/product content unrelated to weddings, proposals and engagement
sessions (real events, but not weddings), portfolio recaps, and posts from other markets
entirely (a Chicago-Places-seeded vendor whose actual feed is full of Florida/Texas/Indiana
work). This is a materially different mix than `public.posts` today, where every row already
survived being tagged onto a specific venue's feed by construction.

**Exclusion reason breakdown (v0):**

| reason | n | discovered how |
|---|---|---|
| `not_wedding_related` | 47 | original hypothesis |
| `vendor_marketing_generic` | 24 | **not in the original four-question hypothesis — added during labeling** |
| `insufficient_evidence` | 12 | original hypothesis |
| `not_chicago` | 9 | original hypothesis |
| `destination_wedding` | 2 | original hypothesis |
| `styled_or_editorial` | 1 | original hypothesis |

`vendor_marketing_generic` — a post that mentions weddings in general (tips, "now booking,"
a philosophy statement, a portfolio recap) but names no specific real couple or event — turned
out to be the **second-largest bucket**, ahead of every original hypothesis reason except
`not_wedding_related`. It doesn't fit `not_wedding_related` (it's wedding-adjacent) or
`styled_or_editorial` (nothing was staged, there's just no real event described). This is
exactly the kind of failure mode the mission asked evaluation to surface rather than force
into the original four boxes — it's now in `contract.ts`'s `EXCLUSION_REASONS` vocabulary and
the LLM prompt.

Other patterns worth a future rule or prompt refinement, noticed but not yet acted on:
- **Proposals and engagement sessions are not weddings** — a recurring confusion risk (4 of
  120 sampled posts were proposal/engagement content credited by a wedding vendor). The
  current prompt doesn't call this out explicitly; worth adding after seeing whether the LLM
  tier actually confuses the two.
- **Anniversary/retrospective posts** (a planner's "5 years later" post naming a real venue)
  are a genuine edge case the golden set flagged as REVIEW rather than resolving — does
  "wedding content" include a retrospective, or only wedding-day documentation? This is a
  product-taste question, not an engineering one; needs a human answer before the next
  classifier version tightens or loosens on it.
- One account (`creativecaptures.us`) posts almost nothing but hashtag-stuffed, zero-caption
  content across every sampled post — a candidate for `errorAnalysis.ts`'s account-level
  rollup once real classifications exist.

## Adversarial validation round (2026-09-02)

Before spending real money on the full 45k-post run, the mission was re-litigated with a
deliberately adversarial validation loop, aimed at breaking the classifier rather than
confirming it works. Per the mission's explicit train/regression/held-out separation:

- **431 posts** pulled via 18 targeted SQL buckets (not random) — random, deterministic-
  excluded, deterministic-deferred, hashtag-only-ambiguous, accounts already confirmed in our
  own graph, accounts flagged from `errorAnalysis.ts`'s hashtag clusters as likely
  non-wedding-primary, wedding-hashtag-but-generic-CTA content, Chicago-signal
  present/absent/ambiguous, styled/editorial, engagement/proposal, generic vendor marketing,
  full real-vendor-stack portfolios, venue marketing, education/tips, a non-Chicago-location
  bucket specifically chosen to be OUTSIDE `prefilter.ts`'s hardcoded destination list (testing
  whether the geo rule generalizes), and weak-textual-evidence real weddings.
- Split 216 **dev** / 215 **held-out**, stratified so every bucket is represented in both
  halves; excludes every post already in the 120-post bootstrap set.
- Hand-labeled by six parallel agents (one per ~72-post chunk), all following one written
  rubric (`labeling_rubric.md`, capturing the golden_set_v0 judgment calls — e.g. proposals/
  engagement sessions aren't weddings unless they name a specific real upcoming wedding,
  `location_tag` outranks a vendor's own market for where an EVENT happened, anniversary posts
  lean REVIEW). One labeling pass initially reported success without actually writing its
  output file — caught by verifying file existence/content/order directly rather than trusting
  the self-report, then redone correctly. All 431 labels loaded into `golden_set` as
  `source_note='dev_v1'`/`'heldout_v1'`, disjoint from `bootstrap_v0_stratified_sample` and
  from each other (`evalHarness.ts` and `costReport.ts` both gained `--source-note` filtering
  for this).

**What the adversarial sample confirmed about the deterministic tier:** it resolves a much
smaller share of this harder sample (17.1% of dev, 15.3% of held-out, vs. 33.1% on the general
corpus) — exactly what "adversarial" should do — but stayed highly accurate on what it did
resolve (36/37 dev, 33/33 held-out).

**What it found, and the fix loop that followed (fully free — deterministic tier only, no
OpenRouter calls needed):** three labeling passes independently flagged the same class of bug —
`prefilter.ts`'s wedding-signal gate (`prefilter-v1`) over-matched and produced a *wrong
exclusion_reason* on posts that were still, by coincidence, correctly EXCLUDEd overall (a
Chicago Symphony Orchestra tour-concert post and a Bridal Fashion Week industry post both got
labeled `destination_wedding` instead of `not_wedding_related`/`vendor_marketing_generic`; a
styled Tuscany editorial got `destination_wedding` instead of `styled_or_editorial`). Root
cause, traced to actual caption text: (1) `known_vendor_mentions` (any mention of an account
with *some* role in our graph) counted as wedding signal on its own — mentioning a photographer
isn't evidence *this* post is a wedding; (2) the credit-stack line pattern matched any
`Word: @handle` line, not just wedding-vendor roles, so an editorial's `Model: @handle` line
false-triggered.

`prefilter-v2` fixed both by dropping (1) entirely and requiring a real wedding-vendor role
word for (2). Re-running the *exact same* dev/held-out eval **caught prefilter-v2 introducing a
real regression** before it went anywhere near the LLM tier: full-corpus coverage rose (33.1%
→ 37.0%) but dev accuracy dropped from 36/37 to 41/45, with **4 new wrong EXCLUDEs — 2 of them
real weddings** (ground truth INCLUDE) that v1 got right. Root cause: those 2 posts credit
vendors with emoji-prefixed lines ("📸 `@handle`") that the text-based credit-line regex never
matched either version — `known_vendor_mentions` was their *only* wedding signal, and v2 had
just removed it. `prefilter-v3` reverted only the `known_vendor_mentions` removal (keeping the
credit-line role-word tightening, which caused zero regressions) — re-running the same three
golden-set splits confirmed **v3 exactly matches v1's decision-level accuracy** (100%/97.3%/
100%, identical scored counts) while the credit-line fix still holds for the class of bug it
targeted. `prefilter-v3` is the current version; `det-only-v1/v2/v3` all remain in
`post_classification_runs` for the record — nothing is deleted, per the append-only design.

**Lesson worth keeping**: "fixed the specific example" is not the same as "fixed without
regressing" — v2 looked correct against the two cases that motivated it and was wrong; only
re-running the full eval (not just the flagged cases) caught it. This is the loop working as
designed, on the one part of the system that's free to iterate on. The same discipline
(propose → implement → re-run the *same* eval → compare, not just check the motivating case)
applies once the LLM tiers are unblocked.

**Explicitly out of scope for this round, by design:** the mission's requested error analysis
on false positives/negatives, prompt iteration, and before/after generalization comparison all
target the LLM tiers' behavior — the cheap/expensive models have not classified a single post
yet. Everything in this section is about the deterministic tier only; it was the only part
that could be validated without spending OpenRouter credits.

## v1 → v2 live experiment (2026-09-02, `NEW_OPENROUTER_API_KEY`, $100 credit)

First live run of the full pipeline (account classification → deterministic → cheap → escalate)
against `dev_v1`, then an evidence-justified prompt fix, then a cold `heldout_v1` run. Both
`OPENROUTER_API_KEY` (exhausted, left untouched) and `NEW_OPENROUTER_API_KEY` exist —
`openrouter.ts` prefers the new one automatically.

**Two tooling bugs found and fixed mid-run** (both produced a plausible, self-consistent,
*wrong* number rather than an error — see D012 for the full story): (1) `runAccountClassify.ts`/
`runClassify.ts` self-reported "processed: N" as `total - errored`, silently counting
never-attempted posts as succeeded whenever a run aborted early (a brand-new API key's ~20rpm
"new account" rate limit triggered this) — fixed to count actual completions, plus a
process-wide per-model rate limiter so concurrent workers stop overshooting the limit. (2)
`evalHarness.ts`/`costReport.ts`/`errorAnalysis.ts`/`sampleForReview.ts` queried
`post_classifications_current` (latest run **across all versions**) filtered by a specific
version — silently returns zero rows for an older version once a newer one has run on the same
posts. Fixed to resolve latest-within-the-requested-version directly from
`post_classification_runs`. `costReport.ts` also undercounted total spend ~25% (only summed the
current-per-post row, dropping a cheap-tier call's real cost when that post later escalated) —
fixed to sum every attempt.

**v1 baseline** (`dev_v1`, n=216, unmodified): INCLUDE precision **0.745**, recall 0.854, F1
0.795, accuracy 0.861. 12 false positives, 11 of them in the `ambiguous`/`insufficient_evidence`
category (already the worst-scoring category, 47% accuracy) — the model treating thin
circumstantial evidence (a real venue name, a venue's own branded hashtag, a generic
event-adjacent phrase like "cocktail hour") as sufficient proof of `is_real_wedding`, without
requiring a named couple or an explicit real-event statement. Verified directly against stored
evidence, e.g. the model read `#dalcywedding` (the venue's own hashtag) as naming "a specific
named couple/event."

**v2 fix** (`PROMPT_VERSION` → `post-classify-v2`, `llmClassifier.ts`): tightened the
`is_real_wedding` question to require a named individual/couple tied to the wedding, an
explicit unambiguous wedding statement, or a 3+ role vendor credit stack — a venue name, a
venue-branded hashtag, or a generic phrase alone is not enough, default to REVIEW instead.
Added an explicit engagement/proposal-with-real-wedding-reference carve-out, and guidance to
treat contradictory location signals as unreliable rather than picking a side.

**v2 on `dev_v1`**: precision 0.745→**0.886**, recall 0.854→0.756, F1 0.795→0.816, accuracy
0.861→0.856, FP 12→4, FN 6→10, REVIEW rate 9.8%→13.9%. Net: fewer, more trustworthy INCLUDEs —
the right direction given INCLUDE precision is the primary metric — at a real, bounded recall
cost. 6 of the 10 new/existing FNs landed in REVIEW (recoverable via human review), 4 in a hard
EXCLUDE. One diagnosed regression risk: the engagement-carve-out didn't fully take for at least
one case (`C_9UTGrRqQp` — "Sarah & JD," explicit 9.13.25 wedding date) because the model's
`is_wedding` judgment (question 1) short-circuits before reaching the carve-out language
(attached to question 2) — a placement gap, not a policy disagreement.

**v2 on `heldout_v1`** (cold — never inspected before or during v2 development): precision
**0.896**, recall 0.782, F1 0.835, accuracy 0.851, FP 5, FN 12, REVIEW rate 12.1% (both sets
combined, 431 posts). Precision matches or slightly beats dev — real generalization, not
overfitting. All 5 held-out FPs are the same residual `ambiguous`/thin-narrative cluster v2
reduced but didn't eliminate. The 12 held-out FNs split into two specific, actionable patterns:
4 are the same engagement-carve-out placement gap seen in dev (confirms it's real and
recurring, not a one-off); 6 are "full vendor stack naming a confirmed real Chicago venue, no
couple name" — cases the v2 prompt's "3+ role vendor stack is sufficient" language says should
count, but the model isn't applying confidently enough in practice.

**Cost** (every attempt, both dev+heldout combined, 431 posts, v2): 70 deterministic (free),
361 cheap-tier calls ($2.05), 182 expensive-tier calls ($2.31) — **$4.36 total, $10.12/1k
posts**. Naively extrapolated to 47,623 posts: **$482**. That's a pessimistic upper bound — the
adversarial sample was deliberately built to under-represent the free deterministic tier (16.2%
resolve rate here vs. 33.4% on the real corpus, `det-only-v3`) and likely over-represents
escalation-triggering ambiguous content. Correcting for the real deterministic rate (33.4% free,
66.6% needing LLM tiers) against this run's observed per-LLM-post cost (~$0.0121) gives a more
realistic **~$385**, still with the caveat that a genuine random-sample pilot (not adversarial)
would sharpen this further before committing to the full run.

### Ship/no-ship

**Superseded (2026-09-03):** this recommendation was about v2, before v3 existed. V3 (built per
item 1/2 below) was tested on the canary and came back at 0.941 pooled precision — see "V3
canary." The 45k run itself was never given a final ship/no-ship call on its own merits, though:
once V3 was frozen, the question changed from "is the classifier good enough" to "do we need to
classify the whole corpus at all" — see "Candidate-generation pivot." Left the original v1/v2
analysis below intact since it's what motivated the v3 prompt changes.

**Recommendation: B — needs another iteration, not ready for the 45k run.** (v2-era call, see above) 89.6% INCLUDE
precision means roughly 1 in 10 surfaced posts would still be a real false positive — for a
product where a false positive directly violates the core requirement, that's not yet
"sufficiently trustworthy for users," even though it's a large, real, generalizing improvement
over v1's 74.5%. This is NOT recommendation C (a data/feature problem) — one prompt iteration
bought +14 points of precision with clear remaining headroom, so the LLM-prompt lever isn't
exhausted.

What a v3 should target, in priority order, each backed by a specific diagnosed pattern above:
1. ~~Move the engagement/proposal-with-explicit-wedding-reference carve-out so it overrides the
   `is_wedding` question directly, not just `is_real_wedding`~~ — **implemented**
   (`PROMPT_VERSION` → `post-classify-v3`, 2026-09-02): the carve-out now lives inside question
   1 itself, so `is_wedding=false` can no longer short-circuit past it.
2. ~~Strengthen the "3+ role vendor stack is sufficient evidence" instruction~~ — **implemented**
   in the same v3 edit: restructured into an explicit "any ONE of these three is sufficient,
   don't require more" list, with the vendor-stack path called out as sufficient **without** a
   named couple. The thin-evidence "not sufficient on their own" list (venue name alone,
   venue-branded hashtags, generic phrases) is unchanged — this was a placement/emphasis fix,
   not a loosening of the bar that fixed the v1 FP cluster.
3. **Not yet run.** Per instruction, v3 has NOT been tested against `dev_v1` yet — see "Manual
   audit" below for what happens first.
4. Re-test on `dev_v1`, verify all prior regression cases still hold, run `heldout_v1` only as
   a regression check (not for tuning), then draw a genuinely fresh, never-touched holdout for
   the real cold generalization test — `heldout_v1`'s errors are now documented in this file,
   so it can no longer serve as a blind test for v3 or later.
5. Before the 45k run: a genuine random-sample cost pilot (not adversarial) to replace the
   ~$385–482 estimate with a real number.

## Manual audit (2026-09-02, before v3 is tested)

Before spending more OpenRouter credit on a v3 run, a 25-post manual audit was prepared for
human review — the goal is checking that the model's actual behavior matches the real product
standard for "credible real wedding," not just the hand-labeled metrics. All 25 are drawn from
`dev_v1` only (`classifier_version='v2'`) — `heldout_v1` was not touched, staying a pure
regression set as instructed.

- `docs/engineering/post-classification/audits/v2-manual-audit.md` — the audit itself: 25
  posts across four buckets (11 low-confidence INCLUDE, 4 confirmed thin-evidence false
  positives, 5 REVIEW spanning the confidence range, 5 EXCLUDE nearest the 0.5 boundary), each
  with the classifier's decision/confidence/evidence, the account classification, the raw
  post data, and the existing `dev_v1` hand-label shown as context (explicitly not
  authoritative — the point is an independent human read, not confirming the existing label).
- `apps/web/scripts/classify/data/audit_v2_judgments_template.json` — empty
  `{post_url, expected_decision, exclusion_reason, notes}` template, one entry per audited
  post, ready for `loadGoldenSet.ts` once judgments are filled in. **Nothing has been filled
  in — these are real human judgments to be provided, not invented.**

Once judgments arrive: load them into `golden_set` (a new `source_note`, e.g.
`manual_audit_v2`) so they become permanent regression cases, THEN run v3 against `dev_v1`
(v3 is implemented but not yet executed) and proceed with the comparison plan in item 4 above.

## V3 canary (2026-09-03)

Manual audit judgments arrived, got loaded into `golden_set` as `dev_v1_manual_audit_v2`, and
V3 (the carve-out-placement + vendor-stack-sufficiency fixes from "Ship/no-ship" items 1-2,
already implemented but not yet tested) was evaluated — first against the golden sets (pooled
precision **0.941**, recall 0.762, F1 0.842, 6 FP/551 — heldout-only precision 0.917,
bootstrap-sample precision 0.905), then against a genuine **3,000-post production canary**
(not adversarial — reproducible stratified random sample of the real 47,623-post corpus, exact
methodology and query in `apps/web/scripts/classify/data/canary_v3_README.md`). Canary result:
INCLUDE 583 (19.4%) / REVIEW 198 (6.6%) / EXCLUDE 2,219 (74.0%), distribution consistent with
the golden sets (no red flag), $9.87/1k cost. A 240-post human-audit sample was built from the
canary (`apps/web/scripts/classify/data/audit/`, methodology in
`v3-canary-audit-README.md`) to sanity-check real output against the actual product bar
("would I be happy showing this to a user") — **deprioritized, not run**, once the pivot below
made a full-corpus decision moot for now; the samples are untouched and reusable later.

A separate routing-economics analysis (confidence-threshold escalation, deterministic-rule
expansion, account-level suppression) confirmed the current tiered architecture is close to its
efficient frontier for the precision bar this product requires — every cheaper alternative
traded precision away roughly 1:1 with the cost saved. **V3 was frozen at this point** — no
further prompt/rubric/routing changes without a production-blocking bug, per explicit
instruction.

## Candidate-generation pivot (2026-09-03)

With V3 frozen and canary-verified, the question became: does V1 need the full 47,623-post
corpus classified before shipping, at an estimated ~$470? Full write-up, methodology, and every
number in this section: `candidate-generation-analysis.md`.

Short version: a zero-LLM-cost deterministic score (vendor-role-mention depth via the existing
`accounts`/`v_account_role` graph join, wedding-keyword/Chicago-hint regex reused from
`prefilter.ts`, negative-signal penalties for styled/editorial and promo language) was measured
against golden-set ground truth. Vendor-stack signals alone aren't sufficient (60-83% precision,
well short of V3's 94.1%) — but at the top of the combined score's distribution, precision
becomes competitive with V3 itself (93-97% on a small golden-set sample). The score was
implemented for real (`candidateScore.ts`/`runCandidateScore.ts`, not just the analysis's
scratch SQL) and run over the full corpus for free, producing `candidate_scores`. Score≥12 was
chosen as the V1 cutoff: 5,225 candidates, ~$118 estimated V3 cost — a 75% reduction vs. the
full corpus, at V3's own precision on whatever ships.

## V1 shipped (2026-09-03)

The 5,225-candidate pool ran through the frozen, unmodified V3 pipeline
(`runClassify.ts --version v3 --post-urls-file scripts/classify/data/v1/candidates_score_ge12.csv`).
One real operational incident mid-run: `NEW_OPENROUTER_API_KEY` hit a **per-key** monthly
spending limit (distinct from the account's overall balance and the workspace-wide budget — a
setting on the key itself) at 1,510/5,225; the circuit breaker aborted cleanly (verified: zero
duplicate/orphaned rows), the limit was raised, and the same idempotent command resumed and
finished the remaining candidates untouched. 4 posts errored on malformed/truncated JSON in the
model's tool-call response (not retryable by the existing 429/network-exception retry logic,
isolated to those 4, zero partial writes).

**Final: 4,033 INCLUDE / 143 REVIEW / 1,045 EXCLUDE / 4 errored, $116.94 total** (~1% under the
pre-run estimate). `v1_content_corpus` (view in `pipeline/schema.sql`) resolves the latest
`v3`-specific decision directly from `post_classification_runs` — not the cross-version
`post_classifications_current`, which goes stale for one version once a newer one supersedes
shared posts (same bug class as D012) — filtered to `candidate_score>=12 AND decision='INCLUDE'`.
Verified live against the app's own `lib/server/db.ts` connection (not just `psql`): the view
is queryable and returns correct data through the exact code path the product uses.

**Product integration**: `/feed` (`apps/web/app/feed/page.tsx`, `V1FeedCard.tsx`,
`lib/server/v1corpus.ts`) is a new, additive route — paginated, sorted by candidate score,
reusing the existing `InstagramEmbed` component. Known gap: unlike `WeddingFeedCard`, it doesn't
check the `accounts.embeds_disabled` opt-out (that data is keyed to Ben's separate graph, which
most V1-corpus owner accounts aren't part of) — an opted-out account's embed will show blank
rather than falling back to a caption card. Vendor profile pages (`/vendors/[username]`) are
**not** wired to this data at all — they still only show Ben's separate wedding-graph content,
even for an account that also has V1-corpus posts (confirmed live: `chicagoilluminatingcompany`
shows Ben's graph count on `/vendors/chicagoilluminatingcompany`, unrelated to its 101
`v1_content_corpus` posts, visible only on `/feed`).

**What's deliberately not done, per the "product validation over model optimization" shift**: no
V4, no further prompt/rubric tuning, the 240-post canary audit not run, the remaining ~42,398
posts (score <12) not classified. See `candidate-generation-analysis.md` Part 9 Q7 for the
specific recall this pivot gives up (real weddings whose vendors aren't in Ben's account-role
graph yet) and how to recover it later — nothing about the pivot forecloses eventually running
the rest of the corpus once there's real product/user feedback to justify it.

## Embeddings / clustering (mission requirement 8)

Investigated, not built: OpenRouter's `/models` catalog (verified live) carries **no
embedding models at all** — it's a chat-completions proxy only, confirmed by both an empty
catalog search and a direct `POST /embeddings` call. Getting real embeddings means either a
separate provider key (OpenAI, Voyage, Cohere) or reusing a chat model's hidden state, which
isn't exposed via any API. `errorAnalysis.ts` ships a lightweight embedding-free
alternative instead: greedy Jaccard-merge clustering of EXCLUDE posts by shared hashtags
(the same merge algorithm `pipeline/pipeline.py`'s `phase_dedup` already uses for wedding
deduplication, reused here for consistency) — a cluster of posts sharing the same
`exclusion_reason` and a large hashtag overlap is a candidate for a new deterministic rule
instead of paying LLM cost for the same pattern repeatedly. Real embeddings are worth
revisiting if hashtag clustering proves too coarse once live classification results exist —
not before, per the mission's "don't add technology for its own sake."

## Files

```
apps/web/scripts/classify/
  contract.ts           the classification contract + vocabularies
  db.ts                 Postgres connection (Supabase by default, LOCAL_PG=1 for rehearsal DB)
  source.ts             staging.instagram_posts → PostContext, known-vendor cross-reference
  prefilter.ts           tier 0 — deterministic, $0, EXCLUDE-only or defer
  openrouter.ts          thin OpenRouter client, forced tool-call structured output
  llmClassifier.ts        tier 2/3 — cheap_model / expensive_model, one shared prompt
  accountClassifier.ts    account archetype prior (requirement 7)
  persist.ts              DB writes + idempotent-rerun hash lookup
  runClassify.ts           orchestrator: tiering, concurrency, budget cap, idempotent skip
  runAccountClassify.ts    orchestrator for the account classifier
  evalHarness.ts           precision/recall/F1/confusion matrix/FP/FN/calibration/by-category vs golden_set
                             (--source-note filters to dev_v1/heldout_v1/bootstrap_v0_stratified_sample)
  costReport.ts            ship-decision summary: INCLUDE precision (gate), REVIEW rate, tier
                             distribution, cost/1k, extrapolated 45k cost
  errorAnalysis.ts         account rollup, exclusion-reason breakdown, hashtag clustering
  sampleForReview.ts       ranks unlabeled posts by expected information value for human review
  findStale.ts             finds posts due for reclassification (behind a version / low
                             confidence / old classified_at) — prints a URL list for --post-urls-file
  loadGoldenSet.ts         the only writer of golden_set
  candidateScore.ts        deterministic candidate-generation score (candidate-score-v1) — NOT
                             a classifier tier, runs before classification, $0
  runCandidateScore.ts     orchestrator: scores the full corpus, persists to candidate_scores
  data/golden_set_v0.json          the bootstrap 120-post hand-labeled set
  data/dev_labels_v1.json          216-post adversarial dev set (prompt iteration — never eval)
  data/heldout_labels_v1.json      215-post adversarial held-out set (generalization test only)
  data/labeling_rubric.md          the labeling methodology used for dev_v1/heldout_v1
  data/canary_v3_3000.csv          the 3,000-post production canary + methodology (canary_v3_README.md)
  data/audit/                      240-post human-audit sample built from the canary (deprioritized, not run)
  data/v1/candidates_score_ge12.csv   the exact 5,225-post V1 candidate pool that shipped
```

Schema: `pipeline/schema.sql` — `post_classification_runs`/`post_classifications_current`,
`golden_set`, `account_classification_runs`/`account_classifications_current` (applied
2026-09-02), plus `candidate_scores` and `v1_content_corpus` (applied 2026-09-03, additive —
see "V1 shipped" above). All applied directly to Supabase; no separate migrations mechanism in
this repo.

Product: `apps/web/lib/server/v1corpus.ts`, `apps/web/app/feed/page.tsx`,
`apps/web/app/components/V1FeedCard.tsx` — the `/feed` route serving `v1_content_corpus`.
