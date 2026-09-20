/**
 * Icon maps for the generic VenueDetailsView renderer (round 5 rule 9) — rebuilt from the three
 * concept pages' own lucide-react choices (`app/concept/greenhouse-loft/page.tsx`,
 * `app/concept/londonhouse-chicago-v2/page.tsx`, `app/concept/galleria-marchetti-v5/DetailsContent.tsx`
 * + `galleria-marchetti-v4/page.tsx`, which share the same INCLUDED_ICONS choices) instead of an
 * ad-hoc subset invented for the generic renderer. `Sparkles` is the only fallback, for both
 * inclusion labels and add-on categories the concept pages never needed an icon for.
 */

import {
  Accessibility,
  AirVent,
  Armchair,
  ArrowUpCircle,
  BedDouble,
  Blinds,
  Cake,
  CalendarClock,
  Camera,
  Church,
  ClipboardCheck,
  GlassWater,
  House,
  Lamp,
  Mic2,
  Music,
  Palette,
  Projector,
  ShieldCheck,
  Shirt,
  Sparkles,
  SquareParking,
  Table2,
  Tag,
  UserCheck,
  UtensilsCrossed,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { AddOnCategoryStd, InclusionLabel } from "@/lib/venueDetails/types";

/** Per-item icons for What's Included, keyed by the canonical `InclusionLabel` (golden-set-
 * template.md §2's restructured `{label, label_raw}` shape). A label this map doesn't cover falls
 * back to `Sparkles` (round 5 rule 9) rather than forcing a literal icon for everything — the three
 * concept pages themselves never assigned one to every inclusion either. */
export const INCLUSION_ICONS: Partial<Record<InclusionLabel, LucideIcon>> = {
  "Exclusively yours": House,
  "Bridal suite": BedDouble,
  "Bar space": GlassWater,
  Parking: SquareParking,
  "Coat check": Shirt,
  Accessibility: Accessibility,
  "Heating & A/C": AirVent,
  Tables: Table2,
  Chairs: Armchair,
  // Palette (not Blinds) — londonhouse-chicago-v2 and galleria-marchetti-v4/v5 both use Palette
  // for their own "Linens" inclusion; Blinds is reserved for "Décor" (Greenhouse Loft's choice).
  Linens: Palette,
  "Dance floor": Music,
  DJ: Music,
  "Sound & AV": Projector,
  Photobooth: Camera,
  Videography: Video,
  Coordinator: UserCheck,
  Security: ShieldCheck,
  "Candle treatment": Lamp,
  Décor: Blinds,
  Ceremony: Church,
  // londonhouse-chicago-v2's own choices for its ballroom-shaped inclusions.
  Stage: Mic2,
  "Wedding cake": Cake,
  "Banquet Captain": ClipboardCheck,
  "Complimentary suite": BedDouble,
  "Parent upgrades": ArrowUpCircle,
  "Room block": Tag,
};

/** One icon per standard add-on category (round 5 rule 9 — "use the same map for add-on cards by
 * category_std"), drawn from the same three pages' own vocabulary rather than inventing a new set:
 * `UtensilsCrossed` (their shared "catering" quick-fact icon), `House` (their shared "Exclusively
 * yours"/setting icon), `Lamp` (Greenhouse's "Candle treatment"), `Music` (Greenhouse's "Dance
 * floor"/"DJ"), `UserCheck` (Greenhouse's "Coordinator"), `Church` (every page's "Ceremony"),
 * `CalendarClock` (Greenhouse's "Rehearsal" add-on). `Other` is the one category `Sparkles` is
 * deliberately assigned to, not just falls back onto. */
export const ADD_ON_CATEGORY_ICONS: Record<AddOnCategoryStd, LucideIcon> = {
  fb: UtensilsCrossed,
  space_rentals: House,
  decor: Palette,
  lighting_av: Lamp,
  entertainment: Music,
  services_staffing: UserCheck,
  ceremony: Church,
  time: CalendarClock,
  other: Sparkles,
};
