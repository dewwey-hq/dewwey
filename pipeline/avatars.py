#!/usr/bin/env python3
"""Download profile pictures (HD preferred) for every account that has one,
into avatars/<username>.jpg, and map the file path onto accounts.avatar_path.

Free (direct CDN downloads) and idempotent — re-run after each enrichment pass
while the signed URLs are still fresh.
"""
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg2
from pipeline import log

HERE = Path(__file__).parent
AVATARS = HERE / 'avatars'
AVATARS.mkdir(exist_ok=True)

conn = psycopg2.connect(host='localhost', port=5442, dbname='dewwey', user='dewwey', password='dewwey')
cur = conn.cursor()
cur.execute("""
    alter table accounts add column if not exists avatar_path text""")
conn.commit()

cur.execute("""
    select id, username, coalesce(nullif(raw->>'profilePicUrlHD',''), raw->>'profilePicUrl')
    from accounts
    where avatar_path is null
      and coalesce(nullif(raw->>'profilePicUrlHD',''), raw->>'profilePicUrl') is not null""")
todo = cur.fetchall()
log(f"AVATARS: {len(todo)} to download")

def fetch(row):
    aid, username, url = row
    path = AVATARS / f"{username}.jpg"
    r = subprocess.run(['curl', '-sL', '--max-time', '25', '-o', str(path), url],
                       capture_output=True)
    if r.returncode == 0 and path.exists() and path.stat().st_size > 1000:
        return aid, f"avatars/{username}.jpg"
    path.unlink(missing_ok=True)
    return aid, None

ok = fail = 0
with ThreadPoolExecutor(max_workers=12) as ex:
    for aid, rel in ex.map(fetch, todo):
        if rel:
            cur.execute("update accounts set avatar_path=%s where id=%s", (rel, aid))
            ok += 1
            if ok % 200 == 0:
                conn.commit()
                log(f"AVATARS: {ok} downloaded")
        else:
            fail += 1
conn.commit()
total_mb = sum(f.stat().st_size for f in AVATARS.glob('*.jpg')) / 1e6
log(f"AVATARS done: {ok} saved ({total_mb:.1f} MB), {fail} failed/expired")
conn.close()
