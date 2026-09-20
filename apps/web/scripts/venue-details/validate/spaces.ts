/**
 * Structural sanity for the assembled `spaces[]`/`capacities[]` arrays (post-grounding): fake
 * generic-label spaces, fuzzy-duplicate names, lodging-room names, capacity range sanity, and
 * the "never sum rooms" check. Pure -- operates on `lib/venueDetails/types.ts` shapes directly
 * (grounding has already resolved `source_url`/`snapshot_id` and dropped ungrounded rows by the
 * time this runs, in `assemble.ts`'s pipeline).
 */
import type { CapacityTuple, Space } from "../../../lib/venueDetails/types";
import type { Issue } from "../contract";

/** `/wedding venues|event space|meeting rooms/i`-shaped fake spaces (the rubric's must-not #1). */
export const GENERIC_SPACE_NAME_RE = /^(the )?(our )?(wedding|event|meeting|private|special)s? ?(venues?|spaces?|rooms?|rentals?)$|^(venues?|spaces?|rooms?)$/i;

/** A lodging-room name, UNLESS "ballroom" is also in it (a hotel's "King Ballroom Suite" is a
 * real event space, not a guest room). */
const LODGING_TERMS_RE = /suite|guest room|king|queen/i;

export function isLodgingRoomName(name: string): boolean {
  return LODGING_TERMS_RE.test(name) && !/ballroom/i.test(name);
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

/** Standard Levenshtein edit distance (DP). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Normalized Levenshtein <= 2, or one name contains the other (both >= 4 chars, to avoid a
 * short generic word like "bar" matching everything). */
export function isFuzzyDuplicateName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return levenshtein(na, nb) <= 2;
}

export interface SpaceSanitizeResult {
  spaces: Space[];
  capacities: CapacityTuple[];
  issues: Issue[];
}

const MAX_REASONABLE_CAPACITY = 5000;
const REVIEW_CAPACITY_THRESHOLD = 1000;

/** Generic-label + lodging-room spaces dropped, fuzzy duplicates merged (first survives, later
 * ones' capacity tuples reassigned to the survivor -- both tuples are kept), unknown
 * `capacities[].space_id` reassigned to `whole_venue`, `min > max` swapped, capacity <= 0 or
 * > 5000 dropped, > 1000 kept but flagged (`capacity_gt_1000`, caller turns this into
 * `needs_review`), and a `whole_venue` tuple that exactly equals the sum of same-layout room
 * tuples dropped (`summed_rooms`) so "never sum rooms" survives the LLM's own arithmetic too. */
export function sanitizeSpacesAndCapacities(rawSpaces: Space[], rawCapacities: CapacityTuple[]): SpaceSanitizeResult {
  const issues: Issue[] = [];

  let spaces = rawSpaces.filter((s) => {
    if (GENERIC_SPACE_NAME_RE.test(s.name.trim())) {
      issues.push({ code: "generic_space_name", path: `/spaces/${s.id}`, severity: "warning", tier: null, message: `Dropped generic space name "${s.name}"` });
      return false;
    }
    return true;
  });

  spaces = spaces.filter((s) => {
    if (isLodgingRoomName(s.name)) {
      issues.push({ code: "lodging_room_dropped", path: `/spaces/${s.id}`, severity: "warning", tier: null, message: `Dropped lodging-room space "${s.name}"` });
      return false;
    }
    return true;
  });

  const idRedirect = new Map<string, string>();
  const survivors: Space[] = [];
  for (const s of spaces) {
    const dupOf = survivors.find((kept) => isFuzzyDuplicateName(kept.name, s.name));
    if (dupOf) {
      idRedirect.set(s.id, dupOf.id);
      issues.push({ code: "duplicate_space_merged", path: `/spaces/${s.id}`, severity: "warning", tier: null, message: `Merged duplicate space "${s.name}" into "${dupOf.name}"` });
    } else {
      survivors.push(s);
    }
  }
  spaces = survivors;
  const survivingIds = new Set(spaces.map((s) => s.id));

  const redirected: CapacityTuple[] = [];
  for (const c of rawCapacities) {
    let spaceId = c.space_id;
    if (spaceId !== "whole_venue") {
      if (idRedirect.has(spaceId)) spaceId = idRedirect.get(spaceId)!;
      if (!survivingIds.has(spaceId)) {
        issues.push({ code: "unknown_space_id", path: `/capacities/${c.space_id}:${c.layout}`, severity: "warning", tier: null, message: `Unknown space_id "${c.space_id}" -- reassigned to whole_venue` });
        spaceId = "whole_venue";
      }
    }

    let min = c.min;
    let max = c.max;
    if (min != null && max != null && min > max) {
      [min, max] = [max, min];
      issues.push({ code: "capacity_min_max_swapped", path: `/capacities/${spaceId}:${c.layout}`, severity: "warning", tier: null, message: "min > max -- swapped" });
    }

    if (max <= 0 || max > MAX_REASONABLE_CAPACITY) {
      issues.push({
        code: max <= 0 ? "capacity_non_positive" : "capacity_gt_5000",
        path: `/capacities/${spaceId}:${c.layout}`,
        severity: "warning",
        tier: null,
        message: `Dropped implausible capacity ${max}`,
      });
      continue;
    }

    if (max > REVIEW_CAPACITY_THRESHOLD) {
      // A whole-venue or single-space figure over 1000 smells like a summed/combined total and goes
      // to review; a NAMED room in a multi-space venue (Field Museum's Stanley Field Hall seats 1,500,
      // quoted on its own page) is plausible and only noted (tick c3, 2026-09-20).
      const plausibleNamedRoom = spaceId !== "whole_venue" && spaces.length > 1;
      issues.push({ code: plausibleNamedRoom ? "capacity_gt_1000_named_room" : "capacity_gt_1000", path: `/capacities/${spaceId}:${c.layout}`, severity: "warning", tier: null, message: `Capacity ${max} exceeds 1000 -- kept${plausibleNamedRoom ? " (named room in a multi-space venue, not sent to review)" : ", flagged for review"}.` });
    }

    redirected.push({ ...c, space_id: spaceId, min, max });
  }

  const byLayout = new Map<string, CapacityTuple[]>();
  for (const c of redirected) {
    const list = byLayout.get(c.layout) ?? [];
    list.push(c);
    byLayout.set(c.layout, list);
  }

  const capacities: CapacityTuple[] = [];
  for (const list of byLayout.values()) {
    const layout = list[0].layout;
    const wholeVenueRows = list.filter((c) => c.space_id === "whole_venue");
    const roomRows = list.filter((c) => c.space_id !== "whole_venue");
    const roomSum = roomRows.reduce((sum, c) => sum + c.max, 0);
    for (const c of wholeVenueRows) {
      if (roomRows.length >= 2 && c.max === roomSum) {
        issues.push({
          code: "summed_rooms",
          path: `/capacities/whole_venue:${layout}`,
          severity: "warning",
          tier: null,
          message: `whole_venue ${layout} capacity (${c.max}) equals the sum of ${roomRows.length} room tuples -- dropped`,
        });
        continue;
      }
      capacities.push(c);
    }
    capacities.push(...roomRows);
  }

  return { spaces, capacities, issues };
}
