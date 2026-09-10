/**
 * Pure escalation-decision helpers for runExtract.ts's Haiku -> Sonnet escalation path (D055
 * Phase 2 addendum). No DB, no network -- kept in its own importable module (not
 * extractPrompt.ts, which is the coordinator-owned prompt/schema file) so it's independently
 * unit-testable, same "pure logic separate from the DB-wired script" split as extractPrompt.ts
 * itself.
 *
 * Policy: a post whose first-pass result is UNSURE, or whose confidence falls inside the
 * configured band (inclusive both ends), gets a second look from a stronger model with the
 * SAME prompt/tool. See runExtract.ts's worker loop for how the two results are combined and
 * stored.
 */
import type { ExtractResult } from "./extractPrompt";

export interface EscalateBand {
  lo: number;
  hi: number;
}

const BAND_RE = /^(\d*\.?\d+)-(\d*\.?\d+)$/;

/**
 * Parses a `--escalate-band` CLI value like "0.5-0.8" into {lo, hi}. Returns null for
 * undefined/empty input, meaning escalation is disabled. Throws on a malformed or out-of-range
 * spec so a typo fails loudly at startup rather than silently disabling escalation or
 * escalating everything.
 */
export function parseEscalateBand(spec: string | undefined): EscalateBand | null {
  if (!spec || !spec.trim()) return null;
  const m = spec.trim().match(BAND_RE);
  if (!m) {
    throw new Error(`--escalate-band must look like "0.5-0.8" (got "${spec}")`);
  }
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (!(lo >= 0 && lo <= 1) || !(hi >= 0 && hi <= 1)) {
    throw new Error(`--escalate-band values must be within [0,1] (got "${spec}")`);
  }
  if (lo > hi) {
    throw new Error(`--escalate-band lo must be <= hi (got "${spec}")`);
  }
  return { lo, hi };
}

/**
 * Whether a first-pass result should be escalated to the stronger model: UNSURE always
 * escalates (the model explicitly couldn't decide, regardless of the confidence it still
 * reported), or a decided verdict whose confidence falls inside the band (inclusive both
 * ends). Returns false when band is null (escalation disabled) -- callers don't need to
 * separately check whether escalation is turned on.
 */
export function shouldEscalate(
  result: Pick<ExtractResult, "verdict" | "confidence">,
  band: EscalateBand | null
): boolean {
  if (!band) return false;
  if (result.verdict === "UNSURE") return true;
  return result.confidence >= band.lo && result.confidence <= band.hi;
}
