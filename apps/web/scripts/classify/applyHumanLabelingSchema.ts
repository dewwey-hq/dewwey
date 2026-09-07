/**
 * One-off, idempotent apply of the human-labeling-ui schema addition
 * (see pipeline/schema.sql, "Human post labeling" section) directly to
 * Supabase. This repo has no migrations mechanism -- schema.sql is the
 * single hand-maintained source, applied by a human/script when ready.
 * Safe to re-run: every statement is guarded (create type via a DO block
 * catching duplicate_object, tables/indexes via IF NOT EXISTS, the view via
 * CREATE OR REPLACE).
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/applyHumanLabelingSchema.ts
 */
import { getPool, closePool } from "./db";

const STATEMENTS: string[] = [
  `do $$ begin
     create type human_label_decision as enum (
       'WEDDING', 'NOT_WEDDING', 'UNSURE', 'UNVIEWABLE', 'SKIP'
     );
   exception when duplicate_object then null;
   end $$;`,
  `create table if not exists human_post_labels (
     id            bigint generated always as identity primary key,
     post_url      text not null,
     queue_version text,
     decision      human_label_decision not null,
     labeled_by    text not null,
     client_ms     integer,
     notes         text,
     labeled_at    timestamptz not null default now()
   );`,
  `alter table human_post_labels add column if not exists client_ms integer;`,
  `alter table human_post_labels add column if not exists notes text;`,
  `create index if not exists human_post_labels_post_url_labeled_at_idx
     on human_post_labels (post_url, labeled_at desc);`,
  `create index if not exists human_post_labels_labeled_by_queue_version_idx
     on human_post_labels (labeled_by, queue_version);`,
  `create or replace view human_post_labels_current as
     select distinct on (post_url) *
     from human_post_labels
     order by post_url, labeled_at desc;`,
  `create table if not exists label_queue (
     post_url      text not null,
     queue_version text not null,
     bucket        text not null,
     source        text not null default 'staging',
     rank          integer not null,
     added_at      timestamptz not null default now(),
     primary key (post_url, queue_version)
   );`,
  `alter table label_queue add column if not exists source text not null default 'staging';`,
  `create index if not exists label_queue_queue_version_rank_idx
     on label_queue (queue_version, rank);`,
  `comment on table human_post_labels is 'RAW (append-only): every human labeling action from the /label review UI -- never overwritten on relabel';`,
  `comment on view human_post_labels_current is 'DERIVED: latest human label per post_url';`,
  `comment on table label_queue is 'OPS: the frozen, resumable review order for a given queue_version, built by buildLabelingQueue.ts';`,
];

async function main() {
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  console.log("[apply-schema] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
