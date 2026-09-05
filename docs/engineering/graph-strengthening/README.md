# Graph strengthening — using the V1 corpus to enrich the wedding/vendor graph

**Status (2026-09-04, superseded — see below): this file documents the parser-iteration phase
only (D016–D017).** The workstream has since gone much further: a durable evidence/candidate/
reconciliation layer (D019, `docs/engineering/graph-strengthening/ingestion-design.md`), a
reconciliation audit (D020, `reconciliation-audit-143.md`), a reconciliation evidence floor
(D021), a clustering order-dependence investigation (D022,
`clustering-boundary-investigation.md`), and — as of D023 — **the first production write**: the
143 high-confidence reconciliation matches are now ingested into Ben's `wedding_vendors` (100
genuinely new rows, additive-only, fully provenance-logged). Merged to `main` via
`dewwey-hq/dewwey#1` (D024/D025). Ambiguous-tier audit closed without ingestion (D030,
`docs/engineering/graph-strengthening/ambiguous-tier-audit-handoff.md`). Current state,
remaining open decisions, and next missions: `ROADMAP.md` "Shipped"/"Next" and
`docs/decisions.md` D016–D031. The parser-iteration detail below (D016/D017) is still
accurate as history, just no longer the current frontier.

**Original status note (2026-09-03), kept for context:** baseline + eval set built, two
iterations shipped and regression-tested (`stack-parser-ts-v2`: role-accuracy `ROLE_MAP` fixes;
`stack-parser-ts-v3`: the no-colon recall fix). 96.8% precision, 92.4% recall, 83.2% role accuracy
against real ground truth. Ingestion population decided: **INCLUDE only** for now (see "Open
questions").

**Goal, restated (not "improve the parser"):** use the 4,033 V3-validated INCLUDE posts (see
`docs/engineering/post-classification/`) to add real, high-quality vendor relationships to the
wedding/vendor graph Ben's crawler built — and measure whether that actually works, rather than
assume it.

## What exists today (reconciled against ROADMAP, which was stale)

Ben's stack parser (`pipeline/pipeline.py`'s `LINE`/`HANDLE`/`ROLE_MAP`/`norm`/`parse_caption`)
has never touched Jeremy's corpus (`staging.instagram_posts`) — it only runs, in Python, against
Ben's own `posts` table (populated by his own tagged-feed crawler). There's no existing bridge.
Per the sandbox's no-Python-packages constraint (same reason the classifier is TS, see D009),
ported it faithfully to `apps/web/scripts/graph/stackParser.ts` — a pure, read-only
`caption -> extracted stack` function, not a graph-writer. `STACK_PARSER_VERSION` tags every run
(`stack-parser-ts-v1` baseline, `stack-parser-ts-v2` iteration 1).

Baseline/eval infrastructure (all additive, new tables, zero production graph tables touched):
- `candidate_scores`/`v1_content_corpus`-scoped extraction: `stack_extraction_runs` (one row per
  post: has_stack, entry/role counts, at extraction time's V3 decision) and
  `stack_extraction_entries` (one row per extracted (role_raw, role, handle, line_no)) — run via
  `runStackParserBaseline.ts` over the full 5,225-candidate pool (not just the 4,033 INCLUDE —
  useful for the INCLUDE-vs-EXCLUDE-vs-REVIEW comparison the hypothesis needed).
- `vendor_extraction_golden_set` — human-quality ground truth (**not** the parser's own output),
  134 posts stratified across 11 failure-mode categories, 92 eval / 42 held-out (the held-out
  portion was never used to pick iteration 1's changes). Loaded via `loadVendorGoldenSet.ts` from
  `apps/web/scripts/graph/data/labeling_chunks/*_labeled.json` — 4 independent review passes
  reading raw captions fresh, versioned `source_note='vendor_gs_v1'` (append-only; a v2 labeling
  pass would get its own source_note, not overwrite this one).

## Baseline findings (stack-parser-ts-v1, no ground truth yet)

Full numbers in the session transcript; headline results:
- 71.2% of INCLUDE posts have a 3+-role stack, 32,068 total extracted entries, 5,508 unique
  vendor handles — **57.3% new to Ben's graph** (`accounts`), **65.4% of extracted (vendor,role)
  pairs not already in `wedding_vendors`**.
- EXCLUDE posts are almost as stack-rich as INCLUDE (68.7% vs. 71.2% has_stack) — credit-stack
  presence alone doesn't track V3's decision. `destination_wedding`/`styled_or_editorial`
  EXCLUDEs carry the richest stacks of any exclusion reason (76-79% has_stack) — real vendor
  data, just not Chicago-relevant or not-a-real-event; a genuine open question for later, not
  resolved here.
- High-mention vendors checked for the repost/template artifact found earlier in the
  candidate-generation analysis (e.g. `diamondpeakfilms` posting an identical 17-role list 3
  times) — **not present** here: top vendors' distinct-caption counts ≈ their post counts, so V3
  filtering appears to already screen out that pattern.
- `ROLE_MAP` gaps found by inspection (later confirmed against real ground truth, see below):
  `other` is the single largest role bucket (~15% of extractions); `band`/`content_creator` are
  real `vendor_role` enum values the parser never targets at all; several safe keyword misses
  (`Flowers`, `Stationary` misspelling, `MUA`, `Bakery`); `Bride`/`Groom`/`Couple`/`Ceremony`/
  `Reception`/`Bridesmaids` labels get treated as vendor credits when they're wedding-party/
  event-phase labels, not vendors.

## Eval set results (ground truth, not parser self-report)

| | Precision | Recall | Role accuracy (any-match) |
|---|---|---|---|
| **v1** (eval / held-out / pooled) | 96.8% / 95.7% / 96.4% | 80.6% / 86.8% / 82.6% | 68.0% pooled |
| **v2** | *(unchanged — see below)* | *(unchanged)* | **74.9% pooled** |

Precision and recall are architecturally unchanged by v2 (`ROLE_MAP` only changes which role a
label normalizes to, not which lines/handles get extracted at all) — verified directly, not
assumed: 96.4%/82.6% pooled both before and after.

**Precision is genuinely excellent already** — when the parser says "this is a vendor," it's
right 96% of the time. **Recall's real gap (17.4%) is almost entirely a text-FORMAT problem**,
confirmed independently by all 4 labelers on disjoint post sets: captions using "Role @handle"
(no colon), an emoji between the role word and the colon, or reversed "@handle - Role" order
lose the large majority of their credits. This is the single biggest lever available and was
**deliberately not touched in iteration 1** — it needs a `LINE`-regex change, a bigger and
riskier "bounded change" than a `ROLE_MAP` keyword bundle, and deserves its own isolated
before/after against this same eval set.

## Iteration 1 (`stack-parser-ts-v2`) — role-accuracy fixes

Chosen from measured mismatch counts, not guesswork (v1's role accuracy was 80.7% among
parser-extracted vendors / 68.0% any-match against all ground-truth vendors):

1. Added `band` and `content_creator` as real `ROLE_MAP` targets — both are `vendor_role` enum
   values v1 never emitted at all (verified: 0 posts corpus-wide). Fixes 35 (`musician`→`band`) +
   3 (`dj`→`band`) + 10 (`videographer`→`content_creator`) measured mismatches. Does **not** fix
   the separate, harder "Wedding Bands" (= rings, a jeweler credit) semantic collision found in
   eval — smaller, genuinely ambiguous, deferred.
2. `reception`/`ceremony`/`church`/`parish` → `venue` — but **not** as plain substrings like
   every other `ROLE_MAP` entry. First attempt did that; the regression test (re-running the
   full 134-post eval set, not just eyeballing the motivating cases) caught 3 new wrong
   classifications it introduced — "Ceremony Musicians", "Reception Dress", "Korean Tea
   Ceremony" all false-triggered `venue`, because ceremony/reception are common *modifiers* on
   other roles, not just venue labels standing alone. Fixed with a small whitelist
   (`EVENT_PHASE_VENUE_LABELS` in `stackParser.ts`) requiring the label to be (close to) just
   the event-phase word, not a compound label. Re-ran the eval again: **0 regressions**, all 3
   original false positives resolved, the ~27 real fixes intact. (Same lesson as D010's
   `prefilter-v2` regression: "fixed the motivating case" isn't "fixed without regressing" —
   only a full eval re-run catches the difference.)
3. `coordinat` → `planner` (17 mismatches), `flow` → `florist` (9), `stationary` (misspelling) →
   `stationery`, `bakery` → `cake`, `mua` → `beauty_other`, `shoe`/`outfit`/`menswear`/
   `alteration` → `attire`.

**Deliberately not touched this iteration** (candidates for future ones, each with its own
reason): the `hair` keyword is dangerously short (caught "Chairs" twice independently in eval —
needs its own fix, not a quick add); `Bridesmaids`/`groom` labels are genuinely ambiguous
(sometimes a real attire-vendor credit like `Bridesmaids: @bhldn`, sometimes wedding-party
noise — not safe to blind-map either way); combined-line structural bugs (`Photo/Video:` only
capturing one role, pipe-delimited multi-credit lines assigning the first segment's role to
every handle on the line) change the `LINE`-matching logic itself, not `ROLE_MAP`; the recall
lever above.

**Result: 106 real fixes, 0 regressions** (measured with proper any-match semantics — an early,
naive pairwise-join comparison falsely reported 26 "regressions" that turned out to be a
measurement artifact from vendors legitimately credited under 2+ different roles in the same
post, e.g. a beauty studio doing both hair and makeup — worth remembering for any future
comparison query against this table). Role accuracy (any-match, pooled): 68.0% → 74.9%.

## Iteration 2 (`stack-parser-ts-v3`) — the no-colon recall fix

Isolated, single bounded change (kept separate from iteration 1's `ROLE_MAP` bundle on purpose —
different risk profile, needs its own before/after): added `NOCOLON_LINE`, a fallback pattern
tried only when the proven colon/pipe/dash-separator `LINE` regex doesn't match a line. Real
captions were pulled and read before writing the regex (not guessed) — e.g. `"Venue
@chicagoilluminatingcompany"`, `"Menu Cards@ericksondesignchicago"` (zero space).

Deliberately **stricter** than `LINE` where `LINE` relies on the colon for structural signal:
requires an uppercase first letter (every real example was Title Case) and requires the entire
remainder of the line to be just handle(s) — no interspersed prose words, unlike `LINE`'s looser
`(.*@.*)$`. This was a real precision risk (a stray "Follow us @handle for more content!"-shaped
line could false-trigger) — verified against two hand-written adversarial captions before
running the real eval, both correctly rejected (the constraint that nothing but handles can
follow the label is what saves them — trailing prose breaks the match).

**Eval-set result**: recall 82.6% → **92.4%** pooled (eval 80.6%→91.6%, held-out 86.8%→94.0%),
precision held — actually ticked up slightly, 96.4%→96.8% (no regression, small positive noise).
Role accuracy (any-match) 74.9%→83.2%. Only one previously-unlabeled extraction appeared in the
re-run (a real credit line the eval labelers never saw because v1/v2 never extracted it to show
them) — checked the actual caption directly: genuine true positive
(`"Planning @shannongailevents"`), not a bug.

**Deliberately not touched this iteration** (real, confirmed issues from the eval — each needs
its own isolated change): emoji between a role word and its colon breaking the *existing*
colon-based match; reversed `"@handle - Role"` order; pipe-delimited multi-credit lines
assigning the first segment's role to every handle on the line.

## Cost

$0 across the entire baseline + both eval-informed iterations. No LLM calls proposed or made —
every change here is deterministic and was measured against real ground truth, not estimated.

## Open questions, not resolved here

- ~~Do `destination_wedding`/`styled_or_editorial` EXCLUDE posts' vendor relationships belong in
  the graph at all~~ — **Decided (2026-09-04): no, not for now.** Ingestion population is
  INCLUDE only. Destination-wedding relationships specifically would pollute a Chicago-focused
  graph (real vendors, wrong geography); EXCLUDE more broadly can revisit later once INCLUDE
  ingestion is proven out, not before.
- **New consideration (2026-09-04, not yet implemented): a minimum-evidence display threshold
  for non-venue vendors.** A vendor confirmed by only 1 wedding might still be worth storing
  (it's real data) but not necessarily worth *surfacing* in the product UI — the working idea is
  that venues are worth showing even at n=1 (users are specifically browsing venues), but other
  roles (photographer, florist, etc.) might want a higher bar before appearing in front of
  users, to avoid a thin/low-confidence vendor page. This is a **serving-layer** policy decision
  (what the UI queries/shows), separate from extraction/ingestion correctness — revisit once
  relationships actually exist in `wedding_vendors` to test candidate thresholds against, not
  before. Don't conflate with the extraction-quality iteration this doc otherwise tracks.
- Multiple ceremony/reception venues per wedding — `weddings.venue_id` is a single FK; a
  wedding with a separate ceremony church and reception hall needs an ingestion-time decision
  (which wins, or store both as separate `wedding_vendors` role='venue' rows), not a parser-level
  one.
- Whether/how to ingest extracted relationships into production graph tables at all —
  **answered for the 143 high-confidence tier (D023): yes, ingested.** **Answered for the
  ambiguous (268) tier (D030): no.** Audited the same way as the 143 (5/268 exact-URL vs
  91.6%; 4 GREEN / 109 YELLOW / 150 RED); dry-run of the 9 identity-safe candidates was
  all role-variants of accounts already on those weddings. Write skipped. Full writeup:
  `ambiguous-tier-audit-handoff.md`. The 369 never-reconciled candidates are the
  venue-less skip, intentional.
