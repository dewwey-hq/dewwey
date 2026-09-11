"use client";

import { coverOrFirstPost } from "@/lib/feedDesign";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { CaptionStrip } from "../components/CaptionStrip";
import { StackRail } from "../components/StackRail";
import { MeasuredCard } from "../components/MeasuredCard";
import type { WeddingStack } from "@/lib/server/graph";

/** A2. Clean list — the baseline done right; mobile default. Single column, the intact
 * uncaptioned official embed (embed.js, responsive width up to 540px, real height — no
 * crop, no forced square), a caption strip below it, then the venue-first stack rail. */
export function CleanList({ stacks }: { stacks: WeddingStack[] }) {
  return (
    <div className="mx-auto flex max-w-[540px] flex-col gap-10">
      {stacks.map((stack, i) => {
        const cover = coverOrFirstPost(stack.post_infos);
        return (
          <MeasuredCard key={stack.id} id={stack.id} className="w-full">
            <InstagramPostEmbed post={cover} eager={i < 2} />
            <CaptionStrip
              eventDate={stack.event_date_est}
              caption={stack.caption}
              postInfos={stack.post_infos}
              coverUrl={cover?.url ?? null}
              coverPostType={cover?.postType ?? null}
            />
            <div className="mt-3">
              <StackRail vendors={stack.vendors} venueUsername={stack.venue_username} />
            </div>
          </MeasuredCard>
        );
      })}
    </div>
  );
}
