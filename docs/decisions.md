# Decisions

Append-only log, newest entry on top. Not every choice goes here — only ones that would be genuinely annoying to re-derive or re-debug in 3 months. Any doc can cite an entry by ID (e.g. "see D002") instead of re-explaining it.

---

## D015 — 2026-09-03 — V1 corpus wired into the product (`/feed`); PR open, not yet merged

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
explicit instruction) to branch `post-classification-v1-corpus`, opened as a PR against `main`.
**PR not yet merged** — see the PR for current status before starting related work.

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
