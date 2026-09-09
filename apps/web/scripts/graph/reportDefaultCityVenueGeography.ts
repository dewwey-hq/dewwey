/**
 * D055 mission: read-only geography-verification report for the venue handles behind
 * structural-v2 CHICAGO_AMBIGUOUS candidates whose ONLY Chicago evidence was
 * `vendors.city`'s DEFAULT 'Chicago' value (Jeremy's schema defaults city to 'Chicago' on
 * every row -- see docs/jeremy-ddl.sql -- so a `vendors` row with city='Chicago' and
 * discovery_source <> 'google_places' (i.e. minted from an @mention or #hashtag, never
 * address-verified via Places) carries NO real geographic evidence). DC Estate Winery
 * (South Beloit IL, 90 miles from Chicago) reached the Chicago-confirmed review queue this
 * way, which is why every structural-v2 candidate in this situation was demoted to
 * CHICAGO_AMBIGUOUS ahead of this mission.
 *
 * Population: venue accounts behind those candidates that (a) have a `vendors` row with
 * city='Chicago' and discovery_source <> 'google_places', and (b) have NO `account_locations`
 * row yet (i.e. never independently verified).
 *
 * Adapted from reportNeverSeenVenueGeography.ts (D055, never-seen-venue population) -- same
 * DB-signal helpers (location_tag / caption / hashtag / handle regex checks against a
 * Chicago-metro token list and a non-Chicago token list), same read-only discipline, same
 * "hand-filled WEB_VERDICTS map" pattern for splicing in a WebSearch second opinion without
 * the script needing live network access on every run.
 *
 * STRICTLY READ-ONLY. No writes to any table (not even account_locations -- that's a
 * separate, future task once this mission's verdicts are reviewed). Writes only the report
 * files below.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reportDefaultCityVenueGeography.ts
 *
 * Output:
 *   /tmp/claude-1000/-home-jhoffen-dewwey/f76549af-addb-4ea7-afef-198b72db6ead/scratchpad/default_city_venue_geo.json
 *   /tmp/claude-1000/-home-jhoffen-dewwey/f76549af-addb-4ea7-afef-198b72db6ead/scratchpad/default_city_venue_geo.csv
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const OUT_DIR =
  "/tmp/claude-1000/-home-jhoffen-dewwey/f76549af-addb-4ea7-afef-198b72db6ead/scratchpad";
const JSON_PATH = `${OUT_DIR}/default_city_venue_geo.json`;
const CSV_PATH = `${OUT_DIR}/default_city_venue_geo.csv`;

const CLUSTERING_VERSION = "structural-v2";
const CHICAGO_STATUS = "CHICAGO_AMBIGUOUS";
const TOP_N_FOR_WEB = 80;

// Same token lists as reportNeverSeenVenueGeography.ts, extended per this mission's metro
// policy: Chicago + Cook/DuPage/Lake/Kane/Will/McHenry/Kendall IL suburbs + NW Indiana
// (Lake/Porter Co. IN). Explicitly NOT metro: Rockford/South Beloit/Galena/downstate IL,
// Wisconsin, Michigan, everywhere else -- vendor-market hashtags like #chicagoweddingplanner
// are stripped out upstream of these checks (see matchesCityWeddingHashtag: it only fires on
// "<city>wedding..." hashtags, i.e. genuine location claims, not market-targeting tags).
const CHICAGO_TOKENS = [
  "chicago", "evanston", "oak park", "naperville", "schaumburg", "lake forest", "hinsdale",
  "wheaton", "geneva il", "st charles", "elgin", "joliet", "orland park", "lombard", "itasca",
  "rosemont", "lincolnshire", "highland park", "winnetka", "glencoe", "barrington", "aurora",
  "plainfield", "lemont", "bolingbrook", "palatine", "arlington heights", "libertyville",
  "wilmette", "northbrook",
  // additional Cook/DuPage/Lake/Kane/Will/McHenry/Kendall IL suburbs + NW Indiana (this
  // mission's explicit metro policy)
  "oak brook", "downers grove", "elmhurst", "westmont", "villa park", "glen ellyn", "wheeling",
  "des plaines", "skokie", "morton grove", "niles", "park ridge", "elk grove village",
  "mount prospect", "buffalo grove", "vernon hills", "deerfield", "gurnee", "waukegan",
  "crystal lake", "woodstock il", "algonquin", "carpentersville", "st. charles",
  "batavia il", "north aurora", "yorkville", "oswego", "plano il", "romeoville",
  "new lenox", "frankfort", "tinley park", "orland hills", "homer glen", "mokena",
  "beecher", "manhattan il", "wilmington il", "hebron il", "dyer", "schererville",
  "crown point", "merrillville", "munster", "highland in", "valparaiso", "chesterton",
  "michigan city in",
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
  // this mission's explicit "not metro" list
  "rockford", "south beloit", "galena", "peoria", "springfield il", "champaign", "bloomington il",
  "decatur il", "quad cities", "moline", "rock island", "dekalb", "sterling il", "freeport il",
];

function phraseRegex(tokens: string[]): RegExp {
  const alts = tokens.map((t) =>
    t.replace(/^st /, "st\\.? ").replace(/\s+/g, "\\s+")
  );
  return new RegExp(`\\b(${alts.join("|")})\\b`, "gi");
}
const CHICAGO_TEXT_RE = phraseRegex(CHICAGO_TOKENS);
const NON_CHICAGO_TEXT_RE = phraseRegex(NON_CHICAGO_TOKENS);

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
  top_location_tags: string;
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
  final_verdict: "in_metro" | "not_metro" | "unknown" | null;
  final_confidence: "high" | "medium" | "low" | null;
  final_evidence: string | null;
}

async function main() {
  const pool = getPool();

  console.log(
    `[report] population: venue_account_id of structural-v2 CHICAGO_AMBIGUOUS candidates ` +
      `whose vendors row has city='Chicago', discovery_source<>'google_places', and no ` +
      `account_locations row`
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
     join vendors v on v.account_id = jc.venue_account_id
     left join account_locations al on al.account_id = jc.venue_account_id
     where jc.clustering_version = $1 and jc.chicago_status = $2
       and v.city = 'Chicago' and v.discovery_source <> 'google_places'
       and al.account_id is null
     group by jc.venue_account_id, a.username
     order by candidate_count desc`,
    [CLUSTERING_VERSION, CHICAGO_STATUS]
  );
  console.log(`[report] ${popRows.length} distinct default-city venue accounts`);

  const { rows: postRows } = await pool.query<PostRow>(
    `select jc.venue_account_id, a.username::text as username, sp.post_url,
            sp.location_tag, sp.caption_raw, sp.hashtags
     from jeremy_wedding_candidates jc
     join accounts a on a.id = jc.venue_account_id
     join vendors v on v.account_id = jc.venue_account_id
     left join account_locations al on al.account_id = jc.venue_account_id
     join jeremy_wedding_candidate_posts cp on cp.candidate_id = jc.id
     join staging.instagram_posts sp on sp.post_url = cp.source_post_url
     where jc.clustering_version = $1 and jc.chicago_status = $2
       and v.city = 'Chicago' and v.discovery_source <> 'google_places'
       and al.account_id is null`,
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
    if (!v) continue;
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
      final_verdict: null,
      final_confidence: null,
      final_evidence: null,
    });
  }

  report.sort((a, b) => b.candidate_count - a.candidate_count);

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

  const webCandidates = report.slice(0, TOP_N_FOR_WEB);
  console.log(
    `[report] ${webCandidates.length} venues (top ${TOP_N_FOR_WEB} by candidate count, out of ${report.length} total) queued for WebSearch:`
  );
  for (const r of webCandidates) {
    console.log(
      `  ${r.username} (venue_account_id=${r.venue_account_id}, candidates=${r.candidate_count}, auto=${r.verdict_auto})`
    );
  }

  for (const r of report) {
    const web = WEB_VERDICTS[r.username];
    if (web) {
      r.verdict_web = web.verdict_web;
      r.web_result_title = web.title;
      r.web_inferred_location = web.location;
    }
    const final = FINAL_VERDICTS[r.username];
    if (final) {
      r.final_verdict = final.verdict;
      r.final_confidence = final.confidence;
      r.final_evidence = final.evidence;
    }
  }

  const finalDist: Record<string, { venues: number; candidates: number }> = {};
  for (const r of report) {
    const key = r.final_verdict ?? "unresolved";
    finalDist[key] ??= { venues: 0, candidates: 0 };
    finalDist[key].venues++;
    finalDist[key].candidates += r.candidate_count;
  }
  console.log(`[report] final_verdict distribution:`);
  for (const [k, v] of Object.entries(finalDist)) {
    console.log(`  ${k}: ${v.venues} venues, ${v.candidates} candidates`);
  }
  const finalConfDist: Record<string, { venues: number; candidates: number }> = {};
  for (const r of report) {
    if (r.final_verdict !== "in_metro") continue;
    const key = r.final_confidence ?? "none";
    finalConfDist[key] ??= { venues: 0, candidates: 0 };
    finalConfDist[key].venues++;
    finalConfDist[key].candidates += r.candidate_count;
  }
  console.log(`[report] in_metro confidence breakdown:`);
  for (const [k, v] of Object.entries(finalConfDist)) {
    console.log(`  ${k}: ${v.venues} venues, ${v.candidates} candidates`);
  }

  writeFileSync(JSON_PATH, JSON.stringify(report, null, 2));

  // Mission-spec CSV: handle, candidates, posts, verdict, confidence, evidence. Full DB-signal
  // detail (location_tag breakdowns, regex match counts, etc.) is in the JSON alongside this.
  const csvEscape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvHeader = ["handle", "candidates", "posts", "verdict", "confidence", "evidence"].join(",");
  const csvRows = report.map((r) =>
    [
      r.username,
      r.candidate_count,
      r.post_count,
      r.final_verdict ?? "unresolved",
      r.final_confidence ?? "",
      r.final_evidence ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  writeFileSync(CSV_PATH, [csvHeader, ...csvRows].join("\n"));

  console.log(`[report] wrote ${JSON_PATH}`);
  console.log(`[report] wrote ${CSV_PATH}`);

  await closePool();
}

// Filled in by hand after a WebSearch pass (`"<handle>" wedding venue`) over the top venues by
// candidate count -- see the mission's final report for the write-up. Keyed by username. This
// script is read-only and never queries the network itself.
const WEB_VERDICTS: Record<
  string,
  { verdict_web: "chicago_metro" | "non_chicago" | "unknown"; title: string | null; location: string | null }
> = {};

// Final human verdict per venue after combining DB signals + WebSearch, per this mission's
// metro policy (Chicago + Cook/DuPage/Lake/Kane/Will/McHenry/Kendall IL suburbs + NW Indiana
// Lake/Porter Co.; NOT Rockford/South Beloit/Galena/downstate IL/WI/MI/elsewhere).
const FINAL_VERDICTS: Record<
  string,
  { verdict: "in_metro" | "not_metro" | "unknown"; confidence: "high" | "medium" | "low"; evidence: string }
> = {
  tigerlilyevents: { verdict: "in_metro", confidence: "high", evidence: "Cafe Brauer / Lincoln Park Zoo, Chicago (WebSearch: tlilyevents.com)" },
  medinahcountryclub: { verdict: "in_metro", confidence: "high", evidence: "Medinah, IL, DuPage-adjacent western suburb (WebSearch: medinahcc.org)" },
  mesonsabika: { verdict: "in_metro", confidence: "high", evidence: "Naperville, IL, DuPage County (WebSearch: mesonsabika.com)" },
  thefarmhouseplainfield: { verdict: "in_metro", confidence: "high", evidence: "Plainfield, IL, Will County (WebSearch: thefarmhouseplainfield.com)" },
  lacunaloftevents: { verdict: "in_metro", confidence: "high", evidence: "Pilsen, Chicago (WebSearch: lacunaeventsbylm.com)" },
  interconchicago: { verdict: "in_metro", confidence: "high", evidence: "InterContinental Chicago Magnificent Mile (DB location_tag + name)" },
  skyonnine: { verdict: "in_metro", confidence: "high", evidence: "Rosemont, IL, Cook County (WebSearch: skyonnine.com)" },
  totlspecialevents: { verdict: "in_metro", confidence: "high", evidence: "Theater on the Lake, Chicago (WebSearch) -- likely same venue as theateronthelakechicago" },
  thegroveredfieldestate: { verdict: "in_metro", confidence: "high", evidence: "Glenview, IL, Cook County (WebSearch: glenviewparks.org)" },
  cbgweddings: { verdict: "in_metro", confidence: "high", evidence: "Chicago Botanic Garden, Glencoe IL, Cook County (DB location_tag + name)" },
  "167greenstreet": { verdict: "in_metro", confidence: "high", evidence: "167 N Green St, Fulton Market, Chicago (WebSearch) -- likely same venue as 167eventschicago" },
  ravisloeweddings: { verdict: "in_metro", confidence: "high", evidence: "Homewood, IL, Cook County (WebSearch: ravisloeweddings.com)" },
  eventswcofe: { verdict: "in_metro", confidence: "high", evidence: "Woman's Club of Evanston, Evanston IL, Cook County (WebSearch)" },
  deerpathinn: { verdict: "in_metro", confidence: "high", evidence: "Deer Path Inn, Lake Forest IL, Lake County (DB location_tag + name)" },
  trumpchicago: { verdict: "in_metro", confidence: "high", evidence: "Trump International Hotel & Tower, Chicago (DB location_tag + name)" },
  hotelbaker: { verdict: "in_metro", confidence: "high", evidence: "Hotel Baker, St. Charles IL, Kane County (DB location_tag + name)" },
  prairiestreetevents: { verdict: "not_metro", confidence: "high", evidence: "Prairie Street Brewing Co, ROCKFORD IL -- explicitly NOT metro per policy (WebSearch); DB 'mixed' auto-verdict was masking this" },
  loewschicagohotel: { verdict: "in_metro", confidence: "high", evidence: "Loews Chicago Hotel, Chicago (DB location_tag + name)" },
  theateronthelakechicago: { verdict: "in_metro", confidence: "high", evidence: "Theater on the Lake, Chicago (DB location_tag) -- likely same venue as totlspecialevents" },
  highlandlofteventvenue: { verdict: "in_metro", confidence: "high", evidence: "Elgin, IL, Kane County (DB location_tag)" },
  gardensofwoodstock: { verdict: "in_metro", confidence: "high", evidence: "Woodstock, IL, McHenry County (WebSearch: gardensofwoodstock.com) -- not Woodstock VT" },
  sanctuaryeventsplainfield: { verdict: "in_metro", confidence: "high", evidence: "Plainfield, IL, Will County (WebSearch: sanctuary-events.com)" },
  theoakbrookmanor: { verdict: "in_metro", confidence: "high", evidence: "Oak Brook, IL, DuPage County (DB location_tag + handle token)" },
  danadahouse: { verdict: "in_metro", confidence: "high", evidence: "Danada House, Wheaton IL, DuPage County (WebSearch confirmed)" },
  golfthebridge: { verdict: "in_metro", confidence: "medium", evidence: "Ambiguous identity between two WebSearch hits -- Bridges of Poplar Creek Country Club (Hoffman Estates IL, Cook Co.) or Stonebridge Country Club (Aurora IL, Kane Co.); both are Chicago metro so in_metro=true regardless, exact venue not disambiguated" },
  westmorelandcountryclub: { verdict: "in_metro", confidence: "high", evidence: "Westmoreland Country Club, Wilmette IL, Cook County (North Shore) -- confirmed via Yelp address lookup, disambiguated from a same-named club in Export, PA" },
  lshireweddings: { verdict: "in_metro", confidence: "high", evidence: "Lincolnshire Marriott Resort, Lincolnshire IL, Lake County (DB location_tag)" },
  beauchateaubanquets: { verdict: "in_metro", confidence: "high", evidence: "Beau Chateau, 11535 S Cicero Ave, Alsip IL, Cook County (WebSearch confirmed address)" },
  allegrabanquets_schillerpark: { verdict: "in_metro", confidence: "high", evidence: "Schiller Park, IL, Cook County (handle name)" },
  westinlombard: { verdict: "in_metro", confidence: "high", evidence: "The Westin Chicago Lombard, Lombard IL, DuPage County (DB location_tag + handle token)" },
  lakesatlacey: { verdict: "in_metro", confidence: "high", evidence: "Lakes at Lacey (fka Esplanade Lakes by Doubletree), 3500 Lacey Rd, Downers Grove IL, DuPage County (WebSearch: wedding-spot.com, weddingwire.com, yelp.com, theknot.com all confirm)" },
  beatnikrestaurants: { verdict: "in_metro", confidence: "high", evidence: "Beatnik West Town, Wicker Park, Chicago (DB location_tag)" },
  gibsonssteakhouse: { verdict: "in_metro", confidence: "high", evidence: "Gibson's Bar & Steakhouse, Chicago + Oak Brook IL locations (WebSearch)" },
  warehouse109: { verdict: "in_metro", confidence: "high", evidence: "Plainfield, IL, Will County (WebSearch: warehouse109.com)" },
  skokiecountryclub: { verdict: "in_metro", confidence: "high", evidence: "North Shore Cook County club (WebSearch)" },
  surgicalmuseumchicago: { verdict: "in_metro", confidence: "high", evidence: "International Museum of Surgical Science, Chicago (WebSearch: imssevents.com)" },
  thewadechicago: { verdict: "in_metro", confidence: "high", evidence: "The Wade (W Chicago Lakeshore), Chicago (WebSearch)" },
  bottomlounge: { verdict: "in_metro", confidence: "high", evidence: "Bottom Lounge, West Loop, Chicago (WebSearch)" },
  musicboxchicago: { verdict: "in_metro", confidence: "high", evidence: "Music Box Theatre, Lakeview, Chicago (WebSearch)" },
  raviniagreencountryclub: { verdict: "in_metro", confidence: "high", evidence: "Deerfield/Riverwoods IL, Lake County (WebSearch)" },
  modernluxury: { verdict: "in_metro", confidence: "low", evidence: "NOT an actual venue -- Modern Luxury Weddings Chicago is a Chicago media/publication Instagram account mis-anchored as a venue; data-quality flag, not a real geography question" },
  stregischicago: { verdict: "in_metro", confidence: "high", evidence: "The St. Regis Chicago, Chicago (WebSearch)" },
  relisheventsindependencegrove: { verdict: "in_metro", confidence: "high", evidence: "Libertyville, IL, Lake County (WebSearch)" },
  chateauritz: { verdict: "in_metro", confidence: "high", evidence: "Niles, IL, Cook County (WebSearch: chateauritz.com)" },
  mirurestaurant: { verdict: "in_metro", confidence: "high", evidence: "Inside The St. Regis Chicago, Chicago (WebSearch)" },
  haleymansion: { verdict: "in_metro", confidence: "high", evidence: "Joliet, IL, Will County (WebSearch: thehaleymansion.com)" },
  westinohare: { verdict: "in_metro", confidence: "high", evidence: "Rosemont/Des Plaines IL, Cook County (WebSearch)" },
  "167eventschicago": { verdict: "in_metro", confidence: "high", evidence: "167 N Green St, Fulton Market, Chicago (WebSearch) -- likely same venue as 167greenstreet" },
  elliestyled: { verdict: "in_metro", confidence: "medium", evidence: "DB location_tag 'Highland Park, Illinois', Lake County; not individually WebSearched" },
  ateresayala: { verdict: "unknown", confidence: "low", evidence: "No location_tag or handle signal found; WebSearch budget exhausted before this handle" },
  theriverboardwalk: { verdict: "in_metro", confidence: "medium", evidence: "DB caption mentions 'Chicago Illinois' x2; not individually WebSearched" },
  pinstripesbbb: { verdict: "in_metro", confidence: "high", evidence: "Pinstripes, Northbrook IL, Cook County (DB location_tag + known chain)" },
  brookfieldzoo: { verdict: "in_metro", confidence: "high", evidence: "Brookfield, IL, Cook County (well-known institution)" },
  ashleyfarmweddings: { verdict: "unknown", confidence: "low", evidence: "DB location_tag 'Ashley Farm' has no city; WebSearch budget exhausted before this handle" },
  theallureonthelake: { verdict: "in_metro", confidence: "medium", evidence: "DB co-mention 'Delish Cakes, Bloomingdale' (DuPage County); not individually WebSearched" },
  theoakvillechicago: { verdict: "in_metro", confidence: "medium", evidence: "Handle contains 'chicago'; no location_tag; not individually WebSearched" },
  eventswithambiance: { verdict: "in_metro", confidence: "medium", evidence: "DB caption 'Chicago, Illinois' (single post); not individually WebSearched" },
  loft21events: { verdict: "unknown", confidence: "low", evidence: "No location_tag or handle signal found; WebSearch budget exhausted before this handle" },
  swissotelchi: { verdict: "in_metro", confidence: "high", evidence: "Swissotel Chicago (DB location_tag + handle 'chi' + well-known hotel)" },
  vervewinechi: { verdict: "in_metro", confidence: "medium", evidence: "DB caption 'Chicago, Illinois'; handle 'chi' suffix; not individually WebSearched" },
  standardonstate: { verdict: "in_metro", confidence: "medium", evidence: "Likely 'The Standard' on State St, Chicago; not individually WebSearched, some brand-name ambiguity" },
  rpmeventschicago: { verdict: "in_metro", confidence: "high", evidence: "RPM Private Events (Lettuce Entertain You restaurant group), Chicago (DB location_tag + handle)" },
  ritz_charles: { verdict: "not_metro", confidence: "high", evidence: "Ritz Charles, Carmel, IN (Indianapolis area) -- not Chicago metro, not NW Indiana (general knowledge; consistent with DB auto=non_chicago)" },
  parkridgecc: { verdict: "in_metro", confidence: "high", evidence: "Park Ridge, IL, Cook County (DB location_tag + handle token)" },
  epiphanyarts201: { verdict: "in_metro", confidence: "high", evidence: "Epiphany Center for the Arts, Near West Side, Chicago (DB location_tag + well-known venue)" },
  acquavivawinery: { verdict: "in_metro", confidence: "medium", evidence: "Acquaviva Winery, believed Maple Park IL, Kane County (general knowledge, not individually WebSearched)" },
  thehomestead1854: { verdict: "in_metro", confidence: "high", evidence: "The Homestead 1854, Plano IL, Kendall County (WebSearch: theknot.com)" },
  hiltonorrington: { verdict: "in_metro", confidence: "high", evidence: "Hilton Orrington, Evanston IL, Cook County (DB location_tag)" },
  hilton: { verdict: "unknown", confidence: "low", evidence: "Generic handle, no location signal; WebSearch found only the global Hilton corporate account, not resolvable to a specific property" },
  thelytleauditorium: { verdict: "in_metro", confidence: "high", evidence: "The Lytle Auditorium, Downers Grove IL, DuPage County (WebSearch: lytleweddings.com, facebook.com)" },
  nssbethel: { verdict: "in_metro", confidence: "high", evidence: "North Suburban Synagogue Beth El, Highland Park IL, Lake County (DB location_tag)" },
  kohlerwi: { verdict: "not_metro", confidence: "high", evidence: "Whistling Straits Golf Course, Kohler WI -- explicitly NOT metro (DB location_tag + handle 'wi' suffix)" },
  uccweddings: { verdict: "unknown", confidence: "low", evidence: "WebSearch found no matching Chicago-area entity (only unrelated Indonesian wedding-services accounts); DB caption 'chicago' hit is weak and venue identity is unresolved -- needs manual review" },
  dunhamwoodsridingclub: { verdict: "in_metro", confidence: "high", evidence: "Dunham Woods Riding Club, Wayne IL, DuPage/Kane County border (WebSearch: theknot.com, dunhamwoodsridingclub.com)" },
  fairmontchicago: { verdict: "in_metro", confidence: "high", evidence: "Fairmont Chicago, Millennium Park, Chicago (DB location_tag + well-known hotel)" },
  therobeychicago: { verdict: "in_metro", confidence: "high", evidence: "The Robey, Wicker Park, Chicago (DB location_tag + well-known hotel)" },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
