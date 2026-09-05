/**
 * Case B sizer — read-only. How many Ben posts that never formed a wedding
 * would attach to an *existing* wedding under conservative rules?
 *
 * D031 (2026-09-04): sized, hand-read, declined. Do not build an attach
 * writer from this. Keep the sizer as the measurement artifact.
 *
 * Does not write. Mirrors Case A's parseCaption + named-role / non-person
 * / trailing-period filters. See docs/engineering/vendor-feed-gap/README.md.
 *
 * Usage (from apps/web): bun scripts/graph/sizeCaseBAttachOpportunity.ts
 */
import { getPool, closePool } from "../classify/db";
import { parseCaption } from "./stackParser";

const NON_VENDOR_LABEL = /\b(bride|groom|couple|newlyweds?|models?|guests?)\b/i;
const KNOWN_NON_VENDOR_HANDLES = new Set<string>(["martingarrix"]);
const DATE_WINDOW_DAYS = 21;

function normalizeHandle(handle: string): string {
  return handle.replace(/\.+$/, "").toLowerCase();
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

async function main() {
  const pool = getPool();

  const { rows: posts } = await pool.query<{
    id: number;
    caption: string;
    posted_at: string | null;
  }>(
    `select p.id::int, p.caption, p.posted_at::text
     from posts p
     where p.caption is not null
       and not exists (select 1 from wedding_posts wp where wp.post_id = p.id)`
  );
  console.log(`[case-b-size] orphaned posts with caption: ${posts.length}`);

  const { rows: acctRows } = await pool.query<{ id: number; username: string }>(
    `select id::int, lower(username::text) as username from accounts`
  );
  const accountByHandle = new Map(acctRows.map((a) => [a.username, a.id]));

  const { rows: wvRows } = await pool.query<{
    wedding_id: number;
    account_id: number;
    role: string;
    event_date: string | null;
    venue_id: number | null;
  }>(
    `select wv.wedding_id::int, wv.account_id::int, wv.role::text as role,
            w.event_date_est::text as event_date, w.venue_id::int as venue_id
     from wedding_vendors wv
     join weddings w on w.id = wv.wedding_id`
  );

  const weddingsByAccount = new Map<number, { weddingId: number; date: Date | null; venueId: number | null }[]>();
  const vendorsByWedding = new Map<number, Set<number>>();
  const weddingsByVenue = new Map<number, { weddingId: number; date: Date | null }[]>();
  for (const r of wvRows) {
    const date = r.event_date ? new Date(r.event_date) : null;
    if (!weddingsByAccount.has(r.account_id)) weddingsByAccount.set(r.account_id, []);
    weddingsByAccount.get(r.account_id)!.push({ weddingId: r.wedding_id, date, venueId: r.venue_id });
    if (!vendorsByWedding.has(r.wedding_id)) vendorsByWedding.set(r.wedding_id, new Set());
    vendorsByWedding.get(r.wedding_id)!.add(r.account_id);
    if (r.venue_id != null) {
      if (!weddingsByVenue.has(r.venue_id)) weddingsByVenue.set(r.venue_id, []);
    }
  }
  // unique (venue, wedding) for venue index
  const seenVenueWedding = new Set<string>();
  for (const r of wvRows) {
    if (r.venue_id == null) continue;
    const key = `${r.venue_id}:${r.wedding_id}`;
    if (seenVenueWedding.has(key)) continue;
    seenVenueWedding.add(key);
    weddingsByVenue.get(r.venue_id)!.push({
      weddingId: r.wedding_id,
      date: r.event_date ? new Date(r.event_date) : null,
    });
  }

  type Credit = { handle: string; role: string; role_raw: string; accountId: number | null };
  type Sized = {
    postId: number;
    postedAt: Date | null;
    credits: Credit[];
    nNamedRoles: number;
    venueCredits: Credit[];
  };

  const named: Sized[] = [];
  let parsedWithAnyStack = 0;
  let skippedOnlyOther = 0;

  for (const p of posts) {
    const { stack } = parseCaption(p.caption);
    if (stack.length === 0) continue;
    parsedWithAnyStack++;
    const credits: Credit[] = [];
    for (const raw of stack) {
      const handle = normalizeHandle(raw.handle);
      if (KNOWN_NON_VENDOR_HANDLES.has(handle)) continue;
      if (NON_VENDOR_LABEL.test(raw.role_raw)) continue;
      if (raw.role === "other") continue;
      credits.push({
        handle,
        role: raw.role,
        role_raw: raw.role_raw,
        accountId: accountByHandle.get(handle) ?? null,
      });
    }
    if (credits.length === 0) {
      skippedOnlyOther++;
      continue;
    }
    const roles = new Set(credits.map((c) => c.role));
    named.push({
      postId: p.id,
      postedAt: p.posted_at ? new Date(p.posted_at) : null,
      credits,
      nNamedRoles: roles.size,
      venueCredits: credits.filter((c) => c.role === "venue"),
    });
  }

  console.log(`[case-b-size] parseCaption produced a stack: ${parsedWithAnyStack}`);
  console.log(`[case-b-size] named-role orphaned posts (Case A filters): ${named.length}`);
  console.log(`[case-b-size]   ≥2 distinct named roles: ${named.filter((n) => n.nNamedRoles >= 2).length}`);
  console.log(`[case-b-size]   has venue credit: ${named.filter((n) => n.venueCredits.length > 0).length}`);
  console.log(`[case-b-size]   skipped (stack but only other/person-label): ${skippedOnlyOther}`);

  function uniqueVenueMatch(s: Sized): number[] {
    if (!s.postedAt || s.venueCredits.length === 0) return [];
    const hits = new Set<number>();
    for (const v of s.venueCredits) {
      if (v.accountId == null) continue;
      const nearby = (weddingsByVenue.get(v.accountId) ?? []).filter(
        (w) => w.date && daysBetween(s.postedAt!, w.date) <= DATE_WINDOW_DAYS
      );
      if (nearby.length === 1) hits.add(nearby[0].weddingId);
    }
    return [...hits];
  }

  function ambiguousVenueMatch(s: Sized): number {
    if (!s.postedAt || s.venueCredits.length === 0) return 0;
    for (const v of s.venueCredits) {
      if (v.accountId == null) continue;
      const nearby = (weddingsByVenue.get(v.accountId) ?? []).filter(
        (w) => w.date && daysBetween(s.postedAt!, w.date) <= DATE_WINDOW_DAYS
      );
      if (nearby.length > 1) return nearby.length;
    }
    return 0;
  }

  function twoHandleSameWedding(s: Sized): number[] {
    if (!s.postedAt) return [];
    const ids = s.credits.map((c) => c.accountId).filter((x): x is number => x != null);
    if (ids.length < 2) return [];
    const candidateWeddings = new Map<number, number>(); // weddingId -> how many of our handles appear
    for (const aid of ids) {
      const seen = new Set<number>();
      for (const w of weddingsByAccount.get(aid) ?? []) {
        if (seen.has(w.weddingId)) continue;
        seen.add(w.weddingId);
        if (!w.date || daysBetween(s.postedAt, w.date) > DATE_WINDOW_DAYS) continue;
        candidateWeddings.set(w.weddingId, (candidateWeddings.get(w.weddingId) ?? 0) + 1);
      }
    }
    return [...candidateWeddings.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  }

  let uniqueVenue = 0;
  let uniqueVenueMulti = 0; // unique venue match AND 2+ named roles
  let ambigVenue = 0;
  let twoHandle = 0;
  let twoHandleNotVenue = 0;
  const uniqueVenueExamples: string[] = [];
  const twoHandleExamples: string[] = [];
  const leftoverExamples: string[] = [];

  for (const s of named) {
    const uv = uniqueVenueMatch(s);
    const amb = ambiguousVenueMatch(s);
    const th = twoHandleSameWedding(s);
    if (uv.length === 1) {
      uniqueVenue++;
      if (s.nNamedRoles >= 2) uniqueVenueMulti++;
      if (uniqueVenueExamples.length < 12) {
        uniqueVenueExamples.push(
          `post=${s.postId} → wedding=${uv[0]} roles=${s.nNamedRoles} venue=@${s.venueCredits.map((v) => v.handle).join(",")} credits=${s.credits.map((c) => c.role + ":@" + c.handle).join(" | ")}`
        );
      }
    }
    if (amb > 0) ambigVenue++;
    if (th.length === 1) {
      twoHandle++;
      if (uv.length !== 1) {
        twoHandleNotVenue++;
        if (twoHandleExamples.length < 12) {
          twoHandleExamples.push(
            `post=${s.postId} → wedding=${th[0]} roles=${s.nNamedRoles} credits=${s.credits.map((c) => c.role + ":@" + c.handle).join(" | ")}`
          );
        }
      }
    }
    if (uv.length !== 1 && th.length !== 1 && leftoverExamples.length < 8) {
      leftoverExamples.push(
        `post=${s.postId} roles=${s.nNamedRoles} venue=${s.venueCredits.length} credits=${s.credits.map((c) => c.role + ":@" + c.handle).join(" | ")}`
      );
    }
  }

  console.log(`\n[case-b-size] MATCH RULES (21-day window vs weddings.event_date_est):`);
  console.log(`  unique venue match (exactly 1 wedding at that venue in window): ${uniqueVenue}`);
  console.log(`    of which ≥2 named roles: ${uniqueVenueMulti}`);
  console.log(`  ambiguous venue (2+ weddings at that venue in window): ${ambigVenue}`);
  console.log(`  2+ of this post's handles co-occur on the same nearby wedding: ${twoHandle}`);
  console.log(`    of which are NOT also a unique-venue match: ${twoHandleNotVenue}`);

  console.log(`\n[case-b-size] unique-venue examples:`);
  for (const e of uniqueVenueExamples) console.log(`  ${e}`);
  console.log(`\n[case-b-size] two-handle-not-venue examples:`);
  for (const e of twoHandleExamples) console.log(`  ${e}`);
  console.log(`\n[case-b-size] leftover (no unique-venue, no two-handle) sample:`);
  for (const e of leftoverExamples) console.log(`  ${e}`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
