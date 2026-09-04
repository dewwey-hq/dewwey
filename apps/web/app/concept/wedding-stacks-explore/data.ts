/**
 * Design-swatch data only. Overlap is the point: a couple has to be able to tap
 * "this photographer + this florist" and see more than one wedding come back.
 * Names are real Chicago vendors already used in the golden-set pages; pairings
 * and extra weddings are invented so the explore mechanic is feelable.
 */

export type Role =
  | "Venue"
  | "Photography"
  | "Videography"
  | "Florals"
  | "Planning"
  | "Hair & Makeup"
  | "Music"
  | "Catering"
  | "Attire";

export interface Vendor {
  id: string;
  name: string;
  role: Role;
  /** Quiet price hint for the cost-pairing payoff. Not a real quote. */
  est?: string;
}

export interface Wedding {
  id: string;
  couple: string;
  date: string;
  venueId: string;
  photoIds: string[];
  vendorIds: string[];
  caption: string;
  /** How many vendors independently posted this day. */
  nPosts: number;
  tone: string;
}

export const VENDORS: Record<string, Vendor> = {
  marchetti: { id: "marchetti", name: "Galleria Marchetti", role: "Venue", est: "$18–28k rental" },
  greenhouse: { id: "greenhouse", name: "Greenhouse Loft", role: "Venue", est: "$8–14k rental" },
  geraghty: { id: "geraghty", name: "The Geraghty", role: "Venue", est: "$12–20k rental" },
  londonhouse: { id: "londonhouse", name: "LondonHouse Chicago", role: "Venue", est: "$15–24k rental" },
  field: { id: "field", name: "Field Museum", role: "Venue", est: "inquire" },
  diamond: { id: "diamond", name: "Diamond Garden", role: "Venue", est: "$6–11k rental" },
  mayah: { id: "mayah", name: "Mayah Lee Photography", role: "Photography", est: "$6–9k" },
  fox: { id: "fox", name: "Fox + Ivory", role: "Photography", est: "$8–12k" },
  gerber: { id: "gerber", name: "Gerber + Scarpelli", role: "Photography", est: "$7–10k" },
  kayleen: { id: "kayleen", name: "Kayleen Nyshell Photography", role: "Photography", est: "$4–6k" },
  sally: { id: "sally", name: "Sally O'Donnell Photography", role: "Photography", est: "$5–7k" },
  kyrie: { id: "kyrie", name: "Kyrie Copeland Films", role: "Videography", est: "$5–8k" },
  flowerchild: { id: "flowerchild", name: "Flowerchild Floral Design", role: "Florals", est: "$4–8k" },
  leaf: { id: "leaf", name: "A New Leaf", role: "Florals", est: "$5–9k" },
  fleurish: { id: "fleurish", name: "Fleurish", role: "Florals", est: "$3–6k" },
  hmr: { id: "hmr", name: "HMR Designs", role: "Florals", est: "$8–14k" },
  clementine: { id: "clementine", name: "Clementine Custom Events", role: "Planning", est: "$5–9k" },
  estera: { id: "estera", name: "Estera Events", role: "Planning", est: "$4–7k" },
  elizabeth: { id: "elizabeth", name: "Elizabeth Scott Company", role: "Hair & Makeup", est: "$1.2–2k" },
  greenline: { id: "greenline", name: "Greenline Talent", role: "Music", est: "$2–4k" },
  fft: { id: "fft", name: "Food For Thought", role: "Catering", est: "$95–140/guest" },
  entertaining: { id: "entertaining", name: "Entertaining Company", role: "Catering", est: "$110–160/guest" },
  marchettiFnb: { id: "marchettiFnb", name: "Marchetti in-house", role: "Catering", est: "$185–245/guest" },
  tux: { id: "tux", name: "Generation Tux", role: "Attire" },
};

/** Distinctive Unsplash wedding stills. Cropped at render time. */
export const PHOTOS: Record<string, string> = {
  pavilion: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1400&q=80",
  aisle: "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1400&q=80",
  walk: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1400&q=80",
  bouquet: "https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1400&q=80",
  table: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1400&q=80",
  dance: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=80",
  outdoor: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1400&q=80",
  loft: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=80",
  cake: "https://images.unsplash.com/photo-1535254973040-607b474cb50d?auto=format&fit=crop&w=1400&q=80",
  rings: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1400&q=80",
  greenery: "https://images.unsplash.com/photo-1478146896981-b80fe285f27e?auto=format&fit=crop&w=1400&q=80",
  candles: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1400&q=80",
  rooftop: "https://images.unsplash.com/photo-1519167758481-83f29da8c2b0?auto=format&fit=crop&w=1400&q=80",
  museum: "https://images.unsplash.com/photo-1578662996442-48f36e0fd3d4?auto=format&fit=crop&w=1400&q=80",
  color: "https://images.unsplash.com/photo-1460978813358-0e729b11bb46?auto=format&fit=crop&w=1400&q=80",
  firstlook: "https://images.unsplash.com/photo-1529634573904-1f0a5d0c2508?auto=format&fit=crop&w=1400&q=80",
};

export const WEDDINGS: Wedding[] = [
  {
    id: "carrie-mike",
    couple: "Carrie & Mike",
    date: "May 2026",
    venueId: "marchetti",
    photoIds: ["pavilion", "table", "dance"],
    vendorIds: ["marchetti", "mayah", "kyrie", "flowerchild", "elizabeth", "greenline", "clementine", "marchettiFnb", "tux"],
    caption: "The Pavilion, a second line, and a full credit stack.",
    nPosts: 3,
    tone: "Garden party in a glass pavilion",
  },
  {
    id: "priya-james",
    couple: "Priya & James",
    date: "October 2025",
    venueId: "marchetti",
    photoIds: ["aisle", "bouquet"],
    vendorIds: ["marchetti", "mayah", "flowerchild", "clementine", "marchettiFnb"],
    caption: "Same photographer and florist, a year earlier.",
    nPosts: 2,
    tone: "Soft autumn ceremony",
  },
  {
    id: "elena-chris",
    couple: "Elena & Chris",
    date: "June 2026",
    venueId: "marchetti",
    photoIds: ["walk"],
    vendorIds: ["marchetti", "fox", "leaf", "estera", "marchettiFnb"],
    caption: "Brighter, more editorial. Different team, same rooms.",
    nPosts: 1,
    tone: "Editorial and bright",
  },
  {
    id: "thin-stack",
    couple: "A Saturday in June",
    date: "June 2026",
    venueId: "marchetti",
    photoIds: ["firstlook"],
    vendorIds: ["marchetti", "kayleen"],
    caption: "Only the photographer posted. Real data looks like this too.",
    nPosts: 1,
    tone: "Quiet first look",
  },
  {
    id: "sally-day",
    couple: "Walking into the Pavilion",
    date: "June 2026",
    venueId: "marchetti",
    photoIds: ["color"],
    vendorIds: ["marchetti", "sally", "marchettiFnb"],
    caption: "A thin stack with in-house catering still attached.",
    nPosts: 1,
    tone: "Color-forward reception",
  },
  {
    id: "loft-mayah",
    couple: "Nina & Alex",
    date: "September 2025",
    venueId: "greenhouse",
    photoIds: ["loft", "greenery", "cake"],
    vendorIds: ["greenhouse", "mayah", "flowerchild", "fft", "estera"],
    caption: "Mayah and Flowerchild, off Marchetti. The pair travels.",
    nPosts: 3,
    tone: "Industrial loft, heavy greenery",
  },
  {
    id: "loft-gerber",
    couple: "Sam & Jordan",
    date: "April 2026",
    venueId: "greenhouse",
    photoIds: ["candles", "table"],
    vendorIds: ["greenhouse", "gerber", "fleurish", "fft", "clementine"],
    caption: "Candlelight and a different florist in the same loft.",
    nPosts: 2,
    tone: "Candlelit loft dinner",
  },
  {
    id: "geraghty-hmr",
    couple: "Olivia & Ben",
    date: "August 2025",
    venueId: "geraghty",
    photoIds: ["dance", "rings"],
    vendorIds: ["geraghty", "gerber", "hmr", "entertaining", "estera"],
    caption: "Bigger florals, different kitchen.",
    nPosts: 2,
    tone: "Lush and classic",
  },
  {
    id: "geraghty-fox",
    couple: "Maya & Theo",
    date: "May 2025",
    venueId: "geraghty",
    photoIds: ["outdoor", "bouquet"],
    vendorIds: ["geraghty", "fox", "flowerchild", "entertaining"],
    caption: "Fox + Ivory with Flowerchild, not at Marchetti.",
    nPosts: 1,
    tone: "Outdoor-to-indoor",
  },
  {
    id: "lh-fox",
    couple: "Grace & Daniel",
    date: "November 2025",
    venueId: "londonhouse",
    photoIds: ["rooftop", "table"],
    vendorIds: ["londonhouse", "fox", "leaf", "estera"],
    caption: "Hotel bones, same editorial pair as Elena & Chris.",
    nPosts: 2,
    tone: "Rooftop hotel",
  },
  {
    id: "lh-mayah",
    couple: "Harper & Luis",
    date: "July 2025",
    venueId: "londonhouse",
    photoIds: ["candles"],
    vendorIds: ["londonhouse", "mayah", "fleurish", "kyrie"],
    caption: "Mayah without Flowerchild. The pair is a choice, not a rule.",
    nPosts: 1,
    tone: "City night",
  },
  {
    id: "field-gerber",
    couple: "Ava & Cole",
    date: "March 2026",
    venueId: "field",
    photoIds: ["museum", "aisle"],
    vendorIds: ["field", "gerber", "hmr", "entertaining"],
    caption: "Same photographer and florist as Olivia & Ben, different building.",
    nPosts: 2,
    tone: "Museum after dark",
  },
  {
    id: "diamond-kayleen",
    couple: "Riley & Pat",
    date: "February 2026",
    venueId: "diamond",
    photoIds: ["cake"],
    vendorIds: ["diamond", "kayleen", "fleurish"],
    caption: "Smaller room, thinner stack.",
    nPosts: 1,
    tone: "Intimate banquet",
  },
];

export function vendorsOf(w: Wedding): Vendor[] {
  return w.vendorIds.map((id) => VENDORS[id]).filter(Boolean);
}

export function photosOf(w: Wedding): string[] {
  return w.photoIds.map((id) => PHOTOS[id]).filter(Boolean);
}

export function venueOf(w: Wedding): Vendor {
  return VENDORS[w.venueId];
}

export function initial(name: string): string {
  return name
    .split(/\s+/)
    .filter((p) => p !== "+" && p !== "&")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

const HUES = [12, 28, 142, 198, 258, 320, 40, 170, 82];
export function hueFor(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % HUES.length;
  return HUES[n];
}

export function matchesPair(w: Wedding, pair: string[]): boolean {
  if (pair.length === 0) return true;
  return pair.every((id) => w.vendorIds.includes(id));
}

export function countWith(pair: string[], exceptId?: string): number {
  return WEDDINGS.filter((w) => w.id !== exceptId && matchesPair(w, pair)).length;
}

export function suggestedPair(w: Wedding, venuePinned: boolean): string[] {
  const vs = vendorsOf(w);
  const photo = vs.find((v) => v.role === "Photography");
  const floral = vs.find((v) => v.role === "Florals");
  const venue = vs.find((v) => v.role === "Venue");
  const catering = vs.find((v) => v.role === "Catering");
  const candidates: string[][] = [];
  if (photo && floral) candidates.push([photo.id, floral.id]);
  if (venue && photo) candidates.push([venue.id, photo.id]);
  if (venue && floral) candidates.push([venue.id, floral.id]);
  if (venue && catering) candidates.push([venue.id, catering.id]);
  if (venuePinned) {
    const offVenue = candidates.filter((c) => !c.includes(w.venueId));
    const pool = offVenue.length > 0 ? offVenue : candidates;
    const ranked = [...pool].sort((a, b) => countWith(b, w.id) - countWith(a, w.id));
    if (ranked[0]) return ranked[0];
  } else {
    const ranked = [...candidates].sort((a, b) => countWith(b, w.id) - countWith(a, w.id));
    if (ranked[0]) return ranked[0];
  }
  return w.vendorIds.slice(0, 2);
}
