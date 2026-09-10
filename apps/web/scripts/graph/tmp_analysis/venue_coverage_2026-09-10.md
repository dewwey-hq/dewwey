# Venue coverage report (2026-09-10)

Universe A ("listed"): `v_account_role.role = 'venue'` AND `account_locations.in_metro` --
identical predicate to `searchVendors` (lib/server/vendors.ts), what `/venues` actually shows.
Weddings per account = `count(*) from weddings where venue_id = account` (no alias-resolving --
the page doesn't either).

## Universe A summary

- Listed venues: **614**
- Total weddings (anchored to a listed venue): **5194**
- Buckets: 0=156  1-5=291  6-15=74  16-49=71  50+=22
- Median weddings/venue: **2**
- Top 50 share: 3007 / 5194 (57.9%)
- Top 100 share: 4039 / 5194 (77.8%)

## Hidden B -- venue-top, no account_locations row at all (248 accounts, 173 weddings)

Top 15 by weddings:
- armourhouseweddings -- 19 weddings
- saintclementparish -- 11 weddings
- artinstitutespecialevents -- 7 weddings
- lpconservancy -- 5 weddings
- haroldwashingtonlibrary -- 5 weddings
- butterfieldcc_grounds -- 5 weddings
- conwayfarmsgolfclub -- 5 weddings
- uccweddings -- 4 weddings
- louloubylula -- 3 weddings
- lacuna2150 -- 3 weddings
- trumpturnberryscotland -- 3 weddings
- communityhouse_celebrate -- 2 weddings
- bevhillshotel -- 2 weddings
- villagesuitesbayharbor -- 2 weddings
- marriottbonvoy -- 2 weddings

## Hidden C -- venue-top, has a location row but in_metro=false (35 accounts, 41 weddings)

Top 15 by weddings:
- post433chicago -- 7 weddings
- kohlerwi -- 3 weddings
- grand_geneva -- 3 weddings
- stjames1868 -- 3 weddings
- thevillamke -- 2 weddings
- thearmourhousemansion -- 2 weddings
- venue3two -- 2 weddings
- castello_di_petrata -- 2 weddings
- the_odyssey_events -- 2 weddings
- renplanowest -- 2 weddings
- prairiestreetevents -- 2 weddings
- lazyshacienda -- 1 weddings
- ssabrookfieldteam -- 1 weddings
- carnerosresort -- 1 weddings
- villa_balbiano -- 1 weddings

## Hidden D -- top role is hotel, but is venue_id of >=1 wedding (12 accounts, 30 weddings)

Product question: hotels don't currently appear under /venues' category=venue filter.

Top 15 by weddings:
- pendrychicago -- 8 weddings
- renchicagodowntown -- 4 weddings
- ambassadorchicago -- 3 weddings
- westinchicagorivernorth -- 2 weddings
- magmilemarriott -- 2 weddings
- thelasallechicago -- 2 weddings
- allegrochicago -- 2 weddings
- therobeychicago -- 2 weddings
- marquis_chicago -- 2 weddings
- parkhyattchicago -- 1 weddings
- hyattchicago -- 1 weddings
- sableatnavypier -- 1 weddings

## Hidden E -- mis-anchored: venue_id account's top role is neither venue nor hotel (39 accounts, 49 weddings)

Includes accounts with no account_tags row at all (top role shown as "(none)").

Top 15 by weddings:
- ashyanabanquets -- top role: catering -- 4 weddings
- venuelogic -- top role: other -- 3 weddings
- bokachicago -- top role: catering -- 3 weddings
- lmcateringchi -- top role: catering -- 2 weddings
- eeeventco -- top role: other -- 2 weddings
- sepiachicago -- top role: catering -- 2 weddings
- avecchicago -- top role: catering -- 1 weddings
- maxwellstrading -- top role: other -- 1 weddings
- revelglobalevents -- top role: planner -- 1 weddings
- thelivenroom_eventvenue -- top role: planner -- 1 weddings
- publishinghouse_bnb -- top role: other -- 1 weddings
- revel_decor -- top role: rentals -- 1 weddings
- entertaining_co -- top role: catering -- 1 weddings
- stjosaphatparish -- top role: other -- 1 weddings
- hangoutlighting -- top role: other -- 1 weddings
