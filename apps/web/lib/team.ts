/**
 * "Your team" — the couple's wedding, as a set of slots to fill.
 * v1 lives in localStorage; the shape is designed to sync to Supabase later.
 */

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
] as const;

/**
 * Which vendor_role enum values satisfy each slot (for graph queries).
 *
 * D056 stage 2 (2026-09-10): beauty_other/jeweler/photobooth/musician were renamed
 * (beauty_services/jewelry/photo_booth/live_music) and ~30 new values were added — see
 * `VENDOR_ROLES` in `scripts/graph/vendorRoleRules.ts`. Each slot below is extended with
 * the new slugs of the same category.
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
