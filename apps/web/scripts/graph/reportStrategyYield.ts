/**
 * STRATEGY YIELD (post-table merge P6, 2026-09-23) -- which ways of pulling posts produce credible
 * weddings, measured on ONE table with ONE truth layer.
 *
 * Unit: a post counts for the channel/batch whose sighting is its `is_first` observation (the sighting
 * under which the row entered our records -- ops.post_observations). Its outcome comes from
 * post_truth, split by tier so a model-labelled wedding is never reported as if a human confirmed it:
 *   gold_w / gold_nw   human-labelled wedding / not-wedding
 *   silver_w           model verdict, wedding attachment (no human label)
 *   bronze_w           only clustered into a wedding candidate
 * Channels: every acquisition batch (acq-%) is a strategy and gets weddings/$ (gold+silver weddings
 * per dollar of that batch's runs). The legacy-import channels (Jeremy's beta own-profile scrape,
 * Ben's pipeline crawl) and run 31 are shown as channels, never ranked by w/$ -- they have no cost.
 *
 * Read-only. Usage (from apps/web): bun run scripts/graph/reportStrategyYield.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("begin read only");
    await c.query("set local statement_timeout = '600s'");
    const { rows } = await c.query(`
      with first_seen as (
        select o.post_id, r.batch_id, r.actor
        from ops.post_observations o join ops.crawl_runs r on r.id = o.run_id
        where o.is_first
      ), cost as (
        select batch_id, sum(cost_usd)::numeric(10,2) usd from ops.crawl_runs group by 1
      )
      select f.batch_id,
             case when f.batch_id like 'acq-%' then 'strategy' else 'channel' end as kind,
             count(*)::int posts,
             count(*) filter (where t.tier = 'gold' and t.label = 'wedding')::int gold_w,
             count(*) filter (where t.tier = 'gold' and t.label = 'not_wedding')::int gold_nw,
             count(*) filter (where t.tier = 'silver' and t.label = 'wedding')::int silver_w,
             count(*) filter (where t.tier = 'bronze')::int bronze_w,
             count(*) filter (where t.label = 'unknown')::int unknown,
             max(c.usd) usd
      from first_seen f
      join post_truth t on t.post_id = f.post_id
      left join cost c on c.batch_id = f.batch_id
      group by 1, 2
      order by 2, 1`);
    const pad = (s: unknown, n: number) => String(s ?? "").padEnd(n);
    console.log(`| batch / channel | kind | posts | gold W | gold not-W | silver W | bronze W | unknown | $ | (gold+silver) W per post | W/$ |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
    const strategies = rows
      .map((r) => {
        const w = r.gold_w + r.silver_w;
        const usd = r.usd == null ? null : Number(r.usd);
        return { ...r, w, per_post: r.posts ? w / r.posts : 0, per_usd: r.kind === "strategy" && usd ? w / usd : null };
      })
      .sort((a, b) => (a.kind === b.kind ? (b.per_usd ?? -1) - (a.per_usd ?? -1) : a.kind === "strategy" ? -1 : 1));
    for (const r of strategies)
      console.log(
        `| ${pad(r.batch_id, 36)} | ${r.kind} | ${r.posts} | ${r.gold_w} | ${r.gold_nw} | ${r.silver_w} | ${r.bronze_w} | ${r.unknown} | ${r.usd ?? "-"} | ${r.per_post.toFixed(3)} | ${r.per_usd == null ? "-" : r.per_usd.toFixed(1)} |`
      );
    console.log(
      `\nW = weddings (gold = human-labelled, silver = model/attachment). Channels (legacy imports) are context, not strategies: no cost, never ranked.` +
        `\nGold not-W is the credibility signal a model cannot give you: how often humans rejected what a channel brought in.`
    );
    await c.query("commit");
  } finally {
    c.release();
    await closePool();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
