# Ambiguous reconciliation tier — audit + ingestion decision (handoff brief)

**Status (2026-09-04): closed.** Audited; not ingested. User agreed to skip the
write after reviewing the dry-run (all 11 candidate inserts were role-variants of
accounts already on those weddings). Full writeup is this file; decision log: D030.
This doc is written to be read cold, with zero prior conversation context — everything you
need is either here or in the files it cites. Read this whole file before touching any code
or running any query.

**No auto-resume here** — unlike the Claude Code session that wrote this (which self-paces
across wake-ups via a `/loop` primitive Cursor doesn't have), this work will run as however
long a single agentic session goes, then stop. **Update the checklist below after every
step, immediately, before moving to the next one** — it's the only thing that survives a
session ending mid-audit. Whoever (or whatever) picks this up next — human, Cursor, or a
fresh Claude session — should be able to read this file cold and know exactly what's done,
what's in progress, and what's next, without re-reading any conversation.

## Checklist (work top to bottom; check off only after live re-verification, not from memory)

- [x] **Characterize the 369 never-reconciled candidates.** Read `runJeremyWeddingReconciliation.ts`'s
      selection query; diff against `jeremy_wedding_candidates` to find what's structurally
      different about these 369 (newer? malformed? a specific cluster shape?). Write the answer
      here as a new subsection before moving on — a bug and an intentional exclusion need
      different next steps. **Done 2026-09-04 — intentional exclusion, not a bug. See
      "The 369 never-reconciled candidates" below.**
- [x] **Deterministic sub-tier of the 268**: exact-shared-post-URL check (see "Suggested method"
      below). Record the count and treat it as auto-confirmed, same as D020 did for the 143's
      91.6% exact-URL tier. **Done 2026-09-04 — 5 / 268 (1.9%).** See "Deterministic sub-tier"
      below. Not analogous to the 143.
- [x] **Non-exact remainder review**: risk-score + handle-diff each remaining case, GREEN/YELLOW/RED,
      watching specifically for false merges. Record the verdict table here (mirror D020's format).
      **Done 2026-09-04 — 4 GREEN / 109 YELLOW / 150 RED.** See "The 268 — non-exact remainder
      review" below. False-merge pattern is the bulk of the tier.
- [x] **Ingestion decision**: for whatever is judged safe, build the actual insert script
      (mirror `applyJeremyEvidenceToGraph.ts` exactly — additive, provenance-logged,
      `--dry-run` first). If the audit concludes most of the tier shouldn't be ingested, write
      that decision down explicitly — it's a complete, valid outcome, not a stall.
      **Done 2026-09-04 — ingest 9 (5 exact + 4 GREEN); leave 259 out.** Script:
      `applyAmbiguousEvidenceToGraph.ts`. Dry-run not yet read.
- [x] **`--dry-run` output read in full by hand**, not just the summary counts — this is where
      Case A (the sibling mission) caught real bugs a count alone would have hidden.
      **Done 2026-09-04 — 11 INSERT / 69 SKIP; all 11 are role-variants of accounts already
      on the wedding. Recommend no real write. See dry-run section.**
- [x] **Commit** (with the user's explicit review of the dry-run output and go-ahead on the real
      write) and **idempotency verified live** (immediate re-run reports zero new inserts).
      **Skipped, user agreed 2026-09-04.** No production write. `applyAmbiguousEvidenceToGraph.ts`
      remains in the repo un-run (except `--dry-run`, which rolled back).
- [x] **Docs closed out**: new `docs/decisions.md` entry, `ROADMAP.md`'s "Ambiguous reconciliation
      tier" Next-item resolved, this file's Status line updated to "closed."
      **Done 2026-09-04 — D030, ROADMAP Next-item resolved, this file closed.**

## No re-parsing needed — the evidence already exists (confirmed 2026-09-04)

Before touching anything: `ROADMAP.md` used to have a stale-sounding item, "re-parse 47k
staged captions through the stack parser," that read like separate, not-yet-started work.
**It isn't separate — it's this same audit, and the parsing part is already done.** The
4,033 V1-INCLUDE-classified posts have already been run through `stackParser.ts`
(`stack_extraction_entries`, built by `runStackParserBaseline.ts`), and that output is
exactly what `jeremy_post_vendor_evidence` (defined below) is built from, which is exactly
what feeds `jeremy_wedding_candidates`. **Do not re-run the stack parser or build a new
extraction pipeline** — the 268/369/2,092 tiers above are downstream of extraction that
already happened; the gap is purely in the candidate→reconciliation→ingestion decision
layer this doc is about.

Concrete, verifiable proof this matters for real venues (confirmed live, not assumed):

```sql
select a.username, count(*) from jeremy_post_vendor_evidence e
join accounts a on a.id = e.account_id
where a.username in ('ulcchicago','salvatoreschicago') group by a.username;
-- salvatoreschicago | 9,  ulcchicago | 38
```

Both already have *some* credits in `wedding_vendors` (9 and 7 weddings respectively) —
but more raw evidence exists than is reflected there, meaning some of it is sitting
un-ingested in exactly the tiers this audit targets. Good spot-check accounts once you
reach the ingestion-decision step: re-run this query after ingesting and confirm the counts
move for the right reasons (real new credits, not noise — same bar as Case A).

**One caveat worth knowing, not necessarily this audit's job to fix**:
`jeremy_post_vendor_evidence`'s definition INNER JOINs to `accounts` by handle — a vendor
mentioned in Jeremy's posts who has *no* existing Ben account at all is silently invisible
to this entire pipeline (not excluded on purpose, just never considered). If the audit
finds this matters materially, flag it as its own follow-up rather than expanding scope
here.

## What this is

`docs/decisions.md` D019–D025 and `docs/engineering/graph-strengthening/README.md` describe
a workstream that uses Jeremy's Instagram post corpus (47,623 captions in `staging.
instagram_posts`) to add vendor relationships to Ben's existing wedding graph
(`weddings`/`wedding_posts`/`wedding_vendors`, the tables the live app actually queries).
The pipeline: `jeremy_post_vendor_evidence` (view) → `jeremy_wedding_candidates` /
`jeremy_wedding_candidate_posts` (date+Jaccard clustering, `jeremy-cluster-v1`) →
`jeremy_wedding_candidate_reconciliation` (a versioned belief about which Ben wedding a
candidate matches, `reconcile-v2` current).

**Measured live, 2026-09-04** (re-verify before trusting — state may have moved):

| tier | count | status |
|---|---|---|
| Total candidates (`jeremy_wedding_candidates`) | 2,872 | — |
| High-confidence (`match_confidence` 0.75–0.85) | 143 | **Closed.** Audited (D020, see `reconciliation-audit-143.md`), ingested (D023): 63 candidates produced genuinely-new `wedding_vendors` rows (the other 80 were already fully covered by Ben's own crawler data). Do not re-audit or re-ingest. |
| Ambiguous, has a `matched_wedding_id`, below high-confidence | **268** | **Closed (D030).** Audited, not ingested. 5 exact-URL + 4 GREEN identity-safe but already covered at account level; 109 YELLOW / 150 RED left out (false-merge risk is the bulk of the tier). |
| No `matched_wedding_id` at all | 2,092 | Correctly excluded by the `reconcile-v2` evidence floor (D021 — "insufficient evidence → no match, not a floor-value confidence"). Not actionable; don't touch unless you find evidence the floor itself is wrong. |
| Never went through `reconcile-v2` at all | **369** | **Explained 2026-09-04 — intentional exclusion, not a bug.** Exactly the 369 candidates with `venue_account_id IS NULL`. Reconciliation skips them by design (no venue anchor). See subsection below. |

Query to reproduce the table above (`DATABASE_URL` is in `.env.local` at the repo root,
symlinked into `apps/web/.env.local`):

```sql
select
  count(*) filter (where match_confidence between 0.75 and 0.85) as high_conf_143,
  count(*) filter (where matched_wedding_id is not null and not (match_confidence between 0.75 and 0.85)) as ambiguous_268,
  count(*) filter (where matched_wedding_id is null) as no_match_2092
from jeremy_wedding_candidate_reconciliation where reconciliation_version='reconcile-v2';

select count(*) from jeremy_wedding_candidates c
where not exists (select 1 from jeremy_wedding_candidate_reconciliation r
  where r.candidate_id=c.id and r.reconciliation_version='reconcile-v2');
```

## The 369 never-reconciled candidates (characterized 2026-09-04, live)

**Intentional exclusion, not a bug.** Re-verified live against Supabase: 2,872 candidates,
2,503 `reconcile-v2` rows (143 + 268 + 2,092), 369 with no `reconcile-v2` row. Those 369
are **exactly** the 369 candidates whose `venue_account_id IS NULL`. Zero venue-null
candidates have a `reconcile-v2` (or `reconcile-v1`) row; every candidate with a venue
does.

`runJeremyWeddingReconciliation.ts` loads all of `jeremy_wedding_candidates`, then
`if (c.venue_account_id == null) continue;` — skipped entirely, no reconciliation row
written. The script header and `ingestion-design.md` both document this: venue is the
matching anchor ("a wedding is Chicago iff its venue is"); matching without one would
be guessing. This is the designed skip, not a missed run.

What they are **not**:

- **Not newer.** Same clustering version (`jeremy-cluster-v1`), same creation window as
  every other candidate (2026-09-04 13:33–13:36 UTC).
- **Not malformed.** All 369 have an `event_date_est` (2023-02-02 through 2026-08-21);
  3–23 vendors (median 7); post-count distribution matches the rest of the corpus
  (avg 1.13 posts, 334/369 single-post).
- **Not the accounts-INNER-JOIN caveat from the evidence view.** Zero of the 369 have a
  `role='venue'` row even in raw `stack_extraction_entries` — the parser never extracted
  a venue handle from their captions. (By contrast, all 2,503 with `venue_account_id` set
  do have a venue role in `jeremy_post_vendor_evidence`.) So this is "no venue mentioned
  in the stack," not "venue mentioned but no Ben account."

**Next step for this bucket: none, in this audit.** They cannot be reconciled under the
current algorithm. Creating Ben-wedding matches without a venue would be a different
design (and a weaker one). If a later pass wants to recover venues from these captions
(parser miss vs. genuinely venue-less stacks), that's a separate extraction-recall
follow-up, not this candidate→reconciliation→ingestion decision.

## Deterministic sub-tier of the 268 (exact shared post URL)

Same method as D020: a Jeremy candidate post URL that exactly equals a Ben
`wedding_posts → posts.url` for the matched wedding is treated as auto-confirmed,
regardless of the reconciliation confidence that put the pair in "ambiguous." Date
discrepancy does not override an exact URL match.

**Re-verified two ways, both 2026-09-04:** live SQL on Supabase, and
`exportAmbiguousReview.ts` → `auditAmbiguous.ts` over the both-sides CSV. Both
give **5 / 268 (1.9%)**. Contrast: the 143 high-confidence tier was **131 / 143
(91.6%)**. This tier is not "the 143 with slightly weaker auxiliary evidence" —
almost none of it shares a source post. Zero of the 268 matched weddings are
missing `wedding_posts` rows (join is complete). All 268 have `match_confidence = 0.4`.

The five, with why they missed the high-confidence bucket (`date ≤ 14 AND Jaccard > 0.5`):

| candidate | wedding | date delta | role-Jaccard | why not high-conf |
|---|---|---|---|---|
| 2713 | 985 | 1 | 0.500 | Jaccard is `=` 0.5, threshold is `>` 0.5 |
| 2715 | 980 | 1 | 0.500 | same threshold-edge |
| 2823 | 1260 | 1 | 0.500 | same threshold-edge |
| 2670 | 1120 | 16 | 0.619 | date just outside the 14-day high-conf window |
| 925 | 474 | 310 | 0.636 | huge date delta (recap / parse disagreement); URL still identical, so still auto-confirmed per D020 rule |

Treated as auto-confirmed. Wedding 474 is also targeted by two non-exact candidates
(1029, 2157) and wedding 1120 by four (1895, 2022, 2232, 2422) — those remainder
cases are reviewed below, not auto-confirmed by the exact-URL sibling.

## The 268 — non-exact remainder review

**263 / 268** have no exact shared post URL. Same method as D020: risk-score
(`auditAmbiguous.ts`, identical function to `auditHighConfidence.ts`), then handle-diff
(not the role-labeled Jaccard — D020 found that understates overlap on role relabeling
and handle typos). Artifacts: `ambiguous_268.{csv,md}`, `ambiguous_non_exact_ranked.json`,
`ambiguous_remainder_verdicts.json`.

This tier is structurally unlike the 143. Only **20 / 263** entered ambiguous on both
signals (date ≤ 30 **and** Jaccard > 0.3). 116 are date-only (Jaccard ≤ 0.3). 127 are
Jaccard-only (date > 30). 49 Ben weddings are targeted by more than one of the 268
(D020 found 1). That magnet pattern is the false-merge mode D020 searched for and did
not find in the 143: same venue, reused vendors, distinct event dates.

Handle-diff verdicts (calibrated to D020: their GREEN needed strong handle overlap plus
a small date delta; their only YELLOW was 12 days / 11 of 14 Jeremy handles on the Ben
side; RED was 0 because the 143 didn't have this magnet):

| verdict | count | meaning |
|---|---|---|
| GREEN (same wedding) | 4 | handle recall ≥ 0.75, ≥ 3 non-venue overlapping handles, date delta ≤ 14d |
| YELLOW (likely / flagged) | 109 | 96 with strong overlap but date > 30d (same-stack vs date-parse, not auto-ingest); 10 in the 15–30d band (D020-YELLOW shape); 3 moderate overlap within 14d |
| RED (different wedding) | 150 | 49 venue-only overlap; 119 date ≤ 30 but weak handle overlap; rest same-venue vendor reuse. **Do not ingest.** |

**False-merge pattern: found, and it is the bulk of the tier.** 0 of the 4 GREEN sit on
a multi-candidate wedding; 86 of the magnet-mapped remainder are RED. Concrete example:
candidates 1492 and 1629 both match wedding 282 (`@universityclubofchicago`, Ben date
2025-12-16) with Jaccard 0.09 / 0.06 — 1492 is a 2025-11-20 stack, 1629 is a 2025-12-31
stack, overlap is the venue handle. Ingesting either would credit the Dec 16 wedding
with a different couple's vendors.

The 4 GREEN, reviewed against both-sides evidence (role-Jaccard looks weak because of
relabeling, same noise D020 documented; handle overlap is complete):

| candidate | wedding | venue | delta | handle overlap | note |
|---|---|---|---|---|---|
| 341 | 116 | artifacteventschicago | 13d | 11/11 | `danielakostabeauty` hair+makeup vs Ben `beauty_other`; `zhantrachicagoent` dj vs musician |
| 1819 | 363 | maedistrict | 11d | 13/13 | Jeremy's vendors already a subset of Ben's; role-Jaccard 0.41 is measurement |
| 2277 | 600 | chicagobotanic | 1d | 5/5 | same |
| 2860 | 1353 | galleriamarchetti | 0d | 5/5 | different posts, same calendar day |

YELLOW is not ingested. The 96 far-date cases include some near-identical 10–27 vendor
stacks (e.g. candidate 921 Jaccard 1.00 / 14/14 handles / 325 days) that are *probably*
date-extraction failures on the same wedding — but without opening the source posts,
that is indistinguishable from a venue house-team reuse, and a wrong write pollutes
`wedding_vendors`. Miss is cheaper than a false merge. The 10 mid-date and 3
near-moderate cases are closer calls; still below D020's GREEN bar, and this tier is
lower-confidence by definition.

## Ingestion decision

**Most of this tier should not be ingested.** 259 / 268 (YELLOW + RED) stay out.
That is the outcome, not a stall.

**Safe to ingest: 9 candidates** — the 5 exact-URL auto-confirmed plus the 4 GREEN
remainder. Script: `apps/web/scripts/graph/applyAmbiguousEvidenceToGraph.ts`, a
scoped copy of `applyJeremyEvidenceToGraph.ts` (additive, `on conflict do nothing`,
provenance in `jeremy_wedding_vendors_ingested`, whole-run transaction, `--dry-run`
rolls back). Cannot filter by confidence band (all 268 are 0.4); uses an explicit
allowlist of the 9 audited IDs. Per-row logging added so the dry-run can be read
in full, same lesson as Case A.

Allowlist: 925, 2670, 2713, 2715, 2823 (exact URL); 341, 1819, 2277, 2860 (GREEN).

## `--dry-run` read in full (2026-09-04)

Command (from `apps/web`): `bun scripts/graph/applyAmbiguousEvidenceToGraph.ts --dry-run`

Summary: **9 candidates, 80 attempted, 11 INSERT, 69 SKIP, rolled back.** Allowlist
resolved 9/9. No `role='other'` inserts, no trailing-period handles, no celebrity
mentions, no new accounts.

The 11 INSERT lines, classified by hand against the both-sides review artifact
(Ben already has this account on the same wedding under a different role):

| wedding | cand | handle | would insert | already on Ben wedding as |
|---|---|---|---|---|
| 116 | 341 | zhantrachicagoent | dj | musician |
| 116 | 341 | danielakostabeauty | hair | beauty_other |
| 116 | 341 | pinmeupchicago | hair | makeup |
| 116 | 341 | danielakostabeauty | makeup | beauty_other |
| 116 | 341 | mvmtevents | rentals | other |
| 474 | 925 | mel0dierose | planner | other |
| 474 | 925 | nyeventschicago | planner | other |
| 1120 | 2670 | westcoastmusicevents | band | musician |
| 985 | 2713 | chicagocatz | band | musician (+ other) |
| 980 | 2715 | rushstreetrhythm | band | musician |
| 1260 | 2823 | socialbridescollective | content_creator | videographer |

Candidates 1819, 2277, 2860: every Jeremy (account, role) already present — 0 inserts.
Same shape as D023's 80-already-covered, except here it is **all 9 candidates** at the
account level.

**This is the Case A-class finding a count of "11" would have hidden.** Feed-tab counts
are `wedding_vendors` row counts (D026), not distinct accounts. Ingesting these 11 would
increment Feed for a person already credited on that wedding, via a role-label variant
(the exact measurement noise D020 documented: `content_creator` vs `videographer`,
`band` vs `musician`). Three of the 11 are `other` → named-role promotions, which are
cleaner, but still a second row for the same account on the same wedding.

**Recommendation: do not run the real write.** The 9 are identity-safe; they add no new
vendor identities. A wrong-direction Feed inflation is not "real new credits." Script
stays in the repo if a later call wants the role-promotion rows anyway.

**User agreed (2026-09-04): skip the write.** No `wedding_vendors` rows from this tier.
The 259 YELLOW/RED were never going in; the 9 identity-safe candidates add nothing
the graph doesn't already have at the account level.

## Why this exists (context for the mission, not a prompt to relitigate)

This was originally scoped as "Phase 2" of a different, smaller mission
(`docs/engineering/vendor-feed-gap/README.md`, Case A/B — a separate bug affecting Ben's
own posts, unrelated corpus). The user asked whether that mission would produce a
"dramatic" increase in venue coverage after hearing about "3k+ posts" being added; the
honest answer, checked live rather than assumed, was no — that expectation actually maps to
this 2,872-candidate Jeremy backlog, of which only 143 (5%) have been decided so far. The
user chose to pursue both, but this piece is large and open-ended enough to hand to a
separate tool/session rather than burn one session's budget on it. **This doc is that
handoff** — the vendor-feed-gap mission's own Case A/B work is unaffected and can continue
separately (see that mission's own README).

## Constraints (same bar this whole workstream has held itself to — don't relax it)

- **This sandbox (if you're in one) has no Python/psycopg2** — the pipeline lives in
  TypeScript (`apps/web/scripts/graph/*.ts`), run via Bun from `apps/web`
  (`bun run scripts/graph/<script>.ts`), against Supabase directly (`DATABASE_URL`).
- **Additive only.** Never `UPDATE`/`DELETE` an existing `wedding_vendors` row. Every insert
  is `on conflict do nothing`. Follow `apps/web/scripts/graph/applyJeremyEvidenceToGraph.ts`
  (D023) as the exact template: scope filter → per-candidate vendor loop → insert with
  conflict handling → provenance log (`jeremy_wedding_vendors_ingested`, already exists,
  reuse it — just filter by a new reconciliation tier / confidence band instead of the
  0.75–0.85 band that script currently hardcodes) → `refresh materialized view edges` →
  whole-run transaction with `--dry-run` rolling back.
- **Never truncate/rebuild `weddings`/`wedding_posts`/`wedding_vendors`.** Ben's
  `phase_dedup()` (Python, `pipeline/pipeline.py`) does this and is explicitly never to be
  re-run against Supabase — it would wipe every write this entire workstream has made and
  renumber every wedding ID, which the reconciliation layer's own design (D019) works around
  but a truncate would still break any *already-ingested* provenance rows' `wedding_id`
  references.
- **Read the full result list by hand before trusting a count.** The most recent sibling
  work (vendor-feed-gap's Case A, same repo, same day) found real, non-obvious precision
  problems that a raw insert count alone would have hidden entirely: a caption-parser
  catch-all role bucket concentrating noise (celebrity mentions, a misclassified non-wedding
  event already sitting in the graph), a node-postgres bigint-returned-as-string gotcha that
  silently broke an exclusion filter, and a shared regex quirk that would have created
  duplicate vendor accounts. Expect at least as much noise here — this tier is *lower*
  confidence than Case A's input by definition. Don't ship on a `--dry-run` count alone.
- **`--dry-run` first, idempotency verified live** (immediate re-run after a real commit
  should report zero new inserts) before considering any step done.
- **The actual commit (dropping `--dry-run`) will likely be blocked** by Claude Code's own
  auto-mode classifier as a production DB write, if you're running this in Claude Code. If
  so: stop, and give the user the exact command to run themselves with a `!` prefix (this
  is how Case A's commit was handled). Don't try to route around the block. If you're
  running this in Cursor, whatever Cursor's own confirmation/approval flow is for a DB
  write applies — surface the exact command and dry-run output for the user to review
  before running for real either way; this isn't a Claude-Code-specific caution, it's a
  "this writes to a shared production database" caution.

## Suggested method (mirror D020, don't reinvent)

`reconciliation-audit-143.md` is the established audit method for exactly this kind of
tier — read it in full before starting. Its two-tier approach should transfer directly:

1. **Deterministic sub-tier**: for each of the 268 ambiguous candidates, check for an exact
   shared Instagram post URL between the Jeremy candidate's posts and the matched Ben
   wedding's posts (`wedding_posts(wedding_id, post_id) → posts.url`). An exact URL match is
   the strongest possible identity signal, regardless of the reconciliation confidence
   score that put it in the "ambiguous" bucket in the first place — the low score may just
   reflect weak *auxiliary* evidence (date, vendor-list overlap) even when the core identity
   evidence (same literal post) is solid.
2. **Non-exact remainder**: risk-score and review by diffing vendor **handles** (not just
   role-labeled strings — D020 found role-label differences and handle typos/variants
   understate true overlap) between the Jeremy candidate's evidence and the matched Ben
   wedding's actual vendors. Use `auditHighConfidence.ts` and `exportHighConfidenceReview.ts`
   as templates — they already do this for the 143 tier; adapt the tier filter.
3. Score each on same-wedding likelihood, vendor-overlap strength, date-evidence strength →
   GREEN/YELLOW/RED, watching specifically for **false merges** (two distinct real weddings
   collapsed into one Ben wedding) as the highest-priority failure mode, same as D020.

**A valid, complete outcome is "most of this tier shouldn't be ingested."** This tier is
called "ambiguous" for a reason — don't force an ingestion number to feel productive. If the
audit finds the tier is mostly noise (or mostly duplicates of matches Ben's crawler already
made), that is a real, useful, doc-worthy result on its own.

## End state / what "done" looks like

- The 369-never-reconciled bucket is characterized and explained (bug, or intentional —
  either way, documented).
- The 268 ambiguous candidates have been through an equivalent audit to the 143's, with a
  GREEN/YELLOW/RED-style verdict per non-exact case (or an explicit "not worth the effort"
  call, justified).
- Whatever is decided safe to ingest is ingested via a script matching
  `applyJeremyEvidenceToGraph.ts`'s exact safety pattern, `--dry-run` verified, committed
  (with the user's explicit go-ahead on the actual write), idempotency confirmed live.
- A new `docs/decisions.md` entry (next `D0NN` — check the current last entry number first,
  this workstream moves fast) recording the audit method, the numbers, the ingestion
  decision and why, at the same density D020/D023 already set.
- `ROADMAP.md`'s "Ambiguous reconciliation tier (268 candidates)" Next-item resolved
  (checked off or re-scoped with the real numbers) — and if you also resolved the
  369-unreconciled mystery, add a line noting that too, since it wasn't previously tracked
  anywhere.
- If you're a Cursor session with no access back to this Claude Code session: just leave
  the docs in good shape (per above) — that's the full handoff contract. Whoever picks up
  next (human or another agent) should be able to start from `docs/decisions.md`'s latest
  entry and `ROADMAP.md`'s "Now" section, the same way this doc itself was written to be
  read cold.
