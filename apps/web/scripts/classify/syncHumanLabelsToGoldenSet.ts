/**
 * Promotes the CURRENT state of human_post_labels (the append-only log
 * behind the /label review UI) into golden_set -- run on demand by a
 * human, never automatically, matching golden_set's own contract ("only a
 * human/labeling script touches this table") and loadGoldenSet.ts's exact
 * upsert style.
 *
 * Mapping: WEDDING->INCLUDE, NOT_WEDDING->EXCLUDE, UNSURE->REVIEW.
 * UNVIEWABLE and SKIP are never promoted -- they're technical outcomes,
 * not content judgments, and golden_set's post_decision enum has no room
 * for "couldn't assess."
 *
 * By default, posts already in golden_set are left untouched (skip) rather
 * than silently overwritten with a fast, no-reason, no-notes label -- pass
 * --overwrite-existing to opt into replacing them anyway.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/syncHumanLabelsToGoldenSet.ts --source-note human_review_ui_v1_2026-09-05
 *   bun run scripts/classify/syncHumanLabelsToGoldenSet.ts --source-note ... --overwrite-existing
 */
import { getPool, closePool } from "./db";

const DECISION_MAP: Record<string, "INCLUDE" | "EXCLUDE" | "REVIEW" | null> = {
  WEDDING: "INCLUDE",
  NOT_WEDDING: "EXCLUDE",
  UNSURE: "REVIEW",
  UNVIEWABLE: null,
  SKIP: null,
};

export function mapHumanLabelToDecision(
  decision: string
): "INCLUDE" | "EXCLUDE" | "REVIEW" | null {
  return DECISION_MAP[decision] ?? null;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    sourceNote: get("--source-note"),
    overwriteExisting: a.includes("--overwrite-existing"),
  };
}

async function main() {
  const args = parseArgs();
  if (!args.sourceNote) {
    console.error(
      "usage: syncHumanLabelsToGoldenSet.ts --source-note NOTE [--overwrite-existing]"
    );
    process.exit(1);
  }
  const pool = getPool();

  const { rows } = await pool.query<{
    post_url: string;
    decision: string;
    labeled_by: string;
    notes: string | null;
  }>(
    `select post_url, decision, labeled_by, notes
     from human_post_labels_current
     where decision in ('WEDDING', 'NOT_WEDDING', 'UNSURE')`
  );

  const existing = args.overwriteExisting
    ? new Set<string>()
    : new Set(
        (await pool.query<{ post_url: string }>(`select post_url from golden_set`)).rows.map(
          (r) => r.post_url
        )
      );

  let upserted = 0;
  let skippedExisting = 0;
  for (const r of rows) {
    if (!args.overwriteExisting && existing.has(r.post_url)) {
      skippedExisting++;
      continue;
    }
    const expectedDecision = mapHumanLabelToDecision(r.decision);
    if (!expectedDecision) continue; // defensive; the query already filters these out
    await pool.query(
      `insert into golden_set (post_url, expected_decision, exclusion_reason, notes, labeled_by, source_note)
       values ($1, $2, null, $3, $4, $5)
       on conflict (post_url) do update set
         expected_decision = excluded.expected_decision,
         exclusion_reason = excluded.exclusion_reason,
         notes = excluded.notes,
         labeled_by = excluded.labeled_by,
         labeled_at = now(),
         source_note = excluded.source_note`,
      [r.post_url, expectedDecision, r.notes, r.labeled_by, args.sourceNote]
    );
    upserted++;
  }

  console.log(
    `[sync-golden-set] upserted ${upserted} labels (source_note=${args.sourceNote}), ` +
      `skipped ${skippedExisting} already in golden_set` +
      (args.overwriteExisting ? " (--overwrite-existing was passed, so this should be 0)" : "")
  );
  await closePool();
}

// Guarded so mapHumanLabelToDecision can be imported for unit testing
// without triggering a live DB run as a side effect of the import.
// Portable entrypoint check (see buildLabelingQueue.ts for why not
// import.meta.main).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
