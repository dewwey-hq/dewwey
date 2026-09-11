/**
 * Display labels + canonical ordering for vendor_role enum values.
 *
 * D056 stage 2 (2026-09-10): the enum was renamed (beauty_other -> beauty_services,
 * jeweler -> jewelry, photobooth -> photo_booth, musician -> live_music) and ~30 new
 * values were added — see `VENDOR_ROLES` in `scripts/graph/vendorRoleRules.ts` for the
 * taxonomy (category -> slug -> display) this list is derived from. `hotel` is kept as
 * a distinct legacy value (not renamed to `accommodations`) — see the "hotel" comment in
 * `lib/server/vendors.ts` for why the two coexist.
 */
export const ROLE_LABELS: Record<string, string> = {
  // venue
  venue: "Venue",
  venue_management: "Venue management",
  accommodations: "Accommodations",
  hotel: "Hotel",
  // planning
  planner: "Planning",
  coordinator: "Coordination",
  event_design: "Event design & styling",
  // photo / video
  photographer: "Photography",
  second_shooter: "Second photographer",
  videographer: "Videography",
  content_creator: "Content",
  photo_booth: "Photo Booth",
  drone: "Drone",
  album_editing: "Albums & editing",
  // florals / decor
  florist: "Florals",
  lighting_production: "Lighting & production",
  rentals: "Rentals",
  tent: "Tenting",
  signage: "Signage",
  decor_other: "Decor",
  // food / drink
  catering: "Catering",
  bar_service: "Bar service",
  cake: "Cake",
  desserts: "Desserts & treats",
  // music / entertainment
  dj: "DJ",
  band: "Band",
  live_music: "Live music",
  mc: "MC",
  cultural_performers: "Cultural performers",
  dancers_choreography: "Dance & choreography",
  entertainment_other: "Entertainment",
  // beauty
  hair: "Hair",
  makeup: "Makeup",
  beauty_services: "Beauty",
  // attire
  attire: "Attire",
  accessories: "Accessories",
  alterations: "Alterations",
  jewelry: "Jewelry",
  // paper
  stationery: "Stationery",
  calligraphy: "Calligraphy",
  // art / keepsakes
  live_painter: "Live art",
  guest_book: "Guest book",
  favors_gifts: "Favors & gifts",
  // logistics / services
  transportation: "Transportation",
  valet: "Valet & parking",
  officiant: "Officiant",
  security: "Security",
  childcare: "Childcare",
  pet_attendant: "Pet attendant",
  travel_honeymoon: "Travel & honeymoon",
  website_registry: "Website & registry",
  staffing: "Staffing",
  // other
  other: "Other",
  press_feature: "Featured in",
  noise: "(not a credit)",
};

/** Stack rendering order — venue anchors, core creative team next. */
export const ROLE_ORDER = Object.keys(ROLE_LABELS);

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABELS[role]) || "Vendor";
}

export function roleSortKey(role: string | null | undefined): number {
  const i = ROLE_ORDER.indexOf(role ?? "");
  return i === -1 ? ROLE_ORDER.length : i;
}

/**
 * D056 stage 3 (2026-09-10): the two-level taxonomy's category layer, for the
 * `/vendors` browse groups and the vendor-detail "Credited as" chips. This is a COPY
 * of the `category` field on `VENDOR_ROLES` in `scripts/graph/vendorRoleRules.ts` (that
 * source of truth) — `scripts/` is excluded from the production tsconfig, so this file
 * doesn't import across that boundary; keep the two lists in sync by hand. `hotel` is a
 * live legacy role value not present in VENDOR_ROLES (see the "hotel" comment in
 * lib/server/vendors.ts) — it's grouped under "venue" here alongside `accommodations`.
 */
export interface RoleCategoryGroup {
  slug: string;
  label: string;
  roles: string[];
}

export const ROLE_CATEGORIES: RoleCategoryGroup[] = [
  { slug: "venue", label: "Venues", roles: ["venue", "venue_management", "accommodations", "hotel"] },
  { slug: "planning", label: "Planning", roles: ["planner", "coordinator", "event_design"] },
  {
    slug: "photo_video",
    label: "Photo & Video",
    roles: [
      "photographer",
      "second_shooter",
      "videographer",
      "content_creator",
      "photo_booth",
      "drone",
      "album_editing",
    ],
  },
  {
    slug: "florals_decor",
    label: "Florals & Decor",
    roles: ["florist", "lighting_production", "rentals", "tent", "signage", "decor_other"],
  },
  { slug: "food_drink", label: "Food & Drink", roles: ["catering", "bar_service", "cake", "desserts"] },
  {
    slug: "music_entertainment",
    label: "Music & Entertainment",
    roles: ["dj", "band", "live_music", "mc", "cultural_performers", "dancers_choreography", "entertainment_other"],
  },
  { slug: "beauty", label: "Beauty", roles: ["hair", "makeup", "beauty_services"] },
  { slug: "attire", label: "Attire", roles: ["attire", "accessories", "alterations", "jewelry"] },
  { slug: "paper", label: "Paper", roles: ["stationery", "calligraphy"] },
  {
    slug: "art_keepsakes",
    label: "Art & Keepsakes",
    roles: ["live_painter", "guest_book", "favors_gifts"],
  },
  {
    slug: "logistics_services",
    label: "Logistics & Services",
    roles: [
      "transportation",
      "valet",
      "officiant",
      "security",
      "childcare",
      "pet_attendant",
      "travel_honeymoon",
      "website_registry",
      "staffing",
    ],
  },
  { slug: "other", label: "Other", roles: ["other"] },
];

const ROLE_TO_CATEGORY: Map<string, string> = new Map(
  ROLE_CATEGORIES.flatMap((c) => c.roles.map((r) => [r, c.slug] as const))
);

export function roleCategory(role: string | null | undefined): string | null {
  return (role && ROLE_TO_CATEGORY.get(role)) || null;
}

/** All roles belonging to a category slug, or null when the slug isn't recognized. */
export function categoryRoles(category: string | null | undefined): string[] | null {
  const group = ROLE_CATEGORIES.find((c) => c.slug === category);
  return group ? group.roles : null;
}

const CONTEXT_LABELS: Record<string, string> = {
  ceremony: "Ceremony",
  reception: "Reception",
  getting_ready: "Getting ready",
  rehearsal_dinner: "Rehearsal dinner",
  welcome_party: "Welcome party",
  after_party: "After party",
  cocktail_hour: "Cocktail hour",
  brunch: "Brunch",
  engagement: "Engagement",
  shower: "Shower",
  sangeet_mehndi: "Sangeet / Mehndi",
};

/**
 * Human label for a `wedding_event` context, e.g. "Rehearsal dinner". `wedding_day` (the
 * default context — no modifier was present on the credit label) renders as nothing. When
 * `role` is `"venue"`, ceremony/reception read as "Ceremony venue"/"Reception venue" instead
 * of the bare event name (for a standalone venue-context badge, not paired with a role
 * label that already says "Venue" — see the WeddingFeedCard chip, which omits `role` here
 * to avoid "Venue · Reception venue").
 */
export function contextLabel(ctx: string | null | undefined, role?: string | null): string | null {
  if (!ctx || ctx === "wedding_day") return null;
  if (role === "venue") {
    if (ctx === "ceremony") return "Ceremony venue";
    if (ctx === "reception") return "Reception venue";
  }
  return CONTEXT_LABELS[ctx] ?? null;
}
