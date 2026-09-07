export type LabelAction = "WEDDING" | "NOT_WEDDING" | "UNSURE" | "SKIP" | "UNVIEWABLE" | "UNDO";

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

const KEY_MAP: Record<string, LabelAction> = {
  w: "WEDDING",
  n: "NOT_WEDDING",
  u: "UNSURE",
  " ": "SKIP",
  b: "UNVIEWABLE",
  z: "UNDO",
};

/**
 * Maps a keydown event to a labeling action, or null if it doesn't match
 * any shortcut. Deliberately refuses to match ANY letter shortcut when a
 * modifier key is held: Cmd+W / Ctrl+W closes the current browser tab, and
 * a naive handler matching "w" on its own would ALSO fire a WEDDING
 * submission an instant before the tab closes.
 */
export function matchKeyToAction(e: KeyLike): LabelAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return KEY_MAP[key] ?? null;
}
