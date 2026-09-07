/**
 * One-off, idempotent apply of the vendor-association schema addition
 * (pipeline/schema.sql, D046) directly to Supabase. Two new views, both
 * derived/read-only -- no table changes, no data written. Safe to re-run:
 * CREATE OR REPLACE VIEW.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyVendorAssociationSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view human_confirmed_post_vendor_association as
   with author as (
     select
       gs.post_url,
       coalesce(a1.id, a2.id) as author_account_id
     from golden_set gs
     left join staging.instagram_posts sp on sp.post_url = gs.post_url
     left join accounts a1 on lower(a1.username::text) = lower(sp.owner_username)
     left join posts p on p.url = gs.post_url
     left join accounts a2 on a2.id = p.owner_id
     where gs.expected_decision = 'INCLUDE'
   ),
   tagged as (
     select source_post_url as post_url, count(distinct account_id) as tagged_vendor_count
     from human_confirmed_post_vendor_evidence
     group by source_post_url
   )
   select
     au.post_url,
     au.author_account_id,
     exists (select 1 from vendors v where v.account_id = au.author_account_id) as author_is_vendor,
     coalesce(t.tagged_vendor_count, 0) as tagged_vendor_count,
     (exists (select 1 from vendors v where v.account_id = au.author_account_id)
        or coalesce(t.tagged_vendor_count, 0) > 0) as has_vendor_association,
     case
       when exists (select 1 from vendors v where v.account_id = au.author_account_id)
            and coalesce(t.tagged_vendor_count, 0) > 0 then 'BOTH'
       when exists (select 1 from vendors v where v.account_id = au.author_account_id) then 'AUTHOR_ONLY'
       when coalesce(t.tagged_vendor_count, 0) > 0 then 'TAGGED_ONLY'
       else 'NONE'
     end as vendor_association_type
   from author au
   left join tagged t on t.post_url = au.post_url;`,
  `create or replace view human_confirmed_vendor_page_content as
   select c.post_url, c.labeled_by, c.labeled_at, c.source_note,
          va.author_account_id, va.author_is_vendor,
          va.tagged_vendor_count, va.vendor_association_type
   from human_confirmed_chicago_wedding_content c
   join human_confirmed_post_vendor_association va on va.post_url = c.post_url
   where va.has_vendor_association;`,
  `comment on view human_confirmed_post_vendor_association is 'DERIVED: per-post vendor-association evidence (author-is-vendor OR tagged/credited vendor), independent and non-gating -- see D046 in docs/decisions.md';`,
  `comment on view human_confirmed_vendor_page_content is 'One downstream consumer''s stricter view (Layer 1 content that also has a vendor to attach it to) -- does not redefine Layer 1 itself';`,
];

async function main() {
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  console.log("[apply-schema] done");
  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
