"use client";

import { useState } from "react";
import Link from "next/link";
import { Buildings, CaretLeft, CaretRight, InstagramLogo, TextAlignLeft } from "@phosphor-icons/react";
import { VendorAvatar } from "../components/VendorAvatar";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { Avatar } from "@/app/components/Avatar";
import { coverOrFirstPost, coverPost, displayName, groupStackByCategory, isDerivedName } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

/** "August 2026" — copied verbatim from `variants/Card.tsx` per the lab's per-file
 * duplication convention (see that file's own comment for the UTC rationale). */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** One vendor row — avatar, name (+ `@handle` when derived), role/context subtitle, a
 * small `AddToTeamButton`. Copied from `Card.tsx`'s `CardTile` verbatim (same per-variant
 * duplication convention) so all three options render pixel-identical tiles. */
function SwatchTile({ vendor }: { vendor: StackVendor & { extraRoles: string[] } }) {
  const ctx = vendor.contexts
    .map((c) => contextLabel(c))
    .filter((c): c is string => Boolean(c))
    .join(" / ");
  const roleText = [vendor.role, ...vendor.extraRoles].map((r) => roleLabel(r)).join(" · ");
  const subLine = [roleText, ctx].filter(Boolean).join(" · ");
  const vName = displayName(vendor.name, vendor.username);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <VendorAvatar src={vendor.avatar_url} name={vendor.name} role={vendor.role} size={36} />
      <Link
        href={`/vendors/${encodeURIComponent(vendor.username)}`}
        className="min-w-0 flex-1 text-gray-900 hover:text-gray-600"
      >
        <span className="block truncate text-sm font-medium">
          {vName}
          {!isDerivedName(vendor.name, vendor.username) && (
            <span className="hidden text-xs font-normal text-black/[0.45] lg:inline"> @{vendor.username}</span>
          )}
        </span>
        {subLine && <span className="block truncate text-xs text-black/[0.45]">{subLine}</span>}
      </Link>
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

const DIVIDER = <div className="border-t border-black/[0.06]" />;

interface PanelTopProps {
  stack: WeddingStack;
  venueHref: string | null;
  venueLabel: string;
  monthYear: string;
  openUrl: string | null;
}

/** Option 1 · "Venue row + action footer" — an eyebrow + venue-name-with-icon header,
 * date/count underneath, tiles in between, and the Open/Caption actions demoted to a
 * pinned pill-button footer instead of living inline in the meta line. */
function Option1Panel({ stack, venueHref, venueLabel, monthYear, tiles, openUrl }: PanelTopProps & { tiles: (StackVendor & { extraRoles: string[] })[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="text-[11px] font-medium uppercase tracking-wide text-black/[0.4]">Venue</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[15px] font-semibold text-gray-900">
        <Buildings size={16} className="shrink-0 text-black/[0.45]" />
        {venueHref ? (
          <Link href={venueHref} className="truncate hover:text-gray-600">
            {venueLabel}
          </Link>
        ) : (
          <span className="truncate">{venueLabel}</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-black/[0.45]">
        {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
      </p>
      <div className="mt-3">{DIVIDER}</div>
      <div className="mt-4 flex flex-col gap-y-2">
        {tiles.map((v) => (
          <SwatchTile key={`${v.username}-${v.role}`} vendor={v} />
        ))}
      </div>
      <div className="sticky bottom-0 mt-3 flex items-center gap-2 border-t border-black/[0.06] bg-white pt-3">
        <a
          href={openUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-black/[0.12] hover:ring-black/[0.3]"
        >
          <InstagramLogo size={14} />
          Open
        </a>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-black/[0.12] hover:ring-black/[0.3]"
        >
          <TextAlignLeft size={14} />
          Caption
        </button>
      </div>
    </div>
  );
}

/** Option 2 · "Venue as first tile + icon buttons" — the date/count moves to the top
 * next to two icon-only actions, and the venue itself becomes the first tile in the
 * stack (same tile markup as every vendor) instead of a distinct header treatment. */
function Option2Panel({
  stack,
  venueHref,
  venueLabel,
  monthYear,
  tiles,
  openUrl,
  venueAvatarUrl,
}: PanelTopProps & { tiles: (StackVendor & { extraRoles: string[] })[]; venueAvatarUrl: string | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-black/[0.45]">
          {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1">
          <a
            href={openUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on Instagram"
            aria-label="Open on Instagram"
            className="rounded-full p-1.5 text-gray-500 hover:bg-black/[0.05] hover:text-gray-900"
          >
            <InstagramLogo size={16} />
          </a>
          <button
            type="button"
            title="Show caption"
            aria-label="Show caption"
            className="rounded-full p-1.5 text-gray-500 hover:bg-black/[0.05] hover:text-gray-900"
          >
            <TextAlignLeft size={16} />
          </button>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex min-w-0 items-center gap-2">
          <VendorAvatar src={venueAvatarUrl} name={venueLabel} role="venue" size={36} />
          {venueHref ? (
            <Link href={venueHref} className="min-w-0 flex-1 text-gray-900 hover:text-gray-600">
              <span className="block truncate text-sm font-medium">{venueLabel}</span>
              <span className="block truncate text-xs text-black/[0.45]">{roleLabel("venue")}</span>
            </Link>
          ) : (
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{venueLabel}</span>
              <span className="block truncate text-xs text-black/[0.45]">{roleLabel("venue")}</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">{DIVIDER}</div>
      <div className="mt-4 flex flex-col gap-y-2">
        {tiles.map((v) => (
          <SwatchTile key={`${v.username}-${v.role}`} vendor={v} />
        ))}
      </div>
    </div>
  );
}

/** Option 3 · "Title panel + text actions" — the venue name IS the panel title (largest
 * text in the panel), a subtitle line folds venue/date/count into one row, and the
 * actions demote all the way to plain text links under the tiles. */
function Option3Panel({ stack, venueHref, venueLabel, monthYear, tiles, openUrl }: PanelTopProps & { tiles: (StackVendor & { extraRoles: string[] })[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {venueHref ? (
        <Link href={venueHref} className="shrink-0 truncate text-[17px] font-semibold tracking-tight text-gray-900 hover:text-gray-600">
          {venueLabel}
        </Link>
      ) : (
        <p className="shrink-0 truncate text-[17px] font-semibold tracking-tight text-gray-900">{venueLabel}</p>
      )}
      <p className="mt-0.5 shrink-0 text-xs text-black/[0.45]">
        Venue · {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
      </p>
      <div className="mt-3">{DIVIDER}</div>
      <div className="mt-4 flex flex-col gap-y-2">
        {tiles.map((v) => (
          <SwatchTile key={`${v.username}-${v.role}`} vendor={v} />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <a
          href={openUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          Open on Instagram ↗
        </a>
        <button type="button" className="text-xs font-medium text-gray-600 hover:text-gray-900">
          Show caption
        </button>
      </div>
    </div>
  );
}

/** Option A · "Dots" (today) — the exact dots pager markup from `Card.tsx`'s `FeedCardC`,
 * rose active dot, centered under the embed. */
function DotsPager({ posts, idx, onSelect }: { posts: StackPostInfo[]; idx: number; onSelect: (i: number) => void }) {
  return (
    <div role="group" aria-label="Choose a post" className="flex items-center justify-center gap-2 py-3">
      {posts.map((p, i) => (
        <button
          key={p.url}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`View post ${i + 1} of ${posts.length}`}
          aria-current={i === idx ? "true" : undefined}
          className={`rounded-full transition-all ${
            i === idx ? "h-2.5 w-2.5 bg-rose-400" : "h-2 w-2 bg-black/[0.15] hover:bg-black/[0.3]"
          }`}
        />
      ))}
    </div>
  );
}

/** Option B · "Counter + arrows" — a left/right chevron either side of a plain "1 / 3"
 * label; the arrows disable at the ends instead of wrapping. */
function CounterPager({ posts, idx, onSelect }: { posts: StackPostInfo[]; idx: number; onSelect: (i: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={() => onSelect(idx - 1)}
        disabled={idx === 0}
        aria-label="Previous post"
        className="rounded-full p-1 hover:bg-black/[0.05] disabled:opacity-30"
      >
        <CaretLeft size={16} />
      </button>
      <span className="text-xs tabular-nums text-black/[0.5]">
        {idx + 1} / {posts.length}
      </span>
      <button
        type="button"
        onClick={() => onSelect(idx + 1)}
        disabled={idx === posts.length - 1}
        aria-label="Next post"
        className="rounded-full p-1 hover:bg-black/[0.05] disabled:opacity-30"
      >
        <CaretRight size={16} />
      </button>
    </div>
  );
}

/** Option C · "Posted by chips" — one pill per post, avatar + `@handle` of whoever posted
 * it, so switching posts reads as switching between the people who posted them (not an
 * abstract index). */
function ChipsPager({ posts, idx, onSelect }: { posts: StackPostInfo[]; idx: number; onSelect: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-black/[0.4]">Posted by</span>
      {posts.map((p, i) => {
        const active = i === idx;
        const name = p.ownerName ?? p.ownerUsername ?? "Unknown";
        return (
          <button
            key={p.url}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 ring-1 ring-inset ${
              active ? "bg-gray-900 text-white ring-gray-900" : "text-gray-700 ring-black/[0.12] hover:ring-black/[0.3]"
            }`}
          >
            <Avatar src={p.ownerAvatarUrl} name={name} size={20} />
            <span className="max-w-[140px] truncate text-xs">@{p.ownerUsername ?? "unknown"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One demo cell: the real, compliant `InstagramPostEmbed` of the active post (eager,
 * `key`ed by url so switching posts remounts the embed) with the switcher chrome living
 * UNDER it, never over the frame — its own `useState` over `embeddablePosts`. */
function MultiPostCell({
  posts,
  initialIdx,
  variant,
}: {
  posts: StackPostInfo[];
  initialIdx: number;
  variant: "dots" | "counter" | "chips";
}) {
  const [idx, setIdx] = useState(initialIdx);
  const active = posts[idx] ?? null;
  return (
    <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      <div className="w-full [&_iframe]:mb-0!">
        <InstagramPostEmbed key={active?.url ?? "none"} post={active} eager />
      </div>
      {variant === "dots" && <DotsPager posts={posts} idx={idx} onSelect={setIdx} />}
      {variant === "counter" && <CounterPager posts={posts} idx={idx} onSelect={setIdx} />}
      {variant === "chips" && <ChipsPager posts={posts} idx={idx} onSelect={setIdx} />}
    </div>
  );
}

/**
 * D058 follow-on swatch: three treatments of the stack panel's top block ("Hosted at
 * {venue}" + the "↗ Open on Instagram"/"Show caption" meta line the user called "clunky",
 * 2026-09-11), stacked side by side over the SAME real hosted stack so the tiles below are
 * identical in all three. Each 240px-wide panel is fixed-height with its own scroll, the
 * same footprint the real panel has beside a 360px embed in `Card.tsx`. Purely a visual
 * swatch — every Open/Caption control here is inert (no state, `href="#"` where there's no
 * real post URL).
 */
export function Swatches({ stack, multiStack }: { stack: WeddingStack; multiStack: WeddingStack | null }) {
  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);
  const tiles = groups.flatMap((g) => g.vendors);

  const venueLabel = venueVendor ? displayName(venueVendor.name, venueVendor.username) : stack.venue_name ?? "Unknown venue";
  const venueUsernameForLink = venueVendor?.username ?? stack.venue_username;
  const venueHref = venueUsernameForLink ? `/vendors/${encodeURIComponent(venueUsernameForLink)}` : null;
  const venueAvatarUrl = venueVendor?.avatar_url ?? stack.venue_avatar_url;

  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = coverOrFirstPost(stack.post_infos)?.url ?? stack.post_urls[0] ?? null;

  const shared: PanelTopProps = { stack, venueHref, venueLabel, monthYear, openUrl };

  // Multi-post switcher demo (D058 follow-on, 2026-09-11): "the experience for if there's
  // multiple posts isn't ideal ... need a better design than just the dots underneath" —
  // three switcher designs over the same real multi-post stack, each cell tracking its own
  // active post so trying one option never affects the others.
  const multiEmbeddable: StackPostInfo[] = multiStack ? multiStack.post_infos.filter((p) => p.ok && Boolean(p.url)) : [];
  const multiCover = multiStack ? coverPost(multiStack.post_infos) : null;
  const multiInitialIdx = multiCover ? Math.max(0, multiEmbeddable.findIndex((p) => p.url === multiCover.url)) : 0;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">Feed panel-top swatch</h1>
      <p className="mb-6 text-sm text-black/[0.5]">
        Three treatments of the stack panel&apos;s top block, over {venueLabel}&apos;s {monthYear} wedding — same
        tiles below in all three.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-medium text-black/[0.45]">Option 1 · Venue row + action footer</p>
          <div className="h-[600px] w-[240px] overflow-y-auto rounded-2xl border border-black/[0.07] bg-white p-5">
            <Option1Panel {...shared} tiles={tiles} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-black/[0.45]">Option 2 · Venue as first tile + icon buttons</p>
          <div className="h-[600px] w-[240px] overflow-y-auto rounded-2xl border border-black/[0.07] bg-white p-5">
            <Option2Panel {...shared} tiles={tiles} venueAvatarUrl={venueAvatarUrl} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-black/[0.45]">Option 3 · Title panel + text actions</p>
          <div className="h-[600px] w-[240px] overflow-y-auto rounded-2xl border border-black/[0.07] bg-white p-5">
            <Option3Panel {...shared} tiles={tiles} />
          </div>
        </div>
      </div>

      <h2 className="mb-1 mt-12 text-lg font-semibold text-gray-900">
        Multi-post switcher
        {multiStack ? ` · wedding ${multiStack.id} (${multiStack.n_posts} post${multiStack.n_posts === 1 ? "" : "s"})` : ""}
      </h2>
      {multiStack ? (
        <>
          <p className="mb-6 text-sm text-black/[0.5]">
            Three ways to move between posts on the same wedding — the dots pager alone (today) doesn&apos;t scale
            past a couple of posts. Each cell below is independent.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-medium text-black/[0.45]">Option A · Dots (today)</p>
              <MultiPostCell posts={multiEmbeddable} initialIdx={multiInitialIdx} variant="dots" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-black/[0.45]">Option B · Counter + arrows</p>
              <MultiPostCell posts={multiEmbeddable} initialIdx={multiInitialIdx} variant="counter" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-black/[0.45]">Option C · Posted by chips</p>
              <MultiPostCell posts={multiEmbeddable} initialIdx={multiInitialIdx} variant="chips" />
            </div>
          </div>
        </>
      ) : (
        <p className="mb-6 text-sm text-black/[0.5]">
          No hosted multi-post wedding found for this venue to demo the switcher on.
        </p>
      )}
    </div>
  );
}
