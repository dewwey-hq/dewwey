"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InstagramLogo } from "@phosphor-icons/react";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { Avatar } from "@/app/components/Avatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, titleFromCaption, seasonLabel } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import { formatEventDate } from "@/lib/format-date";
import { showHandle } from "@/lib/slots";
import type { StackVendor, WeddingStack } from "@/lib/server/graph";

/** One card's own dots-pager + right-column state. Split out so the ResizeObserver /
 * IntersectionObserver eager logic is scoped per wedding, not the whole variant. */
function FeedCardC({ stack, eagerCover }: { stack: WeddingStack; eagerCover: boolean }) {
  const embeddablePosts = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  const cover = coverPost(stack.post_infos);
  const initialIdx = cover ? Math.max(0, embeddablePosts.findIndex((p) => p.url === cover.url)) : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [interacted, setInteracted] = useState(false);
  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so InstagramPostEmbed's
  // own blocked-owner path has the real owner/caption instead of showing nothing.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);

  const title = titleFromCaption(stack.caption) ?? seasonLabel(stack.event_date_est) ?? "Real wedding";
  const dateLabel = formatEventDate(stack.event_date_est);
  const openUrl = activePost?.url ?? stack.post_urls[0] ?? null;

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const orderedVendors: StackVendor[] = venueVendor
    ? [venueVendor, ...stack.vendors.filter((v) => v !== venueVendor)]
    : stack.vendors;

  // Cap the vendor list's height at the media column's real (post-load) height on md+ --
  // mobile stays unconstrained (stacked layout). A CSS var + `md:max-h-[var(--card-media-h)]`
  // keeps this out of JS entirely below the md breakpoint.
  const mediaRef = useRef<HTMLDivElement>(null);
  const [mediaHeight, setMediaHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setMediaHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      className="overflow-hidden rounded-[1.4rem] border border-black/[0.07] bg-white md:grid md:grid-cols-[minmax(0,440px)_1fr]"
      style={mediaHeight ? ({ ["--card-media-h" as string]: `${mediaHeight}px` } as React.CSSProperties) : undefined}
    >
      {/* Media */}
      <div
        ref={mediaRef}
        className="flex flex-col border-b border-black/[0.05] bg-black/[0.02] md:border-b-0 md:border-r"
      >
        <div className="p-3">
          <InstagramPostEmbed
            key={activePost?.url ?? stack.id}
            post={activePost}
            eager={eagerCover || interacted}
          />
        </div>
        {embeddablePosts.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-3">
            {embeddablePosts.map((p, i) => (
              <button
                key={p.url}
                onClick={() => {
                  setIdx(i);
                  setInteracted(true);
                }}
                aria-label={`Post ${i + 1}`}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === idx ? "bg-gray-900" : "bg-black/[0.15] hover:bg-black/[0.35]"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* The stack -- today's row shape, sharpened: venue pinned first & marked Hosted. */}
      <div className="flex min-w-0 flex-col md:h-full md:max-h-[var(--card-media-h,none)] md:min-h-0">
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-gray-900">{title}</h3>
            <p className="text-xs text-black/[0.45]">{dateLabel}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {activePost?.postType === "Video" && (
              <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-600">
                Reel
              </span>
            )}
            {activePost?.postType === "Sidecar" && (
              <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-600">
                Carousel
              </span>
            )}
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-600 transition-colors hover:text-gray-900"
              >
                <InstagramLogo size={14} />
                Open on IG
              </a>
            )}
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-black/[0.04] overflow-y-auto px-5 py-1.5">
          {orderedVendors.map((v) => {
            const isVenue = venueVendor != null && v.username === venueVendor.username;
            const contextChip = v.contexts
              .map((c) => contextLabel(c))
              .filter((c): c is string => Boolean(c))
              .join(" / ");
            return (
              <li key={`${v.username}-${v.role}`} className="flex items-center gap-2 py-2">
                <span className="w-20 shrink-0 text-xs font-medium text-gray-600">
                  {isVenue ? <span className="font-semibold text-rose-500">Hosted</span> : roleLabel(v.role)}
                  {contextChip && (
                    <span
                      className="mt-0.5 block truncate font-normal text-black/[0.45]"
                      title={contextChip}
                    >
                      · {contextChip}
                    </span>
                  )}
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
            );
          })}
        </ul>
      </div>
    </article>
  );
}

/**
 * C. Card — user feedback (2026-09-11): "labeled 'Role · Name' rows are the discovery
 * tool, hover is slow" — prefers today's `WeddingFeedCard` shape (photo left, labeled
 * vendor list right, one card = one wedding) over the avatar-rail/grid variants. This is
 * that shape made compliant (the official `embed.js` embed, no header crop, real height)
 * and sharpened: the venue is pinned first and marked "Hosted" instead of just sorting to
 * the top by role, and the card's height follows the embed's real height on desktop
 * instead of a fixed 680px box.
 */
export function Card({ stacks }: { stacks: WeddingStack[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <FeedCardC stack={stack} eagerCover={i < 2} />
        </MeasuredCard>
      ))}
    </div>
  );
}
