#!/usr/bin/env python3
"""Geo pass: locate every venue/hotel account, then recompute weddings.is_chicago.

Pass 1 (free): lat/lng from IG businessAddress already in accounts.raw.
Pass 2 (paid): one Google Maps run for the venues still missing geo — searched
globally (no Chicago bias) so out-of-metro venues resolve to their TRUE location
instead of silently failing. Matches are accepted only when the returned place
name actually resembles the account name.
"""
import json, re
import psycopg2
from pipeline import apify_call, spend, log, METRO_BBOX, state

def in_metro(lat, lng):
    return (METRO_BBOX[0] <= lat <= METRO_BBOX[1]) and (METRO_BBOX[2] <= lng <= METRO_BBOX[3])

def prettify(username):
    s = re.sub(r'[._]+', ' ', username)
    s = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', s)
    return s.strip()

STOP = {'the', 'chicago', 'events', 'event', 'venue', 'weddings', 'wedding', 'co', 'inc', 'at', 'of', 'and'}
def tokens(s):
    return {t for t in re.findall(r'[a-z0-9]+', s.lower()) if t not in STOP}

conn = psycopg2.connect(host='localhost', port=5442, dbname='dewwey', user='dewwey', password='dewwey')
cur = conn.cursor()

# ---- pass 1: free, from IG businessAddress (all account types) ----
cur.execute("""
    select a.id, a.raw->'businessAddress' from accounts a
    left join account_locations l on l.account_id = a.id
    where l.account_id is null and a.raw->>'businessAddress' is not null
      and a.raw->>'businessAddress' != ''""")
free = 0
for aid, addr in cur.fetchall():
    if not isinstance(addr, dict) or addr.get('latitude') is None:
        continue
    lat, lng = addr['latitude'], addr['longitude']
    cur.execute("""
        insert into account_locations (account_id, address, city, lat, lng, source, in_metro, verified_at)
        values (%s,%s,%s,%s,%s,'ig_profile',%s,now())
        on conflict (account_id) do nothing""",
        (aid, addr.get('street_address'), addr.get('city_name'), lat, lng, in_metro(lat, lng)))
    free += 1
conn.commit()
log(f"GEO pass 1: {free} accounts located free from IG businessAddress")

# ---- pass 2: google maps for venues/hotels still missing geo ----
cur.execute("""
    select a.id, a.username, coalesce(nullif(a.full_name,''), '') from accounts a
    join v_account_role r on r.account_id = a.id
    left join account_locations l on l.account_id = a.id
    where r.role in ('venue','hotel') and l.account_id is null""")
targets = cur.fetchall()
log(f"GEO pass 2: {len(targets)} venues need Google Maps lookup")

queries, qmap = [], {}
for aid, username, full_name in targets:
    q = (full_name or prettify(username)) + ' venue'
    queries.append(q)
    qmap[q.lower()] = (aid, username, full_name)

items = apify_call('compass/crawler-google-places', {
    'searchStringsArray': queries,
    'maxCrawledPlacesPerSearch': 1,
    'language': 'en',
}, timeout_s=5400)
spend('gmaps', len(items), {'purpose': 'geo_fix'})
log(f"GEO pass 2: {len(items)} places returned (${state()['spent_usd']:.2f} est. spent)")

located = fuzzy_rejected = 0
for it in items:
    q = (it.get('searchString') or '').lower()
    if q not in qmap or not (it.get('location') or {}).get('lat'):
        continue
    aid, username, full_name = qmap[q]
    name_t = tokens(full_name or prettify(username))
    title_t = tokens(it.get('title', ''))
    if not name_t or len(name_t & title_t) / len(name_t) < 0.5:
        fuzzy_rejected += 1
        continue
    lat, lng = it['location']['lat'], it['location']['lng']
    cur.execute("""
        insert into account_locations (account_id, address, city, region, lat, lng, source, in_metro, verified_at)
        values (%s,%s,%s,%s,%s,%s,'google_maps',%s,now())
        on conflict (account_id) do update set address=excluded.address, city=excluded.city,
          lat=excluded.lat, lng=excluded.lng, in_metro=excluded.in_metro, verified_at=now()""",
        (aid, it.get('address'), it.get('city'), it.get('state'), lat, lng, in_metro(lat, lng)))
    located += 1
conn.commit()
log(f"GEO pass 2: {located} venues located, {fuzzy_rejected} rejected as bad name matches")

# ---- recompute wedding geography: true / false / null(unknown) ----
cur.execute("update weddings set is_chicago = null")
cur.execute("""
    update weddings w set is_chicago = l.in_metro
    from account_locations l where l.account_id = w.venue_id""")
cur.execute("""select coalesce(is_chicago::text,'unknown'), count(*) from weddings group by 1""")
log(f"GEO result: weddings by geography: {dict(cur.fetchall())}")
conn.commit()
conn.close()
