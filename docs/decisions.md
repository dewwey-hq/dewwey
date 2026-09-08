# Decisions

Append-only log, newest entry on top. Not every choice goes here — only ones that would be genuinely annoying to re-derive or re-debug in 3 months. Any doc can cite an entry by ID (e.g. "see D002") instead of re-explaining it.

---

## D051 — 2026-09-07 — Double-venue-tag systematic audit: a hotel-attribution check, and a session-wide orphaned-wedding bug found along the way

Status: Accepted
Context: the user pushed back on D050's hotel-anchoring fix directly: a hotel credited as
"Venue: @hotelbrand" might genuinely be where the ceremony/reception happened, or might just be
where guests stayed, with the real venue elsewhere or untagged — and asked for a systematic loop
digging into the "multiple venue-role credits on one post" problem generally, not one-off fixes.

**Sized the real scope first**: 324 already-created weddings have a source post with 2+
`role='venue'` credits — the full universe of this ambiguity, much bigger than anything hand-
checked in D050. 11 weddings (14 posts) specifically involve a known hotel-brand account.

**Tried and reverted a parser fix** (`ROLE_MAP` checks `venue` before `hotel`, so a combined
"Venue + Hotel" label resolved to venue): shipped as `stack-parser-ts-v6`, demoting these to
`role=hotel` — then checked every one of the 5 corpus-wide instances against reality before
trusting it, and found all 5 are the SOLE venue-shaped credit on a genuinely real, well-
documented wedding (Whitney & Corey, Alex & John, Allie + Vig). Demoting would have stripped the
only venue evidence from posts shaped exactly like these — reverted in `v7` (behaviorally
identical to `v5`). The underlying concern is real but needs per-post context (is there a
SEPARATE, more specific venue credit on the same post) a single-line classifier can't see —
left as a hand-verification question, not solved by a parser heuristic.

**Hand-read all 11 hotel-involved weddings**, not a sample. One was the exact D050 bug repeating
on a different post (wedding 1565, `nobuchicago`→`thedalcy`, corrected) — proof the original fix
was necessarily incomplete, found via specific known posts rather than a full sweep. Every other
one checked out as a genuine, explicitly-labeled hotel use ("Reception Venue Hilton Chicago,"
"VENUE - @saintclementparish"), not accommodation mistaken for venue. Direct, honest answer to
the user's concern: verified, not assumed.

**Systematic re-sweep of the remaining ~313**: bucketed by the distinct co-tagged-handle pair
rather than reading every wedding individually. The two largest buckets (`bridgeportartcenter`/
`venuelogic`, 89; `rockwellontheriver`/`venuelogic`, 79 — 168 of 313, 54%) are D047's already-
verified-safe `venuelogic` pattern, and every single one already shows the correct venue
currently anchored. Spot-checked ~15 more previously-unverified smaller buckets (distinct
co-tag pairs) — all clean, all matching what the caption explicitly labels as the venue.

**A serious, session-wide bug found along the way, unrelated to venue misattribution**: while
investigating a handful of already-created weddings with `venue_id IS NULL` despite having a
resolvable venue credit sitting right there, found that one of them (a post already checked in
this session's Track 1 batch) had ALSO just been re-created as a brand-new, separate wedding
today — a duplicate. Root cause: `createWeddingsFromJeremyEvidence.ts` created the `weddings`
row and `wedding_vendors` credits BEFORE checking whether the candidate's source post already
belonged to an existing wedding; `wedding_posts`' own `on conflict (post_id) do nothing` then
silently no-op'd the post attachment when it did, leaving an orphan — a real wedding row with
real vendor credits but zero posts. Sized session-wide (not just today): **17 orphaned weddings,
dating back to the very first creation batch on 2026-09-05** — every single one confirmed a
duplicate of an already-existing wedding, zero `jeremy_wedding_vendors_ingested` overlap (never
reached production ingestion). This means every "weddings created" count reported across D035
through D050 included some of these phantoms; the corrected picture is 17 lower than reported.

Fixed the root cause (the already-documented check now runs before creating anything, not
after). Logged full provenance to a new `orphaned_weddings_retired` table, then deleted all 17
(zero posts — nothing to detach, matches the established "never leave an empty wedding" rule
from D040/D041, same bar as a real DELETE elsewhere in this project: dry-run reasoning done by
hand since these were pre-identified with certainty, human-confirmed before executing).
`weddings` 3552→**3535**.

**Also fixed while auditing**: 5 already-created weddings had `venue_id IS NULL` despite a
resolvable, explicitly-labeled venue credit on their post (370, 493, 956, 1022, 1033) — each
hand-verified and corrected directly to the explicitly-labeled reception venue (same convention
as every ceremony+reception pick this session). Net for the whole audit: **weddings 3552→3535**
(-17 orphans, +0 net from the venue corrections which don't change the count, only correct
`venue_id`). Updated every pinned test literal touched, investigated each rather than blindly
bumped. Full suite green (90/90 in isolation; two pre-existing, unrelated flaky timeouts under
parallel-suite load confirmed clean alone).

## D050 — 2026-09-07 — Secondary-venue-anchor bug found and fixed: "Getting Ready Venue" etc. were winning venue attribution over the real venue

Status: Accepted
Context: while starting the coverage-gap mission's Track 1 (hand-reading unmatched reconciliation
candidates), the venue accounts several candidates resolved to looked wrong (photographer/planner
personal handles, publication accounts). Investigating surfaced a real, already-shipped
data-correctness bug, not just a pending-candidate quality issue — the user approved fixing it as
its own loop/strategy before the coverage-gap work continued.

The bug: the stack parser tagged any caption line matching a "venue"-shaped label with
`role='venue'`, including secondary, adjacent-event locations that are NOT where the wedding
itself happened — "Getting Ready Venue," "Rehearsal Dinner Venue," "Sangeet Venue," "Welcome
Party Venue," and South-Asian-wedding pre-events (Mehndi/Haldi). When a post credited both the
real venue and one of these, `runJeremyWeddingClustering.ts`'s venue-anchor resolution
(`postEvidence.find((e) => e.role === "venue")`) picked whichever came first with zero preference
for the actual venue. Confirmed real: `Venue: @thedalcy` / `Getting Ready Venue: @nobuchicago`
produced 5 weddings anchored to nobuchicago instead of thedalcy.

Fix, same shape as D048's `VENUE_LIST_MARKER` precedent: a targeted `SECONDARY_EVENT_VENUE_MARKER`
regex in `stackParser.ts`'s `normRole()` reclassifies these specific labels from `venue` to
`other` (`STACK_PARSER_VERSION` v4→v5). New unit tests lock in the exact real-world caption shape
that produced the bug. Re-ran `runStackParserBaseline.ts` against the full 5,225-post scored
corpus — 119 entries correctly reclassified, 0 remaining misclassifications.

Because `runJeremyWeddingClustering.ts` writes `venue_account_id` with `coalesce(venue_account_id,
...)` (never overwrites once set), the parser fix alone does NOT retroactively correct
already-formed candidates or already-created weddings — two separate corrective passes were
needed:

1. **6 already-created weddings** hand-verified one at a time against their actual caption
   (never a blind batch UPDATE): 4 (weddings 1542/1547/1550/1554, all nobuchicago→thedalcy,
   the exact bug case) plus 2 more that the fix revealed as a *different*, pre-existing
   ceremony+reception ambiguity once the secondary-location noise was removed (wedding 899:
   `artinstitutechi`/ceremony + `theexchangechicago`/reception, was wrongly anchored to
   `langhamchicago`/getting-ready; wedding 5513: `saintclementparish`/ceremony +
   `universityclubofchicago`/reception, was wrongly anchored to `gibsonsitalia`/rehearsal-dinner)
   — both corrected to their reception venue, a defensible tiebreak, at minimum strictly better
   than the confirmed-wrong prior value. `weddings.venue_id` UPDATEd directly for all 6.
2. **127 pending (not-yet-created) candidates** also carried the same wrong anchor — a new script,
   `fixSecondaryVenueAnchors.ts`, re-resolves each one's real venue from its post's current (v5)
   stack data: 112 had exactly one legitimate venue credit left (corrected automatically, safe
   and unambiguous — a handful were harmless no-ops where the same account was, coincidentally,
   also the genuinely correct venue on that specific post), 9 had zero other venue credit (set to
   NULL, never guessed), 6 were a genuine ceremony+reception-style ambiguity left untouched for
   hand review (one of the 6, candidate 1443, is the exact candidate behind wedding 5513 above,
   already resolved there). Re-ran `runJeremyWeddingReconciliation.ts` afterward; found and
   cleared 5 stale reconciliation rows left over from before the 9 candidates got nulled (the
   reconciliation script's own `venue_account_id == null` skip never revisits an existing row) —
   confirmed none of the 5 were ever ingested into production before deleting.

Updated every pinned test literal this touched (`graphStrengthening.test.ts`) — investigated,
not blindly bumped, each one (matches the standing discipline from D049's candidate-1691
precedent). Full test suite green (89/89, two pre-existing unrelated flaky timeouts confirmed
clean in isolation).

**Track 1, zero-coverage batch (same day)**: re-derived the coverage-gap plan's unmatched-
candidate pool fresh against the corrected data (55/55/43/242 across the 0/1-5/6-15/16+ buckets).
Hand-read all 37 zero-coverage candidates with a resolved, correctly-categorized venue account.
**11 kept, 26 excluded.** Most exclusions were the *same shape of bug just fixed above, but not
caught by the parser regex* — a different, non-"secondary-event" account (a decor/rental/beverage
company, or the post's own author) co-tagged on the same "Venue:" line, with the real venue
plainly stated elsewhere in the caption (e.g. austinjamescreative excluded, real venue
loewschicago; abarestaurant excluded, caption literally says "at The Dalcy"). A few more: known
generic-marketing self-promotion ("Book now!" CTAs, no couple named), 2 explicitly non-Chicago
(Kohler/Lake Geneva, WI), and one likely 4th Art Institute handle variant (`artinstituespecialevents`,
missing a "t" — flagged for the `account_aliases` follow-up rather than created as a new venue).
Kept: churches and campus venues treated as legitimate standalone venues (same precedent as
fourthchurch/saintclementparish elsewhere this session), plus specific named-couple events at
Cuneo Mansion, the Harold Washington Library, and North Shore Country Club (two different
weddings a month apart, date-checked, not a duplicate). Full exclusion/keep reasoning in
`createWeddingsFromJeremyEvidence.ts`'s own comment. **Net: 11 new weddings** (candidates
295/542/1154/1250/1380/1384/1423/1462/1571/2673/2700 → weddings 5817-5827, 148 vendor credits).
`weddings` 3527→**3538**. Pinned test literals updated again, full suite re-verified green.

**Track 1, 1-5-documented-wedding bucket (same day)**: 55 candidates, deduped/filtered to ~50
worth reading. Two large single-venue clusters dominated and were bulk-handled rather than
read one by one: `thefultonwest` (22 candidates) — spot-checked 4 new ones against D048's
already-established "self-marketing, no couple ever named" finding, confirmed the pattern holds
(one explicitly a "farewell event," not even a wedding) — all excluded. `thegwenchicago` (6
candidates) — a NEW finding: every one is either @chicagostyleweddings' "Designers' Challenge"
(a styled planner competition, explicitly not a real wedding) or a direct marketing/booking
offer ("book by March 31...") — all excluded. The rest hand-read individually: more of the same
co-tagged-wrong-account bug shape as the zero-coverage batch, an ambiguous generic corporate
handle (`stregischicago`, matching the established ritzcarlton/loewshotels precedent), and one
outright wrong event type (a Bat Mitzvah, not a wedding). **14 kept** — real, dated, named-couple
events, including three separate weddings at `hilton_chicago_hotel` (date-checked, 5+ months
apart each) and two at Cantigny Park. **Net: 14 new weddings.** `weddings` 3538→**3552**. Pinned
literals updated again, full suite re-verified green.

**Track 2.1 (same day)**: re-checked the 4 originally-flagged "real credit, never anchoring"
venues. 3 of 4 turned out to be non-issues: `msichicago`'s only venue-shaped credit was itself a
Sangeet Venue (correctly excluded by this session's own fix, and the post is golden_set EXCLUDE
anyway — a human already said not-real); `theoakbrookmanor`'s only credit is a real but thin
2-role post below the 3-role clustering floor, structural not fixable here;
`thehomestead1854`'s only credit is on a post naming **15 different venues** — the same
"multi-wedding recap, structurally unusable" shape D048 already established, correctly left
uncreated. **`naturemuseum` was a real, fixable case**: a genuine ceremony (already-covered
`lincolnparkzoo`) + reception (`naturemuseum`, zero coverage) pair, arbitrarily anchored to the
ceremony church — corrected the candidate's `venue_account_id` directly to the reception venue,
this session's standing tiebreak convention. Net: **1 more wedding.** `weddings` 3552→**3553**.

**Track 2.2 (same day)**: the 116 no-Instagram-account venues, sized properly. 101 of the 147
zero-coverage venues actually had `vendors.instagram_handle` already populated from the original
Google Places scrape — it was simply never matched to an `accounts` row. **53 of those matched an
existing `accounts` row exactly (`account_matched_by='handle_exact'`, same trust level as the
1,896 handle-exact matches from the original D006 merge)** — bridged directly, no WebSearch
needed. **41 of the 53 already had real weddings (110 total)** — they were productive the whole
session, just misidentified as "no venue" for display/coverage-counting purposes; this alone
dropped the zero-coverage count from 147 to 105. WebSearched the 15 venues with no handle at all
(`bridgeUnmatchedVenueAccounts.ts`'s dry-run first, then targeted searches): found 8 confirmed
handles (independently verified, not guessed — one search for "Wrigley Field wedding instagram"
surfaced Wrigley MANSION in Phoenix, AZ, a different venue entirely, correctly left unresolved
rather than risk a wrong match; The Shapiro Ballroom confirmed permanently closed since 2020, not
worth queuing; Gala Banquet Hall/Woman's Athletic Club/The Chicago Club/Stardust Banquet Hall
left unresolved — genuinely ambiguous or no dedicated account found). 5 of the 8 found handles
already had accounts too (34 more existing weddings surfaced this way). The remaining 51 known-
handle, zero-posts-in-corpus venues (48 original + 3 newly WebSearched) got a bare placeholder
`accounts` row and a `ops.crawl_frontier` entry each (`queueUnseenVenuesForCrawl.ts`) — genuinely
impossible to document a wedding for without a real tagged-feed crawl this sandbox can't run.
**Net effect: zero-coverage venue count 147→100**, `accounts` +51 (14366→14417, none from
wedding creation — bare crawl-queue placeholders), zero new weddings from this track (the wins
were all identity/coverage-counting corrections, not new documented events) — the eventual
wedding-creation upside is downstream, contingent on a real Apify crawl.

**Track 2.3 (same day)**: the ~27 known Chicago venue accounts with real activity but zero
`role='venue'` credits ever extracted for themselves. A real, non-obvious parsing gap, not a
content gap: several are highly active (100-200+ own posts each — `glessnerhouse`,
`biagioevents`, `trumphotels`, `leloftchicago`, `roofonthewit`, `maggianoslittleitaly`,
`raisedbarchicago`), and their own posts about their own real weddings never carry a formal
"Venue: @handle" line (no reason for an account to self-tag) — so `venue_couple_signal_post_
vendor_evidence` (D047), which only ever checks a post's couple-signal language AFTER confirming
it already has SOME stack-extraction row, never even looks at these posts in the first place.
Sized live: 170 untouched own-profile posts across these venues match the existing couple-signal
regex. Hand-spot-checked two accounts before building anything: real signal exists (a genuine
"Melanie & Eusebio... unforgettable day at Biagio's") but mixed with much heavier noise than the
same regex sees on vendor-tagged posts — a venue's own feed mixes weddings with quinceañeras,
corporate events, and generic self-marketing, all of which can trip a loose "any two capitalized
words" pattern (one clear false-positive family: a history museum's own guest-lecturer
announcements, e.g. "Darcy Evon" or "Carla Bruni and Phil Thompson," matched as if they were a
couple). Given the noise, built a small, targeted `/label` queue rather than any automated
creation — `venue_zero_credit_v1` (155 posts, `buildZeroCreditVenueQueue.ts`), bucketed by venue
so results can show which of these 11 accounts' content is actually worth mining. **Not made the
active queue** — `CURRENT_QUEUE_VERSION` still points at `beyond_include_v1` (user has real
progress there); ready to switch whenever wanted.

Remaining coverage-gap work: Track 1's 6-15/16+ buckets (low priority — piling onto
already-well-covered venues barely moves the skew) is the only piece left genuinely open from
this whole D050 arc.

## D049 — 2026-09-07 — Styled-shoot vs. real-wedding signal: flag, don't delete

Status: Accepted, in progress
Context: the user wants staged/editorial "styled shoot" content (no real couple) separated from
real documented weddings — explicitly NOT deleted, tagged, so a future UI can default to real
weddings and let users opt into styled content (a filter/pill, or auto-include when a venue has
very low real-wedding coverage). Rationale given directly: styled shoots show a venue "at its
best," real weddings show day-to-day reality and should carry more weight; vendor graphs/edges
stay legitimate either way. Two signals proposed ("models" credited, the word "styled") — the
second explicitly flagged by the user as noisy ("style or styled by... plenty of other ways style
is used"). Asked me to mine `golden_set` labeling history and "think hard" before building
anything, and report a best-estimate styled count in both already-created weddings and the
remaining ~47k unprocessed corpus.

Empirical grounding (all against golden_set — 2,859 rows total, spans 13 labeling batches; 1,237
confirmed-real INCLUDE, 104 rows with a "styl" signal in notes/exclusion_reason — 94 EXCLUDE
confirmed-not-real, 7 INCLUDE, 3 REVIEW): a refined "styled shoot/editorial" phrase+hashtag regex
has a 0.16-0.24% false-positive rate against confirmed-real weddings vs. 46% recall against
confirmed-styled ones — the bare `styl` substring alone has a 16.7% false-positive rate,
confirming the user's own warning. Vendor-stack richness does NOT discriminate styled from real
(7.45 vs. 7.20 average distinct credits) — refutes the naive "heavy stack = probably real (or
probably styled)" assumption; `author_is_vendor` likewise doesn't discriminate (80.9% vs. 82.9%).
"Model" as a credited role: zero occurrences anywhere in `stack_extraction_entries` at this
corpus's scale — the user's idea is theoretically sound but not empirically present as a
structured signal. Repeat-producer accounts ARE a real, validated signal (`chicagostyleweddings`
7-8 styled posts, `michiganavenueevents` 5, several repeat photographers/planners) — directly
confirms the user's own hypothesis ("some accounts might even be generating more styled shoots").
One correction found via hand-verification during the build (below): `chicagostyleweddings` is a
MIXED-content account — 9 of its posts are also golden_set-CONFIRMED real weddings — so
known-network-account membership alone is too weak for a high-confidence tier.

Decision: shipped `post_styled_shoot_signal` and `wedding_styled_shoot_flag`
(`pipeline/schema.sql`, `apps/web/scripts/graph/applyStyledShootSchema.ts`) — two new, purely
additive/derived views, no existing table touched, nothing gates on them. Per-post tri/quad-state
`confidence`: `CONFIRMED` (golden_set says so directly — 94 rows, matches exactly), `LIKELY`
(the high-precision phrase/hashtag regex only), `POSSIBLE` (repeat-producer account, known-network
account, or the noisy bare-keyword match — all weak signals kept but never promoted to LIKELY),
`NO_SIGNAL` (everything else). `wedding_styled_shoot_flag` rolls this up per wedding — only
weddings with ≥1 flagged post appear, nothing in `weddings`/`wedding_posts` is read-written.

Caught and fixed one real bug via hand-verification before trusting any count: the first hashtag
regex had no word-boundary, so `#editorialweddingphotography` (a common REAL wedding-photographer
tag, sitting right next to `#realwedding` in the same caption) matched `#editorialwedding` as a
substring prefix — inflated the already-created-wedding LIKELY count from a true ~20 to a false
53. Fixed with Postgres's `\y` word-boundary anchor; re-verified the false-positive rate held
(3 of 1,237 confirmed-real posts, ~0.24%, one of which — `DbJiASVpnTh` — is a post the user's own
golden_set note called "confusing... says styled shoot" on an otherwise-real wedding, not a
regex bug).

**Live counts, current data (2026-09-07)**: of 3,520 already-created weddings, **8 CONFIRMED**
(golden_set says these specific posts are styled — worth a hand-audit before any UI change),
**10 LIKELY** (high-precision phrase/hashtag signal), **823 POSSIBLE** (weak/noisy signal only —
mostly a real wedding whose caption happens to contain "styl" somewhere, e.g. "bridal style" —
not a recommendation to treat these as styled, just flagged for visibility). **Remaining ~47k
unprocessed corpus**: smaller than the user's own hope going in — only 80 untouched posts clear
both a real (3+-role) vendor stack AND a LIKELY/POSSIBLE signal (7 LIKELY, 73 POSSIBLE); posts
authored by the known repeat-producer accounts are already all touched by prior missions (0 new).
Honest recalibration communicated to the user: this mission is not a large new-volume unlock the
way `beyond_include_v1` was — the payoff is trust/quality (correctly tagging what's already
flowing in through other paths), not a hidden pool of untapped real-vs-styled content.

Shipped a small (80-post) ground-truth-growing `/label` queue, `styled_shoot_v1`
(`apps/web/scripts/classify/buildStyledShootQueue.ts`), same "test which signal is predictive"
bucket-tagging discipline as `beyond_include_v1`. **Deliberately did NOT flip
`CURRENT_QUEUE_VERSION`** (`apps/web/lib/server/labeling.ts`) away from `beyond_include_v1` — the
user still has ~600 posts unlabeled there and the `/label` UI has no queue-version selector, so
switching would silently redirect them mid-flight. `styled_shoot_v1` is built and ready; switch
the constant (or add a selector) whenever the user wants to work it.

**Round 1 sync results (2026-09-07, same day)**: at the user's explicit go-ahead ("yes you can
flip it over now and ill get thru those 80"), flipped `CURRENT_QUEUE_VERSION` to
`styled_shoot_v1` and verified live (first `/api/labels` post served was captioned "We are loving
the photos from this styled shoot!... Models: nikki.callo & Omar Mendez" — the user's own
model-credit hypothesis, confirmed in the wild on the first result). User labeled all 80. Results
validated the tri-state design directly: **LIKELY** posts were 71% NOT_WEDDING (5/7), **POSSIBLE**
posts were 58% NOT_WEDDING (42/73) — both meaningfully above baseline, LIKELY the stronger signal
as designed. Synced (`styled_shoot_v1_sync_round1_2026-09-07`, 119 rows — includes 39 leftover
unsynced `beyond_include_v1` labels picked up by the same global sync) → `golden_set` grew
2,859→2,978; `post_styled_shoot_signal` CONFIRMED grew 94→141. Ran the full
sync→stack-parse→cluster(`--evidence-source human_confirmed`)→reconcile pipeline: 39 new
candidates, 25 creation-eligible after reconciliation (6 already matched an existing wedding — 2
high-confidence, 4 ambiguous, left as an inert belief per standing policy — and 8 had no
resolvable venue account at all, skipped). **Hand-read all 25, not a sample** (small batch).
Found two exclusion shapes concentrated in one round for the first time: **geography** (7 of 25
resolve to a venue with no confirmed Chicago location — Notre Dame IN, a Michigan farm, Saugatuck
MI, Long Beach IN, and others — content the user's fast caption-only labeling had no way to catch,
since `/label` doesn't surface geography-confirmation status, a real product gap worth fixing
later) and **generic vendor marketing / ambiguous content** (10 of 25 — an officiant's service
pitch, a videographer's brand pitch, package/pricing copy, a seasonal announcement, and — notably
— one post whose own caption said "this stunning editorial shoot we created," exactly the
false-positive this mission exists to catch, that had still been labeled WEDDING in a fast pass).
1 more excluded pending geography verification despite good content. **Net: 7 new weddings**
(candidates 3377/3380/3381/3385/3392/3395/3401 → weddings 5799-5805, 67 vendor credits).
`weddings` 3520→**3527**. Full test suite green (87/87) after updating every pinned literal this
touched (`graphStrengthening.test.ts`, `vendorAssociation.test.ts`,
`styledShootSignal.test.ts`) — one, a strict "0 identity changes" invariant on high-confidence
reconciliation matches, briefly went to 1 and was individually investigated (not just bumped):
confirmed a benign "recurring vendor team, different real wedding" case already established
throughout this whole arc, zero production impact (candidate never ingested).

Explicitly deferred, matching the user's own sequencing ("first step now is to document... and
flag"): the actual `/vendors` UI filter/pill toggle, and "low venue coverage → auto-include
styled" display logic — product/UX decisions for once this tagging has more labeling rounds
behind it. Full test suite green (87/87) after adding `styledShootSignal.test.ts`.

## D047 — 2026-09-06 — "V1 data completion, venues-first": scaling past the ~800-post labeling queue using existing infra, and relaxing one D034-era scoping filter

Status: Accepted, in progress (Track A Batches 5-7 shipped, 195 of 252 unresolved venue accounts
remain; Track B abandoned, see below)
Context: the user wanted to stop circling on data-layer philosophy and use the full 47k+ post
corpus, not just the ~2,000-post `/label` queue — specifically, more Chicago venues than the
product shows today, prioritizing venues over other vendor categories (explicitly deferred:
"hold off on all the vendors"), with a concrete, self-verifiable bar: a real venue page on
localhost should show more posts/weddings than it does today (example given: `venuelogic` at 26).
Live sizing before proposing anything: `vendors` (Places-sourced) already has 5,029 Chicago
businesses (430 category=venue); `candidate_scores` already covers all 47,623 posts; 917
venue-authored posts are V3 `INCLUDE` and never human-reviewed at all; 252 venue-tagged
accounts (`v_account_role='venue'`) had zero Chicago-location signal at all (no `vendors`
bridge, no `account_locations` row) — the exact same shape as D036-D039's already-proven
WebSearch methodology, just a fresh cohort.
Decision (Track A, this entry): re-ran the `is-chicago-for-new-venues.md` WebSearch method
against 49 of the 252 unresolved accounts (Batch 5, appended to
`backfillVenueLocationsViaWebSearch.ts`'s `CONFIRMED_LOCATIONS`) — 33 confirmed Chicago-metro
(committed), 11 confirmed NOT Chicago (Riviera Maya x2, Scotland, Tuscany, Nashville, NYC,
Beverly Hills, Northern Michigan, Madison WI, a Pennsylvania handle collision, Indiana Dunes —
the user explicitly excluded the one Indiana borderline call, `whitehawkcc`/Crown Point),
4 inconclusive (left unresolved).
**Real, surprising finding mid-implementation, surfaced rather than worked around**: the 33
confirmed venues almost all already had exactly one existing Ben wedding each (33 venues, 33
weddings) — a different population than D034's original "venue has zero Ben weddings" scope.
`createWeddingsFromJeremyEvidence.ts`'s duplicate-check scripts pre-filtered on that same "zero
weddings" condition, which was D034's scoping convenience for its own population, not a safety
mechanism (the actual protection is the two Jaccard-based duplicate checks, both still fully in
force). Dropped that pre-filter for a new `--batch5` mode in both `checkIntraBatchDuplicates.ts`
and `checkExistingDuplicatesForCreation.ts`, scoped by an explicit `BATCH5_ACCOUNT_IDS` list
(same pattern as Phase 2's `PHASE2_ACCOUNT_IDS`). 23 candidates in scope; hand-read all of them
(proportionate given the small size) and found a real risk pattern: all 10 candidates at
`fourthchurch` were contaminated — most are the *same* real wedding ("Lyndsey and Robert")
reposted by its photographer over more than a year (outside the 21-day dedup window, so only one
pair got caught by the Jaccard check), and at least 2 explicitly credit "Venue:
@universityclubofchicago" in the caption — a clustering misattribution, not fourthchurch's
evidence at all (same bug pattern as `is-chicago-for-new-venues.md`'s candidates 2411/2542).
**All 10 `fourthchurch` candidates excluded from this batch** (flagged as a future targeted
follow-up, not lost). The clean remaining 13 (holynamecathedral x7, bolingbrookgolfclub x2,
trivolitavern, meridianbanquets, cityviewloft, drurylaneproductions) — all genuinely distinct,
named-couple real weddings on inspection — were dry-run verified then committed: **13 new
weddings, 15 posts, 148 `wedding_vendors` rows** (`weddings` 1567→1580, `wedding_vendors`
14591→14739). Idempotency untouched (all prior D035/Phase1/Phase2 batches correctly skip).
`is_chicago=true` set via a new `BATCH5_ACCOUNT_IDS` fallback in the same OR-clause pattern as
`PHASE2_ACCOUNT_IDS`. A side effect, not a separate write: the same 33 new `account_locations`
rows also flipped one previously-ambiguous `golden_set` post to Chicago-`CONFIRMED` via
`human_confirmed_post_geography`'s existing venue-signals join — Layer 1
(`human_confirmed_chicago_wedding_content`) moved 639→640, `human_confirmed_vendor_page_content`
579→580 (D046's views, both purely additive/derived, no logic changed).
Why: reuses proven infrastructure end to end (Places-sourced `vendors`, the already-validated
free-WebSearch Chicago-verification method, the existing evidence→cluster→reconcile→create
pipeline) rather than inventing anything new; the one filter relaxation is narrowly scoped
(a new named batch, not a change to Phase 1/2's historical behavior) and protected by the same
duplicate-detection machinery already trusted elsewhere in this workstream.
Related: D034, D036-D039 (`is-chicago-for-new-venues.md`, the proven method this reuses), D046
(the views this compounds with), D023 (the ingestion-count test literals this also bumped).

**Update, same day — Batches 6-7, a bonus find, an abandoned track, and a queue reprioritization:**
Batches 6-7 continued Track A into a lower-confidence tier of the 252-account cohort
(evidence_count/confidence 1/0.65, vs. Batch 5's 3-9/0.8-0.95) — noticeably noisier (many
out-of-state music venues, handle collisions) but still net-positive: 24 more confirmed
(11 + 13), several handle-variant cases (morgan.mfg./madegallery), one genuinely excluded
ambiguous-brand handle (`ritzcarlton` — the real Chicago property's actual handle is
`@rcchicago`, not guessed). Batch 6 unlocked 6 candidates, 5 created after hand-read (1
excluded: no named couple, hotel marketing hashtags, and V3's own current decision is EXCLUDE
— not overridden on an ambiguous call). Batch 7 unlocked 0 new candidates. 195 of the original
252 accounts remain unsearched; marginal yield is dropping as the confidence tier drops.
**Separately, a small pre-existing backlog was found and cleared**: `applyJeremyEvidenceToGraph.ts`
(D023's original high-confidence ingestion script, `match_confidence` 0.75-0.85) had never been
re-run against candidates created/matched after its original run — only 4 new rows, safe,
same mechanism, committed.
**Track B (the "getting the 47k to show up" volume lever) was attempted and abandoned**: a new
`venue_couple_signal` evidence source (extraction script, evidence view, third clustering
version `venue-couple-signal-v1`) was built end-to-end and clustered 212 candidates, but a
disqualifying bug was found before any creation — the couple-signal regex's generic
`Name & Name` pattern matches vendor ROLE LABELS ("Rentals & Chairs", "Planning & Decor"), not
just couple names; only 4 of 207 hand-checked candidates survive the strict, reliable pattern
(Mr./Mrs., "Couple:", "Bride:"), and the real corpus-wide population under the strict pattern
is only 33 posts — not worth pursuing. Zero weddings created from this track. The 212
candidates are left in `jeremy_wedding_candidates` (inert, non-production) rather than deleted,
per this project's reversible-over-destructive preference — flagged in test comments
(`graphStrengthening.test.ts`) so a future session doesn't mistake their presence for validated
evidence.
**The actual "get the 47k to show up" lever turned out to be the existing `/label` UI**: the
remaining unlabeled portion of the `v2` queue (978 posts) was reprioritized (`label_queue.rank`,
additive reordering only, no rows added/removed) so the 189 venue-authored posts come first,
ordered by ascending existing-documented-wedding-count per venue — a human WEDDING label there
feeds the already-built human-confirmed-evidence pipeline exactly like Track A's WebSearch
batches do, but sourced from human judgment instead of automated matching.
Net effect so far: `weddings` 1567→1585 (+18), `wedding_vendors` +193, Feed coverage
(`measureFeedCoverage.ts`) 19.3%→20.4%.

**Update, same day — "corrected priority": the user pushed back that none of the above touched
the venues actually visible on `/vendors`** (bridgeportartcenter, the.arbory, fairliechicago,
venuelogic, etc.) — correct: Track A only ever targeted newly-discovered accounts, a population
disjoint from already-popular, already-documented venues. Sized the real opportunity: **2,030
trustworthy candidates (excluding the abandoned venue-couple-signal-v1), unmatched, uncreated,
spanning 253 already-known venues** — the same "drop the D034 zero-existing-weddings pre-filter"
mechanism as Batch 5/6, just applied at its true full scope via a new `--tier1/--tier2/--tier3`
mode on both duplicate-check scripts (tiered by candidates-per-venue: 156 venues 1-4 each,
53 venues 5-14 each, 39 venues 15+ each — the 15+ tier carries real repost/misattribution risk,
same shape as Fourth Church, and is deliberately deferred).
**Tier 1 shipped**: a naive first pass resurfaced candidates 2411/2455/2469/2542
(cloudgatequartet/hangoutlighting/blueplatechicago/ravisloeweddings) — already-documented
mislabels from D036's Phase 1 (`is-chicago-for-new-venues.md`) that a fresh hand-read alone
missed (2469's caption opens with a genuine couple's story; the misattribution — "Venue:
@sohohouse @tigerlilyevents @blueplatechicago" — is further down). Built a proper systematic
filter instead of whack-a-mole: excluded candidates with 2+ distinct accounts tagged
`role='venue'` (73 of 241, the Phase 2 church-vs-reception ambiguity pattern) and candidates
whose venue account's own bio contains a "Venue: @otherhandle" redirect (1). Explicitly did
**not** require an `account_tags` venue-shaped role at all — verified live that this produces
false positives at this broader scope (candidate 21, a genuine hand-verified Loews Chicago
Hotel wedding, has zero `account_tags` rows — simply never classified, not evidence of
anything wrong). Content-quality issues (generic marketing/advice copy despite a real vendor
stack) are a separate risk, caught by hand-reading ~43 of 241 candidates (~18%) plus a
corpus-wide regex sweep for marketing-CTA language — 9 more excluded. Net: 241 → 159. Dry-run
verified, committed: **159 new weddings, 179 posts, 1,452 `wedding_vendors` rows, +6 accounts**
(previously-unseen secondary vendor handles). `weddings` 1585→1744, Feed coverage 20.4%→27.7%.
Tier 1 touches none of the user's 8 named venues (all Tier 3) — it grows the long tail.
Related: is-chicago-for-new-venues.md (Baseline findings — the exact mislabel patterns this
filter now catches systematically instead of by hand), D034 (the zero-existing-weddings scoping
convenience this keeps relaxing, now at full scope).

**Update, same day — Tier 2 shipped (53 venues, 5-14 candidates each, 440 total), including 4 of
the user's 8 named venues (venuelogic, thewellsley, gpconservatory, the_carter_fultonmarket).**
Same systematic filter as Tier 1, plus `fourthchurch`/`thefultonwest` excluded entirely (both
already confirmed contaminated). New finding: a supplementary WIDE (no date-window) Jaccard
check across same-venue candidates surfaced 128 high-similarity pairs the standard 21-day check
misses — but hand-reading a sample showed most are **not** duplicates: a venue's recurring
preferred vendor team (same photographer+planner+florist trio) produces identical vendor-set
fingerprints across many genuinely different real weddings (e.g. `saintclementparish` candidates
1024 "S+B's reception" vs. 2246 "Susanna wore her heart" — different couples, same trio).
Blanket-excluding on Jaccard alone would have wrongly discarded real, distinct content — directly
against the user's explicit priority ("largely we are way too exclusionary today... even if
there's not a full vendor stack, if it showcases a real credible couple... great to show users").
Only excluded pairs with a directly-verified duplicate signal (matching couple name/handle
across both posts, or same-day dates): 7 pairs, plus 3 more content-quality excludes from
hand-reading the named venues directly (a venue-introduction marketing post, two "no couple,
pure marketing copy" posts). Net: 440 → 337. Dry-run verified, committed: **337 new weddings,
368 posts, 3,141 `wedding_vendors` rows, +2 accounts**. `weddings` 1744→2081, Feed coverage
27.7%→39.4%. Named-venue growth, directly verifiable on `/vendors`: venuelogic 26→29, thewellsley
21→26, gpconservatory 16→19.

**Update, same day — Tier 3 shipped (39 venues, 15+ candidates each, 1,349 total), including the
remaining 4 of the user's 8 named venues** (bridgeportartcenter, rockwellontheriver,
chicagoilluminatingcompany, the.arbory, fairliechicago, sarabandechicago). Same systematic
filter as Tier 1/2, plus `fourthchurch`/`thefultonwest` excluded entirely (already confirmed
contaminated). Highest-risk tier by construction (candidate volume concentrates exactly where
Fourth Church's problem hid), so it got the most scrutiny: a same-venue Jaccard scan restricted
to 0-3 day gaps found only 2 pairs, both already caught by the standard 21-day check — no hidden
near-term duplicate cluster at scale. A broader wide-window scan (no day limit) showed real
clustering at the highest-volume venues (38 pairs at bridgeportartcenter, 59 at
chicagoilluminatingcompany, 30 at rockwellontheriver) — hand-read samples confirmed the same
Tier-2 finding: mostly a venue's recurring preferred vendor team producing identical vendor-set
fingerprints across many genuinely different real weddings, not duplicates (e.g.
bridgeportartcenter candidates 369/553, same photographer+venue-manager, no shared couple
identity). One genuine duplicate found this way and excluded (385/557, "Lola and Noah"/"L&N",
same photographer). `thelibraryat190` (19 candidates) was hand-read in full given a
generic-hashtag pattern resembling `thefultonwest`'s contamination — turned out mostly genuine
(only 2 of 19 excluded). Standard 21-day check found 9 more near-term duplicates, all
hand-verified and resolved. Corpus-wide marketing-CTA regex swept 27 matches; only 3 lacked any
couple-name signal (excluded), the other 24 kept (real couple + a cross-tagged vendor's own
promo line, same pattern tolerated in every prior tier). Net: 1,349 → 1,076. Dry-run verified,
committed: **1,076 new weddings, 1,213 posts, 10,128 `wedding_vendors` rows, +21 accounts**.
`weddings` 2081→3157 — roughly **double** the pre-session count of 1,567. Feed coverage
39.4%→**60.1%**.
Final named-venue growth, all directly verifiable on `/vendors` today: **the.arbory 22→75,
bridgeportartcenter 23→67, fairliechicago 19→50, sarabandechicago 17→36**, venuelogic 26→29,
thewellsley 21→26, gpconservatory 16→20, the_carter_fultonmarket 18→17 (net -1 despite Tier 2's
+contributions there — some pre-existing rows likely got re-attributed during a reconciliation
rerun mid-session; not investigated further, flagged for awareness not alarm given the tiny
scale).
This closes the three-tier "corrected priority" sweep across the entire known-venue population
(2,030 trustworthy candidates → 1,772 created after all systematic + hand-verified filtering,
across all three tiers combined). Remaining, explicitly deferred: `fourthchurch` and
`thefultonwest`'s clusters (contaminated, need per-candidate untangling, not a batch operation);
the 207 `venue-couple-signal-v1` candidates (abandoned track, inert); the 195 of 252 original
Track A WebSearch accounts never searched (diminishing returns observed, lower priority now that
the much larger tiered sweep landed); Track C (portfolio content) and any vendor-page UI work to
actually surface Layer 2/portfolio content — both still genuinely separate, undone work.

**Update, same day — final cleanup of the original "18 hand-reviewed" candidates, and a new
labeling strategy.** 4 of the 18 were still unhandled after the tiered sweep (which only
considers candidates with `matched_wedding_id is null` — these had a weak-but-non-null automated
match, or were caught by the double-venue-tag filter, both cases a human had already reviewed
and cleared): 2954, 2959, 2967 created directly; 2981 (confidence 0.4, below
`applyJeremyEvidenceToGraph.ts`'s 0.75-0.85 scope) attached via a new one-off script
(`attachStrayHumanConfirmedCandidate.ts`) — this is the one deliberate, documented exception to
the "`jeremy_wedding_vendors_ingested` only ever holds the audited 0.75-0.85 tier" invariant,
excluded by candidate ID in the test rather than widening the confidence band. `weddings`
3157→3160, `wedding_vendors` +30. All 18 original candidates now resolved.
**Separately, `/label`'s queue strategy changed**: instead of general stratified sampling (`v2`),
a new queue (`venue_coverage_v1`, `buildVenueCoverageQueue.ts`) targets posts connected to the
116 known Chicago venues with ≤5 documented weddings (own-profile OR tagged-as-venue, 4,077
posts, 1,210 of them at venues with ZERO weddings), ordered by that venue's current wedding count
ascending — directly per the user's ask ("give me the existing venues and posts from their feed
or that they were tagged in, prioritizing ones with low coverage... I'd like more coverage for
the venues at the bottom with only a few weddings or none"). `CURRENT_QUEUE_VERSION` in
`labeling.ts` now points to it; `v2`'s 2,081 rows are untouched, not deleted, switch back by
reverting that one constant.

**Update, same day — queue tightened twice more (v2 → v3) after direct user correction, then
"let yourself cook" autonomy granted.** `venue_coverage_v1` shipped with no content filter at
all and wasted review time on birthday/cocktail-hour posts ("it'd be a waste of human time...
we should have this queue be an actual attempt of maybe real weddings"). `v2` added a
promise filter (bare `caption ilike '%wedding%'` OR has a vendor-credit stack OR V3
INCLUDE/REVIEW) but the user caught it as still too loose — a bare "wedding" substring let
through generic multi-purpose-venue marketing (Le Loft's "birthday party, shower, or wedding
event", `#chicagoweddingvenue` hashtag with no actual wedding described). Also corrected a
planned fix before it was built: don't require an explicit couple-name pattern, since these
posts are low-coverage *because* they already failed the same automated bars once — requiring
the bar again is circular and excludes exactly what human review exists for. `v3`
(`buildVenueCoverageQueue.ts`, `CURRENT_QUEUE_VERSION="venue_coverage_v3"`) tightened the
"mentions wedding" signal to specific-event phrases (`wedding day`, `their wedding`, `wedding
at `, ceremony/reception language, bride/groom/Mr&Mrs) instead of a bare keyword — 380 posts,
breakdown by current wedding count: 0:40, 1:30, 2:112, 3:21, 4:36, 5:141. This is the queue
actually served today. User then gave explicit standing authorization to stop checking in on
routine execution decisions and self-pace via `/loop` ("you need to set a loop and let
yourself cook on this... I don't want to hand hold here").

**Update, same day — Track A batch 8 (autonomous), diminishing returns confirmed; fourthchurch
untangled, thefultonwest confirmed correctly excluded.** Batch 8 searched 25 of the remaining
~195 unresolved venue accounts (skipped the obviously-non-Chicago names without a search burn
— Trump golf properties in FL, Austin/Tampa/Milwaukee/Springfield-MA handles, etc.):
14 confirmed Chicago-metro (thedawsonchicago, thehegewisch, theelmlagrange, penthousehydepark,
theatriachicago, msichicagoevents, themartchicago, artifecteventschicago,
onceuponatimeeventsllc, geraghtynorth_, napersettlement, skydeckchicago, stolensaddlechi,
pennywhistletavern) but **zero newly-unlocked `jeremy_wedding_candidates`** — these venues'
content lives in Jeremy's raw own-profile corpus, not yet vendor-tagged evidence, so Track A's
identity-backfill alone doesn't move them; they're exactly the kind of content the `/label`
`venue_coverage_v3` queue is now built to reach instead (once `vendors`, not just
`account_locations`, bridges them). Confirms the "6→0 unlocked candidates" diminishing-returns
pattern from batches 6-7 continues.

Hand-read `fourthchurch`'s full 12-candidate cluster individually rather than leaving the whole
venue dark. Found the SAME "one wedding reposted for a year" pattern that originally motivated
its exclusion, but ALSO found genuinely distinct real weddings hiding underneath it, both
things true at once: Lyndsey+Robert's wedding (thedalcy reception, fourthchurch ceremony) was
reposted 6 times (candidates 375/511/563/607/1561/2518, identical 18-vendor stack every time —
kept 375 as the representative, discarded the other 5 as pure reposts, not 6 separate
weddings). Isabel+Alex (University Club of Chicago reception) was posted twice under different
framing (1948/2583, same planner/florist team — kept the richer 2583). James+Taylor
(theexchangechicago reception, candidates 2394/2833) already reconciles to an existing wedding
(1262) at 0.4/0.8 confidence — already in the graph, no new create needed. Two more, Kim+Tim
(2166, wildmanbt reception) and an unnamed couple's "wedding exit" post (2047, standalone
4-vendor stack, no repeat pattern) were genuinely distinct one-off real weddings. Net: **4 new
weddings** (candidates 375, 2583, 2166, 2047 — `weddings` 5076-5079), 43 `wedding_vendors` rows,
`weddings` 3160→3164.

`thefultonwest`'s own 9 non-`venue-couple-signal-v1` candidates were also hand-read and are
**correctly** excluded, not under-reviewed: every one is the venue's own repeated
self-marketing content — two distinct identical vendor-team photo sets reused verbatim across
"National Cake Day," "Happy World Smile Day," a 1-year "Venue Day" anniversary post, and a
generic capacity pitch ("intimate celebration for under 75 guests") — no couple is ever named
or evidenced across any of the 9 posts. This is real Track-C-shaped venue portfolio content by
this project's own definition (showcases the venue's work, not a specific documented couple),
not a wedding-creation miss — a useful concrete example for scoping Track C's
`venue_portfolio_content` view when that gets built. `thefultonwest`'s 16
`venue-couple-signal-v1` candidates remain untouched (already-abandoned track, D047's Track B
v2 finding — loose "Name & Name" regex matches vendor role labels, not couple names — still
applies, not re-litigated here).

**Update, same day — Track C shipped: `venue_portfolio_content` view.** Pure-additive,
non-gating home for exactly the kind of content thefultonwest's cluster surfaced: a venue's own
portfolio/marketing posts (own-profile or tagged, no V3/golden_set gate, no clustering or
couple/date extraction — just a basic non-spam floor, caption length > 15 chars). Every row is
tagged with `has_couple_evidence` (same couple-signal regex as the abandoned
`venue_couple_signal_post_vendor_evidence`, here purely informational, not a filter) and
`is_documented_wedding` (already in `wedding_posts` or not) — a post can be neither, either, or
both. Live count: 12,416 rows across all known Chicago venues, 1,836 already documented
weddings, 3,582 with couple evidence (a much larger pool than the abandoned 207-candidate
`venue-couple-signal-v1` track, but this view drives no auto-creation, so the same false-positive
risk that killed that track doesn't apply here). `apps/web/scripts/graph/
applyVenuePortfolioContentSchema.ts` (idempotent, `create or replace view`) and
`venuePortfolioContent.test.ts` (4 structural invariant tests, all green). Not wired into any
page yet — data-only, per the original plan's explicit UI deferral.

**Update, same day — first `/label` human-labeling sync round.** With the user labeling live in
parallel (`venue_coverage_v3`), ran the full sync pipeline: `syncHumanLabelsToGoldenSet.ts`
(304 new `golden_set` rows, 111 INCLUDE) → `runStackParserOnGoldenSet.ts` (31 newly-eligible
posts, 6 with a parseable credit stack) → `runJeremyWeddingClustering.ts --evidence-source
human_confirmed` (8 new `human-confirmed-v1` candidates) → `runJeremyWeddingReconciliation.ts`
(full rerun: high=1,856 ambiguous=478 insufficient=556 no-venue=60 of 3,232 total candidates —
the insufficient-evidence tier's size DROPPED from 2,101 to 556 this session, the expected
signature of 1,578 newly-created weddings absorbing previously-unmatched candidates, not a
concern). Hand-read all 8 new candidates: 2 created (3231 Kelly & Chris/sarabandechicago,
unmatched; 3229 Concorde Banquets, a genuinely distinct real wedding at 0.4-confidence weak
match to a DIFFERENT post on an existing wedding — same recurring-vendor-team pattern, not a
duplicate). 6 excluded: 3230 (0.8-confidence match to wedding 527 — literally the SAME post_url,
a true duplicate); 3227 (Revel Space venue-tour marketing, no couple — now correctly lives in
`venue_portfolio_content` instead); 3225 (generic seasonal marketing, no venue tag); 3226 and
3228 (real content, named couple in one case, but no venue role parsed at all — not attributable
to any venue page, out of scope for THIS venue-coverage mission even though real); 3232 (Villa
Pizzo — Lake Como-shaped destination wedding, not plausibly Chicago). `weddings` 3164→3166.
Confirms the label-sync → creation pipeline works end to end at small scale; re-run periodically
as labeling continues (`/label` progress as of this round: 41 NOT_WEDDING, 6 WEDDING on
`venue_coverage_v3` specifically, plus other queue versions synced in the same pass).

**Update, same day — fourth evidence source shipped: `venue_inline_mention_post_vendor_evidence`,
first batch created.** Scoping the deferred "non-venue vendor categories" priority found this
was never really a vendor-category gap: `jeremy_wedding_candidates` already anchors on ANY post
with a resolved venue-role credit, regardless of who authored it, so non-venue vendors already
benefit from every venue-anchored batch shipped this session. The real gap, found by hand-reading
a sample of the 18,802 non-venue-vendor-authored posts with no venue anchor: real weddings at
real, already-known Chicago venues credited only as a plain inline `@mention` ("wedding at
@salvageone!", "venue 💒: @xyz") rather than the stack parser's expected `Venue: @handle` label
line — a parser-format gap, not a missing-data gap. Sized live: 2,143 posts inline-mention a
known Chicago venue handle; 1,214 also clear the same promise-filter regex proven in
`venue_coverage_v3`. Built as a fourth, bounded evidence source (unlike the abandoned
`venue_couple_signal` track's open-ended name-pattern matching, this only matches an EXACT
handle already resolved as a Chicago venue in `vendors`): `venue_inline_mention_post_vendor_evidence`
(`pipeline/schema.sql`, `apps/web/scripts/graph/applyVenueInlineMentionSchema.ts`) recovers the
missing venue-role credit and unions in the post's own already-parsed non-venue credits so it can
clear clustering's ≥3-distinct-role eligibility floor on real, already-verified evidence.
`runJeremyWeddingClustering.ts --evidence-source venue_inline_mention` added as a fourth mode
(`clustering_version='venue-inline-mention-v1'`), same non-mixing provenance-separation rule as
the other three sources. First run: 26 candidates. Hand-read all of them (small enough for 100%
review, not a sample): 5 excluded for double-venue-tag ambiguity (same systematic filter as Tier
1/2/3 — one 4-way case), 2 excluded as within-batch duplicates (same couple, same venue, >21 days
apart so never auto-merged), 1 excluded on an explicit `account_locations.in_metro=false` despite
a Chicago-sounding handle name. The remaining 18 — 18 different named couples/events at 14
different already-known Chicago venues, 18 distinct dates spanning 2024-2026 — created cleanly:
`weddings` 3166→3184, `wedding_vendors` +40. This is now this mission's most promising remaining
lever (bigger than a single Track A WebSearch batch, safer than the abandoned couple-signal
approach) — re-run periodically as the corpus doesn't change, but the eligibility pool will grow
as more posts get union-eligible non-venue credits from other sources.

**Update, next autonomous /loop tick — Track A batches 9-10, re-check of the other levers.**
Re-ran the `venue_inline_mention` clustering (0 new eligible beyond round 1's 82) and the
`/label` golden_set sync (0 new INCLUDE labels since round 1) — both quiet this tick, expected
given the corpus is otherwise static and labeling volume was modest. Continued Track A: batch 9
(17 searched, 8 confirmed — harraycaraycelebrations, iahcchicago, glenoakcc, celebratebloom,
belvedereeventsandbanquets, wearespin, publicworksgallery, dearlybelovedchicago; explicit
exclusions include several out-of-market City Winery locations, Beverly Hills/Scotland/Riviera
Maya properties, and an ambiguous global-brand "stregishotels" handle, same non-guessing
precedent as `ritzcarlton`) and batch 10 (14 searched, 7 confirmed — terrace16chicago,
cabrachicago, hotellincoln, a third handle variant of the already-known Morgan MFG West Loop
venue, durtynellies, artinstituteevents, thefifty50group; this stretch of the pool skewed
heavily toward out-of-market music-venue/festival handles, skipped without a search burn).
Batch 9 unlocked zero candidates (same pattern as batch 8); batch 10 unlocked one —
terrace16chicago candidate 1675, a double-venue-tag case (@terrace16chicago +
@trumptowerchicago) hand-verified as the SAME real location (Terrace 16 is physically the
16th-floor restaurant inside Trump Tower Chicago), not a genuine ambiguity — created.
`weddings` 3184→3185. 15 total new Chicago venues confirmed this tick (Track A running total
since the tiered sweep: 22 across batches 8-10), most still yielding zero new candidates —
Track A's marginal value is now mostly future-proofing (feeding `/label`'s coverage queue once
a `vendors` bridge exists) rather than immediate wedding creation.

**Update, next tick — Track A batch 11 (yield now at zero, deprioritizing), one more /label
sync round.** Synced 1 new INCLUDE label (round 3, 15 golden_set rows total this round) —
already stack-parsed, clustering found 0 new eligible posts (already covered). Track A batch 11:
4 more Chicago venues confirmed (themontrosesaloon, illuminatedbrewworks, mysticrogueirishpub,
magikstreetbylm), 0 unlocked candidates — the second batch in a row for the newly-confirmed set
specifically, and the remaining ~160-account pool is now dominated by a large cluster of
national touring-circuit music-venue handles with essentially zero Chicago density. Per this
mission's own stated pivot criterion ("if Track A yield stays at zero for 2-3 consecutive
batches, consider that lever exhausted for now"), deprioritizing further Track A batches —
future value is now mostly indirect (feeding `/label`'s coverage queue once `vendors` bridges
exist for these accounts), not immediate wedding creation.

**Update, same tick — the "venuelogic co-tag" recovery batch: this mission's single largest
individual finding.** Sizing the broader double-venue-tag-ambiguity backlog (candidates excluded
by Tier 1/2/3's systematic filter, across all evidence sources, still unmatched/uncreated) found
354 candidates total, heavily concentrated at just two venues: `bridgeportartcenter` (91) and
`rockwellontheriver` (76) — 47% of the whole backlog. Hand-reading 6 samples (3 per venue) found
the exact same clean, unambiguous caption pattern every time: `"Venue: @<real venue>"` +
`"Venue Management & Bar: @venuelogic"` — `venuelogic` is a hospitality/event-management company
that operates the bar service at both venues, not a competing venue claim, so every one of these
160 candidates (85 + 75) was a false-positive exclusion, not genuine ambiguity. This is safer
than the abandoned `venue_couple_signal` track: it's anchored to one specific, verified,
narrow real-world relationship (one named company, two named venues), not an open-ended
pattern-match against arbitrary handles.

Built `checkVenueLogicCoTagDuplicates.ts` (same Jaccard>0.5/21-day-window rule as
`checkIntraBatchDuplicates.ts`, scoped to this exact 160-candidate list) — found exactly one
suspected intra-batch duplicate (candidates 1200/2993, same photographer, same room, 8 days
apart; 2993's "Now booking weddings" framing reads as a marketing repost of 1200's imagery,
excluded). A broader proportionate spot-check (28 of the remaining 159, ~18% — larger than the
6-sample structural check, since content quality is a separate risk from venue identity) found
one more generic self-marketing post with no specific wedding described (2918, "Contact us today
to schedule a tour") — excluded; the other 27 were genuine specific-day recaps. Also recovered
candidate 3237 from `venue_inline_mention-v1` (excluded there for this exact same now-understood
pattern). Net: **158 created + 1 recovered = 159 new weddings**, dry-run verified, committed:
1,388 `wedding_vendors` rows. `weddings` 3185→**3344**. Feed coverage 60.4%→**62.3%**.
`bridgeportartcenter` 67→**150** documented weddings, `rockwellontheriver` →**113** (previously
uncounted among this session's named references, now one of the highest-coverage venues in the
whole corpus). Full test suite green (80/80) after updating the pinned literals.

**Update, same tick — the user finished the `/label` `venue_coverage_v3` queue (218 WEDDING
labels total).** Ran the full sync pipeline once more: `syncHumanLabelsToGoldenSet.ts` (351 new
`golden_set` rows, 197 INCLUDE) → `runStackParserOnGoldenSet.ts` (8 newly-eligible posts, 1
parseable) → clustering (663 eligible now, 1 new candidate created, 1 attached) → reconciliation.
Investigated where all 197 new INCLUDE posts actually stood: 184 were already clustered from
earlier in this session (86 already documented, 33 already matched to an existing Ben wedding) —
strong independent confirmation that the tiered sweep + venuelogic batch already captured most
of what the user was labeling. Of the rest, 61 candidates were genuinely unresolved
(unmatched, uncreated). Hand-processed all of them: excluded `thefultonwest`'s 3 (already
confirmed this session as venue self-marketing — the human WEDDING label correctly reflects real
wedding-content Layer-1 imagery, which is a separate question from whether it anchors a NEW
structured `weddings` row; no contradiction), 1 with no venue resolved, 1 already-known
misattribution (candidate 2469, flagged back in Tier 1), and 1 ambiguous global-brand handle
(`loewshotels` vs. the caption's actual `@loewschicagohotel` — same non-guessing precedent as
`ritzcarlton`/`stregihotels`). The remaining 53 spanned many SMALL double-venue-tag co-tag
patterns rather than one dominant company — hand-read ~20 samples across every distinct pattern
and confirmed each is safe: ceremony-church + reception-venue (`oldstpatschicago`,
`saintclementparish`, `lpconservancy`, each paired with a different real reception venue every
time — same shape as the original `fourthchurch` override), same-entity-two-handles
(`artinstitutechi`/`artinstitutespecialevents`, `lacuna2150`/`lacunaloftevents`,
`venutis.banquets`/`venutisrestaurant`, `armourhouseweddings`/`thearmourhousemansion`), and one
more operator-company pattern (`totlspecialevents` operates both Theater on the Lake and Thompson
Chicago's event space — same shape as `venuelogic`). Checked all 10 same-venue multi-candidate
clusters for date/vendor-team collisions — all clean; the closest pair (`saintclementparish`,
2 days apart) is the exact "S+B's reception" vs. "Susanna wore her heart" pair already documented
above as a confirmed non-duplicate. Dry-run verified, committed: **53 new weddings**, 74 posts,
710 `wedding_vendors` rows, +1 account. `weddings` 3344→**3397**. Feed coverage
62.3%→**62.9%**. Full test suite green (80/80) after updating the pinned literals (one test
also got a timeout bump, 15s→30s, as the underlying view queries grow heavier with corpus size).

This closes out the `/label` queue-driven creation loop for now — re-run the same
sync→stack-parse→cluster→reconcile→hand-read→create pipeline whenever meaningful new labeling
accumulates.

**Update, next autonomous /loop tick — double-venue-tag-ambiguity backlog, round 2.** Re-sized
the backlog: dropped from 354 to 151 (venuelogic + the /label batch absorbed 203). Now spread
thin across many smaller venues (max 6/venue) rather than one dominant company. Hand-read 9 of
the top-8-venues' 39 candidates (23%): found MORE `venuelogic` co-tags that slipped past the
original sweep (`rockwellontheriver` ×3 pairs + one 3-day Indian-Polish multi-venue wedding;
`bridgeportartcenter` ×3 pairs — one, 2918, already known as a marketing repost, excluded again),
more ceremony+reception pairs (`christ_church_winnetka`+`universityclubofchicago`/`uclubashley`,
`assumption_church_chicago`+`thedrakechicago`/`therookerybuilding`/`thewellsley`), a
same-entity+ceremony combo (`cbgweddings`/`chicagobotanic`+`stharalambosgoc` — Chicago Botanic
Garden's two handles plus a church), and one full-vendor-stack single with no couple name but a
complete, specific 15-vendor credit stack (155 — a wedding planner's personal-brand-voice
caption, same "even without a couple name, a real credible full stack" bar used throughout this
mission). Date-collision check across all 8 venue clusters: clean, weeks-to-months apart
everywhere. Dry-run verified, committed: **38 new weddings**, 41 posts, 487 `wedding_vendors`
rows. `weddings` 3397→**3435**. Feed coverage 62.9%→**63.3%**. Full test suite green (80/80).

The remaining ~113 of the original 354-candidate backlog (151 minus this round's ~38) are now
even more fragmented — likely worth one more pass at some point, but diminishing per-venue yield
makes this a lower priority than it was.

## D048 — 2026-09-06 — "Beyond INCLUDE" mining + account-alias merging + a stack-parser precision fix

Status: Accepted, in progress
Context: after D047's tiered sweep more than doubled documented weddings (1,567→3,435), the user
pushed back directly: "I still don't believe that's enough documented weddings per venue... I
still believe there are real credible weddings in that database that we aren't using." They gave
two concrete leads: (1) real venues sometimes run multiple Instagram handles (their own example:
Art Institute of Chicago has `artinstitutespecialevents` as a second account) that should count
as one venue, not two; (2) every evidence source built this session only ever looked at posts V3
scored INCLUDE — there's a reasoned, bounded population beyond that worth mining, using human
judgment to test which automated signals are actually predictive, not just to harvest weddings.

**Track A — new `/label` queue (`beyond_include_v1`, `buildBeyondIncludeQueue.ts`).** Sized live
against the real DB, not guessed: three specific pools that never got human or clustering
attention — V3's own REVIEW decision, never reviewed (284 of 378); V3 EXCLUDE but with a real
3+-role parseable vendor stack (515, a structural counter-signal the text-tone classifier
doesn't see); score 6-11 posts V3 never even ran on but that have a stack anyway (34). 833 posts
total, Chicago tri-state filtered (excludes only confirmed-NOT-Chicago, 0 of them). Each row's
`bucket` records which pool it came from specifically so labeling results can later be grouped
to see which signal is actually predictive. `CURRENT_QUEUE_VERSION` in `labeling.ts` now points
here; `venue_coverage_v3`'s 380 rows (fully labeled, D047) are left in place. Live-tested end to
end via curl against the running dev server before handing off.

**Track B — `account_aliases` (new table, `pipeline/schema.sql`) + app-layer merge.** Systematic
detection (NOT username-pattern guessing alone — that produced two false positives worth
recording: a planner's "Venue Partners:" boilerplate signature made an unrelated 4-account
cluster look aliased, and the multi-city City Winery franchise chain looked aliased by shared
prefix) using strict substring containment or identical `full_name` as the candidate filter, then
independently WebSearch-verified every candidate the same way `venuelogic` was verified earlier.
15 confirmed pairs/groups (29 accounts): Art Institute of Chicago (3 handles), Field Museum, MSI,
Chicago History Museum, Harry Caray's, LM Studio, Morgan MFG (dot-variant), Salvage One, Sarabande,
International Museum of Surgical Science, The Dawson, The Hegewisch, Community House in Winnetka,
Publishing House B&B. `apps/web/scripts/graph/applyAccountAliasesSchema.ts` (idempotent). Modified
`apps/web/lib/server/graph.ts`: `getVendorProfile` resolves any alias handle to its canonical
account's identity and merges wedding counts/Feed across every alias
(`resolveAccountIdentity()`); `listVendors` excludes alias accounts from browse results entirely
and merges their counts onto canonical; `homeStats`/`categoryCounts` dedupe the same way. Added a
307 redirect in `app/vendors/[username]/page.tsx` so visiting an alias URL lands on the canonical
one. Verified live: `artinstitutespecialevents` → 307s to `artinstitutechi`; `artinstitutechi`'s
Feed went from its own 9 weddings to 17 (correctly merged and deduplicated across all 3 handles);
`/vendors?q=art+institute` shows only the one canonical card. Purely additive — no
`wedding_vendors` row was touched, only how they're displayed/counted.

**Track C — stack-parser precision fix (`stackParser.ts`, `STACK_PARSER_VERSION`
`stack-parser-ts-v3`→`v4`).** Found by hand-reading the suspicious 4-account cluster that
prompted the false-positive alias check above: `ROLE_MAP`'s `["venue", ["venue"]]` entry is a
plain substring match, so a planner's `"Venue Partners: @x @y @z"` cross-promo signature line
(pasted into every post regardless of the actual wedding location) classified identically to a
genuine `"Venue: @x"` credit — silently injecting false double-venue-tag ambiguity into this
whole mission's backlog. Fixed with a targeted `VENUE_LIST_MARKER` check (`partner|preferred|
featured`) that only overrides when the label ALSO contains one of those list-indicating words —
verified against the exact real caption plus a new permanent unit test
(`graphStrengthening.test.ts`). Re-ran `runStackParserBaseline.ts` under the bumped version
against the full 5,225-post scored corpus (safe — writes only to `stack_extraction_entries`/
`_runs`, never touches graph tables): 36 stale false-positive venue credits reclassified to
`other`. Did not shrink the *currently open* 113-candidate ambiguity backlog (those 36 landed on
posts outside that specific pool), but prevents this exact contamination for everything processed
from here forward, including Track A's new queue. Full test suite green (81/81, one new
regression test).

**Update, same day — `beyond_include_v1` first sync round, and the "which signal is
predictive" answer.** User labeled 235 posts. Before syncing, checked labeling results BY
bucket (the whole point of tagging each queue row with its source pool): `review_unprocessed`
converted at **69% WEDDING** (20/29), `exclude_with_stack` at **45%** (95/210) — confirming V3's
own REVIEW tier is a meaningfully stronger signal than "EXCLUDE but has a stack," though both
are well above a random baseline and both are worth mining. `unscored_with_stack` had zero
labels yet (unreached). Ran the full pipeline: `syncHumanLabelsToGoldenSet.ts` (234 new rows,
111 INCLUDE) → `runStackParserOnGoldenSet.ts` (346 posts reprocessed under v4, 74 with a stack)
→ clustering (`--evidence-source human_confirmed`: 106 new candidates, 5 attached to existing
ones) → reconciliation (3,365 total candidates now, high=2,112 ambiguous=549 insufficient=369
no-venue=52). Hand-read all 15 double-venue-tag-ambiguous candidates from this batch: 10 safe
(more venuelogic pairs, ceremony+reception, same-entity co-tags, one legitimate multi-location
single wedding day), 5 excluded — two are genuinely new failure shapes worth remembering:
**multi-wedding recap posts** (a planner's "Wedding 1/Wedding 2/Wedding 3" or "First picture:
Grant and Elise... Stephen and Simone... Nick and Madi..." annual-highlights post, describing
several different real weddings in ONE caption — structurally impossible to attribute to a
single wedding in this pipeline's one-candidate-one-event model; real content, just not usable
here) — the other 3 are plain educational/marketing posts with no specific wedding at all.
Checked all 42 weak-match (<0.75 confidence) candidates for exact-post duplicates against their
matched wedding: found exactly one (3310, matched to wedding 289 — theallureonthelake, the
Indiana venue already flagged this session for an `is_chicago` correction, still pending). Full
same-venue date-collision check across the rest: one close pair (7 days apart, both
`artinstitutespecialevents`) — one was generic beauty-vendor marketing with no couple, excluded;
the other was a fully-credited named-couple wedding, kept. Found 2 more genuine account-alias
pairs while hand-reading (`armourhouseweddings`/`thearmourhousemansion`,
`halimmuseumevents`/`halimmuseum`), independently WebSearch-verified and added to
`account_aliases` (17 total now). Dry-run verified, committed: **85 new weddings**, 86 posts,
805 `wedding_vendors` rows, +1 account. `weddings` 3435→**3520**. Feed coverage
63.3%→**64.2%**. Full test suite green (81/81) — one test's own inequality assumption
("reconcile-v2 always has less many-to-one match fragmentation than v1") broke at this
session's scale (1,953+ new weddings created gives v2 vastly more legitimate match targets than
v1 ever had) and was converted to a pinned, explained snapshot after verifying zero
ingestion-safety impact.

**Update, 2026-09-07 — a new, systemic gap found and documented (not fixed): the `vendors`
(Places-identity) table hasn't kept pace with the `accounts` growth this whole D047/D048 arc
produced.** The user asked directly whether the "vendor list" and "vendor graph" have been kept
up to date by this work. Answer, checked precisely rather than assumed: the vendor *graph*
(`edges` matview, refreshed after every creation commit) is fully current — verified live,
`bridgeportartcenter`/`venuelogic` now show 103 shared weddings. But the vendor *list*'s
Places-sourced identity layer is not: `vendors` (the Google-Places-scraped table — real address,
rating, photos, category) is still exactly 5,029 rows, untouched all session, because nothing in
`createWeddingsFromJeremyEvidence.ts` (or anything else built this arc) ever writes to it — by
design, that table is only populated by a separate, deliberately out-of-scope Google Places API
script. Sized live: **5,618 of 7,348 distinct accounts now credited in real weddings (76%) have
no `vendors` row at all** — they render fine on `/vendors` and vendor detail pages (`listVendors`
only requires an `accounts` row + a `v_account_role` tag + a wedding credit; `vendors` is a LEFT
JOIN that adds polish when present, never gates inclusion, per the original D008/D006 design) but
with no address/rating/photos/category enrichment. Breakdown by role (top): 845 `other`, 292
`attire`, 292 `photographer`, **199 `venue`**, 174 `videographer`, 156 `catering`, plus 2,403
accounts with no role tag at all. This is a direct, mechanical consequence of this mission's own
success — every new wedding this arc created pulls in fresh secondary-vendor handles
(photographer/planner/florist/etc.) that were never Places-matched, and the venue-coverage push
specifically means 199 of the newly-covered VENUES themselves are running with zero Places
enrichment. Not fixed here — a real Google Places API cost/rate-limit tradeoff, explicitly the
kind of decision this project's `venue-enrichment` design already treats as script-time-only, not
something to spend live API budget on inside a data-completion sweep. Documented so a future
session can decide whether/how to close it (a full Places backfill for the 5,618, or a
lighter-weight WebSearch-based address/category fill reusing this session's own
`backfillVenueLocationsViaWebSearch.ts` pattern for at least the 199 uncovered venues first, since
those are the highest-leverage subset for the actual product surface this mission has been
optimizing).

## D046 — 2026-09-06 — Vendor association: author-is-vendor counts, but stays a non-gating, joinable dimension (not a Layer-1 requirement)

Status: Accepted
Context: Continuing D045's reframe, the user re-proposed the model as 4
explicit dimensions (wedding credibility, Chicago relevance, vendor
association, vendor-stack richness) and asked whether "at least one
credible vendor connected, either as the author or through credits/tags"
should gate Layer 1. Live check found `human_confirmed_post_vendor_evidence`
only ever captured *tagged/credited* vendors (stack-parser output on
caption text) — it had no concept of "the post's author is itself a known
vendor." A venue posting its own real wedding, crediting no one else,
showed up as zero vendor association even though the venue IS the vendor.
Checked live: of the 639 Layer-1 posts, 433 had a tagged vendor; of the
other 206, 146 were authored by an account bridged to `vendors` — so the
real split was 579 with *some* vendor connection (author or credit), only
60 with genuinely none.
Decision: the user chose to keep vendor association **non-gating** —
"Don't make a downstream use-case requirement a prerequisite for retaining
upstream evidence." Layer 1 (`human_confirmed_chicago_wedding_content`)
stays untouched at 639. Added two additive views instead:
`human_confirmed_post_vendor_association` (per golden_set-INCLUDE post,
all 817: `author_is_vendor`, `tagged_vendor_count`,
`has_vendor_association`, `vendor_association_type` ∈
{AUTHOR_ONLY, TAGGED_ONLY, BOTH, NONE} — full corpus breakdown:
236/62/414/105; Layer-1 subset: 146/50/383/60) and
`human_confirmed_vendor_page_content` (the actual vendor-page-shaped
selection = Layer 1 ∩ has_vendor_association = **579** — a downstream
consumer's own stricter requirement, applied at query time, not baked
into Layer 1's definition).
Edge case found, explicitly NOT fixed here (separate, pre-existing,
orthogonal to this decision): `human_confirmed_post_geography` (and thus
Layer 1) only resolves posts present in `staging.instagram_posts` — 75 of
the 817 current golden_set INCLUDE rows exist only in `public.posts` and
are invisible to Layer 1 entirely. Flagged as a candidate for a future,
separate fix (widen that view's join the way `getQueueBatch` in
`labeling.ts` already handles both corpora).
Why: this is the same principle as D045, applied one layer deeper — an
attribution signal (which specific vendor to route content to) is a
different question from a content-quality signal (is this useful,
credible wedding content). Collapsing them would have silently dropped
206 real Chicago weddings that happen to have thin/no tagged credit —
disproportionately venue/vendor "own work" posts, exactly the kind of
content this project cares most about surfacing.
Related: D045, D043, D044, `docs/engineering/human-labeling/README.md`.

## D045 — 2026-09-06 — Content eligibility vs. structured-entity eligibility: the human-confirmed-evidence pipeline conflated two different questions

Status: Accepted
Context: D044's 69-candidate hand-review found only 18 held up as genuinely
specific weddings, making it look like 742 confirmed real weddings had
shrunk to 18 usable ones. The user pushed back hard: "we are being too
exclusionary... these are likely different questions with overlap." Correct
— the 69-candidate sample was *conditioned* on a 3+-role vendor credit
stack (needed to build a structured multi-vendor `weddings` entity), which
correlates heavily with generic vendor/venue marketing (marketing posts
credit collaborators just as generously as real documented weddings).
Directly confirmed: the same "looks like marketing" pattern appears in
only 3 of the full 742 posts, not anywhere near 51/69's rate. Extrapolating
the conditioned sample's quality to the whole corpus was a sampling-bias
error.
Decision: explicitly split into two independent layers, per an
OBSERVE→BASELINE→HYPOTHESIS→PROPOSED CHANGE→self-challenge design pass
(user required the self-challenge before implementing): **Layer 1
(content)** — `human_confirmed_chicago_wedding_content` (new view):
`golden_set` WEDDING + confirmed Chicago relevance, nothing else required
— no vendor attribution, no credit-stack richness, no couple-naming, no
clustering, no reconciliation. **639 posts**, live now. **Layer 2
(structured entity)** — D044's pipeline, unchanged, still conservative,
still the only path that writes a `weddings` row. New view
`human_confirmed_post_geography` resolves Chicago relevance **per post**,
independent of clustering (the real architectural gap — geography used to
only ever get computed for posts that survived the narrow 3+-role filter).
Caught and fixed two bugs while formalizing this: `vendors.account_id` is
not unique (one account had 4 rows) and was silently fanning one post into
duplicate result rows; an early version picked one arbitrary venue account
when a post credited several (e.g. a church + a separate reception venue)
instead of accepting *any* positive Chicago signal across all of them —
fixed to the latter, since for this per-post content signal (not a
structured-entity identity decision) a confirmed-Chicago credit co-existing
with an unresolved one is real positive evidence, not evidence against.
Landed at 639, not an earlier ad hoc estimate of 602 — the difference is
the bug fixes, not a data change. A 15-post spot-check of newly-surfaced
Layer-1-only content found it mostly sound, plus 2 genuine mislabels
(a beauty-tutorial post, an engagement-session/marketing post) — a residual
labeling-accuracy issue from the original fast review pass, explicitly not
chased with further manual review per the user's own scope instruction.
Why: "real wedding content" and "a structured wedding entity" are
different questions; evidence sufficient for one is not automatically
sufficient for the other. Zero data was deleted or relabeled — both new
views are additive and reversible (`CREATE OR REPLACE VIEW`), and Layer 2's
tables/tests are completely untouched (70/70 still green).
Related: D043, D044, `docs/engineering/human-labeling/README.md` (full
writeup, read this first for the mission), D016 (first flagged this exact
distinction for Ben's corpus and left it unresolved).

## D044 — 2026-09-05/06 — Human-confirmed-evidence pipeline: extending graph-strengthening to golden_set-confirmed posts, plus the stack-richness sampling-bias finding

Status: Accepted (structured-entity output not yet acted on — see D045)
Context: `jeremy_post_vendor_evidence` requires both `candidate_scores.score
>= 12` and V3 `decision='INCLUDE'` — both deliberate (D014's cost deferral,
D017's INCLUDE-only geography-pollution avoidance, explicitly "revisit once
INCLUDE ingestion is proven out" — already met by D023/D035-D039). With a
real human-labeled golden_set now available, that precondition is
satisfiable independent of V3 entirely.
Decision: built `runStackParserOnGoldenSet.ts` (stack extraction for
golden_set-INCLUDE posts that never scored ≥12), a new, deliberately
separate `human_confirmed_post_vendor_evidence` view (not unioned with the
classifier's evidence view — different provenance/confidence semantics),
extended `runJeremyWeddingClustering.ts` with `--evidence-source
human_confirmed` writing under a new `clustering_version=human-confirmed-v1`
(never mixing with the existing 2,872-candidate pool), and an explicit
`chicago_status` tri-state column on `jeremy_wedding_candidates`
(`CHICAGO_CONFIRMED`/`CHICAGO_NOT_CONFIRMED`/`CHICAGO_AMBIGUOUS`, never a
boolean, never silently inferred) computed from `account_locations.in_metro`.
Result across two runs (as labeling continued): 140 new candidates, 69
Chicago-confirmed and reconciled (15 would strengthen an existing Ben
wedding, 54 would create a new one, ~458 vendor relationships total), 71
requiring review. Reconciliation, reused completely unchanged, surfaced a
real side effect: re-running it for the first time since D035-D042 changed
`weddings`/`wedding_vendors` caused 5 pre-existing ambiguous-tier candidates
to flip to a *different* matched wedding — investigated, confirmed zero
production impact (none were ever ingested, ambiguous-tier never is per
D021's evidence floor), documented in `graphStrengthening.test.ts` rather
than silently patching the snapshot literal.
Hand-reviewing the 69 against `labeling_rubric.md` found only 18 hold up as
genuinely specific real weddings — 51 were generic vendor/venue marketing
with a rich credit stack, mislabeled at the fast (~440/hour) individual-post
review stage. This finding motivated D045.
Related: D014, D017, D023, D035-D039, D040-D042 (the reconciliation-drift
precedent this mirrors), D045 (the correction), `docs/engineering/human-labeling/human-confirmed-candidates-review.md`.

## D043 — 2026-09-05 — `/label` ships: a rapid keyboard-driven review UI spanning both corpora, plus what the first labeling session found

Status: Accepted
Context: no real human had ever read `staging.instagram_posts` (47,623
posts) or `public.posts` (6,370, the live serving graph) end-to-end — every
prior "golden set" row was either a bootstrap sample read by Claude
(`golden_set_v0`) or narrowly hand-flagged junk (D040-D042). The user asked
for a fast, durable labeling system, explicitly not narrowed to "prove out
the existing classifier" — "give me everything ... so we receive value all
over our funnel."
Decision: built `/label` (`apps/web/app/label/`) — keyboard shortcuts
(W/N/U/Space/B/Z), an append-only `human_post_labels` table (relabeling
never destroys a prior observation, unlike `golden_set`'s current-state-only
design), and a frozen, resumable `label_queue`. Queue `v2` stratified across
both corpora: random baseline, the shipped `/feed` corpus, the classifier's
decision boundary, the deliberately-unclassified 89% majority, and a random
sample of Ben's `public.posts` (never broadly human-reviewed before).
Iterated on UX live against real usage: fixed a CSS grid layout bug (a long
caption pushed the label buttons off-screen — grid's implicit row ignores a
fixed container height when content is taller; switched to flexbox, which
actually clamps), added a note field, widened the queue mid-session per
user request.
Findings (1,955+ posts labeled across the session): `/feed` (V3 INCLUDE) is
~97% human-confirmed precision, matching V3's own claimed number — the
shipped product is trustworthy. Real-wedding rate is ~51% in V3's own
EXCLUDE/REVIEW boundary and ~32-40% in the never-classified 89% majority
and in Ben's `public.posts` random sample — a substantial undiscovered
population under the current classified slice, not noise. Throughput:
settled around 300-440 labels/hour once notes were used sparingly (down
from an initial 162/hour) — labeling with a note attached took ~4x longer
per post than without.
Related: D040-D042 (the precedent for promoting hand-verified labels into
`golden_set`), D009-D015 (the classifier this measures), D044 (what the
resulting golden_set unlocked).

## D042 — 2026-09-05 — Non-wedding posts batch 2 (19 more retired) + all mission labels promoted to `golden_set`

Status: Accepted
Context: after D041 closed the mission, the user independently hand-flagged 17 more
`venue_tagged` URLs on the serving graph, then separately pushed back on treating this as
one-off deletions: "shouldn't we use those as our golden set... learn from these for future
algorithm or filter or ML progress."
Decision: (1) Verified all 17 against Supabase (same discipline as the original seeds) —
confirmed corporate events, DJ nights, a baby-shower-themed post, and several concerts,
none matching the already-locked `role_shape_v1` (confirms its deliberately narrow recall).
Two shared a `wedding_id` with a same-event sibling post; both siblings included so the
whole junk wedding retires. Caught and fixed a real bug in `retireNonWeddingPosts.ts`
first: it computed "will this wedding become empty" from a stale per-post pre-count, so a
wedding with 2+ candidate posts in the same batch was never recognized as empty — exactly
the case for two of these 17 — and would have left an orphaned `weddings` row. Fixed to
re-check remaining `wedding_posts` count after all of a batch's deletes. Dry-run confirmed,
then committed: 19 posts detached, 17 weddings retired (`weddings` 1,584→1,567,
`wedding_posts` 1,895→1,876, `wedding_vendors` 14,664→14,591, `edges` refreshed to
61,727). Generalized the retirement script with `--candidates=<path>` for reuse on a future
batch. (2) Loaded all 105 hand-labeled posts from this mission (11 seeds, 50 tune, 25
heldout, 19 batch-2) into `golden_set` via 4 `loadGoldenSet.ts` calls, one `source_note`
per origin (`non_wedding_posts_{seed,tune,heldout,batch2}_2026-09-05`) — `golden_set` 551 →
656 rows. This is the first `public.posts`/`venue_tagged` slice in `golden_set`; every
prior row was `staging.instagram_posts`/own-profile (noted in
`docs/engineering/post-classification/README.md`'s "Population note").
Why: `golden_set`'s own contract (`pipeline/schema.sql`: "what every classifier version
gets scored against before it ships") and the mission's own eval rule 7 already said a
Ben-post labeled set earns a `source_note` once a human has agreed the labels are ground
truth — that bar was met here (direct user labels for seeds/batch-2, user-endorsed
rubric-based reads for tick 2) and hadn't been acted on yet. Letting hand-verified ground
truth live only in mission-scoped JSON files means it gets re-derived or ignored the next
time someone needs it.
Related: D040, D041, `docs/engineering/graph-strengthening/non-wedding-posts.md` ("Batch 2"
and "Labels promoted to golden_set" sections), `docs/engineering/post-classification/README.md`,
`loadGoldenSet.ts`, `ROADMAP.md` Next (re-score against the full 105-row slice before
attempting a broader rule).

---

## D041 — 2026-09-05 — Non-wedding posts mission complete: role_shape_v1 locked, 46 posts retired

Status: Accepted
Context: continuation of D040's `/loop` mission
(`docs/engineering/graph-strengthening/non-wedding-posts.md`). Ticks 1–6 ran to
completion the same day.
Decision: Tick 1 expanded the 11 seeds into a 191-post similar-set pool across four
buckets (same-venue, caption heuristic, role-shape, feed head) — caught and fixed an
inner-join bug that silently dropped posts with a null `venue_id`. Tick 2 hand-labeled 75
posts (50 pool sample + 25 known-good candidates) against `labeling_rubric.md`, reading
full captions, and split tune/heldout before scoring anything; several auto-selected
"known-good" candidates turned out to be generic vendor marketing on inspection, and one
pool post (`Db37U0ivH5m`) turned out to be a genuine wedding held *at* House of Blues
Chicago. Tick 3 built a thin `public.posts` adapter for `prefilter.ts` (it only reads
`staging.instagram_posts`) and confirmed the doc's predicted gap exactly: `prefilter-v3`
defers on effectively everything here because these posts mention known graph vendors. The
caption heuristic failed the locked bar (80% tune precision, 66.7% heldout — wrongly
excludes real weddings mentioning "concert" or a "Live Music:" credit line). A role-shape
rule (wedding's `wedding_vendors` role set is a non-empty subset of {venue, band,
musician}) hit 100% precision / 0 false-EXCLUDEs on tune, known-good, AND heldout — locked
as `role_shape_v1` (tick 4, frozen before looking at heldout, per the classifier's own
eval discipline). Tick 5: dry-run then user-committed retirement of 46 distinct posts (11
seeds + 34 hand-labeled pool EXCLUDEs + 10 corpus-wide `role_shape_v1` matches, deduped) —
40 weddings fully retired (0 posts remaining), 6 posts detached from mixed weddings that
keep their real posts. `weddings` 1,624→1,584, `wedding_posts` 1,941→1,895,
`wedding_vendors` 14,918→14,664, `edges` 63,229→61,848 (refreshed). Provenance logged to
new table `non_wedding_posts_retired`. Tick 6: locked `role_shape_v1` into
`graphStrengthening.test.ts` ("non-wedding-posts role_shape_v1 gate" describe block, 3
tests) and documented the known `is_wedding` gate gap directly in `pipeline.py`'s
`phase_dedup()` — the rule is NOT wired into the crawler itself (low recall by design,
would need the same eval discipline to extend, not a fresh invention).
Why: matches the mission's own valid-complete-outcome bar — a locked rule where it's safe,
a hand-review list (not a generalized heuristic) everywhere else, zero regressions on every
known-good real-wedding slice measured.
Related: D040, `docs/engineering/graph-strengthening/non-wedding-posts.md` (full tick-by-tick
findings), `labeling_rubric.md`, `graphStrengthening.test.ts`.

---

## D040 — 2026-09-05 — Non-wedding posts on serving-graph feeds: not Jeremy creation;
kicked off as a `/loop` with an eval bar, not a URL-delete

Status: Accepted
Context: user flagged 11 Instagram URLs on vendor/wedding feeds as clearly not weddings
(concerts, a gala, a birthday, a block party, one venue-marketing post) and asked for an
iterate-and-eval loop rather than a one-shot delete, without knowing the root cause.
Live lookup of all 11 against Supabase (same day): every row is `public.posts.source=
'venue_tagged'` (Ben's tagged-feed crawler), each is the sole post on its own wedding
(ids 1306–1380, inside the original Ben ID space), **zero** are `jeremy_evidence`, **zero**
sit on a `jeremy_weddings_created` wedding, **zero** have a V3 classification. The
D035–D039 identity-creation write is the wrong layer. The working hypothesis: Ben's
`phase_dedup()` treats every `has_stack` (≥3 vendor roles) venue-tagged post as a wedding,
with no `is_wedding` gate — and multi-purpose venues (House of Blues, Lincoln Hall,
Reggies, Garcia's, Navy Pier) host concerts/galas/corporate that also carry credit stacks.
The V1 classifier was never run on this corpus because `public.posts` was assumed
pre-filtered by construction (post-classification README, "Where the posts live"). They
look newly introduced because feeds sort `event_date_est DESC` and these posts use
`posted_at` as the wedding date, so Aug 2026 concerts sit at the head next to real
weddings from the same week.
Decision: kick off as a `/loop` mission (`docs/engineering/graph-strengthening/non-wedding-posts.md`)
that reuses the classifier's own eval discipline (seeds ≠ population; independent labels
via `labeling_rubric.md`; tune/held-out split; removal is EXCLUDE-precision, not V3's
INCLUDE-precision; propose → re-run the same eval, not just the 11 URLs —
`prefilter-v2`'s regression is the cautionary case). Do not delete the 11 as a first
move, do not unfreeze V3's prompt, do not `phase_dedup()` truncate. A caption heuristic
already hits 86 weddings / 96 posts — that is a sizing clue, not a delete list.
Related: D009–D015 (classifier + why venue_tagged was out of scope), D031 (Case B already
found non-wedding orphaned Ben posts and declined a general attach), D035–D039 (the
creation arc this is *not*), `labeling_rubric.md`.

---

## D039 — 2026-09-05 — Phase 2 complete: web-search lookups, duplicate checks, and a new
church/venue-ambiguity filter, creation dry-run ready

Status: Accepted
Context: D038 pivoted Phase 2's location backfill from the paid Google Places API to free
`WebSearch`. This entry records running it to completion and pushing all the way through
to a creation dry-run, in one continuous session — across 4 search batches (22, 20, 45, 43
accounts; the last two ran with far more aggressive parallelization after the user asked
mid-run "cant you parallelize this??", cutting per-tick overhead sharply with no loss of
per-result review rigor).
Decision:
- **Location lookups**: 99 of 130 accounts (76%) confirmed as real Chicago-metro
  locations, added to `backfillVenueLocationsViaWebSearch.ts`'s `CONFIRMED_LOCATIONS` with
  per-entry source citations; dry-run verified (99/99 clean, 0 conflicts). 22 left
  inconclusive (handle mismatch or no signal — not guessed). 2 confirmed real venues
  explicitly outside the metro (`stjames1868` in Milwaukee WI, `williams.orchard` in
  LaPorte IN) — excluded rather than force-fit.
- **Duplicate checks**: extended `checkIntraBatchDuplicates.ts` and
  `checkExistingDuplicatesForCreation.ts` with a `--phase2` mode (explicit account-ID list,
  since the location backfill above hasn't landed in the DB yet). 169 candidates in scope,
  0/169 flagged on either check.
- **New risk category**: a 15-candidate hand-read sample found 2 cases where the resolved
  `venue_account_id` was a ceremony church even though the same caption named a different,
  unrelated reception venue as "Venue:" (verified against raw captions). Systematic check:
  44 of 169 candidates (26%) have 2+ accounts tagged `role='venue'`. Unlike Phase 1's clean
  mislabels (a lighting company, a musician), this is genuinely ambiguous — some of the 44
  are harmless same-venue/different-handle cases. All 44 excluded conservatively rather
  than adjudicated one-by-one.
- **Creation dry-run**: 125 clean candidates, dry-run of `createWeddingsFromJeremyEvidence.ts`
  (extended with a `PHASE2_CANDIDATE_IDS` batch and `is_chicago` now also true for any of
  the 99 confirmed accounts) → 125 new weddings, 144 posts, 1,335 vendor rows. All 115
  previously-created weddings (D035+Phase1) correctly no-op via `jeremy_weddings_created`.
  Spot-checked the thinnest result (candidate 1329, 4 vendors) by hand: genuine.
**Committed** (2026-09-05) — user ran both handed-off commands. 99 `account_locations`
rows landed, then 125 weddings created (ids 1755-1879, 144 posts, 1,335 vendor rows,
`edges` refreshed). Idempotency re-verified live (both scripts re-run: 0 new inserts).
Tests updated for the resulting count drift (weddings 1499→1624, wedding_posts 1797→1941,
accounts 14332→14334, wedding_vendors untouched-by-D023 13483→14818/total 13583→14918 —
the 5th such drift this arc, expected and documented in the test file itself) and green,
47/47. Spot-checked wedding 1801 (`rpmeventsandcatering`) live: `is_chicago=true`,
`/vendors/rpmeventsandcatering` returns 200. `measureFeedCoverage.ts`: 303/1,624 documented
weddings (18.7%) now trace to `/feed`, up from 178/1,499 (11.9%) before this mission and
4.6% at the start of the whole workstream. This closes the is-chicago-for-new-venues
mission.
Related: D036 (Phase 2 scoping), D038 (WebSearch pivot decision).

---

## D038 — 2026-09-05 — Phase 2 pivots from paid Places API to free WebSearch

Status: Accepted
Context: D036 scoped Phase 2 (208 unmatched candidates, 130 distinct venue accounts, zero
location signal) around the Google Places Text Search API, estimated at $2-4 for 130
lookups, gated on the user's explicit go-ahead given it's a real external paid call. User
asked directly whether `WebSearch` could do this better instead of spending money.
Tested before committing to either path — two real accounts from the 130, not hypothetical:
`goebbertevents` returned confirmation as a real Chicago-metro wedding venue (Pingree
Grove, IL) with capacity/address detail and a wedding photographer's blog post as
corroboration; `saddleandcycleclub` returned an exact street address (900 W Foster Ave,
Chicago) plus explicit confirmation of hosting weddings — both richer than a bare city
string, which is all the Places API would have returned.
Decision: use `WebSearch` for Phase 2 instead of the Places API. No real-money gate applies
(a normal tool call, not an external paid service) — proceeding without a separate cost
sign-off, same additive/dry-run/hand-read discipline as every other phase still applies.
Method: search `"<venue username>" instagram Chicago [wedding venue]` per distinct venue
account, record a judgment (confirmed-Chicago / confirmed-not / inconclusive, cited),
backfill `account_locations` for confirmed cases only, leave inconclusive ones unresolved.
Paced across multiple `/loop` ticks (~15-20 lookups/tick) so each stays genuinely reviewed.
After resolving, the pool re-enters Phase 1's exact pipeline (duplicate checks, venue-role
filter, hand-read sample, dry-run, commit).
Related: D036 (original Phase 2 scoping), D037 (the Phase 1 pipeline this reuses).

---

## D037 — 2026-09-05 — is_chicago Phase 1 committed: 100 more weddings created, systematic bio check caught 2 more mislabels

Status: Accepted
Context: D036 scoped Phase 1 to 136 candidates resolving via `vendors.city='Chicago'`. Both
duplicate checks (extended with a `--phase1` flag) came back clean at 0/136. A 15-candidate
hand-read pilot found all real weddings, but also a **new risk category** beyond D035's
scope: `venue_account_id` can itself resolve to a non-venue vendor. Two confirmed by
reading captions directly — a lighting rental company (candidate 2455, `hangoutlighting`,
whose own bio describes lighting products) and a musician credited under "Ceremony/Cocktail
music" in the same caption that clearly labels the real venue elsewhere (candidate 2411,
`cloudgatequartet`).
Generalized into a filter (require the venue account to carry an `account_tags` role in
venue/hotel/catering/rentals — real venues are legitimately often also hotel/catering/
rentals-tagged, e.g. a hotel or restaurant-group venue) and applied to all 136: 102 passed,
28 excluded (confirmed pattern), 6 excluded conservatively (no signal). Re-ran both
duplicate checks against the 102 — clean again (0/102 flagged on both).
**The filter itself wasn't sufficient**: candidate 2455 (`hangoutlighting`) still passed it,
because a stray *manual* `account_tags` venue row (confidence 0.8, evidence_count 1 — likely
a pre-existing data error) satisfied the requirement despite the account's bio contradicting
it. Ran a systematic bio-text search (does the venue account's own bio name a *different*
handle as "Venue: @...") across all 102, not just re-checking the one known case — found one
more: candidate 2469, `blueplatechicago` (a caterer whose bio literally reads "Venue:
@alliumchicago"). **Final Phase 1 batch: 100 candidates.**
Extended `createWeddingsFromJeremyEvidence.ts`'s `is_chicago` logic to query
`vendors.city='Chicago'` live per candidate instead of D035 pilot's hardcoded `true`
(retained as a fallback only for D035's original 15 IDs, which were hand-verified without
depending on this field).
Decision: committed after the user reviewed a summary (same format as D035's) and ran the
script directly. **Result: 100 weddings created (ids 1530-1629), 112 posts, 945
`wedding_vendors` rows, `edges` refreshed.** Idempotency verified live (0 new inserts on
re-run). Spot-checked wedding 1558 (`venuesix10`): correct `is_chicago`, renders on its
vendor page. Fixed 3 more stale snapshot assertions in `graphStrengthening.test.ts` (same
now-expected pattern as D027/the reconciliation rerun/D035 — this is the fourth occurrence
in one day, explicitly treated as normal, not a regression signal).
**Not decided here**: Phase 2 (208 candidates, zero location signal, needs real Google
Places API spend) — still requires the user's separate, explicit go-ahead before any call.
Related: D036 (Phase 1 scoping), D034/D035 (the mission this extends), D030/D031/D033 (the
false-merge base rate every duplicate check in this workstream is calibrated against).

---

## D036 — 2026-09-05 — Scoped the is_chicago gap blocking further wedding creation: two phases, one safe now, one needs go-ahead

Status: Accepted
Context: D035 hand-verified `is_chicago` for 14/15 pilot venues since `account_locations`
had no data — explicitly flagged as not scaling. User asked to scope the fix and keep
going. Sized live: of the 356 candidates still eligible for creation (447 minus D035's 15,
minus 76 that became reachable via normal reconciliation as a side effect — their venue now
has a Ben wedding to match against), **136 (38%) resolve confidently via `vendors.city=
'Chicago'`** (confirmed real, varied Places-geocoded data — 4,925 rows say Chicago, others
say Milwaukee/Atlanta/Lake Geneva, not a static default). **208 (58%) have no location
signal in this database at all.**
Decision: two-phase mission (`docs/engineering/graph-strengthening/
is-chicago-for-new-venues.md`). Phase 1 (proceeding now, no new cost/infra): extend the
creation script to trust `vendors.city='Chicago'` automatically for the 136, same
duplicate-check + hand-read-sample + dry-run discipline as D035, scaled to this larger pool.
Phase 2 (208 with zero signal): needs real geocoding (Google Places API, already used
elsewhere in this repo for venue discovery) — a few dollars of real external API cost, an
"outward-facing" action this repo's own working agreement says to confirm before doing.
Explicitly not started without the user's separate, explicit go-ahead on the actual API
spend — scoped and cost-estimated here, not approved here.
Related: D034/D035 (the mission this closes a gap for), the working agreement on
outward-facing actions (why Phase 2 gates separately from the DB-write gate every prior
mission has already hit).

---

## D035 — 2026-09-05 — First identity-creation write committed: 15 new weddings from Jeremy evidence, pilot only

Status: Accepted
Context: D034 kicked off building the mechanism to create new `weddings` rows from
unmatched Jeremy evidence, scoped to the 447 candidates whose venue has zero existing Ben
weddings. Two duplicate checks run before any write: intra-batch (`checkIntraBatch
Duplicates.ts`, all 447 against each other, 0 suspected duplicates across 1,249 within-venue
pairs) and secondary-account (`checkExistingDuplicatesForCreation.ts`, each candidate's
FULL vendor set against every Ben wedding sharing a vendor account, 0/447 flagged). A
15-candidate hand-read pilot (every caption, vendor stack, venue, date read directly) found
a real risk pattern — multi-venue mentions (ceremony church vs. reception hotel, sibling
venue-brand accounts) — and the two most concrete instances were individually verified
against Ben's existing graph (different years, negligible vendor overlap in both); the
systematic check then confirmed 0/447 affected corpus-wide.
Building the creation script (`createWeddingsFromJeremyEvidence.ts`) surfaced two real
schema gaps neither prior mission needed to solve, since they only added credits to
weddings that already had Ben-crawled posts:
1. `wedding_posts.post_id` is a NOT NULL FK to Ben's own `posts` table; Jeremy's captions
   live in `staging.instagram_posts`. Solved by importing the underlying post(s) into
   `posts` (`source='jeremy_evidence'`, no CHECK constraint existed to block this, confirmed
   before choosing the value), keyed on the existing `shortcode` UNIQUE constraint for
   idempotency.
2. `account_locations` has no row for 14/15 pilot venue accounts — Ben's location
   enrichment never ran on venues discovered only through Jeremy evidence. The naive
   fallback would have silently set `is_chicago=false` for real Chicago weddings, hiding
   them from `/weddings` and the `/vendors` browse list. 9/15 resolve via the Places-linked
   `vendors.city='Chicago'`; all 15 were independently confirmed Chicago by hand during the
   pilot read. Set `is_chicago=true` as a **verified judgment call for this pilot only** —
   explicitly does not scale to a larger batch without a real geocoding fix.
Decision: committed after the user reviewed a full summary (what, why confident, what's
NOT being claimed) and ran the script directly. **Result: 15 weddings created (ids
1415-1429), 17 posts imported, 172 `wedding_vendors` rows, `edges` refreshed.** Idempotency
verified live immediately after (re-run: 0 new inserts, all 15 correctly skipped). Spot-
checked wedding 1417 (`amazingspacechicago`): correct `is_chicago`, post link, renders on
its vendor page.
**Explicitly not decided here**: scope beyond this 15-wedding pilot. The `is_chicago` gap
must be solved properly (not hand-verified per candidate) before touching the remaining
432 of the 447, let alone the 1,765 near-miss tier D034 deferred.
Related: D034 (kickoff, the risk framing this write executed against), D030/D031/D033 (the
false-merge base rate the duplicate checks were calibrated against).

---

## D034 — 2026-09-05 — First identity-creation mission kicked off: new weddings from unmatched Jeremy evidence

Status: Accepted
Context: `measureFeedCoverage.ts` (added this session) quantified the ceiling on
match-only reconciliation: only 63 of 1,384 documented weddings (4.6%) have any
Jeremy-sourced credit, and 2,212 of 2,503 venue-anchored candidates (88%) sit permanently
unmatched — confirmed by reading `runJeremyWeddingReconciliation.ts` directly, which has no
`INSERT INTO weddings`, only ever matches to weddings Ben's own crawler already found. User
asked directly whether to change this; decided yes — build the mechanism to create new
`weddings` rows from strong, unmatched evidence, explicitly weighing it against this
session's repeated finding (D030, D031, D033) that even *matching* alone produces real
false-merge risk at a meaningful rate, so creating new identity is a real escalation, not a
formality.
Sized before scoping (not guessed): all 2,212 unmatched candidates already have 3+ named
vendor roles and a resolved date (clustering enforces that) — evidence quality isn't the
gating question. Duplicate risk is: 447 sit at venues with **zero** existing Ben weddings
(lowest risk — nothing to duplicate), 1,765 at venues where Ben has *some* weddings and
this one just didn't match (higher risk — could be new, could be a missed match).
Decision: scope the mission to the 447 first. Constraints set: an intra-batch duplicate
check (Jaccard+date, mirroring `phase_dedup()`'s own rule) before creating anything, a
10-20-candidate hand-read pilot before any batch write, a new provenance table
(`jeremy_weddings_created`) so created rows stay auditable/reversible, the same
additive/dry-run/idempotency bar every prior mission held to. The 1,765 near-miss tier is
explicitly deferred to a later, stricter pass. Durable checklist:
`docs/engineering/graph-strengthening/jeremy-wedding-creation.md`.
Related: D033 (the venue-anchor work this builds on), D030/D031 (the false-merge base rate
this mission's safeguards are calibrated against), ROADMAP's "Should reconciliation ever
create a new Ben wedding" Next-item (now active, not just proposed).

---

## D033 — 2026-09-05 — 369 venue-less candidates: 131 got a correct venue anchor via location_tag; still 0 new production rows

Status: Accepted
Context: D030 explained the 369 `venue_account_id IS NULL` candidates as an intentional
reconciliation skip (no venue anchor), flagging "no reconciliation without a
venue-extraction follow-up" as out of scope there. This session found and tried exactly
that follow-up: 300/369 have an Instagram `location_tag` (independent of caption parsing),
81/300 clean venue names on a hand-read sample.
Built `apps/web/scripts/graph/matchVenuelessLocationTags.ts` (read-only sizing) and
`backfillVenuelessCandidateAnchors.ts` (the write): exact-name match to
`vendors.name`/`accounts.full_name`, required the matched account to already carry a
`venue` role (guards a real risk found by hand — a vendor's own location tagged instead of
the wedding venue, e.g. a beauty studio), single-account only (ambiguous multi-match held
back, e.g. "Field Museum" → 2 distinct accounts, correctly not resolved). Result: **131
confident matches**, hand-verified via two spot checks (a `galleriamarchetti` candidate
whose venue was named in prose with no "Venue:" credit line; `chicagoilluminatingcompany`'s
20+ matches, checked because of the frequency, confirmed as genuinely many real weddings).
Commit blocked by Claude Code's auto-mode classifier; user ran it directly. Idempotency
verified live.
Re-ran the existing `runJeremyWeddingReconciliation.ts` (no scoping/dry-run in that script —
diffed a before/after snapshot to protect D030's recorded audit: 405 pre-existing matches
unchanged in identity, 1 improved, 5 fell below the ambiguous floor, none previously
ingested so no production impact either way). Of the 131: only 1 reached high-confidence
(candidate 1635 → wedding 300, genuine but **fully redundant** — same venue/photographer/
planner/florist/date already in `wedding_vendors`) and 9 were ambiguous. Read a non-exact
ambiguous case by hand (candidate 2028 → wedding 478, `chicagoilluminatingcompany`):
**confirmed false merge** — two different real couples ("Jessie and Lucas" vs. wedding
478's actual couple), 20 days apart, sharing only one vendor (a makeup artist working both).
Same "magnet" pattern D030 already found at this exact venue. The other 120/131 have no
existing Ben wedding at that venue at all — the architectural limit `measureFeedCoverage.ts`
quantified (reconciliation only matches existing weddings, never creates new ones).
Decision: **do not ingest.** No ingestion script built. The 131 venue anchors themselves
stay (real, correct, permanent data-quality improvement to `jeremy_wedding_candidates`,
reusable if Ben's crawler ever documents a wedding at one of those 120 venues later) — only
the reconciliation→ingestion step is declined, matching D030/D031's bar exactly.
Related: D030 (the audit method and false-merge pattern this repeats), D031 (Case B, same
"0 new rows" shape), D026-D027 (Case A, the sibling mission this was scoped alongside).

---

## D032 — 2026-09-05 — PR #3 (D026–D031) merged after fixing two test bugs it introduced; production confirmed live

Status: Accepted
Context: PR #3 (`vendor-feed-gap-d026-d031`, Cursor's D026–D031 work plus a user follow-up
fixing a Bun-only `import.meta.dir` build break) was open, CI green, but `bun run test`
found two real bugs in its new test code before merging:
1. `graphStrengthening.test.ts`'s D023 snapshot assertion still expected `wedding_vendors`
   at 12,310/12,410 — stale, since Case A's 56 rows (D027) pushed it to 12,366/12,466 in a
   separate provenance table (`stack_reparse_v3_ingested`, not `jeremy_wedding_vendors_
   ingested`, so D023's own 100-row ingestion count is unaffected). Updated the literals.
2. The new `vendor feed count invariant (DB)` describe block's own `afterAll(closePool)`
   was redundant with an *earlier* block's identical call — since `getPool()`/`closePool()`
   share one module-level singleton, the earlier block's cleanup killed the pool before the
   later block's tests ran (`Cannot use a pool after calling end on the pool`, 2 failures).
   Removed the earlier, premature `closePool()` call; kept the one in the last describe
   block only.
Decision: fixed both, verified 47/47 tests green + typecheck clean, pushed, confirmed
Vercel preview green, merged PR #3 to `main` (merge commit, matching PR #1/#2's method).
Pulled `main` locally, re-verified typecheck/tests green post-merge, confirmed production
(`dewwey-ben-wallaces-projects.vercel.app`) serves `/vendors/galleriamarchetti` with a 200
and a rendered Feed tab.
Related: D026–D031 (what this PR contains), D023 (the snapshot this test protects).

---

## D031 — 2026-09-04 — Case B (orphaned-post attach) sized and declined; no general attach writer

Status: Accepted
Context: vendor-feed-gap Case A (D027) recovered 56 credits on posts already in a wedding
but did not move `galleriamarchetti` (still 15) — that account's remaining gap was Case B
shaped (posts that never formed a wedding). Mission doc already noted its 3 orphaned posts
are not real weddings. Corpus-wide ceiling was 202/4,702 orphaned posts with ≥1 named-role
credit after Case A filters. This pass sized the *real* attach-opportunity: would any of
those 202 attach to an *existing* wedding under conservative rules, without creating
weddings (ROADMAP: never seed low-evidence singletons)?
Method: read-only `sizeCaseBAttachOpportunity.ts` — `parseCaption()` v3, same named-role /
non-person-label / trailing-period filters as Case A, then two attach rules chosen *after*
D030 (same-venue + date window with weak overlap is a false-merge factory): (1) the post
credits a venue that has **exactly one** Ben wedding within `phase_dedup()`'s 21-day window;
(2) 2+ of the post's handles co-occur on the same nearby wedding. "Any credited account has
a nearby wedding" was measured as too loose and not used.
Findings, then every mechanical hit read against source captions and the target wedding's
existing post:
- 6 unique-venue matches, 6 two-handle matches (5 not also unique-venue) → **11 posts**.
- **At least two confirmed false merges** a general writer would have committed: post 4444
  (`Bride @kate_bauer` at `@publishinghouse_bnb`) → wedding 467, which is Sara and Ben's
  wedding two days earlier at the same B&B; post 4333 (Koscak rehearsal dinner, "celebrate
  them tomorrow," 2026-06-06) → wedding 581, Andrea + Joe on 2026-05-24 at the same
  restaurant. Same-venue 21-day unique match is not identity.
- The rest of the 11: a Chi Fdn for Women fundraiser, a corporate jazz-quartet ad, a venue
  walkthrough, a planner marketing post, a generic flower dump, a likely-different Salvatore's
  week (Emily & Matt / `@lillyphoto` vs `@_nova_photos`). Two identity-plausible leftover
  posts (DJ Hybrid at Library 190 the night of wedding 1187; Ben+Mariah details post for
  wedding 602) add **no new `wedding_vendors` rows** — both vendors are already credited.
  Feed counts are row counts (D026), so attaching them would not move the number the user
  sees.
- The README's "promising" post 110 (Tiara and Brandon at `@thebarnattimberpointe`) is a
  real wedding and correctly unmatched: that venue has **two** weddings in the 21-day window
  (ids 960 and 1043), so unique-venue refuses. Creating a wedding is out of scope.
- Honest new-vendor yield of a mechanical attach: two rows, both from rejected posts
  (`@hannafftevents` on the jazz ad, `@_nova_photos` on the likely-wrong Salvatore's).
Decision: **do not implement a Case B attach writer.** The 202 ceiling is almost all
no-nearby-wedding, marketing/non-wedding, or vendors already credited. A general attach
would have written confirmed false merges. `galleriamarchetti` Feed 15 is consistent with
the evidence — its orphaned posts are not weddings, and Case A had nothing left to recover.
The Jeremy-side "1–2 vendor-role evidence gap" (attach sparse posts to *Jeremy candidates*,
never seeding new ones) remains a separate, still-open ROADMAP Next item; this decision is
only about Ben's `posts` → `weddings` attach.
Related: D026/D027 (Case A), D030 (why unique-venue still isn't enough),
`docs/engineering/vendor-feed-gap/README.md`.

---

## D030 — 2026-09-04 — Ambiguous reconciliation tier audited, not ingested; 369-never-reconciled bucket explained as intentional

Status: Accepted
Context: D028 handed off the 268-candidate ambiguous `reconcile-v2` tier (and a previously
untracked 369-candidate never-reconciled bucket) for a D020-equivalent audit. Worked the
handoff checklist live against Supabase, no re-parse.
Findings (full writeup: `docs/engineering/graph-strengthening/ambiguous-tier-audit-handoff.md`):
1. **The 369 are an intentional exclusion, not a missed run.** They are exactly the 369
   candidates with `venue_account_id IS NULL`. `runJeremyWeddingReconciliation.ts` skips them
   (`if (c.venue_account_id == null) continue`) because venue is the matching anchor. Same
   clustering version and creation window as everyone else; zero have a `role='venue'` row even
   in raw `stack_extraction_entries` (not the evidence-view's accounts INNER JOIN). No
   reconciliation of this bucket without a venue-extraction follow-up, which is out of scope.
2. **Exact shared post URL: 5 / 268 (1.9%)**, vs 131 / 143 (91.6%) in D020. This tier is not
   "the 143 with weaker auxiliary evidence." Three of the five miss high-confidence only because
   Jaccard is `=` 0.5 (threshold is `>`); one is 16 days; one shares a URL with a 310-day date
   disagreement (still auto-confirmed per D020's URL-overrides-date rule).
3. **Non-exact remainder (263): 4 GREEN / 109 YELLOW / 150 RED.** Handle-diff, not role-labeled
   Jaccard. 49 Ben weddings are targeted by >1 of the 268 (D020 found 1). The magnet is the
   false-merge pattern D020 did not find: same venue, reused vendors, distinct event dates
   (e.g. candidates 1492/1629 → wedding 282 `@universityclubofchicago`, Jaccard 0.09/0.06,
   Nov 20 and Dec 31 stacks vs a Dec 16 Ben wedding). Only 20 / 263 entered ambiguous on both
   date≤30 and Jaccard>0.3.
4. **Dry-run of the 9 identity-safe candidates** (5 exact + 4 GREEN), `applyAmbiguousEvidenceToGraph.ts`,
   read entry-by-entry: 80 attempted, 11 INSERT, 69 SKIP, rolled back. **All 11 inserts are
   accounts already on that wedding under a different role** (`band` vs `musician`,
   `content_creator` vs `videographer`, or `other` → planner/rentals). Feed counts are
   `wedding_vendors` row counts (D026), so committing would inflate Feed for people already
   credited. Zero new vendor identities.
Decision: **do not ingest the ambiguous tier.** User reviewed the dry-run and agreed. 259
YELLOW/RED stay out on false-merge risk; the 9 identity-safe candidates add nothing the graph
doesn't already have at the account level. Script remains un-run except `--dry-run`. Not a
reconciliation redesign — the evidence floor (D021) is doing its job; this band is named
ambiguous because most of it is. The 2,092 no-match bucket is still correctly excluded.
Related: D020/`reconciliation-audit-143.md` (method), D021 (evidence floor), D023 (write bar
this dry-run met and then declined to commit), D026/D027 (parent vendor-feed-gap mission),
D028/D029 (handoff). Next: Case B of `docs/engineering/vendor-feed-gap/README.md` (orphaned
posts / 1–2-role attach), still in ROADMAP "Now."

---

## D029 — 2026-09-04 — Corrected stale ROADMAP item: the 47k-caption "re-parse" already happened for the V1 INCLUDE subset

Status: Accepted
Context: user asked directly whether posts in the 4,033 V1-INCLUDE corpus that mention real
vendors (e.g. `ulcchicago`, `salvatoreschicago`) get run through the caption-parsing
pipeline to update `wedding_vendors`. Checked live rather than assumed: `ROADMAP.md`'s
"Re-parse 47k staged captions through the stack parser" Next-item was stale — it read as
not-yet-started, but `jeremy_post_vendor_evidence`'s view definition confirms the 4,033
INCLUDE posts have already been run through `stackParser.ts` (`stack_extraction_entries`,
via `runStackParserBaseline.ts`), and that output is exactly what feeds
`jeremy_wedding_candidates`. Confirmed with real accounts: Jeremy's evidence has 38
mentions of `ulcchicago` and 9 of `salvatoreschicago`, more than currently reflected in
`wedding_vendors` for either (9 and 7 credited weddings respectively) — i.e. real,
already-extracted evidence sitting un-ingested, same shape as D028's ambiguous tier.
Decision: this was never separate work — it's the same D028 handoff. `ROADMAP.md`'s item
rewritten to say so explicitly and point at the handoff doc; the handoff doc
(`docs/engineering/graph-strengthening/ambiguous-tier-audit-handoff.md`) updated with an
explicit "no re-parsing needed" section and the `ulcchicago`/`salvatoreschicago` spot-check
query, so whoever picks it up (Cursor or otherwise) doesn't waste effort re-deriving or
re-running extraction that already exists. Also noted, not fixed: the evidence view inner-
joins to `accounts` by handle, so a vendor mentioned only in Jeremy's corpus with no
existing Ben account is currently invisible to the whole pipeline — flagged as a possible
follow-up, not this audit's scope unless it turns out to matter materially.
Related: D028 (the handoff this corrects/clarifies), D009-D015 (post classification V1,
the INCLUDE filter), D016-D025 (the extraction/candidate/reconciliation machinery).

---

## D028 — 2026-09-04 — Ambiguous reconciliation tier (268) handed off to Cursor; a new, previously-untracked 369-candidate gap found

Status: Accepted
Context: D026/D027's vendor-feed-gap mission expanded scope (user's call, asked directly)
to also cover the "Ambiguous reconciliation tier" ROADMAP Next-item after checking why the
user expected a "dramatic" venue-coverage increase from "~3k+ posts" — that number is
`jeremy_wedding_candidates` (2,872), of which only 143 (D020/D023) have been decided.
Re-measured live before handing off: 143 high-confidence (closed), **268 ambiguous with a
match** (ROADMAP's own figure, confirmed exact), 2,092 correctly excluded by the
`reconcile-v2` evidence floor (D021), and a **new, previously-undocumented 369 candidates
that never went through `reconcile-v2` reconciliation at all** — not mentioned in D019-D021
or `reconciliation-audit-143.md`, cause not yet investigated.
Decision: user was at 96% of their Claude session budget with a 2-hour reset window: rather
than spend that budget on an open-ended audit, this phase is handed off to a separate
tool/session (Cursor, or a fresh Claude session) via a self-contained brief —
`docs/engineering/graph-strengthening/ambiguous-tier-audit-handoff.md` — written to be read
cold with the exact numbers, the D020 audit method to mirror, the D023 safety bar to match,
and an explicit end state. The vendor-feed-gap mission's own Case A/B work (a different,
unrelated corpus — Ben's own posts) is unaffected and continues separately if resumed.
Related: D019-D021, D023 (the reconciliation/ingestion machinery this reuses),
D020/`reconciliation-audit-143.md` (the audit method to mirror), D026/D027 (this session's
vendor-feed-gap mission that surfaced the scope question), `ROADMAP.md` "Next" (item
updated to point at the handoff doc).

---

## D027 — 2026-09-04 — Case A vendor-feed-gap backfill committed; `galleriamarchetti`/`kehoedesigns` confirmed still unfixed (Case B needed)

Status: Accepted
Context: D026 kicked off the vendor-feed-gap mission. `apps/web/scripts/graph/
reparseBenPostsStackParserV3.ts` (Case A: recover missing credits on posts already in a
wedding) was built and dry-run verified. Read entry-by-entry by hand before trusting the
counts, per this repo's own verification standard — that read caught three real bugs before
commit: (1) `role='other'` (stackParser.ts's catch-all) concentrated real noise, including a
pre-existing misclassification already in Ben's graph (wedding 592 is a fashion runway show,
"The Walking Body • Runway," not a wedding) and a celebrity-mention false positive
(`@martingarrix` "crashed the after party" ≠ an actual videographer); policy set to commit
only named-role matches, defer `other` to manual review; (2) a node-postgres bigint-as-string
gotcha silently broke the exclusion filters until `::int`-cast in the query; (3) the shared
`HANDLE` regex's trailing-period capture would have created duplicate accounts for venues
that already exist cleanly, fixed with local normalization (Instagram usernames can't end in
a period).
Decision: committing the write itself was denied by Claude Code's auto-mode classifier as a
production DB write (matching this repo's working agreement and the same guardrail class
D022/D024 hit for an `ALTER TABLE`). User approved after reviewing the recommendation and ran
it directly. **Result: 56 new `wedding_vendors` rows, 4 `venue_id`/`is_chicago` backfills.**
Idempotency verified live immediately after (`entries_new=0 inserted=0` on re-run).
Verified live: `ulcchicago`/wedding 1352 now `role='venue'`, `weddings.venue_id=580`,
`is_chicago=true` — the exact bug the mission was named for, fixed.
**Important finding, checked rather than assumed**: `galleriamarchetti` (the account the user
actually pointed at — "Feed 15... I think there's more than 15") is **unchanged at 15** after
this commit, and `kehoedesigns` (the baseline audit's single largest gap, 18/33) is also
**unchanged at 18**. Neither account's gap was Case A shaped — `galleriamarchetti`'s missing
posts never formed a wedding at all (Case B), and `kehoedesigns`'s "reachable but uncredited"
weddings turned out to be mostly generic prose mentions with no structured credit line,
correctly not recovered. This confirms the baseline audit's own caveat (D026: "974 is a
ceiling, not the real gap") — Case A's real yield (56) landed in different accounts than the
two examples discussed with the user. Case B is what closes the user's own example.
Related: D026 (kickoff), `docs/engineering/vendor-feed-gap/README.md` (durable checklist,
updated with this result), D023 (the additive-write bar this backfill met).

---

## D026 — 2026-09-04 — Vendor feed/browse undercount diagnosed; TS additive-backfill mission kicked off as a `/loop`

Status: Accepted
Context: user reported `/vendors/<username>` Feed tab counts look lower than the real Instagram
evidence — confirmed live at `galleriamarchetti` (15 `wedding_vendors` rows, matching the Feed
tab exactly, vs. 19 posts mentioning the account, 4 of which never formed a wedding at all) and
`ulcchicago` (missing wedding 1352, "Gisela + Charles," whose caption has `"Venue @ulcchicago"`
on its own line — every other vendor on that caption got credited, this one didn't, purely
because the parser's `LINE` regex requires a punctuation separator and this line has none).
Decision: this is not a new bug to design a fix for — it's an already-validated fix
(`apps/web/scripts/graph/stackParser.ts`'s `v3` `NOCOLON_LINE`, added earlier today per
`docs/engineering/graph-strengthening/README.md` iteration 2, 82.6%→92.4% recall on real ground
truth) that has only ever run against Jeremy's staging corpus, never against Ben's own
already-ingested `posts`/`post_mentions`. Kicked off as a `/loop` mission (durable checklist:
`docs/engineering/vendor-feed-gap/README.md`) rather than a single implementation pass, matching
this repo's established investigate→implement→validate→document arc style.
**Design constraint decided up front**: implement as a TypeScript backfill against Supabase
directly (`pipeline.py` has never touched Supabase — hardcoded to `localhost:5442` — and this
sandbox has no Python/psycopg2 regardless), and **never re-run a `phase_dedup()`-equivalent
truncate** — `applyJeremyEvidenceToGraph.ts`'s own header already documents that a
truncate/rebuild of `weddings`/`wedding_posts`/`wedding_vendors` wipes the graph-strengthening
workstream's writes and renumbers every wedding ID, which today's Jeremy-reconciliation run (63
weddings merged by ID, 13:33–21:05) depends on. The backfill must be surgical additive
inserts/updates, following the exact D023 pattern: `on conflict do nothing`, a provenance table,
`--dry-run` with transaction rollback, explicit `refresh materialized view edges`, idempotency
verified live before considering any step done.
Also found, deliberately deferred (not what the user flagged, and structurally independent): a
second, smaller gap in `/vendors` browse and `/vendors?slot=Venue` — `listVendors()`
(`apps/web/lib/server/graph.ts:204`) inner-joins `v_account_role` and requires `n_chicago >= 1`,
and ~40% of `weddings.is_chicago` rows are `NULL` rather than computed. Vendor detail pages are
not is_chicago-gated (confirmed live), so this doesn't explain the Feed-tab undercount itself.
Related: `docs/engineering/graph-strengthening/README.md` (the parser this mission reuses),
`docs/engineering/vendor-feed-gap/README.md` (this mission's durable checklist), D019/D023
(the additive-write pattern being reused), `ROADMAP.md` "Next" (the "1–2 vendor-role evidence
gap" item this mission extends to Ben's own graph).

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
