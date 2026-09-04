/**
 * Loads human-labeled vendor-extraction ground truth (chunk_N_labeled.json,
 * produced by independent caption review — NOT the parser's own output)
 * into vendor_extraction_golden_set. Mirrors classify/loadGoldenSet.ts's
 * role: the only writer of this table, append-only via source_note
 * versioning (never overwrite a prior batch's rows).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/loadVendorGoldenSet.ts --labeled-by claude-vendor-gs-v1 --source-note vendor_gs_v1
 */
import { readFileSync, readdirSync } from "fs";
import { getPool, closePool } from "../classify/db";

interface Judgment {
  handle: string;
  is_vendor: boolean;
  expected_role: string | null;
  is_part_of_wedding: string; // "true" | "false" | "unsure"
  in_parser_extraction: boolean;
  notes?: string;
}

interface LabeledPost {
  post_url: string;
  stratum: string;
  split: string;
  post_level_notes?: string;
  judgments: Judgment[];
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    labeledBy: get("--labeled-by") ?? "unknown",
    sourceNote: get("--source-note") ?? "vendor_gs_v1",
    dir: get("--dir") ?? "scripts/graph/data/labeling_chunks",
  };
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const files = readdirSync(args.dir).filter((f) => f.endsWith("_labeled.json"));
  console.log(`[load-vendor-gs] found ${files.length} labeled chunk files in ${args.dir}`);

  let posts = 0;
  let rows = 0;
  for (const file of files) {
    const posts_: LabeledPost[] = JSON.parse(readFileSync(`${args.dir}/${file}`, "utf8"));
    for (const p of posts_) {
      posts++;
      for (const j of p.judgments) {
        await pool.query(
          `insert into vendor_extraction_golden_set
             (post_url, handle, expected_role, is_vendor, is_part_of_wedding, in_parser_extraction,
              notes, post_level_notes, stratum, split, labeled_by, source_note)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (post_url, handle, source_note) do update set
             expected_role = excluded.expected_role, is_vendor = excluded.is_vendor,
             is_part_of_wedding = excluded.is_part_of_wedding, in_parser_extraction = excluded.in_parser_extraction,
             notes = excluded.notes, post_level_notes = excluded.post_level_notes, labeled_at = now()`,
          [
            p.post_url,
            j.handle.toLowerCase(),
            j.expected_role,
            j.is_vendor,
            j.is_part_of_wedding,
            j.in_parser_extraction,
            j.notes ?? null,
            p.post_level_notes ?? null,
            p.stratum,
            p.split,
            args.labeledBy,
            args.sourceNote,
          ]
        );
        rows++;
      }
    }
  }

  console.log(`[load-vendor-gs] DONE — loaded ${posts} posts, ${rows} handle judgments as source_note=${args.sourceNote}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
