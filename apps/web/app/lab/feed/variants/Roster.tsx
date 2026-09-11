"use client";

import { useState } from "react";
import Link from "next/link";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { VendorAvatar } from "../components/VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory, displayName } from "@/lib/feedDesign";
import { contextLabel, roleLabel } from "@/lib/roles";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

const TILE_CAP = 6;

/** "November 2025" — same local helper as the other variants (not centralized; same-rules
 * addition per variant). Read as UTC since wedding dates are date-only. */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Dead/blocked-post fallback, at the embed's own width — same copy/shape as the other
 * variants' local fallback (duplicated per variant by design), reusing
 * `InstagramPostEmbed`'s own blocked-owner/timeout detection via `renderFallback`. */
function RosterFallback({ post }: { post: StackPostInfo | null }) {
  return (
    <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 bg-neutral-50 p-6 text-center">
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

/** One tile in the roster grid: avatar + name/role, with a small `AddToTeamButton` at the
 * right — the name links to the vendor's page, the button saves without navigating. */
function RosterTile({ vendor }: { vendor: StackVendor & { extraRoles: string[] } }) {
  const ctx = vendor.contexts
    .map((c) => contextLabel(c))
    .filter((c): c is string => Boolean(c))[0];
  const roleText = [roleLabel(vendor.role), ...vendor.extraRoles.map((r) => roleLabel(r))].join(" · ");
  const subtitle = [roleText, ctx].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-2">
      <VendorAvatar src={vendor.avatar_url} name={vendor.name} role={vendor.role} size={36} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/vendors/${encodeURIComponent(vendor.username)}`}
          className="block truncate text-sm font-medium text-gray-900 hover:text-gray-600"
        >
          {displayName(vendor.name, vendor.username)}
        </Link>
        <p className="truncate text-[11px] text-black/[0.45]">{subtitle}</p>
      </div>
      <span className="inline-block shrink-0 scale-[0.83]">
        <AddToTeamButton
          accountId={vendor.accountId}
          username={vendor.username}
          name={vendor.name}
          role={vendor.role}
          avatarUrl={vendor.avatar_url}
        />
      </span>
    </div>
  );
}

function RosterCard({
  stack,
  eager,
  venueFallbackName,
}: {
  stack: WeddingStack;
  eager: boolean;
  venueFallbackName: string;
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

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);
  const tiles = groups.flatMap((g) => g.vendors);
  const visibleTiles = expanded ? tiles : tiles.slice(0, TILE_CAP);
  const hiddenCount = tiles.length - visibleTiles.length;

  const venueLabel = venueVendor ? displayName(venueVendor.name, venueVendor.username) : venueFallbackName;

  return (
    <article className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      {/* Media -- the intact embed, nothing drawn over it. */}
      <div className="w-full bg-neutral-50">
        <InstagramPostEmbed
          key={activePost?.url ?? "none"}
          post={activePost}
          eager={eager || interacted}
          renderFallback={({ post }) => <RosterFallback post={post} />}
        />
      </div>
      {embeddablePosts.length > 1 && (
        <div
          role="group"
          aria-label="Choose a post"
          className="flex items-center justify-center gap-2 pt-3"
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

      {/* Compact header. */}
      <div className="px-4 pt-3">
        <p className="text-[15px] font-semibold text-gray-900">
          <span className="font-semibold text-gray-500">Hosted at </span>
          {venueVendor ? (
            <Link href={`/vendors/${encodeURIComponent(venueVendor.username)}`} className="hover:text-gray-600">
              {venueLabel}
            </Link>
          ) : (
            venueLabel
          )}
        </p>
        <p className="mt-0.5 text-xs text-black/[0.45]">
          {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
          {openUrl && (
            <>
              {" "}
              ·{" "}
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-600 hover:text-gray-900"
              >
                ↗ Open on Instagram
              </a>
            </>
          )}
        </p>
      </div>

      {/* The roster -- a grid of vendor tiles, venue excluded (already the Hosted line). */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {visibleTiles.map((v) => (
            <RosterTile key={v.username} vendor={v} />
          ))}
        </div>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 w-full rounded-lg border border-black/[0.07] py-1.5 text-xs font-medium text-black/[0.45] hover:bg-black/[0.02] hover:text-gray-900"
          >
            +{hiddenCount} more vendor{hiddenCount === 1 ? "" : "s"}
          </button>
        )}
        {expanded && tiles.length > TILE_CAP && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 w-full rounded-lg border border-black/[0.07] py-1.5 text-xs font-medium text-black/[0.45] hover:bg-black/[0.02] hover:text-gray-900"
          >
            Show fewer
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * F. Roster — a responsive grid of vertical cards, photo-first: the intact embed on top,
 * a one-line "Hosted at <venue>" + date/post-count/Open-on-Instagram header, then the
 * stack as a 2-column grid of vendor tiles (avatar + name + role, save button) — the team
 * reads as people, not a data table. No size/layout controls, no couple names, no
 * captions, nothing drawn over the embed.
 */
export function Roster({
  stacks,
  venue,
}: {
  stacks: WeddingStack[];
  venue: { id: number; username: string; name: string };
}) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <RosterCard stack={stack} eager={i < 3} venueFallbackName={venue.name} />
        </MeasuredCard>
      ))}
    </div>
  );
}
