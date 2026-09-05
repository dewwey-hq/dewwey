# Vendor feed/browse gap — applying the already-validated stack parser to Ben's own graph

**Status (2026-09-04): closed.** Case A committed (D027); Case B sized and declined (D031);
Jeremy ambiguous-tier side-quest closed without ingestion (D030). Tests, pagination, and
visual check done.
Full narrative: `docs/decisions.md` D026 (kickoff). Plan approved in the session that wrote this
doc; see that session's plan file for the original investigation trail if this doc is ever
insufficient on its own.

## Goal, restated (not "fix a bug" — "close a known-sized gap")

`galleriamarchetti`'s vendor page shows "Feed 15" — confirmed by direct DB inspection to exactly
match its `wedding_vendors` row count. But 19 distinct posts mention the account, and 4 of those
never became a wedding at all. `ulcchicago` similarly is missing a real wedding (id 1352, "Gisela
+ Charles" at Union League) whose caption literally reads `"Venue @ulcchicago"` on its own line —
every other vendor on that same caption got credited, this one didn't. Two distinct mechanisms,
both already understood:

1. **Recall gap in the caption parser**: `pipeline/pipeline.py`'s `LINE` regex requires a
   punctuation separator between a role label and `@handle`. Plain `"Role @handle"` (space only)
   never matches. **Already fixed and evaluated** — `apps/web/scripts/graph/stackParser.ts`'s `v3`
   revision (`NOCOLON_LINE`, added today per `docs/engineering/graph-strengthening/README.md`'s
   iteration 2) — but only ever run against Jeremy's staging corpus, never against Ben's own
   already-ingested `posts`/`post_mentions`.
2. **The "1–2 vendor-role evidence gap"**: `has_stack` (and therefore whether a post's mentions
   ever get clustered into a wedding at all, via `phase_dedup()`'s `where p.has_stack`) requires
   ≥3 distinct roles. A post with only 1-2 genuine vendor credits never forms a wedding, no matter
   how correct those 1-2 credits are. Already named in `ROADMAP.md` "Next," but scoped there only
   to Jeremy's `runJeremyWeddingClustering.ts` — never to Ben's own graph.

Goal: apply the already-validated parser fix to Ben's own corpus, and give sparse-but-real posts
a bounded way to join an existing wedding — then prove the vendor pages reflect it, with tests,
performance/pagination sanity, and a live browser check. Not a rewrite of the parser or the
clustering algorithm — both are already right; the gap is that they were never run against this
corpus.

## Constraint (read before writing any code here)

No Python/psycopg2 in this sandbox (`sandbox-no-python-packages` memory; `stackParser.ts`'s own
header says the same). `pipeline.py`'s `db()` is hardcoded to `localhost:5442` (the local
rehearsal DB) — it has never touched Supabase, the source of truth. So: **implement in
TypeScript against Supabase directly**, reusing `apps/web/scripts/graph/stackParser.ts`'s
`parseCaption()` as-is (do not re-derive the regex).

**Never re-run a `phase_dedup()`-equivalent truncate.** `applyJeremyEvidenceToGraph.ts`'s own
header already documents why: a truncate/rebuild of `weddings`/`wedding_posts`/`wedding_vendors`
wipes everything the graph-strengthening workstream wrote and renumbers every wedding ID — which
today's Jeremy-reconciliation run (63 weddings merged by ID, 13:33–21:05) depends on. This
mission's writes must be surgical inserts/updates (additive, `on conflict do nothing`), mirroring
the D023 pattern exactly: `--dry-run` flag with transaction rollback, provenance table, explicit
`refresh materialized view edges`, idempotency verified live before calling anything done.

## Scope expansion (2026-09-04, mid-mission)

User asked whether finishing this mission would produce a "dramatic" venue-coverage
increase, having recently seen ~3k+ posts referenced. Checked live rather than assumed:
that number is `jeremy_wedding_candidates` (2,872 rows, the graph-strengthening
workstream's Jeremy-evidence clustering, D016-D025) — a **different corpus and pipeline**
than this mission's Case A/B (Ben's own `posts`, 6,370 rows, unchanged). Only 100 rows /
63 weddings of Jeremy's evidence have ever been ingested into `wedding_vendors` (D023,
high-confidence tier only); **~2,772 candidates sit un-ingested**, matching ROADMAP's
already-named "Ambiguous reconciliation tier" Next-item almost exactly (that item cites
268 candidates specifically for the ambiguous band — the full un-ingested set is larger;
re-measure the exact tier breakdown before auditing, don't reuse the 268 figure blind).
**Decision (user, asked directly): do both in this loop** — finish Case B/tests/docs for
the current mission first, then continue straight into a Jeremy-ambiguous-tier audit as
phase 2 of this same mission, rather than treating it as a separate pickup later. Added as
a new checklist phase below.

## Checklist (work top to bottom; check off only after live re-verification)

- [x] **Baseline audit** (2026-09-04) — corpus-wide, both queries re-run live against Supabase,
      see "Baseline findings" below. Ceiling only, explicitly caveated — real yield deferred to
      Case A's `--dry-run` output (it runs the actual `parseCaption()`, not a SQL approximation).
- [x] **Case A backfill script — COMMITTED** (2026-09-04) — `apps/web/scripts/graph/
      reparseBenPostsStackParserV3.ts`. Re-parses Ben-sourced posts that already have a
      `wedding_posts` row, using `parseCaption()` unmodified. Inserts missing `(handle, role)`
      `post_mentions` rows and the matching `wedding_vendors` row on the post's *existing*
      `wedding_id`. Backfills `weddings.venue_id`/`is_chicago` when the new credit is
      `role='venue'` and those were `NULL`. Provenance-logged (`stack_reparse_v3_ingested`,
      mirrors `jeremy_wedding_vendors_ingested`'s shape). `--dry-run` + rollback, `refresh
      materialized view edges` on real commit.
      **Committed result: 56 new `wedding_vendors` rows, 4 `venue_id`/`is_chicago` backfills.**
      Verified live: `ulcchicago`/wedding 1352 now has `role='venue'`, `weddings.venue_id=580`,
      `is_chicago=true` — the exact bug this mission was named for, fixed. Idempotency verified
      live (immediate re-run: `entries_new=0 inserted=0`).
      **Important, non-obvious result — read before assuming this closes the user's original
      complaint**: `galleriamarchetti` (account 31, the venue the user actually pointed at —
      "Feed 15... I think there's more than 15") is **still 15 after this commit, unchanged**.
      Its baseline gap was never a Case A shape (posts already in a wedding, missing one
      credit) — its 4 "orphaned" posts never formed a wedding at all, which is Case B, not yet
      built. Similarly `kehoedesigns` (the single largest baseline gap, 18/33) is **also
      unchanged at 18** — its "15 reachable but uncredited" weddings turned out to be mostly
      generic prose mentions (no structured credit line), correctly not recovered. **The 974
      baseline number was mostly noise, as flagged when it was recorded** — Case A's real,
      precision-checked yield was 56, concentrated in different accounts than the two examples
      discussed with the user. Case B is what the user's own example actually needs.
      Full new-entry list read end-to-end by hand before finalizing — three real issues found
      and fixed along the way:
      1. `role='other'` entries (stackParser.ts's catch-all for anything not matching a
         recognized `ROLE_MAP` keyword) turned out to concentrate real noise — a whole
         misclassified non-wedding event (wedding 592, actually a fashion runway show —
         `"The Walking Body • Runway"`, pre-existing in Ben's graph, out of scope to fix here)
         and a celebrity-mention false positive (`@martingarrix` "crashed the after party,"
         not an actual videographer — the real one, `@teddysphotos`, was on the same line).
         **Policy: this backfill only commits named-role matches, `other` is logged and
         skipped**, deferred to manual review.
      2. A node-postgres bigint-as-string gotcha silently broke the wedding-592/`other`-role
         exclusions the first time — `weddings.id`/`posts.id` come back as strings unless cast
         to `::int` in the query, so a `Set<number>.has(stringValue)` check always silently
         missed. Fixed by casting in the query, not by changing the comparison side.
      3. The shared `HANDLE` regex (`@([A-Za-z0-9._]{2,30})`, identical in `stackParser.ts` and
         `pipeline.py`) captures a trailing sentence-ending period into the handle
         (`"...at @charcoalfactoryloft. This was..."` → `charcoalfactoryloft.`). Would have
         created duplicate accounts for venues that already exist cleanly. Fixed locally (this
         script trims trailing dots before any DB lookup — Instagram usernames can never end in
         a period, so this is a safe general normalization) rather than touching the shared
         regex, which needs the graph-strengthening workstream's eval-set rigor first.
      The commit run was denied by Claude Code's own auto-mode classifier as a production DB
      write (same class of guardrail D022/D024 hit for an `ALTER TABLE`) — user approved and
      ran it directly (`!`-prefixed) after reviewing the recommendation. Committed 2026-09-04.
- [x] **Case B: orphaned posts** (2026-09-04, **sized and declined — D031**). Conservative
      attach rules (unique venue in 21-day window; 2+ handles on the same nearby wedding)
      produced **11 mechanical hits**. Every one read against source captions. At least two
      confirmed false merges (Kate Bauer vs Sara-and-Ben at `@publishinghouse_bnb`; Koscak
      rehearsal vs Andrea+Joe at `@osteriaviastato`). The identity-plausible leftovers add
      no new `wedding_vendors` rows. Honest new-vendor yield of a general writer: two rows,
      both from rejected non-wedding/wrong-wedding posts. **No attach script shipped.**
      `galleriamarchetti` Feed 15 matches the evidence. Sizer:
      `apps/web/scripts/graph/sizeCaseBAttachOpportunity.ts` (read-only). The 202/4,702
      named-role ceiling and post 110 (`@thebarnattimberpointe`) still stand as description
      of the raw pool; post 110 is a real wedding but that venue has two weddings in the
      21-day window, so unique-venue correctly refuses.
- [x] **Tests** — `parseCaption()` fixtures in `graphStrengthening.test.ts` (`Venue @ulcchicago`,
      `Band @yazzevents`, `Coordination @ymleliteevents`, colon-form still works). Live-DB:
      `galleriamarchetti` still 15 rows; `ulcchicago` has `role='venue'` on wedding 1352.
- [x] **Performance/pagination** — 5 accounts have >50 `wedding_vendors` rows (top:
      `bbjlatavola` 101). Vendor detail Feed was silently capped at 50 and the badge used
      `stacks.length`. Now paginated like `/weddings` (20/page, `?page=`), badge uses
      `feedTotal`. Live: `/vendors/bbjlatavola` shows Feed 101, page 2 of 6.
- [x] **Visual browser check** (localhost:3000, 2026-09-04): `/vendors/galleriamarchetti`
      Feed 15, Works with 24, Details intact; `/vendors/ulcchicago` Feed 9 (9 dated cards);
      `/vendors?slot=Venue` lists venues with existing pagination. Browse still shows
      `galleriamarchetti` as 14 Chicago weddings vs detail Feed 15 — the known
      `is_chicago` browse-list gap (D026, deliberately not this mission).
- [x] **Docs (phase 1 close)** — D027 (Case A), D031 (Case B declined), ROADMAP Now item
      closed. Jeremy-side 1–2-role gap remains a Next item (different write path). `CLAUDE.md`
      already records that `lib/server/graph.ts` is the browse/detail layer (D026).

### Phase 2 (added 2026-09-04, user-requested — see "Scope expansion" above)

**Closed 2026-09-04 (D030).** Handed off, audited, not ingested. Full writeup:
`docs/engineering/graph-strengthening/ambiguous-tier-audit-handoff.md`. Do not re-open
this phase unless D030's "not ingested" decision is being relitigated.

- [x] **Re-measure the Jeremy reconciliation tiers, live** — 143 high-conf (closed D023),
      268 ambiguous, 2,092 no-match (D021 floor), 369 never-reconciled (venue-less skip).
- [x] **Build or extend the ambiguous-tier audit** — D020 method: 5/268 exact-URL (1.9%),
      remainder 4 GREEN / 109 YELLOW / 150 RED. False-merge magnets are the bulk of the tier.
- [x] **Decide and (if warranted) ingest** — dry-run of 9 identity-safe candidates: 11 INSERT,
      all role-variants of accounts already on the wedding. User agreed to skip the write.
- [x] **Docs (phase 2 close)** — D030, ROADMAP Next-item resolved, handoff Status closed.

## Baseline findings

Corpus totals (2026-09-04): 6,370 `posts`, 29,008 `post_mentions`, 1,384 `weddings`, 12,410
`wedding_vendors`.

**Undercount (Case A shape — post already reachable via `wedding_posts`, credit just missing):**
of 8,611 accounts with any evidence (a `wedding_vendors` row or a `post_mentions` row), **823**
have `distinct weddings reachable via post_mentions → wedding_posts` > `distinct weddings via
wedding_vendors` — **974 missing `(account, wedding)` credit pairs total**, ~7.8% relative to the
existing 12,410 `wedding_vendors` rows. Not evenly spread — top of the list: `kehoedesigns` (18
credited / 33 reachable, gap 15), `hmrdesigns` (31/38, gap 7), `bbjlatavola` (101/108, gap 7),
`tablescapeseventrentals` (67/73, gap 6). This is the number Case A should converge toward, net of
whatever fraction turns out to be already-correct exclusions rather than genuine parser misses.

**Orphaned posts (Case B shape — post never reached `wedding_posts` at all):** raw count is
7,323 `post_mentions` rows (3,752 distinct accounts) pointing at posts with no `wedding_posts`
row. **This is a ceiling, not the real gap** — many of these are `post_mentions` rows that were
*correctly* left out (a caption's generic/prose @mention with no real vendor-credit intent, e.g.
tagging a friend or a couple, is supposed to never form a wedding). The two ulcchicago/
galleriamarchetti spot-checks from this session found genuine misses only when a caption line was
actually structured (`"Role @handle"`-shaped, e.g. `"Venue @ulcchicago"`) — that's the pattern
`stackParser.ts` v3's `NOCOLON_LINE` targets. **Don't act on the 7,323 raw number directly** —
Case B's real yield needs the same `parseCaption()`-based measurement Case A will produce, not a
SQL heuristic on top of this ceiling.

**Next tick**: build the Case A backfill script (`--dry-run` first) — its `attempted`/`inserted`/
`already-existed` counters, run against the 823 undercounted accounts' posts, become the *real*
baseline (replacing this ceiling), the same way graph-strengthening's own baseline moved from raw
counts to eval-set-measured precision/recall before any production write.

## Deliberately not touched this mission

- The separate, smaller `/vendors` browse-list gap (INNER JOIN `v_account_role` + `is_chicago
  NULL` excluding ~40% of weddings from `n_chicago` counts) — real, but detail pages are not
  is_chicago-gated (confirmed live) so it's independent of the undercount the user actually
  flagged. Worth a follow-up mission, not blocking this one.
- Full parity between `stackParser.ts` and `pipeline.py` beyond what `v3` already covers (emoji-
  before-colon lines, reversed `"@handle - Role"` order, pipe-delimited multi-credit lines) — all
  three are already named as future work in `docs/engineering/graph-strengthening/README.md`'s
  "deliberately not touched" section for iteration 2. Out of scope here unless the baseline audit
  shows they're a material share of the gap.
- Re-scoring roles on *already-correctly-captured* `wedding_vendors` rows using `v3`'s improved
  `ROLE_MAP` (e.g. `band`/`content_creator` as real roles) — a real accuracy opportunity, but
  distinct from the undercount problem. Flag as a possible follow-up, don't blur scope here.

## Open questions, not resolved here

- Case B's attach writer is **not** being built (D031). The remaining 1–2-role-evidence
  shape is Jeremy-side only (`runJeremyWeddingClustering.ts` attach-only, ROADMAP Next) —
  a different write path (`jeremy_wedding_candidates`), not a shared Ben attach.
