/**
 * Layout knobs for the production wedding feed card (`WeddingCard.tsx`), locked to the
 * D058 design (360px embed / 60% split / 1 tile column / embed left / 1-up). Declared
 * here — not in the lab's `app/lab/feed/variant.ts` — so production never depends on lab
 * code; the lab re-exports these instead of duplicating them.
 */

/** Instagram's oEmbed `maxwidth` floor is 326px; 540 is Meta's ceiling. */
export const EMBED_SIZES = [326, 360, 400, 470, 540] as const;
export type EmbedSize = (typeof EMBED_SIZES)[number];
export const DEFAULT_EMBED_SIZE: EmbedSize = 360;

/** The embed's share of the card's width; the stack panel's width is derived from it
 * (`panelWidthFor` in `WeddingCard.tsx`). */
export const SPLITS = [50, 55, 60, 65, 70] as const;
export type Split = (typeof SPLITS)[number];
export const DEFAULT_SPLIT: Split = 60;

/** Vendor tile columns in the stack panel. */
export const TILE_COLS = [1, 2] as const;
export type TileCols = (typeof TILE_COLS)[number];
export const DEFAULT_TILE_COLS: TileCols = 1;

/** Which side the embed sits on. */
export const SIDES = ["left", "right"] as const;
export type Side = (typeof SIDES)[number];
export const DEFAULT_SIDE: Side = "left";

/** Stack two cards per row (only meaningful in the lab today). */
export const DEFAULT_TWO_UP = false;
