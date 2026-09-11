/** Shared between the server route (`page.tsx`) and the client toggle bar (`FeedLab.tsx`) —
 * plain data, no "use client"/"use server" boundary issue either way.
 *
 * D058 compliance pass (2026-09-11): Story and Season magazine are dropped — the two
 * compliant, photo-first designs remain (A2 Clean list, B2 Grid). Added back the same
 * day per user feedback ("labeled Role · Name rows are the discovery tool, hover is
 * slow"): C · Card, today's `WeddingFeedCard` shape made compliant and sharpened. */
export const VARIANTS = ["a", "b", "c"] as const;
export type Variant = (typeof VARIANTS)[number];

export function isVariant(v: string | null | undefined): v is Variant {
  return !!v && (VARIANTS as readonly string[]).includes(v);
}
