import { describe, it, expect } from "vitest";
import {
  mulberry32,
  seedFromString,
  seededShuffle,
  dedupeQueueRows,
  type QueueRow,
} from "./buildLabelingQueue";

describe("seedFromString / mulberry32 (unit)", () => {
  it("is deterministic for the same seed string", () => {
    const a = seedFromString("v1");
    const b = seedFromString("v1");
    expect(a).toBe(b);
  });

  it("produces different seeds for different strings", () => {
    expect(seedFromString("v1")).not.toBe(seedFromString("v2"));
  });

  it("mulberry32 produces the same sequence for the same seed", () => {
    const seed = seedFromString("v1");
    const seqA = Array.from({ length: 5 }, mulberry32(seed));
    const seqB = Array.from({ length: 5 }, mulberry32(seed));
    expect(seqA).toEqual(seqB);
  });
});

describe("seededShuffle (unit)", () => {
  const input = Array.from({ length: 20 }, (_, i) => i);

  it("is a permutation of the input (same elements, same length)", () => {
    const shuffled = seededShuffle(input, seedFromString("v1"));
    expect(shuffled).toHaveLength(input.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
  });

  it("is reproducible: same seed produces the same order", () => {
    const a = seededShuffle(input, seedFromString("v1"));
    const b = seededShuffle(input, seedFromString("v1"));
    expect(a).toEqual(b);
  });

  it("different seeds (queue_versions) produce different orders", () => {
    const a = seededShuffle(input, seedFromString("v1"));
    const b = seededShuffle(input, seedFromString("v2"));
    expect(a).not.toEqual(b);
  });

  it("does not mutate the input array", () => {
    const copy = [...input];
    seededShuffle(input, seedFromString("v1"));
    expect(input).toEqual(copy);
  });
});

describe("dedupeQueueRows (unit)", () => {
  it("keeps the first row seen for a duplicate post_url", () => {
    const rows: QueueRow[] = [
      { post_url: "a", bucket: "random", source: "staging" },
      { post_url: "b", bucket: "v1_include", source: "staging" },
      { post_url: "a", bucket: "below_cutoff", source: "staging" }, // duplicate, later row should be dropped
    ];
    const deduped = dedupeQueueRows(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((r) => r.post_url === "a")?.bucket).toBe("random");
    expect(deduped.find((r) => r.post_url === "b")?.bucket).toBe("v1_include");
  });

  it("preserves rows with no duplicates unchanged", () => {
    const rows: QueueRow[] = [
      { post_url: "a", bucket: "random", source: "staging" },
      { post_url: "b", bucket: "v1_include", source: "staging" },
      { post_url: "c", bucket: "public_posts_random", source: "public" },
    ];
    expect(dedupeQueueRows(rows)).toEqual(rows);
  });

  it("handles an empty input", () => {
    expect(dedupeQueueRows([])).toEqual([]);
  });

  it("preserves the source of the row that's kept", () => {
    const rows: QueueRow[] = [
      { post_url: "a", bucket: "random", source: "staging" },
      { post_url: "a", bucket: "public_posts_random", source: "public" },
    ];
    const deduped = dedupeQueueRows(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].source).toBe("staging");
  });
});
