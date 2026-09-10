/**
 * D056 taxonomy rules — fixture tests from the three captions the user pasted on 2026-09-10
 * (Post 433 / The Exchange / Brix on Fox) plus the known v9 failure cases. Pure; no DB.
 */
import { describe, expect, it } from "vitest";
import { classifyLabel, VENDOR_ROLES, ROLE_BY_SLUG } from "./vendorRoleRules";

function roles(label: string) { return classifyLabel(label).roles.sort(); }
function ctx(label: string) { return classifyLabel(label).eventContext; }

describe("D056 taxonomy — reference table", () => {
  it("every slug is unique and every category is one of the twelve", () => {
    const slugs = VENDOR_ROLES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const cats = new Set(VENDOR_ROLES.map((r) => r.category));
    expect(cats.size).toBe(12);
  });
  it("participants and non-credits are never vendor roles", () => {
    expect(ROLE_BY_SLUG.get("press_feature")?.isVendor).toBe(false);
    expect(ROLE_BY_SLUG.get("noise")?.isVendor).toBe(false);
  });
});

describe("D056 taxonomy — the Post 433 stack (25 lines)", () => {
  const expected: Array<[string, string[], string]> = [
    ["PHOTOGRAPHER", ["photographer"], "wedding_day"],
    ["FULL SERVICE PLANNING & DESIGN", ["event_design", "planner"], "wedding_day"],
    ["COORDINATOR", ["coordinator"], "wedding_day"],
    ["VIDEOGRAPHER", ["videographer"], "wedding_day"],
    ["CONTENT CREATOR", ["content_creator"], "wedding_day"],
    ["FLORAL DESIGN & PRODUCTION", ["florist"], "wedding_day"],
    ["INVITATIONS & STATIONERY", ["stationery"], "wedding_day"],
    ["WEDDING DRESSER", ["attire"], "wedding_day"],
    ["DRESS DESIGNER", ["attire"], "wedding_day"],
    ["CATERING", ["catering"], "wedding_day"],
    ["WEDDING BAND", ["band"], "wedding_day"],
    ["HAIR STYLIST", ["hair"], "wedding_day"],
    ["BEAUTY", ["hair", "makeup"], "wedding_day"],
    ["BAKER", ["cake"], "wedding_day"],
    ["WEDDING DAY LINENS", ["rentals"], "wedding_day"],
    ["WEDDING DAY RENTALS", ["rentals"], "wedding_day"],
    ["VENUE", ["venue"], "wedding_day"],
    ["LADIES GETTING READY VENUE", ["venue"], "getting_ready"],
    ["PHOTO BOOTH", ["photo_booth"], "wedding_day"],
    ["REHEARSAL DINNER LINENS/WEDDING CHAIRS", ["rentals"], "rehearsal_dinner"],
    ["TRANSPORTATION", ["transportation"], "wedding_day"],
    ["REHEARSAL DINNER DUELING PIANOS", ["entertainment_other"], "rehearsal_dinner"],
    ["REHEARSAL DINNER VENUE", ["venue"], "rehearsal_dinner"],
    ["REHEARSAL DINNER RENTALS", ["rentals"], "rehearsal_dinner"],
  ];
  for (const [label, want, wantCtx] of expected) {
    it(`${label} → ${want.join("+")} @ ${wantCtx}`, () => {
      expect(roles(label)).toEqual(want);
      expect(ctx(label)).toBe(wantCtx);
    });
  }
});

describe("D056 taxonomy — the Art Institute / Exchange stack", () => {
  it("Bride / Groom are participants, not vendors", () => {
    expect(classifyLabel("Bride").participant).toBe("bride");
    expect(classifyLabel("Groom").participant).toBe("groom");
    expect(classifyLabel("Bride").roles).toEqual([]);
  });
  it("Ceremony Venue / Reception Venue / Getting Ready Venue keep the venue role and the context", () => {
    expect(roles("Ceremony Venue")).toEqual(["venue"]); expect(ctx("Ceremony Venue")).toBe("ceremony");
    expect(roles("Reception Venue")).toEqual(["venue"]); expect(ctx("Reception Venue")).toBe("reception");
    expect(roles("Getting Ready Venue")).toEqual(["venue"]); expect(ctx("Getting Ready Venue")).toBe("getting_ready");
  });
  it("Florals & Decor emits two roles; Live Painter and Desserts have homes", () => {
    expect(roles("Florals & Decor")).toEqual(["decor_other", "florist"]);
    expect(roles("Live Painter")).toEqual(["live_painter"]);
    expect(roles("Desserts")).toEqual(["desserts"]);
    expect(roles("Entertainment")).toEqual(["dj"]);
  });
});

describe("D056 taxonomy — the Brix on Fox stack", () => {
  it("Ceremony + Reception Venue → venue @ wedding_day", () => {
    expect(roles("Ceremony + Reception Venue")).toEqual(["venue"]);
    expect(ctx("Ceremony + Reception Venue")).toBe("wedding_day");
  });
  it("Phone Guest Book, Bar, Alcohol, Rings, Bridesmaids, Suit/Groomsmen, Hotels", () => {
    expect(roles("Phone Guest Book")).toEqual(["guest_book"]);
    expect(roles("Bar")).toEqual(["bar_service"]);
    expect(roles("Alcohol")).toEqual(["bar_service"]);
    expect(roles("Rings")).toEqual(["jewelry"]);
    expect(roles("Bridesmaids")).toEqual(["attire"]);
    expect(roles("Suit/Groomsmen")).toEqual(["attire"]);
    expect(roles("Hotels")).toEqual(["accommodations"]);
  });
});

describe("D056 taxonomy — v9 failure cases", () => {
  it("chairs is rentals, not hair", () => expect(roles("Chairs")).toEqual(["rentals"]));
  it("string quartet is live music, not jewelry", () => expect(roles("String Quartet")).toEqual(["live_music"]));
  it("invitation suite is stationery, not attire", () => expect(roles("Invitation Suite")).toEqual(["stationery"]));
  it("venue management & bar is not a venue", () => expect(roles("Venue Management & Bar")).toEqual(["bar_service", "venue_management"]));
  it("venue & catering emits both credits", () => expect(roles("Venue & Catering")).toEqual(["catering", "venue"]));
  it("hair & makeup emits both", () => expect(roles("Hair & Makeup")).toEqual(["hair", "makeup"]));
  it("photo & video emits both", () => expect(roles("Photo & Video")).toEqual(["photographer", "videographer"]));
  it("ceremony musicians keeps the role, sets the context", () => {
    expect(roles("Ceremony Musicians")).toEqual(["live_music"]); expect(ctx("Ceremony Musicians")).toBe("ceremony");
  });
  it("reception dress is attire @ reception", () => {
    expect(roles("Reception Dress")).toEqual(["attire"]); expect(ctx("Reception Dress")).toBe("reception");
  });
  it("after party dj", () => { expect(roles("After Party DJ")).toEqual(["dj"]); expect(ctx("After Party DJ")).toBe("after_party"); });
  it("getting ready hotel is accommodations", () => { expect(roles("Getting Ready Hotel")).toEqual(["accommodations"]); expect(ctx("Getting Ready Hotel")).toBe("getting_ready"); });
  it("lighting family", () => {
    expect(roles("Lighting")).toEqual(["lighting_production"]);
    expect(roles("Lighting & Draping")).toEqual(["lighting_production"]);
    expect(roles("Dance Floor")).toEqual(["lighting_production"]);
  });
  it("models / sp couple / muse / hosts are participants", () => {
    expect(classifyLabel("Models").participant).toBe("model");
    expect(classifyLabel("SP Couple").participant).toBe("couple");
    expect(classifyLabel("Muse").participant).toBe("muse");
    expect(classifyLabel("Hosts").participant).toBe("host_family");
  });
  it("featured on / venue partners / sponsors are not credits", () => {
    expect(roles("Featured on")).toEqual(["press_feature"]);
    expect(roles("Venue Partners")).toEqual(["noise"]);
    expect(roles("Sponsors")).toEqual(["noise"]);
  });
  it("unknown labels fall to other with the raw label kept", () => {
    const c = classifyLabel("Weather Concierge Deluxe");
    expect(c.roles).toEqual(["other"]); expect(c.label).toBe("Weather Concierge Deluxe");
  });
});
