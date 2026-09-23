/**
 * ACQUISITION LOOP (D061) -- rank crawl targets for a tier from priors, so a tick is one command.
 *
 * Sources per tier (docs/engineering/acquisition-loop/README.md §1-2):
 *   probe   metro venue accounts (role venue + in_metro) at 0-5 documented weddings whose tagged feed
 *           was never crawled (crawl no.1, pilot, canary, probes) -- coverage play
 *   alias   alias siblings of listed venues (account_aliases), never crawled
 *   vendor  Chicago planners / caterers / DJs / florists / officiants / photo booths whose OWN posts
 *           had a >= 0.3 wedding yield in Jeremy's corpus (tagged feeds out-yield venue feeds 0.37 vs 0.14)
 *   deepen  venues already crawled with a measured prior >= 0.2 (status promising), for a deeper pull
 *   probe6  (2026-09-20, remainder tick) metro venue accounts at 6-15 documented weddings never tagged-crawled
 *           -- documented from Jeremy's corpus / vendor feeds only, their own tagged feed is untouched
 *   vendorthin (2026-09-21, D065 arm C) vendors already credited at a venue in the 1-5 band, never
 *           tagged-crawled -- selected by THIN-VENUE CONNECTION, not vendor quality, because the
 *           month-1 `vendor` tick put 88 of its 104 weddings at venues that were already thick
 *   crossing (2026-09-21, D065) metro venue accounts at 1-5 documented weddings, ranked NEAREST the
 *           6+ threshold first, INCLUDING ones already crawled -- the coverage play aimed at the
 *           marginal cost of a crossing, (6 - n), rather than at thin-ness in general
 *   discovered (2026-09-20) hop-1 `ops.crawl_frontier` rows still pending (co-tagged by crawl no.1's venues),
 *           venue role + in_metro, never crawled -- the "discovered venues" Ben's crawler queued but never ran
 * Prior per target = the LATEST ops.crawl_targets row for (account, feed) when one exists (measured by
 * measure.ts), else the lookup prior from features: venue_type class, follower band, Places reviews /
 * primary_type (venues) or role (vendors). Excluded always: status dead/excluded, private, brand
 * handles (never listed). Venue types are a prior, never an exclusion (low-types probe, 2026-09-20).
 *
 * Read-only. Prints the ranked table and writes the ids (one per line) to --ids-file for runTick.ts.
 *   bun run scripts/acquire/targets.ts --tier probe --limit 90 --ids-file /tmp/probesB.txt
 *   bun run scripts/acquire/targets.ts --tier vendor --limit 100 --ids-file /tmp/vendor.txt
 *   bun run scripts/acquire/targets.ts --tier vendorthin --limit 60 --ids-file /tmp/vendorthin.txt
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import {
  isUmbrellaBrandUsername,
  isNonVenueUsername,
  isChurchLikeUsername,
} from "../graph/venueAliasSignals";

export type Tier = "probe" | "probe6" | "discovered" | "alias" | "vendor" | "vendorthin" | "deepen" | "discover" | "crossing";

/** Pure: lookup prior for a venue's tagged feed, in weddings per POST.
 *
 * RECALIBRATED 2026-09-20 (D062) against 570 of our own measured targets (tiers probe / probe6 /
 * canary, >= 15 posts fetched each). The original bands came from Ben's crawl nº1 as written up in
 * the loop README §1a, and they were pointed the wrong way on the single most important feature.
 *
 * What the measurement says, weddings per post by follower band:
 *
 *   < 500      0.152   (45 venues, 13% came back with nothing)
 *   500-1.5k   0.116   (143,  27% empty)
 *   1.5k-5k    0.104   (146,  31% empty)
 *   5k-20k     0.049   (133,  62% empty)
 *   20k+       0.013   (87,   83% empty)
 *
 * **Yield falls monotonically as followers rise** -- the smallest venues out-yield the largest by
 * 12x per post. The old rule did the opposite, adding +0.06 for the 3k-10k band, because crawl nº1
 * measured weddings per VENUE and a big venue hits the 25-post cap: it produces more weddings per
 * venue while producing far fewer per post. We pay per post, so per-post is the metric that matters
 * and the old prior was optimising the wrong one.
 *
 * Back-test of the ranking (same 570 venues, quartiles by prior, realized w/post):
 *   old prior   0.061 -> 0.076 -> 0.081 -> 0.111   (1.8x spread, dead rate 44% -> 39%)
 *   followers ASC alone  0.120 -> 0.106 -> 0.077 -> 0.028   (4.3x spread, dead 20% -> 69%)
 * A single inverted feature beat the whole hand-tuned prior, which is why the follower term below
 * now dominates. venue_type is kept because it is independently predictive on the same sample
 * (farm_estate 0.148, event_space 0.104, country_club 0.092, hotel 0.088, restaurant 0.062,
 * house_of_worship 0.053, **other 0.033 with 69% empty** -- "other" is a real negative signal and
 * was previously unpenalised).
 *
 * Re-run the back-test (`tmp_analysis/` scratch script in D062) after any future tick before
 * touching these numbers again -- they are measured, not chosen. */
export function venueLookupPrior(f: { venue_type: string | null; followers: number | null; reviews: number | null; ptype: string | null }): number {
  let p = 0.08;
  if (f.venue_type && ["farm_estate", "event_space", "park_outdoor", "museum"].includes(f.venue_type)) p += 0.04;
  else if (f.venue_type === "other") p -= 0.04;
  else if (f.venue_type == null) p += 0.03;
  // Follower term. D063 CORRECTION to D062: the relationship is a HUMP, not monotonic.
  //
  // D062 read "yield falls as followers rise" off the >=15-posts-fetched sample and made the prior
  // monotonically decreasing. Re-measured across ALL measured targets, including the ones that
  // returned almost nothing, the bottom falls away -- tiny accounts do not have a tagged feed to
  // pull:
  //
  //   followers   venues  avg posts RETURNED  weddings/venue  % returning nothing
  //   < 50            11                 4.5            0.36                 82%
  //   50-149          20                 8.3            0.90                 75%
  //   150-399         56                16.8            1.91                 46%
  //   400-999        129                23.6            2.43                 42%
  //   1.5k-5k        146                24.9            2.59                 31%
  //   5k-20k         133                24.9            1.21                 62%
  //   20k+            87                24.9            0.33                 83%
  //
  // Per-post yield still looks fine at the bottom (0.082-0.114) only because the denominator is
  // 4-8 posts. What matters for the ">= 1 wedding" bar is weddings PER VENUE, and that peaks in the
  // 400-5,000 range. Billing is per result RETURNED, so a 4-post account costs ~$0.009 -- these are
  // cheap rather than harmful, hence a modest penalty, not exclusion. The symptom that prompted
  // this: @cityhallofchicago, 4 followers, ranked second in the first qualified queue.
  if (f.followers != null) {
    if (f.followers < 50) p -= 0.03;
    else if (f.followers < 150) p -= 0.01;
    else if (f.followers < 400) p += 0.04;
    else if (f.followers < 5000) p += 0.05;
    else if (f.followers < 20000) p -= 0.04;
    else p -= 0.07;
  } else {
    // Unknown follower count means a never-scraped shell. Scrape it before spending a crawl on it.
    p += 0.01;
  }
  if (f.reviews != null) p += f.reviews >= 50 && f.reviews <= 1000 ? 0.02 : f.reviews > 1000 ? -0.04 : 0;
  if (f.ptype === "event_venue" || f.ptype === "wedding_venue" || f.ptype === "banquet_hall") p += 0.03;
  if (f.ptype === "hotel") p -= 0.06;
  return Math.max(0.01, Math.round(p * 1000) / 1000);
}

/** Pure: README §1a role priors for a non-venue vendor's tagged feed. */
export function vendorLookupPrior(role: string | null, ownYield: number | null): number {
  const byRole: Record<string, number> = { planner: 0.41, dj: 0.42, catering: 0.36, florist: 0.31, officiant: 0.36, photo_booth: 0.26, photographer: 0.23, videographer: 0.21 };
  const base = (role && byRole[role]) || 0.2;
  return ownYield != null ? Math.round(((base + ownYield) / 2) * 1000) / 1000 : base;
}

interface Row {
  id: number;
  username: string;
  why: string;
  followers: number | null;
  venue_type: string | null;
  reviews: number | null;
  ptype: string | null;
  role: string | null;
  own_yield: number | null;
  nw: number;
  measured_prior: number | null;
  measured_status: string | null;
  /** D063 qualification inputs. Every pool projects these so the gate can run uniformly. */
  biography: string | null;
  full_name: string | null;
  in_metro: boolean | null;
  /** D065 `vendorthin` only: how many DISTINCT venues currently in the 1-5 band this vendor is
   * already credited at. The tier's whole hypothesis, so it ranks ahead of the prior there; null
   * for every other tier. */
  thin_venues: number | null;
  /** D065 `vendorthin` only: of those, how many are at 4-5 weddings -- i.e. need only 1-2 more to
   * cross into 6+. Ranks FIRST, because crossings are the metric and the marginal cost of a
   * crossing is (6 - n): 31 venues sit at 5 and need one wedding, while 93 sit at 1 and need five.
   * Null for every other tier. */
  near_cross: number | null;
}

/** D063: a venue is in the Chicago metro if account_locations says so, or failing that if its own
 * bio/full_name names a metro municipality. The second half exists because 302 venue-role accounts
 * have no account_locations row at all -- see the geo_blocked bucket in
 * reportVenueIdentityTaxonomy.ts -- and refusing to consider them would hide real venues. */
const CHICAGO_PLACE_RE =
  /\b(chicago|evanston|naperville|oak park|schaumburg|elmhurst|wheaton|aurora|joliet|skokie|des plaines|arlington heights|glenview|northbrook|lombard|oak brook|lisle|berwyn|cicero|hinsdale|la ?grange|wilmette|winnetka|highland park|lake forest|barrington|palatine|crystal lake|st\.? charles|geneva|batavia|romeoville|lemont|orland park|tinley park|bolingbrook|downers grove|itasca|elgin|illinois|\bil\b)\b/i;

/** Handle variant of CHICAGO_PLACE_RE with no \b anchors. Instagram handles are concatenated words
 * with no separators, so "\bchicago\b" cannot match inside "msichicago" -- the same reasoning
 * CHURCH_SUBSTRING_RE documents in venueAliasSignals.ts. Found in review of the first gate run:
 * @msichicago (the Griffin Museum of Science and Industry) was excluded for "no Chicago evidence"
 * because its bio names the museum but not the city. */
const CHICAGO_PLACE_HANDLE_RE =
  /(chicago|evanston|naperville|oakpark|schaumburg|elmhurst|wheaton|skokie|desplaines|glenview|northbrook|oakbrook|hinsdale|lagrange|wilmette|winnetka|highlandpark|lakeforest|barrington|palatine|crystallake|stcharles|romeoville|lemont|orlandpark|tinleypark|bolingbrook|downersgrove|itasca|elgin|chi\b)/i;

/** Saint-prefixed and faith-community handles that name no explicit church word. St John Brebeuf
 * (@st.johnbrebeufniles) ranked FIRST in the first gate run: `isChurchLikeUsername` looks for
 * church/parish/cathedral and the bio says only "Founded in 1953 as a community of faith". Houses
 * of worship measure 0.053 w/post with half returning nothing, so letting them to the top of a
 * budgeted queue is exactly the mistake the gate exists to prevent. */
// Requires "saint" spelled out, or an ABBREVIATION FOLLOWED BY A SEPARATOR. Two iterations got
// this wrong in opposite directions during the Stage 2 dry-run:
//   `^(st\.?|saint|ss\.?)[a-z]` missed @saint_spyridon (underscore, not a letter).
//   `^(st|saint|ss)[._-]?[a-z]` then swallowed @stonegatebanquet, @standardclub, @stagecoachinn
//   and @stainedglass -- every venue whose name merely begins with "st".
// Bare "st"+letters is genuinely ambiguous, so it is NOT matched here. The accepted cost is that a
// handle like @stbenschicago passes this rule and must be caught by the bio/full_name faith test
// instead. Missing one church is cheap (they yield 0.053 w/post); excluding four real venues is not.
const SAINT_HANDLE_RE = /^(saint[._-]?|st[._-]|ss[._-])[a-z]/i;
const FAITH_TEXT_RE = /\b(community of faith|catholic|lutheran|methodist|presbyterian|episcopal|congregation|diocese|archdiocese|ministries|worship)\b/i;

/** Places that are demonstrably NOT the Chicago metro. Checked BEFORE the Chicago test because a
 * bio can name both ("Scottsdale's premier gallery ... also serving Chicago clients"). */
const NOT_CHICAGO_RE =
  /\b(scottsdale|arizona|phoenix|panam[áa]|miami|florida|texas|austin|dallas|houston|nashville|denver|atlanta|boston|brooklyn|new york|nyc|california|los angeles|san diego|seattle|portland|maui|hawaii|fiji|anguilla|sorrento|italy|london|paris|toronto|vegas|charleston|savannah|milwaukee|wisconsin|indiana|michigan)\b/i;

/** CHICAGO LANDMARKS THAT CONTAIN AN OUT-OF-AREA PLACE NAME. Stripped before NOT_CHICAGO_RE runs.
 *
 * D065: found because `--tier crossing` reported @congressplazahotel and @sableatnavypier as
 * "out_of_area" -- two Chicago venues sitting at 5 documented weddings, i.e. ONE wedding from
 * crossing into 6+, excluded from the coverage tick they were the best targets for. Both bios name
 * **Lake Michigan**, and `\bmichigan\b` read it as the state. Chicago geography is full of these:
 * Lake Michigan, Michigan Avenue, Indiana Avenue, New York Street out in Aurora.
 *
 * This is the exact failure mode D063's "report every exclusion with its reason" exists to surface,
 * and it stayed invisible while the gate only ever ran over pools where those handles ranked low. */
const CHICAGO_LANDMARK_RE =
  /\b(lake\s+michigan|michigan\s+(ave|avenue|av)\b|n(orth)?\s+michigan\s+ave|indiana\s+(ave|avenue)\b|new\s+york\s+st(reet)?\b)/gi;

/** Pure: strip Chicago landmarks, then ask whether the text names somewhere else. Exported for the
 * tests that pin each landmark. */
export function namesSomewhereElse(text: string): boolean {
  return NOT_CHICAGO_RE.test(text.replace(CHICAGO_LANDMARK_RE, " "));
}

export type Disqualification =
  | "umbrella_brand"
  | "non_venue_trade"
  | "house_of_worship"
  | "out_of_area"
  | "no_chicago_evidence";

/** Pure: should this account be crawled at all? SEPARATE FROM THE PRIOR, deliberately.
 *
 * The prior RANKS; it was never meant to QUALIFY, and conflating the two backfired. D062
 * recalibrated the prior to favour small accounts (measured: <500 followers yield 0.152 w/post vs
 * 0.013 for 20k+), which is correct -- but junk accounts are also small, so the top of the
 * never-crawled queue filled with @bellafineartandevents ("Scottsdale's premier fine art gallery"),
 * @millenium.park ("Plaza Comercial en Via Transistmica" -- Panama), @uclubashley (a person: "Senior
 * Catering Sales Manager"), four parishes and @cityhallofchicago (4 followers). Only 22 of the top
 * 134 were even in_metro. Qualifying first cuts 269 raw targets to 78 and the bill from $15.47 to
 * $4.49.
 *
 * Returns null when the target is eligible, otherwise the reason -- callers REPORT every exclusion
 * rather than dropping it silently, so a bug in this gate is visible instead of quietly hiding
 * good venues. */
export function disqualifyTarget(r: {
  username: string;
  biography: string | null;
  full_name: string | null;
  in_metro: boolean | null;
  venue_type: string | null;
}): Disqualification | null {
  if (isUmbrellaBrandUsername(r.username)) return "umbrella_brand";
  if (isNonVenueUsername(r.username)) return "non_venue_trade";
  const text = `${r.biography ?? ""} ${r.full_name ?? ""}`;
  if (
    isChurchLikeUsername(r.username) ||
    SAINT_HANDLE_RE.test(r.username) ||
    /\b(parish|church|cathedral|chapel|synagogue|mosque)\b/i.test(text) ||
    FAITH_TEXT_RE.test(text)
  ) {
    // Measured 0.053 w/post with 50% returning nothing -- the weakest venue_type we have.
    return "house_of_worship";
  }
  if (namesSomewhereElse(text)) return "out_of_area";
  if (r.in_metro === true) return null;
  // The HANDLE counts as geography evidence too. Caught in review of the first run: @msichicago --
  // the Griffin Museum of Science and Industry, a real Chicago venue -- was excluded as
  // "no_chicago_evidence" because its bio names the museum without naming the city. Handles like
  // @msichicago / @chicagowinery / @lespacechicago carry the city and nothing else does.
  if (CHICAGO_PLACE_HANDLE_RE.test(r.username)) return null;
  if (CHICAGO_PLACE_RE.test(text)) return null;
  return "no_chicago_evidence";
}

/** D065: qualification for a VENDOR pool. `disqualifyTarget` above is a VENUE gate and applying it
 * to vendors is simply wrong -- caught building the `vendorthin` tier, where it threw out 456 of 596
 * candidates, most of them correctly-identified wedding vendors:
 *
 *   non_venue_trade      121  @christytylerphotography, @oldnorthfilmco, @juliettanfloraldesign ...
 *   no_chicago_evidence  316  @blushandborrowed, @lifeinbloom, @stylemattersdjs ...
 *
 * Both exclusions invert for vendors. `isNonVenueUsername` matches trade words ("photography",
 * "films", "floral") in order to keep tradespeople OUT of a venue pool -- in a vendor pool that is
 * the target population. And "no Chicago evidence in the bio" is the weaker signal here: a vendor in
 * this pool is credited on a wedding at a Chicago venue, which is stronger evidence of working in
 * Chicago than any bio string. `umbrella_brand` inverts too -- "group" and "talent" are ordinary
 * vendor names, and arm C itself contained @sparkentgroup and @greenlinetalent.
 *
 * What survives is the one signal that means the same thing for both: text that positively says the
 * account is somewhere else. Private accounts and role filtering are handled in SQL.
 *
 * This is applied to the `vendor` tier as well as `vendorthin`. The bug was always there; the
 * month-1 vendor tick simply never noticed how much of its pool it was silently discarding. */
export function disqualifyVendorTarget(r: { biography: string | null; full_name: string | null }): Disqualification | null {
  const text = `${r.biography ?? ""} ${r.full_name ?? ""}`;
  if (namesSomewhereElse(text)) return "out_of_area";
  return null;
}

const VENUE_POOL = `
  select a.id, a.username::text username, 'listed venue' why, a.followers, a.venue_type,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype,
    null::text role, null::numeric own_yield,
    (select count(*) from weddings w where w.venue_id=a.id)::int nw,
    null::int thin_venues, null::int near_cross,
    a.biography, a.full_name,
    coalesce((select l2.in_metro from account_locations l2 where l2.account_id=a.id), false) in_metro
  from accounts a join v_account_role r on r.account_id=a.id and r.role='venue'
  join account_locations al on al.account_id=a.id and al.in_metro
  where coalesce(a.is_private,false)=false`;
  // 2026-09-20: hotels / restaurants / houses of worship are NOT excluded any more -- the 41 at 1-5
  // weddings the plan had skipped yielded 49 weddings from 984 posts (0.05/post, 7 venues into 6+).
  // venueLookupPrior still ranks them lower; the budget cap, not a type filter, decides the cut.

const ALIAS_POOL = `
  select a.id, a.username::text username, 'alias sibling of '||c.username::text why, a.followers, a.venue_type,
    null::int reviews, null::text ptype, null::text role, null::numeric own_yield, 0 nw,
    null::int thin_venues, null::int near_cross,
    a.biography, a.full_name,
    coalesce((select l2.in_metro from account_locations l2 where l2.account_id=a.id), false) in_metro
  from account_aliases x join accounts a on a.id=x.alias_account_id join accounts c on c.id=x.canonical_account_id
  where coalesce(a.is_private,false)=false
    and exists (select 1 from v_account_role r join account_locations l on l.account_id=r.account_id and l.in_metro
                where r.account_id=x.canonical_account_id and r.role='venue')`;

const DISCOVERED_POOL = `
  select a.id, a.username::text username, 'frontier hop-1 pending (co-tagged by crawl no.1)' why, a.followers, a.venue_type,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype,
    null::text role, null::numeric own_yield,
    (select count(*) from weddings w where w.venue_id=a.id)::int nw,
    null::int thin_venues, null::int near_cross,
    a.biography, a.full_name,
    coalesce((select l2.in_metro from account_locations l2 where l2.account_id=a.id), false) in_metro
  from ops.crawl_frontier f join accounts a on a.id=f.account_id
  join v_account_role r on r.account_id=a.id and r.role='venue'
  join account_locations al on al.account_id=a.id and al.in_metro
  where f.hops=1 and f.status='pending' and coalesce(a.is_private,false)=false`;

/** D063: never-crawled venue-role accounts with no documented wedding -- the "1+ bar" pool.
 * Deliberately does NOT require account_locations.in_metro, because 302 venue-role accounts have no
 * location row at all and some of them are real Chicago venues. Geography is decided by
 * disqualifyTarget() in TS instead, where "no Chicago evidence" is reported rather than silently
 * filtered in SQL. */
const DISCOVER_POOL = `
  select a.id, a.username::text username, 'never crawled, no documented wedding' why, a.followers, a.venue_type,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype,
    null::text role, null::numeric own_yield,
    0::int nw,
    null::int thin_venues, null::int near_cross,
    a.biography, a.full_name,
    coalesce((select l2.in_metro from account_locations l2 where l2.account_id=a.id), false) in_metro
  from accounts a
  where exists (select 1 from v_account_role r where r.account_id=a.id and r.role in ('venue','hotel'))
    and coalesce(a.is_private,false)=false
    and not exists (select 1 from account_aliases aa where aa.alias_account_id=a.id)
    and not exists (select 1 from weddings w where w.venue_id=a.id)
    and not exists (select 1 from ops.post_observations o where o.seed_account_id=a.id)`;

const VENDOR_POOL = `
  with sp as (select sp.post_url, lower(sp.owner_username) u from v_jeremy_beta_posts sp),
       -- documented Jeremy posts: pre-merge source='jeremy_evidence' (copies made for created weddings);
       -- post-merge the identical 5,349-post set is origin='jeremy_beta' with a wedding_posts row (verified tick 12).
       j as (select p.url from posts p where p.origin='jeremy_beta' and exists (select 1 from wedding_posts wp where wp.post_id=p.id)),
       au as (select u, count(*) posts, count(j.url) wp from sp left join j on j.url=sp.post_url group by u having count(*)>=10)
  select a.id, a.username::text username, 'tier-A vendor ('||r.role::text||')' why, a.followers, null::text venue_type,
    null::int reviews, null::text ptype, r.role::text role, round(au.wp::numeric/au.posts,3) own_yield, 0 nw,
    null::int thin_venues, null::int near_cross,
    a.biography, a.full_name,
    coalesce((select l2.in_metro from account_locations l2 where l2.account_id=a.id), false) in_metro
  from au join accounts a on a.username::text=au.u
  join v_account_role r on r.account_id=a.id and r.role::text in ('planner','catering','dj','florist','officiant','photo_booth')
  where au.wp::numeric/au.posts >= 0.3 and coalesce(a.is_private,false)=false
    and (exists (select 1 from account_locations al where al.account_id=a.id and al.in_metro)
         or exists (select 1 from staging.vendors sv where lower(sv.instagram_handle)=a.username::text))`;

/** D065 arm C, made reproducible. Vendors selected by THIN-VENUE CONNECTION rather than by vendor
 * quality: accounts already credited at >= 1 venue sitting in the 1-5 band, never tagged-crawled.
 *
 * Why this pool and not `vendor`. The month-1 vendor tick selected on own-post wedding yield and
 * produced 104 weddings, but put 88 of them at venues that were already thick -- excellent
 * weddings/dollar, near-zero coverage movement. Selecting on who is already credited at a THIN venue
 * is the hypothesis that the same feeds can be pointed at the band we actually need to move. Arm C
 * ran this by hand over 12 vendors; this is that selection as a tier, so a scaled tick is one
 * command and the next session can reproduce the sample.
 *
 * "Thin" is the SAME basis as reportVenueCoverage.ts and the coverage bands STATE.md tracks --
 * `count(*) from weddings where venue_id = account`, is_chicago, no alias rollup -- so the tier
 * targets the number the report will be judged on rather than a second, differently-defined one.
 *
 * Roles. Arm C's 12 spanned catering / band / photographer / florist / dj / rentals / cake, and the
 * list below is that set plus its close analogs. hair / makeup / beauty_services are deliberately
 * OUT: the user flagged them and the measurement agrees -- hair anchors to hotels at 14.7% against
 * catering's 0.6%, and hotels are the thick end of the distribution, so those feeds pull spend
 * towards exactly the venues that do not need it. Retail roles (attire, wedding_dress, jewelry,
 * shoes, menswear) are out because they credit no venue. */
const VENDORTHIN_POOL = `
  with thin as (
    select a.id venue_account_id
    from accounts a
    join v_account_role r on r.account_id=a.id and r.role='venue'
    join account_locations al on al.account_id=a.id and al.in_metro
    where not exists (select 1 from account_aliases aa where aa.alias_account_id=a.id)
      and (select count(*) from weddings w where w.venue_id=a.id and w.is_chicago) between 1 and 5
  ),
  thin_n as (
    select t.venue_account_id, (select count(*) from weddings w where w.venue_id=t.venue_account_id and w.is_chicago)::int nw
    from thin t
  ),
  conn as (
    select wv.account_id,
      count(distinct w.venue_id)::int thin_venues,
      count(distinct w.venue_id) filter (where t.nw >= 4)::int near_cross
    from wedding_vendors wv
    join weddings w on w.id=wv.wedding_id and w.is_chicago
    join thin_n t on t.venue_account_id=w.venue_id
    where wv.account_id is not null and wv.role <> 'venue'
    group by 1
  )
  select a.id, a.username::text username,
    'credited at '||conn.thin_venues||' thin venue(s), '||conn.near_cross||' needing <=2 ('||r.role::text||')' why,
    a.followers, null::text venue_type,
    null::int reviews, null::text ptype, r.role::text role, null::numeric own_yield, 0 nw,
    conn.thin_venues, conn.near_cross,
    a.biography, a.full_name,
    coalesce((select l2.in_metro from account_locations l2 where l2.account_id=a.id), false) in_metro
  from conn join accounts a on a.id=conn.account_id
  join v_account_role r on r.account_id=a.id and r.role::text in
    ('planner','catering','dj','florist','photographer','videographer','cake','rentals','band',
     'live_music','photo_booth','officiant','event_design','lighting_production','desserts')
  where coalesce(a.is_private,false)=false
    and not exists (select 1 from v_account_role r2 where r2.account_id=a.id and r2.role::text in ('venue','hotel'))
    and (exists (select 1 from account_locations al where al.account_id=a.id and al.in_metro)
         or exists (select 1 from staging.vendors sv where lower(sv.instagram_handle)=a.username::text))`;

async function main() {
  const argv = process.argv.slice(2);
  const get = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const tier = get("--tier") as Tier | undefined;
  const limit = Number(get("--limit") ?? "50");
  const idsFile = get("--ids-file");
  if (!tier || !["probe", "probe6", "discovered", "alias", "vendor", "vendorthin", "deepen", "discover", "crossing"].includes(tier)) {
    console.error("Usage: bun run scripts/acquire/targets.ts --tier probe|probe6|discovered|alias|vendor|vendorthin|deepen|discover|crossing [--limit N] [--ids-file path]");
    process.exit(2);
  }
  const pool = getPool();
  const poolSql =
    tier === "vendor" ? VENDOR_POOL
    : tier === "vendorthin" ? VENDORTHIN_POOL
    : tier === "alias" ? ALIAS_POOL
    : tier === "discovered" ? DISCOVERED_POOL
    : tier === "discover" ? DISCOVER_POOL
    : VENUE_POOL;
  const { rows } = await pool.query<Row>(
    `with pool as (${poolSql}),
     latest as (
       select distinct on (account_id) account_id, prior_w_per_post, status, tier
       from ops.crawl_targets where feed='tagged' and tier <> 'profile' order by account_id, evaluated_at desc),
     crawled as (
       select account_id from ops.crawl_frontier where status='crawled'
       union select account_id from latest)
     select p.*, l.prior_w_per_post::float measured_prior, l.status measured_status
     from pool p left join latest l on l.account_id = p.id
     where ${
       tier === "deepen"
         ? "l.status = 'promising' and l.prior_w_per_post >= 0.2"
         : // D065: `crossing` deliberately does NOT exclude already-crawled venues. Every other
           // coverage tier does, because their job is to reach untouched accounts -- but the whole
           // point here is the venues nearest the 6+ threshold, and 28 of the 55 in the 4-5 band are
           // already crawled AND measured `promising`. Those are the best targets we have, not the
           // worst. A re-pull at 100 posts under the 2024 floor is new depth: arm A did exactly that
           // and got 72% genuinely new posts back.
           tier === "crossing"
           ? "true"
           : "not exists (select 1 from crawled c where c.account_id = p.id)"
     }
       ${tier === "probe" ? "and p.nw <= 5" : tier === "probe6" ? "and p.nw between 6 and 15" : tier === "crossing" ? "and p.nw between 1 and 5" : ""}
       and coalesce(l.status,'') not in ('dead','excluded')`
  );
  // D063: QUALIFY before ranking, and report every exclusion with its reason. The prior ranks; it
  // does not qualify -- see disqualifyTarget. Silent filtering is how a gate bug hides good venues.
  const excluded: { r: Row; reason: Disqualification }[] = [];
  const eligible: Row[] = [];
  // D065: vendor pools get the VENDOR gate -- see disqualifyVendorTarget for why the venue gate
  // inverts on a vendor population.
  const isVendorTier = tier === "vendor" || tier === "vendorthin";
  for (const r of rows) {
    let reason = isVendorTier ? disqualifyVendorTarget(r) : disqualifyTarget(r);
    // D065: on the `crossing` tier, house_of_worship is not a disqualification. Every target here
    // already HAS 1-5 documented Chicago weddings, so it is a proven wedding venue by evidence, and
    // the type heuristic exists for UNPROVEN candidates. This is the rule VENUE_POOL already states
    // -- "venue types are a prior, never an exclusion" -- which disqualifyTarget was still
    // contradicting; month 1's low-types probe put 7 venues into 6+ from exactly this population.
    // umbrella_brand and out_of_area still apply: a national chain's or an operator's tagged feed
    // spends Chicago money on weddings in other cities.
    if (tier === "crossing" && reason === "house_of_worship") reason = null;
    if (reason) excluded.push({ r, reason });
    else eligible.push(r);
  }

  const ranked = eligible
    .map((r) => {
      const prior =
        r.measured_prior != null
          ? r.measured_prior
          : tier === "vendor" || tier === "vendorthin"
            ? vendorLookupPrior(r.role, r.own_yield != null ? Number(r.own_yield) : null)
            : venueLookupPrior(r);
      return { ...r, prior };
    })
    // D065: `vendorthin` ranks by THIN-VENUE CONNECTION COUNT first, because that -- not vendor
    // quality -- is the tier's hypothesis, and the month-1 vendor tick already showed that ranking
    // on quality alone sends the weddings to venues that are already thick. The prior still breaks
    // ties. Every other tier is unchanged: prior, then documented weddings, then followers.
    //
    // NEAR_CROSS ranks ahead of raw connection count because the metric is CROSSINGS and the
    // marginal cost of one is (6 - n). The band is not uniform: 31 venues sit at 5 weddings and need
    // one more, 24 sit at 4, but 93 sit at 1 and need five. Ranking on raw thin-venue count spends
    // equally on both ends and arm A showed what that produces -- 18 weddings and exactly ONE
    // crossing, @maxwellstrading, which happened to already be at 5.
    //
    // KNOWN RISK, deliberately left for the tick to measure rather than pre-corrected: connection
    // count correlates with account size, so this still tends to favour large accounts. On VENUE
    // feeds D062/D063 measured yield collapsing above 5k followers, and if that carries to vendor
    // feeds those are the worst targets in the pool. It is not measured on vendors, so guessing a
    // ceiling here would be the same unmeasured hand-tuning D062 had to undo -- measure.ts will
    // produce the per-account priors and the next tick can rank on them.
    .sort((a, b) =>
      tier === "crossing"
        ? // Nearest the 6+ threshold first: a venue at 5 needs ONE wedding, a venue at 1 needs five,
          // and arm A measured ~1.2 weddings per venue from a 100-post pull. Ranking by remaining
          // distance is therefore ranking by probability of actually crossing. The prior breaks ties.
          b.nw - a.nw || b.prior - a.prior || (b.followers ?? 0) - (a.followers ?? 0)
      : tier === "vendorthin"
        ? (b.near_cross ?? 0) - (a.near_cross ?? 0) ||
          (b.thin_venues ?? 0) - (a.thin_venues ?? 0) ||
          b.prior - a.prior ||
          (b.followers ?? 0) - (a.followers ?? 0)
        : b.prior - a.prior || b.nw - a.nw || (b.followers ?? 0) - (a.followers ?? 0)
    )
    .slice(0, limit);
  console.log(
    `[targets] tier=${tier} pool=${rows.length} qualified=${eligible.length} excluded=${excluded.length} ` +
      `selected=${ranked.length} (est. $${(ranked.length * 25 * 0.0023).toFixed(2)} at 25 posts each, an upper bound -- ` +
      `we bill nearer $0.0019/result, see PRICE_USD)`
  );
  if (excluded.length > 0) {
    const byReason = new Map<string, Row[]>();
    for (const e of excluded) {
      if (!byReason.has(e.reason)) byReason.set(e.reason, []);
      byReason.get(e.reason)!.push(e.r);
    }
    console.log(`[targets] excluded by reason (review these -- a gate bug hides real venues):`);
    for (const [reason, rs] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${reason.padEnd(20)} ${String(rs.length).padStart(4)}  e.g. ${rs.slice(0, 6).map((r) => "@" + r.username).join(", ")}`);
    }
  }
  console.log("  id | account | prior | src | followers | venue_type/role | weddings | why");
  for (const r of ranked) {
    console.log(
      `  ${r.id} | ${r.username} | ${r.prior.toFixed(3)} | ${r.measured_prior != null ? "measured:" + r.measured_status : "lookup"} | ${r.followers ?? "-"} | ${r.venue_type ?? r.role ?? "-"} | ${r.nw} | ${r.why}`
    );
  }
  if (idsFile) {
    writeFileSync(idsFile, ranked.map((r) => r.id).join("\n") + "\n");
    console.log(`[targets] wrote ${ranked.length} ids to ${idsFile}`);
  }
  await closePool();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
