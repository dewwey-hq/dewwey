#!/usr/bin/env python3
"""dewwey pipeline.

Usage: python3 pipeline.py [m2|ingest|enrich|dedup|report|all]

Phases:
  m2      Google Maps -> Chicago venues -> IG handles from venue websites -> frontier hop 0
  ingest  tagged-scraper over pending hop-0 venues -> posts/mentions/accounts
  enrich  profile-scraper for venues + stack-credited vendors
  dedup   rebuild weddings (jaccard merge), vote account_tags, refresh edges
  report  write REPORT.md + fresh poc/graph.json

Budget: hard-capped via state.json; survives reruns. All DB writes idempotent.
"""
import json, re, subprocess, sys, time, tempfile, datetime
from pathlib import Path

import psycopg2
import psycopg2.extras

HERE = Path(__file__).parent
STATE = HERE / 'state.json'
LOG = HERE / 'overnight.log'
UA = 'apify-agent-skills/apify-ultimate-scraper'

BUDGET_CAP_USD = 25.0          # leave margin under the $29 plan
COST = {'gmaps': 4.5, 'tagged': 2.7, 'profile': 2.7}   # $ per 1000 results, conservative

METRO_BBOX = (41.35, 42.45, -88.45, -87.30)   # lat_min, lat_max, lng_min, lng_max (Chicago MSA core)

# ---------- infra ----------

def log(msg):
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')

def db():
    return psycopg2.connect(host='localhost', port=5442, dbname='dewwey',
                            user='dewwey', password='dewwey')

def state():
    return json.loads(STATE.read_text()) if STATE.exists() else {'spent_usd': 0.0, 'runs': []}

def spend(kind, n_results, extra=None):
    s = state()
    cost = COST[kind] * n_results / 1000
    s['spent_usd'] = round(s['spent_usd'] + cost, 4)
    s['runs'].append({'kind': kind, 'results': n_results, 'usd': round(cost, 4),
                      'at': datetime.datetime.now().isoformat(timespec='seconds'), **(extra or {})})
    STATE.write_text(json.dumps(s, indent=2))
    return s['spent_usd']

def budget_left():
    return BUDGET_CAP_USD - state()['spent_usd']

class BudgetExhausted(Exception):
    pass

def apify_call(actor, input_obj, timeout_s=1800):
    """Run an actor, return dataset items. Raises BudgetExhausted on payment errors."""
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(input_obj, f)
        path = f.name
    r = subprocess.run(
        ['apify', 'actors', 'call', actor, '--input-file', path, '--user-agent', UA, '--json'],
        capture_output=True, text=True, timeout=timeout_s)
    out = r.stdout.strip()
    try:
        meta = json.loads(out)
    except json.JSONDecodeError:
        blob = (out + r.stderr).lower()
        if any(k in blob for k in ('credit', 'payment', 'exceeded', 'limit', 'insufficient')):
            raise BudgetExhausted(blob[:300])
        raise RuntimeError(f"apify call failed: {blob[:400]}")
    ds = meta.get('storage', {}).get('defaultDatasetId') or meta.get('defaultDatasetId')
    status = meta.get('run', {}).get('status') or meta.get('status')
    if status != 'SUCCEEDED':
        raise RuntimeError(f"run {status}: {json.dumps(meta)[:300]}")
    r2 = subprocess.run(['apify', 'datasets', 'get-items', ds, '--user-agent', UA, '--format', 'json'],
                        capture_output=True, text=True, timeout=300)
    return json.loads(r2.stdout)

# ---------- parsing (shared with load_poc.py) ----------

LINE = re.compile(r"^\s*[•\-\*]?\s*([A-Za-z][A-Za-z &+/'’]{1,35}?)\s*[:|\-–—/]+\s*(.*@.*)$")
HANDLE = re.compile(r'@([A-Za-z0-9._]{2,30})')

ROLE_MAP = [
    ('photobooth', ['photo booth', 'photobooth']), ('venue', ['venue']),
    ('hotel', ['hotel']), ('planner', ['plann']),
    ('photographer', ['photo']), ('videographer', ['video', 'film', 'content']),
    ('hair', ['hair']), ('makeup', ['makeup']), ('beauty_other', ['hmu', 'beauty']),
    ('florist', ['flor', 'bloom']), ('dj', ['dj', 'entertainment']),
    ('musician', ['music', 'sax', 'strings', 'band']),
    ('attire', ['dress', 'gown', 'suit', 'tux', 'attire', 'bridal']),
    ('stationery', ['stationery', 'invitation', 'paper']), ('cake', ['cake', 'dessert']),
    ('catering', ['cater', 'dinner', 'drinks', 'food']),
    ('rentals', ['rental', 'linen', 'decor']), ('transportation', ['transport', 'limo']),
    ('officiant', ['officiant']), ('jeweler', ['ring', 'jewel']),
]

def norm(role_raw):
    r = role_raw.lower()
    for role, keys in ROLE_MAP:
        if any(k in r for k in keys):
            return role
    return 'other'

def parse_caption(caption):
    stack = []
    for i, line in enumerate((caption or '').split('\n')):
        m = LINE.match(line.strip())
        if m:
            for h in HANDLE.findall(m.group(2)):
                stack.append((m.group(1).strip(), h.lower(), i))
    has_stack = len({r for r, _, _ in stack}) >= 3
    return stack, has_stack

# ---------- db helpers ----------

def acct_id(cur, username, cache={}):
    u = username.lower()
    if u in cache:
        return cache[u]
    cur.execute("insert into accounts (username) values (%s) "
                "on conflict (username) do update set username = excluded.username "
                "returning id", (u,))
    cache[u] = cur.fetchone()[0]
    return cache[u]

def upsert_post(cur, item, seed):
    stack, has_stack = parse_caption(item.get('caption'))
    owner = acct_id(cur, item['ownerUsername'])
    cur.execute("""
        insert into posts (shortcode, url, owner_id, caption, posted_at, likes_count,
                           comments_count, seed_username, has_stack, parse_method, raw)
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        on conflict (shortcode) do nothing returning id""",
        (item['shortCode'], item['url'], owner, item.get('caption'),
         item['timestamp'],
         # Instagram returns -1 when the account hides like counts — that's
         # "unknown", not a count; store NULL so aggregates stay honest
         None if (item.get('likesCount') or 0) < 0 else item.get('likesCount'),
         None if (item.get('commentsCount') or 0) < 0 else item.get('commentsCount'),
         seed, has_stack, 'stack_regex' if has_stack else None, json.dumps(item)))
    row = cur.fetchone()
    if not row:
        return None, has_stack, []      # already had it
    pid = row[0]
    seen = set()
    stack_roles = []
    for role_raw, h, ln in stack:
        role = norm(role_raw)
        cur.execute("""
            insert into post_mentions (post_id, account_id, role_raw, role, in_stack, line_no)
            values (%s,%s,%s,%s,true,%s) on conflict do nothing""",
            (pid, acct_id(cur, h), role_raw, role, ln))
        seen.add(h)
        stack_roles.append((h, role))
    for m in (item.get('mentions') or []):
        if m.lower() not in seen:
            cur.execute("""
                insert into post_mentions (post_id, account_id, in_stack)
                values (%s,%s,false) on conflict do nothing""", (pid, acct_id(cur, m)))
    return pid, has_stack, stack_roles

def frontier_add(cur, account_id, hops, priority, status='pending', note=None):
    cur.execute("""
        insert into crawl_frontier (account_id, hops, priority, status, note)
        values (%s,%s,%s,%s,%s) on conflict (account_id) do nothing""",
        (account_id, hops, priority, status, note))

# ---------- phase: m2 venues ----------

IG_LINK = re.compile(r'instagram\.com/([A-Za-z0-9._]{2,30})/?["\'\s?#]')
IG_BAD = {'p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'sharer', 'share'}

def ig_handle_from_site(url):
    try:
        r = subprocess.run(
            ['curl', '-sL', '--max-time', '12', '--compressed',
             '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', url],
            capture_output=True, text=True, errors='replace', timeout=20)
        for h in IG_LINK.findall(r.stdout):
            if h.lower() not in IG_BAD:
                return h.lower()
    except Exception:
        pass
    return None

def phase_m2():
    log("M2: Google Maps venue sweep starting")
    if budget_left() < 5:
        raise BudgetExhausted('m2 pre-check')
    items = apify_call('compass/crawler-google-places', {
        'searchStringsArray': ['wedding venue', 'wedding reception venue', 'banquet hall'],
        'locationQuery': 'Chicago, Illinois, United States',
        'maxCrawledPlacesPerSearch': 250,
        'language': 'en',
        'skipClosedPlaces': True,
    }, timeout_s=3600)
    spend('gmaps', len(items))
    (HERE / 'poc' / 'gmaps_venues.json').write_text(json.dumps(items))
    log(f"M2: {len(items)} places (${state()['spent_usd']:.2f} spent)")

    seen, venues = set(), []
    for it in items:
        pid = it.get('placeId')
        if not pid or pid in seen:
            continue
        seen.add(pid)
        lat, lng = (it.get('location') or {}).get('lat'), (it.get('location') or {}).get('lng')
        if lat is None or not (METRO_BBOX[0] <= lat <= METRO_BBOX[1]
                               and METRO_BBOX[2] <= lng <= METRO_BBOX[3]):
            continue
        venues.append(it)
    log(f"M2: {len(venues)} unique places in metro bbox")

    conn = db(); cur = conn.cursor()
    found = no_ig = 0
    missing = []
    for it in venues:
        site = it.get('website')
        handle = ig_handle_from_site(site) if site else None
        if not handle:
            no_ig += 1
            missing.append({'title': it.get('title'), 'website': site, 'address': it.get('address')})
            continue
        aid = acct_id(cur, handle)
        cur.execute("""
            insert into account_locations (account_id, address, city, region, lat, lng, source, in_metro, verified_at)
            values (%s,%s,%s,%s,%s,%s,'google_maps',true,now())
            on conflict (account_id) do update set address=excluded.address, lat=excluded.lat,
              lng=excluded.lng, in_metro=true, verified_at=now()""",
            (aid, it.get('address'), it.get('city'), it.get('state'),
             it['location']['lat'], it['location']['lng']))
        cur.execute("""
            insert into account_tags (account_id, role, source, confidence, evidence_count)
            values (%s,'venue','manual',0.8,1)
            on conflict (account_id, role, source) do nothing""", (aid,))
        frontier_add(cur, aid, 0, 1.0, note=f"gmaps:{it.get('title')}")
        found += 1
        conn.commit()
    (HERE / 'poc' / 'venues_no_ig.json').write_text(json.dumps(missing, indent=2))
    conn.commit(); conn.close()
    log(f"M2 done: {found} venues with IG handles in frontier, {no_ig} without (saved for later)")

# ---------- phase: ingest ----------

def phase_ingest(batch_size=10, results_per_profile=25, max_hops=1):
    log("INGEST: tagged-post crawl starting")
    conn = db(); cur = conn.cursor()
    while True:
        if budget_left() < 4.5:   # reserve for profile enrichment
            log("INGEST: budget cap reached (enrich reserve), stopping cleanly")
            break
        cur.execute("""
            select f.account_id, a.username, f.hops from crawl_frontier f
            join accounts a on a.id = f.account_id
            where f.status = 'pending' and f.hops <= %s
            order by f.hops, f.priority desc, a.username limit %s""", (max_hops, batch_size))
        batch = cur.fetchall()
        if not batch:
            log("INGEST: frontier empty — nothing pending within hop limit")
            break
        usernames = [u for _, u, _ in batch]
        hop_of = {u: h for _, u, h in batch}
        log(f"INGEST: batch of {len(usernames)}: {', '.join(usernames[:5])}…")
        try:
            items = apify_call('apify/instagram-tagged-scraper',
                               {'username': usernames, 'resultsLimit': results_per_profile})
        except BudgetExhausted as e:
            log(f"INGEST: apify refused (credit): {e} — stopping scrapes")
            for aid, _, _ in batch:
                cur.execute("update crawl_frontier set note='blocked: credit' where account_id=%s", (aid,))
            conn.commit()
            break
        except Exception as e:
            log(f"INGEST: batch error: {e} — marking batch error, continuing")
            for aid, _, _ in batch:
                cur.execute("update crawl_frontier set status='error', note=%s where account_id=%s",
                            (str(e)[:200], aid))
            conn.commit()
            continue
        spend('tagged', len(items), {'batch': usernames[:3]})
        per_seed = {u: {'posts': 0, 'stacks': 0} for u in usernames}
        for it in items:
            if not it.get('shortCode'):
                continue
            seed = next((u for u in usernames
                         if it.get('inputUrl', '').rstrip('/').lower().endswith(u)), None)
            pid, has_stack, stack_roles = upsert_post(cur, it, seed)
            if seed:
                per_seed[seed]['posts'] += 1
                per_seed[seed]['stacks'] += 1 if has_stack else 0
            # recursion: newly credited vendors join the frontier at hop+1.
            # New venues/hotels crawl at high priority (geo-unverified, from a
            # Chicago venue's feed so almost certainly metro); planners and
            # camera-holders are stack-dense and worth a shallow crawl; the
            # rest are recorded but not crawled tonight.
            next_hop = (hop_of.get(seed, 0)) + 1
            for h, role in stack_roles:
                aid2 = acct_id(cur, h)
                if role in ('venue', 'hotel'):
                    frontier_add(cur, aid2, next_hop, 0.8, note='discovered venue, geo-unverified')
                elif role in ('planner', 'photographer', 'videographer'):
                    frontier_add(cur, aid2, next_hop, 0.35)
                else:
                    frontier_add(cur, aid2, next_hop, 0.1, status='skipped')
        for aid, u, _ in batch:
            cur.execute("""
                update crawl_frontier set status='crawled', last_crawled_at=now(),
                  posts_found=%s, stacks_found=%s where account_id=%s""",
                (per_seed[u]['posts'], per_seed[u]['stacks'], aid))
        conn.commit()
        log(f"INGEST: +{len(items)} posts (${state()['spent_usd']:.2f} spent)")
        time.sleep(20)   # be gentle per gotchas
    conn.close()

# ---------- phase: enrich ----------

def phase_enrich(cap=1200, chunk=100):
    log("ENRICH: profile enrichment starting")
    conn = db(); cur = conn.cursor()
    cur.execute("""
        select distinct a.id, a.username from accounts a
        where a.profile_scraped_at is null
          and (exists (select 1 from post_mentions m where m.account_id = a.id and m.in_stack)
               or exists (select 1 from crawl_frontier f where f.account_id = a.id and f.hops = 0))
        order by a.id limit %s""", (cap,))
    todo = cur.fetchall()
    log(f"ENRICH: {len(todo)} accounts to enrich")
    for i in range(0, len(todo), chunk):
        if budget_left() < 0.5:
            log("ENRICH: budget cap reached, stopping")
            break
        part = todo[i:i + chunk]
        try:
            items = apify_call('apify/instagram-profile-scraper',
                               {'usernames': [u for _, u in part]})
        except BudgetExhausted:
            log("ENRICH: credit refused — stopping")
            break
        except Exception as e:
            log(f"ENRICH: chunk error: {e} — continuing")
            continue
        spend('profile', len(items))
        for it in items:
            u = (it.get('username') or '').lower()
            if not u:
                continue
            cur.execute("""
                update accounts set full_name=%s, biography=%s, external_url=%s,
                  followers=%s, is_business=%s, business_category=%s, is_private=%s,
                  raw=%s, profile_scraped_at=now()
                where username=%s""",
                (it.get('fullName'), it.get('biography'), it.get('externalUrl'),
                 it.get('followersCount'), it.get('isBusinessAccount'),
                 it.get('businessCategoryName'), it.get('private'),
                 json.dumps(it), u))
        conn.commit()
        log(f"ENRICH: +{len(items)} profiles (${state()['spent_usd']:.2f} spent)")
        time.sleep(15)
    conn.close()

# ---------- phase: dedup ----------

# KNOWN GAP (D040, docs/engineering/graph-strengthening/non-wedding-posts.md):
# this builds a wedding from every post with has_stack (>=3 distinct vendor
# roles) -- there is no is_wedding gate. A venue's tagged feed also carries
# concerts, galas, and birthdays, which are structurally identical to a
# wedding credit stack. The mission locked one narrow, measured rule
# (role_shape_v1: exclude when a wedding's wedding_vendors role set is a
# non-empty subset of {venue, band, musician}, 100% precision / 0 false
# EXCLUDEs on real weddings across every slice tested) and retired the 46
# posts it and a hand-labeled sample already caught -- see the mission doc's
# tick 4/5 findings and scripts/graph/graphStrengthening.test.ts's
# "non-wedding-posts role_shape_v1 gate" tests. That rule is NOT applied
# here yet (low recall by design, and doing so would need the same
# eval discipline the mission used, not a fresh reinvention) -- a future
# crawl can still reintroduce the same shape of junk until this phase (or a
# post-ingest filter reusing role_shape_v1 verbatim) actually gates on it.

def phase_dedup():
    log("DEDUP: rebuilding weddings")
    conn = db(); cur = conn.cursor()
    cur.execute("""
        select p.id, p.posted_at::date,
               jsonb_object_agg(a.username, m.role) filter (where m.in_stack)
        from posts p
        join post_mentions m on m.post_id = p.id and m.in_stack
        join accounts a on a.id = m.account_id
        where p.has_stack group by p.id, p.posted_at::date""")
    rows = [{'pid': r[0], 'date': r[1], 'vendors': r[2] or {}} for r in cur.fetchall()]
    rows.sort(key=lambda r: (r['date'], r['pid']))
    weddings = []
    for r in rows:
        vs = set(r['vendors'])
        for w in weddings:
            ws = set(w['vendors'])
            if (len(vs & ws) / len(vs | ws) > 0.5
                    and abs((r['date'] - w['date']).days) <= 21):
                for h, role in r['vendors'].items():
                    w['confirm'][(h, role)] = w['confirm'].get((h, role), 0) + 1
                w['vendors'].update(r['vendors'])
                w['pids'].append(r['pid'])
                break
        else:
            weddings.append({'vendors': dict(r['vendors']), 'date': r['date'], 'pids': [r['pid']],
                             'confirm': {(h, ro): 1 for h, ro in r['vendors'].items()}})
    cur.execute("truncate weddings, wedding_posts, wedding_vendors restart identity cascade")
    for w in weddings:
        venue = next((h for h, ro in w['vendors'].items() if ro == 'venue'), None)
        cur.execute("""
            insert into weddings (venue_id, event_date_est, is_chicago)
            values ((select id from accounts where username=%s),
                    %s,
                    (select coalesce(bool_or(l.in_metro), false)
                     from accounts a left join account_locations l on l.account_id=a.id
                     where a.username=%s))
            returning id""", (venue, w['date'], venue))
        wid = cur.fetchone()[0]
        for pid in w['pids']:
            cur.execute("insert into wedding_posts (wedding_id, post_id) values (%s,%s) "
                        "on conflict (post_id) do nothing", (wid, pid))
        for (h, role), n in w['confirm'].items():
            cur.execute("""
                insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
                values (%s, (select id from accounts where username=%s), %s, %s)
                on conflict (wedding_id, account_id, role)
                do update set n_confirmations = greatest(wedding_vendors.n_confirmations,
                                                         excluded.n_confirmations)""",
                (wid, h, role, n))
    cur.execute("""
        insert into account_tags (account_id, role, source, confidence, evidence_count)
        select account_id, role, 'stack_regex', least(0.5 + 0.15*count(*), 0.95), count(*)
        from post_mentions where in_stack and role is not null
        group by account_id, role
        on conflict (account_id, role, source) do update
          set confidence=excluded.confidence, evidence_count=excluded.evidence_count, updated_at=now()""")
    cur.execute("refresh materialized view edges")
    conn.commit()
    log(f"DEDUP done: {len(weddings)} weddings from {len(rows)} stack posts")
    conn.close()

# ---------- phase: report ----------

def phase_report():
    conn = db(); cur = conn.cursor()
    q = lambda sql: (cur.execute(sql), cur.fetchall())[1]
    n = lambda sql: q(sql)[0][0]
    stats = {
        'venues_seeded': n("select count(*) from crawl_frontier where hops=0"),
        'venues_crawled': n("select count(*) from crawl_frontier where hops=0 and status='crawled'"),
        'posts': n("select count(*) from posts"),
        'stack_posts': n("select count(*) from posts where has_stack"),
        'accounts': n("select count(*) from accounts"),
        'enriched': n("select count(*) from accounts where profile_scraped_at is not null"),
        'weddings': n("select count(*) from weddings"),
        'confirmed': n("select count(*) from weddings w where "
                       "(select count(*) from wedding_posts wp where wp.wedding_id=w.id) > 1"),
        'edges': n("select count(*) from edges"),
        'spent': state()['spent_usd'],
    }
    top_v = q("""select a.username, count(distinct w.id) from weddings w
                 join accounts a on a.id=w.venue_id group by 1 order by 2 desc limit 15""")
    top_e = q("""select aa.username, bb.username, e.n_weddings from edges e
                 join accounts aa on aa.id=e.account_a join accounts bb on bb.id=e.account_b
                 join account_tags ta on ta.account_id=e.account_a
                 where e.n_weddings > 1 order by e.n_weddings desc limit 15""")
    rpt = [f"# dewwey overnight run — {datetime.date.today()}", '',
           f"Spend: ${stats['spent']:.2f} of ${BUDGET_CAP_USD:.0f} cap", '',
           '| metric | value |', '|---|---|']
    rpt += [f"| {k} | {v} |" for k, v in stats.items()]
    rpt += ['', '## Busiest venues', ''] + [f"- @{u}: {c} weddings" for u, c in top_v]
    rpt += ['', '## Strongest repeat pairs', ''] + [f"- @{a} × @{b}: {w} weddings" for a, b, w in set(top_e)]
    (HERE / 'REPORT.md').write_text('\n'.join(rpt) + '\n')
    log(f"REPORT written: {stats}")
    conn.close()

# ---------- main ----------

PHASES = {'m2': phase_m2, 'ingest': phase_ingest, 'enrich': phase_enrich,
          'dedup': phase_dedup, 'report': phase_report}

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    order = ['m2', 'ingest', 'enrich', 'dedup', 'report'] if which == 'all' else [which]
    for name in order:
        try:
            PHASES[name]()
        except BudgetExhausted as e:
            log(f"{name}: BUDGET EXHAUSTED ({e}) — moving on to processing")
        except Exception as e:
            log(f"{name}: FATAL {type(e).__name__}: {e}")
            if name in ('dedup', 'report'):
                raise
    log("pipeline finished")
