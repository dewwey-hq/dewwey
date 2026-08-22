import { NextRequest, NextResponse } from "next/server";
import { getVendorDetail } from "@/lib/server/vendors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
  }

  try {
    const result = await getVendorDetail(vendorId);
    if (!result) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("vendor-detail error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
