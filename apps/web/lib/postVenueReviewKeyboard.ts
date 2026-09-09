// Keyboard map for /label/candidates' post-per-screen review (D055) -- separate from
// lib/labelKeyboard.ts (the plain /label queue) because two actions (OTHER_VENUE, DUPLICATE)
// need an inline input rather than a bare keypress, same reasoning the old
// lib/candidateReviewKeyboard.ts (now removed) had. Letters chosen to match the rubric: W = this
// venue, N = not a wedding, V = a different (real) venue, D = duplicate, U = unsure, Space = skip,
// B = back/undo.
//
// D055 addendum (2026-09-08): "/" (NOTE_TOGGLE) opens/closes an optional note box for whatever
// verdict gets submitted next -- see PostVenueReviewClient's own comment for the full flow. NOT_
// WEDDING itself no longer submits directly on "n" -- the component intercepts it to show an
// inline reason-chip UI first (S/M/E/O + free text, handled entirely inside that component, not
// here, since those keys are only meaningful while its note textbox has focus).
//
// D055 addendum #2 (2026-09-08, "clear a whole group in one keystroke"): Shift+W / Shift+X apply
// THIS_VENUE / NOT_WEDDING to every not-yet-reviewed sibling post in the current post's group
// (only meaningful once candidates are merged so a group is more than one post -- the component
// no-ops these when group.size is 1). Deliberately NOT Shift+N: shiftKey was never inspected
// here before this addendum, so plain KEY_MAP lookup already fires on Shift+N exactly like N
// (opens the NOT_WEDDING reason-chip UI for the single current post) -- repurposing it would
// silently change existing behavior. X was free, so the not-wedding group action lives there
// instead.
export type PostVenueReviewAction =
  | "THIS_VENUE"
  | "NOT_WEDDING"
  | "OTHER_VENUE"
  | "DUPLICATE"
  | "UNSURE"
  | "SKIP"
  | "BACK"
  | "NOTE_TOGGLE"
  | "GROUP_THIS_VENUE"
  | "GROUP_NOT_WEDDING";

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const KEY_MAP: Record<string, PostVenueReviewAction> = {
  w: "THIS_VENUE",
  n: "NOT_WEDDING",
  v: "OTHER_VENUE",
  d: "DUPLICATE",
  u: "UNSURE",
  " ": "SKIP",
  b: "BACK",
  "/": "NOTE_TOGGLE",
};

// Checked before KEY_MAP, and only when e.shiftKey is true -- see the addendum #2 comment above.
const SHIFT_KEY_MAP: Record<string, PostVenueReviewAction> = {
  w: "GROUP_THIS_VENUE",
  x: "GROUP_NOT_WEDDING",
};

/**
 * Maps a keydown event to a post-venue-review action, or null. Same modifier-refusal rule as
 * lib/labelKeyboard.ts (Cmd/Ctrl/Alt+letter is a browser shortcut, never ours).
 */
export function matchPostVenueReviewKey(e: KeyLike): PostVenueReviewAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.shiftKey && SHIFT_KEY_MAP[key]) return SHIFT_KEY_MAP[key];
  return KEY_MAP[key] ?? null;
}
