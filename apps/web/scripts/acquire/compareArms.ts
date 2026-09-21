/**
 * ACQUISITION LOOP (D065) -- compare several acquisition batches ("arms") on IDENTICAL metrics.
 *
 * Why this exists rather than reading three `reportAcquisitionFunnel.ts` outputs side by side:
 * the funnel is per-batch and computes a venue's "before" count as `now - createdHere`, which is
 * correct in isolation but wrong across arms. If arm A and arm C both create weddings at the same
 * thin venue, each one's `before` silently includes the OTHER arm's creations, so a venue can be
 * credited to both arms, to neither, or to whichever happened to run second. That is exactly the
 * number the $13.06 allocation turns on, so it gets measured once, jointly.
 *
 * The rule here: every arm is scored against ONE shared baseline -- each venue's wedding count
 * excluding weddings created by ANY compared arm. An arm's "crossed 1-5 -> 6+" is then the venues
 * where baseline was 1..5 and baseline + THAT ARM's creations >= 6. This gives each arm honest
 * marginal credit from the same starting line. Venues that two arms would each push over are
 * reported separately as `overlap`, and the `UNION` row shows the combined effect, so double
 * counting is visible instead of hidden.
 *
 * Read-only. Every metric traces to a table, and arms with no creation runs print zeros, not errors.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/compareArms.ts --batches acq-20260920-d065A,acq-20260920-d065C,acq-20260920-d065D
 *   bun run scripts/acquire/compareArms.ts --batches a,b --labels "A: depth,C: vendor" --out arms.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const OUT_DIR = new URL("../graph/tmp_analysis/", import.meta.url).pathname;

/** A venue bucket crossing. `from` is the shared-baseline count, `to` is baseline + this arm. */
export interface Crossing {
  venue_id: number;
  from: number;
  to: number;
}

export interface ArmMetrics {
  batch_id: string;
  label: string;
  feed: string;
  accounts: number;
  cost_usd: number;
  fetched: number;
  new_posts: number;
  already_had: number;
  stack_posts: number;
  candidates: number;
  weddings_created: number;
  weddings_at_thin: number;
  crossed_0_to_1: Crossing[];
  crossed_1_5_to_6: Crossing[];
  venues_touched: number;
}

/** Pure: the bucket a wedding count falls in, using the coverage bands STATE.md reports. */
export function bucket(n: number): "0" | "1-5" | "6-15" | "16-49" | "50+" {
  if (n <= 0) return "0";
  if (n <= 5) return "1-5";
  if (n <= 15) return "6-15";
  if (n <= 49) return "16-49";
  return "50+";
}

/**
 * Pure: score one arm's crossings against a shared baseline.
 * `baseline` = venue -> wedding count excluding EVERY compared arm's creations.
 * `armCreated` = venue -> weddings this arm created.
 */
export function scoreCrossings(
  baseline: Map<number, number>,
  armCreated: Map<number, number>
): { crossed_0_to_1: Crossing[]; crossed_1_5_to_6: Crossing[] } {
  const crossed_0_to_1: Crossing[] = [];
  const crossed_1_5_to_6: Crossing[] = [];
  for (const [venue_id, created] of armCreated) {
    if (created <= 0) continue;
    const from = baseline.get(venue_id) ?? 0;
    const to = from + created;
    if (from === 0 && to >= 1) crossed_0_to_1.push({ venue_id, from, to });
    else if (from >= 1 && from <= 5 && to >= 6) crossed_1_5_to_6.push({ venue_id, from, to });
  }
  const byVenue = (a: Crossing, b: Crossing) => a.venue_id - b.venue_id;
  return { crossed_0_to_1: crossed_0_to_1.sort(byVenue), crossed_1_5_to_6: crossed_1_5_to_6.sort(byVenue) };
}

function usage(): never {
  console.error(
    "[compare-arms] Usage:\n" +
      "  bun run scripts/acquire/compareArms.ts --batches <id,id,...> [--labels \"a,b,...\"] [--out <file.md>]\n"
  );
  process.exit(2);
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const batches = (get("--batches") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (batches.length === 0) usage();
  const labels = (get("--labels") ?? "").split(",").map((s) => s.trim());

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '180s'`);

    // ---- Per-arm ingest + parse + cluster counts, all scoped to the batch's FIRST-observed posts
    // (the same worklist every downstream stage uses, so spend is credited to the first sighting).
    const { rows: ingestRows } = await client.query(
      `with runs as (select id, batch_id, feed, cost_usd from ops.crawl_runs where batch_id = any($1::text[])),
       fo as (
         select r.batch_id, p.id post_id, p.url
         from ops.post_observations o join runs r on r.id = o.run_id join posts p on p.id = o.post_id
         where o.is_first
       )
       select r.batch_id,
              max(r.feed) as feed,
              (select count(distinct s.account_id) from ops.crawl_run_seeds s join runs r2 on r2.id = s.run_id where r2.batch_id = r.batch_id)::int accounts,
              (select coalesce(sum(r3.cost_usd),0) from runs r3 where r3.batch_id = r.batch_id)::float cost_usd,
              (select coalesce(sum(s.fetched),0) from ops.crawl_run_seeds s join runs r2 on r2.id = s.run_id where r2.batch_id = r.batch_id)::int fetched,
              (select coalesce(sum(s.new_posts),0) from ops.crawl_run_seeds s join runs r2 on r2.id = s.run_id where r2.batch_id = r.batch_id)::int new_posts,
              (select coalesce(sum(s.already_had),0) from ops.crawl_run_seeds s join runs r2 on r2.id = s.run_id where r2.batch_id = r.batch_id)::int already_had,
              (select count(distinct fo.post_id) from fo join stack_extraction_runs x on x.post_url = fo.url and x.has_stack where fo.batch_id = r.batch_id)::int stack_posts,
              (select count(distinct cp.candidate_id) from fo join jeremy_wedding_candidate_posts cp on cp.source_post_url = fo.url where fo.batch_id = r.batch_id)::int candidates
       from runs r group by r.batch_id`,
      [batches]
    );
    const ingestByBatch = new Map<string, any>(ingestRows.map((r) => [r.batch_id, r]));

    // ---- Every wedding created by ANY compared arm, with its venue. `batch_id like '<arm>-create-%'`
    // is the same attribution the funnel uses.
    const { rows: createdRows } = await client.query(
      `select jwc.wedding_id, w.venue_id, jwc.batch_id
       from jeremy_weddings_created jwc join weddings w on w.id = jwc.wedding_id
       where ${batches.map((_, i) => `jwc.batch_id like $${i + 1}`).join(" or ")}`,
      batches.map((b) => `${b}-create-%`)
    );
    /** arm batch_id -> venue_id -> weddings created (a wedding with a null venue can't move coverage). */
    const createdByArm = new Map<string, Map<number, number>>(batches.map((b) => [b, new Map()]));
    const armWeddings = new Map<string, Set<number>>(batches.map((b) => [b, new Set()]));
    for (const r of createdRows) {
      const arm = batches.find((b) => r.batch_id.startsWith(`${b}-create-`));
      if (!arm) continue;
      armWeddings.get(arm)!.add(Number(r.wedding_id));
      if (r.venue_id === null) continue;
      const m = createdByArm.get(arm)!;
      const v = Number(r.venue_id);
      m.set(v, (m.get(v) ?? 0) + 1);
    }

    // ---- The SHARED baseline: each touched venue's wedding count MINUS every compared arm's
    // creations. One starting line for all arms; see the file header for why this is not `now - mine`.
    const touchedVenues = [...new Set([...createdByArm.values()].flatMap((m) => [...m.keys()]))];
    const baseline = new Map<number, number>();
    if (touchedVenues.length > 0) {
      const allArmWeddingIds = [...new Set([...armWeddings.values()].flatMap((s) => [...s]))];
      const { rows: nowRows } = await client.query(
        `select venue_id, count(*)::int n from weddings
         where venue_id = any($1::bigint[]) and not (id = any($2::bigint[])) group by venue_id`,
        [touchedVenues, allArmWeddingIds]
      );
      for (const v of touchedVenues) baseline.set(v, 0);
      for (const r of nowRows) baseline.set(Number(r.venue_id), r.n);
    }

    const arms: ArmMetrics[] = batches.map((b, i) => {
      const ing = ingestByBatch.get(b);
      const created = createdByArm.get(b)!;
      const { crossed_0_to_1, crossed_1_5_to_6 } = scoreCrossings(baseline, created);
      let weddings_at_thin = 0;
      for (const [venue_id, n] of created) if ((baseline.get(venue_id) ?? 0) < 6) weddings_at_thin += n;
      return {
        batch_id: b,
        label: labels[i] || b,
        feed: ing?.feed ?? "n/a",
        accounts: ing?.accounts ?? 0,
        cost_usd: ing?.cost_usd ?? 0,
        fetched: ing?.fetched ?? 0,
        new_posts: ing?.new_posts ?? 0,
        already_had: ing?.already_had ?? 0,
        stack_posts: ing?.stack_posts ?? 0,
        candidates: ing?.candidates ?? 0,
        weddings_created: armWeddings.get(b)!.size,
        weddings_at_thin,
        crossed_0_to_1,
        crossed_1_5_to_6,
        venues_touched: created.size,
      };
    });

    // ---- The union arm: all compared arms' creations combined against the same baseline. If the
    // union's crossings are fewer than the per-arm sum, arms are competing for the same venues.
    const unionCreated = new Map<number, number>();
    for (const m of createdByArm.values()) for (const [v, n] of m) unionCreated.set(v, (unionCreated.get(v) ?? 0) + n);
    const unionCross = scoreCrossings(baseline, unionCreated);
    const perArmSum6 = arms.reduce((a, r) => a + r.crossed_1_5_to_6.length, 0);
    const overlapVenues = [...unionCreated.keys()].filter(
      (v) => arms.filter((a) => (createdByArm.get(a.batch_id)!.get(v) ?? 0) > 0).length > 1
    );

    // ---- Render. Per-dollar numbers use ops.crawl_runs.cost_usd, which is the CONSERVATIVE
    // PRICE_USD projection, not the ~21%-lower rate actually billed -- identical basis for every
    // arm, so the ranking is unaffected even though the absolute $ is slightly pessimistic.
    const fmt = (n: number, d = 2) => n.toFixed(d);
    const rate = (num: number, den: number, d = 2) => (den > 0 ? fmt(num / den, d) : "n/a");
    const headline = arms
      .map((a) => {
        const perDollar = a.cost_usd > 0 ? a.weddings_created / a.cost_usd : 0;
        const thinPerDollar = a.cost_usd > 0 ? a.weddings_at_thin / a.cost_usd : 0;
        return `| ${a.label} | ${a.feed} | ${a.accounts} | $${fmt(a.cost_usd)} | ${a.fetched} | ${a.new_posts} | ${a.stack_posts} | ${a.candidates} | **${a.weddings_created}** | ${rate(a.weddings_created, a.new_posts, 3)} | **${rate(a.weddings_created, a.cost_usd, 1)}** | ${a.cost_usd > 0 && a.weddings_created > 0 ? "$" + fmt(a.cost_usd / a.weddings_created) : "n/a"} | ${a.weddings_at_thin} | ${rate(a.weddings_at_thin, a.cost_usd, 1)} | **${a.crossed_1_5_to_6.length}** | ${a.crossed_0_to_1.length} |`;
      })
      .join("\n");

    const detail = arms
      .map((a) => {
        const c6 = a.crossed_1_5_to_6.map((c) => `${c.venue_id} (${c.from}->${c.to})`).join(", ") || "(none)";
        const c1 = a.crossed_0_to_1.map((c) => `${c.venue_id} (0->${c.to})`).join(", ") || "(none)";
        return `### ${a.label} \`${a.batch_id}\`\n\n- venues touched by its created weddings: ${a.venues_touched}\n- crossed **1-5 -> 6+**: ${c6}\n- crossed 0 -> 1: ${c1}\n- already-held share of fetched: ${rate(100 * a.already_had, a.fetched, 1)}%`;
      })
      .join("\n\n");

    const md = `# D065 arm comparison -- identical metrics

Arms: ${arms.map((a) => `\`${a.batch_id}\``).join(", ")}. Generated ${new Date().toISOString()}.

Scoring rule: every arm is measured against ONE shared baseline -- each venue's wedding count
excluding weddings created by **any** compared arm -- so no arm's "before" is polluted by another's
creations. \`$\` is \`ops.crawl_runs.cost_usd\` (the conservative PRICE_USD projection, identical
basis across arms).

## Headline

| Arm | Feed | Accts | $ | Fetched | New | Stack | Cand | Weddings | w/new post | **weddings/$** | $/wedding | w at <6 venues | thin-w/$ | **crossed 1-5 -> 6+** | crossed 0 -> 1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${headline}

## Overlap check (is the per-arm credit double counted?)

- Per-arm sum of \`crossed 1-5 -> 6+\`: **${perArmSum6}**
- UNION of all arms' creations against the same baseline: **${unionCross.crossed_1_5_to_6.length}** crossings (0->1: ${unionCross.crossed_0_to_1.length})
- Venues created into by more than one arm: **${overlapVenues.length}**${overlapVenues.length ? ` (${overlapVenues.join(", ")})` : ""}
- ${
      unionCross.crossed_1_5_to_6.length === perArmSum6
        ? "Union equals the per-arm sum: the arms are NOT competing for the same crossings, so per-arm credit is clean."
        : `Union (${unionCross.crossed_1_5_to_6.length}) differs from the per-arm sum (${perArmSum6}): the arms share venues, so read the per-arm crossing counts as marginal-from-baseline, not additive.`
    }

## Per arm

${detail}
`;

    console.log(md);
    const today = new Date().toISOString().slice(0, 10);
    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = get("--out") ?? `${OUT_DIR}arm_comparison_${today}.md`;
    writeFileSync(outPath, md);
    console.log(`[compare-arms] wrote ${outPath}`);
  } finally {
    client.release();
    await closePool();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
