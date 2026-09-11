"use client";

import { useState } from "react";
import Link from "next/link";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { Avatar } from "@/app/components/Avatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory } from "@/lib/feedDesign";
import { contextLabel } from "@/lib/roles";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

const COLLAPSE_AT = 8;

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

function FeedCardRecipe({ stack, eagerCover }: { stack: WeddingStack; eagerCover: boolean }) {
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

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const allGroups = groupStackByCategory(others);
  const flatOrdered = allGroups.flatMap((g) => g.vendors);
  const totalVendors = flatOrdered.length;
  const visibleSet = new Set(
    expanded || totalVendors <= COLLAPSE_AT ? flatOrdered : flatOrdered.slice(0, COLLAPSE_AT),
  );
  const visibleGroups = allGroups
    .map((g) => ({ ...g, vendors: g.vendors.filter((v) => visibleSet.has(v)) }))
    .filter((g) => g.vendors.length > 0);

  return (
    <article className="mx-auto w-full max-w-[1160px] rounded-[20px] border border-black/[0.07] bg-white p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[500px_minmax(0,1fr)]">
        {/* Media -- Instagram controls its own height; never crop/force. */}
        <div className="flex flex-col">
          <InstagramPostEmbed
            key={activePost?.url ?? "none"}
            post={activePost}
            eager={eagerCover || interacted}
            renderFallback={({ post }) => <RecipeFallback post={post} />}
          />
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
                {venueVendor.name}
              </Link>
            </p>
          )}

          <p className="mt-1 text-xs text-neutral-500">
            {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
          </p>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            THE TEAM
          </p>

          <div className="mt-2 flex flex-col gap-4">
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
                    return (
                      <li
                        key={`${v.username}-${v.role}`}
                        className="grid grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-2 py-1.5"
                      >
                        <Avatar src={v.avatar_url} name={v.name} size={24} className="text-[10px]" />
                        <Link
                          href={`/vendors/${encodeURIComponent(v.username)}`}
                          className="min-w-0 truncate text-sm font-medium text-neutral-900 hover:text-neutral-600"
                        >
                          {v.name}
                          {contextChip && (
                            <span className="font-normal text-neutral-400"> · {contextChip}</span>
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

          {totalVendors > COLLAPSE_AT && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-3 self-start text-xs font-medium text-neutral-600 hover:text-neutral-900"
            >
              {expanded ? "Show fewer vendors" : `+ ${totalVendors - COLLAPSE_AT} more vendors`}
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
 * excluded) with an inline "+N more vendors" expand past 8.
 */
export function Recipe({ stacks }: { stacks: WeddingStack[] }) {
  return (
    <div className="flex flex-col gap-6">
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <FeedCardRecipe stack={stack} eagerCover={i < 2} />
        </MeasuredCard>
      ))}
    </div>
  );
}
