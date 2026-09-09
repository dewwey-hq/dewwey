/**
 * D055 mission: read-only geography-verification report for the ~1,000 "never-seen" venue
 * handles behind the 1,837 structural-v2 CHICAGO_AMBIGUOUS candidates. These venue anchors
 * are bare `accounts` rows minted by upsertAccountsForStackHandles.ts — no bio, no `vendors`
 * row, no `account_locations` row — so the clustering pass can't resolve chicago_status and
 * dumps them all into CHICAGO_AMBIGUOUS. D052 found that most never-seen "venues" credited in
 * this corpus are out-of-market destination venues (Lake Geneva WI, Michigan, Atlanta,
 * Europe…) that a Chicago-based vendor shot on location. This script sizes that split using
 * only free DB signals (location_tag, caption city/state mentions, hashtags, handle tokens),
 * then — for the top 60 venues by candidate count still ambiguous after the DB pass — adds one
 * WebSearch each as a second opinion.
 *
 * STRICTLY READ-ONLY. No writes to any table (not even account_locations, which is where a
 * verdict would eventually land — that's a separate, future task). Writes only the report
 * files below.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reportNeverSeenVenueGeography.ts
 *
 * Output:
 *   /tmp/claude-1000/-home-jhoffen-dewwey/f76549af-addb-4ea7-afef-198b72db6ead/scratchpad/never_seen_venue_geo.json
 *   /tmp/claude-1000/-home-jhoffen-dewwey/f76549af-addb-4ea7-afef-198b72db6ead/scratchpad/never_seen_venue_geo.csv
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const OUT_DIR =
  "/tmp/claude-1000/-home-jhoffen-dewwey/f76549af-addb-4ea7-afef-198b72db6ead/scratchpad";
const JSON_PATH = `${OUT_DIR}/never_seen_venue_geo.json`;
const CSV_PATH = `${OUT_DIR}/never_seen_venue_geo.csv`;

const CLUSTERING_VERSION = "structural-v2";
const CHICAGO_STATUS = "CHICAGO_AMBIGUOUS";
const TOP_N_FOR_WEB = 60;

// Same two lists in every one of the four free-signal checks (location_tag, caption text,
// hashtags, handle) -- kept as plain word/phrase tokens here and turned into the two different
// regex shapes each check needs below (word-boundary phrase match for location_tag/caption;
// space-stripped prefix match for hashtags/handle, since IG hashtags and handles never carry
// spaces or punctuation).
const CHICAGO_TOKENS = [
  "chicago", "evanston", "oak park", "naperville", "schaumburg", "lake forest", "hinsdale",
  "wheaton", "geneva il", "st charles", "elgin", "joliet", "orland park", "lombard", "itasca",
  "rosemont", "lincolnshire", "highland park", "winnetka", "glencoe", "barrington", "aurora",
  "plainfield", "lemont", "bolingbrook", "palatine", "arlington heights", "libertyville",
  "wilmette", "northbrook",
];
const NON_CHICAGO_TOKENS = [
  "wisconsin", "milwaukee", "lake geneva", "door county", "michigan", "grand rapids", "detroit",
  "indiana", "indianapolis", "minnesota", "minneapolis", "ohio", "iowa", "missouri", "st louis",
  "kansas city", "new york", "nyc", "california", "los angeles", "san diego", "napa", "texas",
  "austin", "dallas", "houston", "florida", "miami", "tampa", "orlando", "georgia", "atlanta",
  "colorado", "denver", "arizona", "scottsdale", "phoenix", "utah", "nevada", "las vegas",
  "washington dc", "virginia", "carolina", "charleston", "tennessee", "nashville", "kentucky",
  "louisville", "mexico", "cancun", "tulum", "italy", "france", "paris", "spain", "portugal",
  "ireland", "scotland", "england", "london", "greece", "croatia", "hawaii", "maui",
  "puerto rico", "jamaica", "bahamas", "costa rica", "colombia", "dominican",
];

// Text-form regexes (location_tag + caption): \b word-boundary phrase match, same shape as the
// mission brief's Postgres \y regex (JS has no \y; \b is the equivalent for these all-ASCII
// word tokens). "st charles"/"st louis" are written to also match the "St." / "St " variants.
function phraseRegex(tokens: string[]): RegExp {
  const alts = tokens.map((t) =>
    t.replace(/^st /, "st\\.? ").replace(/\s+/g, "\\s+")
  );
  return new RegExp(`\\b(${alts.join("|")})\\b`, "gi");
}
const CHICAGO_TEXT_RE = phraseRegex(CHICAGO_TOKENS);
const NON_CHICAGO_TEXT_RE = phraseRegex(NON_CHICAGO_TOKENS);

// Hashtag/handle-form tokens: spaces and periods stripped, since "#lakegenevawedding" and
// "lakegeneva_events" never carry the space in "lake geneva".
const toHashtagToken = (t: string) => t.replace(/[^a-z]/gi, "").toLowerCase();
const CHICAGO_HASHTAG_TOKENS = CHICAGO_TOKENS.map(toHashtagToken);
const NON_CHICAGO_HASHTAG_TOKENS = NON_CHICAGO_TOKENS.map(toHashtagToken);

function matchesCityWeddingHashtag(hashtag: string, tokens: string[]): string | null {
  const h = hashtag.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const tok of tokens) {
    if (tok.length >= 3 && h.startsWith(tok) && h.slice(tok.length).startsWith("wedding")) {
      return tok;
    }
  }
  return null;
}

function handleToken(username: string, tokens: string[]): string | null {
  const h = username.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const tok of tokens) {
    // "aurora"/"joliet" etc are short enough to false-positive inside unrelated words; still
    // worth flagging as a weak signal, disambiguated by the other 3 signal types.
    if (tok.length >= 4 && h.includes(tok)) return tok;
  }
  return null;
}

interface PostRow {
  venue_account_id: number;
  username: string;
  post_url: string;
  location_tag: string | null;
  caption_raw: string | null;
  hashtags: string[] | null;
}

interface VenueAgg {
  venueAccountId: number;
  username: string;
  candidateCount: number;
  postCount: number;
  locationTags: Map<string, number>;
  locationTagChicagoMatches: number;
  locationTagNonChicagoMatches: number;
  captionChicagoMatches: number;
  captionNonChicagoMatches: number;
  hashtagChicagoMatches: number;
  hashtagNonChicagoMatches: number;
  handleChicagoToken: string | null;
  handleNonChicagoToken: string | null;
}

interface VenueReportRow {
  venue_account_id: number;
  username: string;
  candidate_count: number;
  post_count: number;
  top_location_tags: string; // "tag:count; tag:count"
  location_tag_chicago_matches: number;
  location_tag_non_chicago_matches: number;
  caption_chicago_matches: number;
  caption_non_chicago_matches: number;
  hashtag_chicago_matches: number;
  hashtag_non_chicago_matches: number;
  handle_chicago_token: string | null;
  handle_non_chicago_token: string | null;
  chicago_signals: number;
  non_chicago_signals: number;
  verdict_auto: "chicago_metro" | "non_chicago" | "mixed" | "unknown";
  verdict_web: "chicago_metro" | "non_chicago" | "unknown" | null;
  web_result_title: string | null;
  web_inferred_location: string | null;
}

async function main() {
  const pool = getPool();

  console.log(
    `[report] population: distinct venue_account_id of jeremy_wedding_candidates where clustering_version='${CLUSTERING_VERSION}' and chicago_status='${CHICAGO_STATUS}'`
  );

  const { rows: popRows } = await pool.query<{
    venue_account_id: number;
    username: string;
    candidate_count: string;
  }>(
    `select jc.venue_account_id, a.username::text as username,
            count(distinct jc.id) as candidate_count
     from jeremy_wedding_candidates jc
     join accounts a on a.id = jc.venue_account_id
     where jc.clustering_version = $1 and jc.chicago_status = $2
     group by jc.venue_account_id, a.username
     order by candidate_count desc`,
    [CLUSTERING_VERSION, CHICAGO_STATUS]
  );
  console.log(`[report] ${popRows.length} distinct never-seen venue accounts`);

  const { rows: postRows } = await pool.query<PostRow>(
    `select jc.venue_account_id, a.username::text as username, sp.post_url,
            sp.location_tag, sp.caption_raw, sp.hashtags
     from jeremy_wedding_candidates jc
     join accounts a on a.id = jc.venue_account_id
     join jeremy_wedding_candidate_posts cp on cp.candidate_id = jc.id
     join staging.instagram_posts sp on sp.post_url = cp.source_post_url
     where jc.clustering_version = $1 and jc.chicago_status = $2`,
    [CLUSTERING_VERSION, CHICAGO_STATUS]
  );
  console.log(`[report] ${postRows.length} posts backing those candidates`);

  const agg = new Map<number, VenueAgg>();
  for (const p of popRows) {
    agg.set(p.venue_account_id, {
      venueAccountId: p.venue_account_id,
      username: p.username,
      candidateCount: Number(p.candidate_count),
      postCount: 0,
      locationTags: new Map(),
      locationTagChicagoMatches: 0,
      locationTagNonChicagoMatches: 0,
      captionChicagoMatches: 0,
      captionNonChicagoMatches: 0,
      hashtagChicagoMatches: 0,
      hashtagNonChicagoMatches: 0,
      handleChicagoToken: handleToken(p.username, CHICAGO_HASHTAG_TOKENS),
      handleNonChicagoToken: handleToken(p.username, NON_CHICAGO_HASHTAG_TOKENS),
    });
  }

  for (const post of postRows) {
    const v = agg.get(post.venue_account_id);
    if (!v) continue; // shouldn't happen; population query and post query share the same where clause
    v.postCount++;

    if (post.location_tag) {
      v.locationTags.set(post.location_tag, (v.locationTags.get(post.location_tag) ?? 0) + 1);
      if (CHICAGO_TEXT_RE.test(post.location_tag)) v.locationTagChicagoMatches++;
      CHICAGO_TEXT_RE.lastIndex = 0;
      if (NON_CHICAGO_TEXT_RE.test(post.location_tag)) v.locationTagNonChicagoMatches++;
      NON_CHICAGO_TEXT_RE.lastIndex = 0;
    }

    if (post.caption_raw) {
      const chicagoHits = post.caption_raw.match(CHICAGO_TEXT_RE);
      v.captionChicagoMatches += chicagoHits ? chicagoHits.length : 0;
      const nonChicagoHits = post.caption_raw.match(NON_CHICAGO_TEXT_RE);
      v.captionNonChicagoMatches += nonChicagoHits ? nonChicagoHits.length : 0;
    }

    if (Array.isArray(post.hashtags)) {
      for (const h of post.hashtags) {
        if (matchesCityWeddingHashtag(h, CHICAGO_HASHTAG_TOKENS)) v.hashtagChicagoMatches++;
        if (matchesCityWeddingHashtag(h, NON_CHICAGO_HASHTAG_TOKENS)) v.hashtagNonChicagoMatches++;
      }
    }
  }

  const report: VenueReportRow[] = [];
  for (const v of agg.values()) {
    const chicagoSignals =
      v.locationTagChicagoMatches +
      v.captionChicagoMatches +
      v.hashtagChicagoMatches +
      (v.handleChicagoToken ? 1 : 0);
    const nonChicagoSignals =
      v.locationTagNonChicagoMatches +
      v.captionNonChicagoMatches +
      v.hashtagNonChicagoMatches +
      (v.handleNonChicagoToken ? 1 : 0);

    let verdictAuto: VenueReportRow["verdict_auto"];
    if (chicagoSignals >= 3 && nonChicagoSignals === 0) verdictAuto = "chicago_metro";
    else if (nonChicagoSignals >= 2 && chicagoSignals === 0) verdictAuto = "non_chicago";
    else if (chicagoSignals > 0 && nonChicagoSignals > 0) verdictAuto = "mixed";
    else verdictAuto = "unknown";

    const topTags = [...v.locationTags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => `${tag}:${count}`)
      .join("; ");

    report.push({
      venue_account_id: v.venueAccountId,
      username: v.username,
      candidate_count: v.candidateCount,
      post_count: v.postCount,
      top_location_tags: topTags,
      location_tag_chicago_matches: v.locationTagChicagoMatches,
      location_tag_non_chicago_matches: v.locationTagNonChicagoMatches,
      caption_chicago_matches: v.captionChicagoMatches,
      caption_non_chicago_matches: v.captionNonChicagoMatches,
      hashtag_chicago_matches: v.hashtagChicagoMatches,
      hashtag_non_chicago_matches: v.hashtagNonChicagoMatches,
      handle_chicago_token: v.handleChicagoToken,
      handle_non_chicago_token: v.handleNonChicagoToken,
      chicago_signals: chicagoSignals,
      non_chicago_signals: nonChicagoSignals,
      verdict_auto: verdictAuto,
      verdict_web: null,
      web_result_title: null,
      web_inferred_location: null,
    });
  }

  report.sort((a, b) => b.candidate_count - a.candidate_count);

  // Distribution
  const dist: Record<string, { venues: number; candidates: number }> = {};
  for (const r of report) {
    dist[r.verdict_auto] ??= { venues: 0, candidates: 0 };
    dist[r.verdict_auto].venues++;
    dist[r.verdict_auto].candidates += r.candidate_count;
  }
  console.log(`[report] verdict_auto distribution:`);
  for (const [k, v] of Object.entries(dist)) {
    console.log(`  ${k}: ${v.venues} venues, ${v.candidates} candidates`);
  }

  // Top N by candidate count among unknown/mixed -- these are the ones a WebSearch pass gets
  // run against (done separately, by hand, and spliced into WEB_VERDICTS below on a second
  // pass of this file -- see the constant just below main()).
  const webCandidates = report
    .filter((r) => r.verdict_auto === "unknown" || r.verdict_auto === "mixed")
    .slice(0, TOP_N_FOR_WEB);
  console.log(
    `[report] ${webCandidates.length} unknown/mixed venues in the top ${TOP_N_FOR_WEB} by candidate count queued for WebSearch:`
  );
  for (const r of webCandidates) {
    console.log(`  ${r.username} (venue_account_id=${r.venue_account_id}, candidates=${r.candidate_count})`);
  }

  for (const r of report) {
    const web = WEB_VERDICTS[r.username];
    if (web) {
      r.verdict_web = web.verdict_web;
      r.web_result_title = web.title;
      r.web_inferred_location = web.location;
    }
  }

  writeFileSync(JSON_PATH, JSON.stringify(report, null, 2));

  const csvHeader = Object.keys(report[0]).join(",");
  const csvEscape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvRows = report.map((r) =>
    Object.values(r).map(csvEscape).join(",")
  );
  writeFileSync(CSV_PATH, [csvHeader, ...csvRows].join("\n"));

  console.log(`[report] wrote ${JSON_PATH}`);
  console.log(`[report] wrote ${CSV_PATH}`);

  await closePool();
}

// Filled in by hand after a WebSearch pass over the top-60 unknown/mixed venues (`"<handle>"
// instagram venue`) -- see the mission's final report for the write-up. Keyed by username.
// This script is read-only and never queries the network itself; this map is how the WebSearch
// second opinion gets attached to the DB-signal report without the script needing live network
// access on every run.
const WEB_VERDICTS: Record<
  string,
  { verdict_web: "chicago_metro" | "non_chicago" | "unknown"; title: string | null; location: string | null }
> = {
  // --- chicago_metro (8) ---
  mortonarb: { verdict_web: "chicago_metro", title: "The Morton Arboretum | Lisle IL", location: "Lisle, IL (DuPage County, Chicago metro)" },
  providencevineyard: { verdict_web: "chicago_metro", title: "Providence Vineyard Event Venue (@providencevineyard)", location: "Hebron, IL, marketed as 'Chicagoland' venue" },
  meyerscastle: { verdict_web: "chicago_metro", title: "MEYER'S CASTLE - CHICAGO / NWI WEDDING VENUE (@meyerscastle)", location: "Dyer, IN, 12 miles from Chicago (NW Indiana, Chicago metro)" },
  fishermensinn: { verdict_web: "chicago_metro", title: "Fishermens Inn - Timeless Chicagoland Wedding Venue", location: "Elburn, IL, western Chicago suburbs" },
  barnandvineyard: { verdict_web: "chicago_metro", title: "The Barn & Vineyard (@barnandvineyard)", location: "Beecher, IL" },
  cotillion_banquets: { verdict_web: "chicago_metro", title: "Cotillion Banquets - Palatine, IL - Wedding Venue", location: "Palatine, IL" },
  whitestoneeventsvenue: { verdict_web: "chicago_metro", title: "White Stone Events | Wedding and Event Venue (@whitestoneeventsvenue)", location: "Sugar Grove, IL, 'Chicagoland's Premier 20 Acre Estate'" },
  "warwick.allerton.chicago": { verdict_web: "chicago_metro", title: "Warwick Allerton Hotel (@warwick.allerton.chicago)", location: "701 N Michigan Ave, Chicago, IL (Magnificent Mile)" },

  // --- non_chicago (51) ---
  baypointeweddings: { verdict_web: "non_chicago", title: "Bay Pointe Weddings (@baypointeweddings)", location: "Shelbyville, MI (Gun Lake)" },
  thevillamke: { verdict_web: "non_chicago", title: "Villa Terrace Celebrations (@thevillamke)", location: "Milwaukee, WI" },
  northernhaus: { verdict_web: "non_chicago", title: "Northern Haus — The Venue", location: "Sister Bay, Door County, WI" },
  grandgimeno: { verdict_web: "non_chicago", title: "Grand Gimeno (@grandgimeno)", location: "Orange, CA" },
  theswannerhouse_1923: { verdict_web: "non_chicago", title: "The Swanner House (@theswannerhouse_1923)", location: "San Juan Capistrano, CA" },
  stjames1868: { verdict_web: "non_chicago", title: "St. James 1868 (@stjames1868)", location: "Milwaukee, WI" },
  "woodstock.inn": { verdict_web: "non_chicago", title: "Woodstock Inn & Resort (@woodstock.inn)", location: "Woodstock, VT" },
  theivyhousemke: { verdict_web: "non_chicago", title: "The Ivy House (@theivyhousemke)", location: "Milwaukee, WI (Walker's Point)" },
  coosawpoint: { verdict_web: "non_chicago", title: "Coosaw Point (@coosawpoint)", location: "Beaufort, SC" },
  lakegeneva_riviera_weddings: { verdict_web: "non_chicago", title: "Riviera Ballroom (@lakegeneva_riviera_weddings)", location: "Lake Geneva, WI" },
  etrefarms: { verdict_web: "non_chicago", title: "Être Farms Wedding Venue (@etrefarms)", location: "St. Joseph, MI (marketed as '1 hr from Chicago', not itself in-metro)" },
  thesistersofcedarlakes: { verdict_web: "non_chicago", title: "Cedar Lakes Estate (@thesistersofcedarlakes)", location: "Port Jervis, NY (Hudson Valley)" },
  oldursulineconvent: { verdict_web: "non_chicago", title: "Old Ursuline Convent Museum (@oldursulineconventmuseum)", location: "New Orleans, LA (French Quarter)" },
  mayflowerauberge: { verdict_web: "non_chicago", title: "Mayflower Inn & Spa, Auberge Collection (@mayflowerauberge)", location: "Washington, CT" },
  mackeyhousesavannah: { verdict_web: "non_chicago", title: "The Mackey House (@themackeyhouse)", location: "Savannah, GA" },
  bakereventsholland: { verdict_web: "non_chicago", title: "Baker Events (@bakereventsholland)", location: "Holland, MI" },
  horticulturalhalllkgeneva: { verdict_web: "non_chicago", title: "Horticultural Hall (@horticulturalhalllkgeneva)", location: "Lake Geneva, WI" },
  "weddings.oftheland": { verdict_web: "non_chicago", title: "Of the Land Weddings (@weddings.oftheland)", location: "Battle Creek, MI" },
  eventsatwillowhill: { verdict_web: "non_chicago", title: "Willow Hill (@eventsatwillowhill)", location: "Brooklyn, CT" },
  "1841farmsandvineyard": { verdict_web: "non_chicago", title: "1841 Farms and Vineyard", location: "Burlington, WI" },
  abbeyresort: { verdict_web: "non_chicago", title: "The Abbey Resort (@abbeyresort)", location: "Fontana, WI (Lake Geneva area)" },
  bluedressbarn: { verdict_web: "non_chicago", title: "Historic Wedding Venue & Event Space (@bluedressbarn)", location: "Benton Harbor, MI" },
  oasisatdeathvalleyweddings: { verdict_web: "non_chicago", title: "The Oasis at Death Valley", location: "Furnace Creek, CA (Death Valley NP)" },
  buckislandresort: { verdict_web: "non_chicago", title: "Buck Island (@buckislandresort)", location: "Hilton Head, SC" },
  thefitzgeraldmke: { verdict_web: "non_chicago", title: "The Fitzgerald (@thefitzgeraldmke)", location: "Milwaukee, WI" },
  "620loftgarden": { verdict_web: "non_chicago", title: "620 Loft & Garden (@620loftgarden)", location: "Rockefeller Center, New York, NY" },
  experience_nd: { verdict_web: "non_chicago", title: "Experience Notre Dame (@experience_nd)", location: "Notre Dame, IN (South Bend area)" },
  abellaeventsmn: { verdict_web: "non_chicago", title: "Abella Weddings & Events (@abellaeventsmn)", location: "Chisago City, MN" },
  atlantahistorycenter: { verdict_web: "non_chicago", title: "Atlanta History Center (@atlantahistorycenter)", location: "Atlanta, GA (Buckhead)" },
  michiganmaritimemuseum: { verdict_web: "non_chicago", title: "Michigan Maritime Museum (@michiganmaritimemuseum)", location: "South Haven, MI" },
  abloomfarm: { verdict_web: "non_chicago", title: "Abloom Farm (@abloomfarm)", location: "Saukville, WI" },
  eppingforestevents: { verdict_web: "non_chicago", title: "EFYCC Weddings & Events (@eppingforestevents)", location: "Jacksonville, FL" },
  embassysuitesstaugustinebeach: { verdict_web: "non_chicago", title: "Embassy Suites St. Augustine (@embassysuitesstaugustinebeach)", location: "St. Augustine Beach, FL" },
  commonhouserva: { verdict_web: "non_chicago", title: "Common House Richmond (@commonhouserva)", location: "Richmond, VA" },
  cccnola: { verdict_web: "non_chicago", title: "Christ Church Cathedral, New Orleans (cccnola)", location: "New Orleans, LA" },
  windowsontheriver: { verdict_web: "non_chicago", title: "Windows On The River (@windowsontheriver)", location: "Cleveland, OH" },
  casamonicaresortandspa: { verdict_web: "non_chicago", title: "Casa Monica Resort & Spa (@casamonicaresortandspa)", location: "St. Augustine, FL" },
  cactusjoesevents: { verdict_web: "non_chicago", title: "Cactus Joe's Events (@cactusjoesevents)", location: "Las Vegas, NV (Blue Diamond)" },
  bryndumansion: { verdict_web: "non_chicago", title: "Bryn Du Mansion (@bryndumansion)", location: "Granville, OH" },
  bridalveillakes: { verdict_web: "non_chicago", title: "Bridal Veil Lakes Oregon Wedding Venue (@bridalveillakes)", location: "Columbia River Gorge, OR" },
  thecommodoredelafield: { verdict_web: "non_chicago", title: "The Commodore - A Bartolotta Restaurant (@thecommodoredelafield)", location: "Hartland, WI (Lake Country)" },
  parkwinters: { verdict_web: "non_chicago", title: "Park Winters (@parkwinters)", location: "Winters, CA" },
  thegeorgemke: { verdict_web: "non_chicago", title: "The George and Madcap Lounge (@thegeorgemke)", location: "Milwaukee, WI" },
  weismanartmuseum: { verdict_web: "non_chicago", title: "Weisman Art Museum", location: "Minneapolis, MN (University of Minnesota)" },
  embassy_suites_rockford: { verdict_web: "non_chicago", title: "Embassy Suites Rockford (@embassy_suites_rockford)", location: "Rockford, IL — its own MSA, ~90mi from Chicago, not Chicago metro" },
  thecovenantatmurraymansion: { verdict_web: "non_chicago", title: "The Covenant at Murray Mansion (@thecovenantatmurraymansion)", location: "Racine, WI (~45 min south of Milwaukee)" },
  "wedgewood.galwaydowns": { verdict_web: "non_chicago", title: "Galway Downs by Wedgewood Weddings (@wedgewood.galwaydowns)", location: "Temecula, CA" },
  thecolonypalmbeach: { verdict_web: "non_chicago", title: "The Colony Hotel (@thecolonypalmbeach)", location: "Palm Beach, FL" },
  theclaytheatre: { verdict_web: "non_chicago", title: "Clay Theatre (@theclaytheatre)", location: "Green Cove Springs, FL" },
  theballroomatmckay: { verdict_web: "non_chicago", title: "The Ballroom at McKay (@theballroomatmckay)", location: "Grand Rapids, MI" },
  "st.paulscatholicjaxbeach": { verdict_web: "non_chicago", title: "St. Paul's Catholic Church / School Jax Beach (@st.paulscatholicjaxbeach)", location: "Jacksonville Beach, FL" },

  // --- unknown (1) ---
  audubon_weddings: { verdict_web: "unknown", title: "Audubon Weddings (@audubon_weddings)", location: "Multi-location brand handle (PA/LA/NH Audubon venues) — no single city resolvable" },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
