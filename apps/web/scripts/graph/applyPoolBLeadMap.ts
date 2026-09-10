/**
 * Apply the hand-verified pool-B lead map (tmp_analysis/poolb_lead_map_<date>.json, produced
 * by a read-only research pass + WebSearch on 2026-09-10) -- D055 stage 3, the step the
 * resolver deliberately leaves to a human/agent (D052 rule: no account is minted and no
 * geography is asserted without an independent check).
 *
 * Rows with decision `existing:<username>`: the venue the reader named IS an existing accounts
 * row under another name (Women's Athletic Club -> wacchicago, Butterfield CC ->
 * butterfieldcc_grounds, Cafe Brauer near-misses...). Writes extracted_venue_anchors
 * (resolved_by='hand', alias-aware) for the lead's posts, exactly as resolveDiscoveredVenues.ts
 * writes tier A/B, so the next clustering pass picks them up.
 *
 * Rows with decision `new:<handle>` whose evidence starts with "WebSearch confirmed": mints the
 * accounts row (no profile), an account_locations row (source='websearch', in_metro=true, city/
 * region from the map), and the anchors. Rows without that evidence prefix are skipped and
 * listed (they are re-verified by a separate agent pass first). `not_metro`/`unclear` rows are
 * never written. Additive, idempotent, dry-run by default.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyPoolBLeadMap.ts --map scripts/graph/tmp_analysis/poolb_lead_map_2026-09-10.json [--apply]
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

interface LeadRow {
  lead_name: string; decision: string; username?: string | null; city?: string | null;
  region?: string | null; evidence?: string | null; post_urls?: string[];
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mapPath = argValue("--map");
  if (!mapPath) throw new Error("--map <json> is required");
  const rows: LeadRow[] = JSON.parse(readFileSync(mapPath, "utf8"));
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    const existing = rows.filter((r) => r.decision.startsWith("existing") && r.username);
    const confirmedNew = rows.filter((r) => r.decision.startsWith("new") && r.username && (r.evidence ?? "").startsWith("WebSearch confirmed"));
    const unverifiedNew = rows.filter((r) => r.decision.startsWith("new") && !(r.evidence ?? "").startsWith("WebSearch confirmed"));
    console.log(`[lead-map] rows=${rows.length} existing=${existing.length} new(verified)=${confirmedNew.length} new(unverified, skipped)=${unverifiedNew.length}`);
    for (const r of unverifiedNew) console.log(`  skipped unverified: ${r.lead_name} -> @${r.username}`);

    let anchors = 0, minted = 0, located = 0, missing = 0;
    const resolve = async (username: string): Promise<string | null> => {
      const { rows: a } = await client.query<{ id: string }>(
        `select coalesce(al.canonical_account_id, a.id)::text as id from accounts a
         left join account_aliases al on al.alias_account_id = a.id where a.username = $1`, [username.toLowerCase()]);
      return a[0]?.id ?? null;
    };
    const writeAnchors = async (accountId: string, r: LeadRow) => {
      for (const url of r.post_urls ?? []) {
        const { rows: conf } = await client.query<{ confidence: number }>(
          `select confidence from post_extraction_runs where post_url = $1 and pool = 'pool-b' order by created_at desc limit 1`, [url]);
        if (apply) {
          const res = await client.query(
            `insert into extracted_venue_anchors (post_url, venue_account_id, source, confidence, venue_name_raw, resolved_by)
             values ($1, $2, 'extract-v1.2', $3, $4, 'hand') on conflict (post_url) do nothing`,
            [url, accountId, conf[0]?.confidence ?? 0.8, r.lead_name]);
          anchors += res.rowCount ?? 0;
        } else anchors++;
      }
    };
    for (const r of existing) {
      const id = await resolve(r.username!);
      if (!id) { missing++; console.log(`  MISSING account for existing:${r.username} (${r.lead_name})`); continue; }
      await writeAnchors(id, r);
    }
    for (const r of confirmedNew) {
      let id = await resolve(r.username!);
      if (!id) {
        if (apply) {
          const ins = await client.query<{ id: string }>(
            `insert into accounts (username) values ($1) on conflict (username) do update set username = excluded.username returning id::text`,
            [r.username!.toLowerCase()]);
          id = ins.rows[0].id; minted++;
        } else { minted++; id = "(new)"; }
      }
      if (apply && id !== "(new)") {
        const loc = await client.query(
          `insert into account_locations (account_id, city, region, source, in_metro, verified_at)
           values ($1, $2, $3, 'websearch', true, now()) on conflict (account_id) do nothing`, [id, r.city, r.region]);
        located += loc.rowCount ?? 0;
      } else located++;
      if (id !== "(new)") await writeAnchors(id, r); else anchors += (r.post_urls ?? []).length;
      console.log(`  new venue: ${r.lead_name} -> @${r.username} (${r.city}, ${r.region}) posts=${(r.post_urls ?? []).length}`);
    }
    console.log(`[lead-map] anchors=${anchors} accounts_minted=${minted} locations=${located} missing=${missing}`);
    if (apply) { await client.query("commit"); console.log(`[lead-map] COMMITTED`); }
    else { await client.query("rollback"); console.log(`[lead-map] DRY RUN -- nothing written`); }
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
  finally { client.release(); await closePool(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
