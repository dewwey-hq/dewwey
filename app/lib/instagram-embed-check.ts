const BROKEN_MARKERS = [
  "EmbedBrokenMedia",
  "ebmMessage",
  "may be broken",
  "Post unavailable",
  "Sorry, this page isn't available",
] as const;

const VALID_EMBED_MARKERS = ["instagram-media", "EmbeddedMedia"] as const;

/** UA that receives Instagram's lightweight embed HTML (not the full web app shell). */
const EMBED_FETCH_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

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

/** Classify embed HTML from Instagram's /embed/ endpoint. */
export function isEmbedHtmlAvailable(html: string, responseOk: boolean): boolean {
  if (!responseOk) return false;
  if (BROKEN_MARKERS.some((marker) => html.includes(marker))) return false;
  if (VALID_EMBED_MARKERS.some((marker) => html.includes(marker))) return true;
  // Chrome-like clients get a large SPA shell with no reliable embed markers.
  if (html.length > 200_000) return false;
  return false;
}

export async function checkEmbedAvailable(postUrl: string): Promise<boolean> {
  const embedUrl = embedUrlFromPost(postUrl);
  if (!embedUrl) return false;

  try {
    const upstream = await fetch(embedUrl, {
      headers: {
        "User-Agent": EMBED_FETCH_UA,
        Accept: "text/html",
      },
      next: { revalidate: 86400 },
    });

    const html = await upstream.text();
    return isEmbedHtmlAvailable(html, upstream.ok);
  } catch {
    return false;
  }
}

export const EMBED_STATUS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};
