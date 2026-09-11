/**
 * D057 candidate ("go through Ben's posts and make sure they pass our bar for real credible
 * documented wedding too"): pure per-wedding retire/keep/human decision -- no DB, no network,
 * same "pure logic separate from the DB-wired script" split as scripts/classify/escalation.ts
 * and extractPrompt.ts's decideVerdictWrite. auditBenWeddings.ts wires this to the DB: `posts`
 * verdicts come from post_extraction_runs (pool='ben-weddings', runExtract.ts --mode
 * ben-weddings) and human_post_labels_current; `venueCreditCount` from
 * wedding_vendors.role='venue'; `hasCoupleOrParticipant` from wedding_participants plus a
 * couple-name regex over captions; `hasWeddingWord` from a wedding-word regex over captions.
 *
 * Rules (D057 plan, "Ben's crawl audit" -- see the plan file's "Decision rule per wedding"):
 *   KEEP (checked first -- a human WEDDING label always wins over any retire signal):
 *     - any post has a human WEDDING label, OR
 *     - any post has a model verdict THIS_VENUE at confidence >= 0.8.
 *   RETIRE:
 *     - every post is confirmed NOT_WEDDING -- each post needs a human NOT_WEDDING label OR a
 *       model verdict NOT_WEDDING at confidence >= 0.9 (mixing human/model per post is fine); OR
 *     - the wedding has >=3 venue credits (a roundup / partner-list post crediting several
 *       venues) AND no couple/participant signal AND no wedding word anywhere in its captions.
 *   Everything else -> HUMAN (the /label/candidates review queue).
 */

export type WeddingDecision = "retire" | "keep" | "human";

export type PostVerdict = "THIS_VENUE" | "OTHER_VENUE" | "NOT_WEDDING" | "UNSURE";

export interface PostSignal {
  /** post_extraction_runs.verdict for this post's effective (escalated-if-present) run, or null
   *  when no pool='ben-weddings' run exists yet for it. */
  verdict: PostVerdict | null;
  /** post_extraction_runs.confidence for the same run, or null alongside a null verdict. */
  confidence: number | null;
  /** human_post_labels_current.decision, narrowed to the two content judgments this rule cares
   *  about (UNSURE/UNVIEWABLE/SKIP are neither a keep nor a retire signal -- pass null for those). */
  humanLabel: "WEDDING" | "NOT_WEDDING" | null;
}

export interface DecideWeddingInput {
  posts: PostSignal[];
  /** Count of distinct wedding_vendors rows with role='venue' for this wedding -- >1 means more
   *  than one venue was credited on the wedding's posts (a roundup / partner-list signal). */
  venueCreditCount: number;
  /** True when the wedding has a wedding_participants row, OR any of its captions match a
   *  couple-name-shaped regex (e.g. "Sarah & Mike"). */
  hasCoupleOrParticipant: boolean;
  /** True when any of the wedding's post captions contain an explicit wedding word (wedding,
   *  bride, groom, married, newlywed(s), "tied the knot", "Mr & Mrs"). */
  hasWeddingWord: boolean;
}

export interface WeddingDecisionResult {
  decision: WeddingDecision;
  reason: string;
}

const NOT_WEDDING_MODEL_THRESHOLD = 0.9;
const THIS_VENUE_MODEL_THRESHOLD = 0.8;
const ROUNDUP_VENUE_CREDIT_THRESHOLD = 3;

function isConfirmedNotWedding(p: PostSignal): boolean {
  return p.humanLabel === "NOT_WEDDING" || (p.verdict === "NOT_WEDDING" && (p.confidence ?? 0) >= NOT_WEDDING_MODEL_THRESHOLD);
}

export function decideWedding(input: DecideWeddingInput): WeddingDecisionResult {
  const { posts, venueCreditCount, hasCoupleOrParticipant, hasWeddingWord } = input;

  // KEEP is checked FIRST -- a human WEDDING label always wins over a retire signal, even one
  // that would otherwise fire (e.g. a roundup post with >=3 venue credits that a human has
  // separately confirmed really is this couple's wedding).
  if (posts.some((p) => p.humanLabel === "WEDDING")) {
    return { decision: "keep", reason: "a post has a human WEDDING label" };
  }
  if (posts.some((p) => p.verdict === "THIS_VENUE" && (p.confidence ?? 0) >= THIS_VENUE_MODEL_THRESHOLD)) {
    return {
      decision: "keep",
      reason: `a post has model verdict THIS_VENUE at confidence >= ${THIS_VENUE_MODEL_THRESHOLD}`,
    };
  }

  if (posts.length > 0 && posts.every(isConfirmedNotWedding)) {
    return {
      decision: "retire",
      reason: "every post is NOT_WEDDING (model confidence >= 0.9 or a human NOT_WEDDING label)",
    };
  }

  if (venueCreditCount >= ROUNDUP_VENUE_CREDIT_THRESHOLD && !hasCoupleOrParticipant && !hasWeddingWord) {
    return {
      decision: "retire",
      reason:
        `${venueCreditCount} venue credits (roundup/partner-list) with no couple/participant ` +
        `signal and no wedding word in any caption`,
    };
  }

  return { decision: "human", reason: "no retire or keep signal met -- needs human review" };
}
