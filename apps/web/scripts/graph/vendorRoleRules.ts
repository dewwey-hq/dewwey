/**
 * D056 — vendor-stack nomenclature: the taxonomy and the label → (roles, event context) rules.
 *
 * Why this exists (2026-09-10, user: "richer/more standardized nomenclature… how vendors were
 * used matters"): the v9 parser mapped a credit label to one of 23 enum values by substring,
 * first match wins. Measured on 89,337 v9 credit lines: 16% landed in `other` across 2,652
 * labels; "chairs" matched hair, "string quartet" matched jeweler (ring), "invitation suite"
 * matched attire (suit); every event modifier (ceremony / reception / getting ready /
 * rehearsal dinner / after party) was thrown away; bride/groom/couple handles became vendor
 * nodes. See the plan section "Vendor-stack nomenclature" and docs/decisions.md D056.
 *
 * Design rules (decided with the user):
 *   - Two levels: category (12) → role (~48). Roles are slugs; display names live in
 *     VENDOR_ROLES, not in the enum.
 *   - Specificity wins, not first match: exact label → compound split → head noun → contains.
 *   - Modifiers (ceremony, reception, getting ready, rehearsal dinner, after party, welcome
 *     party, cocktail hour, brunch, engagement, shower, day-of) only ever set the event
 *     context; they never choose a role.
 *   - Compound labels emit several roles ("Venue & Catering" → venue + catering; "Hair &
 *     Makeup" → hair + makeup; "Photo & Video" → photographer + videographer).
 *   - Participants (bride, groom, couple, models, muse, host family) are recognised and kept
 *     out of the vendor graph. Business status comes from the label, never from the account.
 *   - No religion-specific role: churches/parishes/temples are `venue` with context ceremony.
 *   - "Hotel" as a label is `accommodations`; the migration turns it into `venue` when the
 *     account is the wedding's venue_id (the only place that fact is known).
 *   - Unknown → `other`, always with the raw label kept, counted by the coverage report.
 *
 * This module is pure (no DB, no I/O) so it can be unit-tested and run over the label export.
 */

export type RoleCategory =
  | "venue" | "planning" | "photo_video" | "florals_decor" | "food_drink"
  | "music_entertainment" | "beauty" | "attire" | "paper" | "art_keepsakes"
  | "logistics_services" | "other";

export interface VendorRoleDef {
  slug: string;
  category: RoleCategory;
  display: string;
  /** false = never a vendor node (press features, junk labels) */
  isVendor: boolean;
}

export const VENDOR_ROLES: VendorRoleDef[] = [
  // venue
  { slug: "venue", category: "venue", display: "Venue", isVendor: true },
  { slug: "venue_management", category: "venue", display: "Venue management", isVendor: true },
  { slug: "accommodations", category: "venue", display: "Accommodations", isVendor: true },
  // planning
  { slug: "planner", category: "planning", display: "Planning", isVendor: true },
  { slug: "coordinator", category: "planning", display: "Coordination", isVendor: true },
  { slug: "event_design", category: "planning", display: "Event design & styling", isVendor: true },
  // photo & video
  { slug: "photographer", category: "photo_video", display: "Photography", isVendor: true },
  { slug: "second_shooter", category: "photo_video", display: "Second photographer", isVendor: true },
  { slug: "videographer", category: "photo_video", display: "Videography", isVendor: true },
  { slug: "content_creator", category: "photo_video", display: "Content creation", isVendor: true },
  { slug: "photo_booth", category: "photo_video", display: "Photo booth", isVendor: true },
  { slug: "drone", category: "photo_video", display: "Drone", isVendor: true },
  { slug: "album_editing", category: "photo_video", display: "Albums & editing", isVendor: true },
  // florals & decor
  { slug: "florist", category: "florals_decor", display: "Florals", isVendor: true },
  { slug: "lighting_production", category: "florals_decor", display: "Lighting & production", isVendor: true },
  { slug: "rentals", category: "florals_decor", display: "Rentals", isVendor: true },
  { slug: "tent", category: "florals_decor", display: "Tenting", isVendor: true },
  { slug: "signage", category: "florals_decor", display: "Signage", isVendor: true },
  { slug: "decor_other", category: "florals_decor", display: "Decor", isVendor: true },
  // food & drink
  { slug: "catering", category: "food_drink", display: "Catering", isVendor: true },
  { slug: "bar_service", category: "food_drink", display: "Bar service", isVendor: true },
  { slug: "cake", category: "food_drink", display: "Cake", isVendor: true },
  { slug: "desserts", category: "food_drink", display: "Desserts & treats", isVendor: true },
  // music & entertainment
  { slug: "dj", category: "music_entertainment", display: "DJ", isVendor: true },
  { slug: "band", category: "music_entertainment", display: "Band", isVendor: true },
  { slug: "live_music", category: "music_entertainment", display: "Live music", isVendor: true },
  { slug: "mc", category: "music_entertainment", display: "MC", isVendor: true },
  { slug: "cultural_performers", category: "music_entertainment", display: "Cultural performers", isVendor: true },
  { slug: "dancers_choreography", category: "music_entertainment", display: "Dance & choreography", isVendor: true },
  { slug: "entertainment_other", category: "music_entertainment", display: "Entertainment", isVendor: true },
  // beauty
  { slug: "hair", category: "beauty", display: "Hair", isVendor: true },
  { slug: "makeup", category: "beauty", display: "Makeup", isVendor: true },
  { slug: "beauty_services", category: "beauty", display: "Beauty services", isVendor: true },
  // attire
  { slug: "attire", category: "attire", display: "Attire", isVendor: true },
  { slug: "accessories", category: "attire", display: "Accessories", isVendor: true },
  { slug: "alterations", category: "attire", display: "Alterations", isVendor: true },
  { slug: "jewelry", category: "attire", display: "Jewelry", isVendor: true },
  // paper
  { slug: "stationery", category: "paper", display: "Stationery", isVendor: true },
  { slug: "calligraphy", category: "paper", display: "Calligraphy", isVendor: true },
  // art & keepsakes
  { slug: "live_painter", category: "art_keepsakes", display: "Live art", isVendor: true },
  { slug: "guest_book", category: "art_keepsakes", display: "Guest book", isVendor: true },
  { slug: "favors_gifts", category: "art_keepsakes", display: "Favors & gifts", isVendor: true },
  // logistics & services
  { slug: "transportation", category: "logistics_services", display: "Transportation", isVendor: true },
  { slug: "valet", category: "logistics_services", display: "Valet & parking", isVendor: true },
  { slug: "officiant", category: "logistics_services", display: "Officiant", isVendor: true },
  { slug: "security", category: "logistics_services", display: "Security", isVendor: true },
  { slug: "childcare", category: "logistics_services", display: "Childcare", isVendor: true },
  { slug: "pet_attendant", category: "logistics_services", display: "Pet attendant", isVendor: true },
  { slug: "travel_honeymoon", category: "logistics_services", display: "Travel & honeymoon", isVendor: true },
  { slug: "website_registry", category: "logistics_services", display: "Website & registry", isVendor: true },
  { slug: "staffing", category: "logistics_services", display: "Staffing", isVendor: true },
  // other
  { slug: "other", category: "other", display: "Other", isVendor: true },
  { slug: "press_feature", category: "other", display: "Featured in", isVendor: false },
  { slug: "noise", category: "other", display: "(not a credit)", isVendor: false },
];

export const ROLE_BY_SLUG: Map<string, VendorRoleDef> = new Map(VENDOR_ROLES.map((r) => [r.slug, r]));

export type EventContext =
  | "wedding_day" | "ceremony" | "reception" | "cocktail_hour" | "getting_ready"
  | "rehearsal_dinner" | "welcome_party" | "after_party" | "brunch" | "engagement" | "shower"
  | "sangeet_mehndi";

export type ParticipantRole = "bride" | "groom" | "couple" | "host_family" | "model" | "muse";

export interface LabelClassification {
  label: string;
  normalized: string;
  roles: string[];
  eventContext: EventContext;
  participant: ParticipantRole | null;
  ruleId: string;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(EMOJI, " ")
    .replace(/[’`]/g, "'")
    .replace(/[":.,!?()\[\]{}*#|~_\\-]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Event context modifiers — only ever set the context, never the role
// ---------------------------------------------------------------------------

const CONTEXT_PATTERNS: Array<[EventContext, RegExp]> = [
  ["rehearsal_dinner", /\brehearsal( dinner)?\b/],
  ["welcome_party", /\bwelcome (party|event|dinner|drinks)\b/],
  ["after_party", /\b(after ?party|afterparty|late night party)\b/],
  ["getting_ready", /\b(getting ready|get ready|prep|bridal suite|morning of|secondary\/stay|second(ary)? location)\b/],
  ["cocktail_hour", /\bcocktail( hour)?\b/],
  ["brunch", /\b(brunch|day after|farewell)\b/],
  ["engagement", /\bengagement( session| shoot| party)?\b/],
  ["shower", /\b(bridal|baby|wedding) shower\b/],
  ["sangeet_mehndi", /\b(sangeet|mehndi|mehendi|haldi|baraat|nikkah|pithi|garba)\b/],
  ["ceremony", /\bceremony\b/],
  ["reception", /\breception\b/],
];

/** Labels that are ONLY an event phrase mean the venue of that phase ("Reception:", "Ceremony:"). */
const PHASE_ONLY_VENUE: Record<string, EventContext> = {
  reception: "reception",
  ceremony: "ceremony",
  church: "ceremony",
  parish: "ceremony",
  chapel: "ceremony",
  temple: "ceremony",
  synagogue: "ceremony",
  cathedral: "ceremony",
  "ceremony & reception": "wedding_day",
  "ceremony + reception": "wedding_day",
  "ceremony and reception": "wedding_day",
  "reception & ceremony": "wedding_day",
  "rehearsal dinner": "rehearsal_dinner",
  "rehearsal dinner venue": "rehearsal_dinner",
  "welcome party": "welcome_party",
  "welcome party venue": "welcome_party",
  "after party": "after_party",
  afterparty: "after_party",
  "after party venue": "after_party",
  "getting ready": "getting_ready",
  "getting ready location": "getting_ready",
  "getting ready venue": "getting_ready",
  "ladies getting ready venue": "getting_ready",
  "sangeet venue": "sangeet_mehndi",
  "brunch venue": "brunch",
  "ceremony location": "ceremony",
  "reception location": "reception",
  "ceremony venue": "ceremony",
  "reception venue": "reception",
  "ceremony & reception venue": "wedding_day",
  "ceremony + reception venue": "wedding_day",
};

export function extractContext(normalized: string): EventContext {
  for (const [ctx, rx] of CONTEXT_PATTERNS) if (rx.test(normalized)) return ctx;
  return "wedding_day";
}

// ---------------------------------------------------------------------------
// Participants — never vendors
// ---------------------------------------------------------------------------

const PARTICIPANT_RULES: Array<[ParticipantRole, RegExp]> = [
  ["couple", /^(sp |styled |model |featured |guest |main |real )?(couple|newlyweds|lovers|mr (&|and|\+) mrs|bride (&|and|\+) groom|bride \+ groom|bride and groom|the couple|couple instagram|bride and groom instagram)$/],
  ["bride", /^(the |our |beautiful |gorgeous |stunning )?(bride|brides|bride's instagram|bride instagram|bride ig)$/],
  ["groom", /^(the |our )?(groom|grooms|groom's instagram|groom instagram)$/],
  ["model", /^(models?|model couple|muah main couple|sp models?)$/],
  ["muse", /^(muse|muses)$/],
  ["host_family", /^(hosts?|hosted by|host family|parents|mob|mog|fob|fog|mother of (the )?bride|father of (the )?bride|mother of (the )?groom|father of (the )?groom)$/],
];

export function detectParticipant(normalized: string): ParticipantRole | null {
  for (const [p, rx] of PARTICIPANT_RULES) if (rx.test(normalized)) return p;
  return null;
}

// ---------------------------------------------------------------------------
// Non-credit labels (press, sponsors, junk lines that the parser captured)
// ---------------------------------------------------------------------------

const PRESS_RX = /^(featured (on|in|by)?|published (on|in)?|publication|press|magazine|as seen (on|in)|on (the )?blog( today)?|editorial( for)?|modern luxury weddings( spring| fall)?|blog|repost( from)?|featuring( spring| fall)?)$/;
const NOISE_RX = /^(by|for|with|on|at|and|of|to|day|event|events|wedding|weddings|vendors?|vendor team|team|partners?|local partners|participating (companies|venues)|venue partners|sponsors?|sponsored by|drinks sponsor|hotel sponsors|cocktail sponsors|floral sponsor|huge thanks to our amazing sponsors|instagram|follow|credit|credits|client credits|photographer credits|pic|pics|shot on|first look|first two images|featured|featured in order of appearance|pictured|dress pictured|special appearance|creative team|congratulations|thank you to the following|with thanks to|dm to inquire|email us to schedule a tour|call your crew|working on behalf of|multi|mini|five|from|highlight|happy first|love is in the air|sparks flew|the team that captured it all|team that captured it all|la via team|on brides|thegatheringloftevents|loved this vendor team so much|some weddings take your breath away|good times with|vibe with|next stop|fun fact|this month|who|pre|pov|ss|sob|bob|cd|wp|loc|client|founder|staff|assistant|assistants|ple assistants|supplies|studio|workshop|workshop hosts?|brands?|media|social|the content|the video|the photo|camera|film dev|film lab|foundation|treatment|experiences|other vendors|text communication|weather (concierge|reports)|logistics concierge|custom event app|sotwi speakers|sotei speakers|speakers|speaker|panel|podium|cps strings convening|cps band convening|tuscany romance|happy anniversary drew and rachel|a little goose is about to be loose|hannah's makeup|sharmi \+ krishn mutli|gerber scarpelli photography|la via team|decadence|limelight|revel decor|revel space|custom t|nikkahnama|kippot|ketubah|chuppah fabric|horses?|boat|yacht)$/;

// ---------------------------------------------------------------------------
// Role rules — ordered by specificity. Each returns one or more role slugs.
// ---------------------------------------------------------------------------

interface HeadRule { id: string; rx: RegExp; roles: string[] }

/** Exact normalized-label table for the highest-volume and the ambiguous labels. */
const EXACT: Record<string, string[]> = {
  // venue-ish
  "photo credit": ["photographer"], "cover photo credits": ["photographer"], "cover shot by": ["photographer"], "shot by": ["photographer"], "captured by": ["photographer"],
  "second for": ["photographer"], "second shot for": ["photographer"], "second shots for": ["photographer"], "associate shot by": ["photographer"], "shot for": ["photographer"],
  photograph: ["photographer"], photograper: ["photographer"], "photo assists": ["second_shooter"], "video team": ["videographer"], "media team": ["videographer"], livestream: ["videographer"],
  "film scanning": ["album_editing"], "film labs": ["album_editing"], "reel by": ["videographer"], "video courtesy of": ["videographer"], "edited by": ["album_editing"],
  placecards: ["stationery"], papergoods: ["stationery"], "stationary design": ["stationery"], "invitation design": ["stationery"], "linen banners + table numbers": ["signage"],
  "seating chart wood buffet": ["signage"], "welcome sign art": ["signage"], "escort wall": ["signage"], engraver: ["stationery"], embroidery: ["accessories"], tie: ["accessories"], necklace: ["jewelry"],
  makeupartist: ["makeup"], "hair extensions": ["hair"], hairstyle: ["hair"], manicurist: ["beauty_services"], "tattoo station": ["beauty_services"], "teeth whitening": ["beauty_services"],
  "spray and brows by": ["beauty_services"], "mendhi artist": ["beauty_services"], "bridal morning look": ["hair", "makeup"], "hair for": ["hair"],
  "strings duo": ["live_music"], banda: ["cultural_performers"], "drag queens": ["entertainment_other"], "drag performer": ["entertainment_other"],
  marquee: ["tent"], drapes: ["lighting_production"], tablecloth: ["rentals"], "cake letters": ["decor_other"], "moravian stars": ["decor_other"], carpet: ["rentals"], ceramics: ["rentals"],
  sushi: ["catering"], culinary: ["catering"], appetizers: ["catering"], "catering by": ["catering"], "catering saturday": ["catering"], "champagne passers": ["staffing"], "onsite support": ["staffing"],
  "late night bites": ["desserts"], "espresso station": ["desserts"], "ice cream truck": ["desserts"], "chocolate artist": ["desserts"], "cake by": ["cake"],
  "floral wholesaler": ["florist"], "floral purses": ["accessories"], "dress rentals": ["attire"], "veil by": ["accessories"], "bridal sari": ["attire"], "bridal assistant": ["staffing"],
  producer: ["planner"], "art director": ["event_design"], organizers: ["planner"], "entertainment director": ["dj"], "travel agency": ["travel_honeymoon"], "dog handler": ["pet_attendant"],
  "party guest phone": ["guest_book"], "at @ secondary/stay": ["accommodations"], "pr & marketing support": ["noise"], "um filme produzido por": ["videographer"],
  venue: ["venue"], venues: ["venue"], "wedding venue": ["venue"], location: ["venue"], locations: ["venue"],
  "host property": ["venue"], "venue saturday": ["venue"], "at @": ["venue"], "#hashtag": ["venue"], hashtag: ["venue"], "at": ["venue"],
  "venue management & bar": ["venue_management", "bar_service"], "venue management": ["venue_management"],
  "venue & catering": ["venue", "catering"], "venue + catering": ["venue", "catering"], "venue and catering": ["venue", "catering"],
  "venue & caterer": ["venue", "catering"], "venue & food": ["venue", "catering"], "venue + bar": ["venue", "bar_service"],
  "planning & catering": ["planner", "catering"], "planner + caterer": ["planner", "catering"],
  hotel: ["accommodations"], hotels: ["accommodations"], "hotel block": ["accommodations"], accommodations: ["accommodations"],
  accommodation: ["accommodations"], accomodations: ["accommodations"], "prep hotel": ["accommodations"], "getting ready hotel": ["accommodations"],
  "at @ (secondary/stay)": ["accommodations"], "portrait location": ["venue"], "photo location": ["venue"],
  // planning
  planner: ["planner"], planners: ["planner"], planning: ["planner"], "wedding planner": ["planner"], "wedding planners": ["planner"],
  "wedding planning": ["planner"], "event planner": ["planner"], "event planning": ["planner"], "full planning": ["planner"],
  "planning team": ["planner"], "planning by": ["planner"], "sg planner": ["planner"], "wedding consultant": ["planner"],
  "vendor liaison": ["coordinator"], logistics: ["coordinator"],
  coordinator: ["coordinator"], coordinators: ["coordinator"], coordination: ["coordinator"], "wedding coordinator": ["coordinator"],
  "wedding coordination": ["coordinator"], "day of coordinator": ["coordinator"], "day of coordination": ["coordinator"],
  "event coordinator": ["coordinator"], "event coordination": ["coordinator"],
  "planning & design": ["planner", "event_design"], "planning and design": ["planner", "event_design"], "planning + design": ["planner", "event_design"],
  "planning & coordination": ["planner", "coordinator"], "planning + coordination": ["planner", "coordinator"],
  "planning and production": ["planner", "lighting_production"], "planning & production": ["planner", "lighting_production"],
  "planning + management": ["planner"], "design & planning": ["planner", "event_design"], "design and planning": ["planner", "event_design"],
  "planning and decor": ["planner", "event_design"], "planning & decor": ["planner", "event_design"], "planner & designer": ["planner", "event_design"],
  "planner + designer": ["planner", "event_design"], "planner & concept": ["planner", "event_design"], "concept + planning": ["planner", "event_design"],
  "planning & conceptual design": ["planner", "event_design"], "planning and concept design": ["planner", "event_design"],
  "design planning + concept": ["planner", "event_design"], "styling & planning": ["planner", "event_design"],
  "planning & florals": ["planner", "florist"], "planning + florals": ["planner", "florist"],
  design: ["event_design"], designer: ["event_design"], "event design": ["event_design"], "event designer": ["event_design"],
  styling: ["event_design"], stylist: ["event_design"], "wedding stylist": ["event_design"], "creative direction": ["event_design"],
  "creative director": ["event_design"], concept: ["event_design"], "decor styling": ["event_design"], "table designers": ["event_design"],
  "flat lay styling": ["event_design"], "styled by": ["event_design"], "assistant design collaboration": ["event_design"],
  "event producer": ["planner"], production: ["lighting_production"], "executive production team": ["planner"],
  // photo / video
  photography: ["photographer"], photographer: ["photographer"], photographers: ["photographer"], photo: ["photographer"], photos: ["photographer"],
  "photo credit": ["photographer"], "photography by": ["photographer"], "photos by": ["photographer"], "photo by": ["photographer"],
  "photo team": ["photographer"], "cover photo": ["photographer"], "cover photo by": ["photographer"], photog: ["photographer"], pc: ["photographer"],
  "lead photographer": ["photographer"], "main photographer": ["photographer"], "lead photography": ["photographer"], "photo lead": ["photographer"],
  "photographed by": ["photographer"], "wedding photography": ["photographer"], "photo director": ["photographer"], "lead photographer and host": ["photographer"],
  "host photographer": ["photographer"], "photography & portrait lounge": ["photographer"], portraits: ["photographer"],
  "second photographer": ["second_shooter"], "second shooter": ["second_shooter"], "second shooters": ["second_shooter"], "second shooting": ["second_shooter"],
  "second photog": ["second_shooter"], "associate photographer": ["second_shooter"], "assistant photographer": ["second_shooter"], "photo assistant": ["second_shooter"],
  "photo assist": ["second_shooter"], "supporting photographers": ["second_shooter"], "bts photographer": ["second_shooter"], "bts photo": ["second_shooter"],
  "photo & video": ["photographer", "videographer"], "photo + video": ["photographer", "videographer"], "photo and video": ["photographer", "videographer"],
  "photography & videography": ["photographer", "videographer"], "photography and videography": ["photographer", "videographer"],
  "photographer & videographer": ["photographer", "videographer"], "photographer and videographer": ["photographer", "videographer"],
  "photo & video team for": ["photographer", "videographer"], "p&v": ["photographer", "videographer"],
  video: ["videographer"], videography: ["videographer"], videographer: ["videographer"], videographers: ["videographer"], film: ["videographer"],
  "video by": ["videographer"], filmmaker: ["videographer"], cinematography: ["videographer"], cinema: ["videographer"], cinematographer: ["videographer"],
  "video director": ["videographer"], "bts video": ["videographer"], "bts videographer": ["videographer"], "chicago wedding videographer": ["videographer"],
  content: ["content_creator"], "content creator": ["content_creator"], "content creators": ["content_creator"], "content creation": ["content_creator"],
  contentday: ["content_creator"], "social content": ["content_creator"], "wedding content creator": ["content_creator"], "bts content": ["content_creator"],
  bts: ["content_creator"], "content by": ["content_creator"], "social media creator": ["content_creator"], "social media director": ["content_creator"],
  "photo booth": ["photo_booth"], photobooth: ["photo_booth"], "dj & photo booth": ["dj", "photo_booth"], "dj + photobooth": ["dj", "photo_booth"], "dj & photobooth": ["dj", "photo_booth"],
  drone: ["drone"], "l drone": ["drone"], editing: ["album_editing"], editor: ["album_editing"], album: ["album_editing"], albums: ["album_editing"],
  // florals / decor
  florals: ["florist"], floral: ["florist"], florist: ["florist"], florists: ["florist"], flowers: ["florist"], "floral design": ["florist"],
  "floral designer": ["florist"], "floral team": ["florist"], "floral artist & design": ["florist"], "flower design": ["florist"], "flowers design": ["florist"],
  "florals by": ["florist"], "flowers by": ["florist"], bouquet: ["florist"], bouquets: ["florist"], "bridal bouquet": ["florist"], "personal flowers": ["florist"],
  "floral bar": ["florist"], "floral co": ["florist"], "flower wall": ["florist"], plantscapes: ["florist"], "floral design & production": ["florist"],
  "floral & decor": ["florist", "decor_other"], "florals & decor": ["florist", "decor_other"], "floral + decor": ["florist", "decor_other"],
  "florals + decor": ["florist", "decor_other"], "decor & floral": ["florist", "decor_other"], "decor + floral": ["florist", "decor_other"],
  "floral and decor": ["florist", "decor_other"], "decor and floral": ["florist", "decor_other"], "decor & florals": ["florist", "decor_other"],
  "flowers and decor": ["florist", "decor_other"], "floral design + decor": ["florist", "decor_other"],
  "floral & design": ["florist", "event_design"], "florals & design": ["florist", "event_design"], "design + floral": ["florist", "event_design"],
  "design & floral": ["florist", "event_design"], "floral + design": ["florist", "event_design"], "floral and design": ["florist", "event_design"],
  "design and flowers": ["florist", "event_design"], "design & florals": ["florist", "event_design"], "floral & event design": ["florist", "event_design"],
  "floral + event design": ["florist", "event_design"], "event designer & florist": ["florist", "event_design"], "event designer and florist": ["florist", "event_design"],
  "floral & lighting": ["florist", "lighting_production"], "floral + lighting": ["florist", "lighting_production"], "catering & floral": ["catering", "florist"],
  lighting: ["lighting_production"], lights: ["lighting_production"], "lighting design": ["lighting_production"], "lighting & draping": ["lighting_production"],
  "lighting and draping": ["lighting_production"], "lighting + draping": ["lighting_production"], "lighting & drapery": ["lighting_production"],
  "lighting and drapery": ["lighting_production"], "draping & lighting": ["lighting_production"], "drapery & lighting": ["lighting_production"],
  "lighting & production": ["lighting_production"], "lighting + production": ["lighting_production"], "lighting + sound": ["lighting_production"],
  "lighting + av": ["lighting_production"], "lighting + tech": ["lighting_production"], "technical + lighting": ["lighting_production"],
  "lighting & decor": ["lighting_production", "decor_other"], "lighting & fabric": ["lighting_production"], "dj & lighting": ["dj", "lighting_production"],
  "dj & production": ["dj", "lighting_production"], draping: ["lighting_production"], drapery: ["lighting_production"], "table draping": ["rentals"],
  av: ["lighting_production"], "a/v": ["lighting_production"], sound: ["lighting_production"], "dance floor": ["lighting_production"], dancefloor: ["lighting_production"],
  "dance floor wrap": ["lighting_production"], stage: ["lighting_production"], staging: ["lighting_production"], "stage + dancefloor": ["lighting_production"],
  "design & production": ["event_design", "lighting_production"],
  rentals: ["rentals"], rental: ["rentals"], "event rentals": ["rentals"], "specialty rentals": ["rentals"], "wedding day rentals": ["rentals"],
  "equipment rentals": ["rentals"], "vintage rentals": ["rentals"], linens: ["rentals"], linen: ["rentals"], "specialty linens": ["rentals"],
  "custom linens": ["rentals"], "wedding linens": ["rentals"], "wedding day linens": ["rentals"], "linens & rentals": ["rentals"], "rentals & linen": ["rentals"],
  "rentals and linens": ["rentals"], "rentals & linens": ["rentals"], "linens and rentals": ["rentals"], "linen rentals": ["rentals"], "linens & chargers": ["rentals"],
  "linens + chargers": ["rentals"], chargers: ["rentals"], "chargers & flatware": ["rentals"], tabletop: ["rentals"], "table top rentals": ["rentals"],
  "tabletop rentals": ["rentals"], "tabletop rental": ["rentals"], "tabletop rentals & chairs": ["rentals"], "tabletops and rentals": ["rentals"],
  tableware: ["rentals"], "tableware rentals": ["rentals"], "table setting rentals": ["rentals"], "tablescape rentals": ["rentals"], tablescape: ["event_design"],
  tablescapes: ["event_design"], glassware: ["rentals"], napkins: ["rentals"], "cocktail napkins": ["rentals"], "glass placemats": ["rentals"],
  "custom linens and placemats": ["rentals"], "styling mats": ["rentals"], furniture: ["rentals"], "furniture rentals": ["rentals"], "furniture rental": ["rentals"],
  "lounge furniture": ["rentals"], lounge: ["rentals"], chairs: ["rentals"], chair: ["rentals"], "chair rentals": ["rentals"], "chair rental": ["rentals"],
  "chairs & lounge": ["rentals"], tables: ["rentals"], "tables + chairs": ["rentals"], "bar rental": ["rentals"], "custom bars": ["rentals"], restrooms: ["rentals"],
  "rehearsal dinner rentals": ["rentals"], "rentals & decor": ["rentals", "decor_other"], "rentals and design": ["rentals", "event_design"],
  "rentals and set design": ["rentals", "event_design"], "decor rentals": ["rentals"],
  tent: ["tent"], tenting: ["tent"], tents: ["tent"],
  decor: ["decor_other"], "the decor": ["decor_other"], "event decor": ["decor_other"], "custom decor": ["decor_other"], "decor by": ["decor_other"],
  decorators: ["decor_other"], decorator: ["decor_other"], "decor & design": ["decor_other", "event_design"], "design & decor": ["decor_other", "event_design"],
  "design and decor": ["decor_other", "event_design"], "decor and design": ["decor_other", "event_design"], backdrop: ["decor_other"], "backdrop decor": ["decor_other"],
  arch: ["decor_other"], candles: ["decor_other"], balloons: ["decor_other"], "balloon art": ["decor_other"], confetti: ["decor_other"], "ice sculpture": ["decor_other"],
  "marquee letters": ["decor_other"], "ceremony aisle": ["decor_other"], "ceremony curator": ["event_design"],
  signage: ["signage"], "custom signage": ["signage"], "welcome sign": ["signage"], "the signage": ["signage"], "signage & custom work": ["signage"],
  "seating chart": ["signage"], "signage & stationery": ["signage", "stationery"], "stationery & signage": ["stationery", "signage"],
  "signage + paper goods": ["signage", "stationery"], "invitations & signage": ["stationery", "signage"],
  // food & drink
  catering: ["catering"], caterer: ["catering"], caterers: ["catering"], cartering: ["catering"], food: ["catering"], cuisine: ["catering"], chef: ["catering"],
  chefs: ["catering"], dinner: ["catering"], "catering & bar": ["catering", "bar_service"], "bar & catering": ["catering", "bar_service"],
  "catering & cake": ["catering", "cake"], "catering + late night food": ["catering"], "reception catering": ["catering"], "ceremony catering": ["catering"],
  "sangeet catering": ["catering"], "grazing table": ["catering"], charcuterie: ["catering"], "cocktail hour food": ["catering"], "food truck": ["catering"],
  waitstaff: ["staffing"], staffing: ["staffing"],
  bar: ["bar_service"], alcohol: ["bar_service"], liquor: ["bar_service"], booze: ["bar_service"], beer: ["bar_service"], wine: ["bar_service"], beverage: ["bar_service"],
  beverages: ["bar_service"], drinks: ["bar_service"], cocktails: ["bar_service"], mocktails: ["bar_service"], bartending: ["bar_service"], bartender: ["bar_service"],
  "bartending service": ["bar_service"], "bar service": ["bar_service"], "bar services": ["bar_service"], "specialty bartenders": ["bar_service"],
  "mobile bar": ["bar_service"], mixologist: ["bar_service"], "champagne tower": ["bar_service"], "ice luge": ["bar_service"], "welcome drinks": ["bar_service"],
  "guinness foam bar": ["bar_service"], "custom bars rental": ["rentals"],
  cake: ["cake"], cakes: ["cake"], "wedding cake": ["cake"], bakery: ["cake"], baker: ["cake"], "cake artist": ["cake"], "cake bakery": ["cake"],
  "cake + sweets": ["cake", "desserts"], "cake & sweets": ["cake", "desserts"], "cake and desserts": ["cake", "desserts"], "cake & desserts": ["cake", "desserts"],
  "pastry + cake": ["cake", "desserts"], croquembouche: ["cake"], cupcakes: ["cake"],
  dessert: ["desserts"], desserts: ["desserts"], deserts: ["desserts"], sweets: ["desserts"], cookies: ["desserts"], donuts: ["desserts"], pie: ["desserts"], pies: ["desserts"],
  gelato: ["desserts"], "ice cream": ["desserts"], "ice cream cart": ["desserts"], "cotton candy": ["desserts"], boba: ["desserts"], coffee: ["desserts"],
  "coffee cart": ["desserts"], "late night snack": ["desserts"], "late night snacks": ["desserts"], "late night": ["desserts"], late: ["desserts"],
  "late night food": ["desserts"], "late night snacks + desserts": ["desserts"], "late night snack & desserts": ["desserts"],
  // music & entertainment
  dj: ["dj"], djs: ["dj"], "disc jockey": ["dj"], "dj entertainment": ["dj"], "dj & entertainment": ["dj"], entertainment: ["dj"], "entertainment by": ["dj"],
  "musical entertainment": ["dj"], "live entertainment": ["entertainment_other"], "reception entertainment": ["dj"], "ceremony entertainment": ["live_music"],
  "rehearsal entertainment": ["entertainment_other"], "after party entertainment": ["dj"], "after party dj": ["dj"], "afterparty dj": ["dj"], "reception dj": ["dj"],
  "entertainment reception": ["dj"], "sangeet entertainment": ["cultural_performers"], tunes: ["dj"], "dj & sax": ["dj", "live_music"],
  band: ["band"], bands: ["band"], "live band": ["band"], "reception band": ["band"], "wedding band": ["band"], "wedding bands": ["band"],
  music: ["live_music"], "music by": ["live_music"], musician: ["live_music"], musicians: ["live_music"], "live music": ["live_music"], "live musicians": ["live_music"],
  "ceremony music": ["live_music"], "ceremony musicians": ["live_music"], "ceremony musician": ["live_music"], "ceremony strings": ["live_music"],
  "cocktail music": ["live_music"], "cocktail hour live music": ["live_music"], "reception music": ["live_music"], "ceremony & dinner music": ["live_music"],
  strings: ["live_music"], "string quartet": ["live_music"], "string trio": ["live_music"], "string musicians": ["live_music"], quartet: ["live_music"],
  violinist: ["live_music"], violin: ["live_music"], cellist: ["live_music"], harpist: ["live_music"], harp: ["live_music"], pianist: ["live_music"], piano: ["live_music"],
  guitarist: ["live_music"], singer: ["live_music"], choir: ["live_music"], saxophonist: ["live_music"], saxophone: ["live_music"], sax: ["live_music"],
  "sax player": ["live_music"], "performances by": ["entertainment_other"],
  mc: ["mc"], emcee: ["mc"], "event host": ["mc"],
  mariachi: ["cultural_performers"], "mariachi band": ["cultural_performers"], dhol: ["cultural_performers"], dholi: ["cultural_performers"],
  bagpiper: ["cultural_performers"], bagpipes: ["cultural_performers"],
  dancers: ["dancers_choreography"], ballerina: ["dancers_choreography"], troupe: ["dancers_choreography"], "dance lessons": ["dancers_choreography"],
  "wedding dance lessons": ["dancers_choreography"], "dance instructor": ["dancers_choreography"], "dance choreography": ["dancers_choreography"],
  "first dance choreography": ["dancers_choreography"], performers: ["entertainment_other"], entertainers: ["entertainment_other"], magician: ["entertainment_other"],
  magic: ["entertainment_other"], fireworks: ["entertainment_other"], "cold sparklers": ["entertainment_other"], cigars: ["entertainment_other"],
  "cigar roller": ["entertainment_other"], "rehearsal dinner dueling pianos": ["entertainment_other"], "dueling pianos": ["entertainment_other"],
  // beauty
  hair: ["hair"], "hair stylist": ["hair"], "hair stylists": ["hair"], hairstylist: ["hair"], hairstylists: ["hair"], "hair by": ["hair"], "hair by me": ["hair"],
  "hair by yours truly": ["hair"], "bridal hair": ["hair"], "hair styling": ["hair"], "hair artist": ["hair"], "hair color": ["hair"], "bride's hair": ["hair"],
  "bride hair": ["hair"], "bridesmaids hair": ["hair"], "party hair": ["hair"], "bridal party hair": ["hair"], "speaker hair": ["hair"],
  makeup: ["makeup"], "make up": ["makeup"], make: ["makeup"], "makeup artist": ["makeup"], "makeup artists": ["makeup"], "make up artist": ["makeup"],
  "make up artists": ["makeup"], "makeup by": ["makeup"], "makeup by me": ["makeup"], "makeup by yours truly": ["makeup"], "bridal makeup": ["makeup"],
  "bride's makeup": ["makeup"], "bride makeup": ["makeup"], "bridal party makeup": ["makeup"], mua: ["makeup"], "the makeup": ["makeup"], glam: ["hair", "makeup"],
  "glam for": ["hair", "makeup"], "glam on": ["hair", "makeup"], "glam squad": ["hair", "makeup"], "bridal party glam + hair": ["hair", "makeup"], lips: ["makeup"], lip: ["makeup"],
  concealer: ["makeup"], blush: ["makeup"], skin: ["beauty_services"], "skin prep": ["beauty_services"],
  "hair & makeup": ["hair", "makeup"], "hair and makeup": ["hair", "makeup"], "hair + makeup": ["hair", "makeup"], "hair & make up": ["hair", "makeup"],
  "hair and make up": ["hair", "makeup"], "hair makeup": ["hair", "makeup"], "hair&makeup": ["hair", "makeup"], "makeup & hair": ["hair", "makeup"],
  "makeup + hair": ["hair", "makeup"], "makeup and hair": ["hair", "makeup"], "make up & hair": ["hair", "makeup"], "hair & makeup by yours truly": ["hair", "makeup"],
  "hair & makeup by me": ["hair", "makeup"], "hair + makeup by me": ["hair", "makeup"], "hair and makeup by me": ["hair", "makeup"], "hair & makeup by": ["hair", "makeup"],
  "hair and makeup by": ["hair", "makeup"], "hair & mua": ["hair", "makeup"], "hair + mua": ["hair", "makeup"], "hair and mua": ["hair", "makeup"],
  "hair & make": ["hair", "makeup"], "hair and make": ["hair", "makeup"], "hair + beauty": ["hair", "makeup"], "beauty + hair": ["hair", "makeup"],
  "bridal hair & makeup": ["hair", "makeup"], "bride's hair & makeup": ["hair", "makeup"], "hair stylist & makeup artist": ["hair", "makeup"],
  "hair & makeup artists": ["hair", "makeup"], "hair and makeup in the opening flyer": ["hair", "makeup"], hmu: ["hair", "makeup"], hmua: ["hair", "makeup"],
  hamu: ["hair", "makeup"], "h&mu": ["hair", "makeup"], "h&m": ["hair", "makeup"], muah: ["hair", "makeup"], "bridal party hmu": ["hair", "makeup"],
  "muah guests": ["hair", "makeup"], mu: ["makeup"], beauty: ["hair", "makeup"], "beauty team": ["hair", "makeup"], "bridal beauty": ["hair", "makeup"],
  henna: ["beauty_services"], "henna artist": ["beauty_services"], heena: ["beauty_services"], "the henna": ["beauty_services"], mehndi: ["beauty_services"],
  "bridal mehndi": ["beauty_services"], "the mehndi": ["beauty_services"], mehendi: ["beauty_services"], "spray tan": ["beauty_services"], tan: ["beauty_services"],
  "bride's tan": ["beauty_services"], nails: ["beauty_services"], lashes: ["beauty_services"], brows: ["beauty_services"], barber: ["beauty_services"],
  // attire
  dress: ["attire"], dresses: ["attire"], gown: ["attire"], gowns: ["attire"], "wedding dress": ["attire"], "wedding gown": ["attire"], "wedding gowns": ["attire"],
  "bridal gown": ["attire"], "bridal gowns": ["attire"], "bridal dress": ["attire"], "bridal attire": ["attire"], attire: ["attire"], "wedding attire": ["attire"],
  bridal: ["attire"], "bridal wear": ["attire"], "bridal apparel": ["attire"], "bridal outfit": ["attire"], "bridal wardrobe": ["attire"], "bridal boutique": ["attire"],
  "bridal shop": ["attire"], "bridal store": ["attire"], "bridal salon": ["attire"], "dress shop": ["attire"], "dress store": ["attire"], "dress boutique": ["attire"],
  "wedding dress shop": ["attire"], "gown salon": ["attire"], boutique: ["attire"], "dress designer": ["attire"], "dress designers": ["attire"], "gown designer": ["attire"],
  "wedding dress designer": ["attire"], "brides dress designer": ["attire"], "brides dress designer + shop": ["attire"], "bridesmaids dress designer": ["attire"],
  "grooms suit designer + shop": ["attire"], dresser: ["attire"], dressers: ["attire"], "wedding dresser": ["attire"], "dress by": ["attire"], "bride's dress": ["attire"],
  "brides dress": ["attire"], "bride dress": ["attire"], "bride's dresses": ["attire"], "bride's gown": ["attire"], "brides gown": ["attire"], "bride's attire": ["attire"],
  "bride attire": ["attire"], "brides attire": ["attire"], "brides wedding dress": ["attire"], "wedding dress attire": ["attire"], "second dress": ["attire"],
  "reception dress": ["attire"], "ceremony dress": ["attire"], "party dresses": ["attire"], "champagne dress": ["attire"], "morning dress": ["attire"],
  "private home dress": ["attire"], "saturday dress": ["attire"], "saturday second dress": ["attire"], "rehearsal dinner dress": ["attire"], "bride's ceremony gown": ["attire"],
  "brides ceremony dress": ["attire"], "second look": ["attire"], outfit: ["attire"], outfits: ["attire"], clothing: ["attire"], fashion: ["attire"],
  "fashion styling": ["attire"], "wardrobe styling": ["attire"], "wardrobe stylist": ["attire"], "bridal styling": ["attire"], "bridal stylist": ["attire"],
  "additional wardrobe": ["attire"], "bridal details": ["attire"], "groom details": ["attire"],
  suit: ["attire"], suits: ["attire"], suiting: ["attire"], tux: ["attire"], tuxes: ["attire"], tuxedo: ["attire"], tuxedos: ["attire"], menswear: ["attire"],
  mensware: ["attire"], "men's attire": ["attire"], "formal wear": ["attire"], "groom attire": ["attire"], "groom's attire": ["attire"], "grooms attire": ["attire"],
  "grooms' attire": ["attire"], "groom's tux": ["attire"], "grooms tux": ["attire"], "groom tux": ["attire"], "groom's suit": ["attire"], "grooms suit": ["attire"],
  "groom suit": ["attire"], "groom's tuxedo": ["attire"], "groom's outfit": ["attire"], "grooms outfit": ["attire"], "groom wedding day look": ["attire"],
  "groom tux & accessories": ["attire", "accessories"], "groom and groomsmen attire": ["attire"], "groomsmen attire": ["attire"], "groomsmen's tuxes": ["attire"],
  groomsmen: ["attire"], "guys attire": ["attire"], "grooms people attire": ["attire"], "wedding party attire": ["attire"], "brides people attire": ["attire"],
  "wedding tux attire": ["attire"], "second suit": ["attire"], "custom coat": ["attire"], gromswear: ["attire"],
  bridesmaids: ["attire"], "bridesmaids dresses": ["attire"], "bridesmaid dresses": ["attire"], "bridesmaids' dresses": ["attire"], "bridesmaids dress": ["attire"],
  "bridesmaid attire": ["attire"], "bridsemaid attire": ["attire"], "bm dresses": ["attire"],
  shoes: ["accessories"], "bride's shoes": ["accessories"], "bridal shoes": ["accessories"], "wedding shoes": ["accessories"], "groom's shoes": ["accessories"],
  boots: ["accessories"], veil: ["accessories"], "custom veil": ["accessories"], accessories: ["accessories"], "bridal accessories": ["accessories"],
  "bride's accessories": ["accessories"], "bridal gown & accessories": ["attire", "accessories"], "bride's dress & veil": ["attire", "accessories"],
  "dress and veil": ["attire", "accessories"], "gown & veil": ["attire", "accessories"], gloves: ["accessories"],
  alterations: ["alterations"], "dress alterations": ["alterations"], "bridal alterations": ["alterations"], tailor: ["alterations"], steaming: ["alterations"],
  jewelry: ["jewelry"], jewellery: ["jewelry"], jeweler: ["jewelry"], jewels: ["jewelry"], rings: ["jewelry"], ring: ["jewelry"], "wedding rings": ["jewelry"],
  "wedding jewelry": ["jewelry"], "engagement ring": ["jewelry"], "engagement rings": ["jewelry"], "groom's ring": ["jewelry"], "bride's rings": ["jewelry"],
  "bride's jewelry": ["jewelry"], "custom ring": ["jewelry"], "ring + band": ["jewelry"], "ring boxes": ["jewelry"], diamonds: ["jewelry"], earrings: ["jewelry"],
  // paper
  stationery: ["stationery"], stationary: ["stationery"], stationer: ["stationery"], invitations: ["stationery"], invitation: ["stationery"], invites: ["stationery"],
  "invitation suite": ["stationery"], "invitations & stationery": ["stationery"], "invitations and paperie": ["stationery"], "wedding stationary": ["stationery"],
  "paper goods": ["stationery"], paper: ["stationery"], "paper products": ["stationery"], "print goods": ["stationery"], "printed goods": ["stationery"],
  "printed items": ["stationery"], "print details": ["stationery"], printables: ["stationery"], print: ["stationery"], printing: ["stationery"],
  "paper details": ["stationery"], "paper artist": ["stationery"], "day of stationery": ["stationery"], "day of stationary": ["stationery"], menus: ["stationery"],
  "escort cards": ["stationery"], "place cards": ["stationery"], "escort card illustrations": ["stationery"], "stationery designer": ["stationery"],
  "stationery design": ["stationery"], "stationery & event branding": ["stationery"], "graphic design": ["stationery"], "graphic designer": ["stationery"], graphic: ["stationery"],
  calligraphy: ["calligraphy"], calligrapher: ["calligraphy"], "custom calligraphy takeaway": ["calligraphy"],
  // art & keepsakes
  "live painter": ["live_painter"], "live painting": ["live_painter"], "live wedding painter": ["live_painter"], painter: ["live_painter"], "live artist": ["live_painter"],
  artist: ["live_painter"], artists: ["live_painter"], "watercolor artists": ["live_painter"], "watercolor portraits": ["live_painter"], "custom painting": ["live_painter"],
  illustrator: ["live_painter"], "event illustrator": ["live_painter"], "live illustrator": ["live_painter"], "fashion & event illustrator": ["live_painter"],
  "sketch artist": ["live_painter"], "live sketch artist": ["live_painter"],
  "guest book": ["guest_book"], guestbook: ["guest_book"], "guest book phone": ["guest_book"], "phone guest book": ["guest_book"], "audio guest book": ["guest_book"],
  favors: ["favors_gifts"], "welcome bags": ["favors_gifts"], gifts: ["favors_gifts"],
  // logistics & services
  transportation: ["transportation"], transport: ["transportation"], transpo: ["transportation"], limo: ["transportation"], trolley: ["transportation"],
  "vintage car": ["transportation"], car: ["transportation"], "getaway car": ["transportation"], shuttle: ["transportation"], "party bus": ["transportation"],
  "guest transportation": ["transportation"], "guest transport": ["transportation"], "wedding party transportation": ["transportation"],
  "transportation & valet": ["transportation", "valet"], valet: ["valet"], "valet + coatcheck": ["valet"], parking: ["valet"],
  officiant: ["officiant"], celebrant: ["officiant"], minister: ["officiant"], pastor: ["officiant"], rabbi: ["officiant"], priest: ["officiant"],
  security: ["security"], "security team": ["security"],
  "dog nanny": ["pet_attendant"], "dog attendant": ["pet_attendant"], "dog chaperone": ["pet_attendant"], "dog sitter": ["pet_attendant"], "pet attendant": ["pet_attendant"],
  "dog service": ["pet_attendant"], "dog wedding attendant": ["pet_attendant"], "wedding day pet care": ["pet_attendant"],
  childcare: ["childcare"], nanny: ["childcare"], babysitter: ["childcare"],
  "custom t": ["favors_gifts"], "wedding website": ["website_registry"], registry: ["website_registry"], honeymoon: ["travel_honeymoon"], travel: ["travel_honeymoon"],
};

/** Head-noun rules: the LAST noun phrase decides. Order = specificity. */
const HEAD_RULES: HeadRule[] = [
  { id: "h.henna", rx: /\b(henna|mehndi|mehendi|mendhi) (artist|artists)$/, roles: ["beauty_services"] },
  { id: "h.second_shooter", rx: /\b(second|associate|assistant|supporting|bts) (photog|photographer|photographers|shooter|shooters)$/, roles: ["second_shooter"] },
  { id: "h.photo_booth", rx: /\b(photo ?booth|360 booth|booth)$/, roles: ["photo_booth"] },
  { id: "h.content", rx: /\b(content creators?|content creation|content)$/, roles: ["content_creator"] },
  { id: "h.videographer", rx: /\b(videograph(y|er|ers)|video|film|films|filmmaker|cinematograph(y|er)|cinema)$/, roles: ["videographer"] },
  { id: "h.photographer", rx: /\b(photograph(y|er|ers)|photos?|photog|pics?)$/, roles: ["photographer"] },
  { id: "h.drone", rx: /\bdrone$/, roles: ["drone"] },
  { id: "h.coordinator", rx: /\b(coordinat(or|ors|ion))$/, roles: ["coordinator"] },
  { id: "h.planner", rx: /\b(plann(er|ers|ing)|consultant)$/, roles: ["planner"] },
  { id: "h.event_design", rx: /\b(design|designer|designers|styling|stylist|styled|concept)$/, roles: ["event_design"] },
  { id: "h.lighting", rx: /\b(lighting|lights|draping|drapery|production|av|audio|sound|dance ?floor|stage|staging)$/, roles: ["lighting_production"] },
  { id: "h.tent", rx: /\b(tent|tents|tenting)$/, roles: ["tent"] },
  { id: "h.signage", rx: /\b(sign|signage|signs|seating chart)$/, roles: ["signage"] },
  { id: "h.rentals", rx: /\b(rentals?|linens?|chargers|tableware|tabletop|glassware|flatware|napkins|furniture|lounge|chairs?|tables?)$/, roles: ["rentals"] },
  { id: "h.florist", rx: /\b(florals?|florist|florists|flowers?|bouquets?|blooms?|greenery)$/, roles: ["florist"] },
  { id: "h.decor", rx: /\b(decor|decorations?|decorators?|backdrop|candles|balloons?|installation)$/, roles: ["decor_other"] },
  { id: "h.bar", rx: /\b(bar|bartend(er|ers|ing)|alcohol|liquor|drinks|cocktails|beverages?|mixolog(y|ist)|wine|beer|spirits)$/, roles: ["bar_service"] },
  { id: "h.cake", rx: /\b(cake|cakes|bakery|baker|cupcakes)$/, roles: ["cake"] },
  { id: "h.desserts", rx: /\b(desserts?|sweets|treats|cookies|donuts|pastry|pastries|gelato|ice cream|snacks?|coffee|espresso|macarons)$/, roles: ["desserts"] },
  { id: "h.catering", rx: /\b(catering|caterers?|food|chef|chefs|cuisine|dinner|lunch|brunch food)$/, roles: ["catering"] },
  { id: "h.dj", rx: /\b(dj|djs|entertainment)$/, roles: ["dj"] },
  { id: "h.band", rx: /\b(band|bands)$/, roles: ["band"] },
  { id: "h.live_music", rx: /\b(music|musicians?|strings?|quartet|trio|violin(ist)?|cell(o|ist)|harp(ist)?|pian(o|ist)|guitar(ist)?|sax(ophone|ophonist)?|singer|vocalist|soloist|choir)$/, roles: ["live_music"] },
  { id: "h.cultural", rx: /\b(mariachi|dhol|dholi|bagpip(e|es|er)|baraat band|lion dance|taiko)$/, roles: ["cultural_performers"] },
  { id: "h.dance", rx: /\b(dancers?|choreograph(y|er)|dance lessons?|dance instructor)$/, roles: ["dancers_choreography"] },
  { id: "h.mc", rx: /\b(mc|emcee|master of ceremonies)$/, roles: ["mc"] },
  { id: "h.entertainment_other", rx: /\b(performers?|entertainers?|magician|fireworks|sparklers|cigars?|cigar roller|dueling pianos|casino|caricatur(e|ist))$/, roles: ["entertainment_other"] },
  { id: "h.hair_makeup", rx: /\b(hmu|hmua|hamu|muah|h&mu|glam)$/, roles: ["hair", "makeup"] },
  { id: "h.makeup", rx: /\b(makeup|make up|mua|make)$/, roles: ["makeup"] },
  { id: "h.hair", rx: /\b(hair|hairstylists?|hair stylists?)$/, roles: ["hair"] },
  { id: "h.beauty_services", rx: /\b(henna|mehndi|mehendi|spray tan|tan|nails|lashes|brows|barber|grooming|skin)$/, roles: ["beauty_services"] },
  { id: "h.alterations", rx: /\b(alterations?|tailor|seamstress)$/, roles: ["alterations"] },
  { id: "h.accessories", rx: /\b(veil|veils|shoes|boots|heels|accessor(y|ies)|headpiece|hairpiece|gloves)$/, roles: ["accessories"] },
  { id: "h.jewelry", rx: /\b(jewel(ry|lery|er|ers|s)|rings?|diamonds|earrings)$/, roles: ["jewelry"] },
  { id: "h.attire", rx: /\b(dress|dresses|gowns?|attire|suits?|suiting|tux|tuxes|tuxedos?|menswear|mensware|outfits?|wardrobe|apparel|clothing|fashion|bridal|boutique|salon|shop|store|designer)$/, roles: ["attire"] },
  { id: "h.calligraphy", rx: /\b(calligraph(y|er))$/, roles: ["calligraphy"] },
  { id: "h.stationery", rx: /\b(stationery|stationary|stationer|invitations?|invites|paper|paper goods|paperie|printing|print|menus?|programs?|escort cards|place cards|suite)$/, roles: ["stationery"] },
  { id: "h.live_painter", rx: /\b(painter|painting|illustrator|illustration|sketch artist|artist|artists)$/, roles: ["live_painter"] },
  { id: "h.guest_book", rx: /\b(guest ?book)$/, roles: ["guest_book"] },
  { id: "h.favors", rx: /\b(favors?|gifts?|welcome bags?)$/, roles: ["favors_gifts"] },
  { id: "h.transportation", rx: /\b(transportation|transport|transpo|limo|limousine|trolley|shuttle|bus|car|cars)$/, roles: ["transportation"] },
  { id: "h.valet", rx: /\b(valet|parking)$/, roles: ["valet"] },
  { id: "h.officiant", rx: /\b(officiant|celebrant|minister|pastor|rabbi|priest)$/, roles: ["officiant"] },
  { id: "h.pet", rx: /\b(dog|pet|puppy) (nanny|attendant|chaperone|sitter|care|service)$/, roles: ["pet_attendant"] },
  { id: "h.childcare", rx: /\b(childcare|nanny|babysit(ter|ting)|kids)$/, roles: ["childcare"] },
  { id: "h.security", rx: /\bsecurity$/, roles: ["security"] },
  { id: "h.staffing", rx: /\b(staff|staffing|waitstaff|servers)$/, roles: ["staffing"] },
  { id: "h.accommodations", rx: /\b(hotel|hotels|accommodations?|accomodations|lodging|room block|hotel block|stay)$/, roles: ["accommodations"] },
  { id: "h.venue_management", rx: /\bvenue management$/, roles: ["venue_management"] },
  { id: "h.venue", rx: /\b(venue|venues|location|locations|church|parish|chapel|temple|synagogue|cathedral|estate|property)$/, roles: ["venue"] },
];

const COMPOUND_SPLIT = /\s*(?:&|\+|\/|,| and | with )\s*/;

/** Words that, when the ONLY content of a compound part, mean "same as the other part" (skip). */
const EMPTY_PART = /^(by|me|yours truly|team|more|us)?$/;

function classifyPart(part: string): { roles: string[]; ruleId: string } | null {
  const p = part.trim();
  if (!p) return null;
  const exact = EXACT[p];
  if (exact) return { roles: exact, ruleId: "exact" };
  // strip a leading possessive/qualifier that never changes the role
  const stripped = p
    .replace(/\s+(by|from|courtesy of|credits?|for|pictured|on behalf of)(\s+.*)?$/, "")
    .replace(/^(and|absolutely flawless|adorned with)\s+/, "")
    .replace(/^(bride's|brides|bride|groom's|grooms|groom|bridal|wedding|wedding day|custom|specialty|our|my|his|her|their|day of|full service|lead|main|indian|mediterranean|villa)\s+/g, "").trim();
  if (stripped !== p && stripped && EXACT[stripped]) return { roles: EXACT[stripped], ruleId: "exact.stripped" };
  if (stripped !== p && stripped) { for (const r of HEAD_RULES) if (r.rx.test(stripped)) return { roles: r.roles, ruleId: r.id + ".stripped" }; }
  for (const r of HEAD_RULES) if (r.rx.test(p)) return { roles: r.roles, ruleId: r.id };
  return null;
}

export function classifyLabel(raw: string): LabelClassification {
  const normalized = normalizeLabel(raw);
  const base = { label: raw, normalized };
  if (!normalized) return { ...base, roles: ["noise"], eventContext: "wedding_day", participant: null, ruleId: "empty" };

  const participant = detectParticipant(normalized);
  if (participant) return { ...base, roles: [], eventContext: "wedding_day", participant, ruleId: "participant" };
  if (PRESS_RX.test(normalized)) return { ...base, roles: ["press_feature"], eventContext: "wedding_day", participant: null, ruleId: "press" };
  if (NOISE_RX.test(normalized)) return { ...base, roles: ["noise"], eventContext: "wedding_day", participant: null, ruleId: "noise" };

  const eventContext = extractContext(normalized);

  // 1. phase-only labels mean the venue of that phase
  if (PHASE_ONLY_VENUE[normalized] !== undefined) {
    return { ...base, roles: ["venue"], eventContext: PHASE_ONLY_VENUE[normalized], participant: null, ruleId: "phase_venue" };
  }
  // 2. exact table on the whole label
  const whole = classifyPart(normalized);
  if (whole && whole.ruleId.startsWith("exact")) return { ...base, roles: whole.roles, eventContext, participant: null, ruleId: whole.ruleId };

  // 3. remove context modifiers, retry exact/head on the remainder
  let remainder = normalized;
  for (const [, rx] of CONTEXT_PATTERNS) remainder = remainder.replace(rx, " ");
  remainder = remainder.replace(/\b(venue|location|hotel)$/, (m) => m).replace(/\s+/g, " ").trim();
  if (remainder !== normalized) {
    if (!remainder || /^(venue|location|site)$/.test(remainder)) {
      return { ...base, roles: [eventContext === "getting_ready" && /hotel/.test(normalized) ? "accommodations" : "venue"], eventContext, participant: null, ruleId: "phase_venue.modifier" };
    }
    if (/^hotel$/.test(remainder)) return { ...base, roles: ["accommodations"], eventContext, participant: null, ruleId: "phase_accommodations" };
    const rparts = remainder.split(COMPOUND_SPLIT).map((s) => s.trim()).filter((s) => s && !EMPTY_PART.test(s));
    if (rparts.length > 1) {
      const roles: string[] = []; const ids: string[] = [];
      for (const part of rparts) { const r = classifyPart(part); if (r) { for (const x of r.roles) if (!roles.includes(x)) roles.push(x); ids.push(r.ruleId); } }
      if (roles.length) return { ...base, roles, eventContext, participant: null, ruleId: `compound(${ids.join("+")}).ctx` };
    }
    const r = classifyPart(remainder);
    if (r) return { ...base, roles: r.roles, eventContext, participant: null, ruleId: `${r.ruleId}.ctx` };
  }

  // 4. compound labels: classify each part, union the roles
  const parts = normalized.split(COMPOUND_SPLIT).map((s) => s.trim()).filter((s) => s && !EMPTY_PART.test(s));
  if (parts.length > 1) {
    const roles: string[] = []; const ids: string[] = [];
    for (const part of parts) {
      const r = classifyPart(part);
      if (r) { for (const x of r.roles) if (!roles.includes(x)) roles.push(x); ids.push(r.ruleId); }
    }
    if (roles.length) return { ...base, roles, eventContext, participant: null, ruleId: `compound(${ids.join("+")})` };
  }

  // 5. head-noun rules on the whole label
  if (whole) return { ...base, roles: whole.roles, eventContext, participant: null, ruleId: whole.ruleId };

  return { ...base, roles: ["other"], eventContext, participant: null, ruleId: "unmatched" };
}

/** Map from the v9 enum to the D056 slug, for reports that compare old vs new. */
export const V9_TO_D056: Record<string, string> = {
  venue: "venue", planner: "planner", photographer: "photographer", videographer: "videographer",
  florist: "florist", hair: "hair", makeup: "makeup", dj: "dj", band: "band", musician: "live_music",
  attire: "attire", stationery: "stationery", cake: "cake", catering: "catering", rentals: "rentals",
  transportation: "transportation", photobooth: "photo_booth", officiant: "officiant", hotel: "accommodations",
  jeweler: "jewelry", content_creator: "content_creator", beauty_other: "beauty_services", other: "other",
};
