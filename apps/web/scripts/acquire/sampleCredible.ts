/**
 * ACQUISITION LOOP (D065) -- hand the human N posts the MODEL believes are real weddings, as one
 * `/label/candidates?post=` URL, so its positive calls can be verified before we scale an arm.
 *
 * Why the positives specifically. `/label/candidates?spotcheck=<batch>` is the blind instrument
 * (every model verdict, keeps and rejects alike) and it is the right one for measuring agreement --
 * it is what month 1's 95% bar was set on. But the question before spending is narrower: *of the
 * posts we are about to turn into weddings, how many are really weddings?* That is THIS_VENUE
 * precision, and sampling only THIS_VENUE answers it with every slot in the sample. Use both: this
 * for "are the weddings real", spotcheck for "is the model calibrated".
 *
 * Only verdicts the reader actually WROTE appear here, and it only writes at confidence >= its
 * threshold (0.8), so "credible" needs no confidence column -- the write itself is the filter.
 * Posts a human already touched (ever, under any reviewer) are excluded so the sample stays fresh.
 * Sampling is `md5(post_url)`, so the same batches give the same sample on a re-run.
 *
 * Read-only. Prints the URL, and a per-arm count so an arm's precision can be read separately.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/sampleCredible.ts --batches acq-20260920-d065A,acq-20260920-d065C --n 20
 *   bun run scripts/acquire/sampleCredible.ts --batches <ids> --n 20 --verdict THIS_VENUE --base http://localhost:3000
 */
import { getPool, closePool } from "../classify/db";

/** Pure: an Instagram post URL -> the shortcode `/label/candidates?post=` expects. */
export function shortcodeFromUrl(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Pure: spread N slots over arms as evenly as the available counts allow, largest remainder to the
 * arms that still have posts left. An arm with fewer credible posts than its share does not steal
 * slots from the others -- its leftovers are redistributed. */
export function allocateSlots(available: Map<string, number>, n: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of available.keys()) out.set(k, 0);
  let remaining = n;
  // Round-robin is the simplest thing that is exactly fair and self-limiting at each arm's supply.
  let progress = true;
  while (remaining > 0 && progress) {
    progress = false;
    for (const [k, have] of available) {
      if (remaining === 0) break;
      if ((out.get(k) ?? 0) < have) {
        out.set(k, (out.get(k) ?? 0) + 1);
        remaining--;
        progress = true;
      }
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const batches = (get("--batches") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const n = Number(get("--n") ?? "20");
  const verdict = get("--verdict") ?? "THIS_VENUE";
  const base = get("--base") ?? "http://localhost:3000";
  if (batches.length === 0 || !Number.isFinite(n) || n <= 0) {
    console.error(
      "Usage: bun run scripts/acquire/sampleCredible.ts --batches <id,id,...> [--n 20] [--verdict THIS_VENUE] [--base http://localhost:3000]"
    );
    process.exit(2);
  }

  const pool = getPool();
  try {
    // Per batch, the model's `verdict` calls on posts FIRST-observed by that batch that no human has
    // ever touched. Ordered by md5 so the sample is stable across re-runs.
    const { rows } = await pool.query<{
      batch_id: string;
      post_url: string;
      venue_username: string | null;
      owner_username: string | null;
      current_wedding_count: number;
    }>(
      `with runs as (select id, batch_id from ops.crawl_runs where batch_id = any($1::text[])),
       fo as (
         select r.batch_id, p.url
         from ops.post_observations o join runs r on r.id = o.run_id join posts p on p.id = o.post_id
         where o.is_first
       )
       select fo.batch_id, pvc.post_url,
              a.username::text as venue_username,
              sp.owner_username,
              (select count(*)::int from weddings w where w.venue_id = pvc.venue_account_id) as current_wedding_count
       from fo
       join post_venue_verdicts_current pvc on pvc.post_url = fo.url
       left join accounts a on a.id = pvc.venue_account_id
       left join v_ig_posts sp on sp.post_url = pvc.post_url
       where pvc.verdict = $2
         and pvc.reviewed_by <> 'jeremy' and pvc.reviewed_by not like 'human%'
         and not exists (
           select 1 from post_venue_verdicts pv2
           where pv2.post_url = pvc.post_url
             and (pv2.reviewed_by = 'jeremy' or pv2.reviewed_by like 'human%')
         )
       order by fo.batch_id, md5(pvc.post_url)`,
      [batches, verdict]
    );

    const byBatch = new Map<string, typeof rows>();
    for (const b of batches) byBatch.set(b, [] as unknown as typeof rows);
    for (const r of rows) byBatch.get(r.batch_id)?.push(r);

    const available = new Map([...byBatch].map(([b, rs]) => [b, rs.length]));
    const slots = allocateSlots(available, n);

    const picked: typeof rows = [] as unknown as typeof rows;
    for (const [b, k] of slots) picked.push(...(byBatch.get(b) ?? []).slice(0, k));

    console.log(`[sample-credible] verdict=${verdict} requested=${n} picked=${picked.length}`);
    for (const b of batches) {
      console.log(`  ${b}: ${slots.get(b) ?? 0} picked of ${available.get(b) ?? 0} available credible`);
    }
    if (picked.length === 0) {
      console.log("[sample-credible] nothing to sample -- has the reader written verdicts for these batches yet?");
      return;
    }

    console.log(`\n  # | batch | venue (@handle, weddings now) | posted by | post`);
    picked.forEach((r, i) => {
      const arm = r.batch_id.replace(/^acq-\d+-/, "");
      console.log(
        `  ${String(i + 1).padStart(2)} | ${arm} | @${r.venue_username ?? "?"} (${r.current_wedding_count}) | @${r.owner_username ?? "?"} | ${r.post_url}`
      );
    });

    const shortcodes = picked.map((r) => shortcodeFromUrl(r.post_url)).filter((s): s is string => s !== null);
    const skipped = picked.length - shortcodes.length;
    if (skipped > 0) console.log(`\n[sample-credible] ${skipped} post url(s) had no parseable shortcode and were dropped from the link`);
    console.log(`\nOpen all ${shortcodes.length} in the labeller (one post per screen):\n\n${base}/label/candidates?post=${shortcodes.join(",")}\n`);
    console.log(`Blind per-arm spot-check (every model verdict, keeps AND rejects -- the agreement instrument):`);
    for (const b of batches) console.log(`  ${base}/label/candidates?spotcheck=${b}&n=20`);
  } finally {
    await closePool();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
