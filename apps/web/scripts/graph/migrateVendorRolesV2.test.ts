/**
 * Pure-function tests for vendorRoleMigration.ts (migrateVendorRolesV2.ts's helpers). No DB --
 * see that file's header for why these are split out. Named migrateVendorRolesV2.test.ts per the
 * D056 stage-2 task spec, mirroring the runner it tests.
 */
import { describe, it, expect } from "vitest";
import {
  isProtectedWedding,
  isProtectedByHumanVerdict,
  applyHotelRule,
  detectCeremonyReceptionSplit,
  decideCeremonyVenueIdMove,
  diffRoleSets,
  venueRoleEvidenceCount,
  type ProtectedWeddingFacts,
  type CreditRoleRow,
  type CeremonyReceptionSplit,
} from "./vendorRoleMigration";

const NO_FACTS: ProtectedWeddingFacts = {
  hasHumanThisVenueVerdict: false,
  hasHumanPostLabel: false,
  hasStructuralVenueAnchor: false,
  hasExtractedVenueAnchor: false,
  venueIsAliasAccount: false,
  venueHasWebVerifiedLocation: false,
};

describe("isProtectedWedding", () => {
  it("is not protected when every fact is false", () => {
    expect(isProtectedWedding(NO_FACTS)).toBe(false);
  });

  it("is protected on a human THIS_VENUE verdict alone", () => {
    expect(isProtectedWedding({ ...NO_FACTS, hasHumanThisVenueVerdict: true })).toBe(true);
  });

  it("is protected on a human_post_labels row alone", () => {
    expect(isProtectedWedding({ ...NO_FACTS, hasHumanPostLabel: true })).toBe(true);
  });

  it("is protected on a structural (location_tag/author/extracted) venue anchor alone", () => {
    expect(isProtectedWedding({ ...NO_FACTS, hasStructuralVenueAnchor: true })).toBe(true);
  });

  it("is protected on an extracted_venue_anchors row alone", () => {
    expect(isProtectedWedding({ ...NO_FACTS, hasExtractedVenueAnchor: true })).toBe(true);
  });

  it("is protected when the venue account is an alias pair member alone", () => {
    expect(isProtectedWedding({ ...NO_FACTS, venueIsAliasAccount: true })).toBe(true);
  });

  it("is protected when the venue account has a websearch/google_maps location alone", () => {
    expect(isProtectedWedding({ ...NO_FACTS, venueHasWebVerifiedLocation: true })).toBe(true);
  });

  it("is protected when multiple facts are true at once", () => {
    expect(
      isProtectedWedding({ ...NO_FACTS, hasHumanThisVenueVerdict: true, venueIsAliasAccount: true })
    ).toBe(true);
  });
});

describe("isProtectedByHumanVerdict", () => {
  it("false when neither human-verdict fact is set, even if other protection facts are", () => {
    expect(
      isProtectedByHumanVerdict({ ...NO_FACTS, hasStructuralVenueAnchor: true, venueIsAliasAccount: true })
    ).toBe(false);
  });

  it("true on a human THIS_VENUE verdict", () => {
    expect(isProtectedByHumanVerdict({ ...NO_FACTS, hasHumanThisVenueVerdict: true })).toBe(true);
  });

  it("true on a human_post_labels row", () => {
    expect(isProtectedByHumanVerdict({ ...NO_FACTS, hasHumanPostLabel: true })).toBe(true);
  });
});

describe("applyHotelRule", () => {
  it("becomes venue when the account IS the wedding's venue_id", () => {
    expect(applyHotelRule(42, 42)).toBe("venue");
  });

  it("becomes accommodations when the account is NOT the wedding's venue_id", () => {
    expect(applyHotelRule(42, 99)).toBe("accommodations");
  });

  it("becomes accommodations when the wedding has no venue_id at all", () => {
    expect(applyHotelRule(42, null)).toBe("accommodations");
  });
});

describe("detectCeremonyReceptionSplit", () => {
  it("finds one ceremony venue + one different reception venue", () => {
    const credits: CreditRoleRow[] = [
      { accountId: 1, role: "venue", eventContext: "ceremony" },
      { accountId: 2, role: "venue", eventContext: "reception" },
      { accountId: 3, role: "photographer", eventContext: "wedding_day" },
    ];
    expect(detectCeremonyReceptionSplit(credits)).toEqual({ ceremonyAccountId: 1, receptionAccountId: 2 });
  });

  it("returns null when there's no ceremony-context venue credit", () => {
    const credits: CreditRoleRow[] = [{ accountId: 2, role: "venue", eventContext: "reception" }];
    expect(detectCeremonyReceptionSplit(credits)).toBeNull();
  });

  it("returns null when there's no reception-context venue credit", () => {
    const credits: CreditRoleRow[] = [{ accountId: 1, role: "venue", eventContext: "ceremony" }];
    expect(detectCeremonyReceptionSplit(credits)).toBeNull();
  });

  it("returns null when ceremony and reception resolve to the SAME account (not a real split)", () => {
    const credits: CreditRoleRow[] = [
      { accountId: 1, role: "venue", eventContext: "ceremony" },
      { accountId: 1, role: "venue", eventContext: "reception" },
    ];
    expect(detectCeremonyReceptionSplit(credits)).toBeNull();
  });

  it("returns null (ambiguous, refuses to guess) when two accounts both claim ceremony", () => {
    const credits: CreditRoleRow[] = [
      { accountId: 1, role: "venue", eventContext: "ceremony" },
      { accountId: 4, role: "venue", eventContext: "ceremony" },
      { accountId: 2, role: "venue", eventContext: "reception" },
    ];
    expect(detectCeremonyReceptionSplit(credits)).toBeNull();
  });

  it("ignores non-venue roles and non-ceremony/reception contexts entirely", () => {
    const credits: CreditRoleRow[] = [
      { accountId: 1, role: "venue", eventContext: "ceremony" },
      { accountId: 2, role: "venue", eventContext: "reception" },
      { accountId: 5, role: "venue", eventContext: "getting_ready" },
      { accountId: 6, role: "accommodations", eventContext: "ceremony" },
    ];
    expect(detectCeremonyReceptionSplit(credits)).toEqual({ ceremonyAccountId: 1, receptionAccountId: 2 });
  });
});

describe("diffRoleSets", () => {
  it("everything unchanged when the sets match exactly", () => {
    const diff = diffRoleSets(["photographer", "second_shooter"], ["photographer", "second_shooter"]);
    expect(diff).toEqual({ toInsert: [], toDelete: [], unchanged: ["photographer", "second_shooter"] });
  });

  it("inserts a new role the credits add", () => {
    const diff = diffRoleSets(["photographer"], ["photographer", "second_shooter"]);
    expect(diff.toInsert).toEqual(["second_shooter"]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.unchanged).toEqual(["photographer"]);
  });

  it("deletes a role the credits no longer support", () => {
    const diff = diffRoleSets(["photographer", "videographer"], ["photographer"]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toDelete).toEqual(["videographer"]);
    expect(diff.unchanged).toEqual(["photographer"]);
  });

  it("empty target roles deletes everything (the participant-only-account case)", () => {
    const diff = diffRoleSets(["dj", "band"], []);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toDelete).toEqual(["dj", "band"]);
    expect(diff.unchanged).toEqual([]);
  });

  it("empty existing roles inserts everything (a brand-new v10 credit on this account)", () => {
    const diff = diffRoleSets([], ["catering", "bar_service"]);
    expect(diff.toInsert).toEqual(["catering", "bar_service"]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("both empty is a no-op", () => {
    expect(diffRoleSets([], [])).toEqual({ toInsert: [], toDelete: [], unchanged: [] });
  });
});

describe("decideCeremonyVenueIdMove", () => {
  const split: CeremonyReceptionSplit = { ceremonyAccountId: 1, receptionAccountId: 2 };

  it("moves venue_id when unprotected and venue_id currently equals the ceremony account", () => {
    expect(decideCeremonyVenueIdMove(1, split, false)).toBe("move");
  });

  it("does NOT move venue_id on a protected (human-verdict) wedding -- ceremony_venue_id only", () => {
    expect(decideCeremonyVenueIdMove(1, split, true)).toBe("protected_ceremony_only");
  });

  it("needs no move when venue_id already equals the reception account", () => {
    expect(decideCeremonyVenueIdMove(2, split, false)).toBe("no_move_needed");
    expect(decideCeremonyVenueIdMove(2, split, true)).toBe("no_move_needed");
  });

  it("needs no move when venue_id is a third, unrelated account", () => {
    expect(decideCeremonyVenueIdMove(99, split, false)).toBe("no_move_needed");
  });

  it("needs no move when the wedding has no venue_id at all", () => {
    expect(decideCeremonyVenueIdMove(null, split, false)).toBe("no_move_needed");
  });
});

describe("venueRoleEvidenceCount", () => {
  it("adds the anchor bonus for role venue", () => {
    expect(venueRoleEvidenceCount("venue", 1, 2)).toBe(3);
  });

  it("does not add the anchor bonus for any other role", () => {
    expect(venueRoleEvidenceCount("accommodations", 1, 2)).toBe(1);
    expect(venueRoleEvidenceCount("other", 0, 5)).toBe(0);
  });

  it("the sheratonlisle case: a single stray non-venue credit (a typo'd label parsed to\n" +
    "   'other') no longer ties against venue once the anchor bonus is added", () => {
    // Before the fix: venue evidence=1 (the real credit) vs other evidence=1 (the typo) is a
    // tie, broken alphabetically in venueRoleEvidenceCount's caller (pickTopRoles) by role name
    // ascending -- "other" < "venue" -- so the real venue could lose. With the anchor bonus
    // (this account IS weddings.venue_id for that same wedding), venue evidence becomes 2.
    const venueEvidence = venueRoleEvidenceCount("venue", 1, 1);
    const otherEvidence = venueRoleEvidenceCount("other", 1, 0);
    expect(venueEvidence).toBeGreaterThan(otherEvidence);
  });

  it("zero credits and zero anchors is zero, for any role", () => {
    expect(venueRoleEvidenceCount("venue", 0, 0)).toBe(0);
    expect(venueRoleEvidenceCount("florist", 0, 0)).toBe(0);
  });
});
