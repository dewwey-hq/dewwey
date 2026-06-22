"use client";

import { useState } from "react";

function embedUrl(postUrl: string, captioned: boolean): string | null {
  try {
    const url = new URL(postUrl);
    const match = url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) return null;
    const [, type, shortcode] = match;
    return captioned
      ? `https://www.instagram.com/${type}/${shortcode}/embed/captioned/`
      : `https://www.instagram.com/${type}/${shortcode}/embed/`;
  } catch {
    return null;
  }
}

const EMBED_CHROME_PX = 80;

export function instagramEmbedHeight(
  width: number,
  imageUrl?: string | null,
  generous = false,
): number {
  const url = imageUrl ?? "";
  let media: number;
  if (/1080x1350|x1350|750x937|4_5/i.test(url)) {
    media = width * (5 / 4);
  } else if (/1080x566|1080x608|x566\b|191x100/i.test(url)) {
    media = width * (9 / 16);
  } else {
    media = width;
  }
  // Lightbox: wedding posts are often carousels with mixed aspects — use the taller estimate.
  if (generous) {
    media = Math.max(media, width * (5 / 4));
  }
  return Math.round(media + EMBED_CHROME_PX);
}

export default function InstagramEmbed({
  postUrl,
  caption,
  maxWidth = 300,
  iframeHeight,
  previewImageUrl,
  lightbox = false,
}: {
  postUrl: string;
  caption?: string | null;
  maxWidth?: number;
  iframeHeight?: number;
  previewImageUrl?: string | null;
  lightbox?: boolean;
}) {
  const text = caption?.trim();
  const src = embedUrl(postUrl, !text);
  if (!src) return null;

  const height =
    iframeHeight ?? instagramEmbedHeight(maxWidth, previewImageUrl, lightbox);

  return (
    <div className="instagram-post-card">
      <iframe
        src={src}
        title="Instagram post"
        className="instagram-embed-iframe w-full border-0 bg-white"
        style={{ maxWidth, height }}
        scrolling={lightbox ? "yes" : "no"}
        allowFullScreen
      />
      {text && <InstagramCaption text={text} postUrl={postUrl} />}
    </div>
  );
}

function InstagramCaption({ text, postUrl }: { text: string; postUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 120;

  return (
    <div className="border-t border-gray-100 px-3 py-2.5 text-left">
      <p
        className={`whitespace-pre-line text-xs leading-snug text-gray-900 ${
          expanded || !long ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[11px] font-medium text-rose-500 hover:text-rose-600"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block text-[11px] text-gray-400 hover:text-gray-600"
      >
        View on Instagram
      </a>
    </div>
  );
}
