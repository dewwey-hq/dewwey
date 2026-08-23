"use client";

import { useState } from "react";
import Link from "next/link";
import { InstagramLogo } from "@phosphor-icons/react";
import { embedUrl } from "./InstagramEmbed";
import { Avatar } from "./Avatar";
import { AddToTeamButton } from "./team/AddToTeamButton";
import { roleLabel } from "@/lib/roles";
import { formatEventDate } from "@/lib/format-date";
import { showHandle } from "@/lib/slots";
import type { WeddingStack } from "@/lib/server/graph";

/**
 * The feed unit: Instagram-desktop layout — the post's media on the left,
 * and where IG puts comments, the credit stack you can act on.
 */
export function WeddingFeedCard({ stack }: { stack: WeddingStack }) {
  const [idx, setIdx] = useState(0);
  const embeds = stack.embed_urls
    .map((u) => ({ url: u, src: embedUrl(u, false) }))
    .filter((e): e is { url: string; src: string } => Boolean(e.src));
  const confirmed = stack.n_posts > 1;

  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-black/[0.07] bg-white md:grid md:h-[680px] md:grid-cols-[minmax(0,440px)_1fr]">
      {/* Media */}
      <div className="flex flex-col border-b border-black/[0.05] bg-black/[0.02] md:h-full md:border-b-0 md:border-r">
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
                      i === idx ? "bg-gray-900" : "bg-black/[0.15] hover:bg-black/[0.35]"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* The vendor opted their account out of embeds — show the credit
             stack's original caption as the artifact instead. */
          <div className="flex h-[480px] flex-1 flex-col overflow-hidden bg-black/[0.03] md:h-auto">
            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
              <div className="text-3xl leading-none text-black/[0.20]">“</div>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-gray-700">
                {stack.caption ?? "This vendor keeps their posts on Instagram."}
              </p>
            </div>
            <a
              href={stack.post_urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 border-t border-black/[0.06] px-7 py-3 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              <InstagramLogo size={14} />
              See the photos on Instagram
            </a>
          </div>
        )}
      </div>

      {/* The stack — IG's comment column, but actionable */}
      <div className="flex min-w-0 flex-col md:h-full md:min-h-0">
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-5 py-3.5">
          <h3 className="font-medium text-gray-900">{formatEventDate(stack.event_date_est)}</h3>
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
              className="flex items-center gap-1 text-xs text-gray-600 transition-colors hover:text-gray-900"
            >
              <InstagramLogo size={14} />
              Open on IG
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
                className="flex min-w-0 items-center gap-2.5 text-gray-900 hover:text-gray-600"
              >
                <Avatar src={v.avatar_url} name={v.name} size={26} className="text-xs" />
                <span className="truncate text-sm">{v.name}</span>
                {showHandle(v.name, v.username) && (
                  <span className="hidden truncate text-xs text-black/[0.56] lg:inline">
                    @{v.username}
                  </span>
                )}
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
