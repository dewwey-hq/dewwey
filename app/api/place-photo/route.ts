import { NextRequest, NextResponse } from "next/server";
import {
  clampPhotoWidth,
  isValidPlacePhotoName,
  resolvePlacePhotoUri,
} from "@/app/lib/place-photo";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const width = clampPhotoWidth(
    Number.parseInt(request.nextUrl.searchParams.get("w") ?? "", 10),
  );

  if (!name || !isValidPlacePhotoName(name)) {
    return NextResponse.json({ error: "Invalid photo name" }, { status: 400 });
  }

  const resolved = await resolvePlacePhotoUri(name, width);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: "Photo unavailable" },
      { status: resolved.status === 404 ? 404 : 502 },
    );
  }

  // Redirect the browser to Google's CDN — img tags follow this, and it avoids
  // server-side fetch failures against short-lived googleusercontent URLs.
  return NextResponse.redirect(resolved.photoUri, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
