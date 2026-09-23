/**
 * D055 (2026-09-08) -- the revert half of batch provenance. Answers Ben's question
 * ("if we claim too many documented weddings, can we revert to what we had before?")
 * for any ONE creation run of createWeddingsFromJeremyEvidence.ts, identified by the
 * `--batch-id` it was run with (see that script's own comment + pipeline/schema.sql's
 * D055 entry for how batch_id gets there).
 *
 * For every `jeremy_weddings_created` row tagged with this batch_id:
 *   1. Collect the wedding's `wedding_posts` post ids and `wedding_vendors` account ids.
 *   2. Determine which of those posts (origin='jeremy_beta' only -- never Ben's own
 *      crawl) would become orphaned -- no OTHER wedding's `wedding_posts` still references
 *      them once this wedding's own rows are removed. A post can end up shared across
 *      weddings via later re-clustering, so this is computed per-wedding at delete time,
 *      not assumed 1:1.
 *   3. Insert one `weddings_retired_batches` row capturing all of the above (same
 *      log-before-delete shape as `orphaned_weddings_retired` and
 *      `non_wedding_posts_retired` -- see retireNonWeddingPosts.ts).
 *   4. Delete in FK-safe order: wedding_vendors -> wedding_posts -> jeremy_weddings_created row
 *      -> weddings row. POSTS ARE NEVER DELETED (post-table merge, plan rev 3, 2026-09-22): once
 *      `posts` is the whole corpus, a post left unattached by a revert is still a post we hold.
 *      Step 2's orphan set is still computed and printed (as posts_left_unattached) and logged in
 *      weddings_retired_batches.removed_posts_imported is now always empty.
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
 *
 * `--retire-verdicts` (D061, 2026-09-19): after the wedding revert above, for every post_url that
 * was attached (via wedding_posts) to a reverted wedding, look at its CURRENT verdict
 * (post_venue_verdicts_current). A model verdict (reviewed_by not 'jeremy' and not starting with
 * 'human' -- see isHumanReviewer) gets a superseding post_venue_verdicts row (verdict='SKIP',
 * reviewed_by='revert:<batch_id>') so candidate_review_derived stops reporting CONFIRM for a
 * wedding that no longer exists. A human verdict (reviewed_by='jeremy') is NEVER superseded --
 * printed as "human-confirmed, left in place" instead. Also, when the creation batch_id has the
 * `<acquisition-batch>-create-<n>` shape, sets `ops.crawl_runs.status='reverted'` for every run
 * whose batch_id equals the acquisition-batch prefix (a no-op, via to_regclass, when the ops
 * schema doesn't exist yet). Dry-run by default like the rest of this script; a "mixed" candidate
 * (its reverted wedding has both a post first-observed by this tick AND a pre-existing
 * staging-origin post) is printed in its own block, because reverting the tick retires a wedding
 * that staging evidence ALONE might eventually have created too.
 *
 * Usage:
 *   bun run scripts/graph/revertWeddingBatch.ts --batch-id <id> --retire-verdicts
 *   bun run scripts/graph/revertWeddingBatch.ts --batch-id <id> --retire-verdicts --execute
 */
import { getPool, closePool } from "../classify/db";

/** D061: 'jeremy' or anything 'human'-prefixed is a real human review, never superseded by
 * --retire-verdicts. Every other reviewed_by (haiku-extract-v1, fable-structured, ...) is a
 * model verdict. */
export function isHumanReviewer(reviewedBy: string): boolean {
  return reviewedBy === "jeremy" || reviewedBy.startsWith("human");
}

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
  const retireVerdicts = process.argv.includes("--retire-verdicts");

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
        `select id from posts where id = any($1::bigint[]) and origin = 'jeremy_beta'`,
        [allPostIds]
      );
      const jeremyPostIds = new Set(jeremyPosts.map((p) => p.id));
      orphanedIds = new Set(allPostIds.filter((id) => !survivorIds.has(id) && jeremyPostIds.has(id)));
    }

    // D061: which creation batches were touched (jeremy_weddings_created.batch_id may itself be
    // acquisition-tagged, e.g. acq-20260920-pilot-create-1), and, if so, the acquisition-tick
    // prefix (batch_id minus the trailing -create-<n>) whose ops.crawl_runs should be marked
    // reverted.
    const acquisitionBatchPrefix = batchId.match(/^(.*)-create-\d+$/)?.[1] ?? null;

    // D061 --retire-verdicts: post_urls attached to a reverted wedding, split into human-
    // confirmed (never touched) and model verdicts (superseded on --execute). Also detects
    // "mixed" candidates (a post first-observed by this acquisition tick alongside a
    // pre-existing staging-origin post on the SAME reverted wedding) -- both features are
    // no-ops when the relevant tables/columns don't exist yet (to_regclass-guarded).
    interface VerdictToSupersede {
      post_url: string;
      candidate_id: number;
      venue_account_id: number | null;
      reviewed_by: string;
    }
    let verdictsToSupersede: VerdictToSupersede[] = [];
    let humanConfirmedUrls: string[] = [];
    let postUrlById = new Map<number, string>();
    if ((retireVerdicts || acquisitionBatchPrefix) && allPostIds.length > 0) {
      const { rows: urlRows } = await client.query<{ id: number; url: string }>(
        `select id, url from posts where id = any($1::bigint[])`,
        [allPostIds]
      );
      postUrlById = new Map(urlRows.map((r) => [r.id, r.url]));
    }
    if (retireVerdicts && postUrlById.size > 0) {
      const allUrls = [...postUrlById.values()];
      const { rows: verdictRows } = await client.query<{
        post_url: string;
        candidate_id: number;
        venue_account_id: number | null;
        reviewed_by: string;
      }>(
        `select post_url, candidate_id, venue_account_id, reviewed_by
         from post_venue_verdicts_current
         where post_url = any($1::text[])
           -- Only the verdict that made the candidate CONFIRM. Superseding a NOT_WEDDING or
           -- OTHER_VENUE with SKIP loses information and leaves the candidate "undecided"
           -- (posts_decided < posts_total), so it would resurface in the human queue and block a
           -- re-creation -- found on the D061 rollback rehearsal (2026-09-19, 1 of 45 verdicts).
           and verdict = 'THIS_VENUE'`,
        [allUrls]
      );
      for (const v of verdictRows) {
        if (isHumanReviewer(v.reviewed_by)) humanConfirmedUrls.push(v.post_url);
        else verdictsToSupersede.push(v);
      }
    }

    const mixedCandidateIds = new Set<number>();
    if (acquisitionBatchPrefix && allPostIds.length > 0) {
      const { rows: opsGuard } = await client.query<{ ok: string | null }>(`select to_regclass('ops.post_observations')::text as ok`);
      if (opsGuard[0].ok) {
        const { rows: tickPosts } = await client.query<{ post_id: number }>(
          `select o.post_id
           from ops.post_observations o
           join ops.crawl_runs r on r.id = o.run_id
           where r.batch_id = $1 and o.post_id = any($2::bigint[])`,
          [acquisitionBatchPrefix, allPostIds]
        );
        const tickPostIds = new Set(tickPosts.map((r) => r.post_id));
        const { rows: stagingOriginPosts } = await client.query<{ id: number }>(
          `select id from posts where id = any($1::bigint[]) and origin = 'jeremy_beta'`,
          [allPostIds]
        );
        const stagingOriginIds = new Set(stagingOriginPosts.map((r) => r.id));
        for (const w of weddingsToRevert) {
          const hasTick = w.post_ids.some((id) => tickPostIds.has(id));
          const hasStaging = w.post_ids.some((id) => stagingOriginIds.has(id));
          if (hasTick && hasStaging) mixedCandidateIds.add(w.candidate_id);
        }
      }
    }

    console.log("\n[revert-wedding-batch] per-wedding plan:");
    for (const w of weddingsToRevert) {
      const orphanedForThis = w.post_ids.filter((id) => orphanedIds.has(id));
      totalPostsOrphaned += orphanedForThis.length;
      console.log(
        `  candidate=${w.candidate_id} wedding=${w.wedding_id} venue_id=${w.venue_id} ` +
          `event_date_est=${w.event_date_est} is_chicago=${w.is_chicago} ` +
          `wedding_posts=${w.post_ids.length} wedding_vendors=${w.vendor_account_ids.length} ` +
          `posts_left_unattached=${orphanedForThis.length} (${JSON.stringify(orphanedForThis)})` +
          `${mixedCandidateIds.has(w.candidate_id) ? " [MIXED: tick post + staging post]" : ""}`
      );
    }

    console.log(`\n[revert-wedding-batch] totals: weddings=${weddingsToRevert.length} ` +
      `wedding_posts_rows=${weddingsToRevert.reduce((n, w) => n + w.post_ids.length, 0)} ` +
      `wedding_vendors_rows=${weddingsToRevert.reduce((n, w) => n + w.vendor_account_ids.length, 0)} ` +
      `posts_deleted=0 posts_left_unattached=${totalPostsOrphaned} (posts are never deleted)`);

    if (mixedCandidateIds.size > 0) {
      console.log(
        `\n[revert-wedding-batch] MIXED candidates (tick post + staging post -- reverting the tick ` +
          `retires a wedding staging evidence alone might eventually have created too): ` +
          `${[...mixedCandidateIds].join(", ")}`
      );
    }

    if (retireVerdicts) {
      console.log(
        `\n[revert-wedding-batch] --retire-verdicts: ${verdictsToSupersede.length} model verdict(s) to supersede, ` +
          `${humanConfirmedUrls.length} human-confirmed (left in place)`
      );
      for (const v of verdictsToSupersede) {
        console.log(`  supersede: ${v.post_url} (was reviewed_by=${v.reviewed_by}) -> SKIP reviewed_by=revert:${batchId}`);
      }
      for (const u of humanConfirmedUrls) {
        console.log(`  human-confirmed, left in place: ${u}`);
      }
    }

    if (acquisitionBatchPrefix) {
      const { rows: crawlRunsGuard } = await client.query<{ ok: string | null }>(`select to_regclass('ops.crawl_runs')::text as ok`);
      if (crawlRunsGuard[0].ok) {
        const { rows: matchingRuns } = await client.query<{ id: number }>(
          `select id from ops.crawl_runs where batch_id = $1`,
          [acquisitionBatchPrefix]
        );
        console.log(
          `\n[revert-wedding-batch] acquisition-batch prefix '${acquisitionBatchPrefix}': ${matchingRuns.length} ops.crawl_runs row(s) to mark status='reverted'`
        );
      } else {
        console.log(
          `\n[revert-wedding-batch] acquisition-batch prefix '${acquisitionBatchPrefix}' derived, but ops.crawl_runs doesn't exist yet -- no-op`
        );
      }
    }

    if (execute) {
      for (const w of weddingsToRevert) {
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
            [], // removed_posts_imported: posts are never deleted (post-table merge, 2026-09-22)
            `revertWeddingBatch.ts --batch-id ${batchId} (D055)`,
          ]
        );

        await client.query(`delete from wedding_vendors where wedding_id = $1`, [w.wedding_id]);
        await client.query(`delete from wedding_posts where wedding_id = $1`, [w.wedding_id]);
        await client.query(`delete from jeremy_weddings_created where candidate_id = $1`, [w.candidate_id]);
        // D061: decisions are append-only history -- record the revert as its own decision row
        // (the CREATE row keeps its candidate/batch; its created_wedding_id becomes null via the
        // FK's on delete set null once the wedding row goes). Found by the pilot's rollback
        // rehearsal on 2026-09-19, where the original FK blocked the delete outright.
        if (acquisitionBatchPrefix && w.candidate_id != null) {
          const { rows: cdGuard } = await client.query<{ ok: string | null }>(`select to_regclass('ops.creation_decisions')::text as ok`);
          if (cdGuard[0].ok) {
            await client.query(
              `insert into ops.creation_decisions (batch_id, acquisition_batch_id, candidate_id, decision, matched_wedding_id, created_wedding_id, note)
               values ($1, $2, $3, 'REVERTED', null, null, $4)`,
              [batchId, acquisitionBatchPrefix, w.candidate_id, `revertWeddingBatch.ts --execute; reverted wedding ${w.wedding_id}`]
            );
          }
        }
        await client.query(`delete from weddings where id = $1`, [w.wedding_id]);
      }

      // D061 --retire-verdicts: superseding SKIP rows, written AFTER the wedding rows above are
      // gone (post_venue_verdicts has no FK to weddings, so ordering here is for narrative
      // clarity, not correctness).
      if (retireVerdicts) {
        for (const v of verdictsToSupersede) {
          await client.query(
            `insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, reviewed_by, notes)
             values ($1, $2, $3, 'SKIP', $4, $5)`,
            [
              v.post_url,
              v.candidate_id,
              v.venue_account_id,
              `revert:${batchId}`,
              `superseded by revertWeddingBatch.ts --batch-id ${batchId} --retire-verdicts (was reviewed_by=${v.reviewed_by})`,
            ]
          );
        }
        console.log(`[revert-wedding-batch] --retire-verdicts: superseded ${verdictsToSupersede.length} model verdict(s)`);
      }

      // D061: mark this tick's runs reverted, when derivable and the ops schema exists.
      if (acquisitionBatchPrefix) {
        const { rows: crawlRunsGuard } = await client.query<{ ok: string | null }>(`select to_regclass('ops.crawl_runs')::text as ok`);
        if (crawlRunsGuard[0].ok) {
          const { rows: updated } = await client.query<{ id: number }>(
            `update ops.crawl_runs set status = 'reverted' where batch_id = $1 returning id`,
            [acquisitionBatchPrefix]
          );
          console.log(`[revert-wedding-batch] marked ${updated.length} ops.crawl_runs row(s) status='reverted' (batch_id='${acquisitionBatchPrefix}')`);
        }
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

// Guarded (D061) so isHumanReviewer can be imported (e.g. by
// scripts/graph/acquisitionPlumbing.test.ts) without re-triggering a live revert run as a side
// effect of the import -- same convention as runJeremyWeddingClustering.ts/
// runJeremyWeddingReconciliation.ts's own guard.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
