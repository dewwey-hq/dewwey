"use client";

import { X } from "lucide-react";
import { InstagramLogo } from "@phosphor-icons/react";
import { StackRail } from "./StackRail";
import { formatEventDate } from "@/lib/format-date";
import type { WeddingStack } from "@/lib/server/graph";

/**
 * B2's own chrome for a Grid tile click — never drawn over the embed. A right-side
 * drawer on desktop (md+), a bottom sheet on mobile (pure Tailwind breakpoints, no JS
 * media query): the full stack rail, title, date, "Open on Instagram".
 */
export function DetailPanel({
  stack,
  title,
  openUrl,
  onClose,
}: {
  stack: WeddingStack;
  title: string;
  openUrl: string | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 md:bg-black/10" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-black/[0.08] bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] md:inset-x-auto md:inset-y-0 md:right-0 md:top-0 md:h-full md:max-h-none md:w-[380px] md:rounded-t-none md:rounded-l-2xl md:border-l md:border-t-0 md:shadow-[-8px_0_30px_rgba(0,0,0,0.10)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-medium text-gray-900">{title}</h3>
            <p className="text-xs text-black/[0.45]">{formatEventDate(stack.event_date_est)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4">
          <StackRail vendors={stack.vendors} venueUsername={stack.venue_username} max={100} />
        </div>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-black/[0.2]"
          >
            <InstagramLogo size={14} />
            Open on Instagram
          </a>
        )}
      </div>
    </>
  );
}
