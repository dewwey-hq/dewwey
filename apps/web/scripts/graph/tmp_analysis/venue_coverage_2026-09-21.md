# Venue coverage report (2026-09-21)

Universe A ("listed"): `v_account_role.role = 'venue'` AND `account_locations.in_metro` --
identical predicate to `searchVendors` (lib/server/vendors.ts), what `/venues` actually shows.
Weddings per account = `count(*) from weddings where venue_id = account` (no alias-resolving --
the page doesn't either).

## Universe A summary

- Listed venues: **442**
- Total weddings (anchored to a listed venue): **7271**
- Buckets: 0=0  1-5=217  6-15=106  16-49=77  50+=42
- Median weddings/venue: **6**
- Top 50 share: 3923 / 7271 (54.0%)
- Top 100 share: 5407 / 7271 (74.4%)

## Hidden B -- venue-top, no account_locations row at all (298 accounts, 78 weddings)

Top 15 by weddings:
- marriottbonvoy -- 2 weddings
- dream_creeks -- 1 weddings
- xocohousegallery -- 1 weddings
- eventswcoe -- 1 weddings
- thursdaytherapychi -- 1 weddings
- humbledhospitality -- 1 weddings
- elgrancaribe -- 1 weddings
- pepesoffice -- 1 weddings
- subtle.haus -- 1 weddings
- sofarchicago -- 1 weddings
- churchclubchicago -- 1 weddings
- whitehawkcc -- 1 weddings
- stregishotels -- 1 weddings
- kohlerw -- 1 weddings
- contidisanbonifacio -- 1 weddings

## Hidden C -- venue-top, has a location row but in_metro=false (49 accounts, 52 weddings)

Top 15 by weddings:
- kohlerwi -- 3 weddings
- grand_geneva -- 3 weddings
- trumpturnberryscotland -- 3 weddings
- stjames1868 -- 3 weddings
- thevillamke -- 2 weddings
- venue3two -- 2 weddings
- castello_di_petrata -- 2 weddings
- bevhillshotel -- 2 weddings
- the_odyssey_events -- 2 weddings
- villagesuitesbayharbor -- 2 weddings
- stregiskanairesort -- 2 weddings
- renplanowest -- 2 weddings
- psbrewingco -- 2 weddings
- ndbasilica -- 2 weddings
- prairiestreetevents -- 2 weddings

## Hidden D -- top role is hotel, but is venue_id of >=1 wedding (1 accounts, 3 weddings)

Product question: hotels don't currently appear under /venues' category=venue filter.

Top 15 by weddings:
- magmilemarriott -- 3 weddings

## Hidden E -- mis-anchored: venue_id account's top role is neither venue nor hotel (21 accounts, 49 weddings)

Includes accounts with no account_tags row at all (top role shown as "(none)").

Top 15 by weddings:
- tigerlilyevents -- top role: other -- 19 weddings
- ashyanabanquets -- top role: catering -- 4 weddings
- venuelogic -- top role: bar_service -- 4 weddings
- art_imagination -- top role: event_design -- 2 weddings
- thelasallechicago -- top role: accommodations -- 2 weddings
- eeeventco -- top role: other -- 2 weddings
- westinchicagorivernorth -- top role: accommodations -- 2 weddings
- frostchicago -- top role: lighting_production -- 1 weddings
- revelglobalevents -- top role: planner -- 1 weddings
- clementinechicago -- top role: planner -- 1 weddings
- lulacafeevents -- top role: catering -- 1 weddings
- _bcollective -- top role: florist -- 1 weddings
- wsphotography.us -- top role: photographer -- 1 weddings
- averyhouse -- top role: photographer -- 1 weddings
- blueplatechicago -- top role: catering -- 1 weddings
