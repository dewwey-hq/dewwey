/**
 * Maps Instagram `location_tag` strings (`staging.instagram_posts.location_tag`) to a venue
 * `accounts.id`, so posts can be venue-anchored from the platform's structured place tag
 * instead of caption parsing. Read-only report by default (see --apply below).
 * Same conservative philosophy as matchVenuelessLocationTags.ts: only resolve a tag when it
 * names exactly one venue-role account, exclude generic city/neighborhood tags, and flag
 * (never resolve) matches that hit a non-venue business or 2+ distinct venues. Normalization
 * strips common suffixes ("Walden Chicago" -> "walden") so trivial variants match
 * vendors.name/accounts.full_name without a query per tag.
 * Usage (from apps/web):
 *   bun run scripts/graph/buildLocationTagVenueMap.ts             # report only, no writes
 *   bun run scripts/graph/buildLocationTagVenueMap.ts --apply     # create table + insert confident rows
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const TOP_N_TAGS = 400;
const REPORT_PATH =
  "/tmp/claude-1000/-home-jhoffen-dewwey/f76549af-addb-4ea7-afef-198b72db6ead/scratchpad/location_tag_map_report.json";

const CREATE_TABLE = `
  create table if not exists location_tag_venue_map (
    location_tag     text primary key,
    venue_account_id bigint not null references accounts(id),
    match_tier       text not null,
    note             text,
    confirmed_at      timestamptz not null default now()
  );`;

const GENERIC_EXACT = new Set(
  ["Chicago", "Chicago, Illinois", "Chicago Ilinois", "Chicago Illinois", "Chicago, IL",
   "Illinois", "Private Location", "Downtown Chicago"].map((s) => s.toLowerCase())
);
const GENERIC_STATE_SUFFIX = /^[A-Za-z .]+,\s*(Illinois|IL)$/i;
const GENERIC_NEIGHBORHOODS = new Set(
  ["West Loop", "River North", "Lincoln Park", "Wicker Park", "Gold Coast", "Logan Square",
   "Fulton Market", "Streeterville", "Old Town", "Bucktown", "South Loop", "Hyde Park",
   "Pilsen", "Lakeview", "Uptown", "Andersonville", "Ravenswood", "Evanston", "Oak Park",
   "Naperville", "Schaumburg", "Lake Geneva", "Milwaukee"].map((s) => s.toLowerCase())
);
const isGeneric = (tag: string) => {
  const t = tag.trim(), lower = t.toLowerCase();
  return GENERIC_EXACT.has(lower) || GENERIC_STATE_SUFFIX.test(t) || GENERIC_NEIGHBORHOODS.has(lower);
};

const TRAILING_SUFFIXES = [
  " chicago il", " chicago", " il", " illinois", " hotel", " event venue",
  " events", " venue", " weddings", " wedding venue", ", chicago",
];
function normalize(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (s.startsWith("the ")) s = s.slice(4);
  for (let changed = true; changed; ) {
    changed = false;
    for (const suf of TRAILING_SUFFIXES) {
      if (s.endsWith(suf)) { s = s.slice(0, -suf.length).trim(); changed = true; }
    }
  }
  return s.replace(/[,.'’&\-()!]/g, "").replace(/\s+/g, " ").trim();
}

// Hand-pass residue (D055, 2026-09-08): tags the automatic tiers missed, each verified by hand
// against accounts/vendors (name divergence the normalizer can't cover -- "LondonHouse Chicago"
// vs "LondonHouse Chicago, Curio Collection by Hilton", "Wildman BT" vs "WildmanBT", hotel-brand
// suffixes, or a tag naming the building rather than the account). Username is resolved to its
// account_aliases canonical at apply time. Deliberately NOT included after inspection: "Lacuna
// Lofts" (4 distinct lacuna* venue accounts, genuinely ambiguous), "The Library Club" (unclear
// vs "The Library" at 190 S LaSalle), "Nobu Restaurants" (global brand handle), and any tag
// naming a non-venue vendor's own shop or a city/neighborhood/park.
const HAND_PASS: { tag: string; username: string; note: string }[] = [
  // Round 2 (D055 strong push, 2026-09-10): pool-B tags with >=3 wedding-language posts that the
  // automatic tiers missed (name variants, missing vendors.name, or an accounts row with no
  // full_name). Every username below exists and is account_locations.in_metro=true.
  { tag: "Lacuna Lofts", username: "lacunaloftevents", note: "round 2: 65 posts; @lacunalofts also exists (0 weddings, no profile) -- events handle is the documented one" },
  { tag: "The Haight", username: "thehaight", note: "round 2: 43 posts; Elgin" },
  { tag: "Gather", username: "gatherpingreegrove", note: "round 2: 42 posts; in this corpus 'Gather' is the Pingree Grove venue (its own posts carry the tag)" },
  { tag: "Concorde Banquets", username: "concordebanquets", note: "round 2: 30 posts; Kildeer" },
  { tag: "Providence Vineyard", username: "providencevineyard", note: "round 2: 27 posts; Hebron" },
  { tag: "Redfield Estate", username: "thegroveredfieldestate", note: "round 2: 24 posts; Glenview" },
  { tag: "Sky on Nine", username: "skyonnine", note: "round 2; Oak Brook" },
  { tag: "Elawa Farm", username: "elawafarm", note: "round 2; Lake Forest" },
  { tag: "The Herrington Inn & Spa  Geneva, IL", username: "theherringtoninnandspa", note: "round 2; double-space in the IG tag is literal" },
  { tag: "Royal Sonesta Chicago Downtown", username: "royalsonestachicago", note: "round 2" },
  { tag: "The Westin Chicago River North", username: "westinchicagorivernorth", note: "round 2" },
  { tag: "Ravisloe Country Club", username: "ravisloeweddings", note: "round 2; Homewood" },
  { tag: "Drury Lane", username: "drurylaneevents", note: "round 2; Oakbrook Terrace" },
  { tag: "Venuti's Banquets & Ristorante", username: "venutisrestaurant", note: "round 2; Addison" },
  { tag: "Fishermen's Inn Elburn", username: "fishermensinn", note: "round 2; Elburn" },
  { tag: "White Stone Events", username: "whitestoneeventsvenue", note: "round 2" },
  { tag: "The Haley Mansion", username: "haleymansion", note: "round 2; Joliet" },
  { tag: "Biagio Events & Catering", username: "biagioevents", note: "round 2; Addison" },
  { tag: "Saddle Cycle Club", username: "saddleandcycleclub", note: "round 2; Lincoln Park" },
  { tag: "City View Loft Chicago", username: "cityviewloft", note: "round 2; West Loop" },
  { tag: "The Allure on The Lake", username: "theallureonthelake", note: "round 2; Chesterton IN (NW Indiana = metro)" },
  { tag: "The Gardens of Woodstock", username: "gardensofwoodstock", note: "round 2; Woodstock IL" },
  { tag: "Wildman BT", username: "wildmanbt", note: "vendors.name 'WildmanBT' (no space)" },
  { tag: "InterContinental Chicago Magnificent Mile", username: "intercontinental", note: "vendors.name has ' by IHG' suffix" },
  { tag: "LondonHouse Chicago", username: "lhchicago", note: "vendors.name has ', Curio Collection by Hilton' suffix" },
  { tag: "Raised an Urban Rooftop Bar", username: "raisedbarchicago", note: "vendors.name 'RAISED | An Urban Rooftop Bar'" },
  { tag: "Riu Plaza Chicago", username: "riuplazachicago", note: "vendors.name 'Riu Rooftop Chicago' (rooftop venue in the Riu Plaza hotel)" },
  { tag: "The Armour House", username: "thearmourhousemansion", note: "vendors.name '... at Lake Forest Academy'" },
  { tag: "Morgan's on Fulton", username: "morgansonfulton", note: "handle-only vendor row" },
  { tag: "Homestead", username: "homesteadontheroof", note: "vendors.name 'Homestead On The Roof'" },
  { tag: "Jefferson Tap & Grille", username: "jefferson_tap", note: "vendors.name 'The Loft at Jefferson Tap'" },
  { tag: "Woman's Athletic Club", username: "wacchicago", note: "bridged D052" },
  { tag: "Trump International Hotel & Tower Chicago", username: "trumphotels", note: "CAUTION: vendor row is bridged to the global brand handle; the tag itself is unambiguous (the Chicago tower). Brand-handle bridges need a cleanup pass" },
  { tag: "The Carter", username: "the_carter_fultonmarket", note: "vendors.name 'The Carter Chicago ~ Event Space & Wedding Venue'" },
  { tag: "Mesón Sabika", username: "mesonsabika", note: "Naperville; venue-role account" },
  { tag: "Palmer House Hilton Downtown Chicago", username: "palmerhousehilton", note: "hotel-brand suffix variant" },
  { tag: "Palmer House", username: "palmerhousehilton", note: "short variant" },
  { tag: "Cantigny Park", username: "cantignypark", note: "handle-only vendor row" },
  { tag: "IO Godfrey", username: "iogodfrey", note: "vendors.name 'IO Godfrey Rooftop Lounge'" },
  { tag: "Venue 5126", username: "venue5126", note: "handle-only vendor row" },
  { tag: "Medinah Country Club", username: "medinahcountryclub", note: "handle-only vendor row" },
  { tag: "Salvatore's", username: "salvatoreschicago", note: "vendors.name 'Salvatore's Wedding and Event Venue'" },
  { tag: "The Drake Oak Brook, Autograph Collection", username: "thedrakeoakbrook", note: "NOT The Drake Chicago (D052)" },
  { tag: "The Gwen Hotel", username: "thegwenchicago", note: "vendors.name 'The Gwen, a Luxury Collection Hotel...'" },
  { tag: "Theater on the Lake - Restaurant/Events/Theater", username: "theateronthelakechicago", note: "alias-canonical of theateronthelake (D052)" },
  { tag: "Theatre on the Lake", username: "theateronthelakechicago", note: "British spelling variant" },
  { tag: "Hotel Zachary", username: "hotelzachary", note: "vendors.name has ', Chicago, a Tribute Portfolio Hotel' suffix" },
  { tag: "Ivy Room Chicago", username: "ivyroomchicago", note: "vendors.name 'The Ivy Room At Tree Studios'" },
  { tag: "The Hyatt Lodge", username: "hyattlodge", note: "Oak Brook" },
  { tag: "The Westin Chicago Northwest", username: "westinchicagonw", note: "handle-only vendor row" },
  { tag: "Chevy Chase Country Club", username: "chevychasecountryclub", note: "handle-only vendor row" },
  { tag: "Loews Chicago Hotel", username: "loewschicagohotel", note: "canonical of loewschicago (D052)" },
  { tag: "The Farmhouse Plainfield", username: "thefarmhouseplainfield", note: "handle-only vendor row" },
  { tag: "The Blackstone Hotel", username: "theblackstonehotel", note: "handle-only vendor row" },
  { tag: "167 GREEN", username: "167greenstreet", note: "handle-only vendor row" },
  { tag: "Canvas Venue Chicago", username: "thecanvasvenue", note: "full_name 'CANVAS | Chicago Event Venue'" },
  { tag: "Loft 606", username: "loft606chicago", note: "vendors.name 'Loft606'" },
  { tag: "Pazzo's at 311", username: "311pazzos", note: "full_name 'Pazzo's Chicago'" },
  { tag: "The Rookery", username: "therookerybuilding", note: "vendors.name 'The Rookery Building'" },
  { tag: "Revel Space", username: "revelspace", note: "direct handle match; vendor row 'Revel Motor Row' -- same operator, tag names the Fulton Market space" },
  { tag: "Company 251", username: "company251", note: "handle-only vendor row" },
  { tag: "Lincolnshire Marriott Resort", username: "lshiremarriott", note: "full_name 'Marriott Lincolnshire Resort'" },
  // Ambiguous pairs from the automatic pass, resolved by hand:
  { tag: "Old Post Office", username: "post433chicago", note: "post433events is the same venue's events sub-account, aliased to post433chicago in round 4" },
  { tag: "Four Seasons Hotel Chicago", username: "fschicago", note: "@fourseasons (27400) is the global brand handle -- a D050 placeholder mis-bridge, re-pointed in D055" },
];

interface CandidateName { accountId: number; rawName: string }
interface ConfidentRow {
  tag: string; postCount: number; accountId: number; username: string;
  matchedName: string; tier: "exact" | "normalized";
}
interface AmbiguousRow { tag: string; postCount: number; accountIds: number[] }

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  const { rows: tagRows } = await pool.query<{ location_tag: string; post_count: string }>(
    `select location_tag, count(*)::text as post_count from staging.instagram_posts
     where location_tag is not null and location_tag <> ''
     group by location_tag order by count(*) desc limit $1`,
    [TOP_N_TAGS]
  );

  const { rows: aliasRows } = await pool.query<{ alias_account_id: number; canonical_account_id: number }>(
    `select alias_account_id, canonical_account_id from account_aliases`
  );
  const aliasToCanonical = new Map(aliasRows.map((r) => [r.alias_account_id, r.canonical_account_id]));
  const canonicalize = (id: number) => aliasToCanonical.get(id) ?? id;

  const { rows: venueRows } = await pool.query<{ account_id: number }>(
    `select account_id from v_account_role where role = 'venue'
     union select v.account_id from vendors v where v.category = 'venue' and v.account_id is not null`
  );
  const venueAccountIds = new Set(venueRows.map((r) => r.account_id));

  const { rows: vendorNames } = await pool.query<{ account_id: number; name: string }>(
    `select account_id, name from vendors where account_id is not null`
  );
  const { rows: accountNames } = await pool.query<{ id: number; full_name: string; username: string }>(
    `select id, full_name, username::text as username from accounts where full_name is not null and full_name <> ''`
  );
  const usernameByAccountId = new Map(accountNames.map((r) => [r.id, r.username]));
  const missingUsernameIds = [...new Set(vendorNames.map((r) => r.account_id))].filter((id) => !usernameByAccountId.has(id));
  if (missingUsernameIds.length > 0) {
    const { rows } = await pool.query<{ id: number; username: string }>(
      `select id, username::text as username from accounts where id = any($1::bigint[])`,
      [missingUsernameIds]
    );
    for (const r of rows) usernameByAccountId.set(r.id, r.username);
  }

  const exactMap = new Map<string, CandidateName[]>();
  const normMap = new Map<string, CandidateName[]>();
  const addTo = (map: Map<string, CandidateName[]>, key: string, c: CandidateName) => {
    const arr = map.get(key);
    if (arr) arr.push(c); else map.set(key, [c]);
  };
  const addCandidate = (accountId: number, rawName: string) => {
    if (!rawName?.trim()) return;
    const c: CandidateName = { accountId, rawName };
    addTo(exactMap, rawName.trim().toLowerCase(), c);
    const normKey = normalize(rawName);
    if (normKey) addTo(normMap, normKey, c);
  };
  for (const r of vendorNames) addCandidate(r.account_id, r.name);
  for (const r of accountNames) addCandidate(r.id, r.full_name);

  const buckets = {
    confident_exact: [] as ConfidentRow[],
    confident_normalized: [] as ConfidentRow[],
    ambiguous: [] as AmbiguousRow[],
    matched_not_venue: [] as { tag: string; postCount: number }[],
    generic: [] as { tag: string; postCount: number }[],
    no_match: [] as { tag: string; postCount: number }[],
  };

  for (const row of tagRows) {
    const tag = row.location_tag;
    const postCount = Number(row.post_count);
    if (isGeneric(tag)) { buckets.generic.push({ tag, postCount }); continue; }

    let tier: "exact" | "normalized" | null = null;
    let candidates = exactMap.get(tag.trim().toLowerCase());
    if (candidates?.length) tier = "exact";
    else {
      candidates = normMap.get(normalize(tag));
      if (candidates?.length) tier = "normalized";
    }
    if (!candidates?.length) { buckets.no_match.push({ tag, postCount }); continue; }

    const distinctAccountIds = [...new Set(candidates.map((c) => canonicalize(c.accountId)))];
    const venueMatches = distinctAccountIds.filter((id) => venueAccountIds.has(id));

    if (venueMatches.length === 0) {
      buckets.matched_not_venue.push({ tag, postCount });
    } else if (venueMatches.length > 1) {
      buckets.ambiguous.push({ tag, postCount, accountIds: venueMatches });
    } else {
      const accountId = venueMatches[0];
      const matched = candidates.find((c) => canonicalize(c.accountId) === accountId)!;
      const confidentRow: ConfidentRow = {
        tag, postCount, accountId, username: usernameByAccountId.get(accountId) ?? "(unknown)",
        matchedName: matched.rawName, tier: tier!,
      };
      buckets[tier === "exact" ? "confident_exact" : "confident_normalized"].push(confidentRow);
    }
  }

  const sumPosts = (arr: { postCount: number }[]) => arr.reduce((s, r) => s + r.postCount, 0);
  const bucketSummary = Object.fromEntries(
    Object.entries(buckets).map(([name, arr]) => [name, { tags: arr.length, posts: sumPosts(arr) }])
  );

  console.log(`\n[location-tag-map] considered top ${tagRows.length} distinct location_tags`);
  console.log(`[location-tag-map] bucket summary (tags / posts):`);
  for (const [name, s] of Object.entries(bucketSummary)) console.log(`  ${name}: ${s.tags} tags / ${s.posts} posts`);

  const allConfident = [...buckets.confident_exact, ...buckets.confident_normalized].sort((a, b) => b.postCount - a.postCount);
  console.log(`\n[location-tag-map] top 25 confident matches:`);
  for (const r of allConfident.slice(0, 25)) {
    console.log(`  "${r.tag}" (${r.postCount} posts) -> @${r.username} (account ${r.accountId}) via ${r.tier} match on "${r.matchedName}"`);
  }

  const ambiguousSorted = buckets.ambiguous.sort((a, b) => b.postCount - a.postCount);
  if (ambiguousSorted.length > 0) {
    console.log(`\n[location-tag-map] ambiguous (not resolved):`);
    for (const r of ambiguousSorted) console.log(`  "${r.tag}" (${r.postCount} posts) -> accounts [${r.accountIds.join(", ")}]`);
  }

  const topNoMatch = [...buckets.no_match].sort((a, b) => b.postCount - a.postCount).slice(0, 80);
  console.log(`\n[location-tag-map] top 40 no_match tags:`);
  for (const r of topNoMatch.slice(0, 40)) console.log(`  "${r.tag}" (${r.postCount} posts)`);

  writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(), consideredTopN: TOP_N_TAGS, distinctTagsConsidered: tagRows.length,
    bucketSummary, confident: allConfident, ambiguous: ambiguousSorted, topNoMatch,
  }, null, 2));
  console.log(`\n[location-tag-map] wrote report to ${REPORT_PATH}`);

  if (apply) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(CREATE_TABLE);
      let inserted = 0;
      for (const r of allConfident) {
        const { rows } = await client.query(
          `insert into location_tag_venue_map (location_tag, venue_account_id, match_tier, note)
           values ($1, $2, $3, $4) on conflict (location_tag) do nothing returning location_tag`,
          [r.tag, r.accountId, r.tier, `matched "${r.matchedName}" (${r.tier})`]
        );
        if (rows.length > 0) inserted++;
      }
      let handInserted = 0;
      for (const h of HAND_PASS) {
        const { rows: acct } = await client.query<{ id: number }>(
          `select coalesce(aa.canonical_account_id, a.id) as id
           from accounts a left join account_aliases aa on aa.alias_account_id = a.id
           where a.username = $1::citext`,
          [h.username]
        );
        if (acct.length === 0) {
          console.log(`[location-tag-map] HAND_PASS SKIP "${h.tag}" -> @${h.username}: account not found`);
          continue;
        }
        const { rows } = await client.query(
          `insert into location_tag_venue_map (location_tag, venue_account_id, match_tier, note)
           values ($1, $2, 'hand_pass', $3) on conflict (location_tag) do nothing returning location_tag`,
          [h.tag, acct[0].id, h.note]
        );
        if (rows.length > 0) handInserted++;
      }
      await client.query("commit");
      console.log(`[location-tag-map] APPLIED — inserted ${inserted} automatic + ${handInserted} hand-pass rows`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  } else {
    console.log(`[location-tag-map] report-only run (pass --apply to write location_tag_venue_map)`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
