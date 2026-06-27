import { NextRequest, NextResponse } from "next/server";
import {
  checkEmbedAvailable,
  embedUrlFromPost,
  EMBED_STATUS_CACHE_HEADERS,
} from "@/app/lib/instagram-embed-check";

export async function GET(request: NextRequest) {
  const postUrl = request.nextUrl.searchParams.get("postUrl");
  if (!postUrl) {
    return NextResponse.json({ error: "postUrl required" }, { status: 400 });
  }

  if (!embedUrlFromPost(postUrl)) {
    return NextResponse.json({ error: "Invalid post URL" }, { status: 400 });
  }

  const embedAvailable = await checkEmbedAvailable(postUrl);

  return NextResponse.json({ embedAvailable }, { headers: EMBED_STATUS_CACHE_HEADERS });
}

export async function POST(request: NextRequest) {
  let postUrls: unknown;
  try {
    const body = await request.json();
    postUrls = body?.postUrls;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(postUrls) || postUrls.length === 0) {
    return NextResponse.json({ error: "postUrls array required" }, { status: 400 });
  }

  const unique = [...new Set(postUrls.filter((u): u is string => typeof u === "string"))].slice(
    0,
    24,
  );

  const pairs = await Promise.all(
    unique.map(async (postUrl) => [postUrl, await checkEmbedAvailable(postUrl)] as const),
  );

  return NextResponse.json(
    { results: Object.fromEntries(pairs) },
    { headers: EMBED_STATUS_CACHE_HEADERS },
  );
}
