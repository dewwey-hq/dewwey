/**
 * One-off report: every NOT_WEDDING-labeled post that has a human note
 * attached. This is independent rediscovery of an already-flagged, never-
 * resolved open question (docs/engineering/graph-strengthening/README.md:
 * "EXCLUDE posts are almost as stack-rich as INCLUDE... a genuine open
 * question for later" and end of D016 in docs/decisions.md) -- whether
 * vendor-attributed content that isn't a real wedding (venue marketing,
 * styled/promotional shots) has product value for a DIFFERENT purpose.
 *
 * Deliberately NOT a new product surface or schema field -- just makes the
 * existing signal (already captured ad hoc in human_post_labels.notes)
 * visible, so a human can eyeball how often the pattern actually shows up
 * before deciding whether it's common enough to formalize.
 *
 * Usage (from apps/web): bun run scripts/graph/notedNonWeddingPosts.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();
  const { rows } = await pool.query<{
    post_url: string;
    notes: string;
    labeled_at: string;
  }>(
    `select post_url, notes, labeled_at
     from human_post_labels_current
     where decision = 'NOT_WEDDING' and notes is not null
     order by labeled_at asc`
  );

  console.log(`[noted-non-wedding] ${rows.length} NOT_WEDDING posts have a human note attached\n`);
  for (const r of rows) {
    console.log(`${r.post_url}`);
    console.log(`  note: ${r.notes}\n`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
