"use client";

import { useState } from "react";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { Storefront } from "@phosphor-icons/react/dist/ssr";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { VendorAvatar } from "../components/VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverOrFirstPost, groupStackByCategory, displayName } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import { slotForRole } from "@/lib/team";
import { SLOT_ICONS } from "@/lib/slots";
import type { StackCategoryGroup } from "@/lib/feedDesign";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

type ChipVendor = StackVendor & { extraRoles: string[] };

/** Untyped-index view of `SLOT_ICONS`, same loose-lookup pattern as `VendorAvatar.tsx` —
 * `slotForRole` returns a plain `string` (including `"Other"`, not a real `Slot`). */
const ICON_BY_SLOT: Record<string, Icon> = SLOT_ICONS;

/** "November 2025" — same local helper as `Ledger.tsx`/`Card.tsx`/`Recipe.tsx` (not
 * centralized; same-rules addition per variant). Read as UTC since wedding dates are
 * date-only. */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The D-style dead/blocked-post block, at the embed's own width — same copy as
 * `Ledger.tsx`'s `LedgerFallback` (duplicated locally, same-rules addition per variant). */
function ChipGridFallback({ post }: { post: StackPostInfo | null }) {
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

/** One vendor row inside an open category: avatar, name (links out), role line. */
function VendorRow({ v }: { v: ChipVendor }) {
  const ctx = v.contexts.map((c) => contextLabel(c)).filter((c): c is string => Boolean(c))[0];
  const roleText = [roleLabel(v.role), ...v.extraRoles.map((r) => roleLabel(r)), ctx]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-2 py-1">
      <VendorAvatar src={v.avatar_url} name={v.name} role={v.role} size={28} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/vendors/${encodeURIComponent(v.username)}`}
          className="block truncate text-sm font-medium text-gray-900 hover:text-gray-600"
        >
          {displayName(v.name, v.username)}
        </Link>
        {roleText && <p className="truncate text-xs text-black/[0.45]">{roleText}</p>}
      </div>
      <span className="inline-block shrink-0 scale-[0.83]">
        <AddToTeamButton
          accountId={v.accountId}
          username={v.username}
          name={v.name}
          role={v.role}
          avatarUrl={v.avatar_url}
        />
      </span>
    </div>
  );
}

/** One category chip — icon (the category's first vendor's slot) + label + a count badge
 * when the category has more than one vendor. Tapping toggles it active. */
function CategoryChip({
  group,
  active,
  onToggle,
}: {
  group: StackCategoryGroup<ChipVendor>;
  active: boolean;
  onToggle: () => void;
}) {
  const SlotIcon = ICON_BY_SLOT[slotForRole(group.vendors[0]?.role)] ?? Storefront;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors ${
        active
          ? "bg-gray-900 text-white ring-gray-900"
          : "bg-white text-gray-700 ring-black/[0.10] hover:bg-black/[0.03]"
      }`}
    >
      <SlotIcon size={12} />
      <span>{group.label}</span>
      {group.vendors.length > 1 && (
        <span className={active ? "text-white/70" : "text-black/[0.4]"}>{group.vendors.length}</span>
      )}
    </button>
  );
}

/** One wedding tile: the intact cover embed, a meta line under it, the category chip
 * row, and (when a chip or "All" is active) that category's vendor rows. */
function ChipTile({ stack, eager }: { stack: WeddingStack; eager: boolean }) {
  const cover = coverOrFirstPost(stack.post_infos);
  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = cover?.url ?? stack.post_urls[0] ?? null;

  // Venue excluded from the chip row -- it's the page context, not a credit to browse.
  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);
  const totalVendors = groups.reduce((sum, g) => sum + g.vendors.length, 0);

  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  const activeGroups = allOpen ? groups : groups.filter((g) => g.slug === openSlug);

  return (
    <MeasuredCard id={stack.id} className="mb-4 break-inside-avoid">
      <InstagramPostEmbed
        post={cover}
        eager={eager}
        renderFallback={({ post }) => <ChipGridFallback post={post} />}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-xs text-black/[0.5]">
        <span>
          {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
        </span>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium text-gray-600 hover:text-gray-900"
          >
            ↗ Open on Instagram
          </a>
        )}
      </div>

      {groups.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
          {groups.map((group) => (
            <CategoryChip
              key={group.slug}
              group={group}
              active={!allOpen && openSlug === group.slug}
              onToggle={() => {
                setAllOpen(false);
                setOpenSlug((s) => (s === group.slug ? null : group.slug));
              }}
            />
          ))}
          {groups.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setAllOpen((a) => !a);
                setOpenSlug(null);
              }}
              aria-pressed={allOpen}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors ${
                allOpen
                  ? "bg-gray-900 text-white ring-gray-900"
                  : "bg-white text-gray-700 ring-black/[0.10] hover:bg-black/[0.03]"
              }`}
            >
              All {totalVendors}
            </button>
          )}
        </div>
      )}

      {activeGroups.length > 0 && (
        <div className="mt-1.5 rounded-xl bg-black/[0.02] px-2 py-1.5">
          {activeGroups.map((group) => (
            <div key={group.slug}>
              {allOpen && (
                <p className="mt-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-black/[0.35] first:mt-0">
                  {group.label}
                </p>
              )}
              {group.vendors.map((v) => (
                <VendorRow key={v.username} v={v} />
              ))}
            </div>
          ))}
        </div>
      )}
    </MeasuredCard>
  );
}

/**
 * H · Chip grid — dense scanning of many weddings without hiding the vendor stack. Same
 * CSS-columns masonry as `Grid.tsx` (1 col phone -- the embed's 326px minimum won't fit
 * two across at ~400px, 2 cols tablet, 3 desktop) of intact cover embeds. Under each embed,
 * NOT over it: a date/post-count/Open-on-Instagram line, then one chip per vendor category
 * (venue excluded -- it's the page context). Tapping a chip reveals that category's vendor
 * rows inline (one open category per tile, tapping again closes it, tapping another
 * switches); a trailing "All N" chip opens every category at once, grouped under small
 * headings. No size/couple-name/caption controls -- scrappy, no polish pass.
 */
export function ChipGrid({
  stacks,
  venue,
}: {
  stacks: WeddingStack[];
  venue: { id: number; username: string; name: string };
}) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3" data-venue={venue.username}>
      {stacks.map((stack, i) => (
        <ChipTile key={stack.id} stack={stack} eager={i < 6} />
      ))}
    </div>
  );
}
