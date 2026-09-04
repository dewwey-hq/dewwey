/**
 * Pure helper functions for Jeremy wedding-candidate clustering, split out
 * of runJeremyWeddingClustering.ts so they're importable (e.g. from tests)
 * without triggering that script's top-level main() execution.
 */

export interface EffectiveDateInput {
  posted_at: string | null;
  event_date: string | null;
  event_date_confidence: number | null;
}

/** Only trusts unambiguous, fully-specified dates — ISO (YYYY-MM-DD) or
 * numeric MM/DD/YYYY-shaped (any of . / - as separator, 2 or 4 digit year).
 * Anything else (year-only, relative text, ranges) falls through to null,
 * deliberately conservative rather than guessing. */
export function parseEventDate(raw: string | null, confidence: number | null): Date | null {
  if (!raw || confidence == null || confidence < 0.8) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return isNaN(d.getTime()) ? null : d;
  }
  const numeric = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numeric) {
    const mm = Number(numeric[1]);
    const dd = Number(numeric[2]);
    let yyyy = Number(numeric[3]);
    if (yyyy < 100) yyyy += 2000;
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    return isNaN(d.getTime()) || mm < 1 || mm > 12 || dd < 1 || dd > 31 ? null : d;
  }
  return null;
}

export function effectiveDate(p: EffectiveDateInput): Date | null {
  const fromEvent = parseEventDate(p.event_date, p.event_date_confidence);
  if (fromEvent) return fromEvent;
  return p.posted_at ? new Date(p.posted_at) : null;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
