import { NextRequest, NextResponse } from "next/server";
import {
  clampPhotoCount,
  clampPhotoIndex,
  clampPhotoWidth,
  hasServerGoogleApiKey,
  isValidPlaceId,
  resolveVenuePhotoUri,
  resolveVenuePhotoUris,
} from "@/app/lib/venue-photos-server";
import { PLACE_PHOTO_URI_CACHE_CONTROL } from "@/app/lib/place-photo-cache";

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

  if (!hasServerGoogleApiKey()) {
    return NextResponse.json(
      {
        error: "Photos unavailable",
        reason: "missing_server_api_key",
        hint: "Set GOOGLE_PLACES_SERVER_API_KEY in Vercel with no HTTP referrer restriction.",
      },
      { status: 503 },
    );
  }

  const photoNames = request.nextUrl.searchParams
    .getAll("name")
    .filter(Boolean);

  if (format === "json") {
    const urls = await resolveVenuePhotoUris(placeId, width, count, photoNames);
    if (urls.length === 0) {
      return NextResponse.json(
        {
          error: "Photos unavailable",
          reason: "google_places_denied",
          hint: "Ensure Places API (New) is enabled and the server key has no referrer restriction.",
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { urls },
      {
        headers: {
          "Cache-Control": PLACE_PHOTO_URI_CACHE_CONTROL,
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
      "Cache-Control": PLACE_PHOTO_URI_CACHE_CONTROL,
    },
  });
}
