/**
 * Remainder review for the 263 non-exact ambiguous matches.
 * Mirror of D020: handle-diff (not role-labeled Jaccard), then
 * GREEN/YELLOW/RED on same-wedding likelihood, vendor-overlap
 * strength, and date-evidence strength. False merge is the
 * highest-priority failure mode.
 *
 * Reads ambiguous_non_exact_ranked.json (and the 5 exact from
 * ambiguous_268.csv). Write-only to the review directory.
 *
 * Usage (from anywhere): bun apps/web/scripts/graph/reviewAmbiguousRemainder.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const REVIEW_DIR = join(import.meta.dir, "data/reconciliation_review");

type Ranked = {
  score: number;
  reasons: string[];
  candidate_id: number;
  matched_wedding_id: number;
  venue_handle: string;
  candidate_date: string;
  ben_wedding_date: string;
  date_delta_days: number;
  vendor_jaccard: number;
  candidate_post_count: number;
  ben_wedding_post_count: number;
  jeremy_urls: string[];
  ben_urls: string[];
  candidate_vendors: string[];
  ben_vendors: string[];
};

function handlesOf(labeled: string[]): Set<string> {
  const out = new Set<string>();
  for (const v of labeled) {
    const m = v.match(/@([A-Za-z0-9._]+)/);
    if (m) out.add(m[1].toLowerCase());
  }
  return out;
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyPairs(a: Set<string>, b: Set<string>): [string, string][] {
  const pairs: [string, string][] = [];
  for (const x of a) {
    if (b.has(x)) continue;
    for (const y of b) {
      if (a.has(y)) continue;
      const d = lev(x, y);
      const similar = d === 1 || (d === 2 && Math.max(x.length, y.length) >= 10) || x.includes(y) || y.includes(x);
      if (similar && x !== y) pairs.push([x, y]);
    }
  }
  return pairs;
}

type Verdict = "GREEN" | "YELLOW" | "RED";

function verdictOf(p: Ranked): {
  verdict: Verdict;
  jeremyHandles: string[];
  benHandles: string[];
  overlap: string[];
  jeremyOnly: string[];
  handleRecall: number;
  handleJaccard: number;
  overlapExVenue: number;
  fuzzy: [string, string][];
  why: string;
} {
  const jh = handlesOf(p.candidate_vendors);
  const bh = handlesOf(p.ben_vendors);
  const overlap = [...jh].filter((h) => bh.has(h));
  const jeremyOnly = [...jh].filter((h) => !bh.has(h));
  const union = new Set([...jh, ...bh]);
  const handleJaccard = union.size === 0 ? 0 : overlap.length / union.size;
  const handleRecall = jh.size === 0 ? 0 : overlap.length / jh.size;
  const venue = (p.venue_handle || "").toLowerCase();
  const overlapExVenue = overlap.filter((h) => h !== venue).length;
  const fuzzy = fuzzyPairs(jh, bh);
  const overlapWithFuzzy = overlap.length + fuzzy.length;
  const recallWithFuzzy = jh.size === 0 ? 0 : overlapWithFuzzy / jh.size;
  const delta = p.date_delta_days;

  // Calibrated to D020: GREEN needed strong handle overlap (their YELLOW was
  // 11/14 Jeremy handles on the Ben side) plus a small date delta. RED is the
  // false-merge pattern this tier is built for: same venue, reused vendors,
  // different event dates. Ingestion adds Jeremy vendors onto the Ben wedding,
  // so a false merge pollutes wedding_vendors — miss is cheaper than a wrong
  // write. Bar is high.

  let verdict: Verdict;
  let why: string;

  if (overlapExVenue === 0 && fuzzy.length === 0) {
    verdict = "RED";
    why = "no non-venue handle overlap (venue-only or empty) — distinct events at the same venue";
  } else if (delta > 30 && recallWithFuzzy < 0.7) {
    verdict = "RED";
    why = `date delta ${delta}d exceeds ambiguous window and handle recall ${recallWithFuzzy.toFixed(2)} is not near-subset — same-venue vendor reuse, not the same wedding`;
  } else if (delta > 30 && recallWithFuzzy >= 0.7) {
    verdict = "YELLOW";
    why = `strong handle overlap (recall ${recallWithFuzzy.toFixed(2)}) but date delta ${delta}d is far outside any same-weekend window — possible recap/date-parse error, not auto-ingest`;
  } else if (recallWithFuzzy >= 0.75 && overlapExVenue >= 3 && delta <= 14) {
    verdict = "GREEN";
    why = `strong handle overlap (${overlap.length}/${jh.size} exact, +${fuzzy.length} fuzzy) within 14-day window (delta=${delta}d) — D020 GREEN shape`;
  } else if (recallWithFuzzy >= 0.6 && overlapExVenue >= 2 && delta <= 14) {
    verdict = "YELLOW";
    why = `moderate-strong handle overlap (recall ${recallWithFuzzy.toFixed(2)}, ${overlapExVenue} non-venue) within 14d — likely same wedding but not D020-GREEN-strong`;
  } else if (recallWithFuzzy >= 0.75 && overlapExVenue >= 3 && delta <= 30) {
    verdict = "YELLOW";
    why = `strong handle overlap but date delta ${delta}d is in the 15–30 ambiguous band (D020's single YELLOW was 12d)`;
  } else {
    verdict = "RED";
    why = `weak/ambiguous identity: handle recall ${recallWithFuzzy.toFixed(2)}, non-venue overlap ${overlapExVenue}, delta ${delta}d — not enough to rule out a distinct wedding at the same venue`;
  }

  return {
    verdict,
    jeremyHandles: [...jh].sort(),
    benHandles: [...bh].sort(),
    overlap: overlap.sort(),
    jeremyOnly: jeremyOnly.sort(),
    handleRecall,
    handleJaccard,
    overlapExVenue,
    fuzzy,
    why,
  };
}

const ranked: Ranked[] = JSON.parse(readFileSync(join(REVIEW_DIR, "ambiguous_non_exact_ranked.json"), "utf-8"));
console.log(`[review] non-exact rows: ${ranked.length}`);

const reviewed = ranked.map((p) => ({ ...p, ...verdictOf(p) }));

const counts = { GREEN: 0, YELLOW: 0, RED: 0 };
for (const r of reviewed) counts[r.verdict]++;
console.log("[review] verdict counts:", counts);

const admission = { dateOnly: 0, jacOnly: 0, both: 0 };
for (const r of reviewed) {
  const dateOk = r.date_delta_days <= 30;
  const jacOk = r.vendor_jaccard > 0.3;
  if (dateOk && jacOk) admission.both++;
  else if (dateOk) admission.dateOnly++;
  else admission.jacOnly++;
}
console.log("[review] how they entered ambiguous:", admission);

console.log("\n[review] GREEN cases:");
for (const r of reviewed.filter((x) => x.verdict === "GREEN")) {
  console.log(
    `  cand=${r.candidate_id} wedding=${r.matched_wedding_id} @${r.venue_handle} delta=${r.date_delta_days}d jac=${r.vendor_jaccard.toFixed(2)} handleRecall=${r.handleRecall.toFixed(2)} overlap=${r.overlap.length}/${r.jeremyHandles.length} exVenue=${r.overlapExVenue} fuzzy=${r.fuzzy.length} :: ${r.why}`
  );
  console.log(`    overlap: ${r.overlap.join(", ")}`);
  if (r.fuzzy.length) console.log(`    fuzzy: ${r.fuzzy.map(([a, b]) => `${a}~${b}`).join(", ")}`);
  console.log(`    jeremy-only: ${r.jeremyOnly.join(", ")}`);
}

console.log("\n[review] YELLOW cases:");
for (const r of reviewed.filter((x) => x.verdict === "YELLOW")) {
  console.log(
    `  cand=${r.candidate_id} wedding=${r.matched_wedding_id} @${r.venue_handle} delta=${r.date_delta_days}d jac=${r.vendor_jaccard.toFixed(2)} handleRecall=${r.handleRecall.toFixed(2)} overlap=${r.overlap.length}/${r.jeremyHandles.length} exVenue=${r.overlapExVenue} fuzzy=${r.fuzzy.length} :: ${r.why}`
  );
  console.log(`    overlap: ${r.overlap.join(", ")}`);
  if (r.fuzzy.length) console.log(`    fuzzy: ${r.fuzzy.map(([a, b]) => `${a}~${b}`).join(", ")}`);
  console.log(`    jeremy-only: ${r.jeremyOnly.join(", ")}`);
}

const multi = new Map<number, number[]>();
for (const r of reviewed) {
  if (!multi.has(r.matched_wedding_id)) multi.set(r.matched_wedding_id, []);
  multi.get(r.matched_wedding_id)!.push(r.candidate_id);
}
const magnets = [...multi.entries()].filter(([, c]) => c.length > 1);
console.log(`\n[review] multi-candidate Ben weddings in the 263: ${magnets.length}`);

const magnetRed = reviewed.filter((r) => (multi.get(r.matched_wedding_id)?.length ?? 0) > 1 && r.verdict === "RED").length;
const magnetGreen = reviewed.filter((r) => (multi.get(r.matched_wedding_id)?.length ?? 0) > 1 && r.verdict === "GREEN").length;
console.log(`[review] of magnet-mapped remainder: GREEN=${magnetGreen} RED-ish=${magnetRed}`);

writeFileSync(
  join(REVIEW_DIR, "ambiguous_remainder_verdicts.json"),
  JSON.stringify(
    reviewed.map((r) => ({
      verdict: r.verdict,
      why: r.why,
      candidate_id: r.candidate_id,
      matched_wedding_id: r.matched_wedding_id,
      venue_handle: r.venue_handle,
      date_delta_days: r.date_delta_days,
      vendor_jaccard: r.vendor_jaccard,
      handleRecall: r.handleRecall,
      handleJaccard: r.handleJaccard,
      overlapExVenue: r.overlapExVenue,
      overlap: r.overlap,
      jeremyOnly: r.jeremyOnly,
      fuzzy: r.fuzzy,
      score: r.score,
    })),
    null,
    2
  )
);

console.log("\n[review] wrote ambiguous_remainder_verdicts.json");
