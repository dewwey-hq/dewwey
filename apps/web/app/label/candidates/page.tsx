import {
  getPostReviewQueue,
  getPostReviewProgress,
  getSpotCheckQueue,
  getSpotCheckAgreementReport,
  getPostReviewItemsByPostUrls,
} from "@/lib/server/postVenueReview";
import { PostVenueReviewClient } from "@/app/components/PostVenueReviewClient";

// D055 (2026-09-08): post-per-screen wedding-venue review, replacing the wedding-CANDIDATE-level
// review that used to live here (0 decisions ever recorded -- the user tried it and said "this ui
// is confusing... lets design something better for labeling"). One post per screen, venue context
// attached, wedding assembled server-side from per-post verdicts (see
// lib/server/postVenueReview.ts / pipeline/schema.sql's post_venue_verdicts). Same "no auth"
// posture as /label (see CLAUDE.md -- the old password gate was deliberately deleted).
export const dynamic = "force-dynamic";

const DEFAULT_SPOTCHECK_N = 40;
const MAX_SPOTCHECK_N = 200;

// D055: /label/candidates?spotcheck=fable-structured&n=40 — blind spot-check mode, a random
// sample of posts the named reviewer already cleared that the human hasn't touched yet (see
// getSpotCheckQueue's doc comment). The agreement report (fable vs human, so far) renders as a
// plain-text panel at the bottom of the page in this mode.
//
// Phase 2 (D055): /label/candidates?post=<shortcode>[,<shortcode>...] — direct-open mode, serving
// exactly those post(s) regardless of existing verdicts (see getPostReviewItemsByPostUrls's doc
// comment) -- how the human corrects an earlier verdict of their own, or works a handed-off
// correction list. Checked before spotcheck: the two modes are mutually exclusive, `post` wins.
export default async function PostVenueReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const spotcheckParam = typeof params.spotcheck === "string" ? params.spotcheck : null;
  const postParam = typeof params.post === "string" ? params.post : null;

  if (postParam) {
    const shortcodes = postParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const postUrls = shortcodes.map((sc) => `https://www.instagram.com/p/${sc}/`);
    const items = await getPostReviewItemsByPostUrls(postUrls);

    return (
      <PostVenueReviewClient
        initialItems={items}
        initialProgress={{
          posts_total: shortcodes.length,
          posts_reviewed: 0,
          remaining_confirmed: 0,
          remaining_ambiguous: 0,
          candidates_total: 0,
          candidates_complete: 0,
          by_verdict: {},
        }}
        directMode={{ active: true, requested: shortcodes.length }}
      />
    );
  }

  if (spotcheckParam) {
    const nRaw = typeof params.n === "string" ? parseInt(params.n, 10) : NaN;
    const n = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(nRaw, MAX_SPOTCHECK_N) : DEFAULT_SPOTCHECK_N;
    const [items, report] = await Promise.all([
      getSpotCheckQueue(n, { targetReviewer: spotcheckParam }),
      getSpotCheckAgreementReport(spotcheckParam),
    ]);

    return (
      <PostVenueReviewClient
        initialItems={items}
        initialProgress={{
          posts_total: n,
          posts_reviewed: 0,
          remaining_confirmed: 0,
          remaining_ambiguous: 0,
          candidates_total: 0,
          candidates_complete: 0,
          by_verdict: {},
        }}
        spotCheck={{ active: true, targetReviewer: spotcheckParam, n }}
        spotCheckReport={report}
      />
    );
  }

  const [items, progress] = await Promise.all([getPostReviewQueue(5), getPostReviewProgress()]);

  return <PostVenueReviewClient initialItems={items} initialProgress={progress} />;
}
