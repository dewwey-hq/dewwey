/** Shared between the server route (`page.tsx`) and the client toggle bar (`FeedLab.tsx`) —
 * plain data, no "use client"/"use server" boundary issue either way. */
export const VARIANTS = ["a", "b", "c", "d"] as const;
export type Variant = (typeof VARIANTS)[number];

export function isVariant(v: string | null | undefined): v is Variant {
  return !!v && (VARIANTS as readonly string[]).includes(v);
}
