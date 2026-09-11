-- D055 count honestly (2026-09-10): two canonical venue accounts carried wrong google_maps
-- account_locations rows from the 2026-08-20 bridge (a Miami and a New York match), which hid
-- 60 remapped weddings from /venues. Web-verified 2026-09-10:
--   post433chicago = The Old Post Office, 433 W Van Buren St, Chicago IL 60607
--     (caratsandcake.com, partyslate.com, effortless-events.com)
--   thearmourhousemansion = The Armour House at Lake Forest Academy, 1500 W Kennedy Rd,
--     Lake Forest IL 60045 (yelp.com, theknot.com, wedding-spot.com)
-- Coordinates are the street-address centroids (approx., 4 dp). Replayable; idempotent.
-- Run from apps/web:
--   psql "$DATABASE_URL" -f scripts/graph/tmp_analysis/d055_fix_mislocated_canonical_venues.sql
begin;
update account_locations al set
  address = '433 W Van Buren St, Chicago, IL 60607', city = 'Chicago', region = 'Illinois',
  lat = 41.8757, lng = -87.6392, in_metro = true, source = 'websearch', verified_at = now()
from accounts a where a.id = al.account_id and a.username = 'post433chicago';
update account_locations al set
  address = '1500 W Kennedy Rd, Lake Forest, IL 60045', city = 'Lake Forest', region = 'Illinois',
  lat = 42.2410, lng = -87.8887, in_metro = true, source = 'websearch', verified_at = now()
from accounts a where a.id = al.account_id and a.username = 'thearmourhousemansion';
commit;
