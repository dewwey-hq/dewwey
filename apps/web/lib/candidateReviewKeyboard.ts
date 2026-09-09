// Keyboard map for /label/candidates -- separate from lib/labelKeyboard.ts (the post-level
// /label queue) because the action set is genuinely different (venue/duplicate corrections need
// an inline input, not just a keypress) and "B" means something different on each page (Back
// here vs. Broken/can't-view on /label) -- reusing one shared map would make one of the two
// pages wrong.
export type CandidateReviewAction =
  | "CONFIRM"
  | "WRONG_VENUE"
  | "NOT_WEDDING"
  | "DUPLICATE"
  | "UNSURE"
  | "SKIP"
  | "BACK"
  | "FOCUS_NOTES";

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

const KEY_MAP: Record<string, CandidateReviewAction> = {
  c: "CONFIRM",
  v: "WRONG_VENUE",
  n: "NOT_WEDDING",
  d: "DUPLICATE",
  u: "UNSURE",
  " ": "SKIP",
  b: "BACK",
};

/**
 * Maps a keydown event to a candidate-review action, or null. Same modifier-refusal rule as
 * lib/labelKeyboard.ts (Cmd/Ctrl/Alt+letter is a browser shortcut, never ours) -- except Shift,
 * which is deliberately used here for Shift+N ("focus the notes textarea"), a plain-letter
 * shortcut the post-level /label page doesn't have.
 */
export function matchCandidateReviewKey(e: KeyLike): CandidateReviewAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.shiftKey) {
    return e.key.toLowerCase() === "n" ? "FOCUS_NOTES" : null;
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return KEY_MAP[key] ?? null;
}
