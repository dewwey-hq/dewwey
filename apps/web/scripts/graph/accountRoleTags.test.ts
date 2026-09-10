/**
 * Pure-function tests for accountRoleTags.ts. No DB -- see that file's header for why
 * these are split out.
 */
import { describe, it, expect } from "vitest";
import {
  weddingCreditConfidence,
  pickTopRoles,
  diffTopRoles,
  type RoleVote,
} from "./accountRoleTags";

describe("weddingCreditConfidence", () => {
  it("1 wedding -> 0.65", () => {
    expect(weddingCreditConfidence(1)).toBeCloseTo(0.65, 10);
  });
  it("3 weddings -> 0.95 (exactly hits the cap)", () => {
    expect(weddingCreditConfidence(3)).toBeCloseTo(0.95, 10);
  });
  it("10 weddings -> 0.95 (capped, doesn't exceed)", () => {
    expect(weddingCreditConfidence(10)).toBe(0.95);
  });
  it("0 weddings -> 0.5 (formula floor, though callers never pass 0)", () => {
    expect(weddingCreditConfidence(0)).toBeCloseTo(0.5, 10);
  });
});

describe("pickTopRoles", () => {
  it("picks the row with the highest evidence_count per account", () => {
    const rows: RoleVote[] = [
      { accountId: 1, role: "venue", source: "stack_regex", confidence: 0.8, evidenceCount: 3 },
      { accountId: 1, role: "florist", source: "wedding_credit", confidence: 0.95, evidenceCount: 17 },
    ];
    const top = pickTopRoles(rows);
    expect(top.get(1)).toMatchObject({ role: "florist", evidenceCount: 17 });
  });

  it("breaks an evidence_count tie by confidence desc", () => {
    const rows: RoleVote[] = [
      { accountId: 1, role: "venue", source: "manual", confidence: 0.9, evidenceCount: 5 },
      { accountId: 1, role: "planner", source: "wedding_credit", confidence: 0.95, evidenceCount: 5 },
    ];
    const top = pickTopRoles(rows);
    expect(top.get(1)?.role).toBe("planner");
  });

  it("keeps accounts independent", () => {
    const rows: RoleVote[] = [
      { accountId: 1, role: "venue", source: "stack_regex", confidence: 0.8, evidenceCount: 3 },
      { accountId: 2, role: "dj", source: "stack_regex", confidence: 0.65, evidenceCount: 1 },
    ];
    const top = pickTopRoles(rows);
    expect(top.size).toBe(2);
    expect(top.get(2)?.role).toBe("dj");
  });
});

describe("diffTopRoles", () => {
  it("classifies sprouthomechicago-style venue -> florist", () => {
    const before = pickTopRoles([
      { accountId: 1, role: "venue", source: "stack_regex", confidence: 0.95, evidenceCount: 3 },
    ]);
    const after = pickTopRoles([
      { accountId: 1, role: "venue", source: "stack_regex", confidence: 0.95, evidenceCount: 3 },
      { accountId: 1, role: "florist", source: "wedding_credit", confidence: 0.95, evidenceCount: 17 },
    ]);
    const changes = diffTopRoles(before, after);
    expect(changes).toEqual([
      { accountId: 1, wasRole: "venue", wasEvidence: 3, becomesRole: "florist", becomesEvidence: 17 },
    ]);
  });

  it("classifies fschicago-style other -> venue", () => {
    const before = pickTopRoles([
      { accountId: 2, role: "other", source: "stack_regex", confidence: 0.95, evidenceCount: 3 },
    ]);
    const after = pickTopRoles([
      { accountId: 2, role: "other", source: "stack_regex", confidence: 0.95, evidenceCount: 3 },
      { accountId: 2, role: "venue", source: "wedding_credit", confidence: 0.95, evidenceCount: 27 },
    ]);
    const changes = diffTopRoles(before, after);
    expect(changes).toEqual([
      { accountId: 2, wasRole: "other", wasEvidence: 3, becomesRole: "venue", becomesEvidence: 27 },
    ]);
  });

  it("does not report an account with no before entry as a change", () => {
    const before = pickTopRoles([]);
    const after = pickTopRoles([
      { accountId: 3, role: "venue", source: "wedding_credit", confidence: 0.95, evidenceCount: 5 },
    ]);
    expect(diffTopRoles(before, after)).toEqual([]);
  });

  it("does not report an account whose top role is unchanged", () => {
    const before = pickTopRoles([
      { accountId: 4, role: "venue", source: "stack_regex", confidence: 0.8, evidenceCount: 3 },
    ]);
    const after = pickTopRoles([
      { accountId: 4, role: "venue", source: "stack_regex", confidence: 0.8, evidenceCount: 3 },
      { accountId: 4, role: "venue", source: "wedding_credit", confidence: 0.95, evidenceCount: 30 },
    ]);
    expect(diffTopRoles(before, after)).toEqual([]);
  });

  it("does not report an account missing from after", () => {
    const before = pickTopRoles([
      { accountId: 5, role: "venue", source: "stack_regex", confidence: 0.8, evidenceCount: 3 },
    ]);
    const after = pickTopRoles([]);
    expect(diffTopRoles(before, after)).toEqual([]);
  });
});
