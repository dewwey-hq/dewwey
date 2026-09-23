-- live definitions before the P3 swap
 WITH latest AS (
         SELECT DISTINCT ON (stack_extraction_entries.post_url, stack_extraction_entries.line_no, stack_extraction_entries.handle) stack_extraction_entries.post_url AS source_post_url,
            stack_extraction_entries.line_no,
            stack_extraction_entries.handle,
            stack_extraction_entries.role,
            stack_extraction_entries.role_raw,
            stack_extraction_entries.source,
            stack_extraction_entries.stack_parser_version AS parser_version
           FROM stack_extraction_entries
          ORDER BY stack_extraction_entries.post_url, stack_extraction_entries.line_no, stack_extraction_entries.handle, stack_extraction_entries.extracted_at DESC
        ), universe AS (
         SELECT sp.post_url,
            sp.caption_raw,
            sp.post_timestamp,
            sp.location_tag,
            sp.owner_username
           FROM ( SELECT v_ig_posts.post_url,
                    v_ig_posts.shortcode,
                    v_ig_posts.caption_raw,
                    v_ig_posts.post_timestamp,
                    v_ig_posts.location_tag,
                    v_ig_posts.owner_username,
                    v_ig_posts.mentions,
                    v_ig_posts.hashtags,
                    v_ig_posts.post_type,
                    v_ig_posts.image_url,
                    v_ig_posts.likes_count,
                    v_ig_posts.vendor_id,
                    v_ig_posts.scraped_at,
                    v_ig_posts.post_id,
                    v_ig_posts.corpus_source
                   FROM v_ig_posts
                  WHERE v_ig_posts.corpus_source = 'staging'::text
                UNION ALL
                 SELECT v.post_url,
                    v.shortcode,
                    v.caption_raw,
                    v.post_timestamp,
                    v.location_tag,
                    v.owner_username,
                    v.mentions,
                    v.hashtags,
                    v.post_type,
                    v.image_url,
                    v.likes_count,
                    v.vendor_id,
                    v.scraped_at,
                    v.post_id,
                    v.corpus_source
                   FROM v_ig_posts v
                  WHERE v.corpus_source = 'public'::text AND (EXISTS ( SELECT 1
                           FROM post_observations o
                          WHERE o.post_id = v.post_id)) AND NOT (EXISTS ( SELECT 1
                           FROM staging.instagram_posts s2
                          WHERE (regexp_match(s2.post_url, '/p/([^/]+)'::text))[1] = v.shortcode))) sp
          WHERE NOT (EXISTS ( SELECT 1
                   FROM wedding_posts wp
                     JOIN posts p ON p.id = wp.post_id
                  WHERE p.shortcode = sp.shortcode)) AND NOT (EXISTS ( SELECT 1
                   FROM golden_set gs
                  WHERE gs.post_url = sp.post_url AND gs.expected_decision = 'EXCLUDE'::post_decision))
        ), credit_line_accounts AS (
         SELECT DISTINCT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, a.id) AS account_id,
            l.line_no,
            l.role_raw
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url AND l.role = 'venue'::text AND l.source = 'credit_line'::text
             JOIN accounts a ON lower(a.username::text) = l.handle
             LEFT JOIN account_aliases al ON al.alias_account_id = a.id
        ), credit_line_venue AS (
         SELECT DISTINCT ON (credit_line_accounts.source_post_url) credit_line_accounts.source_post_url,
            credit_line_accounts.account_id,
            credit_line_accounts.line_no,
            credit_line_accounts.role_raw
           FROM credit_line_accounts
          ORDER BY credit_line_accounts.source_post_url, (
                CASE
                    WHEN credit_line_accounts.role_raw ~* 'reception'::text THEN 0
                    WHEN credit_line_accounts.role_raw ~* 'venue'::text AND credit_line_accounts.role_raw !~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque'::text THEN 1
                    WHEN credit_line_accounts.role_raw ~* 'ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque'::text THEN 2
                    ELSE 3
                END), credit_line_accounts.line_no
        ), credit_line_conflict AS (
         SELECT credit_line_accounts.source_post_url
           FROM credit_line_accounts
          GROUP BY credit_line_accounts.source_post_url
         HAVING count(DISTINCT credit_line_accounts.account_id) > 1
        ), location_venue AS (
         SELECT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, ltm.venue_account_id) AS account_id
           FROM universe u_1
             JOIN location_tag_venue_map ltm ON ltm.location_tag = u_1.location_tag::text
             LEFT JOIN account_aliases al ON al.alias_account_id = ltm.venue_account_id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url))
        ), author_venue AS (
         SELECT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, va.id) AS account_id
           FROM universe u_1
             JOIN accounts va ON lower(va.username::text) = lower(u_1.owner_username)
             LEFT JOIN account_aliases al ON al.alias_account_id = va.id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM vendors v
                  WHERE v.account_id = va.id AND v.category IS NOT NULL AND v.category <> 'venue'::text)) AND ((EXISTS ( SELECT 1
                   FROM v_account_role r
                  WHERE r.account_id = va.id AND r.role = 'venue'::vendor_role)) OR (EXISTS ( SELECT 1
                   FROM vendors v
                  WHERE v.account_id = va.id AND v.category = 'venue'::text)))
        ), inline_venue AS (
         SELECT DISTINCT ON (u_1.post_url) u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, a.id) AS account_id,
            l.line_no,
            l.role_raw
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url AND l.role = 'venue'::text AND l.source = 'inline_at'::text
             JOIN accounts a ON lower(a.username::text) = l.handle
             LEFT JOIN account_aliases al ON al.alias_account_id = a.id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM author_venue av
                  WHERE av.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url))
          ORDER BY u_1.post_url, l.line_no
        ), hashtag_venue AS (
         SELECT DISTINCT ON (u_1.post_url) u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, a.id) AS account_id,
            l.line_no,
            l.role_raw
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url AND l.role = 'venue'::text AND l.source = 'venue_hashtag'::text
             JOIN accounts a ON lower(a.username::text) = l.handle
             LEFT JOIN account_aliases al ON al.alias_account_id = a.id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM author_venue av
                  WHERE av.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM inline_venue iv
                  WHERE iv.source_post_url = u_1.post_url))
          ORDER BY u_1.post_url, l.line_no
        ), extracted_venue AS (
         SELECT u_1.post_url AS source_post_url,
            COALESCE(al.canonical_account_id, eva.venue_account_id) AS account_id
           FROM universe u_1
             JOIN extracted_venue_anchors eva ON eva.post_url = u_1.post_url
             LEFT JOIN account_aliases al ON al.alias_account_id = eva.venue_account_id
          WHERE NOT (EXISTS ( SELECT 1
                   FROM credit_line_venue clv
                  WHERE clv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM author_venue av
                  WHERE av.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM location_venue lv
                  WHERE lv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM inline_venue iv
                  WHERE iv.source_post_url = u_1.post_url)) AND NOT (EXISTS ( SELECT 1
                   FROM hashtag_venue hv
                  WHERE hv.source_post_url = u_1.post_url))
        ), venue_anchor AS (
         SELECT clv.source_post_url,
            clv.account_id,
            'venue'::text AS role,
            clv.role_raw,
            clv.line_no,
            'credit_line'::text AS venue_anchor_source,
            (EXISTS ( SELECT 1
                   FROM credit_line_conflict cc
                  WHERE cc.source_post_url = clv.source_post_url)) AS venue_anchor_conflict
           FROM credit_line_venue clv
        UNION ALL
         SELECT author_venue.source_post_url,
            author_venue.account_id,
            'venue'::text,
            NULL::text,
            NULL::integer,
            'author'::text,
            false
           FROM author_venue
        UNION ALL
         SELECT location_venue.source_post_url,
            location_venue.account_id,
            'venue'::text,
            NULL::text,
            NULL::integer,
            'location_tag'::text,
            false
           FROM location_venue
        UNION ALL
         SELECT inline_venue.source_post_url,
            inline_venue.account_id,
            'venue'::text,
            inline_venue.role_raw,
            inline_venue.line_no,
            'inline_at'::text,
            false
           FROM inline_venue
        UNION ALL
         SELECT hashtag_venue.source_post_url,
            hashtag_venue.account_id,
            'venue'::text,
            hashtag_venue.role_raw,
            hashtag_venue.line_no,
            'venue_hashtag'::text,
            false
           FROM hashtag_venue
        UNION ALL
         SELECT extracted_venue.source_post_url,
            extracted_venue.account_id,
            'venue'::text,
            NULL::text,
            NULL::integer,
            'extracted'::text,
            false
           FROM extracted_venue
        ), non_venue_evidence AS (
         SELECT u_1.post_url AS source_post_url,
            a.id AS account_id,
            l.role,
            l.role_raw,
            l.line_no,
            NULL::text AS venue_anchor_source,
            NULL::boolean AS venue_anchor_conflict
           FROM universe u_1
             JOIN latest l ON l.source_post_url = u_1.post_url
             JOIN accounts a ON lower(a.username::text) = l.handle
          WHERE l.role <> ALL (ARRAY['other'::text, 'venue'::text])
        ), combined AS (
         SELECT venue_anchor.source_post_url,
            venue_anchor.account_id,
            venue_anchor.role,
            venue_anchor.role_raw,
            venue_anchor.line_no,
            venue_anchor.venue_anchor_source,
            venue_anchor.venue_anchor_conflict
           FROM venue_anchor
        UNION ALL
         SELECT non_venue_evidence.source_post_url,
            non_venue_evidence.account_id,
            non_venue_evidence.role,
            non_venue_evidence.role_raw,
            non_venue_evidence.line_no,
            non_venue_evidence.venue_anchor_source,
            non_venue_evidence.venue_anchor_conflict
           FROM non_venue_evidence
        ), couple_extract AS (
         SELECT x.post_url,
            x.raw_match,
            x.raw_match IS NOT NULL AND x.raw_match !~* '\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\y'::text AS couple_signal_ok
           FROM ( SELECT u_1.post_url,
                    "substring"(u_1.caption_raw, '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)'::text) AS raw_match
                   FROM universe u_1) x
        )
 SELECT c.source_post_url,
    c.account_id,
    c.role,
    c.role_raw,
    c.line_no,
    c.venue_anchor_source,
    c.venue_anchor_conflict,
    COALESCE(ce.couple_signal_ok, false) AS has_couple_signal,
    COALESCE(u.caption_raw ~* '\y(wedding|bride|groom|reception|ceremony|newlywed|married|mr\.? *& *mrs|i do|tied the knot|big day|vows?)\y'::text, false) AS has_wedding_keyword,
    u.post_timestamp::date AS event_date,
        CASE
            WHEN ce.couple_signal_ok THEN lower(ce.raw_match)
            ELSE NULL::text
        END AS couple_guess,
    COALESCE(u.caption_raw ~* '\y(mitzvah|quincea|sweet\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\y'::text, false) AS has_non_wedding_event_keyword
   FROM combined c
     JOIN universe u ON u.post_url = c.source_post_url
     JOIN couple_extract ce ON ce.post_url = c.source_post_url;

CREATE OR REPLACE FUNCTION public.structural_post_vendor_evidence_for_batch(p_batch text)
 RETURNS SETOF structural_post_vendor_evidence
 LANGUAGE sql
 STABLE
AS $function$
   with latest as (
     select distinct on (post_url, line_no, handle)
       post_url as source_post_url, line_no, handle, role, role_raw, source, stack_parser_version as parser_version
     from stack_extraction_entries
     order by post_url, line_no, handle, extracted_at desc
   ),
   universe as (
     -- D061 (2026-09-19): re-sourced from the pure v_ig_posts view (owned by the acquisition
     -- schema script) instead of staging.instagram_posts directly, so tagged-feed acquisition
     -- posts join the same structural chain staging always has. Precedence by shortcode: staging
     -- always wins; a public (venue_tagged/own_profile) row only enters the universe once it was
     -- scraped after the first acquisition run ever (decision 5 -- with ops.crawl_runs empty,
     -- NOTHING public enters, so Ben's pre-existing ~6,370 crawl posts stay out in month 1).
     select sp.post_url, sp.caption_raw, sp.post_timestamp, sp.location_tag, sp.owner_username
     from (

       -- BATCH-SCOPED variant (structural_post_vendor_evidence_for_batch): the full source, then
       -- only the tick's first-observed posts. A join, not an OR on a session setting -- an OR
       -- cut the unscoped estimate 40x and re-created the nested-loop plan (D061 pilot).
       select * from (

       -- Precedence without a distinct-on: staging rows always; a public row only when no staging
       -- row shares its shortcode. Same rule either way, but the planner keeps table statistics
       -- (a Unique over the union estimated ~200 rows and turned the join with the 90k-row
       -- latest CTE into a nested loop -- the full view went from ~2 min to >15 min, D061 pilot).
       -- Two UNION ALL branches rather than one OR: an OR over the union view cut the planner's
       -- universe estimate 20x (2.3k for ~46k rows) and produced a 9.7-billion-row merge-join plan.
       select * from v_ig_posts where corpus_source = 'staging'
       union all
       select * from v_ig_posts v
       where v.corpus_source = 'public'
         -- D061 (2026-09-20): a public row enters iff the acquisition loop has REGISTERED it -- an
         -- ops.post_observations row (written by ingest, or by a provenance-logged legacy batch such
         -- as legacy-ben-crawl1-zero-venues). Replaces the scrape-date gate: same effect for new
         -- acquisitions, and lets Ben's pre-existing crawl posts in one explicit, revertable batch at
         -- a time (D031 attach risk is managed per batch, e.g. zero-wedding seed venues only).
         and exists (select 1 from ops.post_observations o where o.post_id = v.post_id)
         and not exists (select 1 from staging.instagram_posts s2
                         where (regexp_match(s2.post_url, '/p/([^/]+)'))[1] = v.shortcode)

       ) full_source
       where shortcode in (
         select p.shortcode from ops.post_observations o
         join ops.crawl_runs r on r.id = o.run_id
         join posts p on p.id = o.post_id
         where r.batch_id = p_batch and o.is_first)
     ) sp
     where not exists (
         select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.shortcode = sp.shortcode
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
       (raw_match is not null and raw_match !~* '\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\y') as couple_signal_ok
     from (
       select
         u.post_url,
         substring(u.caption_raw from '(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)') as raw_match
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
     coalesce(u.caption_raw ~* '\y(wedding|bride|groom|reception|ceremony|newlywed|married|mr\.? *& *mrs|i do|tied the knot|big day|vows?)\y', false) as has_wedding_keyword,
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
     coalesce(u.caption_raw ~* '\y(mitzvah|quincea|sweet\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\y', false) as has_non_wedding_event_keyword
   from combined c
   join universe u on u.post_url = c.source_post_url
   join couple_extract ce on ce.post_url = c.source_post_url
   $function$

