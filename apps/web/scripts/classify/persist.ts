import type { Pool } from "pg";
import type { ClassificationResult } from "./contract";
import type { AccountClassificationResult } from "./accountClassifier";
import type { CandidateScoreResult } from "./candidateScore";

export async function saveClassification(pool: Pool, r: ClassificationResult, inputHash: string) {
  await pool.query(
    `insert into post_classification_runs
       (post_url, classifier_version, prompt_version, model, tier, decision, confidence,
        is_wedding, is_real_wedding, is_chicago, is_credible_source, exclusion_reason,
        evidence, input_hash, cost_usd, latency_ms, posted_at, event_date, event_date_confidence)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      r.post_url,
      r.classifier_version,
      r.prompt_version ?? null,
      r.model ?? null,
      r.tier,
      r.decision,
      r.confidence,
      r.is_wedding,
      r.is_real_wedding,
      r.is_chicago,
      r.is_credible_source,
      r.exclusion_reason,
      JSON.stringify(r.evidence),
      inputHash,
      r.cost_usd ?? null,
      r.latency_ms ?? null,
      r.posted_at ?? null,
      r.event_date ?? null,
      r.event_date_confidence ?? null,
    ]
  );
}

export async function saveAccountClassification(pool: Pool, r: AccountClassificationResult) {
  await pool.query(
    `insert into account_classification_runs
       (username, classifier_version, prompt_version, model, archetype, confidence,
        is_wedding_industry, evidence)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      r.username,
      r.classifier_version,
      r.prompt_version,
      r.model,
      r.archetype,
      r.confidence,
      r.is_wedding_industry,
      JSON.stringify(r.evidence),
    ]
  );
}

/** Upsert on (post_url, candidate_generation_version) — deterministic/free,
 * so a rerun under the SAME version is an idempotent refresh (not new
 * history); a different candidate_generation_version inserts fresh rows,
 * preserving the prior version's scores untouched. */
export async function saveCandidateScore(pool: Pool, r: CandidateScoreResult) {
  await pool.query(
    `insert into candidate_scores
       (post_url, candidate_generation_version, score, vendor_role_count, vendor_roles,
        has_photographer, has_venue, has_planner, has_wedding_keyword, has_chicago_hint,
        has_styled_editorial_language, has_promo_language, has_engagement_language, scored_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
     on conflict (post_url, candidate_generation_version) do update set
       score = excluded.score,
       vendor_role_count = excluded.vendor_role_count,
       vendor_roles = excluded.vendor_roles,
       has_photographer = excluded.has_photographer,
       has_venue = excluded.has_venue,
       has_planner = excluded.has_planner,
       has_wedding_keyword = excluded.has_wedding_keyword,
       has_chicago_hint = excluded.has_chicago_hint,
       has_styled_editorial_language = excluded.has_styled_editorial_language,
       has_promo_language = excluded.has_promo_language,
       has_engagement_language = excluded.has_engagement_language,
       scored_at = now()`,
    [
      r.post_url,
      r.candidate_generation_version,
      r.score,
      r.vendor_role_count,
      r.vendor_roles,
      r.has_photographer,
      r.has_venue,
      r.has_planner,
      r.has_wedding_keyword,
      r.has_chicago_hint,
      r.has_styled_editorial_language,
      r.has_promo_language,
      r.has_engagement_language,
    ]
  );
}

/** post_url -> input_hash for the LATEST run under this classifier_version,
 * so a rerun can skip posts whose inputs haven't changed (idempotent). */
export async function loadExistingHashes(
  pool: Pool,
  classifierVersion: string
): Promise<Map<string, string>> {
  const { rows } = await pool.query(
    `select distinct on (post_url) post_url, input_hash
     from post_classification_runs
     where classifier_version = $1
     order by post_url, classified_at desc`,
    [classifierVersion]
  );
  const out = new Map<string, string>();
  for (const row of rows) out.set(row.post_url, row.input_hash);
  return out;
}
