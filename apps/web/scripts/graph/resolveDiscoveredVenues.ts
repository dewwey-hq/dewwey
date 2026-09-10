/**
 * D055 venue-discovery reader downstream (2026-09-09): resolves the Haiku pool-b reader's venue
 * attribution (post_extraction_runs, pool='pool-b', verdict in THIS_VENUE/OTHER_VENUE -- for
 * pool-b both just mean "a real wedding, venue as extracted", per extractPrompt.ts's own
 * decideVerdictWrite comment) to an EXISTING accounts row where possible, and reports (never
 * auto-mints) the rest as new-venue leads. Three tiers, all always reported; --apply writes tier
 * A + B anchors (extracted_venue_anchors) and the discovered_venue_leads table:
 *
 *   A. venue_handle_guess normalizes and resolves to an existing accounts row (alias-aware) AND
 *      the post's own caption literally contains '@'+handle (sanity check -- a handle that
 *      resolves but isn't caption-confirmed downgrades to a tier B attempt instead of being
 *      trusted blind). resolved_by='handle'.
 *   B. venue_name normalizes (lowercase, strip punctuation, drop leading "the", collapse spaces)
 *      to an EXISTING venue -- exact match on accounts.full_name / vendors.name /
 *      location_tag_venue_map.location_tag after the same normalization -- whose account is
 *      vendors.category='venue' OR already has >=1 venue-role wedding (wedding_vendors.role=
 *      'venue'). resolved_by='name'. An ambiguous exact match (2+ distinct eligible accounts)
 *      or a near-miss (no exact match, but close -- pg_trgm isn't installed on this project's
 *      Supabase, confirmed 2026-09-09, so this uses the prefix/contains fallback in
 *      discoveredVenueLeads.ts's isNearMiss) is printed as a hand-pass candidate, never written.
 *   C. neither resolves -> aggregated into discovered_venue_leads, grouped by normalized name --
 *      a candidate new venue the graph has never seen. NEVER auto-minted into accounts/
 *      account_locations here -- that's a separate, later, approved step (the D052 rule: a new
 *      venue needs an independent geography check before it enters the graph).
 *
 * Both tables are applied idempotently here (create table if not exists), matching the DDL in
 * pipeline/schema.sql -- run applyExtractedVenueAnchorSchema.ts separately too if you want the
 * table to exist before this script's first --apply run touches it (this script creates it on
 * demand either way).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/resolveDiscoveredVenues.ts                         # same as --dry-run
 *   bun run scripts/graph/resolveDiscoveredVenues.ts --dry-run
 *   bun run scripts/graph/resolveDiscoveredVenues.ts --dry-run --min-confidence 0.9
 *   bun run scripts/graph/resolveDiscoveredVenues.ts --apply                 # writes tier A/B anchors + leads
 */
import { getPool, closePool } from "../classify/db";
import {
  normalizeHandle,
  normalizeVenueName,
  captionContainsHandle,
  isNearMiss,
  decideTier,
  type TierDecision,
} from "./discoveredVenueLeads";

const DEFAULT_MIN_CONFIDENCE = 0.8;
const TOP_LEADS_TO_PRINT = 60;

const CREATE_LEADS_TABLE = `
  create table if not exists discovered_venue_leads (
    name_norm        text primary key,
    name_display     text,
    posts            int,
    owners           int,
    location_claim   text,
    metro_yes        int,
    metro_no         int,
    metro_unknown    int,
    handle_guesses   text[],
    sample_post_urls text[],
    status           text default 'new',
    updated_at       timestamptz default now()
  );`;

interface Args {
  apply: boolean;
  minConfidence: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const apply = a.includes("--apply");
  const idx = a.indexOf("--min-confidence");
  const minConfidence = idx >= 0 ? Number(a[idx + 1]) : DEFAULT_MIN_CONFIDENCE;
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error(`--min-confidence must be a number between 0 and 1, got "${a[idx + 1]}"`);
  }
  return { apply, minConfidence };
}

interface ExtractionRow {
  post_url: string;
  confidence: number;
  venue_name: string | null;
  venue_handle_guess: string | null;
  location_claim: string | null;
  chicago_metro: "yes" | "no" | "unknown" | null;
  caption_raw: string | null;
  owner_username: string | null;
}

async function main() {
  const { apply, minConfidence } = parseArgs();
  const pool = getPool();

  // --- Load extraction rows (pool-b, THIS_VENUE/OTHER_VENUE, confidence >= threshold) ---
  const { rows: extractionRows } = await pool.query<ExtractionRow>(
    `select per.post_url,
            per.confidence,
            per.result->>'venue_name' as venue_name,
            per.result->>'venue_handle_guess' as venue_handle_guess,
            per.result->>'location_claim' as location_claim,
            per.result->>'chicago_metro' as chicago_metro,
            sp.caption_raw,
            sp.owner_username
     from post_extraction_runs per
     join staging.instagram_posts sp on sp.post_url = per.post_url
     where per.pool = 'pool-b'
       and per.verdict in ('THIS_VENUE', 'OTHER_VENUE')
       and per.confidence >= $1
       -- Never re-decide a post that's already documented (a real wedding row exists for it) or
       -- already has an extracted_venue_anchors row from an earlier run of this script.
       and not exists (
         select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = per.post_url
       )
       and not exists (select 1 from extracted_venue_anchors eva where eva.post_url = per.post_url)`,
    [minConfidence]
  );

  console.log(
    `[resolve-discovered-venues] ${extractionRows.length} pool-b THIS_VENUE/OTHER_VENUE rows at confidence >= ${minConfidence} (not yet documented, not yet anchor-resolved)`
  );

  if (extractionRows.length === 0) {
    console.log(`[resolve-discovered-venues] nothing to resolve -- exiting`);
    await closePool();
    return;
  }

  // --- Build resolution lookups ---
  const { rows: aliasRows } = await pool.query<{ alias_account_id: number; canonical_account_id: number }>(
    `select alias_account_id, canonical_account_id from account_aliases`
  );
  const aliasToCanonical = new Map(aliasRows.map((r) => [r.alias_account_id, r.canonical_account_id]));
  const canonicalize = (id: number) => aliasToCanonical.get(id) ?? id;

  const { rows: accountRows } = await pool.query<{ id: number; username: string; full_name: string | null }>(
    `select id, username::text as username, full_name from accounts`
  );
  const handleToAccountId = new Map<string, number>();
  for (const r of accountRows) handleToAccountId.set(r.username.toLowerCase(), canonicalize(r.id));

  const { rows: venueRoleRows } = await pool.query<{ account_id: number }>(
    `select distinct account_id from wedding_vendors where role = 'venue'`
  );
  const venueRoleAccountIds = new Set(venueRoleRows.map((r) => canonicalize(r.account_id)));

  const { rows: vendorRows } = await pool.query<{ account_id: number; name: string; category: string | null }>(
    `select account_id, name, category from vendors where account_id is not null`
  );
  const venueCategoryAccountIds = new Set(
    vendorRows.filter((r) => r.category === "venue").map((r) => canonicalize(r.account_id))
  );
  const eligibleVenueAccountIds = new Set([...venueRoleAccountIds, ...venueCategoryAccountIds]);

  // normalized name -> distinct candidate account ids (accounts.full_name / vendors.name /
  // location_tag_venue_map.location_tag), for exact-match resolution AND near-miss detection.
  const normNameToAccountIds = new Map<string, Set<number>>();
  const addName = (raw: string | null, accountId: number) => {
    if (!raw?.trim()) return;
    const norm = normalizeVenueName(raw);
    if (!norm) return;
    const id = canonicalize(accountId);
    if (!normNameToAccountIds.has(norm)) normNameToAccountIds.set(norm, new Set());
    normNameToAccountIds.get(norm)!.add(id);
  };
  for (const r of accountRows) if (r.full_name) addName(r.full_name, r.id);
  for (const r of vendorRows) addName(r.name, r.account_id);
  const { rows: ltmRows } = await pool.query<{ location_tag: string; venue_account_id: number }>(
    `select location_tag, venue_account_id from location_tag_venue_map`
  );
  for (const r of ltmRows) addName(r.location_tag, r.venue_account_id);

  const allNormNames = [...normNameToAccountIds.keys()];

  // --- Resolve each row ---
  interface Resolved {
    row: ExtractionRow;
    decision: TierDecision;
    accountId: number | null;
    handleNorm: string | null;
    nameNorm: string;
    nearMissOf: string[];
    ambiguousAccountIds: number[];
  }
  const resolved: Resolved[] = [];

  for (const row of extractionRows) {
    const handleNorm = row.venue_handle_guess ? normalizeHandle(row.venue_handle_guess) : null;
    const handleAccountId = handleNorm ? handleToAccountId.get(handleNorm) ?? null : null;
    const handleResolved = handleAccountId != null;
    const handleInCaption = handleResolved && handleNorm ? captionContainsHandle(row.caption_raw, handleNorm) : false;

    const nameNorm = normalizeVenueName(row.venue_name ?? "");
    const nameCandidates = nameNorm ? normNameToAccountIds.get(nameNorm) ?? new Set<number>() : new Set<number>();
    const eligibleNameCandidates = [...nameCandidates].filter((id) => eligibleVenueAccountIds.has(id));
    const nameResolved = eligibleNameCandidates.length === 1;
    const nameAmbiguous = eligibleNameCandidates.length > 1;

    let nearMissOf: string[] = [];
    if (nameNorm && !nameResolved && !nameAmbiguous) {
      nearMissOf = allNormNames.filter(
        (other) => other !== nameNorm && isNearMiss(nameNorm, other) && [...normNameToAccountIds.get(other)!].some((id) => eligibleVenueAccountIds.has(id))
      );
    }

    const decision = decideTier({
      handleResolved,
      handleInCaption,
      nameResolved,
      nameAmbiguous,
      nameNearMiss: nearMissOf.length > 0,
    });

    const accountId =
      decision.tier === "A" ? handleAccountId : decision.tier === "B" && decision.write ? eligibleNameCandidates[0] : null;

    resolved.push({
      row,
      decision,
      accountId,
      handleNorm,
      nameNorm,
      nearMissOf,
      ambiguousAccountIds: nameAmbiguous ? eligibleNameCandidates : [],
    });
  }

  const tierA = resolved.filter((r) => r.decision.tier === "A");
  const tierBWrite = resolved.filter((r) => r.decision.tier === "B" && r.decision.write);
  const tierBNearMiss = resolved.filter((r) => r.decision.tier === "B" && !r.decision.write);
  const tierC = resolved.filter((r) => r.decision.tier === "C");

  console.log(`\n[resolve-discovered-venues] tier summary:`);
  console.log(`  A (handle, caption-confirmed): ${tierA.length}`);
  console.log(`  B (name, unambiguous): ${tierBWrite.length}`);
  console.log(`  B (near-miss/ambiguous, NOT written): ${tierBNearMiss.length}`);
  console.log(`  C (new-venue lead): ${tierC.length}`);

  if (tierBNearMiss.length > 0) {
    console.log(`\n[resolve-discovered-venues] hand-pass near-miss / ambiguous list (not written):`);
    for (const r of tierBNearMiss.slice(0, 60)) {
      const kind = r.ambiguousAccountIds.length > 0 ? `ambiguous [${r.ambiguousAccountIds.join(", ")}]` : `near-miss of [${r.nearMissOf.slice(0, 3).join(", ")}]`;
      console.log(`  "${r.row.venue_name}" (norm="${r.nameNorm}") ${kind} -- ${r.row.post_url}`);
    }
  }

  // --- Aggregate tier C into leads, grouped by normalized name ---
  interface LeadAgg {
    nameNorm: string;
    nameDisplay: string;
    postUrls: Set<string>;
    owners: Set<string>;
    locationClaims: Map<string, number>;
    metroYes: number;
    metroNo: number;
    metroUnknown: number;
    handleGuesses: Set<string>;
  }
  const leads = new Map<string, LeadAgg>();
  for (const r of tierC) {
    if (!r.nameNorm) continue; // no venue_name at all -- nothing to aggregate on
    let agg = leads.get(r.nameNorm);
    if (!agg) {
      agg = {
        nameNorm: r.nameNorm,
        nameDisplay: r.row.venue_name ?? r.nameNorm,
        postUrls: new Set(),
        owners: new Set(),
        locationClaims: new Map(),
        metroYes: 0,
        metroNo: 0,
        metroUnknown: 0,
        handleGuesses: new Set(),
      };
      leads.set(r.nameNorm, agg);
    }
    agg.postUrls.add(r.row.post_url);
    if (r.row.owner_username) agg.owners.add(r.row.owner_username.toLowerCase());
    if (r.row.location_claim?.trim()) {
      agg.locationClaims.set(r.row.location_claim, (agg.locationClaims.get(r.row.location_claim) ?? 0) + 1);
    }
    if (r.row.chicago_metro === "yes") agg.metroYes++;
    else if (r.row.chicago_metro === "no") agg.metroNo++;
    else agg.metroUnknown++;
    if (r.handleNorm) agg.handleGuesses.add(r.handleNorm);
  }

  const leadRows = [...leads.values()].map((agg) => {
    const topLocation = [...agg.locationClaims.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      nameNorm: agg.nameNorm,
      nameDisplay: agg.nameDisplay,
      posts: agg.postUrls.size,
      owners: agg.owners.size,
      locationClaim: topLocation,
      metroYes: agg.metroYes,
      metroNo: agg.metroNo,
      metroUnknown: agg.metroUnknown,
      handleGuesses: [...agg.handleGuesses],
      samplePostUrls: [...agg.postUrls].slice(0, 3),
    };
  });
  leadRows.sort((a, b) => b.posts - a.posts);

  console.log(`\n[resolve-discovered-venues] ${leadRows.length} distinct new-venue leads (top ${TOP_LEADS_TO_PRINT} by post count):`);
  for (const l of leadRows.slice(0, TOP_LEADS_TO_PRINT)) {
    console.log(
      `  "${l.nameDisplay}" -- ${l.posts} posts, ${l.owners} owners, location="${l.locationClaim ?? "?"}", ` +
        `metro yes/no/unknown=${l.metroYes}/${l.metroNo}/${l.metroUnknown}, handles=[${l.handleGuesses.join(", ")}]`
    );
  }

  if (!apply) {
    console.log(`\n[resolve-discovered-venues] DRY RUN (pass --apply to write tier A/B anchors + the leads table) -- nothing written`);
    await closePool();
    return;
  }

  // --- Apply: create tables, write tier A/B anchors, upsert leads ---
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(CREATE_LEADS_TABLE);

    let written = 0;
    for (const r of [...tierA, ...tierBWrite]) {
      if (r.accountId == null) continue;
      const { rowCount } = await client.query(
        `insert into extracted_venue_anchors (post_url, venue_account_id, source, confidence, venue_name_raw, resolved_by)
         values ($1, $2, 'extract-v1.2', $3, $4, $5)
         on conflict (post_url) do nothing`,
        [r.row.post_url, r.accountId, r.row.confidence, r.row.venue_name, r.decision.resolvedBy]
      );
      written += rowCount ?? 0;
    }

    let leadsUpserted = 0;
    for (const l of leadRows) {
      await client.query(
        `insert into discovered_venue_leads
           (name_norm, name_display, posts, owners, location_claim, metro_yes, metro_no, metro_unknown, handle_guesses, sample_post_urls, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         on conflict (name_norm) do update set
           name_display = excluded.name_display,
           posts = excluded.posts,
           owners = excluded.owners,
           location_claim = excluded.location_claim,
           metro_yes = excluded.metro_yes,
           metro_no = excluded.metro_no,
           metro_unknown = excluded.metro_unknown,
           handle_guesses = excluded.handle_guesses,
           sample_post_urls = excluded.sample_post_urls,
           updated_at = now()`,
        [
          l.nameNorm,
          l.nameDisplay,
          l.posts,
          l.owners,
          l.locationClaim,
          l.metroYes,
          l.metroNo,
          l.metroUnknown,
          l.handleGuesses,
          l.samplePostUrls,
        ]
      );
      leadsUpserted++;
    }

    await client.query("commit");
    console.log(`\n[resolve-discovered-venues] APPLIED -- wrote ${written} extracted_venue_anchors rows, upserted ${leadsUpserted} discovered_venue_leads rows`);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
