#!/usr/bin/env python3
"""M4 — LLM caption sweep (Haiku).

Feeds every un-parsed caption with 3+ mentions through claude-haiku-4-5 to
extract vendor credits the regex couldn't structure. Writes post_mentions
rows (parse marker on posts.parse_method='stack_llm'), then pipeline dedup
rebuilds weddings/edges.

Usage: python3 normalize.py [--limit N]
"""
import json, re, sys, threading, datetime
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic
import psycopg2

HERE = Path(__file__).parent
ROLES = ['venue','planner','photographer','videographer','florist','hair','makeup',
         'dj','band','musician','attire','stationery','cake','catering','rentals',
         'transportation','photobooth','officiant','hotel','jeweler','content_creator',
         'beauty_other','other']

PROMPT = """You extract wedding vendor credits from an Instagram caption.

Return ONLY a JSON array. Each element: {{"handle": "<instagram handle without @>", "role": "<one of: {roles}>", "label": "<the words the caption used for this role>"}}.

Rules:
- Include ONLY accounts credited as wedding vendors/services (venue, planner, florist, photographer, band, dress designer, etc.), whether credited in a list or in prose ("flowers by my girl @x" counts, role=florist).
- EXCLUDE the couple, wedding party, friends, family, pets, and generic brand shoutouts with no service role.
- handle must be one of the mentioned handles listed below, lowercase.
- If the caption credits no vendors, return [].

Mentioned handles: {mentions}

Caption:
{caption}"""

def log(msg):
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(HERE / 'normalize.log', 'a') as f:
        f.write(line + '\n')

def api_key():
    for l in (HERE / '.env').read_text().splitlines():
        if l.startswith('ANTHROPIC_API_KEY='):
            return l.split('=', 1)[1].strip()
    sys.exit('no ANTHROPIC_API_KEY in .env')

client = anthropic.Anthropic(api_key=api_key())
usage = {'in': 0, 'out': 0}
ulock = threading.Lock()

def extract(caption, mentions):
    r = client.messages.create(
        model='claude-haiku-4-5', max_tokens=1500,
        messages=[{'role': 'user', 'content': PROMPT.format(
            roles=', '.join(ROLES), mentions=', '.join(mentions), caption=caption[:4000])}])
    with ulock:
        usage['in'] += r.usage.input_tokens
        usage['out'] += r.usage.output_tokens
    text = ''.join(b.text for b in r.content if b.type == 'text')
    m = re.search(r'\[.*\]', text, re.S)
    if not m:
        return []
    out = []
    ok_handles = {h.lower() for h in mentions}
    for item in json.loads(m.group(0)):
        h = str(item.get('handle', '')).lstrip('@').lower()
        role = item.get('role')
        if h in ok_handles and role in ROLES:
            out.append((h, role, str(item.get('label', ''))[:80]))
    return out

def main(limit=None):
    conn = psycopg2.connect(host='localhost', port=5442, dbname='dewwey',
                            user='dewwey', password='dewwey')
    cur = conn.cursor()
    cur.execute("""
        select p.id, p.caption, p.raw->'mentions'
        from posts p
        where not p.has_stack and p.parse_method is null
          and jsonb_array_length(p.raw->'mentions') >= 3
        order by p.id""" + (f" limit {int(limit)}" if limit else ""))
    todo = cur.fetchall()
    log(f"LLM sweep: {len(todo)} captions")
    done = [0]; found = [0]

    def work(row):
        pid, caption, mentions = row
        try:
            credits = extract(caption or '', [m for m in (mentions or [])])
        except Exception as e:
            log(f"post {pid}: {type(e).__name__}: {e}")
            return pid, None
        return pid, credits

    with ThreadPoolExecutor(max_workers=8) as ex:
        for pid, credits in ex.map(work, todo):
            if credits is None:
                continue
            roles = {r for _, r, _ in credits}
            for h, role, label in credits:
                cur.execute("insert into accounts (username) values (%s) on conflict (username) do nothing", (h,))
                cur.execute("""
                    insert into post_mentions (post_id, account_id, role_raw, role, in_stack)
                    values (%s, (select id from accounts where username=%s), %s, %s, true)
                    on conflict do nothing""", (pid, h, label or role, role))
                # prose row for the same mention becomes redundant but harmless
            cur.execute("update posts set has_stack=%s, parse_method='stack_llm' where id=%s",
                        (len(roles) >= 3, pid))
            conn.commit()
            done[0] += 1; found[0] += len(credits)
            if done[0] % 100 == 0:
                cost = usage['in']/1e6 + usage['out']*5/1e6
                log(f"{done[0]}/{len(todo)} captions, {found[0]} credits, ~${cost:.2f}")
    cost = usage['in']/1e6 + usage['out']*5/1e6
    log(f"DONE: {done[0]} captions, {found[0]} vendor credits, ${cost:.2f} "
        f"({usage['in']} in / {usage['out']} out tokens)")
    conn.close()

if __name__ == '__main__':
    limit = None
    if '--limit' in sys.argv:
        limit = sys.argv[sys.argv.index('--limit') + 1]
    main(limit)
