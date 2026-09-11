import { describe, expect, it } from "vitest";
import {
  coverPost,
  coverOrFirstPost,
  titleFromCaption,
  seasonLabel,
  groupStackByCategory,
  stackRail,
  displayName,
  isDerivedName,
  type CoverPostCandidate,
  type StackVendorLike,
} from "./feedDesign";

function post(overrides: Partial<CoverPostCandidate> = {}): CoverPostCandidate {
  return {
    url: "https://instagram.com/p/abc/",
    ok: true,
    postedAt: "2026-06-01T00:00:00Z",
    postType: null,
    ...overrides,
  };
}

function vendor(overrides: Partial<StackVendorLike> = {}): StackVendorLike {
  return {
    accountId: 1,
    username: "acct",
    name: "Acct",
    role: "other",
    avatar_url: null,
    ...overrides,
  };
}

describe("coverPost", () => {
  it("returns null when there are no posts", () => {
    expect(coverPost([])).toBeNull();
  });

  it("returns null when nothing is embeddable", () => {
    expect(coverPost([post({ ok: false }), post({ ok: false })])).toBeNull();
  });

  it("prefers Image over Sidecar and Video", () => {
    const image = post({ url: "img", postType: "Image" });
    const sidecar = post({ url: "side", postType: "Sidecar" });
    const video = post({ url: "vid", postType: "Video" });
    expect(coverPost([video, sidecar, image])?.url).toBe("img");
  });

  it("prefers Sidecar over Video when there is no Image", () => {
    const sidecar = post({ url: "side", postType: "Sidecar" });
    const video = post({ url: "vid", postType: "Video" });
    expect(coverPost([video, sidecar])?.url).toBe("side");
  });

  it("prefers a typed post over an unknown type", () => {
    const unknown = post({ url: "unk", postType: null });
    const video = post({ url: "vid", postType: "Video" });
    expect(coverPost([unknown, video])?.url).toBe("vid");
  });

  it("skips non-embeddable posts even if they'd otherwise rank first", () => {
    const blockedImage = post({ url: "img", postType: "Image", ok: false });
    const video = post({ url: "vid", postType: "Video", ok: true });
    expect(coverPost([blockedImage, video])?.url).toBe("vid");
  });

  it("breaks ties within the same type by most recent", () => {
    const older = post({ url: "old", postType: "Image", postedAt: "2025-01-01T00:00:00Z" });
    const newer = post({ url: "new", postType: "Image", postedAt: "2026-01-01T00:00:00Z" });
    expect(coverPost([older, newer])?.url).toBe("new");
  });
});

describe("coverOrFirstPost", () => {
  it("returns the same thing as coverPost when something is embeddable", () => {
    const image = post({ url: "img", postType: "Image" });
    const blocked = post({ url: "blocked", ok: false });
    expect(coverOrFirstPost([blocked, image])?.url).toBe("img");
  });

  it("falls back to the first post (even if blocked) so the fallback card has real context", () => {
    const blocked = post({ url: "blocked", ok: false, postType: "Image" });
    expect(coverOrFirstPost([blocked])).toBe(blocked);
  });

  it("returns null when there are no posts at all", () => {
    expect(coverOrFirstPost([])).toBeNull();
  });
});

describe("titleFromCaption", () => {
  it("returns null for null/empty captions", () => {
    expect(titleFromCaption(null)).toBeNull();
    expect(titleFromCaption(undefined)).toBeNull();
    expect(titleFromCaption("   ")).toBeNull();
  });

  it("parses \"X and Y's wedding\"", () => {
    expect(titleFromCaption("Claire and Kevin's wedding")).toBe("Claire & Kevin");
  });

  it("keeps a \"part N\" suffix out of the pair", () => {
    expect(titleFromCaption("Shay & Marc part 1")).toBe("Shay & Marc");
  });

  it("parses \"Still not over the X wedding\"", () => {
    expect(titleFromCaption("Still not over the Pieters wedding")).toBe("The Pieters");
  });

  it("parses \"Mr. & Mrs. Surname\"", () => {
    expect(titleFromCaption("Mr. & Mrs. Pieters")).toBe("The Pieters");
  });

  it("parses a lowercase \"x\" connector", () => {
    expect(titleFromCaption("kelly x keenan")).toBe("Kelly & Keenan");
  });

  it("parses an ALL CAPS \"+\" pair with a trailing date", () => {
    expect(titleFromCaption("EMILY + JOSH 6.6.25")).toBe("Emily & Josh");
  });

  it("does not fire on \"Wedding Cake Wednesday\"", () => {
    expect(titleFromCaption("Wedding Cake Wednesday")).toBeNull();
  });

  it("does not fire on \"Venue & Catering\"", () => {
    expect(titleFromCaption("Venue & Catering")).toBeNull();
  });

  it("does not fire on \"hair & makeup\"", () => {
    expect(titleFromCaption("hair & makeup")).toBeNull();
  });

  it("does not fire on \"black and white\"", () => {
    expect(titleFromCaption("black and white")).toBeNull();
  });
});

describe("seasonLabel", () => {
  it("returns null for no date", () => {
    expect(seasonLabel(null)).toBeNull();
    expect(seasonLabel(undefined)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(seasonLabel("not-a-date")).toBeNull();
  });

  it("labels a summer date", () => {
    expect(seasonLabel("2026-07-15")).toBe("Summer 2026");
  });

  it("labels a winter date", () => {
    expect(seasonLabel("2026-01-10")).toBe("Winter 2026");
  });

  it("labels a spring and a fall date", () => {
    expect(seasonLabel("2026-04-01")).toBe("Spring 2026");
    expect(seasonLabel("2026-10-01")).toBe("Fall 2026");
  });
});

describe("groupStackByCategory", () => {
  it("returns an empty list for no vendors", () => {
    expect(groupStackByCategory([])).toEqual([]);
  });

  it("puts the venue category first", () => {
    const vendors = [
      vendor({ username: "florist1", role: "florist" }),
      vendor({ username: "venue1", role: "venue" }),
      vendor({ username: "dj1", role: "dj" }),
    ];
    const groups = groupStackByCategory(vendors);
    expect(groups[0].slug).toBe("venue");
    expect(groups[0].vendors.map((v) => v.username)).toEqual(["venue1"]);
  });

  it("groups multiple vendors of the same category together", () => {
    const vendors = [
      vendor({ username: "photog", role: "photographer" }),
      vendor({ username: "videog", role: "videographer" }),
    ];
    const groups = groupStackByCategory(vendors);
    const photoVideo = groups.find((g) => g.slug === "photo_video");
    expect(photoVideo?.vendors.map((v) => v.username).sort()).toEqual(["photog", "videog"]);
  });
});

describe("displayName", () => {
  it("uses a real name verbatim, trimmed", () => {
    expect(displayName("  Bea Quach  ", "bea.quach.designs")).toBe("Bea Quach");
  });

  it("treats a name equal to the handle (punctuation/case aside) as not real", () => {
    expect(displayName("bea.quach.designs", "bea.quach.designs")).toBe("Bea Quach Designs");
    expect(displayName("BEA_QUACH_DESIGNS", "bea.quach.designs")).toBe("Bea Quach Designs");
  });

  it("treats null/undefined/empty name as not real", () => {
    expect(displayName(null, "spinvxn")).toBe("Spinvxn");
    expect(displayName(undefined, "spinvxn")).toBe("Spinvxn");
    expect(displayName("   ", "spinvxn")).toBe("Spinvxn");
  });

  it("splits a dotted handle into title-cased words", () => {
    expect(displayName(null, "bea.quach.designs")).toBe("Bea Quach Designs");
  });

  it("just capitalizes a handle with no splittable punctuation", () => {
    expect(displayName(null, "lulacafeevents")).toBe("Lulacafeevents");
    expect(displayName(null, "spinvxn")).toBe("Spinvxn");
    expect(displayName(null, "alliancebakeryweddingcakes")).toBe("Alliancebakeryweddingcakes");
  });

  it("drops a leading underscore and a trailing digit run with no letters after it", () => {
    expect(displayName(null, "_marmoura14")).toBe("Marmoura");
  });

  it("splits on a digit run between two real words", () => {
    expect(displayName(null, "hairs2thebride")).toBe("Hairs Thebride");
  });

  it("keeps a digit run merged into its token when only a single letter sits on one side", () => {
    expect(displayName(null, "f4dweddings")).toBe("F4dweddings");
  });

  it("keeps a short all-caps token as-is", () => {
    expect(displayName(null, "DJ.Mike")).toBe("DJ Mike");
  });
});

describe("isDerivedName", () => {
  it("is false for a real name", () => {
    expect(isDerivedName("Bea Quach", "bea.quach.designs")).toBe(false);
  });

  it("is true when the name is empty/null/undefined", () => {
    expect(isDerivedName("", "spinvxn")).toBe(true);
    expect(isDerivedName(null, "spinvxn")).toBe(true);
    expect(isDerivedName(undefined, "spinvxn")).toBe(true);
  });

  it("is true when the name is just the handle spelled out", () => {
    expect(isDerivedName("bea.quach.designs", "bea.quach.designs")).toBe(true);
    expect(isDerivedName("Bea_Quach_Designs", "bea.quach.designs")).toBe(true);
  });
});

describe("groupStackByCategory dedupe", () => {
  it("collapses a repeat username into one entry with the extra role attached", () => {
    const vendors = [
      vendor({ username: "chicchefcatering", role: "catering", accountId: 9 }),
      vendor({ username: "chicchefcatering", role: "bar_service", accountId: 9 }),
    ];
    const groups = groupStackByCategory(vendors);
    const foodDrink = groups.find((g) => g.slug === "food_drink");
    expect(foodDrink?.vendors).toHaveLength(1);
    expect(foodDrink?.vendors[0].role).toBe("catering");
    expect(foodDrink?.vendors[0].extraRoles).toEqual(["bar_service"]);
  });

  it("matches the repeat username case-insensitively", () => {
    const vendors = [
      vendor({ username: "ChicChefCatering", role: "photographer", accountId: 9 }),
      vendor({ username: "chicchefcatering", role: "videographer", accountId: 9 }),
    ];
    const groups = groupStackByCategory(vendors);
    const photoVideo = groups.find((g) => g.slug === "photo_video");
    expect(photoVideo?.vendors).toHaveLength(1);
    expect(photoVideo?.vendors[0].extraRoles).toEqual(["videographer"]);
  });

  it("buckets the deduped entry under the FIRST occurrence's (highest-priority) category", () => {
    const vendors = [
      vendor({ username: "dualrole", role: "venue", accountId: 5 }),
      vendor({ username: "dualrole", role: "catering", accountId: 5 }),
    ];
    const groups = groupStackByCategory(vendors);
    expect(groups).toHaveLength(1);
    expect(groups[0].slug).toBe("venue");
    expect(groups[0].vendors[0].extraRoles).toEqual(["catering"]);
  });

  it("gives every vendor an extraRoles array, empty when there's no duplicate", () => {
    const groups = groupStackByCategory([vendor({ username: "solo", role: "dj" })]);
    expect(groups[0].vendors[0].extraRoles).toEqual([]);
  });

  it("does not affect distinct-username vendors, even in the same category", () => {
    const vendors = [
      vendor({ username: "photog1", role: "photographer", accountId: 1 }),
      vendor({ username: "photog2", role: "photographer", accountId: 2 }),
    ];
    const groups = groupStackByCategory(vendors);
    const photoVideo = groups.find((g) => g.slug === "photo_video");
    expect(photoVideo?.vendors.map((v) => v.username).sort()).toEqual(["photog1", "photog2"]);
    expect(photoVideo?.vendors.every((v) => v.extraRoles.length === 0)).toBe(true);
  });
});

describe("stackRail", () => {
  const venueAcct = vendor({ username: "the.arbory", role: "venue", accountId: 1 });
  const florist = vendor({ username: "florist1", role: "florist", accountId: 2 });
  const dj = vendor({ username: "dj1", role: "dj", accountId: 3 });

  it("puts the venue first even when it wasn't first in the input", () => {
    const { chips } = stackRail([florist, venueAcct, dj], "the.arbory", 8);
    expect(chips[0].vendor.username).toBe("the.arbory");
    expect(chips[0].isVenue).toBe(true);
    expect(chips[1].isVenue).toBe(false);
  });

  it("matches the venue username case-insensitively", () => {
    const { chips } = stackRail([florist, venueAcct], "THE.ARBORY", 8);
    expect(chips[0].vendor.username).toBe("the.arbory");
  });

  it("caps chips at max and reports the remainder", () => {
    const many = [venueAcct, florist, dj, vendor({ username: "cake1", accountId: 4 })];
    const { chips, overflowCount } = stackRail(many, "the.arbory", 2);
    expect(chips).toHaveLength(2);
    expect(overflowCount).toBe(2);
  });

  it("returns no overflow when everything fits", () => {
    const { overflowCount } = stackRail([venueAcct, florist], "the.arbory", 8);
    expect(overflowCount).toBe(0);
  });

  it("works with no venue username at all", () => {
    const { chips } = stackRail([florist, dj], null, 8);
    expect(chips.every((c) => !c.isVenue)).toBe(true);
    expect(chips).toHaveLength(2);
  });
});
