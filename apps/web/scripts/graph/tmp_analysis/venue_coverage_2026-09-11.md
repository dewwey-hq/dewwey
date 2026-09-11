# Venue coverage report (2026-09-11)

Universe A ("listed"): `v_account_role.role = 'venue'` AND `account_locations.in_metro` --
identical predicate to `searchVendors` (lib/server/vendors.ts), what `/venues` actually shows.
Weddings per account = `count(*) from weddings where venue_id = account` (no alias-resolving --
the page doesn't either).

## Universe A summary

- Listed venues: **626**
- Total weddings (anchored to a listed venue): **5564**
- Buckets: 0=150  1-5=307  6-15=77  16-49=65  50+=27
- Median weddings/venue: **2**
- Top 50 share: 3243 / 5564 (58.3%)
- Top 100 share: 4323 / 5564 (77.7%)

## Hidden B -- venue-top, no account_locations row at all (268 accounts, 93 weddings)

Top 15 by weddings:
- bokachicago -- 3 weddings
- harrycarays -- 3 weddings
- allegrochicago -- 2 weddings
- marriottbonvoy -- 2 weddings
- avecchicago -- 1 weddings
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

## Hidden C -- venue-top, has a location row but in_metro=false (39 accounts, 45 weddings)

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

## Hidden E -- mis-anchored: venue_id account's top role is neither venue nor hotel (26 accounts, 41 weddings)

Includes accounts with no account_tags row at all (top role shown as "(none)").

Top 15 by weddings:
- ashyanabanquets -- top role: catering -- 4 weddings
- renchicagodowntown -- top role: accommodations -- 4 weddings
- ambassadorchicago -- top role: accommodations -- 3 weddings
- venuelogic -- top role: other -- 3 weddings
- lmcateringchi -- top role: catering -- 2 weddings
- eeeventco -- top role: other -- 2 weddings
- thelasallechicago -- top role: accommodations -- 2 weddings
- westinchicagorivernorth -- top role: accommodations -- 2 weddings
- therobeychicago -- top role: accommodations -- 2 weddings
- frostchicago -- top role: lighting_production -- 1 weddings
- revel_decor -- top role: florist -- 1 weddings
- art_imagination -- top role: event_design -- 1 weddings
- revelglobalevents -- top role: planner -- 1 weddings
- clementinechicago -- top role: planner -- 1 weddings
- entertaining_co -- top role: catering -- 1 weddings
