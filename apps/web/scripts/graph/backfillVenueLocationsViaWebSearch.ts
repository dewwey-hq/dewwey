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

  // Batch 5 (2026-09-06) — new mission: "v1 data completion, venues-first" (D046 follow-on,
  // docs/decisions.md). Sourced from a FRESH cohort — 252 v_account_role='venue' accounts with
  // no vendors bridge and no account_locations row at all (not the D034-scoped 447 candidates
  // Batches 1-4 worked through). First 49 of 252 searched: 33 confirmed Chicago-metro, 11
  // confirmed NOT Chicago (excluded, not listed here), 4 inconclusive (no confident match:
  // thecedar, cspshall, harraycaraycelebrations, iahcchicago — left unresolved, not retried).
  // Two handle-variant cases (same pattern as Batch 4's thegreathallatmistwood): the search
  // consistently surfaced a near-identical live handle for the same real business --
  // lacunacatalystsuites (live handle lacunabycatalystsuites, Pilsen) and publishinghousebnb
  // (live handle publishinghouse_bnb, West Loop) -- treated as the same entity under an
  // alternate/historic handle, not guessed blind. Several confirmed entries are bars/breweries/
  // nightclubs with a real Chicago address but no explicit wedding-hosting confirmation
  // (electricfuneralbar, kerrymanchicago, cobralounge, mhouse.chicago, slipperysloped,
  // momshousechicago, swigchicago, easydoesitchicago) -- same precedent as Batch 1's
  // figdrinks/murphysbleachers: this script's only job is confirming the ADDRESS is genuinely
  // Chicago, not whether it's primarily a wedding venue -- that's the account_tags venue-role
  // corroboration filter's job downstream (same as every prior batch). westloopweddingwalk is
  // a multi-venue promotional tour brand, not a single physical venue -- location confirmed
  // (Chicago, West Loop) but almost certainly won't survive the venue-role corroboration filter;
  // included here rather than silently dropped so that filter (not this script) makes the call.
  // whitehawkcc (Crown Point, IN, ~50min south of downtown) included as Chicago-metro/NW Indiana,
  // consistent with this mission's precedent of suburb inclusion by drive time, not city limits --
  // genuinely borderline, flagged for review. dunespavilion (Indiana Dunes State Park, NW Indiana,
  // ~70+ min) excluded as closer to Batch 2's excluded ~90min precedent (stjames1868,
  // williams.orchard) than to any confirmed-in-scope suburb -- also borderline, flagged.
  { accountId: 2864, username: "holynamecathedral", address: "730 N Wabash Ave", city: "Chicago", region: "IL", source: "web:weddingwire.com, lakeshoreinlove.com, 312film.com" },
  { accountId: 7581, username: "drurylaneproductions", address: null, city: "Oakbrook Terrace", region: "IL", source: "web:drurylaneevents.com, chicagostyleweddings.com (historic name for Drury Lane Theatre/Events)" },
  { accountId: 4188, username: "wrigleyontheriver", address: null, city: "Chicago", region: "IL", source: "web:wrigleyontheriver.com, chicagoeventgroup.com (Wrigley Building)" },
  { accountId: 6260, username: "cityviewloft", address: null, city: "Chicago", region: "IL", source: "web:cityviewloftchicago.com, eivans.com" },
  { accountId: 3564, username: "raviniafestival", address: null, city: "Highland Park", region: "IL", source: "web:ravinia.org, chicagostyleweddings.com" },
  { accountId: 7038, username: "chiefoneillspub", address: "3471 N Elston Ave", city: "Chicago", region: "IL", source: "web:chiefoneillspub.com" },
  { accountId: 8324, username: "electricfuneralbar", address: "3529 S Halsted St", city: "Chicago", region: "IL", source: "web:yelp.com, apple maps (Bridgeport)" },
  { accountId: 1303, username: "kerrymanchicago", address: "661 N Clark St", city: "Chicago", region: "IL", source: "web:instagram.com/kerrymanchicago" },
  { accountId: 4904, username: "lacunacatalystsuites", address: null, city: "Chicago", region: "IL", source: "web:lacunaeventsbylm.com, instagram.com/lacunabycatalystsuites (handle variant, Pilsen)" },
  { accountId: 4994, username: "theschoolhousechicago", address: null, city: "Chicago", region: "IL", source: "web:partyslate.com (Orleans & Hill)" },
  { accountId: 4151, username: "sunsetridgecc", address: "2100 Sunset Ridge Rd", city: "Northfield", region: "IL", source: "web:sunsetridgecc.org, yelp.com" },
  { accountId: 1645, username: "meridianbanquets", address: null, city: "Rolling Meadows", region: "IL", source: "web:meridianbanquets.com, weddingwire.com" },
  { accountId: 1526, username: "trivolitavern", address: "114 N Green St", city: "Chicago", region: "IL", source: "web:trivolitavern.com, restaurantguru.com" },
  { accountId: 8124, username: "fitzgeraldsnightclub", address: "6615 W Roosevelt Rd", city: "Berwyn", region: "IL", source: "web:fitzgeraldsnightclub.com, enjoyillinois.com" },
  { accountId: 11109, username: "hellenicmuseum", address: "333 S Halsted St", city: "Chicago", region: "IL", source: "web:nationalhellenicmuseum.org, weddingwire.com (Greektown)" },
  { accountId: 8163, username: "16occhicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/16occhicago" },
  { accountId: 8952, username: "publishinghousebnb", address: "108 N May St", city: "Chicago", region: "IL", source: "web:publishinghousebnb.com, instagram.com/publishinghouse_bnb (handle variant, West Loop)" },
  { accountId: 6634, username: "cobralounge", address: "235 N Ashland Ave", city: "Chicago", region: "IL", source: "web:cobralounge.com" },
  { accountId: 5809, username: "halfacrebeer", address: "2050 W Balmoral Ave", city: "Chicago", region: "IL", source: "web:halfacrebeer.com, chicagostyleweddings.com (Brews & I Dos)" },
  { accountId: 6304, username: "fourthchurch", address: "126 E Chestnut St", city: "Chicago", region: "IL", source: "web:fourthchurch.org" },
  { accountId: 4355, username: "stgeorgechicagogoc", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/stgeorgechicagogoc (St George Greek Orthodox Cathedral, est. 1923)" },
  { accountId: 4207, username: "sheratongrandchicago", address: null, city: "Chicago", region: "IL", source: "web:herecomestheguide.com, weddingwire.com (Riverwalk)" },
  { accountId: 4386, username: "bolingbrookgolfclub", address: null, city: "Bolingbrook", region: "IL", source: "web:bolingbrookgolfclub.com, weddingwire.com" },
  { accountId: 3813, username: "mhouse.chicago", address: "800 W 27th St", city: "Chicago", region: "IL", source: "web:instagram.com/mhouse.chicago" },
  { accountId: 3808, username: "thestudiochicago", address: "2255 S Michigan Ave", city: "Chicago", region: "IL", source: "web:lmstudiochicago.com, instagram.com/thestudiochicago" },
  { accountId: 1480, username: "westloopweddingwalk", address: null, city: "Chicago", region: "IL", source: "web:westloopweddingwalk.com (multi-venue tour brand, not a single venue -- flag for role-filter)" },
  { accountId: 2764, username: "slipperysloped", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/slipperysloped (dance bar)" },
  { accountId: 2761, username: "monochromebrew", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/monochromebrew (brewery)" },
  { accountId: 2757, username: "momshousechicago", address: "26 W Division St", city: "Chicago", region: "IL", source: "web:instagram.com/momshousechicago, linktr.ee (nightclub)" },
  { accountId: 2753, username: "swigchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/swigchicago" },
  { accountId: 2738, username: "offhoursbeerco", address: "3520 S Halsted St", city: "Chicago", region: "IL", source: "web:instagram.com/offhoursbeerco (Bridgeport, Ramova-adjacent)" },
  { accountId: 2734, username: "easydoesitchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/easydoesitchicago (bar/shop)" },
  { accountId: 2697, username: "pilotprojectbrewing", address: "2140 N Milwaukee Ave", city: "Chicago", region: "IL", source: "web:tagvenue.com, ma.to (Logan Square)" },

  // Batch 6 (2026-09-06) — continuing the same 252-account cohort, accounts 51-100 by
  // evidence_count (much lower confidence tier than Batch 5, 0.65 vs 0.8-0.95 -- and it
  // showed: far more out-of-state noise this round, e.g. citywineryatl/hv/bos/_pgh,
  // thebitterendnyc, ardmoremusichall, theexchangeva, mclemoreresort -- skipped without a
  // search call, obviously non-Chicago by name, same as Batch 5's Scotland/Riviera Maya
  // entries). 17 searched: 11 confirmed Chicago-metro, 3 confirmed NOT Chicago
  // (epiphanyfarmsestate -- Downs, IL, 2.5hrs south; lakelawnresort -- Delavan, WI, ~90min,
  // same exclusion radius as Batch 2's stjames1868/williams.orchard; verandahistoricinn --
  // Senoia, GA), 3 inconclusive (wadehouseweddings, elmsmansion, evanstonspace -- no
  // confident match, left unresolved). fadschicagolakeview (Fred Astaire Dance Studios) and
  // metrochicago (a live-music venue) are real Chicago addresses but not primarily wedding
  // venues -- included per Batch 1's own precedent (this script confirms location only; the
  // venue-role corroboration filter downstream decides legitimacy).
  { accountId: 4245, username: "taochicago", address: null, city: "Chicago", region: "IL", source: "web:partyslate.com (River North)" },
  { accountId: 4638, username: "thearbory", address: "2219 W Grand Ave", city: "Chicago", region: "IL", source: "web:thearborychicago.com, weddingwire.com (likely handle variant of the.arbory, same business)" },
  { accountId: 4610, username: "hyattcentricmagmile", address: null, city: "Chicago", region: "IL", source: "web:hyatt.com, weddingwire.com" },
  { accountId: 2576, username: "catalystranchchicago", address: "656 W Randolph St", city: "Chicago", region: "IL", source: "web:catalystranch.com, yelp.com (West Loop)" },
  { accountId: 5115, username: "metrochicago", address: "3730 N Clark St", city: "Chicago", region: "IL", source: "web:instagram.com/metrochicago (Wrigleyville, live-music venue)" },
  { accountId: 5741, username: "cantignygolf", address: null, city: "Wheaton", region: "IL", source: "web:cantigny.org, theknot.com" },
  { accountId: 5544, username: "jewishmuseumchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/jewishmuseumchicago" },
  { accountId: 5079, username: "bridgesofpoplarcreek", address: "1400 Poplar Creek Dr", city: "Hoffman Estates", region: "IL", source: "web:bridgesofpoplarcreek.com, weddingwire.com" },
  { accountId: 6129, username: "olympiafieldscc", address: "2800 Country Club Dr", city: "Olympia Fields", region: "IL", source: "web:instagram.com/olympiafieldscc, caratsandcake.com" },
  { accountId: 3407, username: "fadschicagolakeview", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/fadschicagolakeview (Fred Astaire Dance Studios, not a venue -- flag for role-filter)" },
  { accountId: 4600, username: "maxwellstrading", address: null, city: "Chicago", region: "IL", source: "web:maxwellstrading.com, gretchenwittryphotography.com (West Loop)" },

  // Batch 7 (2026-09-06), continuing the same 252-account cohort, accounts 101-150 by
  // evidence_count (same 0.65 confidence tier as Batch 6). 17 searched: 13 confirmed
  // Chicago-metro, 3 confirmed NOT Chicago (pritzlaffevents -- Milwaukee, WI;
  // warehouseonnorth -- Elburn, IL, ~50-55mi/~1hr west, excluded as too far/uncertain
  // vs. this project's established suburb-inclusion precedent; ritzcarlton -- ambiguous
  // global brand handle, the actual Chicago property's real handle is @rcchicago, not
  // this one -- not guessed), 2 inconclusive (concordiaplace -- no specific address found,
  // just a vague "Chicago communities" bio, too weak to confirm; thewalkinchicago -- no
  // match at all). Two more handle-variant cases (same pattern as Batches 4/5):
  // morgan.mfg. (trailing-dot handle in our DB; the live business account is morgan.mfg,
  // already resolved earlier this session with 18 documented weddings -- same real West
  // Loop venue) and madegallery (live handle madegallerychicago, 1430 W Chicago Ave).
  // wrigleyfieldevents and officialwrigleyfield are two real, separate handles for the
  // same Wrigley Field events complex -- both confirmed. Several confirmed entries are
  // bars/breweries/boat-rental/cultural venues with a real Chicago(-metro) address but no
  // explicit wedding-hosting confirmation (theleavittstreettavern, chicagoboatco,
  // theathenaeum_chicago) -- same precedent as every prior batch: this script confirms
  // location only, the venue-role corroboration filter decides legitimacy downstream.
  { accountId: 7376, username: "theleavittstreettavern", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/theleavittstreettavern, facebook.com/theleavittstreet" },
  { accountId: 8150, username: "officialwrigleyfield", address: null, city: "Chicago", region: "IL", source: "web:wrigleyfieldevents.com, partyslate.com (Wrigleyville)" },
  { accountId: 8524, username: "wrigleyfieldevents", address: null, city: "Chicago", region: "IL", source: "web:wrigleyfieldevents.com (Wrigleyville, sister handle to officialwrigleyfield)" },
  { accountId: 8511, username: "naiaontheriver", address: "300 N La Salle Dr", city: "Chicago", region: "IL", source: "web:yelp.com (Chicago River)" },
  { accountId: 8954, username: "morgan.mfg.", address: "401 N Morgan St", city: "Chicago", region: "IL", source: "web:morgan-mfg.com, wezoree.com (handle variant of morgan.mfg, West Loop)" },
  { accountId: 9038, username: "theathenaeum_chicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/theathenaeum_chicago, do312.com" },
  { accountId: 8828, username: "stmarkchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/stmarkchicago, stmarkchicago.org" },
  { accountId: 9051, username: "chicagoboatco", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/chicagoboatco (Chicago River)" },
  { accountId: 8486, username: "rreventschicago", address: null, city: "Chicago", region: "IL", source: "web:rreventschicago.com, modernluxury.com (downtown, Chicago River)" },
  { accountId: 8101, username: "beatkitchenbar", address: null, city: "Chicago", region: "IL", source: "web:beatkitchen.com, do312.com (Roscoe Village, Belmont Ave)" },
  { accountId: 8094, username: "pollyannabrewingcompany", address: null, city: "Lemont", region: "IL", source: "web:pollyannabrewing.com" },
  { accountId: 7768, username: "madegallery", address: "1430 W Chicago Ave", city: "Chicago", region: "IL", source: "web:instagram.com/madegallerychicago (handle variant)" },
  { accountId: 8025, username: "115bourbonstreet", address: null, city: "Alsip", region: "IL", source: "web:weddingwire.com, theknot.com (~20min S of the Loop)" },

  // Batch 8 (2026-09-06), continuing the same 252-account cohort, accounts 151-195 (offset
  // 150, limit 50 of the remaining unresolved pool -- only 45 rows returned, near the end of
  // this cohort). 25 searched (of the promising-looking subset; obviously-non-Chicago names
  // -- trumpgolfjupiter/trumpgolfpalmbeach/themaralagoclub/trumpdoral (all FL),
  // ramblingroseranchatx (Austin), hotelhaya (Tampa), smackinntownmke (Milwaukee),
  // hoophall (Springfield MA), manoir_de_kerhuel (France), ashkenazberkeley/moesalley
  // (CA), nscchurchwi (WI), missouristatejazzstudies (MO) -- skipped without a search
  // burn, same "don't guess, don't waste a query on the obvious" discipline as before).
  // 14 confirmed Chicago-metro. Explicit non-Chicago/non-venue exclusions:
  // epiphanyfarmsestate (Downs, IL -- 2.5hrs S of Chicago, too far), gbchicagowestloop
  // (Brazilian Jiu-Jitsu gym, not an event venue), ronaldmcdonaldhousechicago (Chicago
  // charity housing, not a wedding venue), lovelyonsphoto/pepesoffice (photographer /
  // personal accounts, not venues), thethreepeaksranch (Westcliffe, CO),
  // imperialakeunion (Seattle, WA -- "Imperia Lake Union"). Inconclusive, left
  // unresolved: churchclubchicago, dream_creeks, rah.ent, bellafineartandevents,
  // holacafe_eventos, elgrancaribe, ktmac1116, thursdaytherapychi (no confirmed
  // wedding-venue identity found), palmerhouseinn (ambiguous -- exact-name match is a
  // Falmouth, MA B&B, not Chicago's "Palmer House Hilton" which uses a different handle;
  // not guessed).
  { accountId: 10392, username: "thedawsonchicago", address: null, city: "Chicago", region: "IL", source: "web:theknot.com, partyslate.com (River West)" },
  { accountId: 10611, username: "thehegewisch", address: null, city: "Chicago", region: "IL", source: "web:thehegewisch.com (Hegewisch, SE side)" },
  { accountId: 10714, username: "theelmlagrange", address: "23 W Harris Ave", city: "La Grange", region: "IL", source: "web:lgba.com, theelmlagrange.com" },
  { accountId: 10895, username: "penthousehydepark", address: null, city: "Chicago", region: "IL", source: "web:penthousehydepark.com (Hyde Park)" },
  { accountId: 11108, username: "theatriachicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/theatriachicago, forgetmenotarts.com (Humboldt Park)" },
  { accountId: 2483, username: "msichicagoevents", address: null, city: "Chicago", region: "IL", source: "web:griffinmsi.org/host-an-event (Museum of Science and Industry)" },
  { accountId: 2830, username: "themartchicago", address: null, city: "Chicago", region: "IL", source: "web:eventective.com (Merchandise Mart)" },
  { accountId: 830, username: "artifecteventschicago", address: null, city: "Chicago", region: "IL", source: "web:artifacteventschicago.com (Ravenswood)" },
  { accountId: 10678, username: "onceuponatimeeventsllc", address: null, city: "Chicago", region: "IL", source: "web:weddingwire.com (Once Upon a Wedding, Chicago-based planner)" },
  { accountId: 10644, username: "geraghtynorth_", address: "2100 Sanders Rd", city: "Northbrook", region: "IL", source: "web:chicagostarmedia.com (Geraghty North, opening 2027, North Shore)" },
  { accountId: 11044, username: "napersettlement", address: "523 S Weber St", city: "Naperville", region: "IL", source: "web:napersettlement.org, weddingwire.com (~40min from downtown)" },
  { accountId: 1203, username: "skydeckchicago", address: null, city: "Chicago", region: "IL", source: "web:theskydeck.com/private-events/weddings (Willis Tower)" },
  { accountId: 1993, username: "stolensaddlechi", address: "3505 N Clark St", city: "Chicago", region: "IL", source: "web:blockclubchicago.org, stolensaddlebar.com (Wrigleyville)" },
  { accountId: 2771, username: "pennywhistletavern", address: "1854 S Blue Island Ave", city: "Chicago", region: "IL", source: "web:giantpennywhistle.com, yelp.com (Pilsen)" },

  // Batch 9 (2026-09-06, autonomous /loop continuation), continuing the same 252-account cohort
  // -- the pool re-sorts as prior batches resolve accounts, so this is not a fixed offset range.
  // 17 searched (skipped obvious non-Chicago names without a search burn: citywinerynyc/
  // -phil/-nsh/-pgh/-bos/-hv/-atl -- all real City Winery locations in OTHER cities, not Chicago's
  // own handle; bevhillshotel -- Beverly Hills; trumpturnberryscotland -- Scotland;
  // editionrivieramayakanai/stregiskanairesort -- Riviera Maya, Mexico; wisconsinunion --
  // Madison, WI). 8 confirmed Chicago-metro. Explicit non-Chicago/non-venue exclusions:
  // cspshall (Cedar Rapids, IA), dunespavilion (Chesterton, IN -- same "Indiana out of scope"
  // call as Batch 7's whitehawkcc), themarqueeshow (St. Charles, MO), contidisanbonifacio
  // (Tuscany, Italy), villagesuitesbayharbor (Petoskey, MI), tickledpinkchicago (a Chicago
  // charity fundraiser account, not a venue), wipachicago (Wedding Industry Professionals
  // Association's Chicago chapter -- an industry association, not a venue), stregishotels
  // (ambiguous global-brand handle -- the actual St. Regis Chicago's own marketing uses a
  // different handle; not guessed, same precedent as Batch 7's ritzcarlton exclusion).
  // Inconclusive, left unresolved: thecedar (no exact-handle match found).
  { accountId: 6004, username: "harraycaraycelebrations", address: null, city: "Chicago", region: "IL", source: "web:theknot.com, weddingwire.com (Harry Caray's Catering & Events, River North + Lombard)" },
  { accountId: 1653, username: "iahcchicago", address: null, city: "Chicago", region: "IL", source: "web:instagram.com/iahcchicago (Irish American Heritage Center)" },
  { accountId: 5183, username: "glenoakcc", address: "21W451 Hill Ave", city: "Glen Ellyn", region: "IL", source: "web:glenoakcountryclub.org, wikipedia (Glen Oak Country Club)" },
  { accountId: 2850, username: "celebratebloom", address: "3801 N Elston Ave", city: "Chicago", region: "IL", source: "web:celebrateatbloom.com (Bloom Events, Avondale)" },
  { accountId: 2989, username: "belvedereeventsandbanquets", address: "1170 W Devon Ave", city: "Elk Grove Village", region: "IL", source: "web:belvederebanquets.com, weddingwire.com" },
  { accountId: 3298, username: "wearespin", address: "344 N State St", city: "Chicago", region: "IL", source: "web:wearespin.com (SPIN, River North)" },
  { accountId: 3660, username: "publicworksgallery", address: "2141 W North Ave", city: "Chicago", region: "IL", source: "web:publicworksgallery.com (Wicker Park)" },
  { accountId: 3823, username: "dearlybelovedchicago", address: "900 N Franklin St", city: "Chicago", region: "IL", source: "web:yelp.com (River North)" },

  // Batch 10 (2026-09-06, autonomous /loop continuation), same 252-account cohort re-sorted
  // after Batch 9 resolved accounts. 14 searched (skipped obvious non-Chicago names: most of
  // this stretch of the pool turned out to be out-of-market music-venue/festival handles --
  // theryman/3rdandlindsley/ramsheadonstage/grandpointnorth/thunderbirdmusichall/
  // ardmoremusichall/bardavonpresents/theexchangeva/castletheatre/theburlky/hobcleveland/
  // mclemoreresort/eastwindsfestival/thebirchmere/thebitterendnyc/skydogshoals/brooklynbotanic/
  // lakelawnresort/theheritagecollection/nizucresort/hyattregencyorlando/lakeviewmarina.bham --
  // none plausibly Chicago, skipped without a search burn). 7 confirmed Chicago-metro,
  // including a THIRD handle variant of the already-resolved West Loop venue at 401 N Morgan St
  // (401morganmfg, alongside morgan.mfg and morgan.mfg. from Batches 7/earlier). Explicit
  // non-Chicago exclusions: stonehavenweddings (Section, AL), wadehouseweddings (Greenbush,
  // WI), elmsmansion (New Orleans, LA), chspourhouse (Charleston, SC -- name coincidence only).
  // Inconclusive, left unresolved: evanstonspace, zbarchicago (no exact-handle match found),
  // lincoln919 (a "Lincoln Theatre" account -- plausibly Chicago's Lincoln Hall given a
  // "CHICAGO TONIGHT" post surfaced in results, but the address doesn't match and multiple
  // cities have a Lincoln Theatre; not guessed).
  { accountId: 6147, username: "terrace16chicago", address: "401 N Wabash Ave", city: "Chicago", region: "IL", source: "web:chicagostyleweddings.com, choosechicago.com (Trump Tower, 16th floor)" },
  { accountId: 6151, username: "cabrachicago", address: "200 N Green St", city: "Chicago", region: "IL", source: "web:thehoxton.com (West Loop rooftop)" },
  { accountId: 6138, username: "hotellincoln", address: "1816 N Clark St", city: "Chicago", region: "IL", source: "web:jdvhotels.com, yelp.com (Lincoln Park/Old Town)" },
  { accountId: 6586, username: "401morganmfg", address: "401 N Morgan St", city: "Chicago", region: "IL", source: "web:401morganmfg.com, morgan-mfg.com (3rd handle variant of the already-resolved West Loop venue)" },
  { accountId: 6631, username: "durtynellies", address: "180 N Smith St", city: "Palatine", region: "IL", source: "web:wedding-spot.com, eventective.com" },
  { accountId: 5658, username: "artinstituteevents", address: null, city: "Chicago", region: "IL", source: "web:artic.edu/venue-rental (Art Institute of Chicago)" },
  { accountId: 5808, username: "thefifty50group", address: "1924 W Chicago Ave", city: "Chicago", region: "IL", source: "web:thefifty50group.com (Wicker Park)" },

  // Batch 11 (2026-09-06, autonomous /loop continuation). The remaining pool has become
  // dominated by a large, distinct cluster of national touring-circuit music-venue/festival
  // handles (theryman, 3rdandlindsley, ardmoremusichall, hobcleveland, mclemoreresort, etc. --
  // Nashville/Cleveland/PA/TN/NYC venues) that already got a first look in Batch 10 and were
  // skipped without a search burn there; they reappear here (offset-based querying re-surfaces
  // already-judged-excluded accounts since exclusion never writes an account_locations row) --
  // not re-searched again, no new information since Batch 10. Of this batch's actual NEW tail
  // (7 accounts past Batch 10's cutoff), 4 confirmed Chicago-metro. Inconclusive, left
  // unresolved: theplazahotel (no Chicago-specific match; likely a same-named NYC/other-market
  // venue but not confirmed either way), sandvalleygolf (possibly Sand Valley Golf Resort,
  // Nekoosa WI, but not confirmed -- not guessed).
  { accountId: 6721, username: "themontrosesaloon", address: "2933 W Montrose Ave", city: "Chicago", region: "IL", source: "web:montrosesaloon.com, yelp.com (Albany Park)" },
  { accountId: 6725, username: "illuminatedbrewworks", address: null, city: "Chicago", region: "IL", source: "web:ibw-chicago.com (West Loop; possibly since closed, location confirmed regardless)" },
  { accountId: 6726, username: "mysticrogueirishpub", address: "6070 N Northwest Hwy", city: "Chicago", region: "IL", source: "web:mysticrogueirishpub.com, yelp.com" },
  { accountId: 6933, username: "magikstreetbylm", address: "2150 S Canalport Ave", city: "Chicago", region: "IL", source: "web:lacunaeventsbylm.com/magik-street (Pilsen/Bridgeport)" },
];
// whitehawkcc (Crown Point, IN, ~50min S of downtown) explicitly excluded per user
// review 2026-09-06 -- Indiana is out of scope for this corpus, same call as Batch 2's
// stjames1868/williams.orchard exclusions. westloopweddingwalk kept in (user confirmed) --
// the venue-role corroboration filter downstream still decides whether it survives as
// "a venue" for candidate creation, this script only confirms the address is Chicago.

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
