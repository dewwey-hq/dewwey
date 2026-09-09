-- D055 batch 3: 8 created weddings had zero wedding_posts because their (THIS_VENUE) post already
-- existed in `posts` from Ben's venue_tagged crawl (never linked to any wedding) -- the creation
-- script's `on conflict (shortcode) do nothing` returned no row and skipped the link. Link them.
begin;
with orphan as (
  select jc.wedding_id, jc.candidate_id from jeremy_weddings_created jc
  where jc.batch_id='d055-structural-v2-batch3'
    and not exists (select 1 from wedding_posts w2 where w2.wedding_id=jc.wedding_id)
), fix as (
  select o.wedding_id, p.id as post_id
  from orphan o
  join post_venue_verdicts_current v on v.candidate_id=o.candidate_id and v.verdict in ('THIS_VENUE','OTHER_VENUE')
  join posts p on p.shortcode = split_part(v.post_url,'/',5)
  where not exists (select 1 from wedding_posts wp where wp.post_id=p.id)
)
insert into wedding_posts (wedding_id, post_id) select wedding_id, post_id from fix on conflict (post_id) do nothing;
select count(*) as still_orphaned from jeremy_weddings_created jc where jc.batch_id='d055-structural-v2-batch3' and not exists (select 1 from wedding_posts w2 where w2.wedding_id=jc.wedding_id);
select count(*) as wedding_posts_total from wedding_posts;
commit;
