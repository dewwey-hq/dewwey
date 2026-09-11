"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { InstagramLogo } from "@phosphor-icons/react";
import { VendorAvatar } from "./VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverOrFirstPost, groupStackByCategory, displayName } from "@/lib/feedDesign";
import { contextLabel, roleLabel } from "@/lib/roles";
import type { StackVendor, WeddingStack } from "@/lib/server/graph";

/** "November 2025" — same local helper as the other variants (not centralized; same-rules
 * addition per variant). Read as UTC since wedding dates are date-only. */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** One team tile: avatar + name/role, with a small `AddToTeamButton` at the right — same
 * shape as `Roster.tsx`'s `RosterTile` (duplicated locally, same-rules addition per
 * variant). */
function WallTile({ vendor }: { vendor: StackVendor & { extraRoles: string[] } }) {
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

/**
 * I's sheet — the team, one tap away from the wall's bare photo. A right drawer on
 * desktop (md+, ~420px, full height), a bottom sheet on mobile (max-h-[85vh]) — same
 * positioning approach as `DetailPanel.tsx` (B2's click chrome), own content: venue as
 * "Hosted at", date/post-count, then the team as a 2-column tile grid grouped by category
 * (`groupStackByCategory`'s order; venue excluded — it's already the Hosted line).
 * Footer links out per-post instead of re-embedding, to keep live embeds off the sheet.
 */
export function WallSheet({
  stack,
  venue,
  onClose,
}: {
  stack: WeddingStack;
  venue: { id: number; username: string; name: string };
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const hostedName = venueVendor ? displayName(venueVendor.name, venueVendor.username) : venue.name;
  const hostedUsername = venueVendor ? venueVendor.username : venue.username;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);

  const cover = coverOrFirstPost(stack.post_infos);
  const openUrl = cover?.url ?? stack.post_urls[0] ?? null;
  const monthYear = monthYearLabel(stack.event_date_est);

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 md:bg-black/10" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${hostedName} wedding team`}
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-black/[0.08] bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] md:inset-x-auto md:inset-y-0 md:right-0 md:top-0 md:h-full md:max-h-none md:w-[420px] md:rounded-t-none md:rounded-l-2xl md:border-l md:border-t-0 md:shadow-[-8px_0_30px_rgba(0,0,0,0.10)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-gray-900">
              <span className="font-semibold text-gray-500">Hosted at </span>
              <Link href={`/vendors/${encodeURIComponent(hostedUsername)}`} className="hover:text-gray-600">
                {hostedName}
              </Link>
            </p>
            <p className="mt-0.5 text-xs text-black/[0.45]">
              {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
            </p>
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

        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.slug}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-black/[0.4]">
                {group.label}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2">
                {group.vendors.map((v) => (
                  <WallTile key={v.username} vendor={v} />
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-xs text-black/[0.45]">No other vendors credited yet.</p>
          )}
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
        {stack.post_urls.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-black/[0.45]">
            {stack.post_urls.map((url, i) => (
              <span key={url} className="flex items-center gap-2">
                {i > 0 && <span className="text-black/[0.25]">·</span>}
                <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-gray-900">
                  Post {i + 1}
                </a>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
