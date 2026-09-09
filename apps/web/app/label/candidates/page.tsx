import { getPostReviewQueue, getPostReviewProgress } from "@/lib/server/postVenueReview";
import { PostVenueReviewClient } from "@/app/components/PostVenueReviewClient";

// D055 (2026-09-08): post-per-screen wedding-venue review, replacing the wedding-CANDIDATE-level
// review that used to live here (0 decisions ever recorded -- the user tried it and said "this ui
// is confusing... lets design something better for labeling"). One post per screen, venue context
// attached, wedding assembled server-side from per-post verdicts (see
// lib/server/postVenueReview.ts / pipeline/schema.sql's post_venue_verdicts). Same "no auth"
// posture as /label (see CLAUDE.md -- the old password gate was deliberately deleted).
export const dynamic = "force-dynamic";

export default async function PostVenueReviewPage() {
  const [items, progress] = await Promise.all([getPostReviewQueue(5), getPostReviewProgress()]);

  return <PostVenueReviewClient initialItems={items} initialProgress={progress} />;
}
