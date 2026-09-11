"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { VendorAvatar } from "../components/VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory, displayName } from "@/lib/feedDesign";
import { contextLabel, roleLabel } from "@/lib/roles";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

/** "November 2025" — same local helper as `Ledger.tsx`/`Card.tsx`/`Recipe.tsx` (not
 * centralized; each variant that wants a plain month+year label carries its own copy,
 * same-rules addition). Read as UTC since wedding dates are date-only. */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The spec's dead/blocked-post block, same copy as the other variants' fallbacks
 * (duplicated locally, same-rules addition per variant). */
function ScrollFallback({ post }: { post: StackPostInfo | null }) {
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

type PanelVendor = StackVendor & { extraRoles: string[] };

/** One row in the team panel: avatar, linked name, role (+ extra roles / event context),
 * and a small save action — the same ingredients `StackRail`'s tooltip and `Ledger`'s
 * `CategoryLine` already combine, laid out as a list row instead of a chip or a line. */
function TeamRow({ vendor }: { vendor: PanelVendor }) {
  const roleText = [vendor.role, ...vendor.extraRoles].map((r) => roleLabel(r)).join(" · ");
  const ctx = vendor.contexts.map((c) => contextLabel(c)).find((c): c is string => Boolean(c));
  const full = ctx ? `${roleText} · ${ctx}` : roleText;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <VendorAvatar src={vendor.avatar_url} name={vendor.name} role={vendor.role} size={32} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/vendors/${encodeURIComponent(vendor.username)}`}
          className="block truncate text-sm font-medium text-gray-900 hover:text-gray-600"
        >
          {displayName(vendor.name, vendor.username)}
        </Link>
        <p className="truncate text-xs text-black/[0.45]">{full}</p>
      </div>
      <AddToTeamButton
        accountId={vendor.accountId}
        username={vendor.username}
        name={vendor.name}
        role={vendor.role}
        avatarUrl={vendor.avatar_url}
      />
    </div>
  );
}

/**
 * The active wedding's full team — shared between the desktop sticky panel and the
 * phone bottom sheet. `venue` (the lab's page-level venue) is only a fallback for the
 * "Hosted at" line on the rare stack where the venue itself isn't in `stack.vendors` —
 * every stack here is hosted at the same venue (`listWeddingStacks({ hostedOnly: true
 * })`), so `stack.venue_username`/`stack.venue_name` normally already have it.
 */
function TeamPanelContent({
  stack,
  venue,
}: {
  stack: WeddingStack;
  venue: { username: string; name: string };
}) {
  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);
  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = coverOrFirstPost(stack.post_infos)?.url ?? stack.post_urls[0] ?? null;

  const hostedUsername = venueVendor?.username ?? stack.venue_username ?? venue.username;
  const hostedName = venueVendor
    ? displayName(venueVendor.name, venueVendor.username)
    : (stack.venue_name ?? venue.name);

  return (
    <div>
      <p className="text-[15px] font-semibold text-gray-900">
        <span className="font-semibold text-gray-500">Hosted at </span>
        <Link href={`/vendors/${encodeURIComponent(hostedUsername)}`} className="hover:text-gray-600">
          {hostedName}
        </Link>
      </p>
      <p className="mt-1 text-xs text-black/[0.45]">
        {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
        {openUrl && (
          <>
            {" "}
            ·{" "}
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-600 hover:text-gray-900"
            >
              ↗ Open on Instagram
            </a>
          </>
        )}
      </p>
      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.slug}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-black/[0.4]">
              {group.label}
            </p>
            <div className="mt-1 divide-y divide-black/[0.05]">
              {group.vendors.map((v) => (
                <TeamRow key={v.username} vendor={v} />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-black/[0.45]">No other vendors credited yet.</p>
        )}
      </div>
    </div>
  );
}

/** Team size excluding the venue itself — the phone bar's "N vendors" count. */
function teamCount(stack: WeddingStack): number {
  const venueKey = stack.venue_username?.toLowerCase();
  const others = venueKey ? stack.vendors.filter((v) => v.username.toLowerCase() !== venueKey) : stack.vendors;
  return others.length;
}

/** One wedding's column entry: a muted month/post-count line, the intact embed, a dots
 * pager when there's more than one embeddable post -- nothing else. The left indicator
 * lives on this item's own wrapper, never on/over the embed. */
function ScrollItem({
  stack,
  eagerCover,
  active,
  registerRef,
}: {
  stack: WeddingStack;
  eagerCover: boolean;
  active: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const embeddablePosts = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  const cover = coverPost(stack.post_infos);
  const initialIdx = cover ? Math.max(0, embeddablePosts.findIndex((p) => p.url === cover.url)) : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [interacted, setInteracted] = useState(false);
  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so the fallback
  // presentation still has a real post URL to link out to.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);
  const monthYear = monthYearLabel(stack.event_date_est);

  return (
    <MeasuredCard id={stack.id}>
      <div
        ref={registerRef}
        data-wedding-id={stack.id}
        className={`border-l-2 pl-3 transition-colors ${active ? "border-rose-400" : "border-transparent"}`}
      >
        <p className="mb-2 text-xs text-black/[0.45]">
          {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
        </p>
        <InstagramPostEmbed
          key={activePost?.url ?? "none"}
          post={activePost}
          eager={eagerCover || interacted}
          renderFallback={({ post }) => <ScrollFallback post={post} />}
        />
        {embeddablePosts.length > 1 && (
          <div role="group" aria-label="Choose a post" className="mt-3 flex items-center justify-center gap-2">
            {embeddablePosts.map((p, i) => (
              <button
                key={p.url}
                type="button"
                onClick={() => {
                  setIdx(i);
                  setInteracted(true);
                }}
                aria-label={`View post ${i + 1} of ${embeddablePosts.length}`}
                aria-current={i === idx ? "true" : undefined}
                className={`rounded-full transition-all ${
                  i === idx ? "h-2.5 w-2.5 bg-rose-400" : "h-2 w-2 bg-black/[0.15] hover:bg-black/[0.3]"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </MeasuredCard>
  );
}

/**
 * G. Scroll — a plain column of embeds (photo owns the screen, feels like browsing
 * Instagram) with ONE sticky team panel on the right that always shows whichever wedding
 * is currently in view. "In view" is one shared IntersectionObserver watching a band
 * around 40% down the viewport (`rootMargin: "-40% 0px -50% 0px"`); among the entries a
 * given callback batch reports as intersecting, the last one wins -- a plain scrollspy,
 * not a fight for "most visible." On phone there's no room for a side panel, so the same
 * content lives behind a fixed "Hosted at ... · N vendors" bar that opens a bottom sheet.
 */
export function Scroll({
  stacks,
  venue,
}: {
  stacks: WeddingStack[];
  venue: { id: number; username: string; name: string };
}) {
  const [activeId, setActiveId] = useState<number>(stacks[0]?.id ?? 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length === 0) return;
        const last = intersecting[intersecting.length - 1];
        const id = Number((last.target as HTMLElement).dataset.weddingId);
        if (!Number.isNaN(id)) setActiveId(id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 },
    );
    itemRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [stacks]);

  const activeStack = useMemo(
    () => stacks.find((s) => s.id === activeId) ?? stacks[0] ?? null,
    [stacks, activeId],
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,470px)_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-8 pb-24 lg:pb-0">
        {stacks.map((stack, i) => (
          <ScrollItem
            key={stack.id}
            stack={stack}
            eagerCover={i < 2}
            active={stack.id === activeId}
            registerRef={(el) => {
              if (el) itemRefs.current.set(stack.id, el);
              else itemRefs.current.delete(stack.id);
            }}
          />
        ))}
      </div>

      {/* Desktop -- one sticky panel, pinned under the lab's own sticky toolbar
          (`lib/site-layout.ts`'s header-height constant is the closest documented
          offset; this page's real "header" is `FeedLab`'s own sticky strip, which this
          variant can't measure without editing that file, so it's approximated the same
          way `SITE_SUBHEADER_TOP_CLASS` approximates a sticky offset elsewhere). */}
      <div className="hidden lg:block">
        {activeStack && (
          <div
            key={activeStack.id}
            className="lg:sticky lg:top-[calc(4.75rem+1rem)] max-h-[calc(100vh-4.75rem-2rem)] self-start overflow-y-auto rounded-2xl border border-black/[0.07] bg-white p-5 transition-opacity"
          >
            <TeamPanelContent stack={activeStack} venue={venue} />
          </div>
        )}
      </div>

      {/* Phone -- fixed bar for the active wedding; right padding clears the floating
          "Your team" button at bottom-right. */}
      {activeStack && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-black/[0.08] bg-white/95 py-3 pl-4 pr-[150px] text-left backdrop-blur lg:hidden"
        >
          <span className="min-w-0 truncate text-sm text-gray-900">
            Hosted at{" "}
            <span className="font-medium">
              {activeStack.venue_name ?? venue.name}
            </span>
            <span className="text-black/[0.45]"> · {teamCount(activeStack)} vendors</span>
          </span>
          <span className="shrink-0 text-black/[0.4]">▸</span>
        </button>
      )}

      {sheetOpen && activeStack && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
            onClick={() => setSheetOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Wedding team"
            className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-black/[0.08] bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] lg:hidden"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-medium text-gray-900">Wedding team</h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3">
              <TeamPanelContent stack={activeStack} venue={venue} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
