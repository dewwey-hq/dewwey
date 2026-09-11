"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InstagramLogo } from "@phosphor-icons/react";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { VendorAvatar } from "../components/VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory, displayName, isDerivedName } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import type { EmbedSize } from "../variant";
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

/** Static, fully-written-out class names per size (Tailwind's JIT scans source text, not
 * runtime-interpolated strings) — the side-by-side grid template used in 1-up mode only;
 * 2-up stacks media above the panel instead (see `cardLayoutClass` below). */
const SIDE_BY_SIDE_GRID_CLASS: Record<EmbedSize, string> = {
  360: "md:grid md:grid-cols-[minmax(0,360px)_1fr]",
  400: "md:grid md:grid-cols-[minmax(0,400px)_1fr]",
  470: "md:grid md:grid-cols-[minmax(0,470px)_1fr]",
};

const COMPACT_COLLAPSE_AT = 6;

/** One card's dots-pager (now folded into a single header-row control) + caption-toggle
 * state, plus the ResizeObserver that caps the stack panel's height at the embed's real
 * (post-load) height on md+. */
function FeedCardC({
  stack,
  eagerCover,
  embedWidth,
  twoUp,
}: {
  stack: WeddingStack;
  eagerCover: boolean;
  embedWidth: EmbedSize;
  twoUp: boolean;
}) {
  const embeddablePosts = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  const cover = coverPost(stack.post_infos);
  const initialIdx = cover ? Math.max(0, embeddablePosts.findIndex((p) => p.url === cover.url)) : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [interacted, setInteracted] = useState(false);
  const [captioned, setCaptioned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so InstagramPostEmbed's
  // own blocked-owner path has the real owner/caption instead of showing nothing.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);

  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = activePost?.url ?? stack.post_urls[0] ?? null;
  const otherPostsCount = Math.max(0, embeddablePosts.length - 1);

  // User feedback (2026-09-11): "the cards ... too large, make them smaller within
  // Instagram guidance" -- `embedWidth` (360/400/470, Instagram's floor is 326) drives
  // the media column's max width; `twoUp` stacks media above the panel instead of beside
  // it so two cards fit side by side. Below 400px-equivalent-or-narrower, or in 2-up
  // (where each card is already half-width), the stack panel switches to a compact
  // density automatically.
  const compact = embedWidth <= 400 || twoUp;

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const allGroups = groupStackByCategory(others);
  const flatOrdered = allGroups.flatMap((g) => g.vendors);
  const totalVendors = flatOrdered.length;
  const collapsing = compact && totalVendors > COMPACT_COLLAPSE_AT;
  const visibleSet = new Set(
    collapsing && !expanded ? flatOrdered.slice(0, COMPACT_COLLAPSE_AT) : flatOrdered,
  );
  const groups = allGroups
    .map((g) => ({ ...g, vendors: g.vendors.filter((v) => visibleSet.has(v)) }))
    .filter((g) => g.vendors.length > 0);

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

  const cardLayoutClass = twoUp ? "" : SIDE_BY_SIDE_GRID_CLASS[embedWidth];
  const mediaBorderClass = twoUp
    ? "border-b border-black/[0.06]"
    : "border-b border-black/[0.06] md:border-b-0 md:border-r";

  return (
    <article
      className={`overflow-hidden rounded-[1.4rem] border border-black/[0.07] bg-white ${cardLayoutClass}`}
      style={mediaHeight ? ({ ["--card-media-h" as string]: `${mediaHeight}px` } as React.CSSProperties) : undefined}
    >
      {/* Media -- white, capped at `embedWidth`, min 326 (Instagram's own floor, via
          InstagramPostEmbed), a hairline divider from the stack panel. */}
      <div ref={mediaRef} className={`flex flex-col items-center justify-center bg-white p-3 ${mediaBorderClass}`}>
        <div className="w-full" style={{ maxWidth: embedWidth }}>
          <InstagramPostEmbed
            key={`${activePost?.url ?? "none"}-${captioned ? "cap" : "nocap"}`}
            post={activePost}
            eager={eagerCover || interacted}
            captioned={captioned}
          />
        </div>
      </div>

      {/* The stack panel -- gray-50, venue pinned as a full-width row, everyone else
          grouped by category (compact: single column, 6-vendor collapse, tighter rows). */}
      <div
        className={`flex min-w-0 flex-col bg-gray-50 ${twoUp ? "" : "md:h-full md:max-h-[var(--card-media-h,none)] md:min-h-0"}`}
      >
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
              <VendorAvatar src={venueVendor.avatar_url} name={venueVendor.name} role={venueVendor.role} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {displayName(venueVendor.name, venueVendor.username)}
                  {!isDerivedName(venueVendor.name, venueVendor.username) && (
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

          <div className={`columns-1 gap-x-6 ${compact ? "" : "md:columns-2"}`}>
            {groups.map((group) => {
              const distinctRoles = new Set(group.vendors.map((v) => v.role));
              const showRoleLabel = distinctRoles.size > 1;
              return (
                <div key={group.slug} className={`break-inside-avoid ${compact ? "mb-3" : "mb-4"}`}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-black/[0.4]">
                    {group.label}
                  </p>
                  <ul className="mt-1.5 divide-y divide-black/[0.05]">
                    {group.vendors.map((v) => {
                      const contextChip = v.contexts
                        .map((c) => contextLabel(c))
                        .filter((c): c is string => Boolean(c))
                        .join(" / ");
                      // A second (or third) role on the same account -- "Catering · Bar
                      // service" -- always shows once dedupe found extra roles, even when
                      // `showRoleLabel` alone wouldn't have (the group could otherwise be
                      // all one role by chance).
                      const roleChip =
                        v.extraRoles.length > 0
                          ? [v.role, ...v.extraRoles].map((r) => roleLabel(r)).join(" · ")
                          : showRoleLabel
                            ? roleLabel(v.role)
                            : null;
                      const subLine = [roleChip, contextChip].filter(Boolean).join(" · ");
                      const vName = displayName(v.name, v.username);
                      return (
                        <li
                          key={`${v.username}-${v.role}`}
                          className={`flex items-center gap-2 ${compact ? "py-1" : "py-2"}`}
                        >
                          <Link
                            href={`/vendors/${encodeURIComponent(v.username)}`}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-gray-900 hover:text-gray-600"
                          >
                            <VendorAvatar src={v.avatar_url} name={v.name} role={v.role} size={24} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {vName}
                                {!isDerivedName(v.name, v.username) && (
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

          {collapsing && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-1 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              {expanded ? "Show fewer vendors" : `+ ${totalVendors - COMPACT_COLLAPSE_AT} more vendors`}
            </button>
          )}
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
 * pinned as its own row, everyone else grouped by category, and an opt-in "Show caption"
 * toggle instead of us ever rendering the scraped caption text. A third round of feedback
 * ("too large... make them smaller within Instagram guidance") added `embedWidth`/`twoUp`
 * (`FeedLab.tsx`'s Size/Layout controls, C and D only): a narrower/2-up card switches its
 * stack panel to a compact density (single column, tighter rows, 6-vendor collapse).
 */
export function Card({
  stacks,
  embedWidth,
  twoUp,
}: {
  stacks: WeddingStack[];
  embedWidth: EmbedSize;
  twoUp: boolean;
}) {
  return (
    <div
      className={
        twoUp
          ? "grid grid-cols-1 gap-4 xl:grid-cols-2"
          : "mx-auto flex max-w-5xl flex-col gap-6"
      }
    >
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <FeedCardC stack={stack} eagerCover={i < 2} embedWidth={embedWidth} twoUp={twoUp} />
        </MeasuredCard>
      ))}
    </div>
  );
}
