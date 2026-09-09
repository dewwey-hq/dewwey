# STATE — the one living status page

**Read this first in every session.** It is rewritten (not appended) at the end of every
working session; history lives in `decisions.md`, preferences in Claude's memory, in-flight
detail nowhere else. If this page and any other doc disagree, this page is newer.
Protocol: `engineering/working-across-sessions.md`.

Last rewritten: **2026-09-09 ~01:00 CT** (end of the D055 overnight session; the latest commit on local
`main` is this hand-off — **not pushed**; run `git log --oneline -3`).

## Mission in flight

**D055 — "squeeze the 47k"**: turn Jeremy's 47,623-post Instagram corpus into as many real,
credible, venue-anchored documented weddings as possible, then write the residue table and move
on. Plan: `~/.claude/plans/i-have-a-prompt-flickering-creek.md` (approved 2026-09-08). Phase 0
(gates removed, structural evidence, review UI) is done; Phase 1 (human review + batched
creation) is the active loop; Phase 2 (LLM text residue + vision) is blocked on money/credits.

Roles the user set: **Fable** thinks, strategizes, reviews diffs, and may clear structurally
unambiguous classes on the user's behalf under `reviewed_by='fable-structured'` when explicitly
approved; **Sonnet 5** subagents implement from named templates; **Haiku 4.5** does bulk
extraction; the user labels at `/label/candidates` and says "create" for every batch.

## Numbers (live DB, 2026-09-09 01:00)

| | |
|---|---|
| `weddings` | 4,265 (3,541 at the start of D055) |
| `wedding_posts` / `wedding_vendors` | 4,870 / 36,384 |
| structural-v2 candidates | 7,636 (10 hand-merges logged in `structural_candidate_merges`) |
| Verdicts, user (`jeremy`) | 224 W / 74 N / 14 V |
| Verdicts, Fable (`fable-structured`) | 600 W / 296 N / 11 V |
| Confirmed-Chicago posts still unreviewed | 1,769 (821 location-tag, 771 credit-line, 107 author photo-only, 52 inline, 18 hashtag) |
| Metro Places venues by documented weddings | 12 at 0 · 111 at 1-5 · 50 at 6-15 · 57 at 16+ |
| Batches created | batch1 13 · batch2 60 · batch3 651 (all revertable by `batch_id`) |

## Blocked on the user

1. **Alias round 6** needs web verification (this session's WebSearch budget hit 200/200):
   `cbgweddings→chicagobotanic` (16 venue weddings already accumulating on the unverified
   handle), `artinstituteweddingsevents→artinstitutechi`, `rpmeventsandcatering↔rpmeventschicago`,
   `167greenstreet/167eventschicago`, `totlspecialevents/theateronthelakechicago`; plus an
   `account_locations` row for `empireburgerbar` (Naperville). Raise
   `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` or verify by hand.
2. **Push** local `main` (two commits ahead of `origin/main`: batch 3 + this hand-off) — never pushed without the user's word.
3. **OpenRouter top-up** before Phase 2 calibration (~$8 text + ~$3 vision).
4. **Apify credits (2026-09-11)** before the vision slice — every stored CDN image URL is dead;
   images must be re-acquired and persisted to R2 first (`corpus-images-are-dead` memory).
5. **Labeling**: the 1,769-post queue. Location-tag anchors are where the 12 zero-coverage
   venues move; Fable has NOT been approved to read that class on the user's behalf.

## Next actions (in order, when unblocked)

1. When ~100 new human verdicts accrue: snapshot → dry-run
   `createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --batch-id d055-structural-v2-batch4`
   → user's "create" → create → verify (posts attached, venue credit matches) → re-pin test
   literals → D055 addendum → commit → rewrite this page.
2. Apply alias round 6 once verified (`applyAccountAliasesSchema.ts`, round-6 block).
3. Phase 2 slice A (text residue) after the calibration gate; slice B (vision) after 09-11.
4. Phase 3 residue table in `decisions.md` — the exit criterion.

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

## Where things live

- Decision log: `docs/decisions.md` (D055 is the long entry at the top).
- On-behalf verdict SQL, replayable: `apps/web/scripts/graph/tmp_analysis/d055_*_verdicts.sql`.
- Review UI: `/label/candidates` (`app/components/PostVenueReviewClient.tsx`,
  `lib/server/postVenueReview.ts`). Keys: W/N/V/D/U/Space/B, `/` note, Shift+W / Shift+X.
- Provenance: `jeremy_weddings_created.batch_id`, `snapshotGraphTables.ts`,
  `revertWeddingBatch.ts`; snapshots dir is gitignored.
- Tests: `bunx vitest run scripts/graph/*.test.ts --testTimeout=120000 --hookTimeout=120000`.
