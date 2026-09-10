# Venue coverage report (2026-09-10)

Universe A ("listed"): `v_account_role.role = 'venue'` AND `account_locations.in_metro` --
identical predicate to `searchVendors` (lib/server/vendors.ts), what `/venues` actually shows.
Weddings per account = `count(*) from weddings where venue_id = account` (no alias-resolving --
the page doesn't either).

## Universe A summary

- Listed venues: **417**
- Total weddings (anchored to a listed venue): **4178**
- Buckets: 0=154  1-5=147  6-15=38  16-49=57  50+=21
- Median weddings/venue: **1**
- Top 50 share: 2955 / 4178 (70.7%)
- Top 100 share: 3780 / 4178 (90.5%)

## Hidden B -- venue-top, no account_locations row at all (207 accounts, 354 weddings)

Top 15 by weddings:
- thedrakechicago -- 57 weddings
- thepeninsulachi -- 31 weddings
- palmerhousehilton -- 28 weddings
- chicagomuseum -- 25 weddings
- armourhouseweddings -- 19 weddings
- fieldmuseumspecialevents -- 19 weddings
- lhchicago -- 16 weddings
- loftonlake -- 11 weddings
- radissonbluaquachicago -- 8 weddings
- viceroychicago -- 8 weddings
- artinstitutespecialevents -- 7 weddings
- mcachicago -- 7 weddings
- lpconservancy -- 5 weddings
- haroldwashingtonlibrary -- 5 weddings
- chezweddingvenue -- 5 weddings

## Hidden C -- venue-top, has a location row but in_metro=false (33 accounts, 36 weddings)

Top 15 by weddings:
- post433chicago -- 7 weddings
- kohlerwi -- 3 weddings
- grand_geneva -- 3 weddings
- thevillamke -- 2 weddings
- thearmourhousemansion -- 2 weddings
- venue3two -- 2 weddings
- castello_di_petrata -- 2 weddings
- the_odyssey_events -- 2 weddings
- renplanowest -- 2 weddings
- lazyshacienda -- 1 weddings
- ssabrookfieldteam -- 1 weddings
- carnerosresort -- 1 weddings
- villa_balbiano -- 1 weddings
- theivyhousemke -- 1 weddings
- castelfalfi -- 1 weddings

## Hidden D -- top role is hotel, but is venue_id of >=1 wedding (19 accounts, 91 weddings)

Product question: hotels don't currently appear under /venues' category=venue filter.

Top 15 by weddings:
- loewschicagohotel -- 19 weddings
- royalsonestachicago -- 15 weddings
- jwmarriottchi -- 9 weddings
- pendrychicago -- 8 weddings
- westinlombard -- 6 weddings
- nobuchicago -- 5 weddings
- renchicagodowntown -- 4 weddings
- congressplazahotel -- 3 weddings
- trumphotels -- 3 weddings
- ambassadorchicago -- 3 weddings
- westinchicagorivernorth -- 2 weddings
- sohohouse -- 2 weddings
- magmilemarriott -- 2 weddings
- thelasallechicago -- 2 weddings
- allegrochicago -- 2 weddings

## Hidden E -- mis-anchored: venue_id account's top role is neither venue nor hotel (246 accounts, 876 weddings)

Includes accounts with no account_tags row at all (top role shown as "(none)").

Top 15 by weddings:
- thehaight -- top role: (none) -- 43 weddings
- thedrakeoakbrook -- top role: (none) -- 33 weddings
- fschicago -- top role: other -- 29 weddings
- totlspecialevents -- top role: planner -- 25 weddings
- intercontinental -- top role: (none) -- 25 weddings
- gatherpingreegrove -- top role: (none) -- 22 weddings
- cbgweddings -- top role: (none) -- 21 weddings
- concordebanquets -- top role: (none) -- 18 weddings
- elawafarm -- top role: (none) -- 17 weddings
- providencevineyard -- top role: (none) -- 15 weddings
- drurylaneevents -- top role: (none) -- 14 weddings
- ravisloeweddings -- top role: planner -- 14 weddings
- thebridgelemont -- top role: (none) -- 13 weddings
- venue5126 -- top role: (none) -- 13 weddings
- meyerscastle -- top role: (none) -- 12 weddings
