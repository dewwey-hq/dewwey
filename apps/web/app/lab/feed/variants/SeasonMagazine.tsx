"use client";

import { coverOrFirstPost, titleFromCaption, seasonLabel } from "@/lib/feedDesign";
import { EmbedFrame } from "../components/EmbedFrame";
import { StackRail } from "../components/StackRail";
import { MeasuredCard } from "../components/MeasuredCard";
import { formatEventDate } from "@/lib/format-date";
import type { WeddingStack } from "@/lib/server/graph";

const EMBED_WIDTH = 340;

function groupBySeason(stacks: WeddingStack[]): { label: string; stacks: WeddingStack[] }[] {
  const order: string[] = [];
  const bySeason = new Map<string, WeddingStack[]>();
  for (const s of stacks) {
    const label = seasonLabel(s.event_date_est) ?? "Undated";
    if (!bySeason.has(label)) {
      bySeason.set(label, []);
      order.push(label);
    }
    bySeason.get(label)!.push(s);
  }
  return order.map((label) => ({ label, stacks: bySeason.get(label)! }));
}

/** D. Season magazine — showing a venue's year, editorial feel. Wide cards alternating
 * embed left/right, grouped under season/year headers ("Summer 2026 · 11 weddings"). */
export function SeasonMagazine({ stacks }: { stacks: WeddingStack[] }) {
  const sections = groupBySeason(stacks);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-14">
      {sections.map((section) => (
        <section key={section.label}>
          <h2 className="border-b border-black/[0.08] pb-2 text-sm font-medium uppercase tracking-wide text-black/[0.5]">
            {section.label} · {section.stacks.length} wedding{section.stacks.length === 1 ? "" : "s"}
          </h2>
          <div className="mt-6 flex flex-col gap-10">
            {section.stacks.map((stack, i) => {
              const cover = coverOrFirstPost(stack.post_infos);
              const title = titleFromCaption(stack.caption) ?? section.label;
              const reversed = i % 2 === 1;
              return (
                <MeasuredCard
                  key={stack.id}
                  id={stack.id}
                  className={`flex flex-col gap-5 sm:flex-row sm:items-center ${reversed ? "sm:flex-row-reverse" : ""}`}
                >
                  <EmbedFrame post={cover} width={EMBED_WIDTH} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{title}</h3>
                    <p className="text-xs text-black/[0.45]">{formatEventDate(stack.event_date_est)}</p>
                    <div className="mt-3">
                      <StackRail vendors={stack.vendors} venueUsername={stack.venue_username} max={6} />
                    </div>
                  </div>
                </MeasuredCard>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
