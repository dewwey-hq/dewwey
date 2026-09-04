/**
 * Loads a hand-labeled golden set file into the golden_set table. This is
 * the ONLY script allowed to write golden_set — no classifier ever does
 * (see pipeline/schema.sql). Upserts by post_url so re-running after fixing
 * a label is safe.
 *
 * data/golden_set_v0.json is a bootstrap set: 120 posts stratified by
 * location_tag presence (Chicago-tagged / other-tagged / untagged, 40 each)
 * from staging.instagram_posts, hand-labeled by reading the actual caption/
 * hashtag/location/mention/account data for each post (see
 * docs/engineering/post-classification/README.md for the full reasoning).
 * It is a starting regression set, not a finished one — expand it with
 * sampleForReview.ts output reviewed by an actual human before trusting
 * eval numbers against it for a ship decision.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/loadGoldenSet.ts data/golden_set_v0.json --labeled-by claude-bootstrap-v0
 */
import { readFileSync } from "fs";
import { getPool, closePool } from "./db";

interface GoldenEntry {
  post_url: string;
  expected_decision: "INCLUDE" | "EXCLUDE" | "REVIEW";
  exclusion_reason: string | null;
  notes: string | null;
}

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error("usage: loadGoldenSet.ts <path.json> [--labeled-by NAME] [--source-note NOTE]");
    process.exit(1);
  }
  const get = (flag: string) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const labeledBy = get("--labeled-by") ?? "unknown";
  const sourceNote = get("--source-note") ?? "bootstrap_v0";

  const entries: GoldenEntry[] = JSON.parse(readFileSync(file, "utf8"));
  const pool = getPool();

  let inserted = 0;
  for (const e of entries) {
    await pool.query(
      `insert into golden_set (post_url, expected_decision, exclusion_reason, notes, labeled_by, source_note)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (post_url) do update set
         expected_decision = excluded.expected_decision,
         exclusion_reason = excluded.exclusion_reason,
         notes = excluded.notes,
         labeled_by = excluded.labeled_by,
         labeled_at = now(),
         source_note = excluded.source_note`,
      [e.post_url, e.expected_decision, e.exclusion_reason, e.notes, labeledBy, sourceNote]
    );
    inserted++;
  }
  console.log(`[golden-set] upserted ${inserted} labels from ${file} (labeled_by=${labeledBy})`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
