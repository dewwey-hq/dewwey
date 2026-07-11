import { NextRequest, NextResponse } from "next/server";
import {
  clampPhotoIndex,
  clampPhotoWidth,
  isValidPlaceId,
  isValidPlacePhotoName,
  resolveCachedPhotoUri,
  resolvePlacePhotoUri,
} from "@/app/lib/place-photo";

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("place");
  const photoName = request.nextUrl.searchParams.get("name");
  const width = clampPhotoWidth(
    Number.parseInt(request.nextUrl.searchParams.get("w") ?? "", 10),
  );
  const index = clampPhotoIndex(
    Number.parseInt(request.nextUrl.searchParams.get("i") ?? "", 10),
  );

  let resolved;
  if (placeId && isValidPlaceId(placeId)) {
    resolved = await resolvePlacePhotoUri(placeId, width, index);
  } else if (photoName && isValidPlacePhotoName(photoName)) {
    resolved = await resolveCachedPhotoUri(photoName, width);
  } else {
    return NextResponse.json({ error: "Invalid photo request" }, { status: 400 });
  }

  if (!resolved.ok) {
    return NextResponse.json(
      { error: "Photo unavailable" },
      { status: resolved.status === 404 ? 404 : 502 },
    );
  }

  return NextResponse.redirect(resolved.photoUri, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
