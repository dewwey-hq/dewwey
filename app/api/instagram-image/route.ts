import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["cdninstagram.com", "fbcdn.net"];

function isAllowedInstagramUrl(raw: string): boolean {
  try {
    const { hostname, protocol } = new URL(raw);
    if (protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url || !isAllowedInstagramUrl(url)) {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.instagram.com/",
    },
    next: { revalidate: 86400 },
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: "Image unavailable" }, { status: upstream.status });
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
