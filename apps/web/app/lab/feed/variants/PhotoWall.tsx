"use client";

import { useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { WallSheet } from "../components/WallSheet";
import { coverOrFirstPost } from "@/lib/feedDesign";
import type { StackPostInfo, WeddingStack } from "@/lib/server/graph";

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
function WallFallback({ post }: { post: StackPostInfo | null }) {
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

/**
 * I. Photo wall — the feed is only photos; the team is one tap away. A wall of intact,
 * uncaptioned embeds (1 col phone, up to 4 across at 1280+, every column ≥326px — the
 * embed's own oEmbed minimum) with nothing under each but a single button line
 * (`{Month Year} · {N} vendors`, venue excluded from the count since it isn't "the team")
 * that opens `WallSheet` for that wedding — no chips, no names, no captions on the wall
 * itself. Only one sheet is open at a time (`openId`). The first 8 embeds (what a
 * 4-across wall shows above the fold) mount eagerly; the rest stay lazy via
 * `InstagramPostEmbed`'s own IntersectionObserver.
 */
export function PhotoWall({
  stacks,
  venue,
}: {
  stacks: WeddingStack[];
  venue: { id: number; username: string; name: string };
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const openStack = stacks.find((s) => s.id === openId) ?? null;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {stacks.map((stack, i) => {
          const cover = coverOrFirstPost(stack.post_infos);
          const monthYear = monthYearLabel(stack.event_date_est);
          const venueKey = stack.venue_username?.toLowerCase();
          const vendorCount = venueKey
            ? stack.vendors.filter((v) => v.username.toLowerCase() !== venueKey).length
            : stack.vendors.length;

          return (
            <MeasuredCard key={stack.id} id={stack.id}>
              <InstagramPostEmbed
                post={cover}
                eager={i < 8}
                renderFallback={({ post }) => <WallFallback post={post} />}
              />
              <button
                type="button"
                onClick={() => setOpenId(stack.id)}
                className="mt-1.5 flex w-full items-center justify-between gap-1.5 rounded-lg px-1 py-1.5 text-left text-xs text-gray-700 hover:bg-black/[0.03]"
              >
                <span className="min-w-0 truncate">
                  {monthYear} · {vendorCount} vendor{vendorCount === 1 ? "" : "s"}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-black/[0.4]">
                  Team <CaretRight size={11} weight="bold" />
                </span>
              </button>
            </MeasuredCard>
          );
        })}
      </div>
      {openStack && <WallSheet stack={openStack} venue={venue} onClose={() => setOpenId(null)} />}
    </>
  );
}
