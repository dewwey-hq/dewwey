# Decisions

Append-only log, newest entry on top. Not every choice goes here — only ones that would be genuinely annoying to re-derive or re-debug in 3 months. Any doc can cite an entry by ID (e.g. "see D002") instead of re-explaining it.

---

## D025 — 2026-09-04 — `dewwey-hq/dewwey#1` merged to `main`; local `main` fast-forwarded

Status: Accepted
Context: D024 opened the PR after GitHub access was fixed. User approved merging after reviewing
the merge-readiness tradeoffs (mergeable clean, CI/Vercel preview green, 41/41 tests, but zero
human code review on a 158-file/+61,987-line diff, and `main` = production Vercel deploy).
Decision: merged. `origin/main` moved `d35dfd2` → `a5d8454` (merge commit of PR #1). Local `main`
fast-forwarded to match (`git checkout main && git pull --ff-only`, clean, no conflicts). Confirms
D009–D024's entire body of work (post classification V1 + graph strengthening) is now live on
`main`, including the D023 `wedding_vendors` write — though that data was already live in
Supabase before the merge (the merge changes which *code* is deployed, not the database state,
which was already shared across preview and production).
Not verified in this session: nobody has visually confirmed the live production deploy actually
serves `/feed` and the newly-ingested vendor data correctly post-merge. Flagged in `ROADMAP.md`
"Now" as a quick outstanding check, not assumed done.

---

## D024 — 2026-09-04 — `jhoffen` GitHub write access resolved; D009–D023 pushed and PR opened

Status: Accepted
Context: D015 recorded that the `jhoffen` GitHub account had read-only access to
`dewwey-hq/dewwey`, blocking `post-classification-v1-corpus` from being pushed. User confirmed
access is now fixed.
Decision: pushed the branch (fast-forward, `origin/main` unchanged since D015 — 0 behind, 7
ahead) and opened `dewwey-hq/dewwey#1` covering everything on this branch: post classification V1
(D009–D015) and the full graph-strengthening arc (D016–D023, including the D023 write into
`wedding_vendors`). Not merged — PR is open for review, `main` is unchanged.
**Separate and NOT resolved by this**: the D022 clustering-fix schema change
(`jeremy_wedding_candidates.superseded_by_candidate_id`) was blocked by a direct `ALTER TABLE`
attempt being denied by *this session's own Claude Code safety guardrail* — an unrelated gate
from Supabase/database permissions, which were never the problem (this session's Postgres
connection already has full read/write DDL rights, same connection used to `CREATE TABLE` twice
successfully this session). GitHub write access does not touch that guardrail. If the user wants
the D022 fix implemented now, that is a separate go/no-go decision, not something this access fix
unblocks automatically.

Status: Accepted
Context: D022 recommended proceeding to the vendor graph update rather than gating on the
clustering fix. This is that update — the first write this workstream has ever made to Ben's
serving graph (`weddings`/`wedding_posts`/`wedding_vendors`/`edges` had been explicitly
untouched since D019).
**Safety design, reasoned before writing anything**:
1. **Scope**: only the 143 `reconcile-v2` high-confidence matches (D020's audited tier —
   91.6% exact-shared-Instagram-URL, remainder manually reviewed, 0 confirmed false merges).
   Ambiguous (268) and insufficient-evidence tiers are never touched.
2. **Additive only**: `insert into wedding_vendors ... on conflict (wedding_id, account_id,
   role) do nothing` — a pre-existing row (Ben's own crawler data) is never modified, not even
   its `n_confirmations`. Verified directly: of 1,360 candidate-vendor rows across the 143,
   1,260 already existed in `wedding_vendors` (independent confirmation that the two graphs
   substantially agree) and exactly 100 were genuinely new.
3. **Provenance**: `wedding_vendors` has no source/provenance column and this workstream
   deliberately did not add one via `ALTER TABLE` (see point 5). Instead, every row actually
   inserted is logged in a new table, `jeremy_wedding_vendors_ingested` (candidate_id,
   reconciliation_version, timestamp) — the durable record of what was written and why, fully
   additive, zero schema change to any pre-existing table.
4. **Durability caveat, documented not solved**: Ben's `phase_dedup()` truncates `weddings`/
   `wedding_posts`/`wedding_vendors` with `RESTART IDENTITY CASCADE` on every run. If that ever
   runs again, everything this write contributed to `wedding_vendors` is wiped, and `weddings.id`
   itself gets reassigned. This is not fixed here (would require making `phase_dedup()`
   Jeremy-aware, explicitly out of scope through D019-D022). Recovery path: rerun
   `runJeremyWeddingReconciliation.ts` (re-matches against Ben's new weddings) then
   `applyJeremyEvidenceToGraph.ts` again — both are idempotent and safe to run repeatedly. The
   durable source of truth remains the Jeremy evidence/candidate/reconciliation layer, never
   `wedding_vendors` itself — exactly the principle the whole architecture was built around.
5. Created `jeremy_wedding_vendors_ingested` via `CREATE TABLE` (additive, succeeded). Separately
   attempted an `ALTER TABLE jeremy_wedding_candidates ADD COLUMN ...` earlier in the session
   (D022's clustering-fix path) and that was blocked by the session's safety guardrail — informed
   the decision here to avoid any `ALTER TABLE` on production tables and use only new, additive
   tables for provenance.
**Execution**: dry-run first (`--dry-run`, wraps the whole apply in a transaction and rolls back
at the end, exercising the identical code path including conflict resolution) — confirmed
attempted=1360, inserted=100, matching the precondition check exactly. Then committed for real:
inserted=100, `refresh materialized view edges` ran after. Verified: `wedding_vendors`
12,310→12,410 (+100, exact match); `edges` 54,271→54,526 (fresh recompute, consistent with a
direct independent recomputation of the pairwise-cooccurrence definition); `weddings`/
`wedding_posts`/`accounts` byte-identical (1,384/1,668/14,330). Reran the apply script a second
time: `inserted=0 already-existed=1360`, `wedding_vendors` content hash identical before/after
the rerun — idempotency confirmed, not assumed. 63 of the 142 distinct Ben weddings in the 143
tier gained at least one new vendor relationship (the other ~79 already had complete overlap).
Role distribution of the 100 new rows: planner (20), band (16), content_creator (11),
beauty_other (8), attire (7), florist (6), stationery (5), cake (5), hair (4), dj (4), makeup (4),
photographer (3), jeweler (2), rentals/transportation/venue/officiant/videographer (1 each) —
consistent with the earlier baseline finding that Jeremy's own-profile posts surface secondary
roles (bands, content creators) that Ben's venue-tagged crawl was less likely to catch.
Added 6 new regression tests (`graphStrengthening.test.ts`, "graph ingestion — D023" describe
block) plus updated one pre-existing D021 test whose hardcoded `wedding_vendors`/`edges` counts
were now correctly stale (D021's own point — "reconciliation never writes to Ben's graph" — is
still true and still tested; the counts themselves legitimately changed via this separate,
deliberate action). 41/41 total tests pass.
Not done: no fix to clustering (D022, unrelated), no schema change to any pre-existing table,
no write to `weddings`/`wedding_posts`/`edges` directly (only via the materialized view refresh).

---

## D022 — 2026-09-04 — Clustering order-dependence investigated (Experiment B): mechanism found and quantified, fix designed but not shipped, no production change

Status: Accepted (investigation), fix deferred pending explicit authorization
Context: D021 left issue B (clustering order-dependence, wedding-468 case) as a separate future
experiment. This is that experiment — investigation only in the end; full writeup in
`docs/engineering/graph-strengthening/clustering-boundary-investigation.md`.
**What was found**: the wedding-468 split is not fundamentally a greedy first-vs-best-match
ordering problem, as originally framed. Reconstructed from real evidence: candidate 2105's
7-vendor-key set and candidate 2116's 14-vendor-key set have Jaccard = 7/14 = **exactly 0.5**,
and the clustering script's condition is `jaccard(...) > 0.5` (strict) — `ingestion-design.md`
itself specifies "> 0.5", so this is a genuine boundary-inclusivity property, not an
implementation bug relative to the doc (unlike D021's reconciliation floor). A faithful in-memory
simulation of the clustering algorithm (`simulateClustering.ts`, validated to reproduce the live
`jeremy-cluster-v1` result exactly before being trusted) isolated two candidate mechanisms across
the full 3,273-post corpus: greedy first-match vs. best-match search changes **zero** candidate-
count metrics (it only reassigns which of two already-qualifying candidates absorbs a post);
widening the boundary to `>=0.5` is the entire effect, producing 12 fewer candidates (2,872→2,860,
0.4%) and correctly unifying the wedding-468 trio. All 14 individual merge events the `>=` fix
would produce were inspected by hand (not sampled) for false-merge risk, including 3 that showed
different `venue_account_id` on each side (the highest-risk pattern) — all 3 checked out as
legitimate (a post crediting 2 venue-role accounts where the code's `.find()` only keeps one; a
venue handle-rebrand pair confirmed via `accounts`; and a same-wedding ceremony+reception
two-venue case with ~12 shared distinct vendor handles). **Zero false merges found.**
Decision: **do not ship the fix in this experiment.** The evaluation supports it on the merits,
but implementing it retroactively (not just for hypothetical future posts) requires a schema
change: `jeremy_wedding_candidate_posts` has `PRIMARY KEY(source_post_url)` only — no
`clustering_version` column — so a post belongs to exactly one candidate globally (D019 invariant
#10), unlike reconciliation's `(candidate_id, reconciliation_version)` PK that let `reconcile-v2`
ship side-by-side with `reconcile-v1` with zero risk. Fixing the 14 known instances without a
full incompatible re-cluster needs a `superseded_by_candidate_id`/`superseded_at`/
`superseded_reason` provenance mechanism plus a reconciliation-query guard. Attempting the schema
migration (`ALTER TABLE jeremy_wedding_candidates ADD COLUMN ...`) via direct SQL was **blocked
by this session's own safety guardrail** — treated as a correct signal to stop and document
rather than an obstacle to route around, since a production schema change wasn't something this
investigation had standing authorization for. No schema change, no candidate-post reassignment,
no reconciliation rerun, no clustering code change was made. Verified: `jeremy_wedding_candidates`
(2,872 rows, no `superseded_*` columns) and `jeremy_wedding_candidate_posts` (3,273 rows) exactly
match the state at the end of D021. Added 4 new regression tests (1 unit test characterizing the
exact-boundary jaccard computation from the real vendor data; 3 DB tests asserting the current,
unfixed wedding-468 state and the absence of any schema/data changes) — 34/34 total tests pass.
**Recommendation: proceed to the vendor graph update, do not gate on this fix.** The affected
population is small (~0.4%) and already passes through D021's evidence floor like everything
else — an unfixed redundant pair produces a duplicate correct reconciliation, not an incorrect
one. Revisit the fix (full remediation plan documented) once explicitly authorized, opportunistically
bundled with other schema work on this table rather than as a blocking gate.

---

## D021 — 2026-09-04 — Reconciliation evidence floor: below-ambiguous "best available" matches no longer get a matched_wedding_id

Status: Accepted
Context: D020 closed the reconciliation audit but left two known issues open. This addresses only
issue A (no evidence floor) — issue B (clustering order dependence, wedding 468) is untouched, a
separate future experiment.
**What the investigation found**: `runJeremyWeddingReconciliation.ts`'s own documented design
(`ingestion-design.md`, "Reconciliation algorithm") already specifies three buckets — high,
ambiguous, "no match (`matched_wedding_id` null, candidate stays fully standalone)". The
*implementation* diverged from its own design: candidates that matched neither the high nor
ambiguous threshold still got `matched_wedding_id = best.weddingId` (just the closest venue-mate,
however weak) at confidence 0.1. This was previously identified as the "magnet effect" driver
(sparse Ben-venue coverage causing many unrelated Jeremy candidates to weakly "match" the same
single logged wedding) and the reason the "no-match" bucket previously reported as one number
(2,092) was actually two very different populations (445 genuinely venue-less + 1,647 weak-but-
recorded matches). Because `HIGH_CONFIDENCE_*`/`AMBIGUOUS_*` were already reasoned, calibrated
thresholds (not arbitrary), the smallest defensible floor is exactly the existing ambiguous
boundary — no new constant introduced: **is-high OR is-ambiguous → keep `matched_wedding_id`;
otherwise null.** This is a bug fix aligning code with the pre-existing documented contract, not a
new design.
Decision: implemented as `reconcile-v2` (bumped `RECONCILIATION_VERSION`, not an overwrite) —
`reconcile-v1`'s 2,503 rows are untouched and still queryable (PK is `(candidate_id,
reconciliation_version)`, exactly the versioning mechanism `ingestion-design.md` already
specified for this). Only the write in the below-ambiguous branch changed: `matched_wedding_id`
is now `null` instead of `best.weddingId`; `match_confidence` stays `0.1` and
`date_delta_days`/`vendor_jaccard` stay populated (the rejected best-candidate's evidence remains
inspectable, distinguishing it from the true no-venue case where both are `null` and
`venue_match=false`). No change to `HIGH_CONFIDENCE_DATE_DAYS`/`HIGH_CONFIDENCE_JACCARD`/
`AMBIGUOUS_DATE_DAYS`/`AMBIGUOUS_JACCARD`, clustering, candidate generation, or any Ben graph
table.
Verified before applying: high=143/ambiguous=268 identical byte-for-byte between `reconcile-v1`
and `reconcile-v2` (checked every column, not just counts). `insufficient` (formerly
"weak, matched") went from 1,647→0 matched, `no-venue` unchanged at 445. Distinct Ben weddings
matched dropped 494→283; many-to-one collisions (a Ben wedding claimed by >1 candidate) dropped
322→79 — all now backed only by high/ambiguous evidence. The previously-flagged 58-way collision
(wedding 1290) is now 7 (1 high + 6 ambiguous, its 51 weak claims floored out); a similar 8-way
case (wedding 733) is now 8 (1 high + 7 ambiguous — coincidentally the new largest, but entirely
legitimate-tier). Confirmed idempotent: reran `reconcile-v2` a second time, identical row-content
hash, 2,503 rows both times, `reconcile-v1`'s 2,503 rows still present unchanged. Ben's graph
(`weddings`/`wedding_posts`/`wedding_vendors`/`edges`: 1,384/1,668/12,310/54,271) and Jeremy's
candidate/candidate_posts counts (2,872/3,273) unchanged. Added 10 new regression tests
(`graphStrengthening.test.ts`, now 30 total, all passing) covering the new semantic contract and
the v1/v2 byte-identical invariant for high+ambiguous.
Not done, explicitly out of scope: fixing clustering order dependence (issue B, wedding 468 case)
— separate future experiment.

---

## D020 — 2026-09-04 — Reconciliation audit: 143 high-confidence matches trusted on automated evidence, no redesign, no human audit performed

Status: Accepted
Context: before deciding whether to build further on `reconcile-v1`'s 143 high-confidence matches
(D019), or redesign reconciliation, audited them — machine analysis only, not a manual review.
Built an improved both-sides review artifact (`exportHighConfidenceReview.ts` →
`high_confidence_143.{csv,md}`, Jeremy-side and Ben-side post URLs + vendor handles/roles
together — the prior version only had the Jeremy side) after verifying the authoritative source
of Ben-side post URLs (`wedding_posts(wedding_id, post_id) → posts.url`, confirmed complete for
all 143: 0 missing/malformed URLs across all 1,668 `wedding_posts` rows). Then ran a scored
risk-ranking pass (`auditHighConfidence.ts`).
Findings (full writeup: `docs/engineering/graph-strengthening/reconciliation-audit-143.md`):
1. **131/143 (91.6%) have an exact shared Instagram post URL** between the Jeremy candidate and
   the matched Ben wedding — the strongest available identity signal, stronger than any
   Jaccard/date heuristic. Treated as deterministic; not individually reviewed by eye.
2. The remaining 12 were reviewed by diffing vendor handles (not just the role-labeled strings
   the Jaccard metric compares, which understates overlap on role relabeling and handle typos)
   against both-sides evidence: **11 GREEN, 1 YELLOW, 0 RED**. The YELLOW (candidate 2737 →
   wedding 1222) has strong vendor overlap but a 12-day date delta, near the 14-day high-
   confidence window edge — flagged for date evidence alone.
3. **No false-merge pattern found.** Only one Ben wedding (468) is targeted by 2 of the 143
   candidates; traced to the already-known order-dependent clustering under-merge (2105/2116
   should have been one candidate), not a reconciliation defect — reconciliation matched both
   correctly to the same real wedding, producing redundancy, not error.
Decision: **the 143 high-confidence tier is trusted on current automated evidence.** No
reconciliation threshold, clustering, or schema change made or currently justified by this audit.
**Explicitly not claimed**: this is not a human audit — no person independently verified any of
the 143 against source posts; "trusted" means "sufficiently supported by automated evidence to
proceed without redesign," not "human-validated ground truth." Two known, separately-tracked
follow-ups remain on the roadmap, not implemented here: (A) reconciliation has no evidence floor
— even its weakest (0.1) confidence bucket records a `matched_wedding_id`, previously identified
as the "magnet effect" driver; target shape is strong→match, ambiguous→reviewable,
insufficient→no match. (B) the order-dependent greedy-clustering under-merge (wedding 468 case)
remains a targeted clustering fix. Neither is a redesign.

---

## D019 — 2026-09-04 — Graph-strengthening evidence/candidate layer implemented, after a deliberate architectural review found real problems in D018's design

Status: Accepted
Context: before implementing D018's design, did a genuine critical review (not a rubber-stamp) of
the evidence/candidate/reconciliation architecture, per explicit instruction to challenge it.
Found and fixed several real issues:
1. **Evidence identity was wrong.** D018 keyed evidence on `(source_post_url, account_id, role,
   parser_version)` — baking a revisable interpretation (role, parser version) into what should
   be an immutable fact's identity. Most `ROLE_MAP` fixes don't change what a caption says, only
   our reading of it; the old key would mint a full new row set on every parser iteration.
   Corrected identity: `(source_post_url, line_no, handle)` — the actual credit-line instance —
   with `role`/`parser_version` resolved as "latest by `extracted_at` wins," the same pattern
   `post_classifications_current` already uses.
2. **The evidence layer didn't need a new table.** `stack_extraction_entries` (D016/D017)
   already has exactly this data, already append-only per parser version, already proven working.
   `jeremy_post_vendor_evidence` is a **view**, not a table.
3. **A real, pre-existing durability risk**: `v1_content_corpus` joins `staging.instagram_posts`
   directly, and `ROADMAP.md` plans to eventually drop the staging schema — anything depending on
   that view would silently break that day. The evidence view instead joins
   `stack_extraction_entries`/`candidate_scores`/`post_classification_runs`/`accounts` directly —
   zero dependency on staging or `v1_content_corpus`. Dropped `is_self_credit` from the design for
   the same reason (needed `owner_username` from staging, for a non-essential V1 feature).
   Flagged the same risk for `v1_content_corpus`/`/feed` in `schema.sql`, unfixed (out of scope).
4. Added `clustering_version` to `jeremy_wedding_candidates` — candidate identity is only stable
   *within* a fixed clustering algorithm; changing the Jaccard threshold or date window would
   silently re-partition existing candidates unless it's an explicit, visible version bump.
5. `jeremy_wedding_candidate_posts` gets `PRIMARY KEY(source_post_url)`, enforcing "a post
   belongs to at most one candidate" at the database level — the confirmed rare 1-post/2-weddings
   case (`DICbnDDJR8M` in the eval set) is a named limitation, not a silent gap.
6. `match_basis` became explicit columns (`venue_match`/`date_delta_days`/`vendor_jaccard`)
   instead of `jsonb` — the signal set is small and fixed for V1.

Decision: implemented the corrected design (full reasoning and schema in
`docs/engineering/graph-strengthening/ingestion-design.md`). Ran `ensureVendorAccounts.ts`
(3,287 new accounts — the only change to any pre-existing table, and an intentionally permissive
one per existing `accounts` philosophy), `runJeremyWeddingClustering.ts`
(`jeremy-cluster-v1`: 2,872 candidates from 3,273 clustering-eligible posts, 401 posts attached to
existing candidates via confirmation), and `runJeremyWeddingReconciliation.ts`
(`reconcile-v1`: 143 high-confidence / 268 ambiguous / 2,092 no-match, of 2,503 candidates with a
resolved venue). Verified live: `weddings`/`wedding_posts`/`wedding_vendors`/`edges` counts
unchanged to the row (1,384/1,668/12,310/54,271); `accounts` grew by exactly 3,287. Reran both
scripts a second time — zero new/changed rows either (idempotency confirmed, not assumed). Spot-
checked the largest candidate (9 posts, all independently confirming the same real wedding at the
Art Institute, exact same date) and the highest-vendor-count candidate (28 vendors across 2 posts,
identical vendor lists, same venue) — both genuine, not clustering artifacts. Added 20 regression
tests (`graphStrengthening.test.ts`, pure-function + live-DB structural invariants), all passing.
A real implementation gap found and left as a known limitation, not silently fixed: posts with
1-2 (not 3+) non-other vendor roles contribute evidence but currently never get attached to any
candidate, even if their vendor(s) would match an existing one — the design doc mentioned this
as supported, the clustering script doesn't yet do it. $0 cost throughout, no LLM calls.
Still true: `weddings`/`wedding_posts`/`wedding_vendors`/`edges`/`phase_dedup()` untouched.
Merging confidently-reconciled candidates into Ben's live serving graph remains explicitly
deferred, not attempted.

---

## D018 — 2026-09-04 — Graph ingestion V1: evidence/candidate identity kept separate from Ben's unstable `wedding_id`, deferring the identity-stability fix

Status: Accepted
Context: the first ingestion design draft found that Ben's `phase_dedup()` (`pipeline.py:398`)
truncates and rebuilds `weddings`/`wedding_posts`/`wedding_vendors` from scratch on every run —
`wedding_id` is not stable across reruns. That draft's recommended fix (make `phase_dedup`
match-and-upsert instead of truncate-rebuild, option 1) was reviewed and explicitly rejected for
V1: changing Ben's core wedding-identity semantics is a bigger architectural change than this
workstream should make before the resulting graph additions are validated.
Decision: V1 separates **immutable evidence identity** (`source post -> vendor -> role -> parser
version`, which never needs to change) from **wedding identity** (`source post -> real-world
wedding`, explicitly uncertain and revisable). New, fully independent tables —
`jeremy_post_vendor_evidence` (stable, no reference to any wedding at all),
`jeremy_wedding_candidates`/`jeremy_wedding_candidate_posts` (Jeremy-only clustering, kept stable
across reruns via match-upsert against a table this workstream owns — same clustering algorithm
as `phase_dedup`, applied without touching Ben's pipeline), and
`jeremy_wedding_candidate_reconciliation` (a versioned, non-FK-constrained *belief* about which
Ben wedding a candidate might match, explicitly designed to be re-run and revised, never treated
as permanent). `weddings`/`wedding_vendors`/`edges` receive zero writes in V1 — even a
confidently-matched candidate isn't merged into the live serving graph this round; that path is
designed (see `ingestion-design.md` section 4) but deferred until after V1's output is reviewed.
Full design in `docs/engineering/graph-strengthening/ingestion-design.md`. $0 cost, no LLM calls,
no production writes yet — next step is a dry run (not yet run) to produce real candidate/match
counts before any further decision.

---

## D017 — 2026-09-04 — Graph strengthening iteration 2: no-colon recall fix; ingestion scoped to INCLUDE-only

Status: Accepted
Context: D016 shipped `stack-parser-ts-v2` (role-accuracy fixes) and named the no-colon/emoji/
reversed-order caption-format recall gap as the single biggest remaining lever, deferred to its
own iteration. User also settled two open questions from D016 before this iteration started:
ingestion population is INCLUDE only (EXCLUDE — including `destination_wedding`, which would
otherwise pollute a Chicago-focused graph with real-but-wrong-geography vendors — deferred, not
decided against permanently); and a minimum-evidence display threshold for non-venue vendors is
a real idea but a *serving-layer* decision to test once relationships exist in `wedding_vendors`,
not before (venues get a "show even at n=1" exception since users specifically browse venues).
Decision: shipped `stack-parser-ts-v3` — a `NOCOLON_LINE` fallback pattern (tried only when the
proven colon-separator `LINE` regex doesn't match), built from real captions read first, not
guessed. Deliberately stricter than `LINE` (uppercase-first-letter requirement, entire line
remainder must be just handles, no interspersed prose) specifically to manage the precision risk
of dropping the colon requirement — verified against hand-written adversarial captions
("Follow us @handle for more content!") before running the real eval, both correctly rejected.
Result against the same `vendor_extraction_golden_set` eval (D016): recall 82.6% -> 92.4% pooled,
precision held (96.4% -> 96.8%, no regression), role accuracy (any-match) 74.9% -> 83.2%. Full
details in `docs/engineering/graph-strengthening/README.md`.
Still deliberately not touched: emoji-before-colon breaking the existing colon match, reversed
`"@handle - Role"` order, pipe-delimited multi-credit lines mis-assigning role across handles —
each is a separate, real, confirmed issue that needs its own isolated iteration. Still nothing
written to production graph tables (`accounts`/`post_mentions`/`weddings`/`wedding_vendors`/
`edges`) — extraction/eval only.

---

## D016 — 2026-09-03 — Graph strengthening: ported Ben's stack parser to TS, built vendor-extraction ground truth, shipped iteration 1 (no production writes yet)

Status: Accepted
Context: ROADMAP's "re-parse Jeremy's 47k staged captions through the stack parser" was stale on
two counts — the population should be the 4,033 V3-validated INCLUDE posts (D014), not 47k raw;
and the parser only exists in Python (`pipeline/pipeline.py`), never bridged to Jeremy's corpus
at all. Applied the same baseline -> hypothesis -> bounded change -> evaluate -> error-analyze ->
keep/revert -> record -> regression-test loop used for post classification.
Decision: ported `parse_caption`/`ROLE_MAP`/`norm` faithfully to
`apps/web/scripts/graph/stackParser.ts` (read-only extraction function, not a graph writer — see
`docs/engineering/graph-strengthening/README.md` for full methodology/numbers). Ran it over the
5,225-candidate pool into new additive-only tables (`stack_extraction_runs`/
`stack_extraction_entries`), confirming the hypothesis: INCLUDE posts surface vendor relationships
57.3% new to Ben's `accounts` graph and 65.4% not already in `wedding_vendors`. Built real ground
truth (not the parser's own output) — 134 posts, 4 independent caption-reading passes, 92 eval /
42 held-out, persisted to a new `vendor_extraction_golden_set` table
(`source_note='vendor_gs_v1'`). v1 baseline: 96.4% precision, 82.6% recall (recall gap is almost
entirely a text-format problem — no-colon/emoji/reversed-order lines, confirmed independently by
all 4 labelers — deliberately not touched this round, bigger structural change), 68.0% role
accuracy (any-match). Shipped `stack-parser-ts-v2`: a `ROLE_MAP` keyword bundle chosen from
measured mismatch counts (added `band`/`content_creator` as real targets the parser never hit;
`reception`/`ceremony`/`church`/`parish` → `venue` via a whitelist, not a substring — a first
substring attempt introduced 3 regressions the eval re-run caught, e.g. "Ceremony Musicians"
false-triggering venue; several smaller safe keyword fixes). Result: 106 real fixes, 0
regressions (a naive pairwise-join comparison first mis-reported 26 regressions — turned out to
be a measurement artifact from vendors legitimately credited under 2+ roles in one post, not a
real bug — worth remembering for future comparisons against this table). Role accuracy 68.0% ->
74.9%. $0 cost, no LLM calls.
Explicitly NOT done: no writes to `accounts`/`post_mentions`/`weddings`/`wedding_vendors`/`edges`
— this whole entry is measurement and a read-only extraction instrument. The recall-format fix
(the single biggest lever, per all 4 labelers) is deferred to its own iteration, isolated from
this one. Whether `destination_wedding`/`styled_or_editorial` EXCLUDE posts' vendor relationships
belong in the graph for a different purpose is an open product question, not resolved.

---

## D015 — 2026-09-03 — V1 corpus wired into the product (`/feed`); branch committed, NOT pushed

Status: Accepted
Context: D014 shipped the V1 corpus into Supabase (`candidate_scores`, `v1_content_corpus`) but
left it invisible in the product — nothing in `apps/web` queried the classification pipeline.
Confirmed the app's own DB access (`lib/server/db.ts`) uses the identical `DATABASE_URL` as the
classification scripts (same Supabase project, same connection) — there was never a local/remote
sync gap to bridge, just missing application code.
Decision: added a new, additive `/feed` route (`lib/server/v1corpus.ts`, `app/feed/page.tsx`,
`app/components/V1FeedCard.tsx`) reusing the existing `InstagramEmbed` component, paginated,
sorted by candidate score. Added "Feed" to the main nav (`lib/site-nav.ts`). Deliberately did
NOT wire `v1_content_corpus` into `/vendors/[username]` (which reads only Ben's separate graph)
— verified live that a vendor's profile page and `/feed` show different, unrelated post counts
for the same account (`chicagoilluminatingcompany`: 101 V1-corpus posts on `/feed`, unrelated to
whatever Ben's graph shows on their profile page) — merging those is a real follow-up, not done
here. Known gap: no `embeds_disabled` opt-out check on `/feed` (that data is keyed to Ben's
graph, most V1-corpus owners aren't in it) — an opted-out account's embed shows blank rather than
a caption-card fallback.
Verified: build/typecheck/tests pass; `bun run lint` fails only on pre-existing issues in
`apps/web/app/concept/` (a separate, unrelated workstream, predates this session — 0 lint
problems in any file this task touched); manual localhost check confirmed real V1 posts render
(verified via the app's actual `getPool()` module, not just direct `psql`).
Also, per this same thread: committed and pushed this session's full body of work (post
classification pipeline + candidate generation + V1 corpus + `/feed`, alongside an unrelated
venue concept-pages workstream already sitting uncommitted in the same tree, included per
explicit instruction) to local branch `post-classification-v1-corpus` (2 commits, `6646d96` +
`adf598e`, both on top of `main`@`d35dfd2`). **Push failed and no PR exists yet** — `gh repo view
dewwey-hq/dewwey` shows the `jhoffen` GitHub account has `viewerPermission: READ` only, not
write. Needs either write access granted on the org repo, someone else pushing this branch, or a
fork-based PR (not attempted, changes provenance, wasn't decided). Nothing is lost — the branch
and both commits are sitting locally, ready to push the moment access exists.

## D014 — 2026-09-03 — V1 shipped via candidate generation, not full-corpus classification

Status: Accepted
Context: After the 3,000-post V3 canary (frozen since D013) came back encouraging but the
full-corpus V3 cost (~$470) was judged too high for an initial product slice, pivoted to a
zero-LLM-cost deterministic candidate-generation score (`candidate-score-v1`,
`apps/web/scripts/classify/candidateScore.ts`) to shrink 47,623 raw posts down to a high-signal
pool before spending LLM money — see
`docs/engineering/post-classification/candidate-generation-analysis.md` for the full methodology
(vendor-stack signals alone: ~60-83% precision, insufficient on their own; combined score at the
top of the distribution: 93-97% on a small golden-set sample, competitive with V3).
Decision: scored the full corpus for free (new `candidate_scores` table, composite PK on
`(post_url, candidate_generation_version)` so a future v2 score never overwrites v1's history).
Ran the frozen V3 classifier (untouched — no prompt/rubric/routing/threshold changes) on the
score≥12 pool (5,225 candidates, mathematically guaranteed to have vendor_role_count≥3 given the
score formula). New `v1_content_corpus` view resolves the latest v3-specific decision directly
from `post_classification_runs` (not the cross-version `post_classifications_current`, which goes
stale for a specific version — the same bug class fixed in D012) filtered to `score>=12 AND
decision='INCLUDE'`.
Result: 47,623 raw -> 5,225 candidates -> **4,033 INCLUDE** / 143 REVIEW / 1,045 EXCLUDE / 4 errored
(malformed-JSON tool-call responses, non-retryable by the existing retry logic — isolated to
those 4 posts, verified zero orphaned/partial rows). Total cost **$116.94** (~$0.0224/post),
within 1% of the pre-run $118 estimate — vs. ~$470 for the full corpus, a ~75% reduction.
One real operational incident: `NEW_OPENROUTER_API_KEY` hit a **per-key** monthly spending limit
(distinct from the account's $120 balance and the unset workspace-wide budget — OpenRouter lets a
key carry its own cap) partway through, at 1,510/5,225. The circuit breaker aborted cleanly (no
corruption, no duplicate rows — verified), user raised the per-key limit, and the same idempotent
command resumed and finished untouched posts only.
Not done here (deliberately, per the "product validation over model optimization" framing this
session shifted to): no V4, no further prompt tuning, the 240-post manual audit from D013 is
deprioritized (not cancelled) rather than run, and the remaining ~42,398-post tail of the corpus
was not classified. See candidate-generation-analysis.md Part 9 Q7 for what recall is given up by
this pivot and how to recover it later.

## D013 — 2026-09-02 — Post classification: human audit gate before v3; v3 prompt written but not run

Status: Accepted
Context: Before spending more OpenRouter credit on a v3 run (after v1→v2, D012), requested a
human sanity-check that the model's actual behavior matches the real "credible real wedding"
standard — not just the hand-labeled metrics — plus the two already-diagnosed v2 fixes,
without running anything expensive yet.
Decision: Prepared a 25-post manual audit (`docs/engineering/post-classification/audits/
v2-manual-audit.md` + a blank judgment template,
`apps/web/scripts/classify/data/audit_v2_judgments_template.json`), sourced entirely from
`dev_v1` — `heldout_v1` stays untouched, now explicitly a regression-only set going forward.
Implemented both diagnosed v2 fixes in `llmClassifier.ts` (`PROMPT_VERSION` →
`post-classify-v3`): the engagement/proposal carve-out moved inside the `is_wedding` question
itself (was attached to `is_real_wedding`, where `is_wedding=false` could short-circuit past
it before ever reaching it); the "3+ role vendor stack is sufficient without a named couple"
path restructured into an explicit, prominent list instead of a buried clause. The
thin-circumstantial-evidence bar that fixed v1's false-positive cluster is unchanged — this
was a placement/emphasis fix, not a loosening. **v3 has NOT been run against dev_v1 or
anything else** — per instruction, next steps wait on the human's audit judgments.
Why: a model can look fixed against the two cases that motivated a change and still be wrong
in ways synthetic metrics alone won't surface (D012 already demonstrated this once, catching a
real regression only by re-running the full eval rather than trusting the motivating cases) —
a human spot-check against the real product standard is a cheap, independent check before
spending more on a v3 run.
Related: docs/engineering/post-classification/README.md, D009–D012

## D012 — 2026-09-02 — Post classification: first live v1→v2 run (dev/held-out), two tooling bugs fixed

Status: Accepted
Context: Credits landed on a new key (`NEW_OPENROUTER_API_KEY`, $100 — `OPENROUTER_API_KEY` left
untouched per instruction). Ran the full pipeline for real for the first time: v1 baseline on
`dev_v1` → error analysis → an evidence-justified v2 prompt change → v2 re-run on `dev_v1` →
v2 cold on `heldout_v1`.
Decision: v1 baseline (dev_v1, n=216): INCLUDE precision 0.745, recall 0.854. Every false
positive but one clustered in the `ambiguous`/`insufficient_evidence` category — the model
treating thin circumstantial evidence (a real venue name, a venue-branded hashtag, a generic
event-adjacent phrase like "cocktail hour") as sufficient proof of `is_real_wedding`, without
requiring a named couple or an explicit real-event statement. v2's prompt tightened exactly
that (`llmClassifier.ts`, `PROMPT_VERSION` bumped to `post-classify-v2`), plus a narrow
engagement/proposal-with-explicit-wedding-reference carve-out. Dev result: precision
0.745→0.886, recall 0.854→0.756 (net: fewer, more trustworthy INCLUDEs — the intended
direction given INCLUDE precision is the primary metric). Held-out (never touched before this
run): precision 0.896, recall 0.782 — matches or beats dev, real generalization, not
overfitting. Two tooling bugs found and fixed along the way: (1) `runAccountClassify.ts` and
`runClassify.ts` both self-reported "processed: N" using `total - errored`, which silently
counted posts the queue never attempted as if they'd succeeded whenever a run aborted early —
verified live (a rate-limit abort left 2,812 of 2,817 accounts unclassified while the log
claimed 2,812 succeeded); fixed to only count actual completions, and raised/backed the abort
threshold with a process-wide per-model rate limiter (`openrouter.ts`) since a brand-new API
key hits a temporary ~20rpm "new account" cap that individual per-request retry couldn't
outrun with concurrent workers. (2) `evalHarness.ts`/`costReport.ts`/`errorAnalysis.ts`/
`sampleForReview.ts` all queried `post_classifications_current` (latest run **across all
versions**) filtered by a specific `classifier_version` — correct only until a newer version
runs on the same posts, after which an older version's numbers silently evaluate to zero
matches. Fixed to resolve latest-within-the-requested-version directly from
`post_classification_runs`; `findStale.ts` correctly keeps using the cross-version view, since
finding posts behind a version is its actual job. `costReport.ts` also undercounted total
spend by ~25% by summing cost only from the current-per-post view, dropping a cheap-tier call's
real cost whenever that post later escalated to Sonnet — fixed to sum every attempt.
Why: both classes of bug produce a plausible, self-consistent, WRONG number rather than an
error — exactly the kind of mistake that isn't visible without independently verifying against
the DB, and that a report from a superseded version would otherwise resurface for a v3 without
warning that it's counting zero (or too little) history.
Related: docs/engineering/post-classification/README.md, D009, D010, D011

## D011 — 2026-09-02 — Post classification: classified_at split from posted_at; small reclassification-support changes

Status: Accepted
Context: Before the LLM tiers run for real, wanted the time/versioning architecture to
explicitly support continuous improvement rather than treating any classification as
permanent — requested as a small, scoped addition, not a new project.
Decision: `post_classification_runs.created_at` renamed to `classified_at` (when the
classifier decided) and a `posted_at` column added (snapshot of the post's own publish
timestamp — `posts.posted_at`/`staging.instagram_posts.post_timestamp` remain the source of
truth; this copy keeps classification history queryable by post age after `staging` is
eventually dropped). Same rename on `account_classification_runs`. Added optional
`event_date`/`event_date_confidence` columns, populated only with direct textual evidence,
never inferred. Existing 49,384 rows backfilled via a join back to `staging.instagram_posts`.
Three small code changes: `accountClassifier.ts` now samples an account's most RECENT posts
(`post_timestamp desc`, was arbitrary insertion order) so re-running it reflects current
behavior; a new `findStale.ts` finds posts behind a given `classifier_version`, below a
confidence threshold, or past a `classified_at` age, and emits a URL list for
`runClassify.ts --post-urls-file`; `llmClassifier.ts`'s prompt now says explicitly that a
post's age is never evidence against its credibility. Append-only history and selective
`--post-urls-file` reclassification were already true (D009) — verified, not changed.
Why: makes "account intelligence isn't permanent," "new versions selectively reclassify," and
"stale/low-confidence calls are findable" queryable facts instead of just design intent, with
minimal schema/code surface. `findStale.ts` immediately proved itself: run against the
`prefilter-v2`→`v3` regression fix (D010), it found 1,712 posts still carrying v2's reverted
decision as "current" simply because v3 correctly declined to re-decide them deterministically
— exactly the scenario it exists to surface, no special-casing needed.
Related: docs/engineering/post-classification/README.md ("Time and versioning"), D009, D010

## D010 — 2026-09-02 — Post classification: adversarial validation before the full run; caught and fixed a deterministic-tier regression

Status: Accepted
Context: Before spending ~$125-135 on classifying all 47,623 staged posts (D009), requested a
deliberately adversarial validation round — not a random sample — to find weaknesses first.
Decision: Built a 431-post sample from 18 targeted SQL buckets (random, deterministic-excluded,
deterministic-deferred, high/low-relevance accounts, styled/editorial, engagement/proposal,
generic marketing, non-Chicago via a location NOT on the hardcoded destination list, etc.),
split 216 dev / 215 held-out, hand-labeled by 6 parallel agents against one written rubric,
loaded into `golden_set` with `source_note` values (`dev_v1`/`heldout_v1`) kept disjoint from
each other and from the original 120-post bootstrap set — `evalHarness.ts`/`costReport.ts`
gained `--source-note` filtering for this. Regression-testing the deterministic tier
(`prefilter.ts`) against this harder sample surfaced a real bug (wrong `exclusion_reason` on
posts that coincidentally still got the right decision), and a proposed fix
(`prefilter-v2`) that looked correct against the two motivating cases turned out to regress 2
real weddings into wrong EXCLUDEs — caught only by re-running the full eval, not by re-checking
the motivating cases. `prefilter-v3` (current) keeps the part of the fix that didn't regress
anything and reverts the part that did; re-verified to exactly match `prefilter-v1`'s
decision-level accuracy on all three golden-set splits.
Why: "Fixed the specific example" isn't the same as "fixed without regressing" — full
re-evaluation after every change, not spot-checking the motivating case, is the only way to
catch this class of mistake. This is the same discipline the full LLM-tier validation loop
needs once `OPENROUTER_API_KEY` has credit again (still exhausted as of this entry — see
D009) — nothing about the LLM tiers' actual behavior is measured yet; this round only
validated the free deterministic tier.
Related: docs/engineering/post-classification/README.md ("Adversarial validation round"), D009

## D009 — 2026-09-02 — Post classification: versioned runs keyed by post_url, TS not Python

Status: Accepted
Context: The ~45k own-profile posts in `staging.instagram_posts` need a credibility/Chicago/
real-wedding decision before they can be surfaced — see `docs/engineering/post-classification/`.
Two build decisions worth not re-deriving: (1) this sandbox has no `pip`/`psycopg2` and no
sudo to install them, so the pipeline's usual Python+psycopg2 convention (`pipeline.py`,
`normalize.py`) was a dead end here; built in TypeScript under `apps/web/scripts/classify/`
instead, running on Bun with the `pg` package already in `apps/web` — zero new dependencies,
and matches ROADMAP.md's noted "TS port of the pipeline" direction. (2) Every table
(`post_classification_runs`, `golden_set`, `account_classification_runs`) is keyed by
`post_url`, not an internal id — posts live in `staging.instagram_posts` today and
`public.posts` after the pending re-parse, and `post_url` is the one natural key stable
across both (same role `posts.shortcode` already plays).
Decision: Contract + schema + deterministic pre-filter tier + a hand-labeled 120-post
bootstrap golden set are built and verified (the deterministic tier alone confidently
excludes 33.1% of all 47,623 staged posts at $0). The LLM tiers are built and typecheck
clean but have never run live — `OPENROUTER_API_KEY` has no remaining credit
(`total_credits: 10, total_usage: 10.37`, verified via `GET /credits`). Real precision/
recall numbers are blocked on topping up that key.
Why: Sandbox constraints (Python) forced the language choice; false-positive-averse product
requirement (a bad post reaching a user is worse than a missed good one) forced the
tiering shape (deterministic tier only ever returns EXCLUDE or defers, never a confident
INCLUDE) and the append-only-runs-plus-serving-view data plane (mirrors
`venue_extraction_runs`/`venue_enrichment`, the closest prior art in this codebase).
Related: docs/engineering/post-classification/README.md, D006 (staging schema), D008 (Bun)

## D008 — 2026-08-22 — apps/web: Bun, graph-first queries, dead architecture removed

Status: Accepted
Context: The monorepo merge (see docs/merge-eval.md) left the app querying Jeremy's old table shape against an empty database, on npm, with the retired AWS/beta machinery still in the tree.
Decision: (1) `lib/server/vendors.ts` now reads the graph (`accounts`/`v_account_role`/`account_locations`/`weddings`/`edges`) as the source of truth, with the Places `vendors` layer as a LEFT JOIN that enriches rows when populated — "frequently works with" comes from the `edges` matview (real weddings together), replacing read-time mention counting. (2) Switched to Bun (`bun.lock`; Vercel auto-detects). (3) Deleted dead code: beta password gate (middleware + routes), the `/api/venue-photo` proxy plane, all RDS-targeting `scripts/`, the subtree'd `.github/` CI (workflows can't run from a subdirectory), and 10 script-only dependencies. Jeremy's docs moved to root `docs/` (live) and `docs/history/` (retired architecture) — one documentation universe.
Why: The app had no data behind Jeremy's shape (his import waits on the merge conversation); the graph side has 1,384 weddings today. Ben explicitly requested the Bun switch and dead-code removal.
Related: docs/merge-eval.md, D006, D007

## D007 — 2026-08-22 — Cloudflare R2 for images; DB stores keys, never URLs

Status: Accepted
Context: IG avatar CDN URLs and Google Places photo URLs both expire — the root cause of Jeremy's photo-refresh machinery.
Decision: Bucket `dewwey` (Ben's Cloudflare account, ENAM). All 1,361 avatars uploaded under `avatars/` — keys equal `accounts.avatar_path` verbatim. The DB stores object keys; the app composes `NEXT_PUBLIC_R2_PUBLIC_URL` + key at read time, so the serving domain (r2.dev now, custom later) can change without touching rows. Venue photos will follow via `vendors.photo_keys`. Bucket management via `cf` CLI; object I/O via the S3-compatible API.
Why: Zero egress fees, and download-once-at-ingest kills the entire expiring-URL problem class (Jeremy's refresh scripts + cron TODO are retired).
Related: D008, docs/history/place-photo-automation-todo.md

## D006 — 2026-08-22 — Merged schema: how Jeremy's layer joins the graph (designed with Ben)

Status: Accepted
Context: Two datasets — Ben's wedding-centric graph (source of truth) and Jeremy's Places-seeded vendor directory — needed one schema (see docs/merge-eval.md).
Decision: (1) `vendors` is a slim typed core (~20 columns) + full Places payload in `raw` jsonb — Jeremy's 50-column table is not resurrected. (2) The bridge is `vendors.account_id` FK + `account_matched_by`, not a mapping table — one canonical IG account per business. (3) `venue_enrichment`/`venue_extraction_runs` adopted wholesale. (4) `posts` gains `source` (`venue_tagged`|`own_profile`) and `wedding_score` (his idea, kept as the ingest filter — only 29% of own-profile posts are credible weddings). (5) His `instagram_post_appearances` is never imported — superseded by the stack parser. (6) His raw data lands in a `staging` schema for re-parse, only after the Ben↔Jeremy conversation.
Related: pipeline/schema.sql, docs/jeremy-ddl.sql, docs/merge-eval.md

## D005 — 2026-08-10 — Moved the vendor-search Lambda (beta + prod) off the `postgres` superuser onto a least-privilege `app_readonly` role

Status: Accepted
Context: The Lambda (`vendor-search-beta`/`vendor-search`) and all scripts connected to RDS as `DB_USER=postgres` — the instance superuser. This app has no write path today (no user accounts, no in-UI create/update — the Lambda only `SELECT`s), so the superuser was pure unneeded blast radius. It's also a real future landmine: Postgres RLS policies are bypassed by superusers and table owners by default, so if per-user RLS is ever added (see venue-enrichment/multi-tenant discussion), it would silently do nothing while the app connects as `postgres`. Also noted in passing: prod and beta currently share the same `postgres` password — not addressed here, a candidate for a future decision.
Decision: Added `scripts/migrations/007_create_readonly_app_role.sql`, which creates `app_readonly` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, `SELECT`-only via `GRANT` + `ALTER DEFAULT PRIVILEGES` so future tables are covered automatically). Run and verified on both beta and prod 2026-08-10/11 — confirmed `SELECT` works and `INSERT`/`CREATE TABLE` are denied on both. Rotated both Lambdas' (`vendor-search-beta`, `vendor-search`) `DB_USER`/`DB_PASSWORD` env vars to the new role and confirmed each is still serving live traffic afterward (beta and prod `/vendors` endpoints both returned real data post-rotation). Migration/admin scripts (which run schema changes) still use the `postgres` role — only the read-only Lambda path moved.
Related: docs/engineering/environments.md, docs/engineering/ai-constitution.md

## D004 — 2026-07-23 — Beta login redirects must use 303, not default 307

Status: Accepted
Context: The beta password-gate login POSTs to `/api/beta-access`; the success redirect used `NextResponse.redirect(destination)` with no explicit status, which defaults to 307.
Decision: All three redirects in `app/api/beta-access/route.ts` now pass status `303` explicitly.
Why: A 307 preserves the original request method on the follow-up request. Since the destination (`/`) is a GET-only page route, the browser replayed the redirect as a POST and got a 405. 303 forces the browser to GET regardless of the original method — the standard post-login-redirect pattern.
Related: docs/engineering/beta-environment.md

## D003 — 2026-07-23 — Disabled Vercel SSO protection project-wide, added an app-level password gate instead

Status: Accepted
Context: `beta.dewwey.com` redirected visitors to `vercel.com/login`. The project's `ssoProtection: "all_except_custom_domains"` setting turned out to only exempt the actual **Production** domain — a non-production custom domain bound to the `beta` branch was still gated.
Decision: Disabled `ssoProtection` entirely at the project level; added an app-level password gate (`middleware.ts` + `BETA_ACCESS_PASSWORD`, hostname-scoped to `beta.dewwey.com` so prod stays public) instead of Vercel's built-in password protection.
Why: Vercel Pro password protection isn't available on the free Hobby plan this project is on. The app-level gate achieves the same "shareable for demos, not indexed/walk-in-able" outcome at zero added cost.
Related: docs/engineering/beta-environment.md

## D002 — 2026-07-23 — Widened the shared Lambda execution role's CloudWatch log policy for beta

Status: Accepted
Context: The beta Lambda (`wedding-app-vendor-search-beta`) reuses prod's IAM execution role to save setup time. Its CloudWatch logging policy (`logs:CreateLogStream` / `logs:PutLogEvents`) was scoped by resource ARN to only prod's specific log group.
Decision: Added the beta function's log-group ARN to the same managed policy (new policy version).
Why: Beta executed and returned correct responses fine, but every invocation's logs were silently dropped — no error surfaced anywhere, the log group simply never got created. This is an easy trap to hit again if a future Lambda reuses an existing role rather than getting its own.
Related: docs/engineering/beta-environment.md

## D001 — 2026-07-22 — Adopted this decisions log

Status: Accepted
Decision: Going forward, decisions worth not re-deriving get an entry here, in this one file, newest on top.
Prior decisions remain documented inline as informal "Status:" sections inside their originating docs (`docs/product/`, `docs/engineering/`) and are **not** retroactively backfilled into this log — only new decisions from this point forward.
