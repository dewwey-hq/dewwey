import { getCandidateQueue, getCandidateProgress } from "@/lib/server/candidateReview";
import { CandidateReviewClient } from "@/app/components/CandidateReviewClient";

// D055 Phase 1 step 8: wedding-CANDIDATE-level review, one decision covering all of a
// structural-v1 candidate's posts (venue right? Chicago? real wedding? duplicate?) -- the
// existing post-level /label flow (app/label/page.tsx) is unchanged and stays live for
// calibration; this is a second, independent review surface. Same "no auth" posture as /label
// (see CLAUDE.md -- the old password gate was deliberately deleted).
export const dynamic = "force-dynamic";

export default async function CandidateReviewPage() {
  const [items, progress] = await Promise.all([getCandidateQueue(5), getCandidateProgress()]);

  return <CandidateReviewClient initialItems={items} initialProgress={progress} />;
}
