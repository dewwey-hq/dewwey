/** Shared between the server route (`page.tsx`) and the client toggle bar (`FeedLab.tsx`) —
 * plain data, no "use client"/"use server" boundary issue either way.
 *
 * D058 compliance pass (2026-09-11): Story (C) and Season magazine (D) are dropped —
 * only the two compliant, photo-first designs remain (A2 Clean list, B2 Grid). */
export const VARIANTS = ["a", "b"] as const;
export type Variant = (typeof VARIANTS)[number];

export function isVariant(v: string | null | undefined): v is Variant {
  return !!v && (VARIANTS as readonly string[]).includes(v);
}
