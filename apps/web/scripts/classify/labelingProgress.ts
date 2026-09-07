/**
 * Console report on the /label review UI's progress -- matches the shape
 * of costReport.ts/errorAnalysis.ts (a report, not a dashboard).
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/labelingProgress.ts --queue-version v1
 */
import { getPool, closePool } from "./db";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { queueVersion: get("--queue-version") ?? "v1" };
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const { rows: totals } = await pool.query<{ n: string }>(
    `select count(*)::int as n from label_queue where queue_version = $1`,
    [args.queueVersion]
  );
  const total = Number(totals[0]?.n ?? 0);

  const { rows: byDecision } = await pool.query<{ decision: string; n: string }>(
    `select hpl.decision, count(*)::int as n
     from human_post_labels hpl
     where hpl.queue_version = $1
     group by hpl.decision
     order by n desc`,
    [args.queueVersion]
  );
  const labeled = byDecision.reduce((sum, r) => sum + Number(r.n), 0);

  console.log(`[labeling-progress] queue_version=${args.queueVersion}`);
  console.log(`  queue total: ${total}`);
  console.log(`  labeling actions recorded: ${labeled} (${total ? ((labeled / total) * 100).toFixed(1) : "0.0"}%)`);
  console.log(`  by decision:`);
  for (const r of byDecision) {
    console.log(`    ${r.decision}: ${r.n}`);
  }

  const { rows: byBucket } = await pool.query<{ bucket: string; total: string; labeled: string }>(
    `select lq.bucket,
            count(*)::int as total,
            count(hpl.id)::int as labeled
     from label_queue lq
     left join human_post_labels hpl
       on hpl.post_url = lq.post_url and hpl.queue_version = lq.queue_version
     where lq.queue_version = $1
     group by lq.bucket
     order by lq.bucket`,
    [args.queueVersion]
  );
  console.log(`  by bucket (labeled/total):`);
  for (const r of byBucket) {
    console.log(`    ${r.bucket}: ${r.labeled}/${r.total}`);
  }

  const { rows: throughputRows } = await pool.query<{
    first_at: string | null;
    last_at: string | null;
    n: string;
  }>(
    `select min(labeled_at) as first_at, max(labeled_at) as last_at, count(*)::int as n
     from human_post_labels where queue_version = $1`,
    [args.queueVersion]
  );
  const tp = throughputRows[0];
  if (tp?.first_at && tp?.last_at && Number(tp.n) > 1) {
    const spanMs = new Date(tp.last_at).getTime() - new Date(tp.first_at).getTime();
    const spanHours = spanMs / 3_600_000;
    const perHour = spanHours > 0 ? Number(tp.n) / spanHours : null;
    console.log(
      `  throughput: ${tp.n} labels over ${spanHours.toFixed(2)}h` +
        (perHour ? ` (~${perHour.toFixed(0)}/hour)` : "")
    );
  }

  // Scoped to THIS workstream's promoted rows only (the exact source_note
  // prefix syncHumanLabelsToGoldenSet.ts writes, e.g.
  // "human_review_ui_v1_2026-09-05") -- a loose "%v1%" substring match
  // would also catch unrelated pre-existing golden_set slices whose
  // source_note happens to contain "v1" (e.g. the 431-row dev_v1/
  // heldout_v1 adversarial set), silently corrupting this report.
  const sourceNotePrefix = `human_review_ui_${args.queueVersion}%`;
  const { rows: agreementCheck } = await pool.query<{ n: string }>(
    `select count(*)::int as n from golden_set where source_note like $1`,
    [sourceNotePrefix]
  );
  if (Number(agreementCheck[0]?.n ?? 0) === 0) {
    console.log(
      `  human-vs-model agreement: not available -- run syncHumanLabelsToGoldenSet.ts first`
    );
  } else {
    // Human-vs-V3 disagreement is a first-class metric, not a one-off --
    // this is the direct answer to "where is V3 actually failing," broken
    // down by sampling bucket so a systemic gap (e.g. the below_cutoff or
    // v1_exclude_review buckets) doesn't get averaged away into an
    // aggregate number.
    const { rows: confusion } = await pool.query<{
      bucket: string | null;
      expected_decision: string;
      v3_decision: string | null;
      n: string;
    }>(
      `select lq.bucket, gs.expected_decision, pc.decision as v3_decision, count(*)::int as n
       from golden_set gs
       left join label_queue lq on lq.post_url = gs.post_url and lq.queue_version = $2
       left join lateral (
         select pcr.decision from post_classification_runs pcr
         where pcr.post_url = gs.post_url and pcr.classifier_version = 'v3'
         order by pcr.classified_at desc limit 1
       ) pc on true
       where gs.source_note like $1
       group by lq.bucket, gs.expected_decision, pc.decision
       order by lq.bucket nulls last, gs.expected_decision, pc.decision`,
      [sourceNotePrefix, args.queueVersion]
    );
    console.log(`  human (golden_set) vs V3 confusion matrix, overall:`);
    const overall = new Map<string, number>();
    for (const r of confusion) {
      const key = `${r.expected_decision}|${r.v3_decision ?? "(no v3 run)"}`;
      overall.set(key, (overall.get(key) ?? 0) + Number(r.n));
    }
    for (const [key, n] of overall) {
      const [expected, v3] = key.split("|");
      console.log(`    human=${expected} v3=${v3}: ${n}`);
    }
    console.log(`  human (golden_set) vs V3 confusion matrix, by bucket:`);
    let currentBucket: string | null | undefined;
    for (const r of confusion) {
      if (r.bucket !== currentBucket) {
        currentBucket = r.bucket;
        console.log(`    [${r.bucket ?? "(not in this queue_version)"}]`);
      }
      console.log(`      human=${r.expected_decision} v3=${r.v3_decision ?? "(no v3 run)"}: ${r.n}`);
    }
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
