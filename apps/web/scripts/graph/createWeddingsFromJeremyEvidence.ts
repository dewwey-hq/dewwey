/**
 * Creation script for the Jeremy wedding-creation mission
 * (docs/engineering/graph-strengthening/jeremy-wedding-creation.md) — the first script in
 * this whole workstream that creates a NEW `weddings` row rather than matching evidence to
 * one Ben's crawler already found.
 *
 * Scope: fixed, hand-verified candidate ID lists (D035's original 15-candidate pilot, plus
 * D036 Phase 1's 100 — see `docs/engineering/graph-strengthening/jeremy-wedding-creation.md`
 * and `is-chicago-for-new-venues.md`). Deliberately NOT parameterized to a `--limit` flag —
 * every batch this script processes must be individually duplicate-checked and hand-read
 * first; hardcoding forces a deliberate edit to grow the list, not a number bump.
 *
 * A real schema wrinkle surfaced building this: `wedding_posts.post_id` is a NOT NULL FK
 * to Ben's own `posts` table, but Jeremy's captions live in `staging.instagram_posts` — a
 * different table entirely. Prior missions (D023/D030/D033) never needed to bridge this,
 * because they only added `wedding_vendors` rows to EXISTING weddings that already had
 * their own Ben-crawled `wedding_posts`. Creating a wedding from Jeremy evidence alone
 * means importing the underlying post(s) into `posts` for the first time, tagged
 * `source='jeremy_evidence'` (a new, self-explanatory value — no CHECK constraint exists
 * on this column, confirmed before choosing it) so they stay distinguishable from Ben's
 * own crawl. `posts.shortcode` has a UNIQUE constraint, extracted from the Instagram URL —
 * this is what makes re-running this script idempotent (`on conflict (shortcode) do
 * nothing`), not a separate flag.
 *
 * Safety properties (same bar as every prior mission, D023 onward):
 * - Additive only; every insert is `on conflict do nothing`.
 * - Provenance: every created wedding is logged in a new `jeremy_weddings_created` table
 *   (candidate_id, wedding_id, created_at) — `wedding_id` deliberately NOT a foreign key,
 *   same reasoning as `jeremy_wedding_vendors_ingested` (Ben's `weddings.id` isn't stable
 *   across a future `phase_dedup()` rebuild, which this mission's doc says must never be
 *   re-run against Supabase anyway).
 * - Whole-run transaction; `--dry-run` rolls back at the end, same code path.
 * - Already cleared, before this script runs at all: an intra-batch duplicate check
 *   (checkIntraBatchDuplicates.ts) and a secondary-account duplicate check against Ben's
 *   EXISTING weddings (checkExistingDuplicatesForCreation.ts) — both clean for all 447,
 *   this pilot's 15 included.
 *
 * `--batch-id <id>` is required (D055, 2026-09-08) — provenance/reversibility follow-up to
 * Ben's question "if we claim too many weddings, can we revert?". `jeremy_weddings_created`
 * previously logged WHICH candidate created WHICH wedding but not which script invocation did
 * it, so there was no way to isolate and undo just one ingestion run. Every row this script
 * inserts now carries the caller-supplied batch_id, and revertWeddingBatch.ts undoes one batch
 * as a unit. Suggested format: `d055-<source>-<YYYY-MM-DD>-<n>` (source = a short label for
 * the candidate set, e.g. `beyond-include`, `styled-shoot`; n = a small counter if the same
 * source runs more than once in a day). No other behavior changes.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/createWeddingsFromJeremyEvidence.ts --batch-id <id> --dry-run
 *   bun run scripts/graph/createWeddingsFromJeremyEvidence.ts --batch-id <id>
 *
 * `--from-confirmed-candidates` (D055 Phase 1 step 9, 2026-09-08; revised 2026-09-08 for the
 * post-per-screen review redesign) is a SECOND, independent candidate source alongside the
 * hardcoded CANDIDATE_IDS arrays above (that mode is completely unchanged) -- it reads
 * /label/candidates' human review, assembled candidate-level by `candidate_review_derived`
 * (built from post-level `post_venue_verdicts`, see pipeline/schema.sql) instead of a
 * hand-verified array literal. Only candidates with decision CONFIRM or WRONG_VENUE, COMPLETE
 * (posts_decided = posts_total -- every post has a non-SKIP verdict, not just some), clustered
 * under clustering_version=STRUCTURAL_CLUSTERING_VERSION (structural-v2, see
 * lib/server/structuralVersion.ts), not already in `jeremy_weddings_created`, are eligible.
 * WRONG_VENUE creates at `corrected_venue_account_id` instead of the candidate's own
 * `venue_account_id` (SKIPped if the reviewer didn't name a correction -- "the venue is wrong"
 * alone isn't creatable). Only `included_post_urls` (the THIS_VENUE-verdict posts) are ever
 * attached -- `other_venue_post_urls` (OTHER_VENUE-verdict posts) belong to a different venue's
 * wedding, never this one; SKIPped as `no_included_posts` if there are none (the realistic
 * WRONG_VENUE case, since candidate_review_derived only assigns that decision when a candidate
 * has zero THIS_VENUE posts to begin with). Chicago gate is separate from the human decision on
 * principle (a CONFIRM says "real wedding", not "this venue is in Chicago" -- same discipline as
 * the chicago_status column's own doc comment in pipeline/schema.sql): eligible only if
 * chicago_status=CHICAGO_CONFIRMED OR the (corrected) venue resolves Chicago via
 * vendors.city='Chicago' OR account_locations.in_metro=true. Vendors come straight from
 * `structural_post_vendor_evidence`, scoped to the included posts only (non-venue roles) rather
 * than the `jeremy_wedding_candidate_vendors` view -- that view only unions
 * jeremy_post_vendor_evidence + human_confirmed_post_vendor_evidence and does not cover this
 * (structural) evidence source yet; see the script's final-report note for the proposed
 * (unapplied) view extension. `--since <ISO>` and `--limit N` batch a large eligible set; both
 * optional.
 *
 * Usage:
 *   bun run scripts/graph/createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --batch-id <id> --dry-run
 *   bun run scripts/graph/createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --batch-id <id> --since 2026-09-08T00:00:00Z --limit 50 --dry-run
 */
import { readdirSync, statSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import type { PoolClient } from "pg";
import { STRUCTURAL_CLUSTERING_VERSION } from "../../lib/server/structuralVersion";
import {
  decideStructuralCandidateCreation,
  type StructuralReviewDecision,
  type ChicagoStatus,
} from "./structuralCandidateGating";

// The 15 candidates read end-to-end by hand (mission doc, "Pilot" section, 2026-09-05) —
// all confirmed genuinely real, distinct weddings; the two multi-venue risk cases in this
// set (158, 662) were individually cross-checked against Ben's existing graph and cleared.
// Already created (D035) -- kept here so a re-run stays a no-op via jeremy_weddings_created,
// not because this list needs to grow; new batches get their own array below.
const D035_PILOT_CANDIDATE_IDS = [158, 351, 396, 540, 624, 662, 701, 1158, 1222, 1253, 1363, 1650, 2250, 2756, 2804];

// is-chicago-for-new-venues mission (D036), Phase 1: candidates whose venue resolves via
// existing vendors.city='Chicago' data AND has a corroborating account_tags role in
// venue/hotel/catering/rentals. Both duplicate checks clean (checkIntraBatchDuplicates.ts
// --phase1, checkExistingDuplicatesForCreation.ts --phase1), 15-candidate hand-read sample
// all genuine real weddings. 102 passed the filter; 2 explicitly excluded after further
// verification (2026-09-05):
// - 2455 (hangoutlighting): a lighting RENTAL company ("Mix, match, & customize...
//   lighting made easy" -- its own bio), not a venue, despite having a stray manual
//   account_tags 'venue' row (confidence 0.8, evidence_count 1 -- likely a pre-existing
//   data error, not corroborating evidence).
// - 2469 (blueplatechicago): a catering company whose OWN bio explicitly reads
//   "Venue: @alliumchicago" -- it names a DIFFERENT account as the real venue.
const PHASE1_CANDIDATE_IDS = [
  31, 37, 44, 55, 57, 61, 80, 94, 153, 161, 162, 166, 199, 210, 231, 278, 306, 317, 326, 377,
  380, 448, 475, 488, 503, 538, 544, 559, 587, 606, 637, 667, 695, 734, 750, 829, 837, 876,
  883, 903, 916, 919, 958, 986, 1011, 1085, 1116, 1128, 1136, 1202, 1230, 1238, 1259, 1325,
  1410, 1421, 1455, 1477, 1487, 1556, 1585, 1594, 1606, 1616, 1632, 1661, 1712, 1718, 1769,
  1776, 1787, 1792, 1956, 1962, 2005, 2046, 2059, 2089, 2103, 2114, 2124, 2129, 2138, 2254,
  2297, 2324, 2355, 2364, 2475, 2551, 2585, 2590, 2605, 2628, 2659, 2660, 2830, 2837, 2840,
  2872,
];

// is-chicago-for-new-venues mission (D038/D039), Phase 2: candidates whose venue account had
// ZERO location signal in Ben's own data, resolved instead via free WebSearch (D038 pivot
// from the paid Places API). 130 distinct venue accounts attempted; 99 confirmed real
// Chicago-metro locations (backfillVenueLocationsViaWebSearch.ts). Both duplicate checks
// clean (--phase2 mode, 0/169 flagged either check). A NEW risk category surfaced in the
// 15-candidate hand-read sample (2026-09-05): 44 of the 169 candidates have TWO+ accounts
// tagged role='venue' -- typically a ceremony church credited alongside a separate,
// unrelated reception venue (e.g. candidate 1296: resolved venue_account_id was
// `assumption_church_chicago`, but the underlying caption's actual "Venue:" credit was
// `@thewellsley`, a different business entirely; candidate 2271 similarly resolved to the
// church despite an explicit "Venue: @therookerybuilding" in the same caption). This is
// genuinely ambiguous -- not a clean mislabel like Phase 1's lighting-company/musician cases
// -- so all 44 are excluded from this batch rather than guessing which of two legitimate
// accounts is "the" venue (docs/engineering/graph-strengthening/is-chicago-for-new-venues.md
// has the full 44-candidate list and reasoning). The remaining 125 are the clean batch here.
const PHASE2_ACCOUNT_IDS = [
  1438, 2857, 4208, 6059, 7033, 7893, 8024, 8478, 8791, 9829, 11283, 19471, 20812, 3088, 4641,
  18240, 18283, 18370, 18466, 18489, 18490, 18508, 18543, 18606, 18621, 18631, 18676, 18712,
  18759, 18793, 18849, 18863, 18865, 18869, 18877, 18892, 18940, 18945, 18975, 19183, 19194,
  19224, 19260, 19286, 19288, 19292, 19310, 19353, 19354, 19446, 19482, 19535, 19539, 19603,
  19612, 19628, 19637, 19704, 19812, 19890, 19931, 20346, 20377, 20504, 20545, 20574, 20581,
  20593, 20679, 20680, 20694, 20755, 20792, 20805, 20819, 20911, 20978, 20979, 21019, 21020,
  21147, 21161, 21169, 21174, 21178, 21185, 21186, 21192, 21195, 21196, 21197, 21286, 21305,
  21307, 21319, 21342, 21343, 21348, 21416,
];
const PHASE2_CANDIDATE_IDS = [
  52, 102, 126, 129, 140, 1129, 188, 206, 232, 239, 244, 296, 305, 342, 357, 419, 435, 472,
  485, 516, 534, 535, 551, 619, 650, 720, 725, 749, 814, 1134, 851, 899, 901, 952, 1004, 1010,
  1061, 1092, 1099, 1124, 1150, 1198, 1204, 1212, 1243, 1286, 1329, 1345, 1352, 1382, 1388,
  1413, 1425, 1429, 1447, 1461, 1480, 1488, 1553, 1642, 1747, 1767, 1784, 1810, 1811, 1831,
  1834, 1843, 1893, 1915, 1909, 1968, 1976, 2021, 2031, 2036, 2066, 2071, 2118, 2141, 2158,
  2163, 2230, 2249, 2304, 2333, 2338, 2384, 2397, 2332, 2409, 2416, 2421, 2434, 2443, 2459,
  2470, 2471, 2473, 2490, 2524, 2570, 2558, 2589, 2616, 2619, 2623, 2640, 2643, 2607, 2678,
  2685, 2691, 2677, 2707, 2723, 2725, 2744, 2761, 2764, 2775, 2816, 2824, 2838, 2849,
];

// "v1 data completion, venues-first" mission (D047, 2026-09-06): Batch 5 of
// backfillVenueLocationsViaWebSearch.ts (33 accounts, a fresh 252-account cohort distinct
// from Phase 1/2's 447). Both duplicate checks run with the "venue has zero existing
// weddings" pre-filter DROPPED (D047 — that filter was D034's original scoping convenience,
// not a safety mechanism; the Jaccard checks are the real protection and stayed fully in
// force). 23 candidates in scope, both checks clean except one intra-batch pair (563, 607 —
// see below). Hand-read all 23 (proportionate given the small size): 13 are genuinely
// distinct, real, named-couple weddings (holynamecathedral x7, trivolitavern, meridianbanquets,
// bolingbrookgolfclub x2, cityviewloft, drurylaneproductions) -- clean batch. The other 10, ALL
// at fourthchurch (venue_account_id 6304), are EXCLUDED: reading the raw captions found (a) most
// are the SAME real wedding ("Lyndsey and Robert") reposted repeatedly by its photographer over
// more than a year -- outside the 21-day dedup window, so the Jaccard check only caught one pair
// (563/607, 21 days apart exactly) and missed the rest (375, 511, 1561 span Sep 2024-Dec 2025,
// same vendor set, clearly the same event); and (b) at least 2 (1948, 2583) explicitly credit
// "Venue: @universityclubofchicago" in the caption -- fourthchurch is a misattributed
// venue_account_id, same clustering-picks-wrong-account bug pattern as is-chicago-for-new-
// venues.md's candidates 2411/2542. Fourth Church is a real, working, right-to-flag population
// for a future targeted follow-up (likely 1-2 real weddings once untangled), not this batch.
const BATCH5_CANDIDATE_IDS = [
  226, 269, 338, 568, 602, 631, 929, 936, 1330, 1626, 1775, 2574, 2942,
  // Batch 6 (2026-09-06): 998 (bridgesofpoplarcreek), 1262 (holynamecathedral), 1318+1541
  // (cantignygolf), 1738 (olympiafieldscc) -- hand-read, all genuine named-couple real
  // weddings. Fourth Church's cluster (still contaminated, same reasons as before) stays
  // excluded. 3130 (holynamecathedral) also excluded: no named couple, full vendor stack but
  // hotel-branded marketing hashtags (#PenMoments #PeninsulaHotels #FiveStarService), and V3
  // itself now scores it EXCLUDE (candidate_scores=18, so it once qualified for V3 to run, but
  // the classifier's current decision disagrees with this candidate's original clustering) --
  // genuinely ambiguous, excluded rather than overridden on a guess.
  998, 1262, 1318, 1541, 1738,
];

// "Corrected priority" follow-on (2026-09-06, docs/decisions.md D047 update): the user pushed
// back that Track A only ever grew NEWLY-discovered venues, not the already-popular ones
// actually visible on /vendors. Real lever: 2,030 trustworthy candidates (excluding
// venue-couple-signal-v1) sit unmatched/uncreated across 253 ALREADY-KNOWN venues system-wide
// -- this is the same "drop the zero-existing-weddings filter" mechanism as Batch 5/6, just
// applied at its true full scope instead of a WebSearch-driven subset. Tiered by
// candidates-per-venue (checkIntraBatchDuplicates.ts/checkExistingDuplicatesForCreation.ts
// --tier1/--tier2/--tier3): Tier 1 = 156 venues with 1-4 candidates each (241 total, lowest
// repost/misattribution risk).
//
// Tier 1 required building a SYSTEMATIC venue-identity filter, not just hand-reading a sample
// -- a naive dry-run of the raw 241 surfaced known-bad candidates from an EARLIER mission
// (2411/2455/2469/2542 -- cloudgatequartet/hangoutlighting/blueplatechicago/ravisloeweddings,
// see is-chicago-for-new-venues.md's Baseline findings) that a fresh hand-read alone missed
// (2469's caption opens with a genuine couple's story; the misattribution is only visible in
// the "Venue: @sohohouse @tigerlilyevents @blueplatechicago" line further down). Checked
// SYSTEMATICALLY across all 241: 73 (30%) have 2+ distinct accounts tagged role='venue' on the
// same candidate (the Phase 2 church-vs-reception ambiguity pattern -- excluded, same
// conservative call Phase 2 made); 1 has a bio-redirect ("Venue: @otherhandle" in the venue
// account's own bio, same blueplatechicago pattern -- excluded). Do NOT apply a bare
// "has an account_tags venue-shaped role" filter here the way Phase 1 did -- verified live that
// it produces false positives at this broader scope (e.g. candidate 21, Loews Chicago Hotel, a
// genuine hand-verified real wedding, has zero account_tags rows at all -- simply never
// classified, not evidence of anything wrong). Content-quality issues (generic marketing/advice
// copy despite a real vendor stack, e.g. "Wondering how your wedding morning will flow?") are a
// SEPARATE risk from venue-identity correctness and were caught by hand-reading ~43 candidates
// (~27% of the tier) plus a corpus-wide regex sweep for marketing-CTA language ("book your",
// "save this for", "now booking", etc.) -- 8 more excluded this way, plus the 4 known-bad IDs
// above and 1 exact intra-batch duplicate (2899, jaccard=1.0 same-day as 592 -- kept 592, more
// posts attached). Net: 241 -> 159 after all filters.
const TIER1_CANDIDATE_IDS = [
  21, 25, 47, 48, 56, 66, 78, 93, 109, 116, 133, 139, 142, 163, 192,
  229, 281, 283, 286, 288, 298, 337, 371, 373, 420, 432, 433, 452, 482, 524,
  545, 579, 581, 592, 594, 596, 613, 614, 620, 682, 723, 724, 738, 744, 753,
  763, 783, 789, 804, 866, 869, 871, 888, 907, 910, 912, 922, 935, 960, 987,
  1002, 1005, 1017, 1076, 1087, 1089, 1107, 1127, 1157, 1240, 1274, 1281, 1285, 1293, 1295,
  1310, 1346, 1377, 1401, 1434, 1466, 1482, 1494, 1499, 1513, 1519, 1559, 1582, 1652, 1672,
  1674, 1686, 1696, 1722, 1751, 1770, 1808, 1809, 1847, 1877, 1900, 2037, 2062, 2063, 2099,
  2104, 2145, 2192, 2236, 2245, 2259, 2265, 2269, 2294, 2296, 2343, 2348, 2497, 2509, 2523,
  2526, 2565, 2573, 2581, 2587, 2604, 2661, 2686, 2702, 2714, 2720, 2834, 2836, 2843, 2850,
  2863, 2874, 2888, 2897, 2913, 2932, 2934, 2944, 2945, 2949, 2962, 2965, 2971, 2972, 2974,
  2976, 2980, 2992, 2998, 3001, 3002, 3004, 3009, 3012,
];

const BATCH5_ACCOUNT_IDS = [
  2864, 7581, 4188, 6260, 3564, 7038, 8324, 1303, 4904, 4994, 4151, 1645, 1526, 8124, 11109,
  8163, 8952, 6634, 5809, 6304, 4355, 4207, 4386, 3813, 3808, 1480, 2764, 2761, 2757, 2753,
  2738, 2734, 2697,
  // Batch 6 (2026-09-06), appended to the same allowlist.
  4245, 4638, 4610, 2576, 5115, 5741, 5544, 5079, 6129, 3407, 4600,
];

// Tier 2 (2026-09-06, same D047 "corrected priority" follow-on): 53 venues with 5-14
// uncreated candidates each, 440 total -- includes 4 of the user's own named reference venues
// (venuelogic, thewellsley, gpconservatory, the_carter_fultonmarket). Same systematic filter as
// Tier 1 (double-venue-tag ambiguity, bio-redirect), MINUS fourthchurch and thefultonwest
// entirely (both already confirmed contaminated -- Fourth Church's repost/misattribution
// pattern from Batch 5, thefultonwest's near-total generic-marketing/birthday/styled-shoot
// contamination from the abandoned couple-signal track's hand-read).
//
// New finding here: a WIDER (no date-window) Jaccard check across the same venue surfaced 128
// high-similarity pairs the standard 21-day check misses -- but hand-reading a sample showed
// MOST of these are NOT duplicates: a venue's recurring preferred vendor team (same photographer
// + planner + florist trio) produces identical (account:role) vendor-set fingerprints across
// MANY genuinely different real weddings (e.g. saintclementparish candidates 1024 "S+B's
// reception" vs 2246 "Susanna wore her heart" -- different couples, same nicodemcreative/
// olivefineweddings/flowerfirm team). Blanket-excluding on Jaccard alone would have wrongly
// killed real, distinct content -- directly against the stated goal (richness over exclusion).
// Only excluded pairs with a DIRECTLY VERIFIED duplicate signal (identical couple name/handle
// across both posts, or same-day event dates): gpconservatory 257 (dup of 1, same couple
// ginabrittneyann), thewellsley 1182 (dup of 3059) and 1706 (dup of 1418) (same couple names +
// identical planner/photographer in each pair), colvinevents 2901 (dup of 658, 1 day apart,
// jaccard=1.0), thecanvasvenue 125 (dup of 2882, same-day, jaccard=1.0 -- kept 2882, the
// already-hand-vetted human-confirmed-v1 candidate), venuelogic 1733 and 2956 (both the same
// "A. & A." Indian-Polish couple as 2995, the already-hand-vetted human-confirmed-v1
// candidate -- kept 2995). Plus 3 content-quality excludes from hand-reading the named venues
// directly (gpconservatory 2624: a venue-introduction marketing post, not a wedding;
// thewellsley 1552 and 2754: no couple, pure marketing/stylistic copy).
const TIER2_CANDIDATE_IDS = [
  1, 2, 6, 27, 35, 36, 40, 59, 62, 70, 71, 84, 87, 89, 103,
  107, 113, 117, 119, 134, 135, 148, 152, 165, 177, 178, 186, 189, 191, 198,
  207, 214, 216, 219, 220, 228, 230, 236, 243, 245, 258, 261, 265, 267, 279,
  282, 291, 308, 311, 312, 313, 322, 324, 331, 339, 358, 368, 374, 382, 384,
  386, 392, 394, 406, 410, 412, 415, 434, 440, 456, 463, 464, 473, 479, 484,
  486, 489, 493, 499, 506, 549, 574, 593, 595, 621, 626, 634, 646, 658, 661,
  665, 672, 679, 686, 692, 694, 698, 708, 722, 741, 767, 771, 773, 797, 806,
  825, 838, 840, 843, 848, 857, 859, 875, 881, 892, 904, 908, 943, 947, 953,
  955, 961, 964, 968, 972, 977, 984, 989, 995, 999, 1015, 1027, 1030, 1031, 1033,
  1039, 1046, 1047, 1048, 1049, 1051, 1063, 1067, 1079, 1086, 1094, 1098, 1104, 1105, 1111,
  1122, 1125, 1130, 1133, 1138, 1142, 1147, 1156, 1159, 1167, 1170, 1192, 1195, 1201, 1208,
  1215, 1224, 1226, 1231, 1234, 1237, 1241, 1271, 1272, 1282, 1301, 1313, 1322, 1331, 1343,
  1358, 1359, 1365, 1369, 1373, 1376, 1391, 1399, 1405, 1406, 1418, 1430, 1433, 1437, 1449,
  1463, 1469, 1470, 1493, 1496, 1498, 1510, 1528, 1544, 1545, 1566, 1574, 1576, 1580, 1581,
  1595, 1615, 1617, 1634, 1641, 1651, 1656, 1670, 1699, 1701, 1740, 1743, 1760, 1761, 1768,
  1805, 1807, 1823, 1826, 1833, 1835, 1844, 1855, 1867, 1884, 1889, 1897, 1898, 1933, 1934,
  1951, 1970, 1972, 1974, 1977, 1979, 1980, 1987, 1992, 1998, 2002, 2003, 2007, 2016, 2017,
  2033, 2038, 2040, 2053, 2055, 2064, 2067, 2076, 2080, 2081, 2097, 2098, 2109, 2169, 2171,
  2180, 2184, 2195, 2241, 2272, 2276, 2285, 2301, 2302, 2317, 2318, 2323, 2326, 2358, 2388,
  2390, 2398, 2413, 2427, 2429, 2435, 2457, 2458, 2461, 2465, 2472, 2477, 2483, 2487, 2488,
  2500, 2516, 2517, 2522, 2536, 2580, 2591, 2597, 2608, 2618, 2620, 2621, 2625, 2653, 2672,
  2682, 2709, 2732, 2739, 2746, 2747, 2751, 2762, 2781, 2810, 2826, 2882, 2902, 2916, 2919,
  2938, 2958, 2983, 2995, 2996, 2999, 3007,
];

// Tier 3 (2026-09-06, same D047 "corrected priority" follow-on): 39 venues with 15+ uncreated
// candidates each, 1,349 total -- includes the last 4 of the user's 8 named reference venues
// (bridgeportartcenter 160, rockwellontheriver 115, chicagoilluminatingcompany 97, the.arbory
// 72, fairliechicago 35, sarabandechicago 19). Same systematic filter as Tier 1/2, plus
// fourthchurch/thefultonwest excluded entirely (already confirmed contaminated).
//
// This tier carries the highest repost/misattribution risk by design (candidate volume
// concentrates exactly where Fourth Church's problem hid). Checked specifically: a wide
// same-venue Jaccard scan restricted to 0-3 day gaps found only 2 pairs, both already caught by
// the standard 21-day check -- no hidden near-term duplicate cluster. A broader wide-window scan
// (no day limit) showed real clustering at the highest-volume venues (38 high-Jaccard pairs at
// bridgeportartcenter, 59 at chicagoilluminatingcompany, 30 at rockwellontheriver) -- hand-read
// samples from these confirmed the SAME pattern already found in Tier 2: mostly a venue's
// recurring preferred vendor team (photographer+planner+venue-manager trio) producing identical
// vendor-set fingerprints across many genuinely DIFFERENT real weddings, not duplicates (e.g.
// bridgeportartcenter candidates 369/553, same photographer+venue-manager, no shared couple
// identity -- different weddings). One genuine duplicate WAS found this way (385/557, "Lola and
// Noah" / "L&N", same photographer, kept 385). thelibraryat190 (19 candidates) was hand-read in
// full given a generic-hashtag pattern resembling thefultonwest's contamination -- turned out
// mostly genuine (Lynn&Scott, Moira+Edgar, Yoonjung&Joseph, Muna&Trevor, etc.), only 2 candidates
// (255, 287 -- both multi-post merges of generic "#fairytalewedding"-style hashtag content with
// no couple identity) excluded. The standard 21-day intra-batch check found 9 near-term
// duplicates, all hand-verified via matching couple names/identical vendor pairs and resolved
// (kept the more substantive post in each pair, e.g. real content over "now booking" marketing
// reposts). A corpus-wide regex sweep for marketing-CTA language found 27 matches; only 3 lacked
// any couple-name signal at all (excluded); the other 24 had a real couple with just a
// cross-tagged vendor's own promotional line mixed in (kept, same as every prior tier). Net:
// 1,349 -> 1,076.
const TIER3_CANDIDATE_IDS = [
  3, 4, 5, 8, 9, 10, 14, 17, 18, 19, 20, 22, 23, 24, 29,
  30, 38, 39, 42, 43, 49, 50, 51, 53, 54, 58, 60, 63, 65, 68,
  69, 72, 73, 76, 77, 79, 81, 83, 88, 90, 91, 95, 96, 98, 99,
  101, 104, 105, 108, 110, 111, 112, 114, 115, 118, 120, 121, 122, 123, 127,
  128, 130, 131, 132, 136, 141, 147, 149, 150, 151, 154, 160, 164, 167, 171,
  175, 176, 179, 181, 182, 183, 184, 185, 187, 194, 196, 197, 201, 202, 204,
  205, 211, 212, 213, 215, 218, 223, 224, 225, 227, 233, 234, 238, 240, 241,
  242, 246, 251, 252, 254, 256, 262, 266, 268, 270, 271, 273, 275, 277, 280,
  284, 285, 290, 292, 293, 297, 299, 300, 302, 303, 304, 307, 309, 314, 315,
  316, 319, 320, 325, 329, 333, 334, 340, 343, 345, 346, 347, 348, 349, 350,
  353, 354, 355, 356, 359, 362, 363, 365, 366, 367, 376, 381, 383, 385, 387,
  388, 389, 391, 395, 397, 399, 400, 401, 403, 404, 405, 407, 409, 411, 413,
  414, 416, 417, 418, 421, 422, 424, 427, 428, 436, 442, 443, 445, 449, 450,
  454, 455, 460, 462, 465, 466, 468, 469, 474, 476, 477, 478, 480, 483, 487,
  490, 491, 494, 495, 498, 500, 501, 502, 507, 509, 512, 513, 517, 519, 521,
  522, 531, 532, 537, 541, 546, 547, 548, 550, 552, 554, 558, 560, 561, 562,
  565, 566, 569, 571, 573, 575, 577, 580, 584, 585, 588, 590, 591, 598, 599,
  600, 603, 605, 615, 616, 618, 622, 625, 632, 635, 636, 638, 639, 640, 641,
  643, 644, 645, 647, 648, 649, 654, 655, 657, 659, 660, 666, 668, 673, 674,
  677, 678, 680, 683, 685, 687, 691, 696, 699, 702, 703, 704, 705, 707, 712,
  714, 715, 717, 719, 721, 728, 732, 733, 740, 743, 745, 747, 751, 754, 756,
  757, 761, 764, 765, 769, 770, 774, 776, 778, 779, 782, 785, 786, 787, 788,
  793, 794, 795, 796, 798, 799, 800, 801, 807, 811, 812, 813, 816, 817, 819,
  820, 823, 824, 828, 832, 835, 839, 842, 844, 846, 847, 850, 855, 858, 860,
  861, 864, 865, 867, 870, 872, 874, 878, 879, 884, 885, 887, 889, 891, 893,
  894, 896, 897, 898, 900, 905, 906, 911, 917, 918, 920, 924, 927, 930, 931,
  932, 933, 937, 938, 940, 941, 944, 948, 950, 951, 956, 957, 959, 967, 969,
  970, 973, 974, 975, 976, 978, 979, 981, 983, 988, 992, 996, 1000, 1006, 1007,
  1008, 1009, 1014, 1016, 1018, 1021, 1022, 1025, 1026, 1032, 1034, 1035, 1036, 1038, 1040,
  1042, 1043, 1045, 1050, 1055, 1056, 1058, 1059, 1066, 1068, 1069, 1072, 1074, 1077, 1078,
  1084, 1088, 1095, 1100, 1101, 1103, 1108, 1109, 1110, 1114, 1117, 1119, 1120, 1121, 1123,
  1126, 1132, 1137, 1143, 1145, 1148, 1149, 1152, 1155, 1160, 1162, 1164, 1165, 1172, 1175,
  1176, 1177, 1178, 1180, 1181, 1184, 1185, 1186, 1188, 1196, 1205, 1206, 1207, 1209, 1211,
  1213, 1214, 1217, 1223, 1228, 1233, 1235, 1236, 1239, 1244, 1246, 1247, 1248, 1254, 1255,
  1257, 1258, 1260, 1261, 1264, 1265, 1273, 1275, 1276, 1277, 1279, 1280, 1284, 1287, 1289,
  1291, 1294, 1297, 1298, 1299, 1300, 1302, 1303, 1304, 1307, 1308, 1309, 1312, 1314, 1315,
  1317, 1319, 1320, 1321, 1323, 1326, 1328, 1332, 1336, 1338, 1339, 1341, 1348, 1349, 1350,
  1351, 1354, 1356, 1357, 1361, 1362, 1364, 1366, 1370, 1374, 1378, 1381, 1385, 1389, 1390,
  1392, 1393, 1395, 1396, 1397, 1398, 1400, 1402, 1403, 1404, 1407, 1408, 1409, 1411, 1412,
  1417, 1422, 1424, 1428, 1432, 1435, 1436, 1438, 1439, 1440, 1441, 1444, 1445, 1446, 1448,
  1450, 1457, 1458, 1459, 1464, 1465, 1467, 1468, 1471, 1472, 1473, 1474, 1476, 1478, 1479,
  1483, 1486, 1489, 1490, 1501, 1502, 1503, 1504, 1505, 1507, 1508, 1509, 1511, 1512, 1515,
  1516, 1521, 1524, 1525, 1526, 1527, 1531, 1533, 1536, 1537, 1538, 1540, 1542, 1543, 1547,
  1548, 1550, 1554, 1555, 1557, 1558, 1560, 1562, 1563, 1564, 1567, 1569, 1570, 1572, 1575,
  1579, 1583, 1586, 1587, 1596, 1598, 1600, 1601, 1602, 1603, 1608, 1611, 1613, 1618, 1619,
  1620, 1621, 1623, 1625, 1628, 1631, 1636, 1637, 1638, 1639, 1643, 1646, 1649, 1653, 1654,
  1655, 1657, 1659, 1660, 1662, 1663, 1664, 1665, 1669, 1676, 1677, 1678, 1680, 1682, 1683,
  1687, 1689, 1690, 1692, 1693, 1697, 1700, 1704, 1705, 1708, 1709, 1711, 1715, 1717, 1719,
  1720, 1721, 1723, 1725, 1727, 1729, 1731, 1734, 1735, 1737, 1739, 1742, 1745, 1746, 1748,
  1750, 1752, 1758, 1759, 1762, 1763, 1764, 1765, 1771, 1773, 1774, 1778, 1779, 1780, 1781,
  1782, 1783, 1785, 1786, 1788, 1789, 1793, 1794, 1795, 1796, 1797, 1798, 1800, 1801, 1802,
  1803, 1804, 1806, 1812, 1815, 1817, 1820, 1824, 1827, 1828, 1830, 1832, 1837, 1838, 1839,
  1840, 1841, 1842, 1850, 1851, 1853, 1856, 1859, 1860, 1861, 1862, 1864, 1865, 1866, 1868,
  1869, 1870, 1871, 1875, 1878, 1881, 1882, 1883, 1886, 1887, 1888, 1890, 1894, 1896, 1899,
  1902, 1903, 1904, 1905, 1906, 1907, 1908, 1910, 1914, 1916, 1917, 1920, 1922, 1923, 1924,
  1925, 1926, 1927, 1928, 1929, 1930, 1936, 1938, 1939, 1940, 1941, 1945, 1946, 1952, 1953,
  1957, 1958, 1959, 1963, 1964, 1966, 1975, 1981, 1982, 1984, 1985, 1986, 1991, 1995, 2000,
  2006, 2009, 2012, 2013, 2015, 2018, 2019, 2023, 2025, 2026, 2030, 2034, 2043, 2044, 2048,
  2051, 2052, 2056, 2058, 2070, 2072, 2074, 2077, 2078, 2079, 2084, 2085, 2086, 2088, 2092,
  2093, 2094, 2096, 2100, 2102, 2107, 2108, 2115, 2120, 2121, 2122, 2128, 2131, 2133, 2139,
  2140, 2147, 2148, 2152, 2154, 2167, 2168, 2172, 2173, 2175, 2182, 2183, 2185, 2191, 2193,
  2194, 2197, 2198, 2199, 2200, 2201, 2205, 2207, 2209, 2212, 2214, 2216, 2217, 2218, 2219,
  2220, 2223, 2226, 2227, 2233, 2238, 2239, 2240, 2242, 2244, 2251, 2252, 2256, 2257, 2258,
  2263, 2275, 2278, 2279, 2280, 2289, 2293, 2295, 2298, 2306, 2309, 2311, 2312, 2315, 2325,
  2330, 2334, 2341, 2344, 2347, 2350, 2351, 2356, 2360, 2367, 2369, 2370, 2371, 2373, 2375,
  2378, 2383, 2387, 2400, 2403, 2406, 2417, 2418, 2428, 2431, 2433, 2437, 2440, 2441, 2442,
  2444, 2445, 2446, 2449, 2450, 2451, 2456, 2460, 2462, 2464, 2467, 2478, 2481, 2484, 2485,
  2492, 2498, 2501, 2504, 2514, 2519, 2525, 2533, 2544, 2553, 2564, 2567, 2576, 2577, 2601,
  2602, 2610, 2612, 2614, 2626, 2627, 2632, 2637, 2647, 2648, 2651, 2656, 2658, 2663, 2671,
  2699, 2718, 2726, 2730, 2742, 2755, 2763, 2765, 2769, 2771, 2790, 2793, 2796, 2797, 2800,
  2807, 2814, 2859, 2876, 2887, 2890, 2895, 2903, 2907, 2908, 2910, 2917, 2920, 2922, 2927,
  2929, 2936, 2941, 2961, 2963, 2973, 2987, 2988, 2989, 2997, 3010,
];

const CANDIDATE_IDS = [
  ...D035_PILOT_CANDIDATE_IDS,
  ...PHASE1_CANDIDATE_IDS,
  ...PHASE2_CANDIDATE_IDS,
  ...BATCH5_CANDIDATE_IDS,
  ...TIER1_CANDIDATE_IDS,
  ...TIER2_CANDIDATE_IDS,
  ...TIER3_CANDIDATE_IDS,
  // Final cleanup of the original "18 hand-reviewed" human-confirmed-v1 candidates
  // (docs/engineering/human-labeling/human-confirmed-candidates-review.md) that the tiered
  // sweep's `matched_wedding_id is null` filter skipped even though a human had already
  // reviewed them and recommended "create": 2954 (the_carter_fultonmarket, "Jek and Willis")
  // and 2959 (fairliechicago, "Jordan Paige Baker and Quinn") each have a WEAK automated match
  // (confidence 0.4) the human reviewer correctly judged as not a real match. 2967
  // (holyfamilycci, "Alyssa and Dalton") was excluded by the double-venue-tag systematic
  // filter (2 distinct role='venue' credits) -- verified by hand, real content, filter was
  // conservative here not wrong-but-safe-to-override given prior human review of this exact
  // post. The 4th ("attach", not create) -- 2981, Venuti's Banquets, "Mr & Mrs Gjerazi" -- is
  // handled separately (attachStrayHumanConfirmedCandidate.ts), confidence 0.4 is below
  // applyJeremyEvidenceToGraph.ts's 0.75-0.85 band so it needed a one-off, not this script.
  2954, 2959, 2967,
  // fourthchurch untangling (D047 follow-on, 2026-09-06) -- fourthchurch's full 12-candidate
  // cluster was excluded wholesale during Tier 1/2 on suspicion of the same "one wedding
  // reposted for a year" contamination pattern that motivated the wide-window-Jaccard
  // safeguard. Hand-read every candidate individually rather than leaving the whole venue
  // dark, per the standing "don't be overly exclusionary" directive:
  // - Lyndsey+Robert (thedalcy reception, fourthchurch ceremony): candidates 375, 511, 563,
  //   607, 1561, 2518 are all reposts of ONE real wedding (identical 18-vendor stack across
  //   all six) -- 375 (earliest) is the representative kept below, the other five are
  //   deliberately NOT added (would create 6 duplicate weddings for one event).
  // - Isabel+Alex (University Club of Chicago reception, fourthchurch ceremony): candidates
  //   1948 and 2583 are the same wedding (same couple, same planner @bigcitybride
  //   @hansenmadison, same florist @ev.designcollective) -- 2583 (richer, 12-vendor stack
  //   incl. attire) kept, 1948 (9 vendors, subset) not added.
  // - Kim+Tim (wildmanbt reception, fourthchurch ceremony): candidate 2166, standalone,
  //   9-vendor stack, named couple -- kept as-is.
  // - Unnamed couple ("wedding exit" post, fourthchurch only): candidate 2047, standalone
  //   4-vendor stack (cinematography/photography/planner/venue), no repeat pattern -- kept
  //   per the "real credible couple even without a full vendor stack" standing guidance;
  //   distinguished from thefultonwest's excluded content (below) by being a one-off post
  //   describing a specific day's event, not a repeated generic self-marketing caption.
  // - James+Taylor (theexchangechicago reception, fourthchurch ceremony): candidates 2394
  //   and 2833 already reconcile to existing wedding 1262 (confidence 0.4 / 0.8) -- already
  //   in the graph, deliberately NOT added here (would be a duplicate create).
  // thefultonwest's own 9 non-venue-couple-signal candidates (82, 169, 496, 1379, 2886, 2889
  // x2 posts, 2891, 2893, 2894) were also hand-read this session and are correctly excluded,
  // not under-reviewed: every one is the venue's own repeated self-marketing content (two
  // distinct identical vendor-team photo sets reused across "National Cake Day", "Happy World
  // Smile Day," anniversary, and generic capacity-pitch captions) -- no couple is ever named
  // or evidenced across any of the 9, unlike fourthchurch's genuinely distinct events above.
  // This is real Track-C-shaped venue portfolio content, not a documented wedding by this
  // project's own definition -- correctly stays out of `weddings`, not a filter miss.
  375, 2583, 2166, 2047,
  // /label venue_coverage_v3 human-labeling sync, round 1 (D047 follow-on, 2026-09-06):
  // syncHumanLabelsToGoldenSet.ts -> runStackParserOnGoldenSet.ts -> clustering
  // --evidence-source human_confirmed -> reconciliation produced 8 new human-confirmed-v1
  // candidates (3225-3232). Hand-read all 8: 3231 (Kelly & Chris, sarabandechicago, unmatched)
  // and 3229 (Concorde Banquets, "this couple hosted a stunning luxury wedding... casino
  // cocktail hour", weak 0.4-confidence match to a DIFFERENT post on existing wedding 1814 at
  // the same venue -- same "recurring vendor team, different real wedding" pattern established
  // throughout this mission, not a duplicate) are both kept. Excluded: 3230 (0.8-confidence
  // match to wedding 527 -- literally the SAME post_url already in that wedding, a genuine
  // duplicate, not a new event); 3227 (Revel Space "quick tour of the space" -- generic
  // venue-tour marketing, no couple, portfolio-shaped -- correctly lives in
  // venue_portfolio_content instead, not `weddings`); 3225 (generic seasonal "first day of
  // Spring" marketing, no venue tag at all); 3226 and 3228 (real content, but no venue role
  // parsed at all -- not attributable to any venue page, out of scope for a venue-coverage
  // mission even though real); 3232 (Villa Pizzo, Lake Como-shaped destination wedding --
  // no venue tag, and not plausibly Chicago regardless).
  3231, 3229,
  // "venuelogic co-tag" recovery batch (D047 follow-on, 2026-09-06): 160 candidates were
  // excluded by Tier 1/2/3's systematic double-venue-tag filter purely because every post
  // credits BOTH the real venue AND @venuelogic with role='venue' -- hand-read 6/6 samples
  // (3 at bridgeportartcenter, 3 at rockwellontheriver) and every single one uses the exact
  // same clean, unambiguous label pair: "Venue: @<real venue>" + "Venue Management & Bar:
  // @venuelogic" -- venuelogic is a hospitality/event-management company operating both
  // venues' bar service, never a competing venue claim. checkVenueLogicCoTagDuplicates.ts
  // found exactly one suspected intra-batch duplicate (candidates 1200/2993, same photographer,
  // same room "Sculpture Garden Gallery," 8 days apart, jaccard=0.917) -- 2993's "Now booking
  // weddings" marketing framing reads as a promotional repost of 1200's imagery, so 2993 is
  // excluded, 1200 kept. A broader proportionate content-quality spot-check (28 of the
  // remaining 159, ~18%) found one more generic self-marketing post with no specific wedding
  // described (2918, "Contact us today to schedule a tour") -- excluded; the other 27 sampled
  // were genuine specific-day wedding recaps (retrospective language -- "this wedding," "this
  // day" -- even where no couple name is given). Net: 158 created (83 bridgeportartcenter, 75
  // rockwellontheriver). Also recovers candidate 3237 (venue_inline_mention-v1, originally
  // excluded there for the same now-understood-safe {bridgeportartcenter, venuelogic} pattern
  // -- "Mads & Rob's day," named couple, verified no date/vendor overlap with any candidate in
  // this batch).
  438, 444, 453, 458, 459, 492, 497, 504, 508, 515, 530, 536, 555, 576, 583, 601, 604,
  612, 633, 653, 664, 669, 681, 693, 700, 709, 716, 718, 729, 746, 752, 758, 759, 766,
  768, 792, 826, 830, 836, 873, 886, 895, 909, 1001, 1073, 1113, 1135, 1146, 1169, 1200, 1225,
  1251, 1269, 1375, 1426, 1442, 1460, 1529, 1573, 1604, 1624, 1736, 1755, 1849, 1892, 1901, 2010, 2027,
  2032, 2035, 2039, 2049, 2091, 2136, 2149, 2164, 2221, 2307, 2353, 2436, 2594, 2915, 2923, 46,
  86, 264, 289, 301, 310, 332, 336, 352, 423, 431, 437, 441, 457, 467, 471, 505, 514,
  520, 527, 529, 556, 570, 572, 578, 586, 608, 617, 651, 670, 671, 684, 688, 713, 727,
  731, 735, 739, 760, 775, 791, 845, 902, 982, 1003, 1060, 1071, 1112, 1141, 1153, 1168, 1194,
  1203, 1256, 1416, 1431, 1534, 1627, 1645, 1679, 1791, 1913, 1942, 2024, 2042, 2087, 2106, 2420, 2482,
  2687, 2719, 2869, 2904, 2905, 2928,
  3237,
  // /label venue_coverage_v3 queue completion sync (D047 follow-on, 2026-09-06): user finished
  // labeling the full queue (218 WEDDING labels total). Sync found 197 new golden_set INCLUDE
  // rows, of which 184 were already clustered (mostly via v3, already processed by earlier
  // Tier/venuelogic batches -- 86 already documented weddings, 33 already matched to an
  // existing Ben wedding). Of the remainder, 61 candidates were genuinely unresolved
  // (unmatched, uncreated). Excluded: 82/169/2894 (thefultonwest -- already confirmed this
  // session as venue self-marketing, no couple ever named, correctly stays out of `weddings`
  // even though a human labeled the underlying photo content as real wedding imagery -- a
  // Layer-1/structured-entity distinction, not a labeling error); 3259 (no venue resolved,
  // not attributable to any venue page); 2469 (a KNOWN misattribution, already excluded during
  // Tier 1 this session -- caption opens with a real couple's story but the actual venue
  // credit further down is wrong); 1967 (caption explicitly says "@loewschicagohotel" but the
  // parsed venue_account_id resolved to the ambiguous generic "loewshotels" corporate handle --
  // same non-guessing precedent as the earlier-excluded ritzcarlton/stregihotels). The
  // remaining 53 span many small double-venue-tag co-tag patterns (verified via ~20
  // hand-read samples, not a single dominant company like venuelogic this time): ceremony
  // church + reception venue (oldstpatschicago, saintclementparish, lpconservancy each paired
  // with a different real reception venue every time -- same safe pattern as the original
  // fourthchurch override), same-entity-two-handles (artinstitutechi/artinstitutespecialevents,
  // lacuna2150/lacunaloftevents, venutis.banquets/venutisrestaurant,
  // armourhouseweddings/thearmourhousemansion), and one operator-company pattern
  // (totlspecialevents operates Theater on the Lake AND Thompson Chicago's event space, same
  // shape as venuelogic). Same-venue date-collision check across all 10 multi-candidate venue
  // clusters in this batch: every pair is weeks-to-months apart with a fully distinct vendor
  // team (the closest pair, 2228/2246 at saintclementparish 2 days apart, is the EXACT
  // "S+B's reception" vs. "Susanna wore her heart" pair already documented in D047 as a
  // confirmed non-duplicate -- different couples, same trio).
  137, 144, 195, 200, 209, 321, 327, 510, 533, 689, 854, 942, 949, 963, 1024, 1054, 1082,
  1266, 1311, 1372, 1443, 1454, 1535, 1590, 1592, 1633, 1714, 1741, 1799, 1854, 1912, 1954,
  2113, 2178, 2228, 2246, 2287, 2407, 2408, 2455, 2511, 2547, 2569, 2571, 2641, 2650, 2688,
  2695, 2734, 2750, 2846, 3176, 3224,
  // venue_inline_mention_post_vendor_evidence, round 1 (D047 follow-on, 2026-09-06): a new,
  // fourth clustering evidence source recovering the missing venue-role credit for posts (any
  // author, mostly non-venue vendors) that inline-mention a known Chicago venue handle without
  // a labeled "Venue:" line -- see pipeline/schema.sql's view comment for the full scoping
  // rationale. Clustered 26 candidates (3233-3258); hand-read all of them. Excluded for
  // double-venue-tag ambiguity (same systematic filter as Tier 1/2/3): 3237
  // (bridgeportartcenter + venuelogic), 3243 (riverroastchi + the.arbory), 3246 (deerpathinn +
  // medinahcountryclub), 3252 (morgansonfulton + saintclementparish), 3257 (4-way ambiguous:
  // hangoutlighting/interconchicago/ivyroomchicago/thegwenchicago). Excluded as within-batch
  // duplicates (same couple, same venue, different post >21 days apart -- outside the standard
  // clustering window so they became separate candidates instead of merging): 3250 (same
  // @taykmar @guccibandemma couple as 3244, kept 3244), 3251 (same Annie+Matt couple as 3249,
  // kept 3249). Excluded: 3256 (post433chicago, account_locations explicitly says NOT
  // Chicago-metro despite the name). The remaining 18 are genuinely distinct real weddings
  // (18 different named couples/events, 18 different post dates spanning 2024-2026, no
  // duplicate signal) at 14 different already-known Chicago venues.
  3233, 3234, 3235, 3236, 3238, 3239, 3240, 3241, 3242, 3244, 3245, 3247, 3248, 3249, 3253, 3254,
  3255, 3258,
  // Track A batch 10 newly-unlocked candidate (D047 follow-on, 2026-09-06): candidate 1675
  // (terrace16chicago, unmatched at 0.1... actually weak 0.4-confidence match to wedding 1424,
  // a DIFFERENT post at the same venue -- same recurring-vendor-team pattern established
  // throughout this mission). Double-venue-tag override, hand-verified not a real
  // ambiguity: tagged both @terrace16chicago and @trumptowerchicago -- confirmed via WebSearch
  // that Terrace 16 physically IS the 16th-floor restaurant inside Trump Tower Chicago, same
  // single real location, same reasoning as the fourthchurch ceremony+reception override.
  1675,
  // Double-venue-tag-ambiguity backlog, round 2 (D047 follow-on, 2026-09-06): after the
  // venuelogic recovery batch + /label sync, the remaining backlog dropped from 354 to 151,
  // now spread thin across many smaller venues (max 6 per venue) rather than concentrated at
  // one dominant company. Hand-read 9 of 39 candidates (23%) across every distinct co-tag
  // pattern in this batch's top-8 venues; all confirmed safe: MORE venuelogic co-tags that
  // slipped past the original sweep (rockwellontheriver: 379/1216/2267 pairs + 1607 a 3-day
  // Indian-Polish multi-venue wedding; bridgeportartcenter: 945/1997/2329 pairs -- 2918
  // excluded, already identified as a marketing repost in the original venuelogic batch),
  // ceremony+reception (christ_church_winnetka+universityclubofchicago/uclubashley,
  // assumption_church_chicago+thedrakechicago/therookerybuilding/thewellsley), a
  // same-entity+ceremony combo (cbgweddings/chicagobotanic+stharalambosgoc -- Chicago Botanic
  // Garden's two handles plus a church), and one full-vendor-stack single (155, a wedding
  // planner's personal-brand-voice caption with zero couple name but a complete, specific
  // 15-vendor credit stack -- same "even without a couple name, a real credible full stack"
  // bar as earlier in this mission). Date-collision check across all 8 venue clusters: every
  // pair is weeks-to-months apart, no overlap.
  26, 28, 143, 155, 193, 248, 318, 379, 393, 425, 429, 446, 543, 742, 748, 781, 945, 985,
  1187, 1199, 1216, 1263, 1296, 1584, 1605, 1607, 1816, 1879, 1978, 1997, 2187, 2267, 2271,
  2329, 2510, 2555, 2749, 2862,
  // D048 follow-on (2026-09-06): first sync round of the new `/label` beyond_include_v1 queue
  // (user labeled 235, 115 WEDDING). Clustering (--evidence-source human_confirmed) created 106
  // new candidates (3260-3365) + attached 5 to existing ones. Hand-read all 15 double-venue-tag
  // ambiguous ones: 10 safe (ceremony+reception, same-entity co-tags, or a legitimate
  // multi-location single wedding day), excluded 5 -- 3320 and 3362 are portfolio/annual-recap
  // posts describing MULTIPLE different real weddings in ONE caption (a planner's "Wedding 1/
  // Wedding 2/Wedding 3" roundup, or "First picture: Grant and Elise... Stephen and Simone...
  // Nick and Madi..."), structurally impossible to attribute to a single wedding in this
  // pipeline's one-candidate-one-event model -- real content, just not usable here; 3316/3345/
  // 3348 are generic educational/marketing posts with no specific wedding described at all.
  // Of the 42 weak-match (<0.75 confidence) candidates, checked every one for an exact
  // same-post_url duplicate against its matched wedding: found exactly one real duplicate
  // (3310, matched to wedding 289 -- theallureonthelake, same post already counted; separately
  // flagged this session for an is_chicago correction, not yet executed) -- excluded; the other
  // 41 are different posts at the same venue, the same "recurring vendor team, different real
  // wedding" pattern verified all session. Full same-venue date-collision check across the
  // resulting 88: exactly one close pair (3353/3356, both artinstitutespecialevents, 7 days
  // apart) -- 3353 is generic beauty-vendor marketing ("Book now!", no couple), 3356 is Alex &
  // Carlton's specific, fully-vendor-credited wedding -- excluded 3353, kept 3356. Also found 2
  // more genuine same-entity account pairs while hand-reading (halimmuseum/halimmuseumevents,
  // armourhouseweddings/thearmourhousemansion) -- not yet added to account_aliases, flagged for
  // a follow-up batch. Net: 87 new weddings.
  3260, 3261, 3262, 3263, 3264, 3266, 3267, 3269, 3270, 3272, 3274, 3275, 3276, 3277, 3278, 3279,
  3280, 3281, 3282, 3284, 3285, 3286, 3287, 3288, 3289, 3291, 3292, 3293, 3294, 3295, 3296, 3297,
  3298, 3300, 3301, 3302, 3303, 3304, 3305, 3306, 3307, 3308, 3309, 3311, 3312, 3313, 3314, 3315,
  3317, 3318, 3319, 3321, 3322, 3323, 3325, 3326, 3327, 3328, 3329, 3330, 3331, 3333, 3334, 3336,
  3337, 3338, 3340, 3341, 3342, 3343, 3344, 3346, 3347, 3349, 3350, 3351, 3352, 3354, 3355, 3356,
  3357, 3358, 3359, 3360, 3364,
  // D049 follow-on (2026-09-07): first sync round of the new `/label` styled_shoot_v1 queue
  // (user labeled all 80, 37 WEDDING). Sync + clustering (--evidence-source human_confirmed)
  // created 39 new candidates (3366-3404) + attached 3 to existing. Reconciliation: 2 already
  // high-confidence-matched an existing wedding, 4 ambiguous-matched (left as an inert belief,
  // never auto-merged, same policy as every prior round), 8 had no resolvable venue account at
  // all (skipped, no anchor to create against). That left 25 creation-eligible (17 with an
  // existing-but-non-matching venue, 8 at a venue with zero prior weddings) -- hand-read every
  // one of them, not a sample, since this batch is small. Two exclusion reasons showed up that
  // hadn't been this concentrated in a single round before:
  // (1) GEOGRAPHY, not content -- 7 of the 25 resolve to a venue with NO confirmed Chicago
  //     account_locations/vendors.city row (or an explicit non-Chicago one), several strongly
  //     suggesting a real but out-of-market venue: etrefarms (vendors.city literally
  //     "Southwest Michigan"), experience_nd (Notre Dame, Indiana -- the caption itself says "A
  //     St. Patty's Weekend Wedding at Notre Dame"), longbeachcc1924 (Long Beach Country Club,
  //     the same NW-Indiana wedding corridor as the already-flagged theallureonthelake/
  //     dunespavilion/whitehawkcc), lakeshoreresort_saugatuck (Saugatuck, Michigan by name),
  //     tivoliweddings (caption says "flew me to California to shoot this wedding"),
  //     destinationgnweddings (no geo, "destination" branding, generic copy),
  //     dallasarboretumweddings (no geo, unambiguously a Dallas, TX venue by name). None created
  //     -- matches this project's "a wedding is Chicago iff its venue is" principle exactly; a
  //     human labeler fast-labeling caption content alone has no way to see this, which is a
  //     real gap worth fixing in the `/label` UI (surface geography-confirmation status), not a
  //     labeling mistake.
  // (2) GENERIC VENDOR MARKETING, not a documented specific wedding -- langhamchicago/3370 (an
  //     officiant's service pitch, "invest in a skilled officiant," with a website URL, no
  //     couple), thedalcy/3374 ("let us help plan 2026 weddings," future-tense pitch),
  //     wildmanbt/3384 (caption literally says "this stunning editorial shoot we created" --
  //     exactly the styled-shoot false-positive this whole D049 mission exists to catch),
  //     fairliechicago/3386 (generic venue-space copy, the labeler's own note said "not entirely
  //     sure"), tigerlilyevents/3389 (seating-chart tips, labeler's own note said "kinda
  //     promotional"), chicagoculturalcenter/3390 (a seasonal "excited for spring" announcement,
  //     not one wedding), thegeraghty/3393 (a "surprise" reveal of a "bespoke environment" for
  //     one named person -- genuinely unclear this is a wedding ceremony, not just a proposal or
  //     private event), bridgeportartcenter/3394 (explicit package/pricing copy, "Not sure which
  //     of our packages is right for you?"), villalefontanelle/3372 (a videographer's brand-
  //     philosophy pitch, and separately not a Chicago venue -- Lake Como, Italy), thewcofe/3373
  //     (a vendor's personal reflection on the venue generally, no specific event). Also excluded
  //     pending verification, not content: meyerscastle/3402 (real-reading content, named couple
  //     Rechna and Mark, labeler's own note said "real wedding" -- but zero geography on file,
  //     unlike every kept candidate below which has account_locations.in_metro=true or an
  //     unambiguous named landmark; worth a WebSearch verification pass before adding, not
  //     assumed either way).
  // The 7 kept are Chicago-confirmed (account_locations.in_metro=true, or thedrakechicago's
  // unambiguous real Michigan-Ave hotel identity) AND describe one specific real event: Lily &
  // Craig (waldenchicago, 3377), Sara & Ramiro (wildmanbt, 3381), a Palestinian
  // bride/Egyptian groom wedding (chicagoculturalcenter, 3392), Katie's summer wedding
  // (thedrakechicago, 3395), Raquel & Miguel (waldenchicago, 3401), an unnamed but specifically-
  // described "destination wedding, part home turf comfort" couple (adlerplanet, 3380), and a
  // New Year's Eve wedding recap with a rich, specific 9-vendor credit stack despite stylized
  // copy (langhamchicago, 3385).
  3377, 3380, 3381, 3385, 3392, 3395, 3401,
  // D050 follow-on (2026-09-07): coverage-gap Track 1, zero-coverage-venue batch. After the
  // secondary-venue-anchor bug fix (see D050), re-derived the unmatched-candidate pool fresh:
  // 55 candidates land at a zero-documented-wedding venue. Hand-read all 37 that had a resolved,
  // correctly-categorized venue account (18 were skipped up front: 4 already-decided in D049 for
  // non-Chicago geography, 5 miscategorized as venue when `vendors.category` says
  // planner/caterer/dj_music, 4 with a NULL venue post-fix, 1 known mixed-content publication
  // account masquerading as venue in `vendors` itself, plus a few more excluded during the read
  // for the same reasons below). Of the 37: **26 excluded, 11 kept**.
  // Excluded for the SAME shape of bug D050 just fixed, but not caught by the parser regex
  // (a different, non-"secondary-event" account co-tagged on the same "Venue:" line, not a real
  // distinct venue): austinjamescreative/33 (real venue: loewschicago), abarestaurant/237 (real:
  // thedalcy, caption literally says "at The Dalcy"), _bdarbs/567 (real: thecanvasvenue),
  // nickpodraza/1252 (real: thewellsley, caption says "at The Wellsley"), alyssabudayyeh/1475
  // (real: theexchangechicago, caption says "at The Exchange Chicago"), baravecchicago/1500
  // (real: morgan.mfg, explicit "Venue: @morgan.mfg" on the post), figdrinks/1698 (real:
  // thejoinerychicago), madhauscollective/2270 (real: theelleryvenue, explicit on all 3 posts),
  // murphysbleachers/2319 (real: thewellsley, explicit "Venue: @thewellsley"), haisouschicago/2584
  // (real: lincolnparkzoo's People's Gas Pavilion), alterbeer/2743 (real: mortonarb, explicit
  // "venues: @mortonarb @eventsatmortonarboretum @alterbeer" -- alterbeer is the beverage
  // vendor). loewshotels/1967 excluded per the already-established ritzcarlton/stregihotels
  // precedent (caption says "@loewschicagohotel," resolved account is the ambiguous generic
  // "loewshotels" corporate handle -- never guess which). artinstituespecialevents/1523 (note
  // the missing 't' -- "institue") excluded as a likely 4th Art Institute handle variant, same
  // entity as the 3 already in `account_aliases`, flagged for that follow-up rather than created
  // as a new venue. chicagolinecruises/2101/2208 excluded -- genuinely ambiguous (the boat cruise
  // itself vs. the land venue "Venue: @giltbar" explicitly labeled separately on the same posts),
  // defaulted to exclude per "never guess." small.but.mighty15/1568 excluded (text-only "The
  // Blackstone" mention, never resolved to an @handle). Excluded as generic self-marketing, no
  // specific wedding (matches the "Book now!"/no-couple-named pattern established all session):
  // floatingworldevents/1290/1756 (explicit "Book now!"/"book your bridal beauty session today!"
  // CTAs -- floatingworldgallery/floatingworldevents ARE a real venue per other evidence, just
  // not documented by these two specific posts), carloacutischi/2366 (beauty vendor brand
  // philosophy, no venue), eventswcoe/2741 (planner brand philosophy, no venue),
  // floatingworldgallery/1115 (generic aisle-anxiety copy, no specific event), chez.hotel/1166 and
  // episcope.hospitality/923 (thin -- no venue credit visible at all in either caption),
  // ariella.e/138 (thin -- no venue credit visible). Excluded for non-Chicago geography:
  // golfkohler/2951 and destinationgn/2984 (both explicitly Kohler, WI / Lake Geneva, WI).
  // Kept -- Chicago-confirmed (account_locations.in_metro=true, or a strong self-declared
  // Chicago/suburb name for the 3 without a location row) AND a specific real event: churches
  // and campus venues treated as legitimate standalone venues, same precedent as
  // fourthchurch/saintclementparish/holynamecathedral elsewhere this session --
  // stjosaphatparish/295, quadclub.uchicago/542 (Univ. of Chicago's Quadrangle Club), stsvo/1154,
  // holynamechicago/1250, stbenschicago/1384, stgilesoakpark/2673 (Noah + Haley, named couple),
  // assumptionchi/2700 (a church credit alongside an already-well-covered Field Museum reception
  // -- kept as its own legitimate ceremony venue, same "both are real" reasoning as every
  // ceremony+reception pair this session). Real, specific, named-event venues:
  // cuneomansion/1380 (Vernon Hills, in_metro=true; named couple, dated 10/25/25),
  // chicagopubliclibrary/1423 (Harold Washington Library, named couple Lexie + Jake),
  // northshorecountryclub/1462+1571 (Glenview, in_metro=true; two different named-couple
  // weddings a month apart, same recurring vendor team -- date-checked, not a duplicate).
  295, 542, 1154, 1250, 1380, 1384, 1423, 1462, 1571, 2673, 2700,
  // D050 follow-on (2026-09-07): coverage-gap Track 1, the 1-5-documented-wedding bucket.
  // 55 candidates, deduped and filtered (already-created via the batch above, or already
  // decided in D049's 3366-3404 range -- etrefarms/3367 excluded there for geography,
  // meyerscastle/3402 left pending -- excluded again here, not re-litigated) to 23 distinct
  // venues / ~50 candidates worth reading. Two large single-venue clusters dominated and were
  // NOT individually hand-read one by one -- their pattern was already established/confirmed by
  // sampling multiple posts each:
  // - thefultonwest (22 candidates: 82, 169, 208(no -- see below), 496, 1379, 2886, 2889, 2891,
  //   2893, 2894, 3039, 3057, 3060, 3133, 3137, 3143, 3150, 3154, 3155, 3165, 3172, 3179, 3194,
  //   3196, 3206, 3210) -- ALL excluded. Same finding as D048's original 9-candidate read,
  //   confirmed again on 4 new spot-checks (3039, 3133, 3172, 3206): every post is the venue's
  //   own repeated self-marketing ("Perfect for your next dinner party!", "#EventVenue
  //   #TablescapeInspo", one explicitly a "farewell event" -- not even a wedding), never a named
  //   couple. Real content, just not a documented wedding by this project's own definition.
  // - thegwenchicago (6 candidates: 3108, 3114, 3120, 3132, 3158, 3171) -- ALL excluded, a NEW
  //   finding: every one is either @chicagostyleweddings' "Designers' Challenge" (a styled
  //   competition between planners, explicitly not a real wedding -- "vote for...", "stay tuned
  //   for the Designers' Challenge") or a direct marketing/booking offer ("book by March 31...",
  //   "don't miss the Gwen Affair offer"). Zero real wedding content in this sample -- worth
  //   remembering thegwenchicago skews heavily promotional if it resurfaces.
  // Also excluded, same co-tagged-wrong-account bug shape as the zero-coverage batch above:
  // art_imagination/208 (real venue: bridgeportartcenter, already covered). Excluded as
  // ambiguous generic corporate handle (established ritzcarlton/loewshotels/stregihotels
  // precedent): stregischicago/2150/2505/3211 (all pure venue-advertisement copy anyway, e.g.
  // "Let The St. Regis Chicago become part of your forever story... discover"). Excluded as
  // generic self-marketing/thin/wrong-event-type: anitadeeyachtcharters/1118 (no couple, no
  // stack), 167greenstreet's second candidate/1191 (thin duplicate photographer-philosophy
  // copy -- the venue itself IS real, confirmed via 868 below), schubas_tiedhouse/1386
  // ("Book your bridal preview with us today!"), louloubylula/2143 (a florist review, not venue
  // content), uccweddings/2633 (generic "reception inspo," no couple), celebrateatbloom/2906
  // (caption explicitly says "so I could scratch the creative itch before wedding season kicks
  // off" -- an admitted creative/promotional shoot, not a real wedding), venuewestchicago/3041
  // (explicitly a "Glitz and Glam Bat Mitzvah," not a wedding at all).
  // Kept -- real, specific, named-couple/dated events, Chicago-confirmed
  // (account_locations.in_metro=true for all except 167greenstreet/amazingspacechicago/
  // bottomlounge/rpmeventschicago, which have no location row but a strong self-declared
  // Chicago signal -- a named downtown church, "chicago" in the account name, or common-knowledge
  // real Chicago venues already treated this way elsewhere this session):
  // hilton_chicago_hotel/217+481+2870 (three DIFFERENT weddings, date-checked 5+ months apart
  // each -- Shapiros June 2024, a second Nov 2024, Sergum & Ryan Aug 2026; 217's post explicitly
  // labels "Ceremony Venue Holy Name Cathedral" + "Reception Venue Hilton Chicago", a clean
  // ceremony+reception pair), amazingspacechicago/849 (the established-safe venuelogic co-tag
  // pattern from D047), 167greenstreet/868 (a real rainy-day wedding, "Getting Ready Venue:
  // @thehoxtonhotel" correctly excluded by this session's own D050 parser fix), rpmeventschicago
  // /1096 (Heather & Jimmy, explicit clean "Venue" role_raw on a full 10-vendor stack),
  // bottomlounge/1344 (Joan & JT, "tied the knot Saturday at @bottomlounge"), oakbrookhillsresort
  // /2112 (Oak Brook, in_metro=true; #DelgadoRodriguezWedding, the couple's own post),
  // icsjparish/2404 (Bridget & Ryan, 3 posts of specific content, caption says "this city...
  // Chicago"), lpconservancy/2539 (Simona & Garrett, ceremony in Lincoln Park -- reception at
  // the already-covered universityclubofchicago, both real per this session's standing
  // ceremony+reception reasoning), cafebrauer/2552 (Katie & Ned, explicit "Venue: @cafebrauer"),
  // cantignypark/2579+2629 (Wheaton, in_metro=true; two different named couples, The Wiettings
  // and Madeline+Chris), medinahcountryclub/3246 (named couple initials J+J, full ceremony+
  // reception vendor stack).
  217, 481, 849, 868, 1096, 1344, 2112, 2404, 2539, 2552, 2579, 2629, 2870, 3246,
  // D050 follow-on (2026-09-07): Track 2.1, the double-venue-tag anchoring gap for the 4
  // originally-flagged real-credit-but-not-anchoring venues. Resolved: msichicago's only "venue"
  // credit was itself a Sangeet Venue (correctly excluded by this session's own parser fix, not
  // a bug -- and the post is golden_set EXCLUDE anyway, a human already said not-real).
  // theoakbrookmanor's only credit is a real, thin 2-role post below the 3-role clustering floor
  // -- structural, not fixable here. thehomestead1854's only "venue" credit is on a 15-different-
  // venues-on-one-post portfolio/roundup post (candidate 3362) -- the same "multi-wedding recap,
  // structurally unusable" shape D048 already established, correctly left uncreated regardless
  // of which of the 15 venues its arbitrary anchor picked; not touched here. naturemuseum WAS a
  // real, fixable case: candidate 2541 is a genuine ceremony ("Ceremony Venue: @lincolnparkzoo",
  // already well-covered) + reception ("Reception Venue: @naturemuseum", zero coverage) pair,
  // arbitrarily anchored to the ceremony church by the same coalesce/no-tiebreak mechanism as
  // D050's main fix -- corrected `venue_account_id` directly to naturemuseum (the reception
  // venue, this session's standing tiebreak convention). Real, named-couple content ("L & A
  // wanted their reception to feel like an elevated al fresco dinner..."), 14-vendor stack,
  // golden_set INCLUDE.
  2541,
  // beyond_include_v1 round 2 sync (2026-09-07): user finished the queue (782->833, then all
  // remaining), 435 new labels synced (source_note beyond_include_v1_sync_round2_2026-09-07,
  // 451 total incl. leftovers), 110 new human-confirmed-v1 candidates clustered. Of the 34
  // creation-eligible after reconciliation: **10 excluded for non-Chicago geography** --
  // golfkohler/2951, lakeshoreresort_saugatuck/3482, destinationgn/3498, experience_nd/3506
  // (all already-established non-Chicago patterns resurfacing), theatriummke/3449 (Milwaukee),
  // grandgeneva/3512 and abbeyresort/3450+3465+3513+3514 (x4, all Lake Geneva/Fontana,
  // Wisconsin), rockfordartmuseum/3493 (Rockford, IL -- a separate city ~90mi from Chicago,
  // ceremony+reception pair otherwise looked real but geography disqualifies). **2 excluded,
  // same unconfirmed-geography caution as D049's original etrefarms exclusion** (etrefarms/
  // 3418+3445, `vendors.city` literally says "Southwest Michigan" -- real content, named
  // couples, just not confirmed Chicago). **Excluded as misresolved co-tag or generic
  // marketing**: annunciation_cathedral_chicago/3441 (the post is actually Blue Plate Chicago's
  // own catering ad, `#BluePlateChicago`, not evidence of a wedding at the cathedral),
  // peninsulachi/3433 (generic "National Wedding Planning Day" holiday post), weddings.oftheland
  // /3430 (a feature-announcement repost, no confirmed venue-hood or geography), thedalcy/3417+
  // 3420+3444+3470 (all explicit "inquire/book with us" marketing CTAs, not one specific
  // wedding), tigerlilyevents/3416+3440 and fairliechicago/3409+3434 (seasonal/advice marketing,
  // no couple), the.arbory/3481 ("Book your 2026 wedding now!"), bridgeportartcenter/3484 (a
  // cake vendor's own promo post), adlerplanet/3491 (a planner's retrospective brand story, no
  // couple named -- adlerplanet already well-covered regardless). **7 kept** -- real, specific,
  // Chicago-confirmed: the.arbory/3405 (explicit "Venue: @the.arbory", already 89 weddings),
  // cbgweddings/3415 (explicit primary venue tag, already 15 weddings), adlerplanet/3429
  // (explicit venue tag + #ChicagoWeddings hashtags, already 54 weddings), lilbabareeba/3438
  // (Mitch & Clyde, named couple, exact date 5.17.25, caption explicitly names Winnetka --
  // trusted per this project's own "explicit Chicago mention" confidence tier, same as
  // human_confirmed_post_geography's own design), universityclubofchicago/3446 (explicit venue
  // tag, already 50 weddings), psbrewingco/3454 (Caroline & William, named couple, explicit
  // venue tag).
  3405, 3415, 3429, 3438, 3446, 3454,
];

function shortcodeFromUrl(url: string): string | null {
  const m = url.match(/\/p\/([^/]+)/);
  return m ? m[1] : null;
}

// D055 preflight refusal (Phase 1 step 9): the provenance rule is "no create batch without a
// snapshot + batch id" (snapshotGraphTables.ts / revertWeddingBatch.ts's own doc comments) --
// batch-id is already enforced above; this enforces the snapshot half for real (non-dry-run)
// writes. A snapshot directory's NAME embeds an ISO timestamp, but mtime is simpler/robust to
// check directly and is what "took a snapshot recently" actually means on disk.
function hasRecentSnapshot(): boolean {
  const dir = new URL("./snapshots", import.meta.url).pathname;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false; // no snapshots/ directory at all
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const entry of entries) {
    try {
      const stat = statSync(`${dir}/${entry}`);
      if (stat.isDirectory() && now - stat.mtimeMs < dayMs) return true;
    } catch {
      continue;
    }
  }
  return false;
}

interface FromConfirmedCandidatesOptions {
  since?: string;
  limit?: number;
}

interface FromConfirmedCandidatesResult {
  weddingsCreated: number;
  postsImported: number;
  vendorsInserted: number;
}

/**
 * `--from-confirmed-candidates` mode (D055 Phase 1 step 9, revised for the post-per-screen
 * review redesign). Reads eligible candidates from `candidate_review_derived` (assembled from
 * `post_venue_verdicts` -- see pipeline/schema.sql) + `jeremy_wedding_candidates`
 * (structural-v2 only, not already created), requires the candidate to be COMPLETE
 * (posts_decided = posts_total -- every one of its posts has a non-SKIP verdict, not just some),
 * gates each one (wrong-venue-no-correction, then no-included-posts, then the Chicago gate --
 * see structuralCandidateGating.ts), and for CREATE candidates attaches ONLY
 * `included_post_urls` (the THIS_VENUE-verdict posts) -- never `other_venue_post_urls`, which
 * belong to a different venue's wedding entirely, not this one. Runs the same insert shape as
 * the hardcoded-array loop above (weddings / accounts / posts / wedding_posts / wedding_vendors /
 * jeremy_weddings_created), reusing the identical D050 duplicate-post guard, scoped throughout to
 * the included posts only (wedding_vendors is derived from structural_post_vendor_evidence rows
 * for those posts only, not the candidate's full post set). Everything here runs inside the
 * caller's existing transaction -- dry-run rollback and --batch-id are handled once, by main(),
 * for both modes.
 */
async function runFromConfirmedCandidates(
  client: PoolClient,
  batchId: string,
  opts: FromConfirmedCandidatesOptions
): Promise<FromConfirmedCandidatesResult> {
  let weddingsCreated = 0;
  let postsImported = 0;
  let vendorsInserted = 0;

  const { rows: eligible } = await client.query<{
    candidate_id: number;
    venue_account_id: number | null;
    event_date_est: string | null;
    chicago_status: ChicagoStatus;
    decision: StructuralReviewDecision;
    corrected_venue_account_id: number | null;
    included_post_urls: string[] | null;
  }>(
    `select
       jwc.id as candidate_id,
       jwc.venue_account_id::int as venue_account_id,
       jwc.event_date_est::text as event_date_est,
       jwc.chicago_status,
       crd.decision,
       crd.corrected_venue_account_id::int as corrected_venue_account_id,
       crd.included_post_urls
     from candidate_review_derived crd
     join jeremy_wedding_candidates jwc on jwc.id = crd.candidate_id
     where crd.decision in ('CONFIRM', 'WRONG_VENUE')
       and crd.posts_decided = crd.posts_total
       and jwc.clustering_version = $1
       and not exists (select 1 from jeremy_weddings_created jc where jc.candidate_id = jwc.id)
       and ($2::timestamptz is null or crd.reviewed_at >= $2::timestamptz)
     order by crd.reviewed_at asc`,
    [STRUCTURAL_CLUSTERING_VERSION, opts.since ?? null]
  );

  const scoped = opts.limit != null ? eligible.slice(0, opts.limit) : eligible;

  console.log(
    `[create-weddings] --from-confirmed-candidates: clustering_version=${STRUCTURAL_CLUSTERING_VERSION} ` +
      `eligible=${eligible.length}${opts.since ? ` since=${opts.since}` : ""} ` +
      `processing=${scoped.length}${opts.limit != null ? ` (--limit ${opts.limit})` : ""}`
  );

  const outcomeCounts: Record<string, number> = {};
  const bump = (label: string) => {
    outcomeCounts[label] = (outcomeCounts[label] ?? 0) + 1;
  };

  // venueAccountId (canonical, pre-alias-resolution — resolved below) -> # new weddings this
  // batch would add there, for the coverage-bucket delta.
  const newWeddingsByVenue = new Map<number, number>();

  for (const cand of scoped) {
    // Race guard (the eligibility query already excludes these — this only matters if another
    // invocation of this same script is running concurrently against the same batch window).
    const { rows: existingCreated } = await client.query<{ wedding_id: number }>(
      `select wedding_id from jeremy_weddings_created where candidate_id = $1`,
      [cand.candidate_id]
    );
    if (existingCreated.length > 0) {
      console.log(
        `[create-weddings] candidate=${cand.candidate_id} already created as wedding=${existingCreated[0].wedding_id}, skipping`
      );
      bump("SKIP(already_created)");
      continue;
    }

    // Only the THIS_VENUE-verdict posts are ever attached — never other_venue_post_urls (a
    // different venue's wedding entirely).
    const includedUrls = cand.included_post_urls ?? [];

    // Geography is resolved against the EFFECTIVE venue (corrected, for WRONG_VENUE) — never
    // the original wrong one.
    const geoTargetAccountId =
      cand.decision === "WRONG_VENUE" ? cand.corrected_venue_account_id : cand.venue_account_id;

    let venueCityIsChicago = false;
    let venueInMetro = false;
    if (geoTargetAccountId != null) {
      const { rows: geoRows } = await client.query<{ city_chicago: boolean; in_metro: boolean }>(
        `select
           exists(select 1 from vendors v where v.account_id = $1 and v.city = 'Chicago') as city_chicago,
           coalesce((select al.in_metro from account_locations al where al.account_id = $1), false) as in_metro`,
        [geoTargetAccountId]
      );
      venueCityIsChicago = geoRows[0].city_chicago;
      venueInMetro = geoRows[0].in_metro;
    }

    const gate = decideStructuralCandidateCreation({
      decision: cand.decision,
      originalVenueAccountId: cand.venue_account_id,
      correctedVenueAccountId: cand.corrected_venue_account_id,
      chicagoStatus: cand.chicago_status,
      venueCityIsChicago,
      venueInMetro,
      includedPostUrls: cand.included_post_urls,
    });

    const displayVenueAccountId = gate.action === "CREATE" ? gate.venueAccountId : geoTargetAccountId;
    let venueUsername = "?";
    if (displayVenueAccountId != null) {
      const { rows: unameRows } = await client.query<{ username: string }>(
        `select username::text as username from accounts where id = $1`,
        [displayVenueAccountId]
      );
      venueUsername = unameRows[0]?.username ?? "?";
    }

    // Vendors straight from structural_post_vendor_evidence, scoped to includedUrls ONLY (the
    // THIS_VENUE posts) -- NOT jeremy_wedding_candidate_vendors (that view only unions
    // jeremy_post_vendor_evidence + human_confirmed_post_vendor_evidence and doesn't cover this
    // evidence source; confirmed by reading pipeline/schema.sql -- see the script's final-report
    // note for the proposed, unapplied view extension) and NOT every post the candidate ever had
    // (that would leak OTHER_VENUE vendor credits into this wedding). role<>'venue' since the
    // venue role is handled explicitly below (and, for WRONG_VENUE, must be the CORRECTED
    // account, not whatever the evidence view anchored).
    const { rows: nonVenueVendors } = await client.query<{
      account_id: number;
      role: string;
      n_confirmations: number;
    }>(
      `select spve.account_id::int as account_id, spve.role, count(distinct spve.source_post_url)::int as n_confirmations
       from structural_post_vendor_evidence spve
       where spve.source_post_url = any($1::text[]) and spve.role <> 'venue'
       group by spve.account_id, spve.role`,
      [includedUrls]
    );

    let vendorsForPrint = nonVenueVendors.length + (displayVenueAccountId != null ? 1 : 0);

    if (gate.action === "CREATE") {
      // D050 duplicate-post guard, same check as the hardcoded-array loop: if any of this
      // candidate's INCLUDED posts already belongs to an EXISTING wedding's wedding_posts, the
      // event is already documented — creating a second wedding would repeat the exact
      // orphaned-wedding bug D050 fixed. Shortcodes derived straight from the URLs -- no need to
      // fetch full post rows just to check this.
      const shortcodes = includedUrls.map((u) => shortcodeFromUrl(u)).filter((s): s is string => s !== null);
      const { rows: alreadyDocumented } = await client.query<{ wedding_id: number }>(
        `select wp.wedding_id from posts p join wedding_posts wp on wp.post_id = p.id where p.shortcode = any($1::text[])`,
        [shortcodes]
      );

      if (alreadyDocumented.length > 0) {
        console.log(
          `[create-weddings] candidate=${cand.candidate_id} venue=@${venueUsername} decision=${cand.decision} posts=${includedUrls.length} vendors=${vendorsForPrint} -> SKIP(duplicate_post) — already belongs to wedding=${alreadyDocumented[0].wedding_id}`
        );
        bump("SKIP(duplicate_post)");
        continue;
      }

      console.log(
        `[create-weddings] candidate=${cand.candidate_id} venue=@${venueUsername} decision=${cand.decision} posts=${includedUrls.length} vendors=${vendorsForPrint} -> CREATE`
      );
      bump("CREATE");

      const venueAccountId = gate.venueAccountId;

      const { rows: weddingRows } = await client.query<{ id: number }>(
        `insert into weddings (venue_id, event_date_est, is_chicago) values ($1, $2, $3) returning id`,
        [venueAccountId, cand.event_date_est, true]
      );
      const weddingId = weddingRows[0].id;
      weddingsCreated++;
      newWeddingsByVenue.set(venueAccountId, (newWeddingsByVenue.get(venueAccountId) ?? 0) + 1);

      // Full post rows, fetched ONLY for the included (THIS_VENUE) urls -- never
      // other_venue_post_urls.
      const { rows: posts } = await client.query<{
        post_url: string;
        caption_raw: string | null;
        post_timestamp: string;
        owner_username: string;
        likes_count: number | null;
      }>(
        `select post_url, caption_raw, post_timestamp::text, owner_username, likes_count
         from staging.instagram_posts
         where post_url = any($1::text[])`,
        [includedUrls]
      );

      for (const p of posts) {
        const shortcode = shortcodeFromUrl(p.post_url);
        if (!shortcode) continue;

        const { rows: ownerRows } = await client.query<{ id: number }>(
          `insert into accounts (username) values ($1)
           on conflict (username) do update set username = excluded.username
           returning id`,
          [p.owner_username.toLowerCase()]
        );
        const ownerId = ownerRows[0].id;

        const { rows: postRows } = await client.query<{ id: number }>(
          `insert into posts (shortcode, url, owner_id, caption, posted_at, likes_count, source, raw)
           values ($1, $2, $3, $4, $5, $6, 'jeremy_evidence', $7)
           on conflict (shortcode) do nothing
           returning id`,
          [shortcode, p.post_url, ownerId, p.caption_raw, p.post_timestamp, p.likes_count, JSON.stringify(p)]
        );
        if (postRows.length === 0) continue;
        postsImported++;
        const postId = postRows[0].id;

        await client.query(`insert into wedding_posts (wedding_id, post_id) values ($1, $2) on conflict (post_id) do nothing`, [
          weddingId,
          postId,
        ]);
      }

      // Venue-role n_confirmations: how many of the INCLUDED posts actually anchored on the
      // ORIGINAL venue_account_id via structural_post_vendor_evidence. For WRONG_VENUE this is
      // always 0 in practice (candidate_review_derived only sets WRONG_VENUE when there are zero
      // THIS_VENUE posts to begin with, so includedUrls would be empty and the gate would already
      // have skipped as no_included_posts) -- 1 confirmation, standing for the human review
      // itself, same as every other reviewer-supplied-fact convention in this pipeline.
      let venueNConfirmations = 1;
      if (cand.decision === "CONFIRM" && cand.venue_account_id != null) {
        const { rows: vc } = await client.query<{ n: string }>(
          `select count(distinct spve.source_post_url)::text as n
           from structural_post_vendor_evidence spve
           where spve.source_post_url = any($1::text[]) and spve.role = 'venue' and spve.account_id = $2`,
          [includedUrls, cand.venue_account_id]
        );
        venueNConfirmations = Math.max(1, Number(vc[0]?.n ?? "0"));
      }

      const vendorsToInsert = [
        { account_id: venueAccountId, role: "venue", n_confirmations: venueNConfirmations },
        ...nonVenueVendors,
      ];
      for (const v of vendorsToInsert) {
        const { rows: inserted } = await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           values ($1, $2, $3::vendor_role, $4)
           on conflict (wedding_id, account_id, role) do nothing
           returning wedding_id`,
          [weddingId, v.account_id, v.role, v.n_confirmations]
        );
        if (inserted.length > 0) vendorsInserted++;
      }

      await client.query(
        `insert into jeremy_weddings_created (candidate_id, wedding_id, batch_id) values ($1, $2, $3) on conflict (candidate_id) do nothing`,
        [cand.candidate_id, weddingId, batchId]
      );
    } else {
      console.log(
        `[create-weddings] candidate=${cand.candidate_id} venue=@${venueUsername} decision=${cand.decision} posts=${includedUrls.length} vendors=${vendorsForPrint} -> SKIP(${gate.reason})`
      );
      bump(`SKIP(${gate.reason})`);
    }
  }

  console.log(`\n[create-weddings] --from-confirmed-candidates totals by outcome:`);
  for (const [label, n] of Object.entries(outcomeCounts)) {
    console.log(`  ${label}: ${n}`);
  }

  // Coverage-bucket delta this batch WOULD produce — alias-aware (two IG handles for the same
  // real venue must count as one), weddings.is_chicago only (same discipline as
  // candidateReview.ts's venue_counts CTE, which this mirrors).
  if (newWeddingsByVenue.size > 0) {
    const venueIds = [...newWeddingsByVenue.keys()];
    const { rows: aliasRows } = await client.query<{ alias_account_id: number; canonical_account_id: number }>(
      `select alias_account_id::int as alias_account_id, canonical_account_id::int as canonical_account_id
       from account_aliases where alias_account_id = any($1::bigint[])`,
      [venueIds]
    );
    const aliasMap = new Map(aliasRows.map((r) => [r.alias_account_id, r.canonical_account_id]));

    const addedByCanonical = new Map<number, number>();
    for (const [vid, n] of newWeddingsByVenue) {
      const canon = aliasMap.get(vid) ?? vid;
      addedByCanonical.set(canon, (addedByCanonical.get(canon) ?? 0) + n);
    }

    const canonicalIds = [...addedByCanonical.keys()];
    const { rows: existingRows } = await client.query<{ venue_account_id: number; n: string }>(
      `select coalesce(al.canonical_account_id, wv.account_id)::int as venue_account_id,
              count(distinct wv.wedding_id)::text as n
       from wedding_vendors wv
       join weddings w on w.id = wv.wedding_id and w.is_chicago = true
       left join account_aliases al on al.alias_account_id = wv.account_id
       where wv.role = 'venue' and coalesce(al.canonical_account_id, wv.account_id) = any($1::bigint[])
       group by 1`,
      [canonicalIds]
    );
    const existingMap = new Map(existingRows.map((r) => [r.venue_account_id, Number(r.n)]));

    let zeroToOnePlus = 0;
    let oneToFiveToSixPlus = 0;
    console.log(`\n[create-weddings] coverage-bucket delta (this batch, alias-aware, is_chicago only):`);
    for (const canon of canonicalIds) {
      const before = existingMap.get(canon) ?? 0;
      const added = addedByCanonical.get(canon)!;
      const after = before + added;
      let movement = "";
      if (before === 0 && after >= 1) {
        movement = " [0->1+]";
        zeroToOnePlus++;
      } else if (before >= 1 && before <= 5 && after >= 6) {
        movement = " [1-5->6+]";
        oneToFiveToSixPlus++;
      }
      const { rows: unameRows } = await client.query<{ username: string }>(
        `select username::text as username from accounts where id = $1`,
        [canon]
      );
      console.log(`  venue=@${unameRows[0]?.username ?? canon} before=${before} +${added} after=${after}${movement}`);
    }
    console.log(`[create-weddings] venues moving 0->1+: ${zeroToOnePlus}, venues moving 1-5->6+: ${oneToFiveToSixPlus}`);
  } else {
    console.log(`\n[create-weddings] coverage-bucket delta: nothing would be created, no delta.`);
  }

  return { weddingsCreated, postsImported, vendorsInserted };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const fromConfirmedCandidates = process.argv.includes("--from-confirmed-candidates");

  const batchIdFlagIndex = process.argv.indexOf("--batch-id");
  const batchId = batchIdFlagIndex !== -1 ? process.argv[batchIdFlagIndex + 1] : undefined;
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[create-weddings] --batch-id <id> is required (D055 — every creation run must be individually revertable via revertWeddingBatch.ts).\n" +
        "Usage: bun run scripts/graph/createWeddingsFromJeremyEvidence.ts --batch-id <id> [--dry-run]\n" +
        "Suggested format: d055-<source>-<YYYY-MM-DD>-<n> (e.g. d055-beyond-include-2026-09-08-1)"
    );
    process.exit(1);
  }

  const sinceFlagIndex = process.argv.indexOf("--since");
  const since = sinceFlagIndex !== -1 ? process.argv[sinceFlagIndex + 1] : undefined;
  if (since !== undefined && (since.startsWith("--") || isNaN(Date.parse(since)))) {
    console.error(`[create-weddings] --since must be a valid ISO timestamp, got "${since}"`);
    process.exit(1);
  }

  const limitFlagIndex = process.argv.indexOf("--limit");
  const limitRaw = limitFlagIndex !== -1 ? process.argv[limitFlagIndex + 1] : undefined;
  let limit: number | undefined;
  if (limitRaw !== undefined) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error(`[create-weddings] --limit must be a positive integer, got "${limitRaw}"`);
      process.exit(1);
    }
  }

  // D055 provenance rule, enforced: no real (non-dry-run) create batch without a recent
  // snapshot. Dry runs are exempt (nothing to protect against yet).
  if (!dryRun && !hasRecentSnapshot()) {
    console.error(
      "[create-weddings] REFUSING: no snapshot directory under scripts/graph/snapshots/ has an mtime within the last 24h.\n" +
        "take a snapshot first: bun run scripts/graph/snapshotGraphTables.ts --label <batch-id>"
    );
    process.exit(1);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(`
      create table if not exists jeremy_weddings_created (
        candidate_id bigint not null,
        wedding_id   bigint not null,
        created_at   timestamptz not null default now(),
        primary key (candidate_id)
      )
    `);

    let weddingsCreated = 0;
    let postsImported = 0;
    let vendorsInserted = 0;

    if (fromConfirmedCandidates) {
      // --from-confirmed-candidates mode (D055 Phase 1 step 9) -- entirely separate candidate
      // source and gating logic, see runFromConfirmedCandidates above. The hardcoded-array mode
      // below (CANDIDATE_IDS loop) is completely unchanged.
      const result = await runFromConfirmedCandidates(client, batchId, { since, limit });
      weddingsCreated = result.weddingsCreated;
      postsImported = result.postsImported;
      vendorsInserted = result.vendorsInserted;
    } else {
    for (const candidateId of CANDIDATE_IDS) {
      const { rows: candRows } = await client.query<{
        venue_account_id: number;
        event_date_est: string | null;
      }>(`select venue_account_id::int, event_date_est::text from jeremy_wedding_candidates where id = $1`, [
        candidateId,
      ]);
      if (candRows.length === 0) continue;
      const { venue_account_id: venueAccountId, event_date_est: eventDate } = candRows[0];

      const { rows: existingCreated } = await client.query(
        `select wedding_id from jeremy_weddings_created where candidate_id = $1`,
        [candidateId]
      );
      if (existingCreated.length > 0) {
        console.log(`[create-weddings] candidate=${candidateId} already created as wedding=${existingCreated[0].wedding_id}, skipping`);
        continue;
      }

      // account_locations has no row at all for most venue accounts discovered only
      // through Jeremy's evidence (D035 finding) -- falling back to that table's own
      // coalesce-to-false would silently mark real Chicago weddings as non-Chicago, hiding
      // them from /weddings and the /vendors browse list. D036's Phase 1 fix: trust the
      // Places-linked vendors.city field (real, varied geocoded data, confirmed 2026-09-05
      // not a static default) for candidates scoped that way. D035's original 15 were
      // hand-verified directly (no vendors.city dependency) -- OR here covers both without
      // re-deriving which path each candidate came from.
      const { rows: cityRows } = await client.query<{ is_chicago: boolean }>(
        `select exists(select 1 from vendors v where v.account_id = $1 and v.city = 'Chicago') as is_chicago`,
        [venueAccountId]
      );
      const isChicago =
        cityRows[0].is_chicago ||
        D035_PILOT_CANDIDATE_IDS.includes(candidateId) ||
        PHASE2_ACCOUNT_IDS.includes(venueAccountId) ||
        BATCH5_ACCOUNT_IDS.includes(venueAccountId);

      const { rows: posts } = await client.query<{
        post_url: string;
        caption_raw: string | null;
        post_timestamp: string;
        owner_username: string;
        likes_count: number | null;
      }>(
        `select ip.post_url, ip.caption_raw, ip.post_timestamp::text, ip.owner_username, ip.likes_count
         from jeremy_wedding_candidate_posts cp
         join staging.instagram_posts ip on ip.post_url = cp.source_post_url
         where cp.candidate_id = $1`,
        [candidateId]
      );

      // Bug found live (D050 double-venue-tag audit, 2026-09-07): the old flow created the
      // `weddings` row FIRST, then tried to attach each post -- `wedding_posts`' own
      // `on conflict (post_id) do nothing` silently no-ops when a post's shortcode already
      // exists under a DIFFERENT, already-existing wedding (Ben's original crawl, or an earlier
      // Jeremy-evidence batch), leaving a brand-new wedding row with real vendor credits but
      // ZERO posts -- an orphan. Found 17 of these session-wide, dating back to 2026-09-05 (the
      // very first creation batch), all confirmed duplicates of an already-existing wedding.
      // Fix: check for this BEFORE creating anything. If ANY of this candidate's posts already
      // has a `posts` row linked to an EXISTING wedding via `wedding_posts`, skip the whole
      // candidate -- the event is already documented, creating a second wedding for it would
      // just repeat the same bug.
      const shortcodes = posts.map((p) => shortcodeFromUrl(p.post_url)).filter((s): s is string => s !== null);
      const { rows: alreadyDocumented } = await client.query<{ wedding_id: number }>(
        `select wp.wedding_id from posts p join wedding_posts wp on wp.post_id = p.id where p.shortcode = any($1::text[])`,
        [shortcodes]
      );
      if (alreadyDocumented.length > 0) {
        console.log(
          `[create-weddings] candidate=${candidateId} -- its post(s) already belong to existing wedding=${alreadyDocumented[0].wedding_id}, skipping (not creating a duplicate)`
        );
        continue;
      }

      const { rows: weddingRows } = await client.query<{ id: number }>(
        `insert into weddings (venue_id, event_date_est, is_chicago) values ($1, $2, $3) returning id`,
        [venueAccountId, eventDate, isChicago]
      );
      const weddingId = weddingRows[0].id;
      weddingsCreated++;

      for (const p of posts) {
        const shortcode = shortcodeFromUrl(p.post_url);
        if (!shortcode) continue;

        const { rows: ownerRows } = await client.query<{ id: number }>(
          `insert into accounts (username) values ($1)
           on conflict (username) do update set username = excluded.username
           returning id`,
          [p.owner_username.toLowerCase()]
        );
        const ownerId = ownerRows[0].id;

        const { rows: postRows } = await client.query<{ id: number }>(
          `insert into posts (shortcode, url, owner_id, caption, posted_at, likes_count, source, raw)
           values ($1, $2, $3, $4, $5, $6, 'jeremy_evidence', $7)
           on conflict (shortcode) do nothing
           returning id`,
          [shortcode, p.post_url, ownerId, p.caption_raw, p.post_timestamp, p.likes_count, JSON.stringify(p)]
        );
        if (postRows.length === 0) continue;
        postsImported++;
        const postId = postRows[0].id;

        await client.query(`insert into wedding_posts (wedding_id, post_id) values ($1, $2) on conflict (post_id) do nothing`, [
          weddingId,
          postId,
        ]);
      }

      const { rows: candVendors } = await client.query<{ account_id: number; role: string }>(
        `select account_id::int, role from jeremy_wedding_candidate_vendors where candidate_id = $1`,
        [candidateId]
      );
      for (const v of candVendors) {
        const { rows: inserted } = await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           values ($1, $2, $3::vendor_role, 1)
           on conflict (wedding_id, account_id, role) do nothing
           returning wedding_id`,
          [weddingId, v.account_id, v.role]
        );
        if (inserted.length > 0) vendorsInserted++;
      }

      await client.query(
        `insert into jeremy_weddings_created (candidate_id, wedding_id, batch_id) values ($1, $2, $3) on conflict (candidate_id) do nothing`,
        [candidateId, weddingId, batchId]
      );

      console.log(`[create-weddings] candidate=${candidateId} -> wedding=${weddingId} posts=${posts.length} vendors=${candVendors.length}`);
    }
    }

    console.log(
      `[create-weddings] ${dryRun ? "DRY RUN — " : ""}batch_id=${batchId} weddings_created=${weddingsCreated} posts_imported=${postsImported} vendors_inserted=${vendorsInserted}`
    );

    if (!dryRun) {
      await client.query("refresh materialized view edges");
      console.log("[create-weddings] refreshed materialized view edges");
    }

    if (dryRun) {
      await client.query("rollback");
      console.log("[create-weddings] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[create-weddings] COMMITTED");
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
