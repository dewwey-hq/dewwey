# Venue coverage report (2026-09-10)

Universe A ("listed"): `v_account_role.role = 'venue'` AND `account_locations.in_metro` --
identical predicate to `searchVendors` (lib/server/vendors.ts), what `/venues` actually shows.
Weddings per account = `count(*) from weddings where venue_id = account` (no alias-resolving --
the page doesn't either).

## Universe A summary

- Listed venues: **612**
- Total weddings (anchored to a listed venue): **5546**
- Buckets: 0=148  1-5=292  6-15=80  16-49=65  50+=27
- Median weddings/venue: **2**
- Top 50 share: 3234 / 5546 (58.3%)
- Top 100 share: 4316 / 5546 (77.8%)

## Hidden B -- venue-top, no account_locations row at all (233 accounts, 80 weddings)

Top 15 by weddings:
- marriottbonvoy -- 2 weddings
- dream_creeks -- 1 weddings
- xocohousegallery -- 1 weddings
- thursdaytherapychi -- 1 weddings
- humbledhospitality -- 1 weddings
- elgrancaribe -- 1 weddings
- pepesoffice -- 1 weddings
- subtle.haus -- 1 weddings
- sofarchicago -- 1 weddings
- churchclubchicago -- 1 weddings
- whitehawkcc -- 1 weddings
- carnegiehall -- 1 weddings
- stregishotels -- 1 weddings
- kohlerw -- 1 weddings
- contidisanbonifacio -- 1 weddings

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

## Hidden D -- top role is hotel, but is venue_id of >=1 wedding (11 accounts, 30 weddings)

Product question: hotels don't currently appear under /venues' category=venue filter.

Top 15 by weddings:
- pendrychicago -- 8 weddings
- renchicagodowntown -- 4 weddings
- magmilemarriott -- 3 weddings
- ambassadorchicago -- 3 weddings
- westinchicagorivernorth -- 2 weddings
- thelasallechicago -- 2 weddings
- allegrochicago -- 2 weddings
- therobeychicago -- 2 weddings
- marquis_chicago -- 2 weddings
- parkhyattchicago -- 1 weddings
- sableatnavypier -- 1 weddings

## Hidden E -- mis-anchored: venue_id account's top role is neither venue nor hotel (40 accounts, 56 weddings)

Includes accounts with no account_tags row at all (top role shown as "(none)").

Top 15 by weddings:
- ashyanabanquets -- top role: catering -- 4 weddings
- harrycarays -- top role: other -- 3 weddings
- venuelogic -- top role: other -- 3 weddings
- citycruises -- top role: transportation -- 3 weddings
- bokachicago -- top role: catering -- 3 weddings
- tethered_events__ -- top role: planner -- 2 weddings
- northshorecountryclub -- top role: catering -- 2 weddings
- lmcateringchi -- top role: catering -- 2 weddings
- eeeventco -- top role: other -- 2 weddings
- sepiachicago -- top role: catering -- 2 weddings
- avecchicago -- top role: catering -- 1 weddings
- maxwellstrading -- top role: other -- 1 weddings
- revelglobalevents -- top role: planner -- 1 weddings
- thelivenroom_eventvenue -- top role: planner -- 1 weddings
- hotelarista -- top role: catering -- 1 weddings
