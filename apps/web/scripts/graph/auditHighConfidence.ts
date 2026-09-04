/**
 * Read-only audit of the 143 high-confidence reconciliation matches, using
 * the review artifact (high_confidence_143.csv) as source of truth.
 *
 * Step 1: partition into exact-shared-post-URL (deterministic, auto-confirmed)
 * vs everything else.
 * Step 2: risk-rank the non-exact matches for human review.
 *
 * No DB access, no writes to production. Pure analysis over the CSV export.
 */
import { readFileSync, writeFileSync } from "fs";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else if (c === "\r") {
        // skip
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length && r.some((x) => x !== "")).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => (obj[h] = r[idx]));
    return obj;
  });
}

const csvText = readFileSync("scripts/graph/data/reconciliation_review/high_confidence_143.csv", "utf-8");
const rows = parseCsv(csvText);
console.log(`[audit] parsed ${rows.length} rows`);

interface Parsed {
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
  exact_match: boolean;
}

const parsed: Parsed[] = rows.map((r) => {
  const jeremy_urls = r.jeremy_post_urls.split(" | ").map((s) => s.trim()).filter(Boolean);
  const ben_urls = r.ben_wedding_post_urls.split(" | ").map((s) => s.trim()).filter(Boolean);
  const jeremySet = new Set(jeremy_urls);
  const exact_match = ben_urls.some((u) => jeremySet.has(u));
  return {
    candidate_id: Number(r.candidate_id),
    matched_wedding_id: Number(r.matched_wedding_id),
    venue_handle: r.venue_handle,
    candidate_date: r.candidate_date,
    ben_wedding_date: r.ben_wedding_date,
    date_delta_days: Number(r.date_delta_days),
    vendor_jaccard: Number(r.vendor_jaccard),
    candidate_post_count: Number(r.candidate_post_count),
    ben_wedding_post_count: Number(r.ben_wedding_post_count),
    jeremy_urls,
    ben_urls,
    candidate_vendors: r.candidate_vendors.split(" | ").map((s) => s.trim()).filter(Boolean),
    ben_vendors: r.ben_wedding_vendors.split(" | ").map((s) => s.trim()).filter(Boolean),
    exact_match,
  };
});

const exact = parsed.filter((p) => p.exact_match);
const nonExact = parsed.filter((p) => !p.exact_match);

console.log(`[audit] exact shared post URL: ${exact.length}`);
console.log(`[audit] non-exact (needs review): ${nonExact.length}`);

// verify example given by user
const ex = parsed.find((p) => p.candidate_id === 1691);
console.log(`[audit] candidate 1691 -> wedding ${ex?.matched_wedding_id}, exact_match=${ex?.exact_match}, date_delta=${ex?.date_delta_days}`);

// count candidates per matched_wedding_id among the 143 (multi-candidate-to-one-wedding signal)
const weddingCounts = new Map<number, number[]>();
for (const p of parsed) {
  if (!weddingCounts.has(p.matched_wedding_id)) weddingCounts.set(p.matched_wedding_id, []);
  weddingCounts.get(p.matched_wedding_id)!.push(p.candidate_id);
}
const multiMapped = [...weddingCounts.entries()].filter(([, cands]) => cands.length > 1);
console.log(`[audit] Ben weddings matched by >1 of the 143 candidates: ${multiMapped.length}`);
for (const [wid, cands] of multiMapped) {
  console.log(`  wedding ${wid} <- candidates ${cands.join(",")}`);
}

// risk score for non-exact matches
function riskScore(p: Parsed): number {
  let score = 0;
  const reasons: string[] = [];
  if (p.vendor_jaccard < 0.6) { score += 3; reasons.push("low jaccard"); }
  else if (p.vendor_jaccard < 0.75) { score += 1; reasons.push("moderate jaccard"); }
  if (p.date_delta_days > 3) { score += 3; reasons.push("large date delta"); }
  else if (p.date_delta_days > 0) { score += 1; reasons.push("nonzero date delta"); }
  if (p.candidate_post_count === 1 && p.ben_wedding_post_count === 1) { score += 1; reasons.push("single post both sides (sparse)"); }
  const overlap = p.candidate_vendors.filter((v) => p.ben_vendors.includes(v));
  if (overlap.length <= 1) { score += 2; reasons.push("tiny raw vendor overlap"); }
  const sizeDiff = Math.abs(p.candidate_vendors.length - p.ben_vendors.length);
  if (sizeDiff >= 5) { score += 1; reasons.push("large vendor-list size mismatch"); }
  const isMulti = weddingCounts.get(p.matched_wedding_id)!.length > 1;
  if (isMulti) { score += 2; reasons.push("wedding matched by multiple candidates"); }
  return score;
}

const ranked = nonExact
  .map((p) => ({ p, score: riskScore(p) }))
  .sort((a, b) => b.score - a.score);

writeFileSync(
  "scripts/graph/data/reconciliation_review/non_exact_ranked.json",
  JSON.stringify(ranked.map(({ p, score }) => ({ score, ...p })), null, 2)
);

console.log(`\n[audit] top of risk-ranked non-exact list:`);
for (const { p, score } of ranked.slice(0, 30)) {
  console.log(`  score=${score} cand=${p.candidate_id} wedding=${p.matched_wedding_id} jaccard=${p.vendor_jaccard.toFixed(2)} delta=${p.date_delta_days}d cpost=${p.candidate_post_count} bpost=${p.ben_wedding_post_count}`);
}

console.log(`\n[audit] score distribution:`);
const dist = new Map<number, number>();
for (const { score } of ranked) dist.set(score, (dist.get(score) ?? 0) + 1);
for (const [score, n] of [...dist.entries()].sort((a, b) => b[0] - a[0])) console.log(`  score=${score}: ${n}`);
