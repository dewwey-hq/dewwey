"use client";

import { coverOrFirstPost } from "@/lib/feedDesign";
import { EmbedFrame } from "../components/EmbedFrame";
import { CaptionStrip } from "../components/CaptionStrip";
import { StackRail } from "../components/StackRail";
import { MeasuredCard } from "../components/MeasuredCard";
import type { WeddingStack } from "@/lib/server/graph";

/** A. Clean list — the baseline done right; mobile default. Single column, square 470px
 * cover embed, caption strip below, venue-first avatar rail. */
const EMBED_WIDTH = 470;

export function CleanList({ stacks }: { stacks: WeddingStack[] }) {
  return (
    <div className="mx-auto flex max-w-[470px] flex-col gap-10">
      {stacks.map((stack) => {
        const cover = coverOrFirstPost(stack.post_infos);
        return (
          <MeasuredCard key={stack.id} id={stack.id} className="w-full">
            <EmbedFrame post={cover} width={EMBED_WIDTH} className="mx-auto" />
            <CaptionStrip
              eventDate={stack.event_date_est}
              caption={stack.caption}
              postInfos={stack.post_infos}
              coverUrl={cover?.url ?? null}
              embedWidth={EMBED_WIDTH}
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
