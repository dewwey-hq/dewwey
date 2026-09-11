"use client";

import { useState } from "react";
import { coverOrFirstPost, titleFromCaption, seasonLabel } from "@/lib/feedDesign";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { DetailPanel } from "../components/DetailPanel";
import { Avatar } from "@/app/components/Avatar";
import type { WeddingStack } from "@/lib/server/graph";

function titleFor(stack: WeddingStack): string {
  return titleFromCaption(stack.caption) ?? seasonLabel(stack.event_date_est) ?? "Real wedding";
}

/** B2. Grid — scanning 100+ weddings fast, closest to Instagram's profile. CSS-columns
 * masonry (2 cols phone / 3 desktop) of intact uncaptioned embeds — heights vary only by
 * real media aspect, nothing crops them and nothing is drawn over them. A one-line strip
 * UNDER each tile (Reel/Carousel badge · title · 3 vendor avatars · "+N") opens the full
 * stack in a side drawer (desktop) / bottom sheet (mobile) — the embed itself is never
 * touched by the click affordance. */
export function Grid({ stacks }: { stacks: WeddingStack[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const openStack = stacks.find((s) => s.id === openId) ?? null;

  return (
    <>
      <div className="columns-2 gap-4 md:columns-3">
        {stacks.map((stack, i) => {
          const cover = coverOrFirstPost(stack.post_infos);
          const title = titleFor(stack);
          const topVendors = stack.vendors.slice(0, 3);
          const overflow = Math.max(0, stack.vendors.length - topVendors.length);

          return (
            <MeasuredCard key={stack.id} id={stack.id} className="mb-4 break-inside-avoid">
              <InstagramPostEmbed post={cover} eager={i < 6} />
              <button
                type="button"
                onClick={() => setOpenId(stack.id)}
                className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-black/[0.03]"
              >
                {cover?.postType === "Video" && (
                  <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    Reel
                  </span>
                )}
                {cover?.postType === "Sidecar" && (
                  <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    Carousel
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">{title}</span>
                {topVendors.length > 0 && (
                  <span className="flex shrink-0 -space-x-1.5">
                    {topVendors.map((v) => (
                      <Avatar
                        key={v.username}
                        src={v.avatar_url}
                        name={v.name}
                        size={18}
                        className="text-[8px] ring-1 ring-white"
                      />
                    ))}
                  </span>
                )}
                {overflow > 0 && <span className="shrink-0 text-[10px] text-black/[0.4]">+{overflow}</span>}
              </button>
            </MeasuredCard>
          );
        })}
      </div>
      {openStack && (
        <DetailPanel
          stack={openStack}
          title={titleFor(openStack)}
          openUrl={coverOrFirstPost(openStack.post_infos)?.url ?? openStack.post_urls[0] ?? null}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
