import { NextRequest, NextResponse } from "next/server";
import { recordGroupVerdict, isGroupVerdict } from "@/lib/server/postVenueReview";

// POST /api/post-venue-review/group — "clear the rest of this group in one keystroke" (D055
// addendum, Shift+W / Shift+X in PostVenueReviewClient). Unlike the per-post POST /api/
// post-venue-review, this writes N verdicts (every not-yet-reviewed sibling post of one
// candidate) in a single transaction and reports back how many. Only the two verdicts that need
// no per-post input (no @handle, no wedding id) are allowed here — see recordGroupVerdict()'s doc
// comment in lib/server/postVenueReview.ts.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { candidate_id, verdict, notes } = (body ?? {}) as {
    candidate_id?: unknown;
    verdict?: unknown;
    notes?: unknown;
  };

  // Same numeric-string acceptance as the main route: pg serializes bigint as a string, so the
  // queue payload carries candidate_id as e.g. "8211" and the client echoes it back verbatim.
  const candidateId =
    typeof candidate_id === "number" && Number.isFinite(candidate_id)
      ? candidate_id
      : typeof candidate_id === "string" && /^\d+$/.test(candidate_id)
        ? Number(candidate_id)
        : null;
  if (candidateId == null) {
    return NextResponse.json({ error: "candidate_id is required" }, { status: 400 });
  }
  if (!isGroupVerdict(verdict)) {
    return NextResponse.json({ error: "verdict must be one of THIS_VENUE, NOT_WEDDING" }, { status: 400 });
  }
  const trimmedNotes = typeof notes === "string" ? notes.trim() : null;
  if (trimmedNotes && trimmedNotes.length > 500) {
    return NextResponse.json({ error: "notes must be 500 characters or fewer" }, { status: 400 });
  }
  const parsedNotes = trimmedNotes && trimmedNotes.length > 0 ? trimmedNotes : null;

  try {
    const { written, post_urls } = await recordGroupVerdict(candidateId, verdict, { notes: parsedNotes });
    return NextResponse.json({ ok: true, written, post_urls });
  } catch (err) {
    console.error("post-venue-review-group error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const isNotFound = message.includes("not found");
    return NextResponse.json({ error: message }, { status: isNotFound ? 400 : 500 });
  }
}
