import { NextRequest, NextResponse } from "next/server";

function embedUrlFromPost(postUrl: string): string | null {
  try {
    const url = new URL(postUrl);
    const match = url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) return null;
    const [, type, shortcode] = match;
    return `https://www.instagram.com/${type}/${shortcode}/embed/`;
  } catch {
    return null;
  }
}

const BROKEN_MARKERS = [
  "may be broken",
  "Post unavailable",
  "Sorry, this page isn't available",
];

export async function GET(request: NextRequest) {
  const postUrl = request.nextUrl.searchParams.get("postUrl");
  if (!postUrl) {
    return NextResponse.json({ error: "postUrl required" }, { status: 400 });
  }

  const embedUrl = embedUrlFromPost(postUrl);
  if (!embedUrl) {
    return NextResponse.json({ error: "Invalid post URL" }, { status: 400 });
  }

  try {
    const upstream = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      next: { revalidate: 86400 },
    });

    const html = await upstream.text();
    const embedAvailable =
      upstream.ok && !BROKEN_MARKERS.some((marker) => html.includes(marker));

    return NextResponse.json(
      { embedAvailable },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { embedAvailable: false },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600",
        },
      },
    );
  }
}
