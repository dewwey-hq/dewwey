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
