import {
  Buildings,
  Camera,
  VideoCamera,
  ClipboardText,
  Flower,
  MusicNotes,
  Dress,
  HairDryer,
  Cake,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { DEFAULT_SLOTS } from "./team";

export type Slot = (typeof DEFAULT_SLOTS)[number];

export const SLOT_ICONS: Record<Slot, Icon> = {
  Venue: Buildings,
  Photography: Camera,
  Video: VideoCamera,
  Planning: ClipboardText,
  Florals: Flower,
  Music: MusicNotes,
  Attire: Dress,
  "Hair & Makeup": HairDryer,
  "Cake & Catering": Cake,
};

export interface VendorsQuery {
  slot?: string | null;
  roles?: string[] | null;
  q?: string | null;
  min?: number;
  team?: number[];
  view?: "grid" | "list";
  page?: number | null;
}

export function vendorsSearchParams(s: VendorsQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (s.slot) p.set("slot", s.slot);
  if (s.roles?.length) p.set("role", s.roles.join(","));
  if (s.q) p.set("q", s.q);
  if (s.min && s.min > 1) p.set("min", String(s.min));
  if (s.team && s.team.length > 0) p.set("team", s.team.join(","));
  if (s.view === "list") p.set("view", "list");
  if (s.page && s.page > 1) p.set("page", String(s.page));
  return p;
}

export function vendorsHref(s: VendorsQuery): string {
  const p = vendorsSearchParams(s);
  return `/vendors${p.size ? `?${p}` : ""}`;
}

export function slotHref(slot: string): string {
  return vendorsHref({ slot });
}

export function weddingCountLabel(n: number): string {
  return `${n.toLocaleString()} documented wedding${n === 1 ? "" : "s"}`;
}

export function showHandle(name: string, username: string): boolean {
  return name.toLowerCase() !== username.toLowerCase();
}
