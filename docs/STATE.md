# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every
working session; history lives in `decisions.md`, preferences in Claude's memory, in-flight
detail nowhere else. If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-09 ~21:15 CT** (after batch 5). `origin/main` is at `f62abdb`; local
`main` carries the Phase-1 re-plan commits since — **not pushed**; run `git log --oneline -4`..

## Mission in flight

**D055 — "squeeze the 47k"**: turn Jeremy's 47,623-post Instagram corpus into as many real,
credible, venue-anchored documented weddings as possible, then write the residue table and move
on. Plan: `~/.claude/plans/i-have-a-prompt-flickering-creek.md` (approved 2026-09-08). Phase 0
(gates removed, structural evidence, review UI) is done; Phase 1 (human review + batched
creation) is the active loop; Phase 2 (LLM text residue + vision) is blocked on money/credits.

Roles the user set (2026-09-09, cost rule): **Fable** thinks, strategizes, writes prompts and
evals, reviews diffs and calibration numbers, decides what enters creation — and does NOT read
posts in bulk anymore ("expensive; keep Fable for high-strategy asks"); **Sonnet 5** subagents
build from named templates; **Haiku 4.5** reads every post (`scripts/classify/runExtract.ts`,
prompt `extract-v1.1`, calibrated at 90.3% precision vs the human at confidence ≥0.8, spot-
checked blind at 96.7% over 122 venue-spread posts); the user labels breadth only, spot-checks
the model, and says "create" for every batch.

## Numbers (live DB, 2026-09-09 21:15)

| | |
|---|---|
| `weddings` | 5,277 (3,541 at the start of D055, +1,736) |
| `wedding_posts` / `wedding_vendors` | 5,981 / 39,276 |
| structural-v2 candidates | 7,636 |
| Verdicts, user (`jeremy`) | 609 W / 181 N / 18 V (incl. 122 blind spot-checks of the model) |
| Verdicts, Fable (`fable-structured`) | 600 W / 296 N / 11 V |
| Verdicts, Haiku (`haiku-extract-v1`, current) | 865 W (1,001 written; the human's later verdict wins where both exist) |
| Human queue | 534 Chicago-confirmed posts the model would not commit to (badged with its reasoning) + 636 ambiguous-geography posts |
| Metro Places venues by documented weddings | 12 at 0 · 91 at 1-5 · 51 at 6-15 · 76 at 16+ |
| Batches created | b1 13 · b2 60 · b3 651 · b4 371 · b5 641 (all revertable by `batch_id`) |
| OpenRouter spend, whole reader effort | $12.11 |

## Blocked on the user

1. **Push** local `main` (Phase-1 re-plan: reader, queue cut, spot-check + model badge, batches
   4-5) — never pushed without the user's word.
2. **Alias round 6** needs web verification (`cbgweddings→chicagobotanic` etc., see D055) —
   the search budget resets per session; not yet requested.
3. **Apify credits (2026-09-11)** before the vision slice (every stored CDN image URL is dead).
4. **Approvals parked in the plan file**, none executing: the stratified-sampler geography fix
   + "let the reader state each wedding's location" (Giraffe Manor leak); parser failure-path
   backlog #1 emoji-keyed stacks (615 posts) and #2 non-wedding events that also say "wedding";
   the 27-post answer-key correction link (marketing/styled posts the user marked W early).
5. **Labeling**: the 12 zero-coverage venues have no confirmed candidates; the human queue's
   534 posts are the model's low-confidence residue — worth a pass only when convenient.

## Next actions (in order, when unblocked)

1. On the user's word: push; then the geography leak fix + reader-resolved venue geography
   (~$2.70 for the 636 ambiguous posts; expected to drop most of the 593 venues to "not metro"
   from their own captions and shrink the human queue by ~600 without a click).
2. Batch 6 when the human's residue pass yields ~100 new verdicts (same protocol).
3. Parser pass v10 (backlog #1 + #2) when the user schedules it; then re-cluster and let the
   reader read the ~588 newly-stacked posts.
4. Phase 2 slice B (vision) after 09-11 Apify; Phase 3 residue table — the exit criterion.

## Landmines (things that bit us; check before repeating)

- `vendors.city` DEFAULTS to `'Chicago'` — evidence only with `discovery_source='google_places'`.
- A "chicago" inside a hashtag is a vendor's market, not the wedding's location. Venue decides.
- Per-candidate work must scope `stack_extraction_entries` by `post_url` first; the evidence
  views are corpus-wide per call (statement timeouts).
- Pooled Postgres backends can carry a leftover `temp table` — `drop table if exists` first.
- SQL inside JS template literals eats `\y` / `\s` (D049's regex was inert for two days).
- `candidate_review_derived.included_post_urls` holds THIS_VENUE posts only; WRONG_VENUE
  candidates create from their OTHER_VENUE posts (fixed 2026-09-09).
- A post can exist in `posts` with no `wedding_posts` row; creation must link, not skip.
- Six DB tests need 120 s, not 15 s; run suites on a quiet DB (not during a dry run).
- Subagents that "wait for the test run" never return — tell them to run tests and report.
- The model's NOT_WEDDING (68%) and OTHER_VENUE (~20%) calls are NOT reliable; only its W at
  ≥0.8 is written. Half its false positives are styled shoots only the photos reveal.
- A uniform random spot-check inherits the corpus run's ordering — stratify by venue.
- `runExtract --mode corpus --limit N` walks into the ambiguous-geography tail once the
  confirmed pool is exhausted; size the limit to the confirmed remainder.

## Where things live

- Decision log: `docs/decisions.md` (D055 is the long entry at the top).
- On-behalf verdict SQL, replayable: `apps/web/scripts/graph/tmp_analysis/d055_*_verdicts.sql`.
- Review UI: `/label/candidates` (`app/components/PostVenueReviewClient.tsx`,
  `lib/server/postVenueReview.ts`). Keys: W/N/V/D/U/Space/B, `/` note, Shift+W / Shift+X.
- Provenance: `jeremy_weddings_created.batch_id`, `snapshotGraphTables.ts`,
  `revertWeddingBatch.ts`; snapshots dir is gitignored.
- Tests: `bunx vitest run scripts/graph/*.test.ts scripts/classify/*.test.ts --testTimeout=120000 --hookTimeout=120000`.
- Reader: `scripts/classify/extractPrompt.ts` (prompt + schema + write gate), `runExtract.ts`
  (`--mode calibration|corpus`, `--only-this-venue`, `--max-cost-usd`), results in
  `post_extraction_runs`; review UI shows the model badge, `?spotcheck=<reviewer>&n=20`,
  `?post=a,b,c` opens specific posts.
