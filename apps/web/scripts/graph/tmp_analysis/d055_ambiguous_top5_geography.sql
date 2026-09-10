-- D055 Phase-1 re-plan step 4: the only ambiguous-geography venues with >=5 queued posts. All five are
-- outside the Chicago metro (their own posts' location tags + WebSearch for audubon_weddings).
-- Writes account_locations (in_metro=false, source manual) and demotes their structural-v2 candidates
-- to CHICAGO_NOT_CONFIRMED so they leave the human queue (mark, never delete).
begin;
drop table if exists geo;
create temp table geo(username text, note text);
insert into geo values
('audubon_weddings','D055 ambiguous-top5 pass: Audubon Nature Institute venues, New Orleans LA (WebSearch: audubonnatureinstitute.org/weddings) -- not metro'),
('venueatmontana45','D055 ambiguous-top5 pass: The Venue at Montana 45, Bigfork MT (own posts'' location tag) -- not metro'),
('longuevuehg','D055 ambiguous-top5 pass: Longue Vue House and Gardens, New Orleans LA (own posts'' location tag) -- not metro'),
('chateaustjean','D055 ambiguous-top5 pass: Chateau St Jean Winery, Kenwood/Sonoma CA (own posts'' location tag) -- not metro'),
('klehm_arboretum_botanical_gard','D055 ambiguous-top5 pass: Klehm Arboretum & Botanic Garden, Rockford IL (own posts'' location tag) -- Rockford is not metro per standing policy');
insert into account_locations (account_id, address, source, in_metro, verified_at)
select a.id, g.note, 'manual', false, now() from geo g join accounts a on a.username = g.username::citext
on conflict (account_id) do update set address = excluded.address, source = 'manual', in_metro = false, verified_at = now();
update jeremy_wedding_candidates c set chicago_status = 'CHICAGO_NOT_CONFIRMED', updated_at = now()
from geo g join accounts a on a.username = g.username::citext
where c.venue_account_id = a.id and c.clustering_version = 'structural-v2' and c.chicago_status = 'CHICAGO_AMBIGUOUS';
select 'rows' as k, count(*) from account_locations al join accounts a on a.id=al.account_id join geo g on a.username=g.username::citext;
select c.chicago_status, count(*) from jeremy_wedding_candidates c join accounts a on a.id=c.venue_account_id join geo g on a.username=g.username::citext group by 1;
commit;
