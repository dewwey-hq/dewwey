import { describe, expect, it } from "vitest";
import { inputHash } from "./inputHash";

describe("inputHash", () => {
  it("is order-independent over snapshotShas", () => {
    const a = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "haiku", snapshotShas: ["bbb", "aaa", "ccc"] });
    const b = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "haiku", snapshotShas: ["ccc", "aaa", "bbb"] });
    expect(a).toBe(b);
  });

  it("changes when the snapshot set changes", () => {
    const a = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "haiku", snapshotShas: ["aaa", "bbb"] });
    const b = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "haiku", snapshotShas: ["aaa", "bbb", "ccc"] });
    expect(a).not.toBe(b);
  });

  it("changes when the prompt version changes", () => {
    const a = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "haiku", snapshotShas: ["aaa"] });
    const b = inputHash({ schemaVersion: 3, promptVersion: "v2", model: "haiku", snapshotShas: ["aaa"] });
    expect(a).not.toBe(b);
  });

  it("changes when the model changes", () => {
    const a = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "haiku", snapshotShas: ["aaa"] });
    const b = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "sonnet", snapshotShas: ["aaa"] });
    expect(a).not.toBe(b);
  });

  it("changes when the schema version changes", () => {
    const a = inputHash({ schemaVersion: 3, promptVersion: "v1", model: "haiku", snapshotShas: ["aaa"] });
    const b = inputHash({ schemaVersion: 4, promptVersion: "v1", model: "haiku", snapshotShas: ["aaa"] });
    expect(a).not.toBe(b);
  });

  it("is deterministic (same inputs -> same hash) and a 64-char lowercase hex sha256", () => {
    const params = { schemaVersion: 3, promptVersion: "venue-details-v3.0", model: "haiku-4.5", snapshotShas: ["deadbeef", "feedface"] };
    const a = inputHash(params);
    const b = inputHash(params);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
