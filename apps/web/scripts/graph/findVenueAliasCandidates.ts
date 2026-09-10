/**
 * Re-runnable, report-only finder for venues split across multiple Instagram handles -- the
 * failure mode the user keeps catching by hand (venutisrestaurant/venutis.banquets,
 * saltshechicago/saltshedchicago, the.arbory/thearbory, cbgweddings/chicagobotanic). It proposes
 * pairs with evidence and a tier; a human/agent verifies; a SEPARATE apply step (in the style of
 * applyAccountAliasesSchema.ts) adds confirmed pairs to `account_aliases`. This script NEVER
 * writes to the database.
 *
 * Universe ("venue-ish" accounts, ~1,750 as of 2026-09-10): accounts with >=1 wedding_vendors
 * row role='venue', OR a vendors row with category='venue', OR used as a
 * jeremy_wedding_candidates.venue_account_id. Every account is resolved to its
 * account_aliases-canonical before pairing -- a pair whose members already resolve to the same
 * canonical, or that's already in account_aliases in either direction, is never proposed.
 *
 * Signals (S1-S7) and the T1/T2/T3 tier decision are documented in detail in
 * venueAliasSignals.ts, which holds every pure function this script calls (stemming,
 * Levenshtein, phrase classification, tier decision) -- see venueAliasSignals.test.ts for
 * DB-free unit coverage of that logic, including the worked examples this script's own spec
 * calls out (the.arbory/thearbory, saltshechicago/saltshedchicago, thedrakeoakbrook/thedrake,
 * "Weddings Account @uccweddings", "Venue Management for @rockwellontheriver").
 *
 * A pair that hits a hard exclusion (church/parish-type name, a non-venue vendors.category or
 * catering/management-type bio, the deny-list, or a round-3 false-positive pair) or whose ONLY
 * evidence is an S4 related_not_alias phrase is moved to a separate "related, not the same
 * venue" section and never proposed as an alias.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/findVenueAliasCandidates.ts
 *   bun run scripts/graph/findVenueAliasCandidates.ts --min-stem-len 5
 *   bun run scripts/graph/findVenueAliasCandidates.ts --json-only
 *
 * Output:
 *   scripts/graph/tmp_analysis/alias_candidates_<YYYY-MM-DD>.md   (skipped with --json-only)
 *   scripts/graph/tmp_analysis/alias_candidates_<YYYY-MM-DD>.json
 * and a summary table (counts per tier, counts per signal) to stdout.
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import {
  computeStem,
  isPunctuationVariant,
  normalizeExternalUrl,
  extractBioMentionSnippet,
  classifyBioMentionPhrase,
  levenshtein,
  isChurchLike,
  isChurchLikeUsername,
  isNonVenueBio,
  isExcludedPair,
  decideTier,
  suggestDirection,
  type SignalCode,
  type Tier,
} from "./venueAliasSignals";

const OUT_DIR = new URL("./tmp_analysis/", import.meta.url).pathname;
const STACK_PARSER_VERSION = "stack-parser-ts-v9";
const EXTRACT_PROMPT_PREFIX = "extract-v1.2"; // matches 'extract-v1.2%' (base, +sonnet, -venuecal)
const S5_MIN_POSTS = 2;
const S7_MIN_POSTS = 2;
const S6_MIN_HANDLE_LEN = 8;
const S6_MAX_DISTANCE = 2;
/** Groups this large are almost always a shared platform artifact (a generic full_name or a
 * link-shortener domain everyone uses), not real aliasing -- print/report them but don't explode
 * into C(n,2) pairs. */
const MAX_GROUP_SIZE_FOR_PAIRING = 8;

interface AccountRow {
  id: number;
  username: string;
  fullName: string | null;
  biography: string | null;
  externalUrl: string | null;
  followers: number | null;
  profileScrapedAt: string | null;
}

interface SignalHit {
  code: SignalCode;
  evidence: string;
}

interface PairAccumulator {
  idA: number;
  idB: number;
  signals: SignalHit[];
}

interface OutputPair {
  alias: string;
  canonical: string;
  tier: Tier;
  signals: SignalCode[];
  evidence: string[];
  suggested_note: string;
  // extra context beyond the minimum spec'd JSON shape -- same report style as
  // buildLocationTagVenueMap.ts's confident/ambiguous rows.
  usernameA: string;
  usernameB: string;
  weddingsA: number;
  weddingsB: number;
  candidatesA: number;
  candidatesB: number;
  followersA: number | null;
  followersB: number | null;
  fullNameA: string | null;
  fullNameB: string | null;
}

function pairKey(idA: number, idB: number): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function addSignal(
  map: Map<string, PairAccumulator>,
  idA: number,
  idB: number,
  code: SignalCode,
  evidence: string
) {
  if (idA === idB) return;
  const key = pairKey(idA, idB);
  let acc = map.get(key);
  if (!acc) {
    acc = { idA: Math.min(idA, idB), idB: Math.max(idA, idB), signals: [] };
    map.set(key, acc);
  }
  acc.signals.push({ code, evidence });
}

function groupPairs<T>(items: T[], keyFn: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json-only");
  const minStemLenFlagIdx = args.indexOf("--min-stem-len");
  const minStemLen =
    minStemLenFlagIdx >= 0 && args[minStemLenFlagIdx + 1]
      ? parseInt(args[minStemLenFlagIdx + 1], 10)
      : 4;

  const pool = getPool();

  // NOTE on ids: `pg` returns `bigint` columns as JS strings (precision safety), but this script
  // uses account ids as `number` Map keys throughout -- every bigint column read below is coerced
  // via Number(...) IMMEDIATELY after the query, so a later `someMap.get(account.id)` never
  // silently misses because one side is "515" and the other is 515.

  // ---- Universe ----
  const { rows: universeRowsRaw } = await pool.query<{ account_id: string }>(`
    select account_id from wedding_vendors where role = 'venue'
    union
    select account_id from vendors where category = 'venue' and account_id is not null
    union
    select venue_account_id as account_id from jeremy_wedding_candidates where venue_account_id is not null
  `);
  const universeIds = [...new Set(universeRowsRaw.map((r) => Number(r.account_id)))];

  const { rows: accountRowsRaw } = await pool.query<{
    id: string;
    username: string;
    full_name: string | null;
    biography: string | null;
    external_url: string | null;
    followers: number | null;
    profile_scraped_at: string | null;
  }>(
    `select id, username::text as username, full_name, biography, external_url, followers, profile_scraped_at
     from accounts where id = any($1::bigint[])`,
    [universeIds]
  );
  const accountRows = accountRowsRaw.map((r) => ({ ...r, id: Number(r.id) }));
  const accounts = new Map<number, AccountRow>(
    accountRows.map((r) => [
      r.id,
      {
        id: r.id,
        username: r.username,
        fullName: r.full_name,
        biography: r.biography,
        externalUrl: r.external_url,
        followers: r.followers,
        profileScrapedAt: r.profile_scraped_at,
      },
    ])
  );

  // ---- Alias resolution ----
  const { rows: aliasRowsRaw } = await pool.query<{ alias_account_id: string; canonical_account_id: string }>(
    `select alias_account_id, canonical_account_id from account_aliases`
  );
  const aliasRows = aliasRowsRaw.map((r) => ({
    alias_account_id: Number(r.alias_account_id),
    canonical_account_id: Number(r.canonical_account_id),
  }));
  const aliasToCanonical = new Map(aliasRows.map((r) => [r.alias_account_id, r.canonical_account_id]));
  const canonicalize = (id: number) => aliasToCanonical.get(id) ?? id;
  const existingAliasPairs = new Set(
    aliasRows.map((r) => pairKey(r.alias_account_id, r.canonical_account_id))
  );

  // Full alias cluster (canonical -> every id that rolls up to it, including itself) -- used
  // for "weddings/candidates on each side, alias-resolved" regardless of which raw id shows up
  // in the pair.
  const clusterMembers = new Map<number, number[]>();
  for (const id of universeIds) {
    const canon = canonicalize(id);
    const arr = clusterMembers.get(canon);
    if (arr) arr.push(id);
    else clusterMembers.set(canon, [id]);
  }
  for (const [aliasId, canonId] of aliasToCanonical) {
    if (!clusterMembers.has(canonId)) clusterMembers.set(canonId, [canonId]);
    const arr = clusterMembers.get(canonId)!;
    if (!arr.includes(aliasId)) arr.push(aliasId);
  }

  // ---- Vendor category ----
  const { rows: vendorCatRows } = await pool.query<{ account_id: string; category: string | null }>(
    `select account_id, min(category) as category from vendors
     where account_id is not null and category is not null group by account_id`
  );
  const vendorCategoryByAccount = new Map(vendorCatRows.map((r) => [Number(r.account_id), r.category]));

  // ---- Weddings / candidates counts (raw, per account_id) ----
  const { rows: weddingRows } = await pool.query<{ account_id: string; n: string }>(
    `select account_id, count(distinct wedding_id)::text as n from wedding_vendors
     where role = 'venue' group by account_id`
  );
  const weddingsByAccount = new Map(weddingRows.map((r) => [Number(r.account_id), Number(r.n)]));

  const { rows: candidateRows } = await pool.query<{ venue_account_id: string; n: string }>(
    `select venue_account_id, count(*)::text as n from jeremy_wedding_candidates
     where venue_account_id is not null group by venue_account_id`
  );
  const candidatesByAccount = new Map(candidateRows.map((r) => [Number(r.venue_account_id), Number(r.n)]));

  const clusterTotal = (map: Map<number, number>, canonId: number) => {
    const members = clusterMembers.get(canonId) ?? [canonId];
    return members.reduce((sum, id) => sum + (map.get(id) ?? 0), 0);
  };

  // ============================================================
  // Signal detection
  // ============================================================
  const pairs = new Map<string, PairAccumulator>();
  const usernameToId = new Map(accountRows.map((r) => [r.username.toLowerCase(), r.id]));

  // ---- S1: same normalized stem ----
  const stemGroups = groupPairs(accountRows, (r) => {
    const stem = computeStem(r.username);
    return stem.length >= minStemLen ? stem : null;
  });
  let s1GroupsOverCap = 0;
  for (const [stem, members] of stemGroups) {
    if (members.length < 2) continue;
    if (members.length > MAX_GROUP_SIZE_FOR_PAIRING) {
      s1GroupsOverCap++;
      continue;
    }
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        addSignal(
          pairs,
          members[i].id,
          members[j].id,
          "S1",
          `@${members[i].username} ~ @${members[j].username} (stem "${stem}")`
        );
      }
    }
  }

  // ---- S1b: punctuation-only variants ----
  for (let i = 0; i < accountRows.length; i++) {
    for (let j = i + 1; j < accountRows.length; j++) {
      const a = accountRows[i];
      const b = accountRows[j];
      if (isPunctuationVariant(a.username, b.username)) {
        addSignal(pairs, a.id, b.id, "S1b", "scrape/parse artifact ('.'/'_' variant)");
      }
    }
  }

  // ---- S2: same full_name ----
  const fullNameGroups = groupPairs(accountRows, (r) => {
    const fn = r.full_name?.trim().toLowerCase() ?? "";
    return fn.length > 3 ? fn : null;
  });
  for (const [, members] of fullNameGroups) {
    if (members.length < 2 || members.length > MAX_GROUP_SIZE_FOR_PAIRING) continue;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        addSignal(
          pairs,
          members[i].id,
          members[j].id,
          "S2",
          `same full_name "${members[i].full_name}"`
        );
      }
    }
  }

  // ---- S3: same normalized external_url ----
  const urlGroups = groupPairs(accountRows, (r) => normalizeExternalUrl(r.external_url));
  for (const [url, members] of urlGroups) {
    if (members.length < 2 || members.length > MAX_GROUP_SIZE_FOR_PAIRING) continue;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        addSignal(pairs, members[i].id, members[j].id, "S3", `same external_url "${url}"`);
      }
    }
  }

  // ---- S4: bio @mention, phrase-classified where possible ----
  // Every bio @mention of another in-universe account is evidence worth surfacing (e.g.
  // "Also @thelytleauditorium" doesn't match either phrase pattern below, but a human should
  // still see it) -- classification only decides T1 eligibility (alias_like) and the
  // related-not-alias soft exclusion, tracked in dedicated per-pair sets (not parsed back out of
  // the evidence string) so the tier/exclusion decisions downstream stay typed rather than
  // stringly-matched.
  const s4AliasLikePairs = new Set<string>();
  const s4PhrasesByPair = new Map<string, Set<"alias_like" | "related_not_alias" | "unclassified">>();
  const mentionRe = /@([a-z0-9._]{2,30})/gi;
  for (const src of accountRows) {
    if (!src.biography) continue;
    const seen = new Set<string>();
    for (const m of src.biography.matchAll(mentionRe)) {
      const mentionedUsername = m[1].toLowerCase();
      if (seen.has(mentionedUsername)) continue;
      seen.add(mentionedUsername);
      const targetId = usernameToId.get(mentionedUsername);
      if (targetId === undefined || targetId === src.id) continue;
      const snippet = extractBioMentionSnippet(src.biography, mentionedUsername);
      if (!snippet) continue;
      const phrase = classifyBioMentionPhrase(snippet) ?? "unclassified";
      addSignal(pairs, src.id, targetId, "S4", `@${src.username} bio: "...${snippet}..." (${phrase})`);
      const key = pairKey(src.id, targetId);
      if (phrase === "alias_like") s4AliasLikePairs.add(key);
      const set = s4PhrasesByPair.get(key);
      if (set) set.add(phrase);
      else s4PhrasesByPair.set(key, new Set([phrase]));
    }
  }

  // ---- S5: co-credited on the same credit line ----
  const { rows: coCreditRows } = await pool.query<{ post_url: string; line_no: number; handles: string[] }>(
    `select post_url, line_no, array_agg(distinct handle) as handles
     from stack_extraction_entries
     where stack_parser_version = $1 and role = 'venue' and source = 'credit_line'
     group by post_url, line_no
     having count(distinct handle) >= 2`,
    [STACK_PARSER_VERSION]
  );
  const s5PairPosts = new Map<string, { idA: number; idB: number; posts: Set<string>; samplePostUrl: string }>();
  for (const row of coCreditRows) {
    const resolvedIds = [...new Set(row.handles.map((h) => usernameToId.get(h.toLowerCase())))].filter(
      (id): id is number => id !== undefined
    );
    for (let i = 0; i < resolvedIds.length; i++) {
      for (let j = i + 1; j < resolvedIds.length; j++) {
        const key = pairKey(resolvedIds[i], resolvedIds[j]);
        let acc = s5PairPosts.get(key);
        if (!acc) {
          acc = {
            idA: Math.min(resolvedIds[i], resolvedIds[j]),
            idB: Math.max(resolvedIds[i], resolvedIds[j]),
            posts: new Set(),
            samplePostUrl: row.post_url,
          };
          s5PairPosts.set(key, acc);
        }
        acc.posts.add(row.post_url);
      }
    }
  }
  const s5PostCountByPair = new Map<string, number>();
  for (const [key, acc] of s5PairPosts) {
    if (acc.posts.size < S5_MIN_POSTS) continue;
    s5PostCountByPair.set(key, acc.posts.size);
    addSignal(
      pairs,
      acc.idA,
      acc.idB,
      "S5",
      `co-credited on the same venue credit line, ${acc.posts.size} posts (e.g. ${acc.samplePostUrl})`
    );
  }

  // ---- S6: mis-capture (Levenshtein 1-2, unscraped mention-only handle vs a real venue handle) ----
  const unscrapedCandidates = accountRows.filter(
    (r) => r.followers === null && r.profile_scraped_at === null && r.username.length >= S6_MIN_HANDLE_LEN
  );
  const realVenueCandidates = accountRows.filter((r) => {
    if (r.username.length < S6_MIN_HANDLE_LEN) return false;
    const weddings = weddingsByAccount.get(r.id) ?? 0;
    return r.followers !== null || weddings >= 3;
  });
  // bucket the real-venue side by length so we only Levenshtein-compare pairs whose length
  // difference could possibly be <= S6_MAX_DISTANCE.
  const realVenueByLength = new Map<number, (typeof accountRows)[number][]>();
  for (const r of realVenueCandidates) {
    const arr = realVenueByLength.get(r.username.length);
    if (arr) arr.push(r);
    else realVenueByLength.set(r.username.length, [r]);
  }
  for (const unscraped of unscrapedCandidates) {
    for (let len = unscraped.username.length - S6_MAX_DISTANCE; len <= unscraped.username.length + S6_MAX_DISTANCE; len++) {
      const candidates = realVenueByLength.get(len);
      if (!candidates) continue;
      for (const real of candidates) {
        if (real.id === unscraped.id) continue;
        const dist = levenshtein(unscraped.username.toLowerCase(), real.username.toLowerCase());
        if (dist >= 1 && dist <= S6_MAX_DISTANCE) {
          addSignal(
            pairs,
            unscraped.id,
            real.id,
            "S6",
            `Levenshtein distance ${dist}: @${unscraped.username} (never scraped) vs @${real.username} (real venue)`
          );
        }
      }
    }
  }

  // ---- S7: reader disagreement (extract-v1.2 THIS_VENUE >=0.8 whose venue_handle_guess resolves elsewhere) ----
  const { rows: candidateAnchorRowsRaw } = await pool.query<{ id: string; venue_account_id: string | null }>(
    `select id, venue_account_id from jeremy_wedding_candidates where venue_account_id is not null`
  );
  const anchorByCandidateId = new Map(
    candidateAnchorRowsRaw.map((r) => [Number(r.id), Number(r.venue_account_id)])
  );

  const { rows: readerRows } = await pool.query<{ post_url: string; candidate_id: string | null; guess: string | null }>(
    `select post_url, candidate_id, result->>'venue_handle_guess' as guess
     from post_extraction_runs
     where prompt_version like $1 and verdict = 'THIS_VENUE' and confidence >= 0.8
       and result->>'venue_handle_guess' is not null`,
    [`${EXTRACT_PROMPT_PREFIX}%`]
  );
  const s7PairPosts = new Map<string, { idA: number; idB: number; posts: Set<string> }>();
  for (const row of readerRows) {
    if (row.candidate_id === null || !row.guess) continue;
    const anchorId = anchorByCandidateId.get(Number(row.candidate_id));
    if (anchorId === undefined) continue;
    const guessUsername = row.guess.trim().toLowerCase().replace(/^@/, "");
    const guessedId = usernameToId.get(guessUsername);
    if (guessedId === undefined) continue;
    if (canonicalize(guessedId) === canonicalize(anchorId)) continue;
    const key = pairKey(anchorId, guessedId);
    let acc = s7PairPosts.get(key);
    if (!acc) {
      acc = { idA: Math.min(anchorId, guessedId), idB: Math.max(anchorId, guessedId), posts: new Set() };
      s7PairPosts.set(key, acc);
    }
    acc.posts.add(row.post_url);
  }
  const s7PostCountByPair = new Map<string, number>();
  for (const [key, acc] of s7PairPosts) {
    if (acc.posts.size < S7_MIN_POSTS) continue;
    s7PostCountByPair.set(key, acc.posts.size);
    addSignal(
      pairs,
      acc.idA,
      acc.idB,
      "S7",
      `reader disagreement: ${acc.posts.size} posts THIS_VENUE>=0.8 at one venue but guessed the other's handle`
    );
  }

  // ============================================================
  // Filter, classify, tier
  // ============================================================
  const proposals: OutputPair[] = [];
  const related: OutputPair[] = [];
  const signalCounts = new Map<SignalCode, number>();
  const tierCounts = new Map<Tier, number>();

  for (const acc of pairs.values()) {
    const a = accounts.get(acc.idA);
    const b = accounts.get(acc.idB);
    if (!a || !b) continue;

    // never propose a pair whose members already resolve to the same canonical, or that's
    // already in account_aliases in either direction.
    if (canonicalize(a.id) === canonicalize(b.id)) continue;
    if (existingAliasPairs.has(pairKey(a.id, b.id))) continue;

    const key = pairKey(a.id, b.id);
    const distinctCodes = [...new Set(acc.signals.map((s) => s.code))];
    const evidence = acc.signals.map((s) => `[${s.code}] ${s.evidence}`);

    const catA = vendorCategoryByAccount.get(a.id) ?? null;
    const catB = vendorCategoryByAccount.get(b.id) ?? null;

    const hardExcluded =
      isExcludedPair(a.username, b.username) ||
      isChurchLikeUsername(a.username) ||
      isChurchLike(a.fullName) ||
      isChurchLike(a.biography) ||
      isChurchLikeUsername(b.username) ||
      isChurchLike(b.fullName) ||
      isChurchLike(b.biography) ||
      isNonVenueBio(a.biography) ||
      isNonVenueBio(b.biography) ||
      (catA !== null && catA !== "venue") ||
      (catB !== null && catB !== "venue");

    // Soft exclusion: the ONLY evidence for this pair is one or more S4 mentions, and EVERY one
    // of them classified as related_not_alias (a pair with an unclassified mention, like "Also
    // @thelytleauditorium", still surfaces for a human to look at -- only a confirmed
    // related_not_alias phrase with nothing else supporting it gets auto-routed away).
    const nonS4Signal = acc.signals.some((s) => s.code !== "S4");
    const s4Phrases = s4PhrasesByPair.get(key);
    const s4AllRelatedOnly = !!s4Phrases && [...s4Phrases].every((p) => p === "related_not_alias");
    const softExcluded = !nonS4Signal && s4AllRelatedOnly;

    // Tally every signal that fired for this pair regardless of which section it lands in --
    // an excluded pair's signals are still real, useful stdout diagnostics (e.g. an S2 match
    // between two photographers who happen to share a generic full_name).
    for (const code of distinctCodes) signalCounts.set(code, (signalCounts.get(code) ?? 0) + 1);

    const weddingsA = clusterTotal(weddingsByAccount, canonicalize(a.id));
    const weddingsB = clusterTotal(weddingsByAccount, canonicalize(b.id));
    const candidatesA = clusterTotal(candidatesByAccount, canonicalize(a.id));
    const candidatesB = clusterTotal(candidatesByAccount, canonicalize(b.id));

    const direction = suggestDirection(
      {
        username: a.username,
        hasScrapedProfile: a.profileScrapedAt !== null,
        hasFullName: !!a.fullName,
        followers: a.followers,
      },
      {
        username: b.username,
        hasScrapedProfile: b.profileScrapedAt !== null,
        hasFullName: !!b.fullName,
        followers: b.followers,
      }
    );

    if (hardExcluded || softExcluded) {
      const reason = hardExcluded
        ? isExcludedPair(a.username, b.username)
          ? "known round-3 false positive or deny-listed brand handle"
          : isChurchLikeUsername(a.username) || isChurchLike(a.fullName) || isChurchLike(a.biography) ||
            isChurchLikeUsername(b.username) || isChurchLike(b.fullName) || isChurchLike(b.biography)
          ? "church/parish/cathedral-type name"
          : "non-venue vendors.category or catering/management/hospitality-type bio"
        : "only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)";
      related.push({
        alias: direction.aliasUsername,
        canonical: direction.canonicalUsername,
        tier: "T3",
        signals: distinctCodes,
        evidence: [...evidence, `EXCLUDED: ${reason}`],
        suggested_note: reason,
        usernameA: a.username,
        usernameB: b.username,
        weddingsA,
        weddingsB,
        candidatesA,
        candidatesB,
        followersA: a.followers,
        followersB: b.followers,
        fullNameA: a.fullName,
        fullNameB: b.fullName,
      });
      continue;
    }

    const s2BothVenueCategory = distinctCodes.includes("S2") && catA === "venue" && catB === "venue";
    const s4AliasLikeFired = distinctCodes.includes("S4") && s4AliasLikePairs.has(key);
    const tier = decideTier({
      signalCodes: distinctCodes,
      s1bFired: distinctCodes.includes("S1b"),
      s2BothVenueCategory,
      s4AliasLikeFired,
      s5MaxPostCount: s5PostCountByPair.get(key) ?? 0,
      s6Fired: distinctCodes.includes("S6"),
      s7MaxPostCount: s7PostCountByPair.get(key) ?? 0,
    });

    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);

    proposals.push({
      alias: direction.aliasUsername,
      canonical: direction.canonicalUsername,
      tier,
      signals: distinctCodes,
      evidence,
      suggested_note: direction.reason,
      usernameA: a.username,
      usernameB: b.username,
      weddingsA,
      weddingsB,
      candidatesA,
      candidatesB,
      followersA: a.followers,
      followersB: b.followers,
      fullNameA: a.fullName,
      fullNameB: b.fullName,
    });
  }

  const combinedWeight = (p: OutputPair) => p.weddingsA + p.weddingsB + p.candidatesA + p.candidatesB;
  proposals.sort((x, y) => combinedWeight(y) - combinedWeight(x));
  related.sort((x, y) => combinedWeight(y) - combinedWeight(x));

  const t1 = proposals.filter((p) => p.tier === "T1");
  const t2 = proposals.filter((p) => p.tier === "T2");
  const t3 = proposals.filter((p) => p.tier === "T3");

  // ============================================================
  // stdout summary
  // ============================================================
  console.log(`\n[find-venue-alias-candidates] universe: ${universeIds.length} venue-ish accounts`);
  console.log(`[find-venue-alias-candidates] existing account_aliases rows: ${aliasRows.length}`);
  if (s1GroupsOverCap > 0) {
    console.log(
      `[find-venue-alias-candidates] skipped ${s1GroupsOverCap} S1 stem group(s) over the ${MAX_GROUP_SIZE_FOR_PAIRING}-member cap (likely a generic root, not real aliasing)`
    );
  }
  console.log(`\n[find-venue-alias-candidates] pairs by tier:`);
  console.log(`  T1 (auto-safe): ${t1.length}`);
  console.log(`  T2 (verify):    ${t2.length}`);
  console.log(`  T3 (list):      ${t3.length}`);
  console.log(`  related, not the same venue: ${related.length}`);
  console.log(`\n[find-venue-alias-candidates] pairs by signal (a pair can carry more than one):`);
  for (const code of ["S1", "S1b", "S2", "S3", "S4", "S5", "S6", "S7"] as SignalCode[]) {
    console.log(`  ${code}: ${signalCounts.get(code) ?? 0}`);
  }

  // ============================================================
  // Output files
  // ============================================================
  const today = new Date().toISOString().slice(0, 10);
  const mdPath = `${OUT_DIR}alias_candidates_${today}.md`;
  const jsonPath = `${OUT_DIR}alias_candidates_${today}.json`;

  const jsonOut = {
    generatedAt: new Date().toISOString(),
    universeSize: universeIds.length,
    minStemLen,
    tierCounts: Object.fromEntries(tierCounts),
    signalCounts: Object.fromEntries(signalCounts),
    pairs: [...t1, ...t2, ...t3].map((p) => ({
      alias: p.alias,
      canonical: p.canonical,
      tier: p.tier,
      signals: p.signals,
      evidence: p.evidence,
      suggested_note: p.suggested_note,
    })),
    relatedNotSame: related.map((p) => ({
      alias: p.alias,
      canonical: p.canonical,
      tier: p.tier,
      signals: p.signals,
      evidence: p.evidence,
      suggested_note: p.suggested_note,
    })),
  };
  writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));
  console.log(`\n[find-venue-alias-candidates] wrote ${jsonPath}`);

  if (!jsonOnly) {
    const md = renderMarkdown(today, universeIds.length, t1, t2, t3, related);
    writeFileSync(mdPath, md);
    console.log(`[find-venue-alias-candidates] wrote ${mdPath}`);
  } else {
    console.log(`[find-venue-alias-candidates] --json-only: skipped markdown report`);
  }

  await closePool();
}

function renderPairLine(p: OutputPair): string {
  const lines = [
    `### @${p.usernameA} ~ @${p.usernameB}`,
    ``,
    `- suggested: **canonical** = @${p.canonical}, **alias** = @${p.alias} -- ${p.suggested_note}`,
    `- signals: ${p.signals.join(", ")}`,
    `- weddings (venue-role, alias-resolved): @${p.usernameA} ${p.weddingsA} / @${p.usernameB} ${p.weddingsB}`,
    `- candidates (structural): @${p.usernameA} ${p.candidatesA} / @${p.usernameB} ${p.candidatesB}`,
    `- followers: @${p.usernameA} ${p.followersA ?? "null"} / @${p.usernameB} ${p.followersB ?? "null"}`,
    `- full_name: @${p.usernameA} "${p.fullNameA ?? ""}" / @${p.usernameB} "${p.fullNameB ?? ""}"`,
    `- evidence:`,
    ...p.evidence.map((e) => `  - ${e}`),
    ``,
  ];
  return lines.join("\n");
}

function renderMarkdown(
  date: string,
  universeSize: number,
  t1: OutputPair[],
  t2: OutputPair[],
  t3: OutputPair[],
  related: OutputPair[]
): string {
  const sections: string[] = [];
  sections.push(`# Venue alias candidates -- ${date}`);
  sections.push(``);
  sections.push(
    `Universe: ${universeSize} venue-ish accounts. Report-only -- verify before running` +
      ` applyAccountAliasesSchema.ts (or its own future round) to actually write account_aliases.`
  );
  sections.push(``);
  sections.push(`| Tier | Count |`);
  sections.push(`|---|---|`);
  sections.push(`| T1 (auto-safe) | ${t1.length} |`);
  sections.push(`| T2 (verify) | ${t2.length} |`);
  sections.push(`| T3 (list) | ${t3.length} |`);
  sections.push(`| related, not the same venue | ${related.length} |`);
  sections.push(``);

  sections.push(`## T1 -- auto-safe (${t1.length})`);
  sections.push(``);
  sections.push(...t1.map(renderPairLine));

  sections.push(`## T2 -- verify (${t2.length})`);
  sections.push(``);
  sections.push(...t2.map(renderPairLine));

  sections.push(`## T3 -- list (${t3.length})`);
  sections.push(``);
  sections.push(...t3.map(renderPairLine));

  sections.push(`## Related, not the same venue (${related.length})`);
  sections.push(``);
  sections.push(...related.map(renderPairLine));

  return sections.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
