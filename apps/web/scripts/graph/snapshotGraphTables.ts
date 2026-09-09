/**
 * D055 (2026-09-08) -- a logical, read-only snapshot of the graph tables provenance/reversibility
 * work touches, as one gzipped CSV per table under
 * scripts/graph/snapshots/<ISO-timestamp>-<label>/. This is the other half of "can we revert":
 * `weddings_retired_batches` + `revertWeddingBatch.ts` can undo one Jeremy-evidence creation
 * batch precisely, but a snapshot is the fallback of last resort for anything that mechanism
 * doesn't cover (Supabase's free tier has no point-in-time recovery, so there is otherwise no
 * safety net at all).
 *
 * `pg` in this repo does not have `pg-copy-streams` as a dependency (checked package.json before
 * writing this), so this uses paginated `select * ... order by ctid limit/offset` rather than a
 * real `COPY ... TO STDOUT` stream -- acceptable at these sizes (thousands to tens of thousands
 * of rows per table, confirmed against a live count before choosing this approach over adding a
 * new dependency for a one-off tool). `ctid` gives deterministic pagination on tables without a
 * single-column primary key (wedding_posts, wedding_vendors are composite-keyed) without needing
 * per-table-shaped ORDER BY logic.
 *
 * Never writes to the DB -- every query here is a plain SELECT.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/snapshotGraphTables.ts
 *   bun run scripts/graph/snapshotGraphTables.ts --label pre-d055-phase1
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { PassThrough } from "node:stream";
import { getPool, closePool } from "../classify/db";

const TABLES = ["weddings", "wedding_posts", "wedding_vendors", "posts", "accounts", "jeremy_weddings_created"] as const;

const PAGE_SIZE = 2000;

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (Array.isArray(value)) {
    s = JSON.stringify(value);
  } else if (typeof value === "object") {
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  if (s === "") return '""'; // distinguish real empty string from NULL (unquoted empty)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function snapshotTable(pool: ReturnType<typeof getPool>, dir: string, table: string): Promise<number> {
  const { rows: countRows } = await pool.query<{ n: string }>(`select count(*)::text as n from ${table}`);
  const total = Number(countRows[0].n);

  const { fields } = await pool.query(`select * from ${table} limit 0`);
  const columns = fields.map((f) => f.name);

  const filePath = `${dir}/${table}.csv.gz`;
  const gzip = createGzip();
  const out = createWriteStream(filePath);
  const source = new PassThrough();
  const done = pipeline(source, gzip, out);

  source.write(columns.map(csvField).join(",") + "\n");

  let written = 0;
  for (let offset = 0; offset < total || offset === 0; offset += PAGE_SIZE) {
    const { rows } = await pool.query(
      `select * from ${table} order by ctid limit $1 offset $2`,
      [PAGE_SIZE, offset]
    );
    for (const row of rows) {
      source.write(columns.map((c) => csvField((row as Record<string, unknown>)[c])).join(",") + "\n");
      written++;
    }
    if (rows.length === 0) break;
  }

  source.end();
  await done;
  return written;
}

async function main() {
  const labelFlagIndex = process.argv.indexOf("--label");
  const label = labelFlagIndex !== -1 ? process.argv[labelFlagIndex + 1] : "snapshot";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dirName = `${timestamp}-${label}`;
  const dir = new URL(`./snapshots/${dirName}`, import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });

  const pool = getPool();
  console.log(`[snapshot] writing to ${dir}`);

  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const n = await snapshotTable(pool, dir, table);
    counts[table] = n;
    console.log(`[snapshot] ${table}: ${n} rows -> ${table}.csv.gz`);
  }

  console.log("\n[snapshot] row counts:");
  for (const table of TABLES) {
    console.log(`  ${table}: ${counts[table]}`);
  }
  console.log(`\n[snapshot] directory: ${dir}`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
