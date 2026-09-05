/**
 * Read-only sizing/matching script for the venue-less Jeremy candidates mission
 * (docs/engineering/graph-strengthening/venueless-candidates.md). No writes.
 *
 * For the 369 `jeremy_wedding_candidates` with `venue_account_id IS NULL`, attempts to
 * find a confident venue anchor via Instagram `location_tag` (an independent signal from
 * caption parsing — D030 confirmed these candidates have zero role='venue' extractions
 * even in raw stack_extraction_entries).
 *
 * Confidence bar (deliberately conservative — a venue-anchor match is more load-bearing
 * than a role credit, and this corpus has a proven false-merge risk, D030's "magnet"
 * pattern):
 * - Excludes candidates whose posts disagree on location_tag (conflicting evidence).
 * - Excludes generic city/region-level tags ("Chicago, Illinois", "Private Location").
 * - Matches location_tag exactly (case-insensitive) against `vendors.name` OR
 *   `accounts.full_name` — union, deduped to distinct matched account_ids.
 * - Requires the matched account to already carry a `venue` role in `account_tags`
 *   (not just any name match) — guards against the real risk found by hand in the
 *   baseline sample: a vendor's own business location tagged (e.g. a makeup studio),
 *   not the actual wedding venue.
 * - Flags (does not resolve) any candidate matching more than one distinct venue account.
 *
 * Usage (from apps/web): bun run scripts/graph/matchVenuelessLocationTags.ts
 */
import { getPool, closePool } from "../classify/db";

const GENERIC_PLACEHOLDER = /^[A-Za-z ]+,\s*(Illinois|IL)$/i;

async function main() {
  const pool = getPool();

  const { rows: tagged } = await pool.query<{
    candidate_id: number;
    location_tags: string[];
  }>(
    `select cp.candidate_id::int,
            array_agg(distinct ip.location_tag) as location_tags
     from jeremy_wedding_candidate_posts cp
     join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.venue_account_id is null
     join staging.instagram_posts ip on ip.post_url = cp.source_post_url
     where ip.location_tag is not null and ip.location_tag <> ''
     group by cp.candidate_id`
  );

  let conflicting = 0;
  let generic = 0;
  let noMatch = 0;
  let ambiguous = 0;
  let matchedNotVenueTagged = 0;
  let confident = 0;
  const confidentResults: { candidateId: number; tag: string; accountId: number; username: string }[] = [];
  const ambiguousResults: { candidateId: number; tag: string; accountIds: number[] }[] = [];

  for (const row of tagged) {
    if (row.location_tags.length > 1) {
      conflicting++;
      continue;
    }
    const tag = row.location_tags[0];
    if (GENERIC_PLACEHOLDER.test(tag.trim()) || tag.trim().toLowerCase() === "private location") {
      generic++;
      continue;
    }

    const { rows: matches } = await pool.query<{ account_id: number; username: string; has_venue_role: boolean }>(
      `select distinct a.id as account_id, a.username::text as username,
              exists(select 1 from account_tags at2 where at2.account_id = a.id and at2.role = 'venue') as has_venue_role
       from accounts a
       where a.id in (
         select ve.account_id from vendors ve where lower(ve.name) = lower($1) and ve.account_id is not null
         union
         select ac.id from accounts ac where lower(ac.full_name) = lower($1)
       )`,
      [tag]
    );

    if (matches.length === 0) {
      noMatch++;
      continue;
    }
    const venueMatches = matches.filter((m) => m.has_venue_role);
    if (venueMatches.length === 0) {
      matchedNotVenueTagged++;
      continue;
    }
    const distinctAccountIds = [...new Set(venueMatches.map((m) => m.account_id))];
    if (distinctAccountIds.length > 1) {
      ambiguous++;
      ambiguousResults.push({ candidateId: row.candidate_id, tag, accountIds: distinctAccountIds });
      continue;
    }
    confident++;
    confidentResults.push({
      candidateId: row.candidate_id,
      tag,
      accountId: venueMatches[0].account_id,
      username: venueMatches[0].username,
    });
  }

  console.log(`[match-venueless] total candidates with a location_tag: ${tagged.length}`);
  console.log(`[match-venueless] conflicting (multiple distinct tags): ${conflicting}`);
  console.log(`[match-venueless] generic placeholder (city/region-level): ${generic}`);
  console.log(`[match-venueless] no name match at all: ${noMatch}`);
  console.log(`[match-venueless] matched a name but account has no venue role: ${matchedNotVenueTagged}`);
  console.log(`[match-venueless] ambiguous (2+ distinct venue accounts matched): ${ambiguous}`);
  console.log(`[match-venueless] CONFIDENT single-venue-account matches: ${confident}`);

  console.log(`\n[match-venueless] confident matches:`);
  for (const r of confidentResults) {
    console.log(`  candidate=${r.candidateId} tag="${r.tag}" -> @${r.username} (account ${r.accountId})`);
  }
  if (ambiguousResults.length > 0) {
    console.log(`\n[match-venueless] ambiguous matches (not resolved):`);
    for (const r of ambiguousResults) {
      console.log(`  candidate=${r.candidateId} tag="${r.tag}" -> accounts [${r.accountIds.join(", ")}]`);
    }
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
