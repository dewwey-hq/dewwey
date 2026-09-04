/**
 * Eval harness: run any classifier_version against the golden set and
 * report precision/recall/F1, a confusion matrix, false positives/negatives,
 * performance by exclusion_reason, and confidence calibration.
 *
 * IMPORTANT — asymmetric cost: the mission's primary optimization target is
 * PRECISION OF INCLUDE (a false positive — a bad post reaching users — is
 * worse than a false negative). This harness reports standard multi-class
 * metrics too, but the number that matters most is "INCLUDE precision"
 * printed at the top, and false positives are listed in full, not just
 * counted.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/evalHarness.ts --version v1
 *   bun run scripts/classify/evalHarness.ts --version v1 --json > report.json
 */
import { getPool, closePool } from "./db";

interface GoldenRow {
  post_url: string;
  expected_decision: "INCLUDE" | "EXCLUDE" | "REVIEW";
  exclusion_reason: string | null;
  notes: string | null;
  source_note: string;
}

// Derived reporting category — finer-grained than exclusion_reason for
// "by category" breakdowns (e.g. distinguishing engagement/proposal content
// from other not_wedding_related posts, which share one exclusion_reason by
// the labeling rubric's design). Derived post-hoc from decision/reason/notes
// rather than a separate label field, so it costs nothing to relabel if the
// category list changes.
function deriveCategory(g: GoldenRow): string {
  if (g.expected_decision === "INCLUDE") return "real_wedding";
  const reason = g.exclusion_reason ?? "";
  if (reason === "vendor_marketing_generic") return "generic_vendor_marketing";
  if (reason === "styled_or_editorial") return "styled_editorial";
  if (reason === "not_chicago" || reason === "destination_wedding") return "non_chicago_wedding";
  if (reason === "insufficient_evidence") return "ambiguous";
  if (reason === "not_wedding_related") {
    const notes = (g.notes ?? "").toLowerCase();
    if (/engagement|proposal|said yes|popped the question|onbendedknee/.test(notes)) {
      return "engagement_or_proposal";
    }
    return "non_wedding_content";
  }
  return "other";
}

interface ActualRow {
  post_url: string;
  decision: "INCLUDE" | "EXCLUDE" | "REVIEW";
  confidence: number;
  exclusion_reason: string | null;
  tier: string;
  model: string | null;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const sourceNotes = a.includes("--source-note")
    ? get("--source-note")!.split(",").map((s) => s.trim())
    : undefined;
  return { version: get("--version") ?? "v1", json: a.includes("--json"), sourceNotes };
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const { rows: golden } = await pool.query<GoldenRow>(
    args.sourceNotes
      ? `select post_url, expected_decision, exclusion_reason, notes, source_note from golden_set
         where source_note = any($1::text[]) order by post_url`
      : `select post_url, expected_decision, exclusion_reason, notes, source_note from golden_set order by post_url`,
    args.sourceNotes ? [args.sourceNotes] : []
  );
  // Deliberately NOT post_classifications_current — that view is latest-
  // across-ALL-versions, so once a newer classifier_version has run on the
  // same posts, "current" no longer reflects what THIS version decided
  // (verified live: querying an older version through it silently returned
  // zero rows once a newer version superseded every shared post). Resolve
  // latest-WITHIN-this-version directly so history stays comparable forever,
  // not just until the next version runs.
  const { rows: actualRows } = await pool.query<ActualRow>(
    `select distinct on (post_url) post_url, decision, confidence, exclusion_reason, tier, model
     from post_classification_runs
     where classifier_version = $1 and post_url = any($2::text[])
     order by post_url, classified_at desc`,
    [args.version, golden.map((g) => g.post_url)]
  );
  const actual = new Map(actualRows.map((r) => [r.post_url, r]));

  const missing = golden.filter((g) => !actual.has(g.post_url));
  const scored = golden.filter((g) => actual.has(g.post_url));

  // Confusion matrix: rows = expected, cols = actual
  const decisions = ["INCLUDE", "EXCLUDE", "REVIEW"] as const;
  const matrix: Record<string, Record<string, number>> = {};
  for (const e of decisions) {
    matrix[e] = {};
    for (const a of decisions) matrix[e][a] = 0;
  }

  const falsePositives: Array<{ post_url: string; expected: string; expectedReason: string | null; category: string; actualConfidence: number; notes: string | null }> = [];
  const falseNegatives: Array<{ post_url: string; expected: string; actualDecision: string; actualReason: string | null; notes: string | null }> = [];
  const byExclusionReason: Record<string, { total: number; correct: number }> = {};
  const byCategory: Record<string, { total: number; correct: number; leakedToInclude: number }> = {};

  for (const g of scored) {
    const a = actual.get(g.post_url)!;
    matrix[g.expected_decision][a.decision]++;

    if (g.exclusion_reason) {
      byExclusionReason[g.exclusion_reason] ??= { total: 0, correct: 0 };
      byExclusionReason[g.exclusion_reason].total++;
      if (a.decision === g.expected_decision) byExclusionReason[g.exclusion_reason].correct++;
    }

    const category = deriveCategory(g);
    byCategory[category] ??= { total: 0, correct: 0, leakedToInclude: 0 };
    byCategory[category].total++;
    if (a.decision === g.expected_decision) byCategory[category].correct++;
    if (a.decision === "INCLUDE" && g.expected_decision !== "INCLUDE") byCategory[category].leakedToInclude++;

    // False positive (the metric that matters most): classifier said
    // INCLUDE, ground truth says it should NOT have been INCLUDE.
    if (a.decision === "INCLUDE" && g.expected_decision !== "INCLUDE") {
      falsePositives.push({
        post_url: g.post_url,
        expected: g.expected_decision,
        expectedReason: g.exclusion_reason,
        category,
        actualConfidence: a.confidence,
        notes: g.notes,
      });
    }
    // False negative: ground truth says INCLUDE, classifier said otherwise.
    if (g.expected_decision === "INCLUDE" && a.decision !== "INCLUDE") {
      falseNegatives.push({
        post_url: g.post_url,
        expected: g.expected_decision,
        actualDecision: a.decision,
        actualReason: a.exclusion_reason,
        notes: g.notes,
      });
    }
  }

  // INCLUDE precision/recall/F1 — the primary metric.
  const tp = matrix.INCLUDE.INCLUDE;
  const fp = matrix.EXCLUDE.INCLUDE + matrix.REVIEW.INCLUDE;
  const fn = matrix.INCLUDE.EXCLUDE + matrix.INCLUDE.REVIEW;
  const includePrecision = tp + fp > 0 ? tp / (tp + fp) : null;
  const includeRecall = tp + fn > 0 ? tp / (tp + fn) : null;
  const includeF1 =
    includePrecision !== null && includeRecall !== null && includePrecision + includeRecall > 0
      ? (2 * includePrecision * includeRecall) / (includePrecision + includeRecall)
      : null;

  // Macro precision/recall/F1 across all three classes, for a rounder picture.
  function classPRF(cls: string) {
    const tp_ = matrix[cls][cls];
    let fp_ = 0,
      fn_ = 0;
    for (const other of decisions) {
      if (other === cls) continue;
      fp_ += matrix[other][cls];
      fn_ += matrix[cls][other];
    }
    const p = tp_ + fp_ > 0 ? tp_ / (tp_ + fp_) : null;
    const r = tp_ + fn_ > 0 ? tp_ / (tp_ + fn_) : null;
    const f1 = p !== null && r !== null && p + r > 0 ? (2 * p * r) / (p + r) : null;
    return { p, r, f1 };
  }
  const perClass = Object.fromEntries(decisions.map((d) => [d, classPRF(d)]));

  // Confidence calibration: bucket by confidence, compare "was the FINAL
  // decision correct" rate within each bucket. A well-calibrated classifier's
  // 0.9-1.0 bucket should be right ~90-100% of the time.
  const buckets = [
    [0, 0.5],
    [0.5, 0.7],
    [0.7, 0.85],
    [0.85, 0.95],
    [0.95, 1.01],
  ] as const;
  const calibration = buckets.map(([lo, hi]) => {
    const inBucket = scored.filter((g) => {
      const c = actual.get(g.post_url)!.confidence;
      return c >= lo && c < hi;
    });
    const correct = inBucket.filter((g) => actual.get(g.post_url)!.decision === g.expected_decision).length;
    return {
      range: `${lo}-${hi}`,
      n: inBucket.length,
      accuracy: inBucket.length ? correct / inBucket.length : null,
    };
  });

  const report = {
    classifier_version: args.version,
    golden_set_size: golden.length,
    scored: scored.length,
    missing_from_classification_runs: missing.map((m) => m.post_url),
    confusion_matrix: matrix,
    include_metrics_PRIMARY: { precision: includePrecision, recall: includeRecall, f1: includeF1, tp, fp, fn },
    per_class_metrics: perClass,
    accuracy: scored.length ? scored.filter((g) => actual.get(g.post_url)!.decision === g.expected_decision).length / scored.length : null,
    by_exclusion_reason: Object.fromEntries(
      Object.entries(byExclusionReason).map(([k, v]) => [k, { ...v, accuracy: v.correct / v.total }])
    ),
    by_category: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [
        k,
        { ...v, accuracy: v.correct / v.total, false_positive_rate: v.leakedToInclude / v.total },
      ])
    ),
    confidence_calibration: calibration,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== Eval report: classifier_version=${args.version} ===`);
    console.log(`golden set: ${golden.length} posts, scored: ${scored.length}, missing (not yet classified): ${missing.length}`);
    if (missing.length) console.log(`  missing: run runClassify.ts --post-urls-file with these first`);
    console.log(`\n--- INCLUDE precision/recall (PRIMARY metric) ---`);
    console.log(`  precision: ${includePrecision?.toFixed(3) ?? "n/a"}  (${tp} correct INCLUDE / ${tp + fp} total INCLUDE calls)`);
    console.log(`  recall:    ${includeRecall?.toFixed(3) ?? "n/a"}  (${tp} found / ${tp + fn} true INCLUDE in golden set)`);
    console.log(`  f1:        ${includeF1?.toFixed(3) ?? "n/a"}`);
    console.log(`\n--- Confusion matrix (rows=expected, cols=actual) ---`);
    console.log(`             ${decisions.map((d) => d.padEnd(10)).join("")}`);
    for (const e of decisions) {
      console.log(`  ${e.padEnd(10)} ${decisions.map((a) => String(matrix[e][a]).padEnd(10)).join("")}`);
    }
    console.log(`\n--- Per-class precision/recall/F1 ---`);
    for (const d of decisions) {
      const m = perClass[d];
      console.log(`  ${d.padEnd(8)} p=${m.p?.toFixed(3) ?? "n/a"} r=${m.r?.toFixed(3) ?? "n/a"} f1=${m.f1?.toFixed(3) ?? "n/a"}`);
    }
    console.log(`\n--- Accuracy by exclusion_reason ---`);
    for (const [reason, v] of Object.entries(byExclusionReason)) {
      console.log(`  ${reason.padEnd(28)} ${v.correct}/${v.total} = ${(v.correct / v.total).toFixed(2)}`);
    }
    console.log(`\n--- By category (real_wedding = INCLUDE ground truth; others = EXCLUDE/REVIEW subtypes) ---`);
    for (const [cat, v] of Object.entries(byCategory)) {
      console.log(
        `  ${cat.padEnd(24)} n=${v.total} accuracy=${(v.correct / v.total).toFixed(2)} ` +
          `leaked_to_INCLUDE=${v.leakedToInclude} (${((v.leakedToInclude / v.total) * 100).toFixed(1)}%)`
      );
    }
    console.log(`\n--- Confidence calibration ---`);
    for (const c of calibration) {
      console.log(`  ${c.range.padEnd(10)} n=${c.n}  accuracy=${c.accuracy?.toFixed(3) ?? "n/a"}`);
    }
    console.log(`\n--- False positives (${falsePositives.length}) — WORST failure mode, review every one ---`);
    for (const f of falsePositives) {
      console.log(`  ${f.post_url}\n    expected=${f.expected}${f.expectedReason ? ` (${f.expectedReason})` : ""} category=${f.category} confidence=${f.actualConfidence}\n    notes: ${f.notes}`);
    }
    console.log(`\n--- False negatives (${falseNegatives.length}) — acceptable but worth reviewing ---`);
    for (const f of falseNegatives) {
      console.log(`  ${f.post_url}\n    actual=${f.actualDecision}${f.actualReason ? ` (${f.actualReason})` : ""}\n    notes: ${f.notes}`);
    }
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
