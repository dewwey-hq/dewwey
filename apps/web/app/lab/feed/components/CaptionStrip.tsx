"use client";

import { useState } from "react";
import { InstagramLogo } from "@phosphor-icons/react";
import { formatEventDate } from "@/lib/format-date";
import { titleFromCaption, seasonLabel } from "@/lib/feedDesign";
import { InstagramPostEmbed } from "./InstagramPostEmbed";
import type { StackPostInfo } from "@/lib/server/graph";

/** Design principle 3: "everything that is not the photo is one caption strip" — title
 * (couple name from the caption, else month/year) with a Reel/Carousel badge (D058
 * compliance pass: badges live here, never drawn on the embed itself), date, a
 * "+N posts" chip that expands the wedding's other posts as additional official embeds,
 * and "Open on Instagram". */
export function CaptionStrip({
  eventDate,
  caption,
  postInfos,
  coverUrl,
  coverPostType,
}: {
  eventDate: string | null;
  caption: string | null;
  postInfos: StackPostInfo[];
  coverUrl: string | null;
  coverPostType: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = titleFromCaption(caption) ?? seasonLabel(eventDate) ?? "Real wedding";
  const dateLabel = formatEventDate(eventDate);
  const otherPosts = postInfos.filter((p) => p.url !== coverUrl);
  const openUrl = coverUrl ?? postInfos[0]?.url ?? null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-medium text-gray-900">{title}</h3>
            {coverPostType === "Video" && (
              <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-600">
                Reel
              </span>
            )}
            {coverPostType === "Sidecar" && (
              <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-600">
                Carousel
              </span>
            )}
          </div>
          <p className="text-xs text-black/[0.45]">{dateLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {otherPosts.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-black/[0.08]"
            >
              {expanded ? "Hide" : `+${otherPosts.length} posts`}
            </button>
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
            >
              <InstagramLogo size={13} />
              Open on Instagram
            </a>
          )}
        </div>
      </div>
      {expanded && otherPosts.length > 0 && (
        <div className="mt-4 flex flex-col gap-6">
          {otherPosts.map((p) => (
            // Already scrolled into view by the click that expanded this section — no
            // need to wait on the IntersectionObserver.
            <InstagramPostEmbed key={p.url} post={p} eager />
          ))}
        </div>
      )}
    </div>
  );
}
