# Roadmap

Check "Now" before starting a thread — two sessions colliding on the same
in-flight work is what this section prevents. History: `docs/decisions.md`.

## Now

- Post classification (`docs/engineering/post-classification/`, D009–D015): **V1 shipped**,
  not via a full-corpus run. V3 is frozen (pooled precision 0.941). Full-corpus V3 (~$470)
  was judged too expensive for a first slice, so a zero-LLM-cost deterministic candidate
  score (`candidate-score-v1`) shrank the 47,623-post corpus to a 5,225-post high-signal
  pool first — see `candidate-generation-analysis.md` for the evidence. That pool ran
  through frozen V3 for $116.94 (vs. ~$470 full-corpus), yielding **4,033 INCLUDE posts**,
  now live in Supabase as the `v1_content_corpus` view and reachable in the app at `/feed`.
  Remaining ~42k posts (score <12) are NOT classified — deliberately deferred pending real
  product/user feedback, not a blocker. The 240-post manual audit from D013 is deprioritized,
  not run. This is also most of the work for the "re-parse 47k staged captions" item below —
  its output (which own-profile posts are credible) is the ingest filter that item needs.
  **2026-09-04: `jhoffen` GitHub write access resolved — branch `post-classification-v1-corpus`
  pushed, PR open at `dewwey-hq/dewwey#1`** (was blocked, see D015; superseded, not re-litigated).
- Graph strengthening (`docs/engineering/graph-strengthening/`, D016–D023): stack parser ported
  to TS, two iterations eval-tested (96.8% precision / 92.4% recall / 83.2% role accuracy against
  real ground truth). **Evidence + candidate layer is now implemented and live**:
  `jeremy_post_vendor_evidence` (a view — 32,633 rows, 4,982 unique vendors), `jeremy_wedding_candidates`
  (2,872 candidates from 3,273 clustering-eligible posts), `jeremy_wedding_candidate_reconciliation`
  (143 high-confidence / 268 ambiguous / 2,092 no-match vs. Ben's current weddings). Idempotency
  verified live (reran both scripts, zero new/changed rows). A pre-implementation architectural
  review (D019) found and fixed real problems in the first design (evidence identity was wrong,
  an unnecessary table, a durability risk from depending on `staging.instagram_posts` — see D019
  for detail). **`weddings`/`wedding_posts`/`edges`/`phase_dedup()` remain untouched;
  `wedding_vendors` now has 100 ingested rows — see D023 below.**
  **Reconciliation audit closed (D020)**: the 143 high-confidence matches were analyzed (not
  manually audited — see `docs/engineering/graph-strengthening/reconciliation-audit-143.md`)
  — 131/143 (91.6%) have an exact shared Instagram post URL between the Jeremy candidate and the
  Ben wedding (deterministic-strength evidence), the remaining 12 were reviewed and came back
  11 GREEN / 1 YELLOW / 0 RED with zero false-merge patterns. **Decision: trusted on automated
  evidence, no reconciliation redesign justified.**
  **Follow-up A shipped (D021, `reconcile-v2`)**: reconciliation now has an evidence floor —
  candidates matching neither the high nor ambiguous threshold get `matched_wedding_id = null`
  instead of the closest-available (however weak) venue-mate. High (143) and ambiguous (268)
  tiers verified byte-identical to `reconcile-v1`; distinct Ben weddings matched dropped 494→283,
  many-to-one collisions 322→79, the previously-flagged 58-way collision (wedding 1290) is now 7
  (all high/ambiguous). `reconcile-v1` preserved untouched (versioned, not overwritten).
  **Follow-up B investigated, not shipped (D022)**: the wedding-468 case is actually an exact
  Jaccard boundary tie (7/14 = 0.5000, clustering's condition is strict `> 0.5`), not a
  first-vs-best-match greedy-order problem (isolated via simulation — best-match alone changes
  zero candidate-count metrics). A `>=0.5` fix would yield 12 fewer candidates (2,872→2,860,
  0.4%) with zero false merges found across all 14 inspected merge events — see
  `docs/engineering/graph-strengthening/clustering-boundary-investigation.md`. **Not
  implemented**: retroactively applying it needs a schema change
  (`jeremy_wedding_candidates.superseded_by_candidate_id` — `jeremy_wedding_candidate_posts` has
  no per-version PK the way reconciliation does) that this investigation didn't have
  authorization to make (a direct DDL attempt was blocked by the session's own safety guardrail).
  No production data or schema changed.
  **Graph ingestion shipped (D023)**: the 143 high-confidence tier is now written into Ben's
  `wedding_vendors` — additive only (`on conflict do nothing`, no pre-existing row touched),
  fully provenance-logged (`jeremy_wedding_vendors_ingested`, since `wedding_vendors` itself has
  no source column). Of 1,360 candidate-vendor rows across the 143, 1,260 already matched Ben's
  own data (independent confirmation) and **100 were genuinely new** across 63 of the 142
  distinct matched weddings. `wedding_vendors` 12,310→12,410, `edges` (materialized view)
  refreshed 54,271→54,526. Idempotency verified live (reran the apply script, `inserted=0`,
  identical content hash). **Durability caveat, not solved**: `phase_dedup()`'s truncate-rebuild
  would wipe this if it ever runs again — recovery is rerun reconciliation then rerun the apply
  script (both idempotent); the durable source of truth stays the evidence/candidate/
  reconciliation layer, never `wedding_vendors` itself. 41/41 regression tests passing
  (`apps/web/scripts/graph/graphStrengthening.test.ts`).
  **Known gap, not yet fixed**: posts with 1-2 (not 3+) vendor roles contribute evidence but
  aren't currently attached to any candidate even when they'd match one that already exists —
  fast, well-scoped next addition. **Not yet done, deliberately deferred**: ingesting the
  ambiguous (268) tier, or fixing clustering order-dependence (D022) before its yield justifies
  the schema change it needs.
- The dewwey.com domain story: point it at the Vercel project (linked
  2026-08-22), add a custom domain for R2 to replace the r2.dev URL, and
  check the Google Maps browser key's referrer allowlist covers the new
  domains (it may be restricted to Jeremy's old ones).
- Ben ↔ Jeremy merge conversation (`docs/merge-eval.md` is the case). Data
  import already done on Ben's authorization (2026-08-22); the conversation
  is now about the merge itself and rotating his RDS/API credentials.

## Next

- Google sign-in: create the OAuth client in Google Cloud Console (redirect URI
  `https://ljcbslfdlfehgjrdnfco.supabase.co/auth/v1/callback`), paste ID/secret
  into Supabase Auth → Providers → Google. The button already ships.

- TS port of the pipeline (926 lines of Python) with OpenRouter swapped in for
  Anthropic-direct and `avatars.py` writing to R2.
- Graph-strengthening's high-confidence tier (143) is now ingested into `wedding_vendors`
  (D023, see "Now" above). Remaining: decide whether/how to ingest the ambiguous (268) tier,
  then drop the `staging` schema.

## Later

- Post media → R2: scrape each wedding post's images once, render our own
  carousel — removes IG embed chrome ("Add a comment") entirely.
- Graph explorer UI — the differentiator on top of the venue browse.
- Monthly recency crawl (Vercel cron or GitHub Actions).
- Venue photos → R2 at seed time (`vendors.photo_keys`). Needs a server-side
  Places key (~$7/1k photo fetches, est. $100–175 one-time).
