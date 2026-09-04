/**
 * Builds the human review artifact for the 143 high-confidence
 * jeremy_wedding_candidate_reconciliation matches — BOTH sides of every
 * proposed match, so each one is actually auditable (not just the Jeremy
 * side, which was the gap in the first version of this export).
 *
 * Ben-side source posts: wedding_posts(wedding_id, post_id) -> posts.url —
 * the same join `lib/server/graph.ts`'s listWeddingStacks uses. Verified
 * before writing this: every wedding_posts row resolves to a real,
 * well-formed URL (0/1668 missing or malformed), and all 143 matched
 * weddings have >=1 wedding_posts row (0 zero-post weddings among them).
 *
 * Read-only. Writes only to scripts/graph/data/reconciliation_review/.
 * Does not touch reconciliation, clustering, or any production table.
 *
 * Usage (from apps/web): bun run scripts/graph/exportHighConfidenceReview.ts
 */
import { writeFileSync } from "fs";
import { getPool, closePool } from "../classify/db";

interface Row {
  candidate_id: number;
  matched_wedding_id: number;
  venue_handle: string | null;
  candidate_date: string | null;
  ben_wedding_date: string | null;
  date_delta_days: number | null;
  vendor_jaccard: number;
  candidate_post_count: number;
  ben_wedding_post_count: number;
  jeremy_post_urls: string[];
  ben_wedding_post_urls: string[];
  candidate_vendors: string[]; // "role: @handle"
  ben_wedding_vendors: string[];
}

async function main() {
  const pool = getPool();

  const { rows } = await pool.query<{
    candidate_id: number;
    matched_wedding_id: number;
    venue_handle: string | null;
    candidate_date: string | null;
    ben_wedding_date: string | null;
    date_delta_days: number | null;
    vendor_jaccard: number;
  }>(
    `select r.candidate_id, r.matched_wedding_id, va.username as venue_handle,
       c.event_date_est::text as candidate_date, w.event_date_est::text as ben_wedding_date,
       r.date_delta_days, r.vendor_jaccard
     from jeremy_wedding_candidate_reconciliation r
     join jeremy_wedding_candidates c on c.id = r.candidate_id
     left join accounts va on va.id = c.venue_account_id
     join weddings w on w.id = r.matched_wedding_id
     where r.match_confidence between 0.75 and 0.85
     order by r.candidate_id`
  );

  console.log(`[export-review] ${rows.length} high-confidence matches to build`);

  const results: Row[] = [];
  const unresolved: number[] = [];

  for (const r of rows) {
    const { rows: jeremyPosts } = await pool.query<{ source_post_url: string }>(
      `select source_post_url from jeremy_wedding_candidate_posts where candidate_id = $1 order by source_post_url`,
      [r.candidate_id]
    );

    const { rows: benPosts } = await pool.query<{ url: string }>(
      `select p.url from wedding_posts wp join posts p on p.id = wp.post_id where wp.wedding_id = $1 order by p.url`,
      [r.matched_wedding_id]
    );
    if (benPosts.length === 0) unresolved.push(r.matched_wedding_id);

    const { rows: candidateVendors } = await pool.query<{ role: string; username: string }>(
      `select cv.role, a.username
       from jeremy_wedding_candidate_vendors cv join accounts a on a.id = cv.account_id
       where cv.candidate_id = $1 order by cv.role, a.username`,
      [r.candidate_id]
    );

    const { rows: benVendors } = await pool.query<{ role: string; username: string }>(
      `select wv.role::text as role, a.username
       from wedding_vendors wv join accounts a on a.id = wv.account_id
       where wv.wedding_id = $1 order by wv.role, a.username`,
      [r.matched_wedding_id]
    );

    results.push({
      candidate_id: r.candidate_id,
      matched_wedding_id: r.matched_wedding_id,
      venue_handle: r.venue_handle,
      candidate_date: r.candidate_date,
      ben_wedding_date: r.ben_wedding_date,
      date_delta_days: r.date_delta_days,
      vendor_jaccard: Number(r.vendor_jaccard),
      candidate_post_count: jeremyPosts.length,
      ben_wedding_post_count: benPosts.length,
      jeremy_post_urls: jeremyPosts.map((p) => p.source_post_url),
      ben_wedding_post_urls: benPosts.map((p) => p.url),
      candidate_vendors: candidateVendors.map((v) => `${v.role}: @${v.username}`),
      ben_wedding_vendors: benVendors.map((v) => `${v.role}: @${v.username}`),
    });
  }

  // --- CSV (machine-readable, one row per match) ---
  const csvHeader = [
    "candidate_id",
    "matched_wedding_id",
    "venue_handle",
    "candidate_date",
    "ben_wedding_date",
    "date_delta_days",
    "vendor_jaccard",
    "candidate_post_count",
    "ben_wedding_post_count",
    "jeremy_post_urls",
    "ben_wedding_post_urls",
    "candidate_vendors",
    "ben_wedding_vendors",
  ];
  const csvEscape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csvLines = [csvHeader.join(",")];
  for (const r of results) {
    csvLines.push(
      [
        r.candidate_id,
        r.matched_wedding_id,
        csvEscape(r.venue_handle ?? ""),
        r.candidate_date ?? "",
        r.ben_wedding_date ?? "",
        r.date_delta_days ?? "",
        r.vendor_jaccard,
        r.candidate_post_count,
        r.ben_wedding_post_count,
        csvEscape(r.jeremy_post_urls.join(" | ")),
        csvEscape(r.ben_wedding_post_urls.join(" | ")),
        csvEscape(r.candidate_vendors.join(" | ")),
        csvEscape(r.ben_wedding_vendors.join(" | ")),
      ].join(",")
    );
  }
  const csvPath = "scripts/graph/data/reconciliation_review/high_confidence_143.csv";
  writeFileSync(csvPath, csvLines.join("\n") + "\n");

  // --- Markdown (human-readable, one section per match) ---
  const mdParts: string[] = [
    "# High-confidence reconciliation review — 143 matches\n",
    "Both sides of every proposed Jeremy candidate -> Ben wedding match, for manual audit.",
    "Generated by `exportHighConfidenceReview.ts`, read-only. Sorted by candidate_id.\n",
    "---\n",
  ];
  for (const r of results) {
    mdParts.push(`## Candidate ${r.candidate_id} -> Wedding ${r.matched_wedding_id}\n`);
    mdParts.push(
      `**Venue:** @${r.venue_handle ?? "?"} | **Jaccard:** ${r.vendor_jaccard.toFixed(2)} | **Date delta:** ${r.date_delta_days ?? "n/a"} days\n`
    );
    mdParts.push(`| | Jeremy candidate | Ben wedding |`);
    mdParts.push(`|---|---|---|`);
    mdParts.push(`| Date | ${r.candidate_date ?? "n/a"} | ${r.ben_wedding_date ?? "n/a"} |`);
    mdParts.push(`| Posts | ${r.candidate_post_count} | ${r.ben_wedding_post_count} |`);
    mdParts.push("");
    mdParts.push(`**Jeremy source posts:**`);
    for (const u of r.jeremy_post_urls) mdParts.push(`- ${u}`);
    mdParts.push("");
    mdParts.push(`**Ben source posts:**`);
    if (r.ben_wedding_post_urls.length === 0) {
      mdParts.push(`- ⚠️ UNRESOLVED — no wedding_posts rows found for wedding_id=${r.matched_wedding_id}`);
    } else {
      for (const u of r.ben_wedding_post_urls) mdParts.push(`- ${u}`);
    }
    mdParts.push("");
    mdParts.push(`**Jeremy vendors:** ${r.candidate_vendors.join(", ")}`);
    mdParts.push("");
    mdParts.push(`**Ben vendors:** ${r.ben_wedding_vendors.join(", ")}`);
    mdParts.push("");
    mdParts.push(`**Your judgment:** ☐ same wedding &nbsp;&nbsp; ☐ different wedding &nbsp;&nbsp; ☐ unsure — notes: ___________`);
    mdParts.push("\n---\n");
  }
  const mdPath = "scripts/graph/data/reconciliation_review/high_confidence_143.md";
  writeFileSync(mdPath, mdParts.join("\n"));

  console.log(`[export-review] DONE — wrote ${csvPath} and ${mdPath}`);
  console.log(`[export-review] matches with UNRESOLVED Ben-side posts: ${unresolved.length}${unresolved.length ? " -> wedding_ids: " + unresolved.join(",") : ""}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
