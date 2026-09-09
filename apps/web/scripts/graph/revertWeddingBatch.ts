/**
 * D055 (2026-09-08) -- the revert half of batch provenance. Answers Ben's question
 * ("if we claim too many documented weddings, can we revert to what we had before?")
 * for any ONE creation run of createWeddingsFromJeremyEvidence.ts, identified by the
 * `--batch-id` it was run with (see that script's own comment + pipeline/schema.sql's
 * D055 entry for how batch_id gets there).
 *
 * For every `jeremy_weddings_created` row tagged with this batch_id:
 *   1. Collect the wedding's `wedding_posts` post ids and `wedding_vendors` account ids.
 *   2. Determine which of those posts (source='jeremy_evidence' only -- never Ben's own
 *      crawl) would become orphaned -- no OTHER wedding's `wedding_posts` still references
 *      them once this wedding's own rows are removed. A post can end up shared across
 *      weddings via later re-clustering, so this is computed per-wedding at delete time,
 *      not assumed 1:1.
 *   3. Insert one `weddings_retired_batches` row capturing all of the above (same
 *      log-before-delete shape as `orphaned_weddings_retired` and
 *      `non_wedding_posts_retired` -- see retireNonWeddingPosts.ts).
 *   4. Delete in FK-safe order: wedding_vendors -> wedding_posts -> orphaned posts
 *      (source='jeremy_evidence' only) -> jeremy_weddings_created row -> weddings row.
 * Then `refresh materialized view edges` once at the end.
 *
 * Everything happens inside ONE transaction for the whole batch. Default is --dry-run
 * (prints exactly what would happen, then rolls back); --execute is required to actually
 * write. Refuses outright if the batch_id matches zero jeremy_weddings_created rows --
 * this script NEVER touches a wedding with no jeremy_weddings_created row at all (Ben's
 * 1,326 original-crawl weddings are the floor and are permanently out of scope here).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/revertWeddingBatch.ts --batch-id <id>              # dry run (default)
 *   bun run scripts/graph/revertWeddingBatch.ts --batch-id <id> --dry-run    # same, explicit
 *   bun run scripts/graph/revertWeddingBatch.ts --batch-id <id> --execute    # real write, human only
 */
import { getPool, closePool } from "../classify/db";

interface WeddingToRevert {
  candidate_id: number;
  wedding_id: number;
  venue_id: number | null;
  event_date_est: string | null;
  is_chicago: boolean | null;
  wedding_created_at: string;
  post_ids: number[];
  vendor_account_ids: number[];
}

async function main() {
  const batchIdFlagIndex = process.argv.indexOf("--batch-id");
  const batchId = batchIdFlagIndex !== -1 ? process.argv[batchIdFlagIndex + 1] : undefined;
  const execute = process.argv.includes("--execute");

  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[revert-wedding-batch] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/graph/revertWeddingBatch.ts --batch-id <id> [--execute]\n" +
        "Default (no --execute) is a dry run."
    );
    process.exit(1);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    console.log(`[revert-wedding-batch] mode: ${execute ? "EXECUTE (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[revert-wedding-batch] batch_id: ${batchId}`);

    const { rows: created } = await client.query<{
      candidate_id: number;
      wedding_id: number;
      created_at: string;
    }>(`select candidate_id, wedding_id, created_at::text from jeremy_weddings_created where batch_id = $1`, [
      batchId,
    ]);

    if (created.length === 0) {
      console.error(`[revert-wedding-batch] REFUSING: no jeremy_weddings_created rows match batch_id='${batchId}'. Nothing to revert.`);
      await client.query("rollback");
      process.exit(1);
    }

    console.log(`[revert-wedding-batch] found ${created.length} wedding(s) created by this batch`);

    const weddingIds = created.map((r) => r.wedding_id);

    // Safety invariant: every wedding this script is about to touch must have a
    // jeremy_weddings_created row (which we just selected them by) -- this query is a
    // belt-and-suspenders re-check that none of them are somehow also one of Ben's
    // 1,326 original-crawl weddings (which would mean the batch_id was reused/corrupted).
    const { rows: notJeremy } = await client.query<{ id: number }>(
      `select w.id from weddings w
       where w.id = any($1::bigint[])
         and not exists (select 1 from jeremy_weddings_created j where j.wedding_id = w.id)`,
      [weddingIds]
    );
    if (notJeremy.length > 0) {
      console.error(
        `[revert-wedding-batch] REFUSING: ${notJeremy.length} target wedding(s) have no jeremy_weddings_created row at all -- this should be impossible given the query above and would mean touching an original-crawl wedding. Aborting.`
      );
      await client.query("rollback");
      process.exit(1);
    }

    const weddingsToRevert: WeddingToRevert[] = [];
    let totalPostsOrphaned = 0;

    for (const row of created) {
      const { rows: weddingRows } = await client.query<{
        venue_id: number | null;
        event_date_est: string | null;
        is_chicago: boolean | null;
      }>(`select venue_id, event_date_est::text, is_chicago from weddings where id = $1`, [row.wedding_id]);
      if (weddingRows.length === 0) {
        console.log(`[revert-wedding-batch] candidate=${row.candidate_id} wedding=${row.wedding_id} -- weddings row already gone, skipping (jeremy_weddings_created row will still be cleaned up)`);
        weddingsToRevert.push({
          candidate_id: row.candidate_id,
          wedding_id: row.wedding_id,
          venue_id: null,
          event_date_est: null,
          is_chicago: null,
          wedding_created_at: row.created_at,
          post_ids: [],
          vendor_account_ids: [],
        });
        continue;
      }

      const { rows: postRows } = await client.query<{ post_id: number }>(
        `select post_id from wedding_posts where wedding_id = $1`,
        [row.wedding_id]
      );
      const { rows: vendorRows } = await client.query<{ account_id: number }>(
        `select account_id from wedding_vendors where wedding_id = $1`,
        [row.wedding_id]
      );

      weddingsToRevert.push({
        candidate_id: row.candidate_id,
        wedding_id: row.wedding_id,
        venue_id: weddingRows[0].venue_id,
        event_date_est: weddingRows[0].event_date_est,
        is_chicago: weddingRows[0].is_chicago,
        wedding_created_at: row.created_at,
        post_ids: postRows.map((p) => p.post_id),
        vendor_account_ids: vendorRows.map((v) => v.account_id),
      });
    }

    // For orphan detection, compute the FULL set of post_ids touched by this batch up front,
    // then for each one check whether ANY wedding_posts row referencing it survives OUTSIDE
    // this batch's own wedding ids -- a post shared between two weddings in the SAME batch
    // (both being removed) must still be recognized as orphaned, not protected by the other
    // batch member.
    const allPostIds = [...new Set(weddingsToRevert.flatMap((w) => w.post_ids))];
    let orphanedIds = new Set<number>();
    if (allPostIds.length > 0) {
      const { rows: survivors } = await client.query<{ post_id: number }>(
        `select distinct post_id from wedding_posts
         where post_id = any($1::bigint[]) and wedding_id <> all($2::bigint[])`,
        [allPostIds, weddingIds]
      );
      const survivorIds = new Set(survivors.map((s) => s.post_id));
      const { rows: jeremyPosts } = await client.query<{ id: number }>(
        `select id from posts where id = any($1::bigint[]) and source = 'jeremy_evidence'`,
        [allPostIds]
      );
      const jeremyPostIds = new Set(jeremyPosts.map((p) => p.id));
      orphanedIds = new Set(allPostIds.filter((id) => !survivorIds.has(id) && jeremyPostIds.has(id)));
    }

    console.log("\n[revert-wedding-batch] per-wedding plan:");
    for (const w of weddingsToRevert) {
      const orphanedForThis = w.post_ids.filter((id) => orphanedIds.has(id));
      totalPostsOrphaned += orphanedForThis.length;
      console.log(
        `  candidate=${w.candidate_id} wedding=${w.wedding_id} venue_id=${w.venue_id} ` +
          `event_date_est=${w.event_date_est} is_chicago=${w.is_chicago} ` +
          `wedding_posts=${w.post_ids.length} wedding_vendors=${w.vendor_account_ids.length} ` +
          `posts_to_delete=${orphanedForThis.length} (${JSON.stringify(orphanedForThis)})`
      );
    }

    console.log(`\n[revert-wedding-batch] totals: weddings=${weddingsToRevert.length} ` +
      `wedding_posts_rows=${weddingsToRevert.reduce((n, w) => n + w.post_ids.length, 0)} ` +
      `wedding_vendors_rows=${weddingsToRevert.reduce((n, w) => n + w.vendor_account_ids.length, 0)} ` +
      `posts_deleted=${totalPostsOrphaned}`);

    if (execute) {
      for (const w of weddingsToRevert) {
        const orphanedForThis = w.post_ids.filter((id) => orphanedIds.has(id));

        await client.query(
          `insert into weddings_retired_batches
             (batch_id, wedding_id, venue_id, event_date_est, is_chicago, wedding_created_at,
              candidate_id, post_ids, vendor_account_ids, removed_posts_imported, reason)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            batchId,
            w.wedding_id,
            w.venue_id,
            w.event_date_est,
            w.is_chicago,
            w.wedding_created_at,
            w.candidate_id,
            w.post_ids,
            w.vendor_account_ids,
            orphanedForThis,
            `revertWeddingBatch.ts --batch-id ${batchId} (D055)`,
          ]
        );

        await client.query(`delete from wedding_vendors where wedding_id = $1`, [w.wedding_id]);
        await client.query(`delete from wedding_posts where wedding_id = $1`, [w.wedding_id]);
        if (orphanedForThis.length > 0) {
          await client.query(
            `delete from posts where id = any($1::bigint[]) and source = 'jeremy_evidence'`,
            [orphanedForThis]
          );
        }
        await client.query(`delete from jeremy_weddings_created where candidate_id = $1`, [w.candidate_id]);
        await client.query(`delete from weddings where id = $1`, [w.wedding_id]);
      }

      await client.query("refresh materialized view edges");
      console.log("\n[revert-wedding-batch] refreshed materialized view edges");

      await client.query("commit");
      console.log("[revert-wedding-batch] COMMITTED");
    } else {
      await client.query("rollback");
      console.log("\n[revert-wedding-batch] DRY RUN — rolled back, nothing changed.");
      console.log(`[revert-wedding-batch] To actually apply this (human only): ! cd apps/web && bun run scripts/graph/revertWeddingBatch.ts --batch-id ${batchId} --execute`);
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
