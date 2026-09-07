import { NextRequest, NextResponse } from "next/server";
import { getQueueBatch, recordLabel, isHumanLabelDecision } from "@/lib/server/labeling";

// GET /api/labels?limit=5 — the client's prefetch top-up. Read-only, no
// write side effects; safe to call repeatedly while the local queue buffer
// runs low.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "5", 10) || 5, 1), 20);

  try {
    const items = await getQueueBatch(limit);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("labels-queue error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/labels — one labeling action. Deliberately does NOT return the
// next queue item (see lib/server/labeling.ts's doc comment / the plan):
// the client already prefetched ahead via GET, so a write never blocks
// advancing to the next post.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { post_url, decision, client_ms, notes } = (body ?? {}) as {
    post_url?: unknown;
    decision?: unknown;
    client_ms?: unknown;
    notes?: unknown;
  };

  if (typeof post_url !== "string" || post_url.length === 0) {
    return NextResponse.json({ error: "post_url is required" }, { status: 400 });
  }
  if (!isHumanLabelDecision(decision)) {
    return NextResponse.json(
      { error: "decision must be one of WEDDING, NOT_WEDDING, UNSURE, UNVIEWABLE, SKIP" },
      { status: 400 }
    );
  }
  const clientMs = typeof client_ms === "number" && Number.isFinite(client_ms) ? client_ms : null;
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
  const notesValue = trimmedNotes.length > 0 ? trimmedNotes : null;

  try {
    await recordLabel(post_url, decision, { clientMs, notes: notesValue });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("labels-record error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
