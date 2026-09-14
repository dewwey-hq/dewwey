import { describe, expect, it } from "vitest";
import type { CapacityTuple, Space } from "../../../lib/venueDetails/types";
import { GENERIC_SPACE_NAME_RE, isFuzzyDuplicateName, isLodgingRoomName, levenshtein, sanitizeSpacesAndCapacities } from "./spaces";

function space(overrides: Partial<Space>): Space {
  return {
    id: "space",
    name: "The Grand Ballroom",
    structure_label: null,
    sq_ft: null,
    sq_ft_outdoor: null,
    ceiling_ft: null,
    setting: null,
    bookable_separately: true,
    description: null,
    includes_summary: null,
    evidence: { source_url: "https://x.com/spaces", snapshot_id: 1 },
    ...overrides,
  };
}

function capacity(overrides: Partial<CapacityTuple>): CapacityTuple {
  return {
    space_id: "space",
    layout: "seated_dinner",
    min: null,
    max: 200,
    as_stated_label: "Seated",
    tile: "seated",
    condition: null,
    quote: "Seated 200",
    source_url: "https://x.com/spaces",
    snapshot_id: 1,
    ...overrides,
  };
}

describe("GENERIC_SPACE_NAME_RE", () => {
  it("matches generic fake-space labels", () => {
    for (const name of ["Wedding Venue", "Event Space", "The Event Space", "our special rooms", "Venue", "Rooms"]) {
      expect(GENERIC_SPACE_NAME_RE.test(name)).toBe(true);
    }
  });

  it("does not match a real named room", () => {
    for (const name of ["The Grand Ballroom", "Galleria", "Solarium", "Adler Room"]) {
      expect(GENERIC_SPACE_NAME_RE.test(name)).toBe(false);
    }
  });
});

describe("isLodgingRoomName", () => {
  it("flags guest-room/suite/king/queen names", () => {
    expect(isLodgingRoomName("Presidential Suite")).toBe(true);
    expect(isLodgingRoomName("King Guest Room")).toBe(true);
  });

  it("does not flag a ballroom even if it says 'Suite' in a compound name", () => {
    expect(isLodgingRoomName("Grand Suite Ballroom")).toBe(false);
  });

  it("does not flag an unrelated name", () => {
    expect(isLodgingRoomName("The Garden Terrace")).toBe(false);
  });
});

describe("levenshtein / isFuzzyDuplicateName", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });

  it("treats containment as duplicate", () => {
    expect(isFuzzyDuplicateName("The Grand Ballroom", "Grand Ballroom")).toBe(true);
  });

  it("treats a 1-2 char typo as duplicate", () => {
    expect(isFuzzyDuplicateName("Galleria Marchetti", "Galleria Marcheti")).toBe(true);
  });

  it("does not treat genuinely different names as duplicate", () => {
    expect(isFuzzyDuplicateName("Grand Ballroom", "Garden Terrace")).toBe(false);
  });
});

describe("sanitizeSpacesAndCapacities", () => {
  it("drops a generic-label fake space and its capacities", () => {
    const spaces = [space({ id: "s1", name: "Event Space" })];
    const capacities = [capacity({ space_id: "s1" })];
    const result = sanitizeSpacesAndCapacities(spaces, capacities);
    expect(result.spaces).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "generic_space_name")).toBe(true);
  });

  it("drops a lodging-room space", () => {
    const spaces = [space({ id: "s1", name: "King Suite" })];
    const result = sanitizeSpacesAndCapacities(spaces, []);
    expect(result.spaces).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "lodging_room_dropped")).toBe(true);
  });

  it("merges fuzzy-duplicate space names, keeping both capacity tuples under the surviving id", () => {
    const spaces = [space({ id: "s1", name: "The Grand Ballroom" }), space({ id: "s2", name: "Grand Ballroom" })];
    const capacities = [capacity({ space_id: "s1", layout: "seated_dinner", max: 200 }), capacity({ space_id: "s2", layout: "cocktail_standing", max: 300, tile: "cocktail" })];
    const result = sanitizeSpacesAndCapacities(spaces, capacities);
    expect(result.spaces).toHaveLength(1);
    expect(result.spaces[0].id).toBe("s1");
    expect(result.capacities).toHaveLength(2);
    expect(result.capacities.every((c) => c.space_id === "s1")).toBe(true);
    expect(result.issues.some((i) => i.code === "duplicate_space_merged")).toBe(true);
  });

  it("reassigns an unknown space_id to whole_venue", () => {
    const capacities = [capacity({ space_id: "nonexistent" })];
    const result = sanitizeSpacesAndCapacities([], capacities);
    expect(result.capacities[0].space_id).toBe("whole_venue");
    expect(result.issues.some((i) => i.code === "unknown_space_id")).toBe(true);
  });

  it("swaps min/max when min > max", () => {
    const capacities = [capacity({ min: 300, max: 100 })];
    const result = sanitizeSpacesAndCapacities([space({})], capacities);
    expect(result.capacities[0]).toMatchObject({ min: 100, max: 300 });
    expect(result.issues.some((i) => i.code === "capacity_min_max_swapped")).toBe(true);
  });

  it("drops non-positive and implausibly large (>5000) capacities", () => {
    const capacities = [capacity({ max: 0 }), capacity({ max: 6000 })];
    const result = sanitizeSpacesAndCapacities([space({})], capacities);
    expect(result.capacities).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "capacity_non_positive")).toBe(true);
    expect(result.issues.some((i) => i.code === "capacity_gt_5000")).toBe(true);
  });

  it("keeps but flags a capacity > 1000 for review", () => {
    const capacities = [capacity({ max: 1500 })];
    const result = sanitizeSpacesAndCapacities([space({})], capacities);
    expect(result.capacities).toHaveLength(1);
    expect(result.issues.some((i) => i.code === "capacity_gt_1000")).toBe(true);
  });

  it("drops a whole_venue tuple that exactly sums two room tuples of the same layout (never-sum sanity)", () => {
    const spaces = [space({ id: "room-a", name: "Room A" }), space({ id: "room-b", name: "Room B" })];
    const capacities = [
      capacity({ space_id: "room-a", layout: "seated_dinner", max: 150 }),
      capacity({ space_id: "room-b", layout: "seated_dinner", max: 150 }),
      capacity({ space_id: "whole_venue", layout: "seated_dinner", max: 300 }),
    ];
    const result = sanitizeSpacesAndCapacities(spaces, capacities);
    expect(result.capacities.some((c) => c.space_id === "whole_venue")).toBe(false);
    expect(result.capacities).toHaveLength(2);
    expect(result.issues.some((i) => i.code === "summed_rooms")).toBe(true);
  });

  it("keeps a whole_venue tuple that does NOT equal the sum of room tuples", () => {
    const spaces = [space({ id: "room-a", name: "Room A" }), space({ id: "room-b", name: "Room B" })];
    const capacities = [
      capacity({ space_id: "room-a", layout: "seated_dinner", max: 150 }),
      capacity({ space_id: "room-b", layout: "seated_dinner", max: 150 }),
      capacity({ space_id: "whole_venue", layout: "seated_dinner", max: 250 }),
    ];
    const result = sanitizeSpacesAndCapacities(spaces, capacities);
    expect(result.capacities.some((c) => c.space_id === "whole_venue")).toBe(true);
    expect(result.issues.some((i) => i.code === "summed_rooms")).toBe(false);
  });

  it("emits one space named after the venue when the input has exactly one undifferentiated space", () => {
    const spaces = [space({ id: "only", name: "Galleria Marchetti" })];
    const result = sanitizeSpacesAndCapacities(spaces, [capacity({ space_id: "only" })]);
    expect(result.spaces).toHaveLength(1);
    expect(result.spaces[0].name).toBe("Galleria Marchetti");
  });
});
