const BROKEN_MARKERS = [
  "may be broken",
  "Post unavailable",
  "Sorry, this page isn't available",
];

export function embedUrlFromPost(postUrl: string): string | null {
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

export async function checkEmbedAvailable(postUrl: string): Promise<boolean> {
  const embedUrl = embedUrlFromPost(postUrl);
  if (!embedUrl) return false;

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
    return upstream.ok && !BROKEN_MARKERS.some((marker) => html.includes(marker));
  } catch {
    return false;
  }
}

export const EMBED_STATUS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};
