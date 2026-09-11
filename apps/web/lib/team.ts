/**
 * "Your team" — the couple's wedding, as a set of slots to fill.
 * v1 lives in localStorage; the shape is designed to sync to Supabase later.
 */

import { categoryRoles } from "./roles";

export type TeamEntryKind = "dewwey" | "custom";
export type TeamEntryStatus = "considering" | "booked";

export interface TeamEntry {
  id: string;
  slot: string;
  kind: TeamEntryKind;
  status: TeamEntryStatus;
  name: string;
  /** dewwey entries only */
  accountId?: number;
  username?: string;
  avatarUrl?: string | null;
  /** custom entries only */
  instagram?: string;
  website?: string;
}

export interface TeamState {
  slots: string[];
  entries: TeamEntry[];
}

/** Default slot checklist — every wedding has these to fill. */
export const DEFAULT_SLOTS = [
  "Venue",
  "Planning",
  "Photography",
  "Video",
  "Music",
  "Florals",
  "Cake & Catering",
  "Attire",
  "Hair & Makeup",
  "Paper",
  "Art & Keepsakes",
  "Logistics & Services",
] as const;

/**
 * Which vendor_role enum values satisfy each slot (for graph queries).
 *
 * D056 stage 2 (2026-09-10): beauty_other/jeweler/photobooth/musician were renamed
 * (beauty_services/jewelry/photo_booth/live_music) and ~30 new values were added — see
 * `VENDOR_ROLES` in `scripts/graph/vendorRoleRules.ts`. Each slot below is extended with
 * the new slugs of the same category.
 *
 * D056 stage 3 (2026-09-10): three of the taxonomy's 12 categories (`paper`,
 * `art_keepsakes`, `logistics_services` — see `ROLE_CATEGORIES` in `lib/roles.ts`) had no
 * slot at all, so their roles (stationery, officiant, transportation, …) were unreachable
 * from `/vendors` filtering. Added as their own slots below, named after the category
 * label. `photo_video` and `florals_decor`/`food_drink` stay split across the pre-existing
 * UI groupings (Photography/Video, Florals/Cake & Catering) rather than being collapsed to
 * match category boundaries 1:1 — that's a deliberate, pre-D056 UI choice, not a gap.
 */
export const SLOT_ROLES: Record<string, string[]> = {
  Venue: ["venue", "venue_management", "accommodations", "hotel"],
  Photography: ["photographer", "second_shooter", "drone", "album_editing"],
  Video: ["videographer", "content_creator", "photo_booth"],
  Planning: ["planner", "coordinator", "event_design"],
  Florals: ["florist", "lighting_production", "rentals", "tent", "signage", "decor_other"],
  Music: ["dj", "band", "live_music", "mc", "cultural_performers", "dancers_choreography", "entertainment_other"],
  Attire: ["attire", "jewelry", "accessories", "alterations"],
  "Hair & Makeup": ["hair", "makeup", "beauty_services"],
  "Cake & Catering": ["cake", "catering", "bar_service", "desserts"],
  // Pulled straight from ROLE_CATEGORIES (lib/roles.ts) -- these three slots ARE their
  // category, 1:1, so there's no separate literal to keep in sync by hand.
  Paper: categoryRoles("paper") ?? [],
  "Art & Keepsakes": categoryRoles("art_keepsakes") ?? [],
  "Logistics & Services": categoryRoles("logistics_services") ?? [],
};

/** Slot a dewwey vendor_role naturally belongs to (for one-tap adds). */
export function slotForRole(role: string | null | undefined): string {
  for (const [slot, roles] of Object.entries(SLOT_ROLES)) {
    if (role && roles.includes(role)) return slot;
  }
  return "Other";
}

export const TEAM_STORAGE_KEY = "dewwey-team-v1";

export function emptyTeam(): TeamState {
  return { slots: [...DEFAULT_SLOTS], entries: [] };
}
