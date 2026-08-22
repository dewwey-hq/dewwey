import { NextRequest, NextResponse } from "next/server";
import { searchVendors } from "@/lib/server/vendors";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const result = await searchVendors({
      category: sp.get("category"),
      city: sp.get("city") || "Chicago",
      q: sp.get("q") || sp.get("search") || "",
      limit: parseInt(sp.get("limit") || "20", 10),
      offset: parseInt(sp.get("offset") || "0", 10),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RangeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("vendor-search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
