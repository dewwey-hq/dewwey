/**
 * D056 stage 1 unit tests for parseCaptionV2 (scripts/graph/stackParser.ts). Pure -- no DB --
 * mirrors the fixture/assertion style of the v3/v8/v9 parseCaption describe blocks in
 * graphStrengthening.test.ts (lazy import so this file needs no DATABASE_URL to run).
 *
 * Fixtures: the three captions pasted verbatim by the user for D056, plus the LaPapa post
 * (https://www.instagram.com/p/DBsBZcev0Bh/, post_url like '%DBsBZcev0Bh%') fetched read-only
 * from staging.instagram_posts.caption_raw and pasted in below (its emoji-keyed lines, including
 * the skin-tone/ZWJ compound "👰🏻‍♀️"/"💇🏻‍♀️", are what backlog #1 targets), plus a constructed
 * baby-shower caption for backlog #2 (non-wedding-event-title flag), plus the Pieters post
 * (https://www.instagram.com/p/Db4EM4tGRGf/, post_url like '%Db4EM4tGRGf%') for the D056 stage-1
 * follow-up: TEXT labels decorated with their own trailing emoji before the colon (not emoji-only
 * lines -- those are the LaPapa fixture above) and a label with an embedded "/" before the colon.
 *
 * All exact counts/pairs below were verified against the actual parseCaptionV2 output (not
 * hand-guessed) before being written as assertions -- see the D056 stage-1 task's own worked
 * expectations for captions A/B/C, which this file reproduces.
 */
import { describe, it, expect } from "vitest";

async function parse(caption: string, opts?: { venueHandles?: Set<string> }) {
  const { parseCaptionV2 } = await import("./stackParser");
  return parseCaptionV2(caption, opts);
}

const CAPTION_A = `Forever grateful for the opportunity to capture beauty, moments, and people like this incredible weekend in Chicago! This will forever be a weekend we will cherish! ❤️

PHOTOGRAPHER: @thecannonsphotography
FULL SERVICE PLANNING & DESIGN: Nicole, @sirpillasoirees
COORDINATOR: @sirpillasoirees_brennan
VIDEOGRAPHER: @312film
CONTENT CREATOR: @socialbridescollective
FLORAL DESIGN & PRODUCTION: @yannidesignstudio
INVITATIONS & STATIONERY: @justlovepaper
WEDDING DRESSER: @theweddingdresser
DRESS DESIGNER: @markingramatelier
CATERING: @blueplatechicago
WEDDING BAND: @beatmixchicago
HAIR STYLIST:  @irina_pyrohivska
BEAUTY: @bridalbyaga
BAKER: @alliancebakery
WEDDING DAY LINENS: @bbjlatavola
WEDDING DAY RENTALS: @hallsrental
VENUE: @post433events
LADIES GETTING READY VENUE: @subtle.haus
PHOTO BOOTH: @shutterboothchicago
REHEARSAL DINNER LINENS/WEDDING CHAIRS: @nuagedesignsinc
TRANSPORTATION: Cloud 9 Limousine
REHEARSAL DINNER DUELING PIANOS: @lofijukeboxdp
REHEARSAL DINNER VENUE: @theexchangechicago
REHEARSAL DINNER RENTALS: @tablescapeseventrentals`;

const CAPTION_B = `Anne Barge bride, Olivia, visited the Anne Barge Atlanta Flagship and chose the Noblesse gown for her Chicago wedding, with a romantic ceremony at the Art Institute of Chicago followed by a candlelit reception at The Exchange.

Vendors:
Bride: @oliviatrilla
Groom: @jamesyparr
Photography: @joywlane
Dress: @annebarge
Planner: @lkeventschicago
Hair: @hairandmakeupbygabe
Makeup: @shannicat @shannonobrienweddings
Ceremony Venue: @artinstitutechi
Reception Venue: @theexchangechicago
Getting Ready Venue: @langhamchicago
Florals & Decor: @ev.designcollective
Videography: @j.j_films
Entertainment: @beatmixchicago
Catering: @paramountevents
Live Painter: @kyjsteiner
Desserts: @verzenaychicago`;

const CAPTION_C = `Happiest of 1st Anniversaries to A+Z! Married looks good on you!!! \u{1f49b}

Ceremony + Reception Venue: @brixonfox
Photo: @jillianphotography_
Video: @blushandbriarfilms
Florist: @blushbloomsco
Rentals: @mortardesigns
Phone Guest Book: @afterthetone.co
Catering: @unclebubsbbq
Bar: @11thhourbartending
Alcohol: @prestige6249
Entertainment: @dj_mikebailey
Hair: @idohairbykmay
Makeup: @shannonobrienweddings
Dress: @evasbridalinternational
Rings: @heritagecustomjewelers
Bridesmaids: @birdygrey
Suit/Groomsmen: @lorenzostux
Hotels:  @marriott.chicago.nw
Planning: @bwstudio_events`;

// LaPapa post, DBsBZcev0Bh -- pasted verbatim from staging.instagram_posts.caption_raw.
const CAPTION_LAPAPA =
  "Congratulations, Mr. & Mrs. LaPapa! We loved coordinating with all your great vendors and ensuring your wedding went smoothly, with so much fun! All your detailed planning paid off with such a great wedding! Thank you for having us as part of your vendor team! \u{1f942}\n. . .\n\u{1f492} @company251\n\u{1f957} @moveablefeastco\n\u{1f4f8} @christi.lee.photo\n\u{1f3a5} @weddings_by_jeremy\n\u{1f3bb} @3rdcoastlive\n\u{1f470}\u{1f3fb}‍♀️ @callablanchedress\n\u{1f490} @villageflowershopplainfield\n\u{1f484} @toshiszpyra\n\u{1f487}\u{1f3fb}‍♀️ @artistryhairbridal\n\u{1f520} @alphalitchicago\n\u{1f4bd} @musicbydesign\n. . .\n#weddingvendors #chicagoweddingvendors #company251wedding #bridetobe #weddingdj #chicagoweddingdj";

const CAPTION_BABY_SHOWER = `Koeplin Baby Shower

Venue: @somevenue
Photographer: @somephotographer`;

// Pieters wedding post, Db4EM4tGRGf -- pasted verbatim from staging.instagram_posts.caption_raw.
// D056 stage-1 follow-up fixture (user-caught): every label here is decorated with its own
// trailing emoji before the colon (some with no space, "Planner📝:"; one a skin-tone/ZWJ compound,
// "HMU💄 💇🏼‍♀️:"), and one label has an embedded "/" BEFORE the real colon ("Catering/Bar 🥗:").
const CAPTION_PIETERS =
  "7/31/26 - Still not over the Pieters wedding \u{1f90d}\u{2728}\n\nTruly one of the most smitten, head-over-heels-in-love couples—and you could feel it all day long. From the nonstop smiles to a WILD dance floor, this was the kind of wedding that had our cheeks hurting from smiling right along with them. \u{1f942}\u{1f483}\u{1f3fc}\n\nMr. & Mrs. Pieters, your love is something special. What a joy it was to celebrate you! \u{1f90d}\u{2728}\n\nPlanner\u{1f4dd}: @peoniesandproseccoevents\nVenue \u{1f492}: @the.arbory\nFlowers \u{1f339}: @f4dweddings\nCatering/Bar \u{1f957}:@chicchefcatering\nPhotography \u{1f4f8}: @foxandivory - @jennifer_echiburu \nVideographer \u{1f3a5}: @foxandivory\nDJ \u{1f3b6}: @yazzevents\nHMU\u{1f484} \u{1f487}\u{1f3fc}‍♀️: @anomaliebeautyagency\n\n#MrAndMrsPieters #PeoniesAndProseccoEvents #WeddingDayMagic #HappilyEverAfter #ChicagoWedding";

describe("parseCaptionV2 -- Caption A (Post 433, D056 stage-1 fixture)", () => {
  it("produces 25 credit rows, 0 participants, no non-wedding-event flag", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits).toHaveLength(25);
    expect(r.participants).toHaveLength(0);
    expect(r.nonWeddingEventTitle).toBeNull();
    expect(r.hasStack).toBe(true);
  });

  it("does not emit a credit for TRANSPORTATION (no @handle on that line)", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits.some((c) => c.label_raw === "TRANSPORTATION")).toBe(false);
  });

  it("post433events -> venue @ wedding_day", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "post433events", role: "venue", event_context: "wedding_day" }));
  });

  it("subtle.haus -> venue @ getting_ready (LADIES GETTING READY VENUE)", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "subtle.haus", role: "venue", event_context: "getting_ready" }));
  });

  it("theexchangechicago -> venue @ rehearsal_dinner (REHEARSAL DINNER VENUE)", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "theexchangechicago", role: "venue", event_context: "rehearsal_dinner" }));
  });

  it("lofijukeboxdp -> entertainment_other @ rehearsal_dinner (REHEARSAL DINNER DUELING PIANOS)", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits).toContainEqual(
      expect.objectContaining({ handle: "lofijukeboxdp", role: "entertainment_other", event_context: "rehearsal_dinner" })
    );
  });

  it("sirpillasoirees -> planner + event_design (FULL SERVICE PLANNING & DESIGN, compound label, two rows)", async () => {
    const r = await parse(CAPTION_A);
    const roles = r.credits.filter((c) => c.handle === "sirpillasoirees").map((c) => c.role).sort();
    expect(roles).toEqual(["event_design", "planner"]);
  });

  it("bridalbyaga -> hair + makeup (BEAUTY, two rows)", async () => {
    const r = await parse(CAPTION_A);
    const roles = r.credits.filter((c) => c.handle === "bridalbyaga").map((c) => c.role).sort();
    expect(roles).toEqual(["hair", "makeup"]);
  });

  it("beatmixchicago -> band (WEDDING BAND)", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "beatmixchicago", role: "band" }));
  });

  it("nuagedesignsinc -> rentals @ rehearsal_dinner (REHEARSAL DINNER LINENS/WEDDING CHAIRS)", async () => {
    const r = await parse(CAPTION_A);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "nuagedesignsinc", role: "rentals", event_context: "rehearsal_dinner" }));
  });
});

describe("parseCaptionV2 -- Caption B (Art Institute / The Exchange, D056 stage-1 fixture)", () => {
  it("produces 16 credit rows, 2 participants", async () => {
    const r = await parse(CAPTION_B);
    expect(r.credits).toHaveLength(16);
    expect(r.participants).toHaveLength(2);
  });

  it("oliviatrilla is a bride participant, jamesyparr a groom participant -- no vendor role, not in credits", async () => {
    const r = await parse(CAPTION_B);
    expect(r.participants).toContainEqual(expect.objectContaining({ handle: "oliviatrilla", participant: "bride" }));
    expect(r.participants).toContainEqual(expect.objectContaining({ handle: "jamesyparr", participant: "groom" }));
    expect(r.credits.some((c) => c.handle === "oliviatrilla" || c.handle === "jamesyparr")).toBe(false);
  });

  it("artinstitutechi -> venue @ ceremony", async () => {
    const r = await parse(CAPTION_B);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "artinstitutechi", role: "venue", event_context: "ceremony" }));
  });

  it("theexchangechicago -> venue @ reception", async () => {
    const r = await parse(CAPTION_B);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "theexchangechicago", role: "venue", event_context: "reception" }));
  });

  it("langhamchicago -> venue @ getting_ready", async () => {
    const r = await parse(CAPTION_B);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "langhamchicago", role: "venue", event_context: "getting_ready" }));
  });

  it("ev.designcollective -> florist + decor_other (Florals & Decor, two rows)", async () => {
    const r = await parse(CAPTION_B);
    const roles = r.credits.filter((c) => c.handle === "ev.designcollective").map((c) => c.role).sort();
    expect(roles).toEqual(["decor_other", "florist"]);
  });

  it("two makeup handles from one 'Makeup: @a @b' line", async () => {
    const r = await parse(CAPTION_B);
    const makeupHandles = r.credits.filter((c) => c.role === "makeup").map((c) => c.handle).sort();
    expect(makeupHandles).toEqual(["shannicat", "shannonobrienweddings"]);
  });

  it("kyjsteiner -> live_painter", async () => {
    const r = await parse(CAPTION_B);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "kyjsteiner", role: "live_painter" }));
  });

  it("verzenaychicago -> desserts", async () => {
    const r = await parse(CAPTION_B);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "verzenaychicago", role: "desserts" }));
  });
});

describe("parseCaptionV2 -- Caption C (Brix on Fox, D056 stage-1 fixture)", () => {
  it("produces 18 credit rows, 0 participants", async () => {
    const r = await parse(CAPTION_C);
    expect(r.credits).toHaveLength(18);
    expect(r.participants).toHaveLength(0);
  });

  it("brixonfox -> venue @ wedding_day (Ceremony + Reception Venue)", async () => {
    const r = await parse(CAPTION_C);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "brixonfox", role: "venue", event_context: "wedding_day" }));
  });

  it("afterthetone.co -> guest_book (Phone Guest Book)", async () => {
    const r = await parse(CAPTION_C);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "afterthetone.co", role: "guest_book" }));
  });

  it("11thhourbartending and prestige6249 -> bar_service", async () => {
    const r = await parse(CAPTION_C);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "11thhourbartending", role: "bar_service" }));
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "prestige6249", role: "bar_service" }));
  });

  it("heritagecustomjewelers -> jewelry", async () => {
    const r = await parse(CAPTION_C);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "heritagecustomjewelers", role: "jewelry" }));
  });

  it("birdygrey -> attire, lorenzostux -> attire", async () => {
    const r = await parse(CAPTION_C);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "birdygrey", role: "attire" }));
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "lorenzostux", role: "attire" }));
  });

  it("marriott.chicago.nw -> accommodations (Hotels)", async () => {
    const r = await parse(CAPTION_C);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "marriott.chicago.nw", role: "accommodations" }));
  });

  it("'Suit/Groomsmen:' does NOT split into two different roles -- both parts are attire, one role emitted", async () => {
    const r = await parse(CAPTION_C);
    const roles = r.credits.filter((c) => c.handle === "lorenzostux").map((c) => c.role);
    expect(roles).toEqual(["attire"]);
  });
});

describe("parseCaptionV2 -- emoji-keyed lines (backlog #1, LaPapa post DBsBZcev0Bh)", () => {
  it("produces 11 emoji_line credits, one per emoji-keyed line, correctly roled", async () => {
    const r = await parse(CAPTION_LAPAPA);
    const emojiCredits = r.credits.filter((c) => c.source === "emoji_line");
    expect(emojiCredits).toHaveLength(11);
    expect(r.credits).toHaveLength(11); // the whole caption is emoji-keyed lines, nothing else matches
  });

  it("maps each known emoji to its D056 role", async () => {
    const r = await parse(CAPTION_LAPAPA);
    const byHandle = new Map(r.credits.map((c) => [c.handle, c.role]));
    expect(byHandle.get("company251")).toBe("venue"); // \u{1f492} chapel
    expect(byHandle.get("moveablefeastco")).toBe("catering"); // \u{1f957} salad
    expect(byHandle.get("christi.lee.photo")).toBe("photographer"); // \u{1f4f8}
    expect(byHandle.get("weddings_by_jeremy")).toBe("videographer"); // \u{1f3a5}
    expect(byHandle.get("3rdcoastlive")).toBe("live_music"); // \u{1f3bb} violin
    expect(byHandle.get("villageflowershopplainfield")).toBe("florist"); // \u{1f490}
    expect(byHandle.get("toshiszpyra")).toBe("makeup"); // \u{1f484}
    expect(byHandle.get("musicbydesign")).toBe("dj"); // \u{1f4bd}
  });

  it("handles a skin-tone/ZWJ compound emoji lead ('\u{1f470}\u{1f3fb}‍♀️' bride icon -> attire, '\u{1f487}\u{1f3fb}‍♀️' haircut icon -> hair) without truncating", async () => {
    const r = await parse(CAPTION_LAPAPA);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "callablanchedress", role: "attire", source: "emoji_line" }));
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "artistryhairbridal", role: "hair", source: "emoji_line" }));
  });

  it("an unrecognized leading emoji ('\u{1f520}' input-latin-letters) falls back to role='other', label_raw = the emoji verbatim, rule_id='emoji'", async () => {
    const r = await parse(CAPTION_LAPAPA);
    expect(r.credits).toContainEqual(
      expect.objectContaining({ handle: "alphalitchicago", role: "other", label_raw: "\u{1f520}", rule_id: "emoji" })
    );
  });
});

describe("parseCaptionV2 -- text label decorated with its own emoji before the colon (D056 stage-1 follow-up, Pieters post Db4EM4tGRGf)", () => {
  it("produces 11 credit rows over 8 lines, 0 participants, wedding_day throughout (no non-wedding-event flag)", async () => {
    const r = await parse(CAPTION_PIETERS);
    expect(r.credits).toHaveLength(11);
    expect(r.participants).toHaveLength(0);
    expect(r.nonWeddingEventTitle).toBeNull();
    expect(r.credits.every((c) => c.event_context === "wedding_day")).toBe(true);
    expect(r.credits.every((c) => c.source === "credit_line")).toBe(true);
  });

  it("'Planner📝:' (no space before the emoji) still matches -- planner", async () => {
    const r = await parse(CAPTION_PIETERS);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "peoniesandproseccoevents", role: "planner" }));
  });

  it("'Venue 💒:' -- venue", async () => {
    const r = await parse(CAPTION_PIETERS);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "the.arbory", role: "venue" }));
  });

  it("'Flowers 🌹:' -- florist", async () => {
    const r = await parse(CAPTION_PIETERS);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "f4dweddings", role: "florist" }));
  });

  it("'Catering/Bar 🥗:@x' (embedded '/' BEFORE the colon, no space before '@') -- catering + bar_service, not a truncated 'Catering' label that drops Bar", async () => {
    const r = await parse(CAPTION_PIETERS);
    const roles = r.credits.filter((c) => c.handle === "chicchefcatering").map((c) => c.role).sort();
    expect(roles).toEqual(["bar_service", "catering"]);
  });

  it("'Photography 📸: @a - @b' -- two photographer credits from one label", async () => {
    const r = await parse(CAPTION_PIETERS);
    const photographers = r.credits.filter((c) => c.role === "photographer").map((c) => c.handle).sort();
    expect(photographers).toEqual(["foxandivory", "jennifer_echiburu"]);
  });

  it("'Videographer 🎥:' -- videographer, 'DJ 🎶:' -- dj", async () => {
    const r = await parse(CAPTION_PIETERS);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "foxandivory", role: "videographer" }));
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "yazzevents", role: "dj" }));
  });

  it("'HMU💄 💇🏼‍♀️:' (two emoji, one a skin-tone/ZWJ compound, no space before the first) -- hair + makeup", async () => {
    const r = await parse(CAPTION_PIETERS);
    const roles = r.credits.filter((c) => c.handle === "anomaliebeautyagency").map((c) => c.role).sort();
    expect(roles).toEqual(["hair", "makeup"]);
  });
});

describe("parseCaptionV2 -- emoji-line edge cases", () => {
  it("an emoji-only line with no @handle yields nothing (no credits, no participants)", async () => {
    const r = await parse("\u{1f490}\n\u{1f4f8}\nSome unrelated line with no handle either.");
    expect(r.credits).toHaveLength(0);
    expect(r.participants).toHaveLength(0);
  });

  it("a labeled line still parses as in v9 (colon-separated 'Label: @handle')", async () => {
    const r = await parse("Venue: @galleriamarchetti");
    expect(r.credits).toEqual([
      expect.objectContaining({ handle: "galleriamarchetti", role: "venue", event_context: "wedding_day", source: "credit_line" }),
    ]);
  });
});

describe("parseCaptionV2 -- non-wedding event title (backlog #2)", () => {
  it("flags a baby-shower caption's heading line as nonWeddingEventTitle while still emitting its credits", async () => {
    const r = await parse(CAPTION_BABY_SHOWER);
    expect(r.nonWeddingEventTitle).toBe("Koeplin Baby Shower");
    expect(r.credits).toHaveLength(2);
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "somevenue", role: "venue" }));
    expect(r.credits).toContainEqual(expect.objectContaining({ handle: "somephotographer", role: "photographer" }));
  });

  it("does NOT flag a baby-shower mention when the caption also carries a wedding-recap signal", async () => {
    const r = await parse("Koeplin Baby Shower\n\nThrowback to their wedding day! Mr. & Mrs. Koeplin.\n\nVenue: @somevenue");
    expect(r.nonWeddingEventTitle).toBeNull();
  });
});
