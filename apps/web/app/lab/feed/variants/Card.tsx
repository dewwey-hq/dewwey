"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InstagramLogo } from "@phosphor-icons/react";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { Avatar } from "@/app/components/Avatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import { showHandle } from "@/lib/slots";
import type { StackVendor, WeddingStack } from "@/lib/server/graph";

/** "July 2026" — no couple names anywhere in this variant (user feedback, 2026-09-11:
 * keep the card, drop `titleFromCaption`). Wedding dates are date-only; read as UTC so a
 * local timezone can't push the month/year off by one (same rationale as
 * `formatEventDate`). */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** One card's dots-pager (now folded into a single header-row control) + caption-toggle
 * state, plus the ResizeObserver that caps the stack panel's height at the embed's real
 * (post-load) height on md+. */
function FeedCardC({ stack, eagerCover }: { stack: WeddingStack; eagerCover: boolean }) {
  const embeddablePosts = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  const cover = coverPost(stack.post_infos);
  const initialIdx = cover ? Math.max(0, embeddablePosts.findIndex((p) => p.url === cover.url)) : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [interacted, setInteracted] = useState(false);
  const [captioned, setCaptioned] = useState(false);
  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so InstagramPostEmbed's
  // own blocked-owner path has the real owner/caption instead of showing nothing.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);

  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = activePost?.url ?? stack.post_urls[0] ?? null;
  const otherPostsCount = Math.max(0, embeddablePosts.length - 1);

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);

  // Cap the stack panel's height at the media column's real (post-load) height on md+ --
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
      className="overflow-hidden rounded-[1.4rem] border border-black/[0.07] bg-white md:grid md:grid-cols-[minmax(0,470px)_1fr]"
      style={mediaHeight ? ({ ["--card-media-h" as string]: `${mediaHeight}px` } as React.CSSProperties) : undefined}
    >
      {/* Media -- white, 470px on md+, min 326 (fluid below that via InstagramPostEmbed's
          own responsive width), a hairline divider from the stack panel. */}
      <div
        ref={mediaRef}
        className="flex flex-col items-center justify-center border-b border-black/[0.06] bg-white p-3 md:border-b-0 md:border-r"
      >
        <InstagramPostEmbed
          key={`${activePost?.url ?? "none"}-${captioned ? "cap" : "nocap"}`}
          post={activePost}
          eager={eagerCover || interacted}
          captioned={captioned}
        />
      </div>

      {/* The stack panel -- gray-50, venue pinned as a full-width row, everyone else
          grouped by category in two columns on md+. */}
      <div className="flex min-w-0 flex-col bg-gray-50 md:h-full md:max-h-[var(--card-media-h,none)] md:min-h-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] px-5 py-3.5 md:px-6">
          <span className="font-medium text-gray-900">{monthYear}</span>
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
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {otherPostsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIdx((i) => (i + 1) % embeddablePosts.length);
                  setInteracted(true);
                }}
                title={`Post ${idx + 1} of ${embeddablePosts.length}`}
                className="rounded-full bg-black/[0.06] px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-black/[0.10]"
              >
                +{otherPostsCount} posts
              </button>
            )}
            <button
              type="button"
              onClick={() => setCaptioned((c) => !c)}
              aria-pressed={captioned}
              className="rounded-full bg-black/[0.06] px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-black/[0.10]"
            >
              {captioned ? "Hide caption" : "Show caption"}
            </button>
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

        <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
          {venueVendor && (
            <Link
              href={`/vendors/${encodeURIComponent(venueVendor.username)}`}
              className="mb-4 flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/[0.06] transition-colors hover:ring-black/[0.16]"
            >
              <Avatar src={venueVendor.avatar_url} name={venueVendor.name} size={28} className="text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {venueVendor.name}
                  {showHandle(venueVendor.name, venueVendor.username) && (
                    <span className="hidden text-xs font-normal text-black/[0.45] lg:inline"> @{venueVendor.username}</span>
                  )}
                </span>
                <span className="text-xs font-semibold text-rose-500">Hosted</span>
              </span>
              <AddToTeamButton
                accountId={venueVendor.accountId}
                username={venueVendor.username}
                name={venueVendor.name}
                role={venueVendor.role}
                avatarUrl={venueVendor.avatar_url}
              />
            </Link>
          )}

          <div className="columns-1 gap-x-6 md:columns-2">
            {groups.map((group) => {
              const distinctRoles = new Set(group.vendors.map((v) => v.role));
              const showRoleLabel = distinctRoles.size > 1;
              return (
                <div key={group.slug} className="mb-4 break-inside-avoid">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-black/[0.4]">
                    {group.label}
                  </p>
                  <ul className="mt-1.5 divide-y divide-black/[0.05]">
                    {group.vendors.map((v) => {
                      const contextChip = v.contexts
                        .map((c) => contextLabel(c))
                        .filter((c): c is string => Boolean(c))
                        .join(" / ");
                      const subLine = [showRoleLabel ? roleLabel(v.role) : null, contextChip]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <li key={`${v.username}-${v.role}`} className="flex items-center gap-2 py-2">
                          <Link
                            href={`/vendors/${encodeURIComponent(v.username)}`}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-gray-900 hover:text-gray-600"
                          >
                            <Avatar src={v.avatar_url} name={v.name} size={24} className="text-[10px]" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {v.name}
                                {showHandle(v.name, v.username) && (
                                  <span className="text-xs font-normal text-black/[0.45] lg:inline hidden">
                                    {" "}
                                    @{v.username}
                                  </span>
                                )}
                              </span>
                              {subLine && (
                                <span className="block truncate text-xs text-black/[0.45]">{subLine}</span>
                              )}
                            </span>
                          </Link>
                          <AddToTeamButton
                            accountId={v.accountId}
                            username={v.username}
                            name={v.name}
                            role={v.role}
                            avatarUrl={v.avatar_url}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * C. Card — user feedback (2026-09-11): "labeled 'Role · Name' rows are the discovery
 * tool, hover is slow" — the shape of today's `WeddingFeedCard` (photo left, labeled
 * vendor list right, one card = one wedding), made compliant (official `embed.js` embed,
 * no crop) and, per a second round of feedback the same day, cleaner: no couple names
 * (month + year only), a white photo column next to a gray-50 stack panel, the venue
 * pinned as its own row, everyone else grouped by category in two columns, and an
 * opt-in "Show caption" toggle instead of us ever rendering the scraped caption text.
 */
export function Card({ stacks }: { stacks: WeddingStack[] }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <FeedCardC stack={stack} eagerCover={i < 2} />
        </MeasuredCard>
      ))}
    </div>
  );
}
