import { NextRequest, NextResponse } from "next/server";
import { getSpotCheckAgreementReport } from "@/lib/server/postVenueReview";

// GET /api/post-venue-review/spotcheck-report?reviewer=fable-structured — read-only agreement
// report (D055): for every post with a current verdict from BOTH `reviewer` (default
// 'fable-structured') and the human reviewer (LABELED_BY, 'jeremy'), returns confusion counts
// (reviewer verdict x human verdict) and agreement % overall and by candidate
// venue_anchor_source. Same data the /label/candidates?spotcheck=... page renders as a plain-text
// panel at the bottom (report.text) -- this endpoint exists so the numbers can be pulled without
// loading the review UI itself.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reviewer = searchParams.get("reviewer") ?? "fable-structured";

  try {
    const report = await getSpotCheckAgreementReport(reviewer);
    return NextResponse.json(report);
  } catch (err) {
    console.error("post-venue-review-spotcheck-report error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
