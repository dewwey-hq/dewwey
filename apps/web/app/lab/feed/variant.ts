/** Shared between the server route (`page.tsx`) and the client toggle bar (`FeedLab.tsx`) —
 * plain data, no "use client"/"use server" boundary issue either way.
 *
 * D058 compliance pass (2026-09-11): Story and Season magazine are dropped — the two
 * compliant, photo-first designs remain (A2 Clean list, B2 Grid). Added back the same
 * day per user feedback ("labeled Role · Name rows are the discovery tool, hover is
 * slow"): C · Card, today's `WeddingFeedCard` shape made compliant and sharpened.
 * D · Recipe (same day, spec brought in from outside): a structured wedding record —
 * venue as "Hosted at", vendors grouped by category, no couple names or captions. */
export const VARIANTS = ["a", "b", "c", "d"] as const;
export type Variant = (typeof VARIANTS)[number];

export function isVariant(v: string | null | undefined): v is Variant {
  return !!v && (VARIANTS as readonly string[]).includes(v);
}

/**
 * `size`/`layout` (user, 2026-09-11: "the cards and recipes are too large... make them
 * smaller"): URL-backed controls for variants C and D only — A/B ignore them (never
 * passed down). Instagram's only hard rule is a 326px minimum embed width; 360 is the
 * smallest step above that, 470 the old default ceiling.
 */
export const EMBED_SIZES = [360, 400, 470] as const;
export type EmbedSize = (typeof EMBED_SIZES)[number];
export const DEFAULT_EMBED_SIZE: EmbedSize = 400;

export function parseEmbedSize(v: string | null | undefined): EmbedSize {
  const n = Number(v);
  return (EMBED_SIZES as readonly number[]).includes(n) ? (n as EmbedSize) : DEFAULT_EMBED_SIZE;
}

export const LAYOUTS = ["1-up", "2-up"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const DEFAULT_LAYOUT: Layout = "1-up";

export function parseLayout(v: string | null | undefined): Layout {
  return v === "2-up" ? "2-up" : DEFAULT_LAYOUT;
}
