/**
 * Pure helpers for the D058 feed design lab (`app/lab/feed`). No React, no DB — every
 * function here takes plain data (shaped like `WeddingStack`/`StackVendor` from
 * `lib/server/graph.ts`, but declared locally so this stays dependency-free and testable
 * without a Next.js runtime) and returns plain data. See the plan section "Feed design
 * lab — D058 candidate" for the design principles this encodes.
 */

import { ROLE_CATEGORIES, roleCategory } from "./roles";

// ---- Display name from handle (46% of vendor credits have no real `full_name`) --------

/** Strips `.`/`_` and lowercases, for comparing a `full_name` against its own handle —
 * mirrors `showHandle` in `lib/slots.ts` but also ignores the punctuation IG handles
 * commonly use as word separators, so "Bea Quach Designs" still counts as "the same as"
 * `bea.quach.designs`. Hyphens are deliberately NOT stripped here (spec: "ignoring
 * dots/underscores") even though `deriveFromHandle` below does split on them too. */
function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[._]/g, "");
}

/** True when `name` is real (non-empty and not just the handle spelled out with spaces
 * instead of punctuation) — i.e. `displayName` can use it verbatim. */
function hasUsableName(name: string | null | undefined, username: string): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  return normalizeForCompare(trimmed) !== normalizeForCompare(username);
}

/** "DJ" stays "DJ" (an already-uppercase short token — handles are almost always
 * lowercase, so this only fires for the rare handle that isn't), everything else is
 * plain Title Case. */
function titleCaseToken(token: string): string {
  if (token.length <= 3 && token === token.toUpperCase() && /[A-Z]/.test(token)) {
    return token;
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Splits one `.`/`_`/`-`-delimited segment of a handle into word tokens, treating digit
 * runs as noise rather than words: a digit run only becomes a separator (dropped, the
 * letters on each side becoming their own tokens) when there's a real word — 2+ letters —
 * on BOTH sides ("hairs2thebride" -> "hairs", "thebride"). A digit run touching only a
 * single letter on one side stays merged into that word instead of being torn out
 * ("f4dweddings" -> one token "f4dweddings", so a rogue "F" never appears alone). A digit
 * run with no letters on one side at all (handle-generation cruft like a trailing
 * "_marmoura14") is just dropped, not kept and not split into its own token.
 */
function splitSegmentIntoTokens(segment: string): string[] {
  const runs = segment.match(/[A-Za-z]+|[0-9]+/g) ?? [];
  const tokens: string[] = [];
  let current = "";
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (!/^[0-9]+$/.test(run)) {
      current += run;
      continue;
    }
    const prevLen = i > 0 ? runs[i - 1].length : 0;
    const nextLen = i < runs.length - 1 ? runs[i + 1].length : 0;
    const hasBothSides = i > 0 && i < runs.length - 1;
    if (hasBothSides && prevLen >= 2 && nextLen >= 2) {
      if (current) tokens.push(current);
      current = "";
      // digit run dropped as a separator
    } else if (hasBothSides) {
      current += run; // single-letter side -- keep merged, e.g. "f4dweddings"
    }
    // else: digit run touches a segment boundary -- dropped entirely
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Derives a readable name from a handle with no usable `full_name`: split on `.`/`_`/`-`
 * and (selectively — see `splitSegmentIntoTokens`) digit runs, title-case each token, join
 * with spaces. */
function deriveFromHandle(username: string): string {
  const segments = username.split(/[._-]/).filter((s) => s.length > 0);
  const tokens = segments.flatMap(splitSegmentIntoTokens);
  return tokens.map(titleCaseToken).join(" ");
}

/**
 * The name to show for a vendor credit. Uses `name` (`accounts.full_name`) verbatim when
 * it's real; 46% of live credits have a null/empty/handle-equal `full_name`, so this falls
 * back to deriving a readable name from the IG handle itself (`bea.quach.designs` ->
 * "Bea Quach Designs"). Pair with `isDerivedName` to decide whether to also show the raw
 * `@handle` as a subtitle (redundant once the "name" IS the handle, spelled out).
 */
export function displayName(name: string | null | undefined, username: string): string {
  const trimmed = (name ?? "").trim();
  if (hasUsableName(name, username)) return trimmed;
  return deriveFromHandle(username);
}

/** True when `displayName` had to derive its result from the handle rather than using a
 * real `full_name` — UIs use this to decide whether showing "@handle" alongside the name
 * would be redundant. */
export function isDerivedName(name: string | null | undefined, username: string): boolean {
  return !hasUsableName(name, username);
}

// ---- Cover selection (design principle 2: "a rule, not chance") -----------------------

export interface CoverPostCandidate {
  url: string;
  ok: boolean;
  postedAt: string | null;
  postType: string | null;
}

/** Image > Sidecar > Video > unknown (post_type null — not in staging.instagram_posts). */
const POST_TYPE_RANK: Record<string, number> = {
  Image: 0,
  Sidecar: 1,
  Video: 2,
};

function postTypeRank(postType: string | null): number {
  if (!postType) return 3;
  return POST_TYPE_RANK[postType] ?? 3;
}

function postedAtMs(postedAt: string | null): number {
  if (!postedAt) return -Infinity;
  const t = new Date(postedAt).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * The one photo that stands for the wedding. Prefers an embeddable (owner not
 * embeds-disabled) post, then Image over Sidecar over Video over unknown type, then the
 * most recent. Returns null when nothing is embeddable — the caller falls back to
 * `FallbackCard`.
 */
export function coverPost<T extends CoverPostCandidate>(postInfos: T[]): T | null {
  const embeddable = postInfos.filter((p) => p.ok && p.url);
  if (embeddable.length === 0) return null;
  return [...embeddable].sort((a, b) => {
    const rankDiff = postTypeRank(a.postType) - postTypeRank(b.postType);
    if (rankDiff !== 0) return rankDiff;
    return postedAtMs(b.postedAt) - postedAtMs(a.postedAt);
  })[0];
}

/**
 * What to hand `EmbedFrame` for the cover slot: `coverPost()` when there's an embeddable
 * post, else the first post at all so a blocked-owner wedding still renders
 * `FallbackCard` with the real owner/caption ("this account doesn't allow embeds") rather
 * than the generic "no post at all" copy — `coverPost()` itself stays a clean "is there
 * anything embeddable" signal (used for the lab's "blocked owner" data-notes count).
 */
export function coverOrFirstPost<T extends CoverPostCandidate>(postInfos: T[]): T | null {
  return coverPost(postInfos) ?? postInfos[0] ?? null;
}

// ---- Title from caption (design principle 3) -------------------------------------------

/**
 * Words that disqualify a captured "name" — vendor-category and generic vocabulary that
 * shows up in the same `X & Y` / `X and Y` shape as a couple's names ("Venue & Catering",
 * "hair & makeup", "black and white") but isn't one. Checked case-insensitively.
 */
const NAME_BLOCKLIST = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "venue",
  "venues",
  "catering",
  "caterer",
  "caterers",
  "hair",
  "makeup",
  "beauty",
  "hmu",
  "florals",
  "floral",
  "flowers",
  "florist",
  "florists",
  "cake",
  "cakes",
  "desserts",
  "dessert",
  "sweets",
  "dj",
  "band",
  "music",
  "musicians",
  "entertainment",
  "lighting",
  "production",
  "rentals",
  "rental",
  "linens",
  "tent",
  "tenting",
  "decor",
  "decorations",
  "design",
  "styling",
  "stylist",
  "planning",
  "planner",
  "coordination",
  "coordinator",
  "photo",
  "photography",
  "photographer",
  "video",
  "videography",
  "videographer",
  "wedding",
  "weddings",
  "bride",
  "groom",
  "bridal",
  "groomsmen",
  "bridesmaids",
  "black",
  "white",
  "and",
  "the",
  "of",
  "for",
  "with",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "morning",
  "afternoon",
  "evening",
  "night",
  "cocktail",
  "cocktails",
  "bar",
  "drinks",
  "officiant",
  "transportation",
  "valet",
  "stationery",
  "calligraphy",
  "favors",
  "gifts",
  "security",
  "rings",
  "attire",
  "shoot",
  "styled",
  "editorial",
  "workshop",
  "model",
  "models",
  "hosts",
  "host",
  "part",
]);

function isNameWord(word: string | undefined | null): word is string {
  if (!word) return false;
  if (!/^[A-Za-z][A-Za-z'’-]*$/.test(word)) return false;
  if (word.length < 2) return false;
  return !NAME_BLOCKLIST.has(word.toLowerCase());
}

/** "EMILY" -> "Emily", "kelly" -> "Kelly", "Kevin"/"O'Brien" left as-is (already cased). */
function normalizeNameWord(word: string): string {
  if (word === word.toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  if (word === word.toLowerCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word;
}

function tryPair(regex: RegExp, text: string): string | null {
  const m = text.match(regex);
  if (!m) return null;
  const [, rawA, rawB] = m;
  if (!isNameWord(rawA) || !isNameWord(rawB)) return null;
  return `${normalizeNameWord(rawA)} & ${normalizeNameWord(rawB)}`;
}

const POSSESSIVE_WEDDING_RE =
  /\b([A-Za-z][A-Za-z'’-]*)\s*(?:and|&|\+)\s*([A-Za-z][A-Za-z'’-]*)'s\s+wedding\b/i;
const MR_MRS_RE = /\bMrs?\.?\s*(?:&|and)\s*Mrs\.?\s+([A-Za-z][A-Za-z'’-]*)\b/i;
const THE_SURNAME_WEDDING_RE = /\bthe\s+([A-Z][A-Za-z'’-]*)\s+wedding\b/;
const X_CONNECTOR_RE = /\b([A-Za-z][A-Za-z'’-]*)\s+x\s+([A-Za-z][A-Za-z'’-]*)\b/i;
const GENERIC_PAIR_RE = /\b([A-Za-z][A-Za-z'’-]*)\s*(?:\+|&|and)\s*([A-Za-z][A-Za-z'’-]*)\b/i;

/**
 * The couple's name from a caption, when the caption names one — pure regex, in priority
 * order (most specific first): "X and/&/+ Y's wedding", "Mr. & Mrs. Surname", "the Surname
 * wedding", "X x Y", "X + Y" / "X & Y" / "X and Y". Every pattern that captures a pair
 * rejects it if either word is vendor/category/day vocabulary (`NAME_BLOCKLIST`) — that's
 * what keeps "Venue & Catering", "hair & makeup", and "black and white" from firing.
 * Returns null (falls back to month/year via `seasonLabel`) when nothing matches.
 */
export function titleFromCaption(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const text = caption.trim();
  if (!text) return null;

  const possessive = tryPair(POSSESSIVE_WEDDING_RE, text);
  if (possessive) return possessive;

  const mrMrs = text.match(MR_MRS_RE);
  if (mrMrs && isNameWord(mrMrs[1])) {
    return `The ${normalizeNameWord(mrMrs[1])}`;
  }

  const theSurname = text.match(THE_SURNAME_WEDDING_RE);
  if (theSurname && isNameWord(theSurname[1])) {
    return `The ${normalizeNameWord(theSurname[1])}`;
  }

  const xConnector = tryPair(X_CONNECTOR_RE, text);
  if (xConnector) return xConnector;

  const generic = tryPair(GENERIC_PAIR_RE, text);
  if (generic) return generic;

  return null;
}

// ---- Season label -----------------------------------------------------------------------

const SEASON_BY_MONTH = [
  "Winter", // Jan
  "Winter", // Feb
  "Spring", // Mar
  "Spring", // Apr
  "Spring", // May
  "Summer", // Jun
  "Summer", // Jul
  "Summer", // Aug
  "Fall", // Sep
  "Fall", // Oct
  "Fall", // Nov
  "Winter", // Dec
];

/** "2026-07-15" -> "Summer 2026". Wedding dates are date-only — read as UTC (see
 * `formatEventDate`) so a local timezone can't push the month/year off by one. */
export function seasonLabel(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  return `${SEASON_BY_MONTH[month]} ${year}`;
}

// ---- Stack grouping / rail (design principle 4) ------------------------------------------

export interface StackVendorLike {
  accountId: number;
  username: string;
  name: string;
  role: string;
  avatar_url: string | null;
}

export interface StackCategoryGroup<V extends StackVendorLike = StackVendorLike> {
  slug: string;
  label: string;
  vendors: V[];
}

/**
 * Vendors bucketed by `ROLE_CATEGORIES`, in that list's order — venue is first in
 * `ROLE_CATEGORIES` itself, so ordering by category position alone puts venue-category
 * credits first. Categories with no vendors on this stack are omitted.
 *
 * One account can hold two roles on the same wedding (catering + bar service,
 * photography + videography) and would otherwise show up twice ("chicchefcatering,
 * chicchefcatering"). Deduped here by `username` (case-insensitive): only the FIRST
 * occurrence's role decides the vendor's category (so the highest-priority category
 * wins), and every role after the first is collected onto that single entry's
 * `extraRoles` instead of producing a second row.
 */
export function groupStackByCategory<V extends StackVendorLike>(
  vendors: V[],
): StackCategoryGroup<V & { extraRoles: string[] }>[] {
  type Deduped = V & { extraRoles: string[] };
  const indexByUsername = new Map<string, number>();
  const deduped: Deduped[] = [];
  for (const v of vendors) {
    const key = v.username.toLowerCase();
    const existingIdx = indexByUsername.get(key);
    if (existingIdx !== undefined) {
      deduped[existingIdx].extraRoles.push(v.role);
      continue;
    }
    indexByUsername.set(key, deduped.length);
    deduped.push({ ...v, extraRoles: [] });
  }

  const bySlug = new Map<string, Deduped[]>();
  for (const v of deduped) {
    const slug = roleCategory(v.role) ?? "other";
    const list = bySlug.get(slug);
    if (list) list.push(v);
    else bySlug.set(slug, [v]);
  }
  const groups: StackCategoryGroup<Deduped>[] = [];
  for (const cat of ROLE_CATEGORIES) {
    const list = bySlug.get(cat.slug);
    if (list && list.length > 0) groups.push({ slug: cat.slug, label: cat.label, vendors: list });
  }
  return groups;
}

export interface StackRailChip<V extends StackVendorLike = StackVendorLike> {
  vendor: V;
  isVenue: boolean;
}

export interface StackRailResult<V extends StackVendorLike = StackVendorLike> {
  chips: StackRailChip<V>[];
  overflowCount: number;
}

/**
 * The `StackRail`'s ordered chip list: the venue first (matched by username, case-
 * insensitive — `vendors` from `wedding_vendors` may or may not already include the venue
 * as a credited row), everyone else after, capped at `max` with the remainder counted as
 * `overflowCount` for the "+N" chip.
 */
export function stackRail<V extends StackVendorLike>(
  vendors: V[],
  venueUsername: string | null | undefined,
  max = 8,
): StackRailResult<V> {
  const venueKey = venueUsername?.toLowerCase();
  const venue = venueKey ? vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const rest = venue ? vendors.filter((v) => v !== venue) : vendors;
  const ordered = venue ? [venue, ...rest] : rest;
  const chips: StackRailChip<V>[] = ordered.slice(0, max).map((v) => ({ vendor: v, isVenue: v === venue }));
  const overflowCount = Math.max(0, ordered.length - max);
  return { chips, overflowCount };
}
