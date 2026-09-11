"use client";

import Link from "next/link";
import { InstagramLogo } from "@phosphor-icons/react";
import { coverOrFirstPost, titleFromCaption, seasonLabel, groupStackByCategory } from "@/lib/feedDesign";
import { EmbedFrame } from "../components/EmbedFrame";
import { MeasuredCard } from "../components/MeasuredCard";
import { Avatar } from "@/app/components/Avatar";
import { roleLabel } from "@/lib/roles";
import { formatEventDate } from "@/lib/format-date";
import type { WeddingStack } from "@/lib/server/graph";

const EMBED_WIDTH = 470;

function excerpt(text: string | null, max = 140): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}…`;
}

/** C. Story — for readers and couples who want the narrative: headline (couple/date), a
 * one-line caption excerpt, the cover embed, then the stack grouped by category with the
 * venue pinned first. */
export function Story({ stacks }: { stacks: WeddingStack[] }) {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-14">
      {stacks.map((stack) => {
        const cover = coverOrFirstPost(stack.post_infos);
        const title = titleFromCaption(stack.caption) ?? seasonLabel(stack.event_date_est) ?? "Real wedding";
        const venueKey = stack.venue_username?.toLowerCase();
        const venue = venueKey
          ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey)
          : undefined;
        const others = venue ? stack.vendors.filter((v) => v !== venue) : stack.vendors;
        const groups = groupStackByCategory(others);
        const openUrl = cover?.url ?? stack.post_urls[0] ?? null;
        const oneLine = excerpt(stack.caption);

        return (
          <MeasuredCard key={stack.id} id={stack.id}>
            <header className="mb-3">
              <h3 className="text-xl font-medium text-gray-900">{title}</h3>
              <p className="text-xs text-black/[0.45]">{formatEventDate(stack.event_date_est)}</p>
              {oneLine && <p className="mt-2 line-clamp-1 text-sm text-black/[0.56]">{oneLine}</p>}
            </header>
            <EmbedFrame post={cover} width={EMBED_WIDTH} className="mx-auto" />
            <div className="mt-4 space-y-3">
              {venue && (
                <Link
                  href={`/vendors/${encodeURIComponent(venue.username)}`}
                  className="flex items-center gap-2.5 rounded-xl border border-black/[0.07] bg-black/[0.02] p-2.5 transition-colors hover:border-black/[0.2]"
                >
                  <Avatar src={venue.avatar_url} name={venue.name} size={32} className="text-xs" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{venue.name}</span>
                    <span className="block text-[11px] font-medium text-rose-500">Hosted venue</span>
                  </span>
                </Link>
              )}
              {groups.map((g) => (
                <div key={g.slug}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-black/[0.4]">
                    {g.label}
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {g.vendors.map((v) => (
                      <li key={v.username}>
                        <Link
                          href={`/vendors/${encodeURIComponent(v.username)}`}
                          className="flex items-center gap-1.5 rounded-full bg-black/[0.04] py-1 pl-1 pr-2.5 text-xs text-gray-700 transition-colors hover:bg-black/[0.08]"
                          title={roleLabel(v.role)}
                        >
                          <Avatar src={v.avatar_url} name={v.name} size={18} className="text-[9px]" />
                          {v.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
              >
                <InstagramLogo size={13} />
                Open on Instagram
              </a>
            )}
          </MeasuredCard>
        );
      })}
    </div>
  );
}
