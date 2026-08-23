/** Display labels + canonical ordering for vendor_role enum values. */
export const ROLE_LABELS: Record<string, string> = {
  venue: "Venue",
  planner: "Planning",
  photographer: "Photography",
  videographer: "Videography",
  florist: "Florals",
  hair: "Hair",
  makeup: "Makeup",
  dj: "DJ",
  band: "Band",
  musician: "Music",
  attire: "Attire",
  stationery: "Stationery",
  cake: "Cake",
  catering: "Catering",
  rentals: "Rentals",
  transportation: "Transportation",
  photobooth: "Photo Booth",
  officiant: "Officiant",
  hotel: "Hotel",
  jeweler: "Jewelry",
  content_creator: "Content",
  beauty_other: "Beauty",
  other: "Other",
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
