/**
 * One-off, idempotent apply of `account_aliases` (pipeline/schema.sql, D047 follow-on,
 * 2026-09-06) plus the first verified batch of real venues running multiple Instagram
 * handles. Each pair/group below was independently verified via WebSearch (never inferred
 * from username/name similarity alone -- see the table's own schema.sql comment for the two
 * false positives that method produced: a shared "Venue Partners:" marketing boilerplate line
 * mistaken for aliasing, and the multi-city City Winery franchise chain).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyAccountAliasesSchema.ts --dry-run
 *   bun run scripts/graph/applyAccountAliasesSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const CREATE_TABLE = `
  create table if not exists account_aliases (
    alias_account_id     bigint primary key references accounts(id),
    canonical_account_id bigint not null references accounts(id),
    note                  text,
    confirmed_at          timestamptz not null default now(),
    check (alias_account_id <> canonical_account_id)
  );`;

interface AliasRow {
  aliasUsername: string;
  canonicalUsername: string;
  note: string;
}

// canonical = the main/general-purpose handle; alias = the dedicated events-booking or
// handle-variant account. Verified via WebSearch, 2026-09-06.
const ALIASES: AliasRow[] = [
  { aliasUsername: "artinstitutespecialevents", canonicalUsername: "artinstitutechi", note: "Art Institute of Chicago's dedicated weddings/events booking account (eventrentals@artic.edu)" },
  { aliasUsername: "artinstituteevents", canonicalUsername: "artinstitutechi", note: "Art Institute of Chicago, third handle for the same events program" },
  { aliasUsername: "chicagomuseumevents", canonicalUsername: "chicagomuseum", note: "Chicago History Museum's events-focused account (confirmed by the museum's own account bio)" },
  { aliasUsername: "fieldmuseumspecialevents", canonicalUsername: "fieldmuseum", note: "Field Museum's dedicated events booking account" },
  { aliasUsername: "harrycarayscelebrations", canonicalUsername: "harrycarays", note: "Harry Caray's Restaurant Group's events/celebrations sub-account" },
  { aliasUsername: "lmstudiochicago", canonicalUsername: "lmstudiochi", note: "LM Studio -- official handle is @lmstudiochi per lmstudiochicago.com's own social link" },
  { aliasUsername: "morgan.mfg.", canonicalUsername: "morgan.mfg", note: "Morgan MFG, trailing-dot handle variant (same West Loop venue, already cross-referenced this session)" },
  { aliasUsername: "msichicagoevents", canonicalUsername: "msichicago", note: "Griffin Museum of Science and Industry's dedicated events account" },
  { aliasUsername: "salvageoneevents", canonicalUsername: "salvageone", note: "Salvage One's events booking account (full_name literally 'Salvage One Events')" },
  { aliasUsername: "sarabande", canonicalUsername: "sarabandechicago", note: "SARABANDE, shortened handle variant" },
  { aliasUsername: "surgicalmuseumevents", canonicalUsername: "surgicalmuseumchicago", note: "International Museum of Surgical Science's events account ('IMSS Events Chicago')" },
  { aliasUsername: "thedawsonchi", canonicalUsername: "thedawsonchicago", note: "The Dawson, shortened handle variant" },
  { aliasUsername: "thehegewischvenue", canonicalUsername: "thehegewisch", note: "The Hegewisch, 'venue'-suffixed handle variant" },
  { aliasUsername: "communityhouse_celebrate", canonicalUsername: "communityhouse_winnetka", note: "Community House in Winnetka -- identical full_name on both accounts" },
  { aliasUsername: "publishinghouse_bnb", canonicalUsername: "publishinghousebnb", note: "Publishing House B&B, underscore-variant handle" },
  // Round 2 (D048 follow-on, 2026-09-06), found by hand-reading the beyond_include_v1 label
  // sync's double-venue-tag-ambiguous candidates -- both jointly tagged in a single "Venue:"
  // credit line on every post seen, same pattern as round 1's pairs above.
  { aliasUsername: "armourhouseweddings", canonicalUsername: "thearmourhousemansion", note: "Armour House Mansion & Gardens (Lake Forest Academy) -- confirmed via WebSearch" },
  { aliasUsername: "halimmuseumevents", canonicalUsername: "halimmuseum", note: "Halim Time & Glass Museum's dedicated events-booking account (jointly tagged as 'Venue & Catering: @halimmuseum @halimmuseumevents')" },
  // Round 3 (tail-end coverage mission, 2026-09-07), found by scanning tail-end (1-15-wedding)
  // Chicago venue accounts for substring-containment pairs not yet in this table. Each verified
  // individually below -- two known false-positive patterns from this same method were excluded
  // rather than added: thedrakeoakbrook/thedrake (two genuinely different Drake-branded hotels)
  // and ravenswoodloftchicago/ftchicago (ftchicago is a coincidental substring of
  // "ravenswoodloFTCHICAGO", not a real second handle). Also excluded this round, each for its
  // own reason (see docs/decisions.md): riverroastchi/riverroastchicago (riverroastchi's own bio
  // names a DIFFERENT events handle, @rreventschicago, contradicting the pairing),
  // gooseislandchicago/gooseisland (gooseisland is the Goose Island beer brand's corporate
  // account, not a wedding-venue-appropriate canonical), swissotelchi/swissotel (bare
  // "swissotel" is a global hotel-chain handle, same genericity risk as thedrake),
  // chicagofirehouserestaurant/chicagofire ("Chicago Fire" collides with the MLS soccer club),
  // rpmeventschicago/rpmevents (RPM is a multi-venue restaurant group; scope of "rpmevents"
  // unconfirmed), cafebrauer/patioatcafebrauer (may be two intentionally distinct bookable
  // spaces at the same building, not confirmed same-identity), artinstitutechi/artinstitutechicago
  // (unverified second handle for an account that already has 3 confirmed aliases above).
  { aliasUsername: "thelytlehouse.", canonicalUsername: "thelytlehouse", note: "Trailing-dot scrape/parse artifact -- Instagram usernames can't end in '.', never independently profile-scraped (empty bio), same account as thelytlehouse" },
  { aliasUsername: "ovationchicago.", canonicalUsername: "ovationchicago", note: "Trailing-dot scrape/parse artifact, same pattern as thelytlehouse." },
  { aliasUsername: "rcchicago.", canonicalUsername: "rcchicago", note: "Trailing-dot scrape/parse artifact, same pattern as thelytlehouse." },
  { aliasUsername: "osteriaviastato.", canonicalUsername: "osteriaviastato", note: "Trailing-dot scrape/parse artifact -- canonical's own bio confirms '#osteriaviastatowedding' Chicago venue" },
  { aliasUsername: "eventsatmortonarboretum", canonicalUsername: "mortonarb", note: "Morton Arboretum's events-booking sub-account -- name matches 'Signature Events at The Morton Arboretum' (mortonarb.org), same pattern as other verified events sub-accounts above" },
  { aliasUsername: "loewschicago", canonicalUsername: "loewschicagohotel", note: "loewschicagohotel is the WebSearch-confirmed official Loews Chicago Hotel handle; loewschicago's one wedding's own hashtags (#urbanwedding #citywedding #loewshotel) confirm the downtown property, not the separate Loews Chicago O'Hare hotel" },
  { aliasUsername: "cuneomansion", canonicalUsername: "loyola_cuneomansion", note: "Loyola University Chicago owns and operates Cuneo Mansion & Gardens (public fact) -- same venue, two handles" },
  { aliasUsername: "penthousehydepark", canonicalUsername: "thepenthousehydepark", note: "Canonical's bio confirms 'Restored ballroom and rooftop terrace venue... Hyde Park, Chicago'; 'the'-prefix handle variant, same pattern as thedawsonchi/thehegewisch above" },
  { aliasUsername: "theateronthelake", canonicalUsername: "theateronthelakechicago", note: "Theater on the Lake, Chicago Park District venue (Lincoln Park) -- unambiguous name, 'chicago'-suffix handle variant" },
  { aliasUsername: "thethompsonchicago", canonicalUsername: "thompsonchicago", note: "Thompson Chicago (Hyatt boutique hotel brand) -- 'the'-prefix handle variant, same pattern as thedawsonchi above" },
  { aliasUsername: "edgewoodvalleycc", canonicalUsername: "edgewoodvalley", note: "Edgewood Valley Country Club, La Grange IL -- 'cc'-suffix handle variant of a real country club" },
  { aliasUsername: "post433chicagophoto", canonicalUsername: "post433chicago", note: "Post 433's own bio confirms it as a Chicago Landmark event space; dedicated photo/portfolio sub-account, same pattern as other verified sub-accounts above" },
  // Round 4 (D055 location-tag map hand-pass, 2026-09-08): surfaced because the Instagram
  // location tag "Old Post Office" resolved to two venue accounts. Both are the same building's
  // events program -- full_name "Events at The Old Post Office" (post433events) vs "The Old Post
  // Office" (post433chicago, already the canonical for post433chicagophoto above).
  { aliasUsername: "post433events", canonicalUsername: "post433chicago", note: "The Old Post Office events sub-account (full_name 'Events at The Old Post Office'); surfaced by the location_tag hand-pass, D055" },
  // Round 5 (D055 review, 2026-09-08, user-caught: "Venue: @threetoplounge / @saltshechicago --
  // same spot?"). Three Top Lounge is the rooftop bar at The Salt Shed (1357 N Elston); and
  // `saltshechicago` is a mis-captured handle (no such Instagram account; the venue is
  // @saltshedchicago, which already has a documented wedding). Both roll up to the real handle.
  { aliasUsername: "threetoplounge", canonicalUsername: "saltshedchicago", note: "Three Top Lounge = the rooftop at The Salt Shed; user-caught in review, D055" },
  { aliasUsername: "saltshechicago", canonicalUsername: "saltshedchicago", note: "mis-captured handle for @saltshedchicago (D055 geography pass flagged it; user confirmed the venue)" },
  // Round 6 (D055 strong push, 2026-09-10; each WebSearch-verified this session). Not applied,
  // unverified: rpmeventsandcatering<->rpmeventschicago (only the latter confirmed official) and
  // 167greenstreet/167eventschicago (the venue is confirmed, neither handle was).
  { aliasUsername: "cbgweddings", canonicalUsername: "chicagobotanic", note: "Chicago Botanic Garden Events -- the Garden's own weddings/events account (instagram.com/cbgweddings, Events@chicagobotanic.org); 16 venue weddings had accumulated on it" },
  { aliasUsername: "artinstituteweddingsevents", canonicalUsername: "artinstitutechi", note: "Art Institute Weddings and Events -- fourth handle for the same events program (eventrentals@artic.edu, same as artinstitutespecialevents)" },
  { aliasUsername: "totlspecialevents", canonicalUsername: "theateronthelakechicago", note: "Theater On The Lake Events -- the venue's events account (instagram.com/totlspecialevents)" },
  { aliasUsername: "venutisrestaurant", canonicalUsername: "venutis.banquets", note: "user-caught 2026-09-10: venutis.banquets is the real Venuti's Ristorante & Banquet Hall account (Addison); venutisrestaurant is a mention-only handle with no profile" },
  // Round 7a (D055, 2026-09-10): the first systematic pass -- findVenueAliasCandidates.ts T1
  // (auto-safe: punctuation-only handle variants and bio-confirmed events accounts) plus two
  // one-letter typo captures from T2. Same artifact class as round 3's trailing-dot rows.
  { aliasUsername: "thearbory", canonicalUsername: "the.arbory", note: "round 7a: punctuation variant of The Arbory's scraped profile (117 vs 4 venue weddings)" },
  { aliasUsername: "uccweddings", canonicalUsername: "universityclubofchicago", note: "round 7a: the club's own bio says 'Weddings Account @uccweddings'" },
  { aliasUsername: "thedrakechicago.", canonicalUsername: "thedrakechicago", note: "round 7a: trailing-dot scrape/parse artifact (57 vs 1 weddings)" },
  { aliasUsername: "morganmfg", canonicalUsername: "morgan.mfg", note: "round 7a: punctuation variant of Morgan MFG's scraped profile" },
  { aliasUsername: "grandgeneva", canonicalUsername: "grand_geneva", note: "round 7a: underscore variant, same resort (Lake Geneva WI, non-metro on both sides)" },
  { aliasUsername: "silverlake_cc", canonicalUsername: "silverlake.cc", note: "round 7a: underscore/dot variant of Silver Lake Country Club (3 weddings on the dotted handle)" },
  { aliasUsername: "rockwellontherive", canonicalUsername: "rockwellontheriver", note: "round 7a: one-letter mis-capture of a 140-wedding venue handle" },
  { aliasUsername: "chicagoilluminatingcomapny", canonicalUsername: "chicagoilluminatingcompany", note: "round 7a: transposed-letters mis-capture of a 102-wedding venue handle" },
  // Round 7b (D055, 2026-09-10): the finder's verify tier after a web-checking agent (16 yes / 28
  // no across 44 pairs, 14 searches). Where the verified target is itself an alias, the row
  // points at the real canonical so no alias ever points at an alias.
  { aliasUsername: "artinstituteweddingevents", canonicalUsername: "artinstitutechi", note: "round 7b: missing-s typo of artinstituteweddingsevents (itself an alias of artinstitutechi)" },
  { aliasUsername: "artinstituespecialevents", canonicalUsername: "artinstitutechi", note: "round 7b: missing-t typo of artinstitutespecialevents (itself an alias of artinstitutechi)" },
  { aliasUsername: "artinsitutechi", canonicalUsername: "artinstitutechi", note: "round 7b: missing-t typo of the Art Institute's main handle" },
  { aliasUsername: "totlspeacialevents", canonicalUsername: "theateronthelakechicago", note: "round 7b: inserted-letter typo of totlspecialevents (itself an alias of theateronthelakechicago)" },
  { aliasUsername: "thefarmhouseainfield", canonicalUsername: "thefarmhouseplainfield", note: "round 7b: dropped-letters typo of The Farmhouse Plainfield (14 weddings on the real handle)" },
  { aliasUsername: "radissonblueaquachicago", canonicalUsername: "radissonbluaquachicago", note: "round 7b: 'Blue' misspelling of the Radisson Blu Aqua handle" },
  { aliasUsername: "salon6levents", canonicalUsername: "salon61events", note: "round 7b: 6l/61 digit-letter confusion" },
  { aliasUsername: "cafebauer", canonicalUsername: "cafebrauer", note: "round 7b: missing-r typo of Cafe Brauer" },
  { aliasUsername: "celebratebloom", canonicalUsername: "celebrateatbloom", note: "round 7b: dropped-'at' mis-capture of the real Bloom account" },
  { aliasUsername: "destinationgnweddings", canonicalUsername: "destinationgn", note: "round 7b: WebSearch-confirmed weddings sub-account of Destination Geneva National (Lake Geneva WI, non-metro on both sides)" },
  { aliasUsername: "thedisctric_il", canonicalUsername: "thedistrict_il", note: "round 7b: transposition typo of The District (4 weddings on the real handle)" },
  { aliasUsername: "warhouse109", canonicalUsername: "warehouse109", note: "round 7b: missing-e typo of Warehouse 109 (Plainfield)" },
  { aliasUsername: "lacunacatalystsuites", canonicalUsername: "lacunabycatalystsuites", note: "round 7b: dropped-'by' variant of the scraped Lacuna by Catalyst Suites account" },
  { aliasUsername: "harraycaraycelebrations", canonicalUsername: "harrycarays", note: "round 7b: transposition typo of harrycarayscelebrations (itself an alias of harrycarays)" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(CREATE_TABLE);

    let inserted = 0;
    for (const row of ALIASES) {
      const { rows: aliasRows } = await client.query<{ id: number }>(
        `select id from accounts where username = $1::citext`,
        [row.aliasUsername]
      );
      const { rows: canonicalRows } = await client.query<{ id: number }>(
        `select id from accounts where username = $1::citext`,
        [row.canonicalUsername]
      );
      if (aliasRows.length === 0 || canonicalRows.length === 0) {
        console.log(`[account-aliases] SKIP ${row.aliasUsername} -> ${row.canonicalUsername}: account not found`);
        continue;
      }
      const { rows: insertedRows } = await client.query(
        `insert into account_aliases (alias_account_id, canonical_account_id, note)
         values ($1, $2, $3)
         on conflict (alias_account_id) do nothing
         returning alias_account_id`,
        [aliasRows[0].id, canonicalRows[0].id, row.note]
      );
      if (insertedRows.length > 0) {
        inserted++;
        console.log(`[account-aliases] ${row.aliasUsername} (${aliasRows[0].id}) -> ${row.canonicalUsername} (${canonicalRows[0].id})`);
      } else {
        console.log(`[account-aliases] ${row.aliasUsername} already aliased, skipping`);
      }
    }
    console.log(`[account-aliases] ${dryRun ? "DRY RUN — " : ""}inserted=${inserted}`);

    if (dryRun) {
      await client.query("rollback");
      console.log("[account-aliases] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[account-aliases] COMMITTED");
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
