"use client";

import { useState } from "react";
import Link from "next/link";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { VendorAvatar } from "../components/VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory, displayName } from "@/lib/feedDesign";
import { contextLabel, roleLabel } from "@/lib/roles";
import type { EmbedSize } from "../variant";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

const DEFAULT_COLLAPSE_AT = 8;
const COMPACT_COLLAPSE_AT = 6;

/** Static, fully-written-out class names per size (Tailwind's JIT scans source text, not
 * runtime-interpolated strings) — the side-by-side grid template used in 1-up mode only;
 * 2-up stacks media above the panel instead. */
const SIDE_BY_SIDE_GRID_CLASS: Record<EmbedSize, string> = {
  360: "lg:grid-cols-[minmax(0,360px)_1fr]",
  400: "lg:grid-cols-[minmax(0,400px)_1fr]",
  470: "lg:grid-cols-[minmax(0,470px)_1fr]",
  540: "lg:grid-cols-[minmax(0,540px)_1fr]",
};

/** "November 2025" — same local helper as `Card.tsx` (not centralized; each variant
 * that wants a plain month+year label carries its own copy, same-rules addition). Read
 * as UTC since wedding dates are date-only (same rationale as `formatEventDate`). */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The spec's exact dead/blocked-post copy, in a neutral box occupying roughly the
 * media region — reuses `InstagramPostEmbed`'s own blocked-owner/timeout detection via
 * `renderFallback`; this is only the presentation. */
function RecipeFallback({ post }: { post: StackPostInfo | null }) {
  return (
    <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center">
      <p className="text-sm font-medium text-neutral-700">Instagram post unavailable</p>
      <p className="text-xs text-neutral-500">This post is no longer available on Instagram.</p>
      {post?.url && (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 text-xs font-semibold text-rose-500 hover:text-rose-600"
        >
          Open Instagram →
        </a>
      )}
    </div>
  );
}

function FeedCardRecipe({
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
  const [expanded, setExpanded] = useState(false);
  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so the fallback
  // presentation still has a real post URL to link out to.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);

  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = activePost?.url ?? stack.post_urls[0] ?? null;

  // User feedback (2026-09-11): "too large... make them smaller within Instagram
  // guidance" -- `embedWidth` (360/400/470, Instagram's floor is 326) drives the media
  // column's max width; `twoUp` stacks media above the panel so two cards fit side by
  // side. Compact density (tighter rows, 12px group gap, 6-vendor collapse) kicks in
  // automatically at 400px-or-narrower or in 2-up.
  const compact = embedWidth <= 400 || twoUp;
  const collapseAt = compact ? COMPACT_COLLAPSE_AT : DEFAULT_COLLAPSE_AT;

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const allGroups = groupStackByCategory(others);
  const flatOrdered = allGroups.flatMap((g) => g.vendors);
  const totalVendors = flatOrdered.length;
  const visibleSet = new Set(
    expanded || totalVendors <= collapseAt ? flatOrdered : flatOrdered.slice(0, collapseAt),
  );
  const visibleGroups = allGroups
    .map((g) => ({ ...g, vendors: g.vendors.filter((v) => visibleSet.has(v)) }))
    .filter((g) => g.vendors.length > 0);

  const gridTemplateClass = twoUp ? "" : SIDE_BY_SIDE_GRID_CLASS[embedWidth];

  return (
    <article className="mx-auto w-full max-w-[1160px] rounded-[20px] border border-black/[0.07] bg-white p-4">
      <div className={`grid grid-cols-1 gap-4 ${gridTemplateClass}`}>
        {/* Media -- Instagram controls its own height; never crop/force. Capped at
            `embedWidth` (never below Instagram's own 326px floor). */}
        <div className="flex flex-col items-center">
          <div className="w-full" style={{ maxWidth: embedWidth }}>
            <InstagramPostEmbed
              key={activePost?.url ?? "none"}
              post={activePost}
              eager={eagerCover || interacted}
              renderFallback={({ post }) => <RecipeFallback post={post} />}
            />
          </div>
          {embeddablePosts.length > 1 && (
            <div
              role="group"
              aria-label="Choose a post"
              className="mt-3 flex items-center justify-center gap-2"
            >
              {embeddablePosts.map((p, i) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => {
                    setIdx(i);
                    setInteracted(true);
                  }}
                  aria-label={`View post ${i + 1} of ${embeddablePosts.length}`}
                  aria-current={i === idx ? "true" : undefined}
                  className={`rounded-full transition-all ${
                    i === idx
                      ? "h-2.5 w-2.5 bg-rose-400"
                      : "h-2 w-2 bg-black/[0.15] hover:bg-black/[0.3]"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Team panel -- a structured record, not an Instagram clone. */}
        <div className="flex flex-col p-5 lg:rounded-[14px] lg:border lg:border-neutral-200 lg:bg-neutral-50">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            WEDDING RECIPE
          </p>

          {venueVendor && (
            <p className="mt-1.5 text-[15px] font-medium text-neutral-900">
              <span className="font-normal text-neutral-500">Hosted at </span>
              <Link
                href={`/vendors/${encodeURIComponent(venueVendor.username)}`}
                className="hover:text-neutral-600"
              >
                {displayName(venueVendor.name, venueVendor.username)}
              </Link>
            </p>
          )}

          <p className="mt-1 text-xs text-neutral-500">
            {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
          </p>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            THE TEAM
          </p>

          <div className={`mt-2 flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
            {visibleGroups.map((group) => (
              <div key={group.slug}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {group.label}
                </p>
                <ul className="mt-1.5 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
                  {group.vendors.map((v) => {
                    const contextChip = v.contexts
                      .map((c) => contextLabel(c))
                      .filter((c): c is string => Boolean(c))
                      .join(" / ");
                    // Recipe otherwise never labels a role (the category header does that
                    // job) -- a second role earned by dedupe is the one exception, e.g.
                    // "Catering · Bar service".
                    const roleChip = v.extraRoles.length > 0
                      ? [v.role, ...v.extraRoles].map((r) => roleLabel(r)).join(" · ")
                      : null;
                    const subLine = [roleChip, contextChip].filter(Boolean).join(" · ");
                    return (
                      <li
                        key={`${v.username}-${v.role}`}
                        className={`grid grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-2 ${compact ? "py-1" : "py-1.5"}`}
                      >
                        <VendorAvatar src={v.avatar_url} name={v.name} role={v.role} size={24} />
                        <Link
                          href={`/vendors/${encodeURIComponent(v.username)}`}
                          className="min-w-0 truncate text-sm font-medium text-neutral-900 hover:text-neutral-600"
                        >
                          {displayName(v.name, v.username)}
                          {subLine && (
                            <span className="font-normal text-neutral-400"> · {subLine}</span>
                          )}
                        </Link>
                        <span className="flex items-center justify-center">
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
            ))}
          </div>

          {totalVendors > collapseAt && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-3 self-start text-xs font-medium text-neutral-600 hover:text-neutral-900"
            >
              {expanded ? "Show fewer vendors" : `+ ${totalVendors - collapseAt} more vendors`}
            </button>
          )}

          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 text-[13px] font-semibold text-neutral-700 hover:text-neutral-900"
            >
              ↗ Open on Instagram
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * D. Recipe — "Wedding Recipe": a structured Dewwey wedding record with an Instagram
 * embed inside it, not an Instagram clone (spec brought in from outside, 2026-09-11).
 * No fixed card height, no couple names, no captions, no Reel/Carousel badges. The
 * venue reads as "Hosted at <name>" text (never a vendor row); everyone else is
 * grouped by category (`ROLE_CATEGORIES` priority order, already correct once venue is
 * excluded) with an inline "+N more vendors" expand past 8 (6 when compact). A later
 * round of feedback ("too large... make them smaller within Instagram guidance") added
 * `embedWidth`/`twoUp` (`FeedLab.tsx`'s Size/Layout controls, C and D only).
 */
export function Recipe({
  stacks,
  embedWidth,
  twoUp,
}: {
  stacks: WeddingStack[];
  embedWidth: EmbedSize;
  twoUp: boolean;
}) {
  return (
    <div className={twoUp ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : "flex flex-col gap-6"}>
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <FeedCardRecipe stack={stack} eagerCover={i < 2} embedWidth={embedWidth} twoUp={twoUp} />
        </MeasuredCard>
      ))}
    </div>
  );
}
