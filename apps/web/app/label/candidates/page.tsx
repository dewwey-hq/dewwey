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
  // D061: /label/candidates?batch=<acquisition batch id> — scopes the NORMAL (still
  // "no current verdict from any reviewer") queue to posts first-observed in that batch
  // (getPostReviewQueue's `batch` option), so a fresh tick's handful of undecided posts don't sit
  // behind hundreds of older ones under the queue's oldest-first ordering. Mutually exclusive
  // with `spotcheck` (checked first below) -- spotcheck wins, per the same "explicit request beats
  // the general queue" precedence `post` already has over both.
  const batchParam = typeof params.batch === "string" ? params.batch : null;

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

    // D061: /label/candidates?spotcheck=<acquisition batch id> (e.g. acq-20260919-pilot) — the
    // NEW batch-scoped blind spot-check (getPostReviewQueue's spotCheckBatch option, over
    // ops.crawl_runs/post_observations), distinct from the D055 reviewer-scoped mode below (no
    // reviewed_by value starts with "acq-", so the two conventions never collide). No
    // getSpotCheckAgreementReport call here -- that report is specific to the D055
    // reviewer-vs-human comparison over the old structural-only candidate pool; the equivalent
    // for a batch is scripts/acquire/reportSpotCheck.ts, run separately. The banner above the
    // client component (rather than a change to PostVenueReviewClient itself) is what surfaces
    // "Blind spot-check · <batch id> · N remaining" to the reviewer -- PostVenueReviewClient's
    // own `spotCheck.targetReviewer` prop carries the batch id unmodified so its existing top-up
    // fetch (`?spotcheck=<value>&n=5`, handled by the API route above) keeps working as-is.
    if (spotcheckParam.startsWith("acq-")) {
      const items = await getPostReviewQueue(n, { spotCheckBatch: spotcheckParam });
      return (
        <>
          <div className="mx-auto max-w-3xl px-4 pt-4 text-xs font-medium text-purple-800">
            Blind spot-check · {spotcheckParam} · {items.length} remaining
            <span className="block font-normal text-purple-700/80">
              This sample includes the model&apos;s NOT_WEDDING and OTHER_VENUE calls on purpose. A styled
              shoot or engagement you reject here is an agreement with the model, not a leak.
            </span>
          </div>
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
          />
        </>
      );
    }

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

  if (batchParam) {
    const nRaw = typeof params.n === "string" ? parseInt(params.n, 10) : NaN;
    const n = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(nRaw, MAX_SPOTCHECK_N) : DEFAULT_SPOTCHECK_N;
    const items = await getPostReviewQueue(n, { batch: batchParam });
    // Synthetic progress, same shape/reasoning as the spot-check modes above: this queue is
    // scoped to one batch, so the global posts_total/remaining_* figures getPostReviewProgress()
    // computes would be misleading here (they'd count the other ~469 unrelated undecided posts).
    // Note: PostVenueReviewClient's own top-up fetch (`items.length < 3`) is NOT batch-aware --
    // it calls the plain unscoped `/api/post-venue-review?limit=5` once this batch's own items run
    // low, same as the ordinary queue. Out of scope to fix without touching that client component;
    // requesting a generous `n` up front (default 40) means a batch this small (5 today) loads
    // entirely on the first render, so it won't matter in practice for the pilot.
    return (
      <>
        <div className="mx-auto max-w-3xl px-4 pt-4 text-xs font-medium text-blue-800">
          Batch · {batchParam} · {items.length} remaining
        </div>
        <PostVenueReviewClient
          initialItems={items}
          initialProgress={{
            posts_total: items.length,
            posts_reviewed: 0,
            remaining_confirmed: 0,
            remaining_ambiguous: 0,
            candidates_total: 0,
            candidates_complete: 0,
            by_verdict: {},
          }}
        />
      </>
    );
  }

  const [items, progress] = await Promise.all([getPostReviewQueue(5), getPostReviewProgress()]);

  return <PostVenueReviewClient initialItems={items} initialProgress={progress} />;
}
