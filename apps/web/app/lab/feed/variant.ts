/** Shared between the server route (`page.tsx`) and the client toggle bar (`FeedLab.tsx`) —
 * plain data, no "use client"/"use server" boundary issue either way.
 *
 * D058 compliance pass (2026-09-11): Story and Season magazine are dropped — the two
 * compliant, photo-first designs remain (A2 Clean list, B2 Grid). Added back the same
 * day per user feedback ("labeled Role · Name rows are the discovery tool, hover is
 * slow"): C · Card, today's `WeddingFeedCard` shape made compliant and sharpened.
 * D · Recipe (same day, spec brought in from outside): a structured wedding record —
 * venue as "Hosted at", vendors grouped by category, no couple names or captions.
 * E · Ledger (same day): no outer card at all — the embed alone beside a plain bordered
 * "stack card" whose content is one line per vendor category, comma-separated names.
 *
 * Fresh direction (user, 2026-09-11: none of C/D/E is right yet — all four failures apply:
 * space per wedding, stack reads as data, photo doesn't own the screen, embed-beside-text
 * structure itself). Four scrappy concepts over 12 weddings each:
 * F · Roster — vertical card at embed width, tile grid of vendors under the embed, 2-3 across.
 * G · Scroll — pure column of embeds; the in-view wedding drives ONE sticky team panel.
 * H · Chip grid — 3-across masonry, category chips with counts under each embed.
 * I · Photo wall — 3-4 across wall of 326px embeds; tap a wedding → full team sheet. */
export const VARIANTS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"] as const;
export type Variant = (typeof VARIANTS)[number];

export function isVariant(v: string | null | undefined): v is Variant {
  return !!v && (VARIANTS as readonly string[]).includes(v);
}

/**
 * `size`/`layout` (user, 2026-09-11: "the cards and recipes are too large... make them
 * smaller"): URL-backed controls for variants C, D, and E only — A/B ignore them (never
 * passed down). Instagram's only hard rule is a 326px minimum embed width; 360 is the
 * smallest step above that, 470 the old default ceiling, 540 Meta's maximum (user, 2026-09-11:
 * "showing more of the image than the text" — the image should be the wider half).
 */
export const EMBED_SIZES = [360, 400, 470, 540] as const;
export type EmbedSize = (typeof EMBED_SIZES)[number];
export const DEFAULT_EMBED_SIZE: EmbedSize = 540;

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

/** Fresh-direction variants (F-I) are scrappy: 12 weddings by default so the page stays
 * quick to judge; the earlier variants keep 60 (see `page.tsx`). `?n=` overrides both. */
export const FRESH_VARIANTS: readonly Variant[] = ["f", "g", "h", "i"];
export const DEFAULT_LIMIT_FRESH = 12;
export const DEFAULT_LIMIT_CLASSIC = 60;
export function parseLimit(v: string | null | undefined, variant: Variant): number {
  const n = Number(v);
  if (Number.isInteger(n) && n >= 1 && n <= 200) return n;
  return FRESH_VARIANTS.includes(variant) ? DEFAULT_LIMIT_FRESH : DEFAULT_LIMIT_CLASSIC;
}

/** Variant C tuning knobs (user, 2026-09-11: "play around with the ui dynamically like column
 * 1 column 2 and like % e.g. 50% embed vs. 70% embed"). `split` = the embed's share of the
 * card width; the stack column is derived (embed * (100-split)/split) because the embed
 * itself can't exceed Meta's 540px. `tiles` = vendor tile columns in the stack panel. */
export const SPLITS = [50, 55, 60, 65, 70] as const;
export type Split = (typeof SPLITS)[number];
export const DEFAULT_SPLIT: Split = 60;
export function parseSplit(v: string | null | undefined): Split {
  const n = Number(v);
  return (SPLITS as readonly number[]).includes(n) ? (n as Split) : DEFAULT_SPLIT;
}
export const TILE_COLS = [1, 2] as const;
export type TileCols = (typeof TILE_COLS)[number];
export const DEFAULT_TILE_COLS: TileCols = 1;
export function parseTileCols(v: string | null | undefined): TileCols {
  return v === "2" ? 2 : DEFAULT_TILE_COLS;
}

/** Which side the embed sits on in variant C (user, 2026-09-11: "curious if i flip the hosted
 * at the arbory part to the left side and the instagram post to the right"). */
export const SIDES = ["left", "right"] as const;
export type Side = (typeof SIDES)[number];
export const DEFAULT_SIDE: Side = "left";
export function parseSide(v: string | null | undefined): Side {
  return v === "right" ? "right" : DEFAULT_SIDE;
}
