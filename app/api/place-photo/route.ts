import { NextRequest, NextResponse } from "next/server";
import {
  clampPhotoWidth,
  getGooglePlacesApiKey,
  isValidPlacePhotoName,
} from "@/app/lib/place-photo";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const width = clampPhotoWidth(
    Number.parseInt(request.nextUrl.searchParams.get("w") ?? "", 10),
  );

  if (!name || !isValidPlacePhotoName(name)) {
    return NextResponse.json({ error: "Invalid photo name" }, { status: 400 });
  }

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Photo service unavailable" }, { status: 503 });
  }

  const upstreamUrl = new URL(`https://places.googleapis.com/v1/${name}/media`);
  upstreamUrl.searchParams.set("maxWidthPx", String(width));
  upstreamUrl.searchParams.set("key", apiKey);

  const upstream = await fetch(upstreamUrl, {
    next: { revalidate: 86400 },
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Photo unavailable" },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
