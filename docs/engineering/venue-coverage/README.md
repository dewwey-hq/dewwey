# Venue coverage — identity before acquisition (D062)

**Status: thesis adopted and batch 1 applied (2026-09-20).** Month 1 of the D061 acquisition loop
bought 1,025 weddings for $25.48 of Apify credit — $0.025 each, an order of magnitude cheaper than
anything before it — and the thin end of the catalog barely moved. This doc is why, and what to do
instead. Live numbers: `docs/STATE.md`. Narrative and decisions: `docs/decisions.md` D062 (and D061
for the loop this sits beside). The standing artifact that answers "why is this venue not listed" is
`apps/web/scripts/graph/reportVenueIdentityTaxonomy.ts` — run it rather than re-deriving the
analysis below by hand.

**The bar (the user's call, 2026-09-20): a venue is covered at ≥ 1 documented wedding.** That is
also `/venues`' own listing predicate, so "covered" and "listed" are the same question, and the
entire problem is the set of venue-ish accounts sitting outside it.

## TLDR

- **Thin venues are not small venues.** Median Instagram followers are flat across every coverage
  bucket (0: 4,096 · 1-5: 3,350 · 6-15: **2,329** · 16-49: 4,574 · 50+: 7,906), and among venues
  carrying a Google Places row the zero bucket has the *highest* median review count (564 vs the
  50+ bucket's 258). Venues of identical size sit in both the 1-5 and 50+ buckets. **The difference
  is our discovery, not their business.**
- **Their own tagged feeds are exhausted.** 152 thin venues are measured `dead` — ≥ 20 posts
  fetched, 0 stacks, 0 candidates. Of 147 canonical zero venues, 117 have already been crawled and
  only 15 hold any candidate posts. Crawling them again is the wrong lever.
- **Coverage fragments across sibling handles.** `drurylaneproductions` (4 weddings) +
  `drurylaneevents` (20); `butterfieldcc_grounds` (11) + `butterfieldcountryclub` (7);
  `ravisloecountryclub` (1) + `ravisloeweddings` (16). One venue, counted twice, both halves
  reading as thin.
- **The alias finder structurally could not see that class**, for two mechanical reasons now fixed:
  `computeStem` stripped `chicago` and `events` but left `center` (so `navypierchicago` → "navypier"
  never met `navypiereventcenter` → "navypiercenter"), and S3 compared `external_url` *including the
  path* (so `navypier.org` and `navypier.org/host-an-event` were different keys).
- **The website is the identity key the thin end actually has.** 82% of zero-wedding listed venues
  publish a website link; 8% carry a Places row. That asymmetry is the whole reason S3b exists.
- **There is no single pattern.** Eight distinct reasons a venue is not listed, each with a
  different remedy — see the taxonomy. Getting this wrong in either direction is expensive: merging
  Azure at Shedd into Shedd Aquarium would hide the venue a couple actually books.

## 1. The taxonomy — why a venue is not listed

Produced by `reportVenueIdentityTaxonomy.ts` over 1,031 venue-ish accounts (2026-09-20). Ordered by
how cheap and certain the fix is.

| bucket | accounts | weddings held | remedy |
|---|---|---|---|
| `geo_blocked` | **117** | **144** | backfill `account_locations`; it already clears the bar |
| `mis_anchored` | 18 | 28 | re-anchor the wedding to the real venue |
| `never_crawled` | 41 | 0 | crawl the tagged feed — the one class where that is right |
| `dead_feed` | 80 | 0 | website or a credited vendor's own feed, **not** more crawling |
| `no_identity` | 260 | 0 | profile-scrape / website first, then re-classify |
| `chain_brand` | 9 | 0 | never list, never merge — the property needs its own account |
| `not_a_venue` | 4 | 0 | delist: strip the venue role |
| `merged_away` | 502 | 6,536 | none — same venue counted once, or already listed |

**135 accounts holding 172 weddings already clear the ≥ 1 bar and are invisible** for want of a
geography row or a correct anchor. That is cheaper than any crawl and is the first thing to do.

### The patterns behind the buckets, with the cases that taught them

| pattern | example | remedy |
|---|---|---|
| Events arm of one venue | `@uccweddings` → 102 weddings; `@fieldmuseumspecialevents` → 71 | **merge** |
| Separately-branded in-house venue | **Azure at Shedd Aquarium** — own domain `azureatsheddaquarium.com`, own handle; `@shedd_aquarium` shows 3 | **never merge — list separately** |
| Sub-listing of a campus | Jeremy's Places row is "Navy Pier – Rooftop Terrace" → `navypier.org/listings/listing/offshore`, matching `@offshorerooftop` | distinct bookable spaces |
| Chain-brand contamination | Jeremy maps JW Marriott Chicago → `@marriottbonvoy`; also `@fourseasons`, `@ritzcarlton` | never merge, never list |
| Umbrella vs property | `@luc_conferences` books three Loyola campuses; `@loyola_cuneomansion` is one property 40 miles north | never merge |
| Brand handle carries it directly | `@chicagobotanic` holds its own 75 | nothing to do |
| Not a wedding venue | `@wix`, `@squarespace` reached a venue role through credit-line parsing | delist |

## 2. Data sources, and what each is good for

A coverage diagnosis that names only one source is probably wrong. What exists today:

| source | size | good for | known error mode |
|---|---|---|---|
| `accounts` (Instagram) | 32k | the graph's spine | bare rows minted from credit lines carry only a username |
| `public.vendors` google_places | 300 | address, review count, primary type | covers 8% of zero-bucket venues |
| `staging.vendors` (Jeremy) | 430 venue rows, 163 with a website, **60 whose website IS the wedding page** | venue identity + the wedding-page URL | — |
| `staging.vendor_social_links` | 465 IG links → 270 handles, **214 not in `accounts` at all** | discovery + identity | **chain contamination**: JW Marriott Chicago → `@marriottbonvoy` |
| `staging.instagram_posts` | 47,623 | the corpus (see D053/D054) | pre-filtered — 77.6% stack rate vs 21% on raw crawls |
| D060 website discovery | 166 candidates, **wedding pages for 97** | "does this venue do weddings at all?" | — |
| `account_locations` | — | **the gate that decides whether a venue is listed at all** | 302 venue-role accounts have no row |

## 3. Signals (what changed in the alias finder)

`findVenueAliasCandidates.ts` / `venueAliasSignals.ts`, D062:

- **S3b (new)** — two accounts publishing the same registrable website *host*. Unlike every other
  signal it reaches **outside** the venue-ish universe, because the accounts most in need of pairing
  (`@salvageoneevents`, `@venutisrestaurant`) have no venue credit and cannot get one until they are
  linked. A pair still needs one side inside the universe.
- **The aggregator deny-list is what makes S3b safe, not defensive coding.** Un-denied, `linkin.bio`
  groups 21 unrelated accounts (Chicago Winery + Chicago History Museum + Ralph Lauren),
  `sprout.link` 15, `lnk.bio` 10. The first run still leaked `@uchicago → @hilton` via
  `clicklinkin.bio`, so the `.bio`/`.link` TLD family is denied wholesale.
- **`computeStem`** drops one *trailing* facility noun (center/pavilion/ballroom/rooftop/terrace).
  Suffix-anchored deliberately: a global strip takes `greenhouseloft` (34 weddings) to "green". It
  runs **before** the token strip, because `STRIP_TOKENS_RE` contains `il` and turns `pavilion` into
  `pavion`.
- **S6 no longer reaches T2 unaided.** Bare Levenshtein ≤ 2 paired `@ihchicago` with `@fschicago`,
  `@lhchicago`, `@wachicago`, `@uchicago` and `@iahcchicago` — five different Chicago hotels,
  because "chicago" is 7 of the 9 characters. `isS6Trustworthy` measures the *stems* instead.
- **`isUmbrellaBrandUsername`** blocks operator/property merges; **`isNonVenueUsername`** blocks a
  vendor that hosts its site on a venue's domain; **`isNonVenueBio`** no longer fires on the bare
  word "catering" inside an all-inclusive venue's own bio.

Effect on the live universe: T1 3 → 3, T2 **28 → 11**, T3 74 → 95. The T2 shrink is the point.

## 4. Provenance — non-negotiable

Every change here rewrites which venue a wedding belongs to, and therefore what a couple sees.
Nothing lands without all five:

1. **A batch id** — `idn-YYYYMMDD-<kind>-<n>`. `account_aliases` carries `batch_id`, `source`,
   `evidence`, `verified_by` (D062). The 66 rows predating the mechanism keep a null `batch_id` on
   purpose: backfilling a batch they were never part of would be inventing provenance.
2. **Immutable evidence per row** — the signal, the quoted evidence, the source, the verifier. A row
   with no evidence never lands. That is the table's only guarantee.
3. **Dry-run, then apply**, in one transaction.
4. **A before/after diff where every venue that changes bucket is named.** A count that moves
   without a named cause is a bug, not a win.
5. **Revertability.** `remapWeddingsToCanonicalAccounts.ts` logs every row to
   `account_alias_remaps` under the batch id and prints the revert SQL.

Carried forward: WebSearch-verify every pair by hand (that file records two false positives
similarity alone produced); snapshot before writes; never create an alias chain.

## 4. Learning from our own crawls (D062, 2026-09-20)

The loop has always *recorded* yield (`ops.crawl_targets.features->'measured'`, `prior_next`). It
had never been asked whether the priors it selects with are any good. Back-testing them against 570
of our own measured targets (tiers probe / probe6 / canary, ≥ 15 posts fetched) answered that, and
the answer changed how targeting works.

### Finding: yield falls as venue size rises, and our prior was pointed the wrong way

Weddings per **post** by follower band:

| followers | venues | weddings/post | % that came back empty |
|---|---|---|---|
| < 500 | 45 | **0.152** | **13%** |
| 500–1.5k | 143 | 0.116 | 27% |
| 1.5k–5k | 146 | 0.104 | 31% |
| 5k–20k | 133 | 0.049 | 62% |
| 20k+ | 87 | **0.013** | **83%** |

The smallest venues out-yield the largest **12× per post**. The old prior did the opposite — it
added +0.06 for the 3k–10k band — because the loop README's §1a table came from crawl nº1, which
measured weddings **per venue**. A large venue is tagged constantly and hits the 25-post cap, so it
produces more weddings per venue while producing far fewer per post. **We pay per post.** The prior
was optimising the wrong denominator, and no amount of per-target learning would have caught it,
because the bias was in the feature weights rather than in any single target's history.

### Back-test of the ranking (same 570 venues, quartiles by prior)

| ranking | Q1 → Q4 realized w/post | spread | % empty Q1 → Q4 |
|---|---|---|---|
| old `venueLookupPrior` | 0.061 · 0.076 · 0.081 · 0.111 | 1.8× | 44% → 39% |
| followers ascending, alone | 0.120 · 0.106 · 0.077 · 0.028 | 4.3× | 20% → 69% |
| **recalibrated prior** | 0.030 · 0.047 · 0.109 · **0.143** | **4.8×** | **70% → 18%** |

A single inverted feature beat the entire hand-tuned prior; the recalibrated version (followers
inverted and dominant, plus `venue_type`, Places type and review count) beats followers alone. It is
also well calibrated in level, not just in order — Q4 predicts 0.157 and realizes 0.143.

**Practical effect:** spending a fixed budget on the top prior quartile rather than an average mix
moves expected yield from ~0.081 to ~0.143 weddings per post (**+77% per dollar**) and cuts the
share of targets that return nothing from ~45% to 18%.

`venue_type` is independently predictive on the same sample and `other` is a real negative signal
that was previously unpenalised: farm_estate 0.148 · event_space 0.104 · country_club 0.092 ·
hotel 0.088 · restaurant 0.062 · house_of_worship 0.053 · **other 0.033, 69% empty**.

### The standing rule

**These bands are measured, not chosen.** Re-run the back-test after any tick before editing them;
`acquire.test.ts` pins the shape (monotonic in followers, boundaries on both sides, `other`
penalised) so a future edit that re-inverts the relationship fails loudly. The numbers live in one
place — `venueLookupPrior` — and the test asserts relationships rather than re-pinning literals.

### Geography

Among listed metro venues the thin tier is **Chicago proper (147 of 260 thin venues)**, and there
are **no Indiana or Wisconsin venues in the listed set at all** — every one resolves to Illinois.
Out-of-area accounts (`carnegiehall`, `hyattmauiweddings`, `korosunresort`) sit outside the listed
set and are handled by the `chain_brand` / `not_a_venue` / geo buckets. One data-quality wrinkle:
`account_locations.region` is inconsistent (`Illinois` vs `IL`) and 127 in-metro rows have a null
city, so region is not yet a reliable filter — `in_metro` is.

## 5. What was done (batches 1-2, 2026-09-20)

Round 10 / `idn-20260920-alias-1`: six merges — `lshireweddings` and `lshirewedding` →
`lshiremarriott`, `wrigleyfieldevents` → `officialwrigleyfield` (WebSearch: wrigleyfieldevents.com
is the Cubs' events brand), `rreventschicago` → `riverroastchi`, `tigerlillyevents` →
`tigerlilyevents`, `floatingworldevents` → `floatingworldgallery`. Then 11 weddings and 18
`wedding_vendors` rows re-pointed, 29 remap rows logged.

Named deltas: `floatingworldgallery` 2 → 6, `lshiremarriott` 26 → 30, `riverroastchi` 25 → 27,
`officialwrigleyfield` 1 → 2. **The true zero bucket did not move** — merges fix fragmentation, not
absence. That distinction is the point of the taxonomy.

Rejected after verification, each now encoded so it cannot recur: `luc_conferences` /
`loyola_cuneomansion` (umbrella), `shorebyclub` / `shoreby_club` and `peartreeestate` /
`pear_tree_estate` (both sides empty shells — no attribution improves, no evidence to carry).

## 6. Next — the month-2 plan for thin coverage

The thin tier is **not** one problem. Broken down by what we have actually already done to each
(listed venues at 1–5 weddings, alias-resolved, 2026-09-20):

| state | venues | avg posts we pulled | avg followers | what it means |
|---|---|---|---|---|
| `promising` | 101 | **24** | 22,767 | produced evidence, then we stopped at the 25-post cap |
| `dead` | 67 | 25 | 27,223 | 25 posts, nothing — do not re-crawl |
| never targeted | 53 | — | 19,132 | never probed at all |
| `ambiguous` | 33 | **2** | 2,492 | barely touched; not a real probe |

**The crawled thin venues were never exhausted — they were sampled.** Every one stopped at
`resultsLimit` 25. Depth is the one dimension never tried on them, and the `deepen` tick in D061
month 1 is the evidence that it works: 8 venues taken 25 → 100 posts produced 105 weddings at
**$0.018 each, the cheapest tick of the month**.

In priority order:

1. **`geo_blocked` (116 accounts, 143 weddings) — free, no credit.** They already clear the ≥ 1 bar
   and cannot be seen. Backfill `account_locations` from Places and `staging.vendors` addresses,
   verified per venue, in batches with a named diff (`applyD062GeoBackfill.ts` is the pattern).
   Proven to matter: two venues entered the catalog this way on 2026-09-20.
2. **Finish the venues we only half-probed — ~$5.** The 33 `ambiguous` (2 posts each!) plus the 53
   never-targeted, at 25 posts each ≈ 86 × 25 × $0.0023 = **$4.95**. Highest certainty in the plan:
   these have genuinely never been asked.
3. **Deepen the 101 `promising` thin venues — ~$23.** 25 → 100 posts. Note the tagged actor has **no
   recency parameter** (`onlyPostsNewerThan` works only on the `own` feed), so a depth pull re-pays
   for the first 25 — 100 posts fetched buys 75 new. At their measured prior of 0.069 w/post that is
   ≈ 520 weddings for ~$23, and because it is the venue's *own* tagged feed every wedding anchors
   there, which is what moves 1–5 → 6+. Temper the expectation: this cohort averages 22.7k
   followers, the weakest band in §4, so do **not** extrapolate the deepen tick's 0.24/new-post —
   that was measured at proven, smaller venues.
4. **Calibrate the own-profile feed before scaling it (~$0.58).** It has never been run; for the 266
   proven-thin venues, 365 of their weddings came from own-profile posts vs 261 from tagged feeds.
   But the tier-A 0.49 prior is measured on Jeremy's *curated* corpus (77.6% stack rate vs 21% on
   our raw crawls) and will not transfer. 10 authors × 25 posts answers it.
5. **Re-run the back-test in §4 after each tick** and update the prior if the bands moved. That is
   the loop actually learning, rather than only recording.

Sequenced this way month 2 spends ≈ $28 of the $29 with the free work done first, and every tick
produces a measurement that improves the next one.

### Still open

1. **`geo_blocked` remainder** — backfill `account_locations` from Places and `staging.vendors`
   addresses, verified per venue.
2. **`mis_anchored` (18)** — re-anchor.
3. **`no_identity` (260)** — profile enrichment, then re-run the taxonomy and the alias finder.
4. **Website as venue truth** — a venue serving `/weddings` on its own domain with zero Instagram
   evidence is a *confirmed venue, known gap*, a different bucket from `dead_feed`. D060 already has
   wedding pages for 97 of 166 venues; Jeremy adds 60 more. This is the bridge between the missions.
5. **Month-2 acquisition** (Oct 16, $29) — crawl the events handle, not the brand handle. And note
   **the own-profile feed has never been run**: `buildInput('own', …)` is implemented and
   unit-tested, zero own ticks exist, all $24.23 went to tagged feeds. For the 266 proven-thin
   venues, 365 of their weddings came from own-profile posts vs 261 from tagged feeds. **But the
   prior is biased** — Jeremy curated rather than archiving — so month 2 opens with a ~$0.58
   calibration tick before any scaled spend.

## Non-goals

- Merging separately-branded in-house venues (Azure at Shedd, Offshore at Navy Pier). They are
  distinct bookable venues; merging hides what a couple books.
- Listing chain-brand handles as local venues.
- More tagged-feed crawling at `dead_feed` venues.

## Related

D061 (the acquisition loop this sits beside), D060 (venue Details + website discovery), D055
(batch/revert discipline), D052 (verified account bridging and aliasing), D049, D031.

## Backlog — known-open, with the evidence

Dated and attributed, so the next session doesn't re-derive them.

- **Drifted DB row-count invariants (2026-09-20).** `graphStrengthening.test.ts` (11 assertions),
  `vendorAssociation.test.ts` (1), `venuePortfolioContent.test.ts` (1) fail against the live DB.
  Partly this session's 56 wedding creations from the human-verdict pass, partly the pre-existing
  D059 drift `STATE.md` already tracked. **None of them import any file D062 changed** (verified by
  grep). They are the "re-pin the literal in the test with the reason" class from
  `working-across-sessions.md`, and D059 owns them. Not re-pinned here because doing it blind would
  bless whatever the numbers happen to be.
- **`drurylaneproductions` (4 weddings) + `drurylaneevents` (20) is still unmerged.** Neither S1
  (stems "drurylaneproductions" vs "drurylane" — "productions" is not a facility noun and adding it
  is too broad) nor S3b (one of them publishes a `campsite.bio` aggregator link) reaches it. Same
  shape: `butterfieldcc_grounds` (11) + `butterfieldcountryclub` (7), `rpmeventschicago` (5) +
  `rpmeventsandcatering` (8). A "corporate-suffix" stem rule (`productions|enterprises|inc|llc`)
  would catch the first; the second and third need the aggregator link resolved to a real domain.
- **210 listed venues publish a link-in-bio aggregator URL rather than their own domain.** Their
  real domain is one HTTP fetch away and would feed S3b directly. `resolveAggregatorLinks.ts`
  (report-only, plain `fetch`, no Apify) is specified in the plan and not yet written.
- **`account_locations` has no `batch_id` column**, so `applyD062GeoBackfill.ts` encodes the batch
  in `source` (`websearch:idn-20260920-geo-1`). Workable, queryable, but not the same guarantee the
  alias table now has. Add the column when the geo backfill scales past a handful of rows.
- **`isUmbrellaBrandUsername` is a username heuristic.** It catches `@luc_conferences`,
  `@marriottbonvoy`, `@victoriavenues`, but a chain handle that doesn't say so in its name
  (`@intercontinental`, `@thedrake`) still relies on the hand-maintained `DENY_LIST_USERNAMES`.
- **The 9 `chain_brand` and 4 `not_a_venue` accounts are classified but not acted on.** Delisting
  means stripping a venue role, which changes `/venues`; it needs its own batch and diff.
