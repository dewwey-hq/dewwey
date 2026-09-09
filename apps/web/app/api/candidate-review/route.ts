import { NextRequest, NextResponse } from "next/server";
import { getCandidateQueue, getCandidateProgress, recordCandidateDecision, isCandidateDecision } from "@/lib/server/candidateReview";

// GET /api/candidate-review?limit=5 — queue + progress in one call (the candidate page's initial
// load and prefetch top-up both use this). Read-only.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "5", 10) || 5, 1), 20);

  try {
    const [items, progress] = await Promise.all([getCandidateQueue(limit), getCandidateProgress()]);
    return NextResponse.json({ items, progress });
  } catch (err) {
    console.error("candidate-review-queue error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/candidate-review — one candidate-level review decision. Same shape/conventions as
// /api/labels: deliberately does NOT return the next queue item, since the client already
// prefetched ahead via GET.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    candidate_id,
    decision,
    corrected_venue_username,
    duplicate_of_wedding_id,
    notes,
    client_ms,
  } = (body ?? {}) as {
    candidate_id?: unknown;
    decision?: unknown;
    corrected_venue_username?: unknown;
    duplicate_of_wedding_id?: unknown;
    notes?: unknown;
    client_ms?: unknown;
  };

  const candidateId = typeof candidate_id === "number" && Number.isFinite(candidate_id) ? candidate_id : null;
  if (candidateId == null) {
    return NextResponse.json({ error: "candidate_id is required" }, { status: 400 });
  }
  if (!isCandidateDecision(decision)) {
    return NextResponse.json(
      { error: "decision must be one of CONFIRM, WRONG_VENUE, NOT_WEDDING, DUPLICATE, UNSURE, SKIP" },
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
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
  const notesValue = trimmedNotes.length > 0 ? trimmedNotes : null;

  try {
    await recordCandidateDecision(candidateId, decision, {
      correctedVenueUsername,
      duplicateOfWeddingId,
      notes: notesValue,
      clientMs,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("candidate-review-record error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    // A not-found corrected_venue_username is a client input error, not a server fault --
    // surfaced as 400 so the UI can show it inline rather than a generic failure toast.
    const isNotFound = message.includes("not found in accounts");
    return NextResponse.json({ error: message }, { status: isNotFound ? 400 : 500 });
  }
}
