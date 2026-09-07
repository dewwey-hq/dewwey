/**
 * Read-only report: the 742 golden_set-confirmed WEDDING posts, scored
 * across independent dimensions -- NOT gated on the narrow 3+-role
 * structured-stack pipeline. That pipeline (stack extraction -> 3+-role
 * clustering -> reconciliation) stays scoped to creating NEW structured
 * wedding entities (weddings/wedding_vendors rows) -- it is deliberately
 * NOT treated here as the gate for "is this real content worth showing on
 * a vendor's page." A single post crediting just one photographer at a
 * real, specific, Chicago wedding is legitimate vendor-page content even
 * though it can never build a multi-vendor structured wedding entity.
 *
 * Dimensions computed per post, independently:
 *   1. real wedding       -- already true by construction (golden_set
 *                            expected_decision='INCLUDE'); this script also
 *                            runs a deterministic named-couple/specific-event
 *                            heuristic as a SEPARATE cross-check, since the
 *                            human-confirmed-candidates-review.md finding
 *                            showed some fast individual labels missed
 *                            generic vendor marketing with a rich stack.
 *   2. chicago relevance   -- resolved PER POST from whatever venue/location
 *                            signal that post actually has, independent of
 *                            whether it ever got clustered into a candidate.
 *   3. vendor attribution  -- any (account, role) extracted, any count (not
 *                            requiring 3+).
 *   4. structured stack    -- 3+ distinct roles (the narrower flag, kept
 *                            for the existing graph-creation pipeline only).
 *   5. specific wedding identity -- the named-couple/specific-event heuristic.
 *   6. reconciliation      -- only applicable to the subset that reached
 *                            clustering; N/A for everything else.
 *
 * No writes. No new tables -- if this reframing sticks, a future pass can
 * decide what (if anything) is worth persisting.
 *
 * Usage (from apps/web): bun run scripts/graph/reportVendorPageContentCorpus.ts
 */
import type { QueryResultRow } from "pg";
import { getPool, closePool } from "../classify/db";

// Deterministic, cheap, first-pass triage -- NOT a final verdict. This
// project's own history (the non-wedding-posts mission's caption heuristic,
// docs/engineering/graph-strengthening/non-wedding-posts.md) found a
// similar regex-based screen tops out around 80% precision. Treat this the
// same way: report the split, don't trust it uncalibrated.
const COUPLE_PATTERNS: RegExp[] = [
  /\b([A-Z][a-z]+)\s*(?:&|\+|and)\s*([A-Z][a-z]+)\b/, // "Sarah & Tom", "Sarah and Tom", "Sarah + Tom"
  /\bMr\.?\s*&\s*Mrs\.?\s+[A-Z][a-z]+/, // "Mr & Mrs Gjerazi"
  /\bCouple:\s*@\w+/i,
  /\bBride:\s*@\w+/i,
];
const GENERIC_MARKETING_PATTERNS: RegExp[] = [
  /\bbook\s+(?:now|your date)\b/i,
  /\breserve\s+your date\b/i,
  /\bschedule a tour\b/i,
  /\bnow booking\b/i,
  /\bcontact us today\b/i,
  /\blet'?s\s+(?:start\s+)?plan/i,
  /\bstart (?:wedding )?planning today\b/i,
  /\binquire (?:about|today)\b/i,
];

function hasCoupleSignal(caption: string | null): boolean {
  if (!caption) return false;
  return COUPLE_PATTERNS.some((re) => re.test(caption));
}
function hasGenericMarketingSignal(caption: string | null): boolean {
  if (!caption) return false;
  return GENERIC_MARKETING_PATTERNS.some((re) => re.test(caption));
}

async function main() {
  const pool = getPool();
  const q = async <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) =>
    (await pool.query<T>(sql, params)).rows;

  const posts = await q<{
    post_url: string;
    caption_raw: string | null;
    location_tag: string | null;
    owner_username: string;
  }>(
    `select gs.post_url, sp.caption_raw, sp.location_tag, sp.owner_username
     from golden_set gs
     join staging.instagram_posts sp on sp.post_url = gs.post_url
     where gs.expected_decision = 'INCLUDE'`
  );

  // Same "latest version wins per credit line" resolution as
  // jeremy_post_vendor_evidence/human_confirmed_post_vendor_evidence --
  // stack_extraction_entries is append-only per parser version, so a naive
  // scan without this would double-count a line seen under both v2 and v3.
  const vendorRows = await q<{ post_url: string; account_id: number; role: string; handle: string }>(
    `select latest.post_url, a.id as account_id, latest.role, latest.handle
     from (
       select distinct on (post_url, line_no, handle)
         post_url, line_no, handle, role
       from stack_extraction_entries
       order by post_url, line_no, handle, extracted_at desc
     ) latest
     join accounts a on lower(a.username::text) = latest.handle
     where latest.role <> 'other'
       and latest.post_url in (select post_url from golden_set where expected_decision = 'INCLUDE')`
  );
  const vendorsByPost = new Map<string, { account_id: number; role: string; handle: string }[]>();
  for (const v of vendorRows) {
    if (!vendorsByPost.has(v.post_url)) vendorsByPost.set(v.post_url, []);
    vendorsByPost.get(v.post_url)!.push(v);
  }

  const venueAccountIds = [...new Set(vendorRows.filter((v) => v.role === "venue").map((v) => v.account_id))];
  const locations = await q<{ account_id: number; in_metro: boolean | null }>(
    `select account_id, in_metro from account_locations where account_id = any($1::bigint[])`,
    [venueAccountIds]
  );
  const inMetroByAccount = new Map(locations.map((l) => [l.account_id, l.in_metro]));
  const vendorCities = await q<{ account_id: number; city: string | null }>(
    `select account_id, city from vendors where account_id = any($1::bigint[])`,
    [venueAccountIds]
  );
  const cityByAccount = new Map(vendorCities.map((v) => [v.account_id, v.city]));

  // No trailing \b: hashtags mash words together ("#chicagowedding"), so
// "chicago" is rarely followed by a word boundary in this corpus.
const CHICAGO_HINT = /\bchicago/i;
  const NON_CHICAGO_STATE_OR_CITY = /\b(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)\b/i;

  const inCandidatePosts = new Set(
    (
      await q<{ source_post_url: string }>(
        `select cp.source_post_url from jeremy_wedding_candidate_posts cp
         join jeremy_wedding_candidates c on c.id = cp.candidate_id
         where c.clustering_version = 'human-confirmed-v1'`
      )
    ).map((r) => r.source_post_url)
  );

  interface Row {
    post_url: string;
    vendorCount: number;
    hasStructuredStack: boolean;
    chicagoStatus: "CONFIRMED" | "NOT_CONFIRMED" | "AMBIGUOUS" | "NO_VENUE_SIGNAL";
    hasCouple: boolean;
    hasGenericMarketing: boolean;
    inCandidate: boolean;
  }
  const rows: Row[] = [];

  for (const p of posts) {
    const vendors = vendorsByPost.get(p.post_url) ?? [];
    const distinctRoles = new Set(vendors.map((v) => v.role)).size;
    const venue = vendors.find((v) => v.role === "venue");

    // Priority order matches labeling_rubric.md's own hierarchy:
    // location_tag / a resolved venue's verified location outrank an
    // explicit "Chicago" caption/hashtag mention tied to this event, which
    // in turn outranks nothing else (a vendor's own market is explicitly
    // NOT reliable evidence for where the event was, per the rubric -- not
    // used here at all).
    let chicagoStatus: Row["chicagoStatus"];
    if (venue && inMetroByAccount.get(venue.account_id) === true) {
      chicagoStatus = "CONFIRMED";
    } else if (venue && cityByAccount.get(venue.account_id) === "Chicago") {
      chicagoStatus = "CONFIRMED";
    } else if (venue && inMetroByAccount.get(venue.account_id) === false) {
      chicagoStatus = "NOT_CONFIRMED";
    } else if (p.location_tag && CHICAGO_HINT.test(p.location_tag)) {
      chicagoStatus = "CONFIRMED";
    } else if (p.location_tag && NON_CHICAGO_STATE_OR_CITY.test(p.location_tag)) {
      chicagoStatus = "NOT_CONFIRMED";
    } else if (p.caption_raw && CHICAGO_HINT.test(p.caption_raw)) {
      chicagoStatus = "CONFIRMED";
    } else if (p.caption_raw && NON_CHICAGO_STATE_OR_CITY.test(p.caption_raw)) {
      chicagoStatus = "NOT_CONFIRMED";
    } else if (venue) {
      chicagoStatus = "AMBIGUOUS"; // a venue was identified, just not confidently placed
    } else {
      chicagoStatus = "NO_VENUE_SIGNAL"; // no venue extracted, no textual hint either way
    }

    rows.push({
      post_url: p.post_url,
      vendorCount: new Set(vendors.map((v) => v.account_id)).size,
      hasStructuredStack: distinctRoles >= 3,
      chicagoStatus,
      hasCouple: hasCoupleSignal(p.caption_raw),
      hasGenericMarketing: hasGenericMarketingSignal(p.caption_raw),
      inCandidate: inCandidatePosts.has(p.post_url),
    });
  }

  console.log(`=== Vendor-page content corpus report (n=${rows.length}) ===\n`);

  console.log("-- Chicago relevance --");
  for (const status of ["CONFIRMED", "NOT_CONFIRMED", "AMBIGUOUS", "NO_VENUE_SIGNAL"] as const) {
    console.log(`  ${status}: ${rows.filter((r) => r.chicagoStatus === status).length}`);
  }

  console.log("\n-- Vendor attribution (any count) --");
  console.log(`  0 vendors identified: ${rows.filter((r) => r.vendorCount === 0).length}`);
  console.log(`  1-2 vendors identified: ${rows.filter((r) => r.vendorCount >= 1 && r.vendorCount <= 2).length}`);
  console.log(`  3+ vendors identified: ${rows.filter((r) => r.vendorCount >= 3).length}`);

  console.log("\n-- Structured stack (3+ distinct roles -- the narrow graph-creation gate) --");
  console.log(`  yes: ${rows.filter((r) => r.hasStructuredStack).length}`);
  console.log(`  no: ${rows.filter((r) => !r.hasStructuredStack).length}`);

  console.log("\n-- Specific-wedding-identity heuristic (deterministic, uncalibrated -- triage only) --");
  console.log(`  named couple/individual signal found: ${rows.filter((r) => r.hasCouple).length}`);
  console.log(`  generic marketing CTA signal found: ${rows.filter((r) => r.hasGenericMarketing).length}`);
  console.log(`  both signals present (ambiguous): ${rows.filter((r) => r.hasCouple && r.hasGenericMarketing).length}`);
  console.log(`  neither signal: ${rows.filter((r) => !r.hasCouple && !r.hasGenericMarketing).length}`);

  console.log("\n-- Already in a structured-graph candidate (human-confirmed-v1) --");
  console.log(`  yes: ${rows.filter((r) => r.inCandidate).length}`);
  console.log(`  no: ${rows.filter((r) => !r.inCandidate).length}`);

  console.log("\n=== The reframed question: usable vendor-page content ===");
  console.log("Chicago-confirmed AND >=1 vendor identified (minimum bar for showing on a vendor's page):");
  const minimalBar = rows.filter((r) => r.chicagoStatus === "CONFIRMED" && r.vendorCount >= 1);
  console.log(`  ${minimalBar.length} / ${rows.length}`);

  console.log("\nChicago-confirmed AND >=1 vendor AND named-couple/specific-event signal (higher-confidence subset):");
  const higherConfidence = minimalBar.filter((r) => r.hasCouple && !r.hasGenericMarketing);
  console.log(`  ${higherConfidence.length} / ${rows.length}`);

  console.log("\nChicago-confirmed AND >=1 vendor, but NO couple signal AND generic-marketing signal present (highest-risk subset, matches the mislabel pattern found in the candidates review):");
  const highRisk = minimalBar.filter((r) => !r.hasCouple && r.hasGenericMarketing);
  console.log(`  ${highRisk.length} / ${rows.length}`);

  console.log("\nChicago AMBIGUOUS or NO_VENUE_SIGNAL (needs a location decision before showing anywhere):");
  console.log(`  ${rows.filter((r) => r.chicagoStatus === "AMBIGUOUS" || r.chicagoStatus === "NO_VENUE_SIGNAL").length}`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
