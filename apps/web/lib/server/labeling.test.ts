/**
 * Live-DB checks for the /label review UI's core guarantees: append-only
 * (a relabel never destroys the prior observation), the "current" view
 * resolves to the latest, and the queue-serving query correctly excludes
 * already-labeled posts. Follows graphStrengthening.test.ts's convention:
 * loads .env.local manually (vitest doesn't get Bun's automatic loading),
 * and every write here is scoped to a disposable fixture and cleaned up in
 * afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname);
const { getPool, closePool } = await import("../../scripts/classify/db");
const { getQueueBatch, recordLabel } = await import("./labeling");

const FIXTURE_QUEUE_VERSION = "test_fixture_labeling";
const FIXTURE_LABELED_BY = "test_fixture_labeler";

let fixturePostUrl: string;

beforeAll(async () => {
  const pool = getPool();
  const { rows } = await pool.query<{ post_url: string }>(
    `select post_url from staging.instagram_posts order by id limit 1`
  );
  if (!rows[0]) throw new Error("staging.instagram_posts is empty -- cannot pick a fixture post");
  fixturePostUrl = rows[0].post_url;

  await pool.query(
    `insert into label_queue (post_url, queue_version, bucket, rank)
     values ($1, $2, 'test', 1)
     on conflict (post_url, queue_version) do nothing`,
    [fixturePostUrl, FIXTURE_QUEUE_VERSION]
  );
}, 20000);

afterAll(async () => {
  const pool = getPool();
  await pool.query(`delete from human_post_labels where labeled_by = $1`, [FIXTURE_LABELED_BY]);
  await pool.query(`delete from label_queue where queue_version = $1`, [FIXTURE_QUEUE_VERSION]);
  await closePool();
});

describe("human_post_labels append-only guarantee (live DB)", () => {
  it("relabeling the same post_url inserts a new row rather than overwriting", async () => {
    const pool = getPool();
    await recordLabel(fixturePostUrl, "NOT_WEDDING", {
      queueVersion: FIXTURE_QUEUE_VERSION,
      labeledBy: FIXTURE_LABELED_BY,
    });
    await recordLabel(fixturePostUrl, "WEDDING", {
      queueVersion: FIXTURE_QUEUE_VERSION,
      labeledBy: FIXTURE_LABELED_BY,
    });

    const { rows } = await pool.query<{ decision: string }>(
      `select decision from human_post_labels where post_url = $1 and labeled_by = $2 order by labeled_at asc`,
      [fixturePostUrl, FIXTURE_LABELED_BY]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].decision).toBe("NOT_WEDDING");
    expect(rows[1].decision).toBe("WEDDING");
  });

  it("human_post_labels_current resolves to the most recent label", async () => {
    const pool = getPool();
    const { rows } = await pool.query<{ decision: string }>(
      `select decision from human_post_labels_current where post_url = $1 and labeled_by = $2`,
      [fixturePostUrl, FIXTURE_LABELED_BY]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].decision).toBe("WEDDING");
  });
});

describe("getQueueBatch (live DB)", () => {
  it("excludes a post once it has been labeled by that labeler", async () => {
    const beforeLabel = await getQueueBatch(50, {
      queueVersion: FIXTURE_QUEUE_VERSION,
      labeledBy: "someone_who_has_not_labeled_yet",
    });
    expect(beforeLabel.map((i) => i.post_url)).toContain(fixturePostUrl);

    const afterLabel = await getQueueBatch(50, {
      queueVersion: FIXTURE_QUEUE_VERSION,
      labeledBy: FIXTURE_LABELED_BY, // already labeled this in the block above
    });
    expect(afterLabel.map((i) => i.post_url)).not.toContain(fixturePostUrl);
  });
});
