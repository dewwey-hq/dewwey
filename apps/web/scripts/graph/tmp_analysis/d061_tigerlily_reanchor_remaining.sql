-- D061 (2026-09-20): re-anchor the 34 weddings still on @tigerlilyevents (1437) after
-- d061-tigerlily-recredit-1. Fact-checked against tlilyevents.com/event-spaces: all 15 spaces Tigerlily
-- operates are on Lincoln Park Zoo grounds, so every Tigerlily wedding is physically at the zoo. Rule
-- (user's call, 2026-09-20): Cafe Brauer (18759) when any attached caption names it (brauer|loggia),
-- else Lincoln Park Zoo (560). Provenance: one vendor_role_migrations row per wedding (table 'weddings',
-- old/new venue_id) and one per venue credit added, batch_id d061-tigerlily-reanchor-1 -- same shape
-- as reanchorWeddings.ts (D056). Revert = swap old/new from those rows.
-- Run: psql "$DATABASE_URL" -X -f d061_tigerlily_reanchor_remaining.sql   (expect 34 + <=34 rows)
begin;
create temp table t_reanchor as
select w.id wedding_id, 1437::bigint old_venue_id,
       case when bool_or(p.caption ~* 'brauer|loggia') then 18759::bigint else 560::bigint end new_venue_id
from weddings w left join wedding_posts wp on wp.wedding_id=w.id left join posts p on p.id=wp.post_id
where w.venue_id = 1437 group by w.id;

insert into vendor_role_migrations (batch_id, table_name, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id, note)
select 'd061-tigerlily-reanchor-1', 'weddings', wedding_id, null, null, null, old_venue_id, new_venue_id,
       'reanchor: Tigerlily Events operates 15 spaces, all at Lincoln Park Zoo (tlilyevents.com/event-spaces); rule = Cafe Brauer if caption names it, else the zoo'
from t_reanchor;

update weddings w set venue_id = r.new_venue_id from t_reanchor r where r.wedding_id = w.id;

insert into vendor_role_migrations (batch_id, table_name, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id, note)
select 'd061-tigerlily-reanchor-1', 'wedding_vendors', r.wedding_id, r.new_venue_id, null, 'venue', null, null,
       'reanchor: missing venue credit for anchored venue'
from t_reanchor r
where not exists (select 1 from wedding_vendors wv where wv.wedding_id = r.wedding_id and wv.account_id = r.new_venue_id and wv.role = 'venue');

insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
select r.wedding_id, r.new_venue_id, 'venue', 1 from t_reanchor r
on conflict (wedding_id, account_id, role) do nothing;

select new_venue_id, count(*) from t_reanchor group by 1;
drop table t_reanchor;
commit;
