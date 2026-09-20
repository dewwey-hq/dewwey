/**
 * ACQUISITION LOOP (D061) — the blind spot-check report: for one acquisition batch, compares
 * every post that has BOTH a model verdict (post_venue_verdicts, reviewed_by not 'jeremy' and not
 * like 'human%') AND a LATER human verdict (reviewed_by 'jeremy' or like 'human%', reviewed_at
 * after the model's), prints n / agreement % / the disagreements, and checks the 95% bar the plan
 * sets specifically for the model's THIS_VENUE class ("of the model's THIS_VENUE calls the human
 * labeled, what share did the human confirm") -- see the plan's "Blind spot-check" line:
 * "below 95% -> probes create nothing automatically, everything goes to /label/candidates."
 *
 * Read-only. Tolerates zero labeled pairs (prints "0 labeled so far" rather than dividing by
 * zero or erroring) -- the human labels the blind sample gradually via
 * /label/candidates?spotcheck=<batch id>, so this is expected to be re-run repeatedly as that
 * count grows.
 *
 * The agreement math itself is a pure function (computeSpotCheckAgreement below) so it can be
 * unit-tested without a database -- see acquire.test.ts.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/reportSpotCheck.ts --batch-id acq-20260919-pilot
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const OUT_DIR = new URL("../graph/tmp_analysis/", import.meta.url).pathname;

export const THIS_VENUE_PASS_BAR_PCT = 95;

export interface SpotCheckPair {
  postUrl: string;
  modelVerdict: string;
  modelConfidence: number | null;
  humanVerdict: string;
}

export interface SpotCheckAgreementResult {
  n: number;
  agreeCount: number;
  agreementPct: number | null;
  disagreements: SpotCheckPair[];
  thisVenue: {
    modelCount: number;
    confirmedCount: number;
    precisionPct: number | null;
    pass: boolean;
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Pure agreement math over already-fetched (model verdict, human verdict) pairs -- no DB access.
 * `n` = pairs.length. Overall agreement = exact verdict match (THIS_VENUE/NOT_WEDDING/
 * OTHER_VENUE/etc. all count the same way: does the human's verdict equal the model's). The
 * THIS_VENUE precision bar is narrower and is what Gate 0's 95% threshold actually applies to:
 * of the pairs where the MODEL said THIS_VENUE, what share did the human also label THIS_VENUE
 * (i.e. the model's false-positive rate on the class that auto-creates a wedding). `pass` is
 * false (not null) when there are zero THIS_VENUE model calls to check -- an empty sample never
 * counts as passing the bar.
 */
export function computeSpotCheckAgreement(pairs: SpotCheckPair[]): SpotCheckAgreementResult {
  const n = pairs.length;
  const disagreements = pairs.filter((p) => p.modelVerdict !== p.humanVerdict);
  const agreeCount = n - disagreements.length;
  const agreementPct = n > 0 ? round1((agreeCount / n) * 100) : null;

  const thisVenueCalls = pairs.filter((p) => p.modelVerdict === "THIS_VENUE");
  const thisVenueConfirmed = thisVenueCalls.filter((p) => p.humanVerdict === "THIS_VENUE");
  const precisionPct = thisVenueCalls.length > 0 ? round1((thisVenueConfirmed.length / thisVenueCalls.length) * 100) : null;

  return {
    n,
    agreeCount,
    agreementPct,
    disagreements,
    thisVenue: {
      modelCount: thisVenueCalls.length,
      confirmedCount: thisVenueConfirmed.length,
      precisionPct,
      pass: precisionPct !== null && precisionPct >= THIS_VENUE_PASS_BAR_PCT,
    },
  };
}

function renderMarkdown(batchId: string, result: SpotCheckAgreementResult): string {
  if (result.n === 0) {
    return `# Blind spot-check report -- ${batchId}\n\n0 labeled so far -- no post in this batch has both a model verdict and a later human verdict yet. Re-run once /label/candidates?spotcheck=${batchId} has some labels in.\n`;
  }

  const disagreementLines =
    result.disagreements.length > 0
      ? result.disagreements
          .map(
            (d) =>
              `| ${d.postUrl} | ${d.modelVerdict}${d.modelConfidence != null ? ` (${Math.round(d.modelConfidence * 100)}%)` : ""} | ${d.humanVerdict} |`
          )
          .join("\n")
      : "| (none) | | |";

  const verdict = result.thisVenue.pass ? "PASS" : "FAIL";

  return `# Blind spot-check report -- ${batchId}

## Overall

- Labeled pairs (n): **${result.n}**
- Agreement (human verdict == model verdict): **${result.agreeCount} / ${result.n} = ${result.agreementPct}%**

## THIS_VENUE bar (Gate 0: >= ${THIS_VENUE_PASS_BAR_PCT}%)

Of the model's THIS_VENUE calls the human has labeled, what share did the human confirm:

- Model THIS_VENUE calls labeled by the human: **${result.thisVenue.modelCount}**
- Human confirmed THIS_VENUE: **${result.thisVenue.confirmedCount}**
- Precision: **${result.thisVenue.precisionPct ?? "n/a"}%**
- **${verdict}**${result.thisVenue.modelCount === 0 ? " (no model THIS_VENUE calls labeled yet -- not a real pass)" : ""}

## Disagreements (model verdict vs. human verdict)

| post_url | model | human |
|---|---|---|
${disagreementLines}
`;
}

function usage(): never {
  console.error(
    "[report-spot-check] Usage:\n" + "  bun run scripts/acquire/reportSpotCheck.ts --batch-id acq-20260919-pilot\n"
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf("--batch-id");
  const batchId = batchIdx === -1 ? null : args[batchIdx + 1];
  if (!batchId) usage();

  const pool = getPool();
  try {
    const { rows } = await pool.query<{
      post_url: string;
      model_verdict: string;
      model_confidence: number | null;
      human_verdict: string;
    }>(
      `with runs as (
         select r.id from ops.crawl_runs r where r.batch_id = $1
       ),
       first_observed as (
         select distinct p.url as post_url
         from ops.post_observations o
         join runs r on r.id = o.run_id
         join posts p on p.id = o.post_id
         where o.is_first
       ),
       model_verdicts as (
         select distinct on (post_url) post_url, verdict as model_verdict, reviewed_at as model_reviewed_at
         from post_venue_verdicts
         where reviewed_by <> 'jeremy' and reviewed_by not like 'human%'
         order by post_url, reviewed_at desc
       ),
       human_verdicts as (
         select distinct on (post_url) post_url, verdict as human_verdict, reviewed_at as human_reviewed_at
         from post_venue_verdicts
         where reviewed_by = 'jeremy' or reviewed_by like 'human%'
         order by post_url, reviewed_at desc
       )
       select fo.post_url, mv.model_verdict,
              (
                select per.confidence from post_extraction_runs per
                where per.post_url = fo.post_url
                order by per.created_at desc
                limit 1
              ) as model_confidence,
              hv.human_verdict
       from first_observed fo
       join model_verdicts mv on mv.post_url = fo.post_url
       join human_verdicts hv on hv.post_url = fo.post_url and hv.human_reviewed_at > mv.model_reviewed_at
       order by fo.post_url`,
      [batchId]
    );

    const pairs: SpotCheckPair[] = rows.map((r) => ({
      postUrl: r.post_url,
      modelVerdict: r.model_verdict,
      modelConfidence: r.model_confidence != null ? Number(r.model_confidence) : null,
      humanVerdict: r.human_verdict,
    }));

    const result = computeSpotCheckAgreement(pairs);
    const md = renderMarkdown(batchId, result);
    console.log(md);

    const today = new Date().toISOString().slice(0, 10);
    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = `${OUT_DIR}spot_check_${batchId}_${today}.md`;
    writeFileSync(outPath, md);
    console.log(`[report-spot-check] wrote ${outPath}`);
  } finally {
    await closePool();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
