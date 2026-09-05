/**
 * Phase 2 of the is-chicago-for-new-venues mission
 * (docs/engineering/graph-strengthening/is-chicago-for-new-venues.md): backfills
 * `account_locations` for venue accounts discovered only through Jeremy's evidence, using
 * free `WebSearch` results instead of the originally-scoped paid Google Places API (D038 —
 * tested both on real accounts, WebSearch returned richer confirmation, exact address, and
 * explicit wedding-hosting corroboration, at zero real-money cost).
 *
 * Each entry below was individually searched (`"<username>" instagram Chicago [wedding
 * venue]`), read, and judged — not a blind city-name-contains-"chicago" heuristic. Only
 * CONFIRMED-Chicago-metro results are included; inconclusive searches (no match, ambiguous
 * multi-city chains) are left out entirely rather than guessed. A confirmed Chicago
 * *location* does not by itself mean "this is a legitimate wedding venue" — two entries
 * here (figdrinks, murphysbleachers) are real Chicago businesses but not primarily event
 * venues (a catering/bar company, a sports bar); that distinction is a separate concern the
 * existing account_tags venue-role filter (Phase 1) already handles downstream — this
 * script's only job is "is this account's address genuinely in the Chicago metro," which is
 * true for both.
 *
 * Additive only: `on conflict (account_id) do nothing` — account_locations' PK is
 * account_id, so this never overwrites an existing row (there shouldn't be one for this
 * cohort, but the guarantee holds either way). `--dry-run` first, transaction-wrapped.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/backfillVenueLocationsViaWebSearch.ts --dry-run
 *   bun run scripts/graph/backfillVenueLocationsViaWebSearch.ts
 */
import { getPool, closePool } from "../classify/db";

interface ConfirmedLocation {
  accountId: number;
  username: string;
  address: string | null;
  city: string;
  region: string;
  source: string;
}

// Batch 1 (2026-09-05) — 13 of 19 searched confirmed as real Chicago-metro places.
const CONFIRMED_LOCATIONS: ConfirmedLocation[] = [
  { accountId: 1438, username: "beatnikontheriver", address: "180 N Upper Wacker Dr", city: "Chicago", region: "IL", source: "web:beatnikontheriver.com, Yelp" },
  { accountId: 2857, username: "marshallslanding", address: "222 W Merchandise Mart Plaza", city: "Chicago", region: "IL", source: "web:marshallslanding.com, The Knot" },
  { accountId: 4208, username: "eaglewoodresort", address: null, city: "Itasca", region: "IL", source: "web:eaglewoodresort.com" },
  { accountId: 6059, username: "stjosaphatparish", address: "2311 N Southport Ave", city: "Chicago", region: "IL", source: "web:stjosaphatparish.org" },
  { accountId: 7033, username: "figdrinks", address: "1850 S Blue Island Ave", city: "Chicago", region: "IL", source: "web:voyagechicago.com (FIG Catering, Pilsen)" },
  { accountId: 7893, username: "icsjparish", address: null, city: "Chicago", region: "IL", source: "web:icsjparish.org (Near North Side)" },
  { accountId: 8024, username: "thegrovecountryclub", address: null, city: "Long Grove", region: "IL", source: "web:eventective.com, chicagoeventvenues.com" },
  { accountId: 8478, username: "murphysbleachers", address: "3655 N Sheffield Ave", city: "Chicago", region: "IL", source: "web:murphysbleachers.com (Wrigleyville)" },
  { accountId: 8791, username: "holyfamilycci", address: null, city: "Inverness", region: "IL", source: "web:instagram bio redirect to Holy Family Inverness" },
  { accountId: 9829, username: "stalphonsuschicago", address: null, city: "Chicago", region: "IL", source: "web:stalphonsuschicago.org (Lakeview)" },
  { accountId: 11283, username: "oakbrookhillsresort", address: "3500 Midwest Rd", city: "Oak Brook", region: "IL", source: "web:oakbrookhillsresort.com" },
  { accountId: 19471, username: "goebbertevents", address: null, city: "Pingree Grove", region: "IL", source: "web:goebbertevents.com, melissadiep.net" },
  { accountId: 20812, username: "saddleandcycleclub", address: "900 W Foster Ave", city: "Chicago", region: "IL", source: "web:saddleandcycle.com, Yelp" },

  // Batch 2 (2026-09-05) — 15 of 20 searched confirmed as real Chicago-metro places.
  { accountId: 3088, username: "chicagopubliclibrary", address: null, city: "Chicago", region: "IL", source: "web:chipublib.org (Harold Washington Library Center private event rentals)" },
  { accountId: 4641, username: "chiunionstation", address: "225 S Canal St", city: "Chicago", region: "IL", source: "web:chicagounionstation.com, choosechicago.com" },
  { accountId: 18240, username: "150northriverside", address: "150 N Riverside Plaza", city: "Chicago", region: "IL", source: "web:150northriverside.com, partyslate.com" },
  { accountId: 18283, username: "adastchicago", address: "1664 N Ada St", city: "Chicago", region: "IL", source: "web:instagram.com/adastchicago (Ada Street)" },
  { accountId: 18370, username: "alterbeer", address: "2300 Wisconsin Ave", city: "Downers Grove", region: "IL", source: "web:alterbrewing.com, laurameyerphotography.com" },
  { accountId: 18466, username: "artinstituteweddingsevents", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/artinstituteweddingsevents, artic.edu/venue-rental" },
  { accountId: 18489, username: "assumption_church_chicago", address: "323 W Illinois St", city: "Chicago", region: "IL", source: "web:instagram bio + assumption-chgo.org" },
  { accountId: 18490, username: "assumptionchi", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/assumptionchi (Assumption Greek Orthodox Church)" },
  { accountId: 18508, username: "avantebanquets", address: "1050 Northwest Hwy", city: "Fox River Grove", region: "IL", source: "web:avantebanquets.com" },
  { accountId: 18543, username: "baravecchicago", address: "640 N LaSalle Dr", city: "Chicago", region: "IL", source: "web:instagram.com/baravecchicago, zola.com" },
  { accountId: 18606, username: "belvederechateau1", address: "8055 W 103rd St", city: "Palos Hills", region: "IL", source: "web:belvederechateau.com, wheree.com (handle matches chateau1)" },
  { accountId: 18621, username: "bhcc_1921", address: null, city: "Barrington Hills", region: "IL", source: "web:instagram.com/bhcc_1921 (Barrington Hills Country Club)" },
  { accountId: 18631, username: "bixibeer", address: null, city: "Chicago", region: "IL", source: "web:erinmcloraine.com, catruchalski.com (Logan Square)" },
  { accountId: 18676, username: "boulderridgecountryclub", address: null, city: "Lake in the Hills", region: "IL", source: "web:boulderridge.com, instagram.com/boulderridgecountryclub" },
  { accountId: 18712, username: "bridge410chicago", address: "410 N Paulina St", city: "Chicago", region: "IL", source: "web:bridge410.com, yelp.com" },

  // Batch 3 (2026-09-05) — 36 of 45 searched confirmed as real Chicago-metro places.
  { accountId: 18759, username: "cafebrauer", address: null, city: "Chicago", region: "IL", source: "web:theknot.com, weddingwire.com (Lincoln Park Zoo)" },
  { accountId: 18793, username: "carloacutischi", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/carloacutischi (Saint Carlo Acutis Parish)" },
  { accountId: 18849, username: "chez.hotel", address: null, city: "Arlington Heights", region: "IL", source: "web:instagram.com/chez.hotel, chezhotel.com" },
  { accountId: 18863, username: "chicagofirehouserestaurant", address: "1401 S Michigan Ave", city: "Chicago", region: "IL", source: "web:firehousechicago.com, instagram.com/chicagofirehouserestaurant" },
  { accountId: 18865, username: "chicagoforte", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/chicagoforte (Forte Events at Symphony Center)" },
  { accountId: 18869, username: "chicagolinecruises", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/chicagolinecruises" },
  { accountId: 18877, username: "chicagoyachtclub", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/chicagoyachtclub, partyslate.com" },
  { accountId: 18892, username: "christchurch_winnetka", address: "784 Sheridan Rd", city: "Winnetka", region: "IL", source: "web:instagram.com/christchurch_winnetka" },
  { accountId: 18940, username: "coghillgolf", address: "12294 Archer Ave", city: "Palos Park", region: "IL", source: "web:instagram.com/coghillgolf, coghillgolf.com" },
  { accountId: 18945, username: "concordebanquets", address: "20922 N Rand Rd", city: "Kildeer", region: "IL", source: "web:instagram.com/concordebanquets, concordebanquets.com" },
  { accountId: 18975, username: "cuneomansion", address: null, city: "Vernon Hills", region: "IL", source: "web:yannidesignstudio.com, melodyjoy.co" },
  { accountId: 19183, username: "edgewoodvalleycc", address: null, city: "Burr Ridge", region: "IL", source: "web:instagram.com/edgewoodvalleycc" },
  { accountId: 19194, username: "elawafarm", address: null, city: "Lake Forest", region: "IL", source: "web:instagram.com/elawafarm, elawafarm.org" },
  { accountId: 19224, username: "elskerestaurant", address: "1350 W Randolph St", city: "Chicago", region: "IL", source: "web:elskerestaurant.com, instagram.com/elskerestaurant" },
  { accountId: 19260, username: "episcope.hospitality", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/episcope.hospitality, episcope.co" },
  { accountId: 19286, username: "eventinleyparkconventioncenter", address: null, city: "Tinley Park", region: "IL", source: "web:instagram.com/eventinleyparkconventioncenter, tinleyparkconventioncenter.net" },
  { accountId: 19288, username: "eventsatmortonarboretum", address: null, city: "Lisle", region: "IL", source: "web:effortless-events.com, mortonarb.org" },
  { accountId: 19292, username: "eventsbymistwood", address: null, city: "Romeoville", region: "IL", source: "web:mistwoodgc.com/eventsbymistwood-socials" },
  { accountId: 19310, username: "exmoorcc", address: null, city: "Highland Park", region: "IL", source: "web:angelareneephoto.com, maurablackphotography.com" },
  { accountId: 19353, username: "floatingworldevents", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/floatingworldevents, rentfwg.com (Lincoln Park)" },
  { accountId: 19354, username: "floatingworldgallery", address: "1925 N Halsted St", city: "Chicago", region: "IL", source: "web:yelp.com, instagram.com/floatingworldgallery" },
  { accountId: 19446, username: "giltbar", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/giltbar, partyslate.com" },
  { accountId: 19482, username: "gooseislandchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/gooseislandchicago, weddingwire.com" },
  { accountId: 19535, username: "haisouschicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/haisouschicago (Pilsen)" },
  { accountId: 19539, username: "halimmuseum", address: "1560 Oak Ave", city: "Evanston", region: "IL", source: "web:events.halimmuseum.org" },
  { accountId: 19603, username: "holynamechicago", address: "735 N State St", city: "Chicago", region: "IL", source: "web:weddingwire.com, theknot.com (Holy Name Cathedral)" },
  { accountId: 19612, username: "hotelarista", address: null, city: "Naperville", region: "IL", source: "web:hotelarista.com" },
  { accountId: 19628, username: "hyattregencyschaumburg", address: null, city: "Schaumburg", region: "IL", source: "web:instagram.com/hyattregencyschaumburg, hyatt.com" },
  { accountId: 19637, username: "icc.weddingsandevents", address: null, city: "Itasca", region: "IL", source: "web:instagram.com/icc.weddingsandevents (Itasca Country Club)" },
  { accountId: 19704, username: "ivanhoe_club", address: null, city: "Mundelein", region: "IL", source: "web:ivanhoeclub.com, weddingwire.com" },
  { accountId: 19812, username: "jolietballroom", address: null, city: "Joliet", region: "IL", source: "web:instagram.com/jolietballroom, jolietunionstation.com" },
  { accountId: 19890, username: "katherineleggememorial", address: "5901 S County Line Rd", city: "Hinsdale", region: "IL", source: "web:villageofhinsdale.org, klmlodge.com" },
  { accountId: 19931, username: "kenilworth.parkdistrict", address: null, city: "Kenilworth", region: "IL", source: "web:weddingwire.com, cateredbydesign.com (Kenilworth Assembly Hall)" },
  { accountId: 20346, username: "michiganshoresclub", address: "911 Michigan Ave", city: "Wilmette", region: "IL", source: "web:theknot.com, weddingwire.com" },
  { accountId: 20377, username: "mistwoodgolf", address: null, city: "Romeoville", region: "IL", source: "web:instagram.com/mistwoodgolf, mistwoodgc.com" },
  { accountId: 20504, username: "northshorecountryclub", address: "1340 Glenview Rd", city: "Glenview", region: "IL", source: "web:caratsandcake.com" },

  // Batch 4 (2026-09-05) — final batch, 35 of 43 searched confirmed. Completes all 130
  // Phase 2 accounts across batches 1-4 (13+15+36+35=99 confirmed, 22 inconclusive, 2
  // confirmed NOT Chicago-metro — see mission doc Baseline findings for the full list).
  { accountId: 20545, username: "oscarswangeneva", address: null, city: "Geneva", region: "IL", source: "web:instagram.com/oscarswangeneva" },
  { accountId: 20574, username: "parkandfield", address: "3509 W Fullerton Ave", city: "Chicago", region: "IL", source: "web:instagram.com/parkandfield, parkandfieldchicago.com" },
  { accountId: 20581, username: "patioatcafebrauer", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/patioatcafebrauer (Lincoln Park Zoo)" },
  { accountId: 20593, username: "pella_signature", address: null, city: "Burr Ridge", region: "IL", source: "web:instagram.com/pella_signature, pellasignature.com" },
  { accountId: 20679, username: "qasbasilica", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/qasbasilica (Queen of All Saints Parish)" },
  { accountId: 20680, username: "quadclub.uchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/quadclub.uchicago, theknot.com" },
  { accountId: 20694, username: "radissonblueaquachicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/radissonbluaquachicago, weddingwire.com" },
  { accountId: 20755, username: "riverforestcountryclub", address: null, city: "Elmhurst", region: "IL", source: "web:instagram.com/riverforestcountryclub, riverforestcc.org" },
  { accountId: 20792, username: "rpmeventsandcatering", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/rpmeventsandcatering, rpmrestaurants.com" },
  { accountId: 20805, username: "sableatnavypier", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/sableatnavypier (Navy Pier)" },
  { accountId: 20819, username: "salon6levents", address: "61 W Hubbard St", city: "Chicago", region: "IL", source: "web:herecomestheguide.com, weddingwire.com (Salon 61)" },
  { accountId: 20911, username: "shoreacresgolfclub", address: "1601 Shore Acres Rd", city: "Lake Bluff", region: "IL", source: "web:caratsandcake.com" },
  { accountId: 20978, username: "southbranchchi", address: "100 S Wacker Dr", city: "Chicago", region: "IL", source: "web:instagram.com/southbranchchi, theknot.com" },
  { accountId: 20979, username: "southshoreccac", address: "7059 S South Shore Dr", city: "Chicago", region: "IL", source: "web:herecomestheguide.com (South Shore Cultural Center)" },
  { accountId: 21019, username: "stjameschapelchicago", address: null, city: "Chicago", region: "IL", source: "web:insideweddings.com, winterlynphotography.com (St. James Chapel)" },
  { accountId: 21020, username: "stmikesoldtown", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/stmikesoldtown (Old Town)" },
  { accountId: 21147, username: "theateronthelake", address: null, city: "Chicago", region: "IL", source: "web:theateronthelake.com, partyslate.com (Fullerton/Lake Shore Dr)" },
  { accountId: 21161, username: "thebridgelemont", address: null, city: "Lemont", region: "IL", source: "web:instagram.com/thebridgelemont, thebridgelemontil.com" },
  { accountId: 21169, username: "thedalcychicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/thedalcy (Fulton Market)" },
  { accountId: 21174, username: "thedrakeoakbrook", address: null, city: "Oak Brook", region: "IL", source: "web:instagram.com/thedrakeoakbrook" },
  { accountId: 21178, username: "theempressbanquets", address: "200 E Lake St", city: "Addison", region: "IL", source: "web:instagram.com/empressbanquets, theempressbanquets.com" },
  { accountId: 21185, username: "thefarmhouseainfield", address: null, city: "Plainfield", region: "IL", source: "web:munacopictures.com, thefarmhouseplainfield.com" },
  { accountId: 21186, username: "thefieldmuseum", address: null, city: "Chicago", region: "IL", source: "web:fieldmuseum.org/page/weddings" },
  { accountId: 21192, username: "theglenclub", address: null, city: "Glenview", region: "IL", source: "web:theglenclub.com, chicagostyleweddings.com" },
  { accountId: 21195, username: "thegreathallatmistwood", address: null, city: "Romeoville", region: "IL", source: "web:mistwoodgc.com (sister account to eventsbymistwood/mistwoodgolf, already confirmed Romeoville)" },
  { accountId: 21196, username: "thehaight", address: null, city: "Elgin", region: "IL", source: "web:instagram.com/thehaight, thehaightelgin.com" },
  { accountId: 21197, username: "theherringtoninnandspa", address: null, city: "Geneva", region: "IL", source: "web:instagram.com/theherringtoninnandspa, herringtoninn.com" },
  { accountId: 21286, username: "totlspeacialevents", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/totlspecialevents (Theater on the Lake Events)" },
  { accountId: 21305, username: "tuscanyfalls", address: null, city: "Mokena", region: "IL", source: "web:instagram.com/tuscanyfalls, tuscanyfallsbanquets.com" },
  { accountId: 21307, username: "twenysixchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/twentysixchicago (River North)" },
  { accountId: 21319, username: "unionleagueclubofchicago", address: null, city: "Chicago", region: "IL", source: "web:weddingwire.com, wezoree.com" },
  { accountId: 21342, username: "venue5126", address: null, city: "Oswego", region: "IL", source: "web:theknot.com, venue5126.com" },
  { accountId: 21343, username: "venutisrestaurant", address: null, city: "Addison", region: "IL", source: "web:instagram.com/venutisrestaurant, venutis.com" },
  { accountId: 21348, username: "victoriainthepark", address: null, city: "Mount Prospect", region: "IL", source: "web:instagram.com/victoriainthepark, victoriavenues.com" },
  { accountId: 21416, username: "westinchicagonw", address: null, city: "Itasca", region: "IL", source: "web:instagram.com/westinchicagonw" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    let attempted = 0;
    let inserted = 0;

    for (const loc of CONFIRMED_LOCATIONS) {
      attempted++;
      const { rows } = await client.query(
        `insert into account_locations (account_id, address, city, region, in_metro, source, verified_at)
         values ($1, $2, $3, $4, true, 'websearch', now())
         on conflict (account_id) do nothing
         returning account_id`,
        [loc.accountId, loc.address, loc.city, loc.region]
      );
      if (rows.length > 0) {
        inserted++;
        console.log(`[backfill-locations] @${loc.username} -> ${loc.city}, ${loc.region} (${loc.source})`);
      } else {
        console.log(`[backfill-locations] @${loc.username} already has a location row, skipping`);
      }
    }

    console.log(`[backfill-locations] ${dryRun ? "DRY RUN — " : ""}attempted=${attempted} inserted=${inserted}`);

    if (dryRun) {
      await client.query("rollback");
      console.log("[backfill-locations] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[backfill-locations] COMMITTED");
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
