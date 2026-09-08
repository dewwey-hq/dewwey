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
