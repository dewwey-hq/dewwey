# Acquisition loop — Instagram post acquisition that learns from its own yield (D061)

**Status: month-1 ticks all run (2026-09-19 → 20). Day 1: weddings 5,972 → 6,571 (600 created by the loop),
Apify $19.48 of $29, OpenRouter $5.35, 7,851 posts fetched; Gates 0 / 1a / 1 and two blind spot-checks (95.7%,
97%) passed. Reader `extract-v1.3` shipped 2026-09-20 (precision 52/52, recall 52/62 on the 79-post eval; v1.2 40/41,
40/62) with the styled-shoot auto-create gate; remainder tiers `probe6` / `discovered` / `deepen` next.
Live status: `docs/STATE.md` "Second mission"; history: `docs/decisions.md` D061 + addenda.**
Plan of record: `~/.claude/plans/on-1-what-do-joyful-church.md` (this README is
kept in line with it). Yield queries:
`apps/web/scripts/graph/tmp_analysis/d061_acquisition_yield_baselines.sql`. Prior Apify threads this
replaces: D052 Track 3, D055 coverage items 2–3.

## TLDR

- **Apify credits are live**: Starter plan, $29 of usage credit per cycle (this cycle 2026-09-17 →
  10-16), $0.13 used, hard cap $100/month. Tagged-feed posts cost **$0.0023 each** at our tier;
  profiles $0.0023; post-by-URL re-fetch $0.0015.
- **The tagged-feed crawl of venues is the cheapest wedding source we have ever run, by an order of
  magnitude.** Ben's one crawl (308 venues × ~21 posts, ≈$18 of results) produced **1,360
  venue-anchored weddings** with 10.6 vendors each: **≈$0.013 per wedding, 0.21 weddings per post.**
  Jeremy's 47k own-profile posts produced 4,612 weddings at 0.097 per post, after ≈$45 of reader
  spend and weeks of human labeling.
- **Yield is concentrated and predictable before we spend.** 111 of the 308 crawled venues produced
  82% of the weddings; 89 produced none. Follower band 1k–10k, Places type `event_venue`/`wedding_venue`,
  and 50–1,000 Google reviews predict yield; hotels, churches, restaurants and >100k-follower
  landmarks do not. On the own-profile side, 145 authors with a ≥30% yield produced 2,330 wedding
  posts from 4,732 posts, while 286 authors with <5% yield consumed **24,360 posts (51% of Jeremy's
  crawl) for 197**. **Never crawl an account without a yield prior.**
- **The coverage gap is an acquisition gap.** 302 listed venues sit at 1–5 weddings and **only 54
  have ever had their tagged feed crawled** (65 queued, 167 never entered the frontier). 170 metro
  venue accounts have zero weddings; 74 were never crawled. 232 of the thin 302 have never had a
  profile scrape.
- **Depth exists.** 256 of 308 crawled venues hit the 25-post cap; the median venue is tagged in
  6 posts a month (p75: 16). Crawl nº1 reached back ~4 months.
- **The loop:** budgeted *crawl targets* (account × feed × depth) with yield priors, fed to the
  existing parse → cluster → reconcile → reader → verdict → creation chain unchanged in logic,
  measured per target, priors updated. **Month 1 buys coverage first** (probes of never-crawled thin
  venues and their alias siblings); depth at already-thick venues is what leftover credit buys.
  The number on the tin is **venues leaving the 0 and 1–5 buckets**, not raw weddings.

## 1. What the data says (the priors)

### 1a. Tagged feed of a venue (Ben's crawl nº1, 308 hop-0 venues, resultsLimit 25)

| Follower band | venues | posts/venue | stacks/venue | weddings/venue |
|---|---|---|---|---|
| < 1k | 72 | 13.4 | 1.8 | 2.6 |
| 1k–3k | 73 | 23.4 | 3.8 | 5.3 |
| **3k–10k** | 88 | 24.0 | 5.7 | **6.4** |
| 10k–30k | 39 | 24.5 | 2.2 | 3.3 |
| 30k–100k | 30 | 23.7 | 2.8 | 3.1 |
| > 100k | 6 | 25.0 | 0.3 | 1.3 |

| `accounts.venue_type` | venues | weddings per tagged post |
|---|---|---|
| farm_estate | 6 | 0.21 |
| event_space | 112 | 0.18 |
| park_outdoor | 24 | 0.17 |
| museum | 11 | 0.16 |
| restaurant | 19 | 0.11 |
| other | 31 | 0.09 |
| hotel | 14 | 0.07 |
| house_of_worship | 3 | 0.02 |

Places signals (where a Places row exists): `event_venue` 6.7 weddings/venue, `wedding_venue` 4.9,
`catering_service` 13.3 (banquet halls categorised as caterers), `hotel` 1.3. Review count 50–200
→ 7.2 weddings/venue; >1,000 reviews → 1.7–2.9 (tourist landmarks and restaurants).

Concentration: 0 weddings from 89 venues (1,427 posts, 22% of spend); 1–5 from 108; **6+ from 111
venues = 1,122 weddings from 2,728 posts (0.41 per post)**.

**Not every hop-0 seed was a venue (found 2026-09-19 while pinning the pilot).** Google Places returned
caterers, planners, DJs and florists for "wedding venue", so crawl nº1 also crawled 99 vendors'
tagged feeds. Split by the seed's role, the blended 0.21 hides two very different sources:

| Seed role (hop-0) | seeds | posts | weddings | weddings/post | of which at venues with ≤ 5 weddings |
|---|---|---|---|---|---|
| venue | 209 | 4,288 | 591 | **0.14** | 94 weddings at 68 thin venues |
| planner | 29 | 688 | 281 | 0.41 | |
| catering | 15 | 375 | 134 | 0.36 | |
| dj | 7 | 171 | 71 | 0.42 | |
| florist | 9 | 205 | 64 | 0.31 | |
| officiant / photo booth / decor | 9 | 199 | 64 | 0.32 | |
| **all non-venue** | 99 | 2,099 | 769 | **0.37** | **164 weddings at 145 thin venues** |

A vendor's tagged feed is almost entirely wedding recaps by photographers with full credit stacks; a
venue's tagged feed also carries corporate events, brunches and tourists. Per post, a planner's or
caterer's tagged feed fills thin venues ~3.5× faster (0.078 thin-venue weddings per post vs 0.022).
193 of the vendor-seeded weddings have no venue at all — the structural chain's location-tag and
inline-anchor paths are what recover those. **Vendor tagged feeds are a coverage lever**, tick 3b
below; the venue priors in the tables above are venue-only.

Who posts the yielding tagged posts: photographers 348, planners 319, venue itself 122,
videographers 90, florists 83. 787 distinct authors; 454 already have a measured own-profile
yield from Jeremy's corpus; 256 are pending in the frontier as hop-1.

### 1b. Own profile of a vendor (Jeremy's corpus, 47,623 posts → `posts.source='jeremy_evidence'`)

| Author role | authors | posts | wedding posts | yield |
|---|---|---|---|---|
| planner | 189 | 2,104 | 609 | **0.29** |
| photographer | 502 | 8,459 | 1,956 | **0.23** |
| videographer | 100 | 1,950 | 409 | 0.21 |
| cake | 24 | 219 | 45 | 0.21 |
| dj | 86 | 2,636 | 262 | 0.10 |
| florist | 116 | 3,358 | 312 | 0.09 |
| hair | 65 | 1,610 | 142 | 0.09 |
| venue | 201 | 11,677 | 649 | 0.056 |
| catering | 50 | 2,781 | 121 | 0.04 |
| (untagged) | 2,205 | 9,681 | 251 | 0.03 |

Per author (≥10 posts): tier A ≥30% yield = 145 authors (0.49); tier B 15–30% = 94 (0.22);
tier C = 99 (0.09); **tier D <5% = 286 authors, 24,360 posts, 0.008.** Venue own-profiles are
promotions, not recaps (Biagio 198 own posts, Le Loft 202, all rejected by the reader in D055) —
a venue's depth comes from its *tagged* feed, never its own.

Jeremy's corpus ends **2026-08-21**; Ben's crawl ran **2026-08-20**. Everything since is unfetched.

### 1c. Where the listed venues stand (role=venue + in_metro; the page adds a ≥1–2 wedding bar)

| Wedding bucket | venues | weddings | tagged feed ever crawled | queued | never in frontier | no profile scrape |
|---|---|---|---|---|---|---|
| 0 | 170 | 0 | 93 | 27 | 47 | 72 |
| 1–5 | 302 | 626 | 54 | 65 | 167 | 232 |
| 6–15 | 78 | 718 | 16 | 23 | 34 | 52 |
| 16–49 | 64 | 1,895 | 34 | 17 | 9 | 17 |
| 50+ | 27 | 2,275 | 19 | 5 | 1 | 3 |

The 93 zero-wedding venues that *were* crawled and produced nothing are evidence (not IG wedding
venues, or dead handles); the 74 never crawled are unknowns. Beyond the listed set: 39 Places venues
with an account and 0 weddings, 7 Places venues with no handle at all, 226 `discovered_venue_leads`
never resolved, and 1,022 hop-1 "discovered venue" handles pending in the frontier (113 in metro).

## 2. The loop

The unit is a **crawl target**: `(account, feed ∈ {tagged, own}, depth)` with a **prior** (expected
weddings per post), a **cost** (posts × unit price), and a tri-state **status**
(`unknown` / `promising` / `dead` / `ambiguous`, plus `excluded`). Every stage is explicit.

```
targets ──► budgeted pick ──► Apify run ──► ingest (posts, observations, mentions, images→R2)
   ▲                                              │
   │                                              ▼
 update prior ◄── measure yield ◄── parse → cluster → reconcile → reader → verdict → create
```

1. **Target** — `ops.crawl_targets` from: listed venues and their alias families; zero-wedding metro
   venue accounts; Places venues; hop-1 metro discovered venues; tier A/B authors. Each row carries
   the features the priors use and the prior itself; rows are append-only (latest per account × feed
   wins), so a prior's history is a query.
2. **Pick** — order by `prior × posts_expected / cost` within the tick's `--max-cost-usd`, 20% of the
   tick reserved for probes (unknown targets). **Acquisition never pauses for the human queue;
   creation does** (pauses when > 300 unreviewed candidates).
3. **Run** — `apify/instagram-tagged-scraper` (`username[]`, `resultsLimit`; no cursor, so depth
   re-pays what is already held) for tagged feeds; `apify/instagram-scraper` (`directUrls`,
   `resultsType=posts`, `onlyPostsNewerThan`) for own feeds; `apify/instagram-profile-scraper` for
   profiles. Batches of 10 handles; one run = one `ops.crawl_runs` row (actor, exact input, run id,
   dataset id, items, cost, pipeline versions written after processing).
4. **Ingest** — item → `public.posts` (`source` = `venue_tagged` | `own_profile`, `seed_username`,
   `raw`, insert-only on `shortcode`), one `ops.post_observations` row per sighting (run, seed,
   target, `is_first`, caption hash), owner → `accounts`, `@mentions` → `post_mentions`, images →
   R2 `posts/<shortcode>/<idx>.jpg` fail-open with a `post_images` status row. Handles normalized
   (lowercase, trailing `.` stripped).
5. **Extract** — the existing chain, scoped to the batch's first-observed posts: stack parser →
   structural clustering → reconciliation (`reconcile-v2`) → Haiku reader (W ≥ 0.8) →
   `/label/candidates` for the rest → `createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates
   --acquisition-batch` → `refreshAccountRoleTagsFromWeddings.ts --apply`. Creation rule inside an
   acquisition batch: reconciliation match ≥ 0.7 → skip and count `would_attach`; 0.5–0.7 → create,
   flagged `weak_match`; else create. No ATTACH in month 1 (D031 stays in force).
6. **Measure** — per run and per target: fetched, new, `already_had`, stack posts, candidates,
   weddings (model / human / would_attach / weak_match), venues gaining a first or sixth wedding,
   dollars; rolled up to the canonical account through `account_aliases`.
7. **Learn** — `prior_next = (25 × prior + weddings) / (25 + posts_fetched)`; status `promising`
   (≥ 1 stack post or candidate per 25 posts), `dead` (≥ 20 fetched, 0, 0), `ambiguous` otherwise
   (re-probed once, never auto-deepened, surfaced in the report).

## 3. Multi-handle venues (the Field Museum problem)

The graph already knows 58 aliases (`fieldmuseumspecialevents → fieldmuseum`, `msichicagoevents →
msichicago`, `cbgweddings → chicagobotanic`, `uccweddings → universityclubofchicago`). Rules:

- A venue is a **handle family** (canonical + aliases). Every member is its own crawl target; yield
  and coverage roll up to the canonical. The events/weddings sibling is usually the *higher-yield*
  feed, so never crawl only the flagship. Known siblings ride with the first probe tick.
- **Discovery sources**, each producing candidates for `findVenueAliasCandidates.ts` and a human
  confirm before any `account_aliases` row: (1) profile bios — 86 of 285 venue bios already name
  another handle; (2) accounts co-tagged or co-authoring (`taggedUsers`, `coauthorProducers`) in ≥ 3
  of a venue's tagged posts with a shared stem; (3) IG links found by the D060 website crawler;
  (4) Apify profile search by venue name for the 7 + 226 no-handle venues, resolved to
  `confirmed / ambiguous / none` by bio and address, never by name similarity alone (D052's Wrigley
  Mansion lesson).
- Brand handles (`marriottbonvoy`, `hyattchicago`, `ritzcarlton`) are never targets; the property is.

## 4. Month 1 — $29, coverage first

| Tick | What | Results | $ | Gate after |
|---|---|---|---|---|
| 1 | **Pilot**: 10 proven venues (pinned query below), tagged × 25, + their 10 profiles | 260 | 0.6 | **Gate 0** |
| — | Blind spot-check: all model-written pilot posts (≤ 100), hidden verdict, in `/label/candidates` | 0 | 0 | ≥ 95% before tick 3 auto-creates |
| 2 | Profiles for every probe target, alias sibling and tier A author not yet profiled (~450) | 450 | 1.0 | — |
| 2b | **Canary**: 20 probe venues from the top prior band + 5 vendor feeds, × 25 | 625 | 1.4 | Gate 1a: ≥ 0.03 w/post or re-rank |
| 3 | **Probes A**: listed venues at 1–5 never tagged-crawled (~225) + known alias siblings (~30), × 25 | 6,400 | 14.7 | Gate 1 |
| 3b | **Vendor tagged feeds**: ~100 Chicago planners / caterers / DJs / florists / officiants with a measured or role prior ≥ 0.3, × 25 (the coverage lever in §1a) | 2,500 | 5.8 | |
| 4 | **Probes B**: zero-wedding metro venues never crawled, top 60 by prior, × 25 | 1,500 | 3.5 | |
| 5 | Deepen calibration: 5 pilot venues to 100 (re-pays their first 25) | 500 | 1.2 | |
| — | Reserve | | 0.8 | |

Tier A/B author own-profile recency moves to month 2: its posts are the author's own weddings at
venues we mostly already cover, whereas a vendor's *tagged* feed spreads across venues. The canary
(2b) is 20 probe venues + 5 vendor feeds so both priors get calibrated before the big ticks.

Target: **≥ 120 of ~340 probed venues gain a documented wedding**, ≥ 40 cross into 6+. Raw
weddings before review 700–1,700, many of them confirmations; reader ≈ $8–15 (OpenRouter, $85 left
on the newer key). Efficiency number reported per lever: spend per *new* documented wedding at a
venue that had < 6, next to crawl nº1's $0.013–0.02 overall.

Pilot venues, pinned (not chosen by the builder):

```sql
select a.id, a.username from ops.crawl_frontier f join accounts a on a.id = f.account_id
join v_account_role r on r.account_id = a.id and r.role = 'venue'          -- hop-0 also holds caterers/planners/DJs
join account_locations al on al.account_id = a.id and al.in_metro
join lateral (select count(distinct wp.wedding_id) w from posts p join wedding_posts wp on wp.post_id = p.id
              where p.source = 'venue_tagged' and p.seed_username = a.username) y on true
where f.hops = 0 and f.status = 'crawled' and f.posts_found > 0 and y.w >= 6
  and a.followers between 1000 and 30000 and coalesce(a.is_private, false) = false
order by y.w::numeric / nullif(f.posts_found, 0) desc, y.w desc limit 10;
-- Result on 2026-09-19 (pinned): ivyroomchicago 520, chicagowinery 551, rm1520 522, charcoalfactoryloft 534,
-- thewellsley 540, sarabandechicago 595, greenhouseloft 477, thelibraryat190 524, the.arbory 515, morgansonfulton 521.
```

## 5. Gates

- **Gate 0 (pilot, $0.60):** items match the ingest contract (`shortCode`, `ownerUsername`,
  `caption`, `timestamp`, `inputUrl`, `taggedUsers`, `locationName`, `images`, `displayUrl`); per-seed
  attribution correct for batched usernames; ≥ 90% of images persisted (partial success is legal);
  **≥ 20 stack posts and ≥ 15 structural candidates from 250 posts** (within half of crawl nº1's
  rate — fewer means extraction, not ingest, is broken); reader run; creation dry-run prints CREATE /
  would_attach / weak_match / human counts; the funnel prints a row; the **rollback round trip**
  on the pilot's creation batch succeeds (revert with verdict retirement, counts return to baseline,
  next dry-run creates nothing, re-create).
- **Gate 1a (canary):** realized ≥ 0.03 weddings per post in the top prior band, else re-rank.
- **Gate 1 (after probes A):** realized vs prior per band; `dead` share; `weak_match` creations
  reviewed through `mergeDuplicateWeddings.ts` before they count as coverage.
- **Every tick:** creation pauses at > 300 unreviewed candidates; acquisition does not. Stop at
  $28.50 spent; reconcile `crawl_runs.cost_usd` against Apify's monthly usage.

## 6. Provenance and duplicates (summary; full reasoning in the plan file)

- Three clocks: `posts.posted_at` (Instagram), `post_observations.observed_at` (fetch),
  `jeremy_weddings_created.created_at` (decision). One naming convention: tick `acq-YYYYMMDD-<tick>`,
  creation `acq-YYYYMMDD-<tick>-create-<n>`; creation runs per tick so `revertWeddingBatch.ts
  --retire-verdicts` undoes a tick (weddings reverted, the tick's *model* verdicts superseded by a
  `SKIP` row so nothing re-creates; human verdicts never superseded; posts and observations never
  deleted). `crawl_runs.pipeline_versions` freezes parser/prompt/clustering/reconciliation versions
  per run. Provenance drill: `tmp_analysis/d061_post_provenance.sql`.
- Duplicates: re-fetched posts become observations (`already_had`); staging wins by shortcode in the
  universe CTE (the corpus view itself shows both, honestly); multi-post weddings merge as designed
  confirmations; already-documented posts never seed a candidate (guard now unconditional);
  reconciled ≥ 0.7 is skipped and counted; alias families resolve in the structural view; handle
  variants normalized at ingest; `mergeDuplicateWeddings.ts` runs scoped to each tick's venues.

## 7. What is built (commit 1) and what waits

- **Commit 1:** `ops.crawl_targets` / `ops.crawl_runs` / `ops.crawl_run_seeds` /
  `ops.post_observations` / `ops.creation_decisions` / `post_images` + the pure normalization view
  `v_ig_posts` (staging ∪ public `venue_tagged`/`own_profile` rows, staging shape + `shortcode` +
  `corpus_source`, **no filtering**); `apps/web/scripts/acquire/{apifyClient,ingest,runTick,
  reportAcquisitionFunnel}.ts` + R2 `putBytes`; the universe CTE of `structural_post_vendor_evidence`
  re-sourced (shortcode dedupe with staging precedence, shortcode documented-post guard, month-1
  exclusion of public rows scraped before the first acquisition run — Ben's ~5k unattached crawl
  posts stay out, D031); the clustering guard made unconditional; `fetchPostsFromPublic()` in
  `scripts/classify/source.ts` (two fetchers, one shape — a view join would inner-join away every
  public row at `staging.vendors`); batch-scoped `--acquisition-batch` on parser, clustering,
  reconciliation, reader, creation; `--retire-verdicts` on revert. Then the pilot through Gate 0.
- **After Gate 0:** `targets.ts` (priors), `measure.ts`, spot-check sample, canary, probes, deepen,
  tier A.
- **Not in month 1:** Python pipeline port; hashtag/location crawls; comments/stories; new env vars;
  the vision pass (unblocked by `post_images`, separate thread); learned priors; ATTACH policy
  change; Ben's 5k leftovers; excluded-target filtering in the CTE (arrives with the exclusion
  procedure); target/run-grain rollback as code; `v_post_provenance` as a DB view.

## Related

D031 (no general attach), D052 Track 3 (the TS-Apify-REST note this follows), D053/D054 (corpus
mining as a standing step — its image-only residue is what `post_images` unblocks), D055 coverage
items 2–3 (the $50 crawl this replaces with a measured loop), D060 (website discovery shares the
profile scrape's `external_url`; its frozen discovery counts move when profiles refresh),
`docs/pipeline-plan.md` (the original frontier design and $29 budget math this recalibrates).

## Backlog (user-caught during the pilot spot-check, 2026-09-19)

**Done 2026-09-20 in `extract-v1.3` + the creation gate (decisions.md D061 addendum):** the multi-day / side-event
rule (reader side; the `event_context` credit-writing and the labeling copy are still open), the reader recall
classes (date arithmetic, alias-family OTHER_VENUE fold, the user's vendor-post standard), the styled-shoot
auto-create gate. **Still open:** typo-handle alias rule; `event_context` for side-event credits at creation;
`/label/candidates` labeling guidance for side-event posts; the 10 rubric conflicts (shower / gender reveal /
engagement / pitches labeled THIS_VENUE by the user) stay a human call.

- **Multi-day / multi-venue weddings (South Asian pre-events, rehearsal dinners, welcome parties).**
  Example: "For Alexa and Kunal, the night before the wedding... Set inside @thewellsley, their
  sangeet..." with a stack `Venue @thedalcy ... Sangeet @thewellsley`. The seed venue (tagged feed)
  hosted the *sangeet*, the wedding's anchor venue is the Dalcy. House rule: the wedding is anchored
  to its ceremony/reception venue (D050 already stops a labeled "Sangeet Venue" from winning the
  anchor; D056 gives the credit `event_context = sangeet_mehndi`; the candidate here was correctly
  anchored to the Dalcy). What failed: the **reader inverted toward the narrative venue** -- on the
  Dalcy-anchored candidate it answered OTHER_VENUE = thewellsley at 0.95 because the caption says
  "set inside @thewellsley", so the sangeet post was left off the (correctly created) Dalcy wedding.
  Rule to teach: the wedding's venue is the `Venue:`/reception credit; a sangeet / mehndi / rehearsal
  / welcome-party location is an event-context credit even when the post is "set inside" it.
  Human label on such a post: **This venue (W)** when the page's venue is the `Venue:` credit;
  **Other venue (V)** with the `Venue:` handle when the page's venue is the side-event venue. Sized 2026-09-19 over `v_ig_posts`: 231 captions name a South Asian
  pre-event (208 staging, 23 public), 87 of them with an explicit venue credit line; 975 more name a
  rehearsal dinner / welcome party / after-party / brunch. Fix in one pass, not per example: (1)
  reader prompt `extract-v1.3` rule + 10 golden examples from these captions; (2) the creation path
  writes the seed venue's credit with `event_context` from the caption's event word when the anchor
  is a different `Venue:` credit; (3) `/label/candidates` labeling guidance: label these
  **Other venue** with the `Venue:` handle. Per `feedback-batch-failure-paths`.

- **Reader recall on tagged-feed posts (spot-check, 2026-09-19): 6 of 53 real weddings called
  NOT_WEDDING at 0.95.** Two are prompt bugs: a post dated 2026-09-14 for a "9.12.2026" wedding was
  read as a *future* event (the date is two days before the post; teach the reader that a wedding
  date at or before the post date is past, and that a future date alone is not disqualifying when
  the post reads as a recap), and a "dog in the wedding party" recap with no couple name. Four are a
  **standard** question the user answered: a vendor post with a `Venue:` credit at the target venue
  (a string quartet's "save this", a planner's checklist, a photographer's emoji post) counts as a
  wedding at that venue for coverage, even without a named couple (same call as D054's "accept some
  junk to drive coverage"). The prompt's rubric is stricter than the user's standard; align
  `extract-v1.3` to the user's standard for THIS_VENUE on credit-line-anchored tagged posts, and
  keep the strict rule only for author-is-venue marketing (Biagio / Le Loft pattern, D055).

- **Typo handles in credits mint bare accounts (found 2026-09-20, Acquaviva).** A photographer credited
  `@aquavivawinery @aquavivawineryweddings` (missing c); ingest minted two bare `accounts` rows and the
  candidate anchored on a handle that does not exist on Instagram, so it failed the Chicago gate and
  sat in the human queue. The bio/co-tag alias discovery cannot see this class. Add to the alias
  candidate builder: a credited handle whose profile scrape returns nothing AND whose edit distance to
  a known venue handle is ≤ 2 (or that is a known handle plus/minus a `weddings`/`events` suffix) →
  alias candidate for human confirm. Sizing query: bare accounts (no profile after tick 2) that carry a
  venue-role credit. Fixed by hand this time (alias round 8).
- Probes A spot-check (2026-09-20, 97 posts): the same two reader miss classes again -- 7 NOT_WEDDING on real recaps, 8 OTHER_VENUE inversions (two venues credited / side-event venue) -- now 13 + 10 examples across the two checks for `extract-v1.3`; precision on THIS_VENUE 97%, so the misses are recall, not safety.
- **Styled-shoot belt-and-braces (user check, 2026-09-20 night):** D049's `post_styled_shoot_signal` fired on 10
  of 5,342 acquired posts (1 CONFIRMED, 9 LIKELY); the reader rejected 6, the 1 THIS_VENUE slip (Chicago Forte
  "symphony of love") was caught in the spot-check and retired; none reached a wedding. The signal is
  non-gating by D049 design. Add to `createWeddingsFromJeremyEvidence.ts --acquisition-batch`: any included
  post with styled signal CONFIRMED/LIKELY → HUMAN, never auto-create (would have touched 0 of today's 479).
  The POSSIBLE band (438 posts) is mostly real weddings by the user's own labels (28 of 35) — leave it alone.
