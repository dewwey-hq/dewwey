import { getPool, closePool } from "../../classify/db";

const COUPLE_PATTERNS: RegExp[] = [
  /\b([A-Z][a-z]+)\s*(?:&|\+|and)\s*([A-Z][a-z]+)\b/,
  /\bMr\.?\s*&\s*Mrs\.?\s+[A-Z][a-z]+/,
  /\bCouple:\s*@\w+/i,
  /\bBride:\s*@\w+/i,
];
function hasCoupleSignal(caption: string | null): boolean {
  if (!caption) return false;
  return COUPLE_PATTERNS.some((re) => re.test(caption));
}

async function main() {
  const pool = getPool();
  // ALL venue-authored posts (any review status), broadest population per the user's new steer
  const { rows: all } = await pool.query<{ post_url: string; caption_raw: string | null }>(`
    select sp.post_url, sp.caption_raw
    from staging.instagram_posts sp
    join accounts a on lower(a.username::text) = lower(sp.owner_username)
    join vendors v on v.account_id = a.id
    where v.city = 'Chicago' and v.category = 'venue'
  `);
  const { rows: v3include } = await pool.query<{ post_url: string; caption_raw: string | null }>(`
    select sp.post_url, sp.caption_raw
    from staging.instagram_posts sp
    join accounts a on lower(a.username::text) = lower(sp.owner_username)
    join vendors v on v.account_id = a.id
    join post_classifications_current pcc on pcc.post_url = sp.post_url and pcc.decision = 'INCLUDE'
    left join golden_set gs on gs.post_url = sp.post_url
    where v.city = 'Chicago' and v.category = 'venue' and gs.post_url is null
  `);
  const allWithSignal = all.filter((r) => hasCoupleSignal(r.caption_raw));
  const v3WithSignal = v3include.filter((r) => hasCoupleSignal(r.caption_raw));
  console.log(`All venue-authored posts: ${all.length}, with couple-signal: ${allWithSignal.length}`);
  console.log(`V3 INCLUDE, unreviewed, venue-authored: ${v3include.length}, with couple-signal: ${v3WithSignal.length}`);
  await closePool();
}
main();
