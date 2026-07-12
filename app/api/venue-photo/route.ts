import { NextRequest, NextResponse } from "next/server";
import {
  clampPhotoCount,
  clampPhotoIndex,
  clampPhotoWidth,
  isValidPlaceId,
  resolveVenuePhotoUri,
  resolveVenuePhotoUris,
} from "@/app/lib/venue-photos-server";

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("place");
  const width = clampPhotoWidth(
    Number.parseInt(request.nextUrl.searchParams.get("w") ?? "", 10),
  );
  const index = clampPhotoIndex(
    Number.parseInt(request.nextUrl.searchParams.get("i") ?? "", 10),
  );
  const count = clampPhotoCount(
    Number.parseInt(request.nextUrl.searchParams.get("count") ?? "", 10),
  );
  const format = request.nextUrl.searchParams.get("format");

  if (!placeId || !isValidPlaceId(placeId)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  if (format === "json") {
    const urls = await resolveVenuePhotoUris(placeId, width, count);
    if (urls.length === 0) {
      return NextResponse.json({ error: "Photos unavailable" }, { status: 404 });
    }
    return NextResponse.json(
      { urls },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  }

  const photoUri = await resolveVenuePhotoUri(placeId, width, index);
  if (!photoUri) {
    return NextResponse.json({ error: "Photo unavailable" }, { status: 404 });
  }

  return NextResponse.redirect(photoUri, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
