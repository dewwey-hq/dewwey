/**
 * One-off, idempotent apply of the structural_post_vendor_evidence schema addition
 * (pipeline/schema.sql, D055 "squeeze the 47k" Phase 0 step 5) directly to Supabase: one new
 * view (derived/read-only, safe to re-run via CREATE OR REPLACE) plus two nullable columns on
 * jeremy_wedding_candidates (venue_anchor_source, venue_anchor_conflict) that
 * runJeremyWeddingClustering.ts's --evidence-source structural branch writes at upsert time --
 * `add column if not exists` makes a rerun a no-op, same idempotency bar as every other apply
 * script in this directory.
 *
 * 2026-09-09 (venue-discovery reader downstream): the view gained a 6th CTE / 5th
 * venue_anchor_source ('extracted', ranked last), fed by extracted_venue_anchors
 * (resolveDiscoveredVenues.ts). Run applyExtractedVenueAnchorSchema.ts --apply FIRST -- this
 * view's extracted_venue CTE joins that table, so CREATE OR REPLACE fails outright if it
 * doesn't exist yet.
 *
 * Unlike its siblings (applyVenueInlineMentionSchema.ts etc.), this one supports --dry-run --
 * D055 Phase 0 is explicitly schema-design-and-sizing only, no live writes yet, so this script
 * defaults to dry-run behavior (prints the SQL, executes nothing) unless --apply is passed.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyStructuralEvidenceSchema.ts              # same as --dry-run
 *   bun run scripts/graph/applyStructuralEvidenceSchema.ts --dry-run    # prints SQL, no write
 *   bun run scripts/graph/applyStructuralEvidenceSchema.ts --apply      # actually runs it
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view structural_post_vendor_evidence as
   with latest as (
     select distinct on (post_url, line_no, handle)
       post_url as source_post_url, line_no, handle, role, role_raw, source, stack_parser_version as parser_version
     from stack_extraction_entries
     order by post_url, line_no, handle, extracted_at desc
   ),
   universe as (
     select sp.post_url, sp.caption_raw, sp.post_timestamp, sp.location_tag, sp.owner_username
     from staging.instagram_posts sp
     where not exists (
         select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = sp.post_url
       )
       and not exists (
         select 1 from golden_set gs where gs.post_url = sp.post_url and gs.expected_decision = 'EXCLUDE'
       )
   ),
   credit_line_accounts as (
     select distinct
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no,
       l.role_raw
     from universe u
     -- D055 parser v8: only LABELED credit lines anchor at this (highest) priority; the v8
     -- inline_at / venue_hashtag credits rank below author and location tag (see below).
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'credit_line'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
   ),
   -- D050/D055: when a post credits both a ceremony site and a reception venue, the RECEPTION
   -- venue is the wedding's anchor (the ceremony site still gets a venue-role credit downstream,
   -- see createWeddingsFromJeremyEvidence.ts's --from-confirmed-candidates path) -- matches the
   -- 39 structural candidates the user re-anchored by hand and D050's own reception-tiebreak
   -- precedent (weddings 899, 5513). Priority: reception (0) > plain "venue"-labeled, not
   -- ceremony-ish (1) > ceremony/church/parish/etc (2) > anything else (3), then lowest line_no
   -- within a tier. A label like "Ceremony Venue" matches both the venue and ceremony patterns --
   -- the ceremony/church check deliberately requires excluding it from tier 1 so it lands in
   -- tier 2, not 1.
   credit_line_venue as (
     select distinct on (source_post_url)
       source_post_url, account_id, line_no, role_raw
     from credit_line_accounts
     order by source_post_url,
       case
         when role_raw ~* 'reception' then 0
         when role_raw ~* 'venue' and role_raw !~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 1
         when role_raw ~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque' then 2
         else 3
       end,
       line_no asc
   ),
   credit_line_conflict as (
     select source_post_url
     from credit_line_accounts
     group by source_post_url
     having count(distinct account_id) > 1
   ),
   location_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, ltm.venue_account_id) as account_id
     from universe u
     join location_tag_venue_map ltm on ltm.location_tag = u.location_tag
     left join account_aliases al on al.alias_account_id = ltm.venue_account_id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
   ),
   author_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, va.id) as account_id
     from universe u
     join accounts va on lower(va.username::text) = lower(u.owner_username)
     left join account_aliases al on al.alias_account_id = va.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       -- D055: author anchoring ranks BELOW the location tag and is refused when the account's
       -- Places row says it is some other kind of vendor (wsphotography.us x7).
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from vendors v where v.account_id = va.id and v.category is not null and v.category <> 'venue')
       and (
         exists (select 1 from v_account_role r where r.account_id = va.id and r.role = 'venue')
         or exists (select 1 from vendors v where v.account_id = va.id and v.category = 'venue')
       )
   ),
   inline_venue as (
     select distinct on (u.post_url)
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no, l.role_raw
     from universe u
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'inline_at'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
     order by u.post_url, l.line_no asc
   ),
   hashtag_venue as (
     select distinct on (u.post_url)
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, a.id) as account_id,
       l.line_no, l.role_raw
     from universe u
     join latest l on l.source_post_url = u.post_url and l.role = 'venue' and l.source = 'venue_hashtag'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
     order by u.post_url, l.line_no asc
   ),
   -- D055 venue-discovery reader downstream (2026-09-09), 6th and LAST priority: the Haiku
   -- pool-b reader's own venue attribution (extracted_venue_anchors, resolveDiscoveredVenues.ts),
   -- for posts none of the five patterns above anchored at all -- a model's read of free text
   -- (94% venue-attribution accuracy on documented posts), good enough to be the anchor of last
   -- resort but not to outrank any real structural match.
   extracted_venue as (
     select
       u.post_url as source_post_url,
       coalesce(al.canonical_account_id, eva.venue_account_id) as account_id
     from universe u
     join extracted_venue_anchors eva on eva.post_url = u.post_url
     left join account_aliases al on al.alias_account_id = eva.venue_account_id
     where not exists (select 1 from credit_line_venue clv where clv.source_post_url = u.post_url)
       and not exists (select 1 from author_venue av where av.source_post_url = u.post_url)
       and not exists (select 1 from location_venue lv where lv.source_post_url = u.post_url)
       and not exists (select 1 from inline_venue iv where iv.source_post_url = u.post_url)
       and not exists (select 1 from hashtag_venue hv where hv.source_post_url = u.post_url)
   ),
   venue_anchor as (
     select
       source_post_url, account_id, 'venue'::text as role, role_raw, line_no,
       'credit_line'::text as venue_anchor_source,
       exists (select 1 from credit_line_conflict cc where cc.source_post_url = clv.source_post_url) as venue_anchor_conflict
     from credit_line_venue clv
     union all
     select source_post_url, account_id, 'venue', null, null, 'author', false
     from author_venue
     union all
     select source_post_url, account_id, 'venue', null, null, 'location_tag', false
     from location_venue
     union all
     select source_post_url, account_id, 'venue', role_raw, line_no, 'inline_at', false
     from inline_venue
     union all
     select source_post_url, account_id, 'venue', role_raw, line_no, 'venue_hashtag', false
     from hashtag_venue
     union all
     select source_post_url, account_id, 'venue', null, null, 'extracted', false
     from extracted_venue
   ),
   non_venue_evidence as (
     select
       u.post_url as source_post_url,
       a.id as account_id,
       l.role,
       l.role_raw,
       l.line_no,
       null::text as venue_anchor_source,
       null::boolean as venue_anchor_conflict
     from universe u
     join latest l on l.source_post_url = u.post_url
     join accounts a on lower(a.username::text) = l.handle
     where l.role not in ('other', 'venue')
   ),
   combined as (
     select * from venue_anchor
     union all
     select * from non_venue_evidence
   ),
   -- D055 precision fix (2026-09-08): the couple-name alternative of the regex below
   -- ([A-Z][a-z]+ *(&|+|and) *[A-Z][a-z]+) also matches two business words back-to-back --
   -- "Lido Banquets & Events" hand-read as a false couple signal. Extract the match ONCE here
   -- (whichever alternative fired) and veto it -- for has_couple_signal AND couple_guess alike --
   -- when it contains a business word. couple_guess is the same extraction, lowercased, exposed
   -- so runJeremyWeddingClustering.ts's structural branch can veto a Jaccard/date merge across
   -- two posts that name two different couples, without re-parsing captions itself.
   couple_extract as (
     select
       post_url,
       raw_match,
       (raw_match is not null and raw_match !~* '\\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\\y') as couple_signal_ok
     from (
       select
         u.post_url,
         substring(u.caption_raw from '(Mr\\.? *& *Mrs\\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\\+|and) *[A-Z][a-z]+)') as raw_match
       from universe u
     ) x
   )
   select
     c.source_post_url,
     c.account_id,
     c.role,
     c.role_raw,
     c.line_no,
     c.venue_anchor_source,
     c.venue_anchor_conflict,
     coalesce(ce.couple_signal_ok, false) as has_couple_signal,
     coalesce(u.caption_raw ~* '\\y(wedding|bride|groom|reception|ceremony|newlywed|married|mr\\.? *& *mrs|i do|tied the knot|big day|vows?)\\y', false) as has_wedding_keyword,
     u.post_timestamp::date as event_date,
     -- Appended last, not next to has_couple_signal: create or replace view only allows new
     -- columns at the end of the select list (errors otherwise, verified against the
     -- already-applied structural-v1 view: "cannot change name of view column").
     case when ce.couple_signal_ok then lower(ce.raw_match) else null end as couple_guess,
     -- D055 addendum (2026-09-08, user mid-review: "consider filtering out the posts that say
     -- bar or bat mitzvah. that's almost always not a wedding"): flags a post that names a
     -- non-wedding event outright. Sized in the current queue at 43 posts naming one of these
     -- with NO wedding language at all. Appended last for the same create-or-replace-view
     -- reason as couple_guess above -- do not move it earlier in the list.
     coalesce(u.caption_raw ~* '\\y(mitzvah|quincea|sweet\\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\\y', false) as has_non_wedding_event_keyword
   from combined c
   join universe u on u.post_url = c.source_post_url
   join couple_extract ce on ce.post_url = c.source_post_url;`,
  `comment on view structural_post_vendor_evidence is 'DERIVED (D055 "squeeze the 47k" Phase 0, precision fixes for structural-v2 2026-09-08; extracted_venue_anchors 5th anchor source added 2026-09-09): venue-anchors a post from credit-line, author-is-known-venue, IG location-tag, inline @mention, venue-branded hashtag, or (lowest priority, last resort) the Haiku pool-b reader''s own extraction (priority order, alias-resolved, conflict-flagged), plus the post''s own non-venue stack credits. has_couple_signal/couple_guess veto business-word false matches (e.g. "Lido Banquets & Events"). Eligibility (venue anchor + supporting evidence, anchor-source-dependent) and the couple-guess merge veto are enforced in runJeremyWeddingClustering.ts --evidence-source structural, not here. See docs/decisions.md D055.';`,
  `alter table jeremy_wedding_candidates add column if not exists venue_anchor_source text;`,
  `alter table jeremy_wedding_candidates add column if not exists venue_anchor_conflict boolean;`,
];

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  if (!apply) {
    console.log(`[apply-structural-evidence] DRY RUN (pass --apply to execute) -- ${STATEMENTS.length} statement(s):\n`);
    for (const [i, sql] of STATEMENTS.entries()) {
      console.log(`-- statement ${i + 1}/${STATEMENTS.length}\n${sql}\n`);
    }
    await closePool();
    return;
  }

  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-structural-evidence] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  const { rows } = await pool.query<{ n: string; posts: string }>(
    `select count(*) as n, count(distinct source_post_url) as posts from structural_post_vendor_evidence`
  );
  console.log(`[apply-structural-evidence] structural_post_vendor_evidence: ${rows[0].n} evidence rows across ${rows[0].posts} posts`);
  console.log("[apply-structural-evidence] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
