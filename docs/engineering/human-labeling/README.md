# Human labeling — golden dataset, and turning it into graph growth

**Status (2026-09-06): labeling UI shipped, golden dataset built (1,955+
rows), human-confirmed-evidence pipeline built and run through candidate
generation, content/entity layers explicitly separated. Production graph
writes not yet made — pending human review of the candidate list.**

This mission has two independent, deliberately separate loops. Confusing
them — treating "human confirmed a real wedding" as if it also confirmed
Chicago relevance, vendor correctness, or graph-readiness — is exactly the
mistake this doc exists to prevent.

## Content eligibility ≠ structured-entity eligibility (read this first)

**"Real wedding content" and "a structured wedding entity" are different
questions, and evidence sufficient for one is not automatically sufficient
for the other.** This was learned the hard way: an early version of the
human-confirmed-evidence pipeline (below) required a 3+-distinct-role
vendor credit stack to even be considered — a requirement that exists for
a real, narrow reason (building a multi-vendor `weddings` graph entity
needs multiple corroborating credits), but that requirement got read as if
it were the answer to a completely different question: "is this real
wedding content worth showing someone researching a vendor?" That made 742
confirmed real Chicago weddings look like only 18 were usable. They were
never the same question — and worse, the 69-candidate sample that produced
that 18 was *conditioned* on rich vendor-stack richness, which correlates
heavily with generic vendor/venue self-promotion (marketing posts credit
collaborators just as generously as real documented weddings do) — so that
finding was about rich-stack posts specifically, not the general
population. Confirmed directly: the same "looks like marketing" pattern
appears in only 3 of the full 742, not anywhere near 51/69's rate.

**Two layers, explicit, independently queryable, never collapsed:**

- **Layer 1 — content eligibility** (`human_confirmed_chicago_wedding_content`,
  `pipeline/schema.sql`): *"is this credible Chicago wedding content worth
  showing on a vendor's page?"* Bar: `golden_set` WEDDING + confirmed
  Chicago relevance (`human_confirmed_post_geography`). **Nothing else.**
  No vendor-attribution, no credit-stack richness, no couple-naming, no
  clustering, no reconciliation requirement. **639 posts, as of this
  write-up** (`select count(*) from human_confirmed_chicago_wedding_content`).
- **Layer 2 — structured graph entity** (everything under "Loop 2" below):
  *"do we have enough evidence to create/strengthen a multi-vendor
  `weddings` row in Ben's graph?"* Stays deliberately conservative — 3+-role
  credit stack, clustering, reconciliation, human approval. Currently 140
  candidates, 69 of them Chicago-confirmed and reconciled, pending
  hand-review before any write.

**A single post can be excellent Layer-1 content and weak Layer-2
evidence, or both, or neither — that's fine, by design.** A real,
Chicago-relevant post crediting only a photographer is legitimate content
for that photographer's page even though it can never build a full
multi-vendor structured entity on its own.

`human_confirmed_post_geography` resolves Chicago relevance **per post**,
independent of clustering — a real architectural gap this reframing fixed:
Chicago relevance used to only ever get computed for posts that had
already survived the narrow 3+-role clustering filter, welding a genuinely
separate fact (where did this event happen) to the narrow pipeline that
happened to need it first. It's a plain SQL view over already-durable,
already-immutable evidence (extracted vendor credits, `account_locations`,
caption/`location_tag` text) — changing the resolution rule later is a
`CREATE OR REPLACE VIEW`, never a relabel, never a deletion, and every
underlying observation (`golden_set`, `stack_extraction_entries`) stays
fully intact regardless of how the rule evolves. Two real bugs were caught
and fixed while building this (a non-unique `vendors.account_id` silently
fanning one post into multiple result rows, and an early version
arbitrarily picking one of several credited venue accounts on posts with
more than one — fixed to prefer *any* positive signal across all credited
venues rather than guessing). A 15-post spot-check of newly-surfaced
Layer-1-only content found it mostly sound, plus two genuine mislabels
(a beauty-tutorial post and an engagement-session/marketing post that
never should have been labeled WEDDING in the first place) — a residual
labeling-accuracy issue from the fast keyboard-driven review pass, not an
architecture problem, and not chased further per explicit scope
discipline (no additional broad manual review).

The other dimensions — vendor attribution
(`human_confirmed_post_vendor_evidence`, already unconditioned on role
count), structured-stack richness (3+ roles), and candidate/reconciliation
linkage — remain independent, joinable, non-gating signals a consumer can
pull alongside Layer-1 content without any of them affecting inclusion.

```
LOOP 1 (general): RAW CORPUS -> sample -> golden set -> measure classifier
                   -> error analysis -> targeted labeling -> repeat

LOOP 2 (specific): HUMAN-CONFIRMED WEDDING -> extraction -> vendor evidence
                    -> geography check -> wedding candidate -> reconciliation
                    -> human approval -> production graph
```

## Vendor association: author counts too, still non-gating (D046)

A follow-up correction to the same principle above, one layer deeper.
`human_confirmed_post_vendor_evidence` only ever captured vendors
**tagged/credited in caption text** — it had no notion of "the post's own
author is itself a known vendor." A venue posting about a real wedding it
hosted, crediting no one else, looked like zero vendor association even
though the venue *is* the vendor. Of the 639 Layer-1 posts, 433 had a
tagged vendor; of the other 206, **146 turned out to be authored by an
account bridged to `vendors`** — so the real split was 579 posts with
*some* vendor connection (author or credit), only 60 with genuinely none.

The temptation was to fold this into a Layer-1 gate (639 → 579). Rejected:
*"Don't make a downstream use-case requirement a prerequisite for
retaining upstream evidence."* Whether a post can be routed to a specific
vendor's page is a different question from whether it's useful, credible
wedding content — a post can be excellent content with zero identifiable
vendor (it's still real, still Chicago, still worth learning from), just
not routable to a page yet. Instead:

- `human_confirmed_post_vendor_association` (view) — one row per
  `golden_set` INCLUDE post (all 817, not just Layer 1), with explicit
  provenance: `author_is_vendor`, `tagged_vendor_count`,
  `has_vendor_association`, `vendor_association_type` ∈ {`AUTHOR_ONLY`,
  `TAGGED_ONLY`, `BOTH`, `NONE`}. Full-corpus breakdown: 236 / 62 / 414 /
  105. Layer-1 subset: 146 / 50 / 383 / 60.
- `human_confirmed_vendor_page_content` (view) — the actual vendor-page
  selection: Layer 1 ∩ `has_vendor_association` = **579**. This is one
  downstream consumer's own stricter requirement, applied at query time —
  it does not redefine Layer 1, which stays at 639.

Edge case found, explicitly **not** fixed as part of this: 75 of the 817
current `golden_set` INCLUDE rows exist only in `public.posts`, and
`human_confirmed_post_geography` (Layer 1's Chicago-relevance resolver)
only resolves posts present in `staging.instagram_posts` — so those 75 are
invisible to Layer 1 entirely, independent of their Chicago status. Flagged
as a candidate for a future, separate fix (widen that view's join the way
`getQueueBatch` in `apps/web/lib/server/labeling.ts` already handles both
corpora). Full numbers reproducible via
`apps/web/scripts/graph/reportVendorAssociation.ts`; regression tests in
`apps/web/scripts/graph/vendorAssociation.test.ts`. See D046 for the full
decision record.

## Loop 1: the labeling UI and what it found

`/label` (`apps/web/app/label/`) — a keyboard-driven review page (W/N/U/
Space/B/Z), backed by an append-only `human_post_labels` table (relabeling
never destroys a prior observation) and a frozen, resumable `label_queue`.
Full design: see the plan history in this mission's session; schema in
`pipeline/schema.sql`'s "Human post labeling" section.

Queue `v2` spans both corpora deliberately — "give me everything ... so we
receive value all over our funnel, not just in specific pockets" — random
baseline + the shipped `/feed` corpus + the classifier's decision boundary +
the deliberately-unclassified majority (`staging.instagram_posts`), plus a
random sample of `public.posts` (Ben's venue-tagged crawl, the live serving
graph, which had almost no prior human review at all).

**What it found** (see `docs/decisions.md` and this session's own numbers
for the full breakdown): `/feed` is trustworthy (97%+ human-confirmed
precision, matching V3's own claimed number). The real finding is
elsewhere — a ~32-40% real-wedding rate in populations the classifier never
touches or actively excludes:

| population | human WEDDING rate |
|---|---|
| `/feed` (V3 INCLUDE) | ~97% |
| V3 EXCLUDE/REVIEW at the score≥12 boundary | ~51% |
| never classified at all (score<12, 89% of the corpus) | ~32-40% |
| Ben's `public.posts`, random sample | ~38% |

**Strategic framing, deliberately**: the objective is not "optimize the
existing 4K `/feed` dataset." It's "build a system that efficiently
discovers the true wedding dataset from the 47K corpus." The numbers above
say a substantial population of real weddings likely still sits
undiscovered under the current classified slice — don't read the labeling
pace stabilizing as "the corpus is now understood."

**Golden dataset**: 1,955 rows in `golden_set` as of this write-up (was 656
before this mission), synced via `syncHumanLabelsToGoldenSet.ts`
(`source_note` prefixed `human_review_ui_v2_...`, upsert-only, skips
existing rows by default). `labelingProgress.ts` reports human-vs-V3
disagreement as a first-class, bucketed metric — the direct, ongoing answer
to "where is V3 actually failing," and eventually "what fraction of the 47K
can be classified deterministically/cheaply before needing an LLM or
human."

## Loop 2: human-confirmed wedding posts -> graph growth

**A human WEDDING label does not, by itself, establish**: Chicago
relevance, that credited accounts are real vendors, that the extracted
stack is correct, that multiple posts belong to the same wedding, or that
the result belongs in production. Every stage below is a real, separate
gate — never collapsed.

```
human label (golden_set) -> extraction -> vendor evidence -> geography
check -> wedding candidate -> reconciliation -> human approval -> graph
```

### Why this was possible at all

The existing graph-strengthening pipeline
(`docs/engineering/graph-strengthening/ingestion-design.md`) already turns
Jeremy's evidence into wedding candidates — but only for posts with
`candidate_scores.score >= 12` **and** the latest V3 run's `decision =
'INCLUDE'` (`jeremy_post_vendor_evidence`, `pipeline/schema.sql`). Both
gates were deliberate (D014: full V3 classification priced at ~$470,
deferred; D017: INCLUDE-only, specifically to avoid `destination_wedding`
geography pollution, explicitly "deferred, not decided against
permanently... revisit once INCLUDE ingestion is proven out") — and D017's
own precondition was already met by D023/D035-D039 (240 weddings created,
additive, idempotent, zero false merges found across every audit).

### What was built

- **`runStackParserOnGoldenSet.ts`** — runs the same stack parser
  (`stack-parser-ts-v3`) over golden_set-confirmed WEDDING posts that never
  had extraction run at all (because they scored below 12), writing into
  the same append-only `stack_extraction_entries`/`stack_extraction_runs`
  tables, tagged `decision='HUMAN_INCLUDE'`.
- **`human_confirmed_post_vendor_evidence`** (view, `pipeline/schema.sql`)
  — same shape as `jeremy_post_vendor_evidence`, but gated on `golden_set`
  instead of `candidate_scores`/V3. **Deliberately not unioned** with the
  existing view — classifier-derived and human-confirmed evidence have
  different confidence/provenance semantics and stay independently
  queryable, so no downstream consumer can accidentally treat them as
  interchangeable.
- **`runJeremyWeddingClustering.ts --evidence-source human_confirmed`** —
  the same clustering algorithm, reading from the human-confirmed view
  instead, writing under a *different* `clustering_version`
  (`human-confirmed-v1`) so the two candidate populations never mix. Most
  human-confirmed posts never had a V3 run, so date evidence comes from
  `staging.instagram_posts.post_timestamp` directly rather than
  `post_classification_runs`.
- **`jeremy_wedding_candidates.chicago_status`** (new column) — an explicit
  tri-state (`CHICAGO_CONFIRMED`/`CHICAGO_NOT_CONFIRMED`/
  `CHICAGO_AMBIGUOUS`), computed once per human-confirmed candidate from
  `account_locations.in_metro` — never a boolean, never silently inferred.
  Null for V3-sourced candidates (geography already resolved upstream, not
  applicable). Only `CHICAGO_CONFIRMED` is eligible for unattended-style
  inclusion in a future creation batch; the other two states are surfaced
  for review, never guessed either direction.
- **`jeremy_wedding_candidate_reconciliation`,
  `createWeddingsFromJeremyEvidence.ts`** — reused completely unchanged.
  Reconciliation has no population filter beyond a resolved venue, so it
  picked up the new candidates automatically on the next run.
- **`jeremy_wedding_candidate_vendors`** (view) — extended to resolve a
  candidate's vendor list from whichever evidence view actually clustered
  it (a `union all`). This is a read-side rollup keyed by an
  already-decided `candidate_id` (one post belongs to exactly one
  candidate), not a blended discovery pool — it does not reopen the
  "don't merge evidence" concern above, which is specifically about
  clustering picking from an ambiguous shared pool.
- **`labelingProgress.ts`** — confusion matrix now breaks down by sampling
  bucket, not just in aggregate.
- **`notedNonWeddingPosts.ts`** — surfaces every NOT_WEDDING-labeled post
  with a human note attached (242 as of this write-up), for the open
  "vendor-attributed non-wedding content might have value for something
  else" question below.

### Results (Layer 2 only — the structured-entity pipeline; see above for Layer 1's 639)

| stage | count |
|---|---|
| Human-confirmed WEDDING posts (staging corpus) | 742 |
| Already evidence before this pipeline | 280 |
| **Previously completely unused** | **462** |
| Already had a parsed stack | 1,284 |
| Newly extracted this pass | 354 |
| Posts with a usable (3+ role) vendor stack | 418 |
| New wedding candidates (`human-confirmed-v1`) | 140 |
| — Chicago-confirmed | 69 |
| — Chicago-ambiguous / not-confirmed / no venue | 71 |
| Reconciled: would attach to an existing Ben wedding | 15 (41 vendor relationships) |
| Reconciled: would create a genuinely new wedding | 54 (417 vendor relationships) |
| **Graph-eligible without further review** | **69** |
| Requires human review before any write | 71 |
| Production graph additions so far | **0 — pending human review** |

**Graph value per labeling-minute** (active time, using the same
gap-excluding methodology as the labeling-throughput numbers above): ~0.59
new candidates, ~0.29 graph-eligible candidates, **~1.9 new/strengthened
vendor relationships**, per minute of actual labeling.

### Next step (not done here — needs a human)

**This is a Layer-2 (structured entity) next step only — it does not gate
Layer-1 content, which is already live as a queryable 639-post corpus
independent of any of this.** The 69 Chicago-confirmed, reconciled
candidates are ready for the same hand-review + explicit candidate-ID-list
bar every prior batch in this mission used (D035 pilot, D036/D039 Phase
1/2) — `createWeddingsFromJeremyEvidence.ts` takes a hardcoded,
individually-reviewed ID list by design, never a `--limit` flag. A hand
review of these 69 (`docs/engineering/human-labeling/human-confirmed-candidates-review.md`)
found only 18 hold up as genuinely specific weddings on a strict rubric
read — a Layer-2-specific finding (conditioned on the rich-stack sample),
not evidence about the broader 639. Re-run `reportHumanConfirmedGraphValue.ts`
for the current candidate IDs, hand-verify the thinnest ones (same
duplicate-check scripts as before), then add a new named array to that
script and run `--dry-run` first.

## Open question, not resolved here: non-wedding vendor content

Independent rediscovery of an already-flagged, never-resolved question:
`docs/engineering/graph-strengthening/README.md` ("EXCLUDE posts are
almost as stack-rich as INCLUDE... a genuine open question for later") and
the end of **D016** ("whether EXCLUDE posts' vendor relationships belong in
the graph for a different purpose is an open product question").
`notedNonWeddingPosts.ts` surfaces 242 NOT_WEDDING posts with a human note
— a mix of "here's why this doesn't count" and genuine "this is useful
vendor/venue-showcase content, just not a real wedding" callouts (e.g. a
venue-founder marketing post, several styled/portfolio shots). Not common
enough, or distinguished enough in the data yet, to justify a new schema
field or product surface — worth reviewing the noted list by hand before
deciding whether it's worth formalizing.

## Explicitly out of scope for this mission

No V3 rebuild, no multimodal classification, no embeddings, no active-learning
framework, no redesign of Ben's wedding identity, no reopening of the D022
clustering-boundary investigation.
