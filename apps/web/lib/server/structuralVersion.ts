/**
 * Single source of truth for the `structural` evidence-source's clustering_version (D055
 * "squeeze the 47k"). Shared between apps/web/scripts/graph/runJeremyWeddingClustering.ts
 * (excluded from the Next.js/tsc type-check scope, apps/web/tsconfig.json's
 * "exclude": ["scripts"] -- and a build-time script, not app code) and
 * lib/server/candidateReview.ts (part of the web app, backs /label/candidates). Living here
 * keeps the app from importing a scripts/ file into its checked/bundled graph, while the
 * clustering script re-exports this same value so the two never drift into separate literals.
 *
 * v1 ("structural-v1") was the D055 Phase 0 sizing run, before the eligibility/couple-regex/
 * merge-veto precision fixes below. Those fixes are a real behavior change to what counts as
 * eligible and how candidates merge, so it's a new version rather than a silent rewrite of v1's
 * candidates -- v1's candidates must be explicitly deleted (operator's job) before a real v2
 * clustering run, same "explicit new version, not a silent behavior change" discipline as every
 * other clustering_version in this pipeline (see pipeline/schema.sql's jeremy_wedding_candidates
 * comment).
 */
export const STRUCTURAL_CLUSTERING_VERSION = "structural-v2";
