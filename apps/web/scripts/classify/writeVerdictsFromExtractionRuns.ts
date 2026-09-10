/**
 * Replay the reader's stored results into post_venue_verdicts (D055, 2026-09-10).
 *
 * Why: two anchored corpus reads (the pool-B follow-up, 264 posts, $1.51) were run without
 * --write-verdicts, so their THIS_VENUE results sit in post_extraction_runs with no verdict
 * row, and createWeddingsFromJeremyEvidence.ts sees nothing. Re-reading would cost the same
 * again; the stored result is the same model output the runner would have written.
 *
 * Gate is identical to the runner's writeVerdictIfEligible + decideVerdictWrite, restricted
 * to the only class the model is trusted on: THIS_VENUE at confidence >= threshold (default
 * 0.8), on an anchored candidate (candidate_id set, pool not 'pool-b'), for posts with no
 * verdict from any reviewer yet. reviewed_by='haiku-extract-v1', notes in the runner's format.
 * Idempotent; dry-run by default.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/writeVerdictsFromExtractionRuns.ts [--since '2026-09-10 15:00'] [--threshold 0.8] [--apply]
 */
import { getPool, closePool } from "./db";
import { EXTRACT_PROMPT_VERSION } from "./extractPrompt";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const threshold = Number(argValue("--threshold") ?? "0.8");
  const since = argValue("--since") ?? "2026-09-10 00:00";
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    const { rows } = await client.query<{
      post_url: string; candidate_id: string; venue_account_id: string | null; confidence: number;
      evidence: string; clustering_version: string; username: string;
    }>(
      `select distinct on (r.post_url)
              r.post_url, r.candidate_id::text, c.venue_account_id::text, r.confidence,
              coalesce(r.result->>'evidence','') as evidence, c.clustering_version, a.username::text
       from post_extraction_runs r
       join jeremy_wedding_candidates c on c.id = r.candidate_id
       left join accounts a on a.id = c.venue_account_id
       where r.prompt_version = $1
         and coalesce(r.pool, '') <> 'pool-b'
         and r.verdict = 'THIS_VENUE'
         and r.confidence >= $2
         and r.created_at >= $3::timestamptz
         and not exists (select 1 from post_venue_verdicts_current v where v.post_url = r.post_url)
       order by r.post_url, r.created_at desc`,
      [EXTRACT_PROMPT_VERSION, threshold, since]
    );
    const byVersion = new Map<string, number>();
    for (const r of rows) byVersion.set(r.clustering_version, (byVersion.get(r.clustering_version) ?? 0) + 1);
    console.log(`[replay-verdicts] eligible THIS_VENUE >= ${threshold} since ${since}: ${rows.length} posts ${JSON.stringify(Object.fromEntries(byVersion))}`);
    const byVenue = new Map<string, number>();
    for (const r of rows) byVenue.set(r.username, (byVenue.get(r.username) ?? 0) + 1);
    for (const [u, n] of [...byVenue.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  @${u}: ${n}`);
    if (apply) {
      let written = 0;
      for (const r of rows) {
        await client.query(
          `insert into post_venue_verdicts
             (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
           values ($1,$2,$3,'THIS_VENUE',null,'haiku-extract-v1',$4)`,
          [r.post_url, r.candidate_id, r.venue_account_id, `${EXTRACT_PROMPT_VERSION} conf=${Number(r.confidence).toFixed(2)}: ${r.evidence}`]
        );
        written++;
      }
      await client.query("commit");
      console.log(`[replay-verdicts] COMMITTED: written=${written}`);
    } else {
      await client.query("rollback");
      console.log(`[replay-verdicts] DRY RUN -- would write ${rows.length} verdicts; nothing written`);
    }
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
