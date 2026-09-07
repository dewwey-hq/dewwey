/**
 * Styled-shoot ground-truth-growing queue (D049, 2026-09-07) -- the small, targeted labeling pool
 * that grows golden_set's CONFIRMED-styled population beyond the 94 rows already found via free-
 * text notes. Sized live against post_styled_shoot_signal (pipeline/schema.sql, D049): posts with
 * a LIKELY or POSSIBLE styled-shoot signal, a real parseable vendor-credit stack (3+ distinct
 * roles -- thin content isn't worth a human's review time here), not already in golden_set or
 * jeremy_wedding_candidate_posts. This pool is intentionally small (~100 posts): the D049 sizing
 * pass found styled-shoot content is NOT a large hidden pool in the remaining unprocessed corpus
 * (see docs/decisions.md D049) -- the point of this queue is precision-testing the signal design
 * (does LIKELY actually mean styled more often than POSSIBLE?), not volume harvesting.
 *
 * Each row's `bucket` records the confidence tier it came from, same "test which signal is
 * predictive" discipline as buildBeyondIncludeQueue.ts.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/buildStyledShootQueue.ts --dry-run
 *   bun run scripts/classify/buildStyledShootQueue.ts
 */
import { getPool, closePool } from "../classify/db";

export const STYLED_SHOOT_QUEUE_VERSION = "styled_shoot_v1";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  // Starts from the rich-stack population (4,309 posts) rather than joining
  // post_styled_shoot_signal directly -- that view does a full ~50k-post regex scan per query,
  // which blew the Supabase pooler's statement timeout when combined with the extra joins here.
  // Filtering to a real stack FIRST, then computing the signal only for that much smaller set,
  // keeps this fast while producing an identical result (the view's own CONFIRMED/LIKELY/POSSIBLE
  // logic, reproduced inline).
  const { rows } = await pool.query<{
    post_url: string;
    bucket: string;
    source: "staging" | "public";
  }>(
    `with rich_stack as (
       select post_url from stack_extraction_entries
       where stack_parser_version = (select max(stack_parser_version) from stack_extraction_runs)
       group by post_url
       having count(distinct role) >= 3
     ),
     candidate_posts as (
       select rs.post_url, sp.caption_raw as staging_caption, p.caption as public_caption,
         lower(coalesce(sp.owner_username, a.username::text)) as author_username,
         case when sp.post_url is not null then 'staging' else 'public' end as source
       from rich_stack rs
       left join staging.instagram_posts sp on sp.post_url = rs.post_url
       left join posts p on p.url = rs.post_url
       left join accounts a on a.id = p.owner_id
       where not exists (select 1 from golden_set gs where gs.post_url = rs.post_url)
         and not exists (select 1 from jeremy_wedding_candidate_posts cp where cp.source_post_url = rs.post_url)
         and not exists (select 1 from human_post_labels hpl where hpl.post_url = rs.post_url and hpl.labeled_by = 'jeremy')
         and (sp.post_url is not null or p.url is not null)
     ),
     known_network_accounts (username) as (
       values ('styledshootsacrossamerica'), ('stylemepretty'), ('chicagostyleweddings')
     )
     select
       cp.post_url,
       case
         when coalesce(cp.staging_caption, cp.public_caption) ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
           or coalesce(cp.staging_caption, cp.public_caption) ~* '#(styledshoot|stylizedshoot|editorialwedding|editorialshoot|weddingflatlay|flatlaystyling|designerschallenge)\\y'
           then 'LIKELY'
         when cp.author_username in (select username from known_network_accounts)
           or coalesce(cp.staging_caption, cp.public_caption) ~* 'styl'
           then 'POSSIBLE'
         else 'NO_SIGNAL'
       end as bucket,
       cp.source
     from candidate_posts cp
     where (
       coalesce(cp.staging_caption, cp.public_caption) ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
       or coalesce(cp.staging_caption, cp.public_caption) ~* '#(styledshoot|stylizedshoot|editorialwedding|editorialshoot|weddingflatlay|flatlaystyling|designerschallenge)\\y'
       or cp.author_username in (select username from known_network_accounts)
       or coalesce(cp.staging_caption, cp.public_caption) ~* 'styl'
     )
     order by
       case when coalesce(cp.staging_caption, cp.public_caption) ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
         or coalesce(cp.staging_caption, cp.public_caption) ~* '#(styledshoot|stylizedshoot|editorialwedding|editorialshoot|weddingflatlay|flatlaystyling|designerschallenge)\\y'
       then 0 else 1 end,
       cp.post_url`
  );

  console.log(`[styled-shoot-queue] ${dryRun ? "DRY RUN — " : ""}pool=${rows.length} posts`);
  const byBucket = new Map<string, number>();
  for (const r of rows) byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + 1);
  console.log(`[styled-shoot-queue] by bucket: ${[...byBucket.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`);

  if (dryRun) {
    await closePool();
    return;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const res = await pool.query(
      `insert into label_queue (post_url, queue_version, bucket, source, rank)
       values ($1, $2, $3, $4, $5)
       on conflict (post_url, queue_version) do nothing`,
      [r.post_url, STYLED_SHOOT_QUEUE_VERSION, r.bucket, r.source, i + 1]
    );
    if (res.rowCount) inserted += res.rowCount;
  }
  console.log(`[styled-shoot-queue] inserted ${inserted} rows under queue_version=${STYLED_SHOOT_QUEUE_VERSION}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
