# Graph ingestion design (V1, revised again 2026-09-04) — implemented

**Status: implemented for the Jeremy-owned evidence/candidate layer. Zero writes to
`weddings`/`wedding_vendors`/`edges`/`accounts` beyond ordinary account creation; `phase_dedup()`
untouched.** This revision corrects real architectural problems found in the prior draft during
a deliberate critical review (not a rubber-stamp) — see "What changed and why" below. The
organizing principle from the prior draft still holds and is now enforced more precisely:

> **Immutable evidence identity != wedding identity.**

## What changed from the previous draft, and why

1. **Evidence identity was wrong.** The prior draft keyed evidence on
   `(source_post_url, account_id, role, parser_version)`. That bakes a *revisable
   interpretation* (which role a credit line means, which parser version produced that
   interpretation) into what should be an *immutable fact's* identity. Most `ROLE_MAP` fixes
   (D016/D017) don't change what a caption says — they change our reading of it. Under the old
   key, every parser iteration would mint a whole new set of evidence rows for unchanged
   captions, and any "how many posts credit vendor X" query would need to de-duplicate across
   versions to avoid over-counting. **Corrected identity: `(source_post_url, line_no, handle)`**
   — the actual credit-line instance, which is a real, stable fact about the caption text. `role`
   and `parser_version` become *attributes* of that identity, resolved as "most recent
   `extracted_at` wins" — exactly the same latest-resolution pattern already used by
   `post_classifications_current`. This correctly keeps legitimate multi-role vendors as separate
   facts (different `line_no`, e.g. a studio's separate hair and makeup credit lines) while
   treating a `ROLE_MAP` bug fix as a correction to one fact, not a new one.
2. **The evidence layer didn't need a new physical table at all.** `stack_extraction_entries`
   already stores `(post_url, line_no, handle, role, role_raw, parser_version, extracted_at)` and
   is already append-only per version (proven working across `stack-parser-ts-v1/v2/v3` this
   session). A separate table would just duplicate that data and require re-solving idempotency
   that's already solved. **`jeremy_post_vendor_evidence` is a view**, not a table — simpler,
   zero new write path, zero sync-drift risk.
3. **A real, pre-existing durability risk, found while checking what the evidence view could
   safely join to.** `v1_content_corpus` (built earlier this session for `/feed`) joins
   `staging.instagram_posts` directly. `ROADMAP.md`'s own "Next" section plans to **drop the
   staging schema** once re-parsing is done — the day that happens, anything depending on
   `v1_content_corpus` silently breaks. Checked and confirmed: `post_classification_runs` already
   carries durable snapshots of `posted_at`/`event_date`/`event_date_confidence` for exactly this
   reason (D011's original intent). **The evidence view joins `stack_extraction_entries` +
   `candidate_scores` + `post_classification_runs` + `accounts` directly — zero dependency on
   `staging.instagram_posts` or `v1_content_corpus`.** Dropped `is_self_credit` from this design
   for the same reason (it needed `owner_username` from staging, for a feature not essential to
   V1) — noted as a deferred addition, not built now. **This is a real risk for `/feed` and
   `v1_content_corpus` too**, out of scope to fix here, but flagged in `ROADMAP.md` so the
   eventual "drop staging" step doesn't silently break the product feed.
4. **Candidate identity is only stable within a fixed clustering algorithm — I hadn't said so.**
   Match-upsert against existing candidates (instead of Ben's truncate-rebuild) makes identity
   stable across *reruns of the same algorithm*. It does not survive a change to the Jaccard
   threshold or date window — that would silently re-partition existing candidates unless it's
   made an explicit, visible decision. Added `clustering_version` to
   `jeremy_wedding_candidates` so any future algorithm change is a conscious version bump, not an
   invisible behavior change.
5. **`jeremy_wedding_candidate_posts` gets `PRIMARY KEY(source_post_url)`**, not a composite key
   on `(candidate_id, source_post_url)`. This enforces "a post belongs to at most one candidate"
   at the database level — the rare 1-post/2-weddings case (confirmed once in the 134-post eval
   set: `DICbnDDJR8M`) is a named, accepted V1 limitation, not a silent gap a bug could exploit.
6. **`match_basis` is explicit columns, not `jsonb`.** The reconciliation signal set (venue
   match, date delta, vendor Jaccard) is small and fixed for V1 — explicit columns are simpler
   and type-safe; `jsonb` would only earn its keep if the signal set were open-ended.

## Schema (implemented)

```sql
-- View: the durable, version-independent evidence layer. No table of its own.
create view jeremy_post_vendor_evidence as
select
  latest.source_post_url,
  a.id as account_id,
  latest.role,
  latest.role_raw,
  latest.line_no,
  latest.parser_version,
  cs.score as candidate_score,
  cs.candidate_generation_version,
  pc.classifier_version,
  pc.confidence as classifier_confidence
from (
  select distinct on (post_url, line_no, handle)
    post_url as source_post_url, line_no, handle, role, role_raw, stack_parser_version as parser_version
  from stack_extraction_entries
  order by post_url, line_no, handle, extracted_at desc   -- latest wins by TIME, not by version-string sort
) latest
join accounts a on lower(a.username::text) = latest.handle
join candidate_scores cs on cs.post_url = latest.source_post_url
  and cs.candidate_generation_version = 'candidate-score-v1' and cs.score >= 12
join lateral (
  select pcr.classifier_version, pcr.decision, pcr.confidence
  from post_classification_runs pcr
  where pcr.post_url = latest.source_post_url and pcr.classifier_version = 'v3'
  order by pcr.classified_at desc limit 1
) pc on pc.decision = 'INCLUDE'
where latest.role <> 'other';

create table jeremy_wedding_candidates (
  id                 bigint generated always as identity primary key,
  clustering_version text not null,
  venue_account_id   bigint references accounts(id),   -- nullable; recomputed as evidence accrues
  event_date_est     date,                              -- an ESTIMATE, recomputed on every touch, not fixed at creation
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table jeremy_wedding_candidate_posts (
  source_post_url  text primary key,        -- enforces: a post belongs to at most one candidate
  candidate_id     bigint not null references jeremy_wedding_candidates(id),
  added_at         timestamptz not null default now()
);
create index on jeremy_wedding_candidate_posts (candidate_id);

-- Derived, not maintained — always consistent, no upsert-with-greatest bookkeeping needed.
create view jeremy_wedding_candidate_vendors as
select
  cp.candidate_id,
  e.account_id,
  e.role,
  count(distinct e.source_post_url) as n_confirmations,
  array_agg(distinct e.source_post_url) as source_post_urls
from jeremy_wedding_candidate_posts cp
join jeremy_post_vendor_evidence e on e.source_post_url = cp.source_post_url
group by cp.candidate_id, e.account_id, e.role;

create table jeremy_wedding_candidate_reconciliation (
  candidate_id           bigint not null references jeremy_wedding_candidates(id),
  matched_wedding_id     bigint,              -- deliberately NOT a foreign key — Ben's weddings.id can be reassigned by phase_dedup
  match_confidence       real,                -- null if unmatched
  venue_match            boolean not null,
  date_delta_days        integer,
  vendor_jaccard         real,
  reconciliation_version text not null,
  reconciled_at          timestamptz not null default now(),
  primary key (candidate_id, reconciliation_version)
);
```

## Clustering algorithm

Same conceptual algorithm as Ben's `phase_dedup` (Jaccard vendor-set overlap + date proximity),
applied as **match-upsert against `jeremy_wedding_candidates`** (never truncated) instead of
truncate-rebuild:

1. Pull evidence from the view above, grouped by post. **Clustering-eligible = 3+ distinct roles
   among *non-other* evidence for that post** — recomputed fresh from the filtered view, not
   reused from `stack_extraction_runs.has_stack` (which counts `other` toward the 3-role gate,
   since Ben's original `has_stack` semantics don't exclude it — our filtered evidence should use
   a matching, consistently-filtered gate, not the raw upstream number).
2. **Date signal**: prefer the classifier's own `event_date` (only when `event_date_confidence`
   is high and it parses as a real date) over `posted_at` — a real improvement over Ben's
   `posted_at`-only proxy, which is weaker for Jeremy's own-profile posts (can be published long
   after the actual wedding). Both signals come from `post_classification_runs`, not staging.
3. Process posts in a **fixed, deterministic order** (`event_date_est` ascending nulls-last, then
   `post_url`) — required for true idempotency; an unordered or random pass could let a
   borderline-Jaccard case land in a different candidate on different runs.
4. For each post, in order: if it already has a `jeremy_wedding_candidate_posts` row, **skip
   entirely** (idempotent rerun — already-clustered posts are never reconsidered in V1,
   deliberately; reassignment of an already-clustered post is a named non-goal, not silently
   attempted). Otherwise, compare its vendor-account-id set against every existing candidate's
   current vendor set (`jeremy_wedding_candidate_vendors`): if any has `event_date_est` within 21
   days and vendor-set Jaccard overlap > 0.5, attach to it (insert into `candidate_posts`,
   refresh `venue_account_id` if unset and this post supplies one, refresh `event_date_est` to
   the earliest effective date across all attached posts, bump `updated_at`). Otherwise, create a
   new candidate.

## Reconciliation algorithm

For each candidate **with a resolved `venue_account_id`** (unresolved-venue candidates are
skipped for matching entirely — venue is the strongest anchor, matching the existing "a wedding
is Chicago iff its venue is" principle): search Ben's *current* `weddings` for the same
`venue_id`, compute `date_delta_days` and `vendor_jaccard` against `wedding_vendors`, and bucket:
**high** (date within 14 days AND Jaccard > 0.5), **ambiguous** (one strong signal, not both —
recorded, never auto-committed to anything), or **no match** (`matched_wedding_id` null,
candidate stays fully standalone). Thresholds are starting heuristics, calibrated against real
dry-run distributions, not asserted with false precision.

**`reconcile-v1` (2026-09-04) did not actually implement the "no match" bucket above** — a
below-ambiguous candidate still got `matched_wedding_id = best.weddingId` (whatever venue-mate was
least-bad) at confidence 0.1, silently representing "best available" as an actual match. Found
during the D020/D021 audit and fixed in `reconcile-v2` (D021): below the ambiguous threshold,
`matched_wedding_id` is now `null`, matching this doc's original intent (`date_delta_days`/
`vendor_jaccard` still recorded, so the rejected candidate's evidence stays inspectable —
distinct from the true no-venue case, where both are null and `venue_match=false`). Written under
a new `reconciliation_version` (versioned, not an overwrite) — `reconcile-v1` remains queryable.

## Existing graph — the write path (implemented 2026-09-04, D023)

`weddings`/`wedding_posts`/`edges`/`phase_dedup()` remain untouched (edges is a derived
materialized view, refreshed after the write, never hand-written to). `wedding_vendors` DOES now
receive writes: `applyJeremyEvidenceToGraph.ts` inserts the 143 high-confidence tier's vendor
evidence, `insert ... on conflict (wedding_id, account_id, role) do nothing` — additive only, no
pre-existing row is ever modified. Every inserted row is logged in
`jeremy_wedding_vendors_ingested` for provenance, since `wedding_vendors` itself carries none.
Full reasoning, safety verification, and before/after numbers: D023 in `docs/decisions.md`.
**Durability caveat**: `phase_dedup()`'s `TRUNCATE ... RESTART IDENTITY CASCADE` would wipe this
write along with `weddings.id` itself if it ever runs again — recovery is rerun reconciliation
then rerun the apply script, both idempotent. The durable source of truth stays the evidence/
candidate/reconciliation layer, never `wedding_vendors`.

## Invariants (implemented and verified — see report)

1. Identical input + identical parser version -> identical evidence (evidence is a pure function
   of `stack_extraction_entries`, which is already deterministic).
2. Repeated clustering ingestion is idempotent (`candidate_posts` PK on `source_post_url` makes
   already-attached posts a no-op).
3. Parser versions do not overwrite historical evidence (`stack_extraction_entries` untouched
   across versions; only the *view's* "latest by `extracted_at`" resolution changes).
4. Evidence is independent of Ben's `wedding_id` (the view never references `weddings`).
5. Candidate identity is independent of Ben's `wedding_id` (`jeremy_wedding_candidates.id` is its
   own sequence).
6. Candidate membership is traceable to source posts (`jeremy_wedding_candidate_posts` is a
   direct join).
7. Reconciliation is separate from evidence and candidate identity (its own table, versioned).
8. Historical provenance remains inspectable (every layer is append-only or purely derived).
9. Ben's existing graph semantics remain untouched.
10. **(added)** A source post belongs to at most one Jeremy candidate — enforced by
    `PRIMARY KEY(source_post_url)`, not just documented.
11. **(added)** Candidate identity is stable *within* a fixed `clustering_version`; changing the
    algorithm is an explicit new version, not a silent behavior change.
12. **(added)** No component of this design depends on `staging.instagram_posts` remaining
    queryable.
13. **(added, D023)** Writes into `wedding_vendors` are additive-only (`on conflict do nothing`)
    and fully provenance-logged (`jeremy_wedding_vendors_ingested`) — no pre-existing row from
    Ben's own crawler is ever modified, and every row this workstream contributed is traceable to
    its source candidate and reconciliation run.

## Known limitations, named rather than silently accepted

- **Jaccard under-merging**: two independent posts about the *same* real wedding that each credit
  a different, mostly-disjoint subset of vendors (e.g. one emphasizes the ceremony venue, another
  the reception vendors) could fail to cluster together. Not solved by threshold tuning alone —
  worth checking in the dry-run's candidate-size distribution, not designed around defensively.
- **1-post/2-weddings** (confirmed once in the eval set): not detected or split; the post attaches
  to whichever single candidate it first matches or forms.
- **Entity resolution across corpora** (the `unionleagueclubofchicago`/`ulcchicago` handle-mismatch
  finding): unresolved, same as the prior draft — exact lowercased-handle matching only.
- **Residual non-vendor rate** (~2.1%, from D016/D017's eval): lives in the evidence view, not
  eliminated — this is the raw layer, exactly where it belongs per the evidence/serving-threshold
  split; never reaches `weddings`/`wedding_vendors` since nothing writes there in V1.

## Deferred, not abandoned

Ben's `phase_dedup` truncate/rebuild identity instability is real and unfixed — this design
routes around it by keeping Jeremy's candidate identity in tables this workstream fully owns.
Whether to invest in making Ben's `weddings` identity stable (so confident matches can actually
be merged into the live serving graph) is a decision for after this layer's output is reviewed.
