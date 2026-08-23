"use client";

import { useState } from "react";

function captionedEmbedUrl(postUrl: string): string | null {
  try {
    const url = new URL(postUrl);
    const match = url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/embed/captioned/`;
  } catch {
    return null;
  }
}

/**
 * Lazy inline Instagram embed for a wedding's source posts — the captioned
 * variant shows the original credit-stack caption. Nothing loads until opened.
 */
export function StackPostEmbed({ postUrls }: { postUrls: string[] }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const urls = postUrls.filter((u) => captionedEmbedUrl(u));
  if (urls.length === 0) return null;
  const src = captionedEmbedUrl(urls[idx])!;

  return (
    <div className="border-t border-black/[0.05]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-rose-50/40 hover:text-rose-600"
      >
        {open ? "Hide post" : `See the post${urls.length > 1 ? "s" : ""}`}
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          {urls.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
              {urls.map((u, i) => (
                <button
                  key={u}
                  onClick={() => setIdx(i)}
                  className={`rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors ${
                    i === idx
                      ? "bg-rose-500 text-white ring-rose-500"
                      : "bg-white text-gray-500 ring-gray-200 hover:ring-rose-300"
                  }`}
                >
                  Post {i + 1}
                </button>
              ))}
            </div>
          )}
          <iframe
            key={src}
            src={src}
            title="Instagram post"
            loading="lazy"
            className="mx-auto block h-[640px] w-full max-w-[400px] rounded-xl border border-black/[0.07] bg-white"
          />
          <a
            href={urls[idx]}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-center text-xs text-gray-400 hover:text-rose-600"
          >
            Open on Instagram ↗
          </a>
        </div>
      )}
    </div>
  );
}
