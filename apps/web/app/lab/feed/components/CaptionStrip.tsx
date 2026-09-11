"use client";

import { useState } from "react";
import { InstagramLogo } from "@phosphor-icons/react";
import { formatEventDate } from "@/lib/format-date";
import { titleFromCaption, seasonLabel } from "@/lib/feedDesign";
import { EmbedFrame } from "./EmbedFrame";
import type { StackPostInfo } from "@/lib/server/graph";

/** Design principle 3: "everything that is not the photo is one caption strip" — title
 * (couple name from the caption, else month/year), date, a "+N posts" chip that expands
 * the wedding's other posts as additional `EmbedFrame`s, and "Open on Instagram". */
export function CaptionStrip({
  eventDate,
  caption,
  postInfos,
  coverUrl,
  embedWidth,
}: {
  eventDate: string | null;
  caption: string | null;
  postInfos: StackPostInfo[];
  coverUrl: string | null;
  embedWidth: number;
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
          <h3 className="truncate text-base font-medium text-gray-900">{title}</h3>
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
        <div className="mt-3 flex flex-wrap gap-3">
          {otherPosts.map((p) => (
            <EmbedFrame key={p.url} post={p} width={Math.min(embedWidth, 220)} />
          ))}
        </div>
      )}
    </div>
  );
}
