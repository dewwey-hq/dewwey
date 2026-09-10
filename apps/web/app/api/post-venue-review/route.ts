import { NextRequest, NextResponse } from "next/server";
import {
  getPostReviewQueue,
  getPostReviewProgress,
  getSpotCheckQueue,
  getPostReviewItemsByPostUrls,
  recordPostVerdict,
  isPostVenueVerdict,
} from "@/lib/server/postVenueReview";

// GET /api/post-venue-review?limit=5 — queue + progress in one call (the page's initial load and
// prefetch top-up both use this). Read-only. Same conventions as /api/labels and the
// (now-replaced) /api/candidate-review.
//
// D055: GET /api/post-venue-review?spotcheck=fable-structured&n=40 — a separate mode, blind
// spot-check of a reviewer's on-behalf verdicts (see getSpotCheckQueue's doc comment in
// lib/server/postVenueReview.ts). `spotcheck`'s value IS the target reviewer name (matches the
// page-level ?spotcheck=fable-structured convention); `n` is the sample size, default 40, capped
// at 200. No `progress` in this mode's response -- the client tracks its own session-local
// spot-check tally instead, and the items themselves carry no trace of the target reviewer's
// verdict/notes.
//
// Phase 2 (D055): GET /api/post-venue-review?post=<shortcode>[,<shortcode>...] — direct-open mode,
// serving exactly those post(s) (matches the page-level ?post= convention), in the order given,
// regardless of any reviewer's existing verdict -- see getPostReviewItemsByPostUrls's doc comment.
// No `progress` in this mode's response either, same reasoning as spotcheck.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const spotcheckReviewer = searchParams.get("spotcheck");
  const postParam = searchParams.get("post");

  if (postParam) {
    const shortcodes = postParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const postUrls = shortcodes.map((sc) => `https://www.instagram.com/p/${sc}/`);
    try {
      const items = await getPostReviewItemsByPostUrls(postUrls);
      return NextResponse.json({ items, mode: "post", requested: shortcodes.length, found: items.length });
    } catch (err) {
      console.error("post-venue-review-post error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  if (spotcheckReviewer) {
    const n = Math.min(Math.max(parseInt(searchParams.get("n") ?? "40", 10) || 40, 1), 200);
    try {
      const items = await getSpotCheckQueue(n, { targetReviewer: spotcheckReviewer });
      return NextResponse.json({ items, mode: "spotcheck", target_reviewer: spotcheckReviewer, n });
    } catch (err) {
      console.error("post-venue-review-spotcheck error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "5", 10) || 5, 1), 20);

  try {
    const [items, progress] = await Promise.all([getPostReviewQueue(limit), getPostReviewProgress()]);
    return NextResponse.json({ items, progress });
  } catch (err) {
    console.error("post-venue-review-queue error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/post-venue-review — one post-level venue verdict. Deliberately does NOT return the
// next queue item: the client already prefetched ahead via GET.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    post_url,
    candidate_id,
    verdict,
    corrected_venue_username,
    duplicate_of_wedding_id,
    client_ms,
    notes,
  } = (body ?? {}) as {
    post_url?: unknown;
    candidate_id?: unknown;
    verdict?: unknown;
    corrected_venue_username?: unknown;
    duplicate_of_wedding_id?: unknown;
    client_ms?: unknown;
    notes?: unknown;
  };

  if (typeof post_url !== "string" || post_url.length === 0) {
    return NextResponse.json({ error: "post_url is required" }, { status: 400 });
  }
  const candidateId =
    // pg serializes bigint as a string, so the queue payload carries candidate_id as "8211" and the
    // client echoes it back verbatim -- accept numeric strings too (every POST 400'd on this the
    // first night, D055).
    typeof candidate_id === "number" && Number.isFinite(candidate_id)
      ? candidate_id
      : typeof candidate_id === "string" && /^\d+$/.test(candidate_id)
        ? Number(candidate_id)
        : null;
  if (candidateId == null) {
    return NextResponse.json({ error: "candidate_id is required" }, { status: 400 });
  }
  if (!isPostVenueVerdict(verdict)) {
    return NextResponse.json(
      { error: "verdict must be one of THIS_VENUE, OTHER_VENUE, NOT_WEDDING, DUPLICATE, UNSURE, SKIP" },
      { status: 400 }
    );
  }
  const correctedVenueUsername =
    typeof corrected_venue_username === "string" && corrected_venue_username.trim().length > 0
      ? corrected_venue_username.trim()
      : null;
  const duplicateOfWeddingId =
    typeof duplicate_of_wedding_id === "number" && Number.isFinite(duplicate_of_wedding_id)
      ? duplicate_of_wedding_id
      : null;
  const clientMs = typeof client_ms === "number" && Number.isFinite(client_ms) ? client_ms : null;
  // D055 addendum: optional reviewer note (a structured N reason, or a free note via the / key).
  // Trimmed, capped at 500 chars (checked after trim so trailing whitespace can't false-positive
  // the cap), empty -> null -- same permissive shape as corrected_venue_username above.
  const trimmedNotes = typeof notes === "string" ? notes.trim() : null;
  if (trimmedNotes && trimmedNotes.length > 500) {
    return NextResponse.json({ error: "notes must be 500 characters or fewer" }, { status: 400 });
  }
  const parsedNotes = trimmedNotes && trimmedNotes.length > 0 ? trimmedNotes : null;

  try {
    await recordPostVerdict(post_url, candidateId, verdict, {
      correctedVenueUsername,
      duplicateOfWeddingId,
      clientMs,
      notes: parsedNotes,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("post-venue-review-record error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const isNotFound = message.includes("not found");
    return NextResponse.json({ error: message }, { status: isNotFound ? 400 : 500 });
  }
}
