"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "./Avatar";
import { AddToTeamButton } from "./team/AddToTeamButton";
import { roleLabel } from "@/lib/roles";
import type { WeddingStack } from "@/lib/server/graph";

function mediaEmbedUrl(postUrl: string): string | null {
  try {
    const url = new URL(postUrl);
    const match = url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
  } catch {
    return null;
  }
}

function formatDate(d: string | null): string {
  if (!d) return "Date unknown";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The feed unit: Instagram-desktop layout — the post's media on the left,
 * and where IG puts comments, the credit stack you can act on.
 */
export function WeddingFeedCard({ stack }: { stack: WeddingStack }) {
  const [idx, setIdx] = useState(0);
  const embeds = stack.post_urls
    .map((u) => ({ url: u, src: mediaEmbedUrl(u) }))
    .filter((e): e is { url: string; src: string } => Boolean(e.src));
  const confirmed = stack.n_posts > 1;

  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-black/[0.07] bg-white md:grid md:h-[680px] md:grid-cols-[minmax(0,440px)_1fr]">
      {/* Media */}
      <div className="flex flex-col border-b border-black/[0.05] bg-gray-50 md:h-full md:border-b-0 md:border-r">
        {embeds.length > 0 ? (
          <>
            {/* Crop IG's 54px profile header — the stack column already names the poster */}
            <div className="relative h-[480px] flex-1 overflow-hidden md:h-auto">
              <iframe
                key={embeds[idx].src}
                src={embeds[idx].src}
                title="Instagram post"
                loading="lazy"
                scrolling="no"
                className="absolute inset-x-0 -top-[54px] h-[calc(100%+54px)] w-full bg-white"
              />
            </div>
            {embeds.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 py-2">
                {embeds.map((e, i) => (
                  <button
                    key={e.url}
                    onClick={() => setIdx(i)}
                    aria-label={`Post ${i + 1}`}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      i === idx ? "bg-rose-500" : "bg-gray-300 hover:bg-rose-300"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-[480px] flex-1 items-center justify-center text-4xl text-rose-200 md:h-auto">✦</div>
        )}
      </div>

      {/* The stack — IG's comment column, but actionable */}
      <div className="flex min-w-0 flex-col md:h-full md:min-h-0">
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-5 py-3.5">
          <h3 className="font-medium text-gray-900">{formatDate(stack.event_date_est)}</h3>
          <div className="ml-auto flex items-center gap-2">
            {confirmed && (
              <span
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
                title={`${stack.n_posts} vendors independently posted this wedding`}
              >
                ✓ {stack.n_posts} posts
              </span>
            )}
            <a
              href={stack.post_urls[idx] ?? stack.post_urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-rose-600"
            >
              Open on IG ↗
            </a>
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-black/[0.04] overflow-y-auto px-5 py-1.5">
          {stack.vendors.map((v) => (
            <li key={`${v.username}-${v.role}`} className="flex items-center gap-2 py-2">
              <span className="w-20 shrink-0 text-xs font-medium text-gray-600">
                {roleLabel(v.role)}
              </span>
              <Link
                href={`/vendors/${encodeURIComponent(v.username)}`}
                className="flex min-w-0 items-center gap-2.5 text-gray-900 hover:text-rose-600"
              >
                <Avatar src={v.avatar_url} name={v.name} size={26} className="text-xs" />
                <span className="truncate text-sm">{v.name}</span>
                <span className="hidden truncate text-xs text-gray-500 lg:inline">
                  @{v.username}
                </span>
              </Link>
              <span className="ml-auto">
                <AddToTeamButton
                  accountId={v.accountId}
                  username={v.username}
                  name={v.name}
                  role={v.role}
                  avatarUrl={v.avatar_url}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
