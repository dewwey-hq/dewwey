/**
 * Tick 5 of the non-wedding-posts mission
 * (docs/engineering/graph-strengthening/non-wedding-posts.md).
 *
 * Surgical retirement of confirmed non-wedding posts from the serving graph.
 * Default mode is --dry-run: runs the real SQL inside a transaction, prints
 * before/after counts and the provenance rows it WOULD write, then ROLLS
 * BACK. No commit happens unless --commit is passed explicitly by a human
 * (never from auto-mode — see docs/engineering/graph-strengthening/
 * non-wedding-posts.md Constraints: "Ask before any real DELETE/UPDATE on
 * Supabase").
 *
 * Candidate set is one of:
 *   - (default) data/non_wedding_delete_candidates.json, the union of:
 *       - role_shape_v1 (locked tick 4): every wedding where wedding_vendors'
 *         role set is a non-empty subset of {venue, band, musician} — auto,
 *         corpus-wide, 100% precision / 0 false-EXCLUDEs on tune+known-good+heldout.
 *       - hand-reviewed EXCLUDEs: the 11 original seeds + 34 hand-labeled
 *         similar-pool EXCLUDEs from tick 2, individually cited against
 *         labeling_rubric.md. NOT the raw caption-heuristic or same-venue
 *         buckets — only posts a human-equivalent label actually checked.
 *   - --from-audit=<path> (D057, Ben's crawl audit): a scripts/graph/auditBenWeddings.ts JSON
 *     report -- `{batch_id, weddings: [{wedding_id, decision, reason, venue, post_urls}, ...]}`
 *     (a bare array of those wedding rows is also accepted, batch id then taken from the
 *     filename). Only decision='retire' rows become candidates, their post_urls flattened into
 *     the SAME post-detach machinery below -- batch id = the audit JSON's own batch_id.
 *     Extra safety check no other candidate source needs: REFUSES (skips, with a printed
 *     warning, still --dry-run/--commit like everything else) any wedding that has a human
 *     WEDDING label on ANY of its posts (checked live against human_post_labels_current), even
 *     if the audit JSON itself says 'retire' -- a stale or hand-edited audit file must never
 *     override a human WEDDING call.
 *
 * For each candidate post_url: detach its wedding_posts row. If the
 * wedding then has 0 remaining posts, retire the weddings row and its
 * wedding_vendors rows too (never leave an empty wedding in the graph) --
 * also its wedding_vendor_credits and wedding_participants rows (D057: neither table existed
 * yet when tick 5 was first written, so the original cleanup never touched them; a
 * fully-retired wedding must not leave rows behind in either). Every retired id is logged into
 * non_wedding_posts_retired (created if missing, --commit only).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/retireNonWeddingPosts.ts                                   # dry run, default candidates file
 *   bun run scripts/graph/retireNonWeddingPosts.ts --commit                          # real write — human only
 *   bun run scripts/graph/retireNonWeddingPosts.ts --candidates=data/foo.json        # a later batch (e.g. a second user-flagged round)
 *   bun run scripts/graph/retireNonWeddingPosts.ts --from-audit=scripts/graph/tmp_analysis/d057_ben_audit_<batch>.json               # dry run
 *   bun run scripts/graph/retireNonWeddingPosts.ts --from-audit=scripts/graph/tmp_analysis/d057_ben_audit_<batch>.json --commit       # real write — human only
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { getPool, closePool } from "../classify/db";

const candidatesArg = process.argv.find((a) => a.startsWith("--candidates="));
const candidatesPath = candidatesArg
  ? candidatesArg.slice("--candidates=".length)
  : "./data/non_wedding_delete_candidates.json";

const fromAuditArg = process.argv.find((a) => a.startsWith("--from-audit="));
const fromAuditPath = fromAuditArg ? fromAuditArg.slice("--from-audit=".length) : undefined;

function shortcode(url: string): string {
  return url.match(/\/p\/([^/]+)/)![1];
}

interface AuditWeddingRow {
  wedding_id: number;
  decision: "retire" | "keep" | "human";
  reason: string;
  venue: string | null;
  post_urls: string[];
}

interface CandidateSource {
  post_urls: string[];
  /** Human-readable provenance string, stored verbatim in non_wedding_posts_retired.ruled_by. */
  batchLabel: string;
  /** D057 --from-audit only: weddings the audit JSON called 'retire' but this script refused to
   *  touch because at least one of their posts carries a live human WEDDING label. Always empty
   *  for the legacy candidates-file source (it was never audited at the wedding level). */
  refused: { wedding_id: number; post_urls: string[] }[];
}

/** Legacy default source: a flat {post_urls: string[]} candidates file (tick 5's original shape
 *  -- role_shape_v1 + hand-reviewed EXCLUDEs, or a later --candidates= batch of the same shape).
 *  Resolved relative to THIS FILE's location (scripts/graph/), same as it always has been. */
function loadLegacyCandidates(): CandidateSource {
  const parsed = JSON.parse(readFileSync(new URL(candidatesPath, import.meta.url), "utf8")) as {
    post_urls: string[];
  };
  return {
    post_urls: parsed.post_urls,
    batchLabel: candidatesArg ? `non-wedding-posts.md, batch: ${candidatesPath}` : "non-wedding-posts.md tick 5",
    refused: [],
  };
}

/** D057 --from-audit source: reads auditBenWeddings.ts's JSON report, keeps only decision=
 *  'retire' wedding rows, and flattens their post_urls into the same post-detach machinery every
 *  other candidate source uses. Resolved relative to the CURRENT WORKING DIRECTORY (a plain CLI
 *  file path), unlike --candidates='s script-relative resolution -- auditBenWeddings.ts's own
 *  printed output path is CWD-relative (scripts/graph/tmp_analysis/...), so this matches what a
 *  human would paste. The human-WEDDING refusal check queries human_post_labels_current live
 *  (not anything baked into the audit JSON), so it sees labels added after the audit ran. */
async function loadAuditCandidates(client: PoolClient, auditPath: string): Promise<CandidateSource> {
  const raw = JSON.parse(readFileSync(auditPath, "utf8"));
  const weddings: AuditWeddingRow[] = Array.isArray(raw) ? raw : raw.weddings;
  const batchId: string = !Array.isArray(raw) && raw.batch_id ? raw.batch_id : path.basename(auditPath, ".json");
  const retireRows = weddings.filter((w) => w.decision === "retire");

  const allPostUrls = [...new Set(retireRows.flatMap((w) => w.post_urls))];
  const humanWeddingUrls = new Set<string>();
  if (allPostUrls.length > 0) {
    const { rows } = await client.query(
      `select distinct post_url from human_post_labels_current
       where post_url = any($1::text[]) and decision = 'WEDDING'`,
      [allPostUrls]
    );
    for (const r of rows) humanWeddingUrls.add(r.post_url);
  }

  const post_urls: string[] = [];
  const refused: { wedding_id: number; post_urls: string[] }[] = [];
  for (const w of retireRows) {
    const protectedUrls = w.post_urls.filter((u) => humanWeddingUrls.has(u));
    if (protectedUrls.length > 0) {
      refused.push({ wedding_id: w.wedding_id, post_urls: protectedUrls });
      continue;
    }
    post_urls.push(...w.post_urls);
  }

  return {
    post_urls: [...new Set(post_urls)],
    batchLabel: `D057 Ben's crawl audit, batch: ${batchId} (${auditPath})`,
    refused,
  };
}

async function main() {
  const commit = process.argv.includes("--commit");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const source = fromAuditPath ? await loadAuditCandidates(client, fromAuditPath) : loadLegacyCandidates();
    const shorts = source.post_urls.map(shortcode);

    if (commit) {
      await client.query(`
        create table if not exists non_wedding_posts_retired (
          id            bigint generated always as identity primary key,
          post_url      text not null,
          shortcode     text not null,
          wedding_id    bigint not null,
          wedding_also_retired boolean not null,
          reason        text not null,
          ruled_by      text not null,
          retired_at    timestamptz not null default now()
        )
      `);
    }

    console.log(`[tick5] mode: ${commit ? "COMMIT (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[tick5] candidate source: ${source.batchLabel}`);
    console.log(`[tick5] candidate posts: ${shorts.length}`);
    if (source.refused.length > 0) {
      console.log(
        `[tick5] REFUSED ${source.refused.length} wedding(s) with a human WEDDING label on at least one post (not touched):`
      );
      for (const r of source.refused) {
        console.log(`    wedding=${r.wedding_id} protected_post_urls=${JSON.stringify(r.post_urls)}`);
      }
    }

    const { rows: before } = await client.query(`
      select
        (select count(*) from weddings)::int as n_weddings,
        (select count(*) from wedding_posts)::int as n_wedding_posts,
        (select count(*) from wedding_vendors)::int as n_wedding_vendors,
        (select count(*) from wedding_vendor_credits)::int as n_wedding_vendor_credits,
        (select count(*) from wedding_participants)::int as n_wedding_participants
    `);
    console.log("[tick5] before:", before[0]);

    const { rows: targets } = await client.query(
      `select p.id as post_id, p.shortcode, wp.wedding_id
       from posts p
       join wedding_posts wp on wp.post_id = p.id
       where p.shortcode = any($1::text[])`,
      [shorts]
    );
    const missing = shorts.filter((s) => !targets.some((t) => t.shortcode === s));
    if (missing.length) console.log("[tick5] WARNING: not found on any wedding_posts row (already retired?):", missing);

    for (const t of targets) {
      await client.query(`delete from wedding_posts where post_id = $1`, [t.post_id]);
    }

    // Re-check remaining post count AFTER all of this batch's deletes, not a
    // per-post pre-count — a wedding with 2+ candidate posts in the SAME
    // batch (e.g. duplicate posts of one non-wedding event) would otherwise
    // never be recognized as empty, leaving an orphaned weddings row behind.
    const affectedWeddingIds = [...new Set(targets.map((t) => String(t.wedding_id)))];
    const { rows: remaining } = await client.query(
      `select wedding_id, count(*)::int as n
       from wedding_posts where wedding_id = any($1::bigint[])
       group by wedding_id`,
      [affectedWeddingIds]
    );
    const remainingById = new Map(remaining.map((r: any) => [String(r.wedding_id), r.n]));
    const weddingsFullyRetired = new Set(
      affectedWeddingIds.filter((wid) => (remainingById.get(wid) ?? 0) === 0)
    );

    const provenance = targets.map((t) => ({
      post_url: `https://www.instagram.com/p/${t.shortcode}/`,
      shortcode: t.shortcode,
      wedding_id: String(t.wedding_id),
      wedding_also_retired: weddingsFullyRetired.has(String(t.wedding_id)),
    }));

    // D057: a fully-retired wedding must not leave rows behind in wedding_vendor_credits or
    // wedding_participants either -- see the file-header comment.
    let vendorCreditsDeleted = 0;
    let participantsDeleted = 0;
    for (const wid of weddingsFullyRetired) {
      const vc = await client.query(`delete from wedding_vendor_credits where wedding_id = $1`, [wid]);
      const wpr = await client.query(`delete from wedding_participants where wedding_id = $1`, [wid]);
      vendorCreditsDeleted += vc.rowCount ?? 0;
      participantsDeleted += wpr.rowCount ?? 0;
      await client.query(`delete from wedding_vendors where wedding_id = $1`, [wid]);
      await client.query(`delete from weddings where id = $1`, [wid]);
    }

    if (commit) {
      for (const p of provenance) {
        await client.query(
          `insert into non_wedding_posts_retired (post_url, shortcode, wedding_id, wedding_also_retired, reason, ruled_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            p.post_url,
            p.shortcode,
            p.wedding_id,
            p.wedding_also_retired,
            fromAuditPath
              ? "D057 Ben's crawl audit — auditBenWeddings.ts decideWedding()='retire'"
              : "non_wedding_posts mission (D040) — role_shape_v1 or hand-labeled EXCLUDE",
            source.batchLabel,
          ]
        );
      }
    }

    const { rows: after } = await client.query(`
      select
        (select count(*) from weddings)::int as n_weddings,
        (select count(*) from wedding_posts)::int as n_wedding_posts,
        (select count(*) from wedding_vendors)::int as n_wedding_vendors,
        (select count(*) from wedding_vendor_credits)::int as n_wedding_vendor_credits,
        (select count(*) from wedding_participants)::int as n_wedding_participants
    `);
    console.log("[tick5] after (within transaction):", after[0]);
    console.log(`[tick5] posts detached: ${provenance.length}`);
    console.log(`[tick5] weddings fully retired (0 posts left): ${weddingsFullyRetired.size}`);
    console.log(
      "[tick5] weddings fully retired ids:",
      [...weddingsFullyRetired].sort((a, b) => Number(a) - Number(b))
    );
    console.log(`[tick5] wedding_vendor_credits rows deleted: ${vendorCreditsDeleted}`);
    console.log(`[tick5] wedding_participants rows deleted: ${participantsDeleted}`);

    if (!candidatesArg && !fromAuditPath) {
      // Only meaningful for the original tick-5 file, where seeds are always first 11.
      const seedShorts = new Set(shorts.slice(0, 11));
      const seedsDetached = provenance.filter((p) => seedShorts.has(p.shortcode)).length;
      console.log(`[tick5] of the 11 original seeds, detached this run: ${seedsDetached}/11`);
    }

    if (commit) {
      await client.query("commit");
      console.log("[tick5] COMMITTED. Run: cd apps/web && bun run scripts/graph/refreshEdges.ts (or `refresh materialized view edges` directly) to refresh edges.");
    } else {
      await client.query("rollback");
      console.log("[tick5] DRY RUN complete — rolled back, nothing changed.");
      const commitCmd = fromAuditPath
        ? `bun run scripts/graph/retireNonWeddingPosts.ts --commit --from-audit=${fromAuditPath}`
        : candidatesArg
          ? `bun run scripts/graph/retireNonWeddingPosts.ts --commit --candidates=${candidatesPath}`
          : "bun run scripts/graph/retireNonWeddingPosts.ts --commit";
      console.log(`[tick5] To actually apply this (human only, not auto-mode): ! cd apps/web && ${commitCmd}`);
    }
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
