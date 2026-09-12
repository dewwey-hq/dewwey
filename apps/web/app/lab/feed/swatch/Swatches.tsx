"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Buildings, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { VendorAvatar } from "@/app/components/feed/VendorAvatar";
import { InstagramPostEmbed } from "@/app/components/feed/InstagramPostEmbed";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, displayName, groupStackByCategory, isDerivedName } from "@/lib/feedDesign";
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

/** Static panel tile cap for this swatch — the real `Card.tsx` folds/scrolls past this,
 * neither of which this demo needs (user asked only for "cap ... at 8"). */
const TILE_CAP = 8;

/** One vendor row — avatar, name (+ `@handle` when derived), role/context subtitle, a
 * small `AddToTeamButton`. Copied from `Card.tsx`'s `CardTile` verbatim (same per-variant
 * duplication convention) so both deck cells render pixel-identical tiles. */
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

/** The static stack panel both deck options share: building-icon venue title, month
 * subtitle, a hairline, then a single column of vendor tiles (venue pinned first, no
 * handles shown), capped at `TILE_CAP` for this swatch. Never changes as the deck's
 * active post changes — only the embed does. */
function VenuePanel({ stack }: { stack: WeddingStack }) {
  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);
  const tiles = [
    ...(venueVendor ? [{ ...venueVendor, extraRoles: [] as string[] }] : []),
    ...groups.flatMap((g) => g.vendors),
  ].slice(0, TILE_CAP);
  const venueLabel = venueVendor ? displayName(venueVendor.name, venueVendor.username) : stack.venue_name ?? "Unknown venue";
  const monthYear = monthYearLabel(stack.event_date_est);

  return (
    <div className="flex flex-col">
      <p className="flex min-w-0 items-center gap-1.5 text-[17px] font-semibold tracking-tight text-gray-900">
        <Buildings size={18} className="shrink-0 text-black/[0.45]" aria-hidden />
        {venueVendor ? (
          <Link href={`/vendors/${encodeURIComponent(venueVendor.username)}`} className="truncate hover:text-gray-600">
            {venueLabel}
          </Link>
        ) : (
          <span className="truncate">{venueLabel}</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-black/[0.45]">{monthYear}</p>
      <div className="mt-3 border-t border-black/[0.06] pt-3" />
      <div className="flex flex-col gap-y-2">
        {tiles.map((v) => (
          <SwatchTile key={`${v.username}-${v.role}`} vendor={v} />
        ))}
      </div>
    </div>
  );
}

/** Every post on the stack that's actually embeddable, falling back to the full list (so a
 * fully-blocked stack still shows `InstagramPostEmbed`'s own fallback card rather than an
 * empty track) — same fallback idea as `Card.tsx`'s `coverOrFirstPost`. */
function embeddableOrAll(stack: WeddingStack): StackPostInfo[] {
  const embeddable = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  return embeddable.length > 0 ? embeddable : stack.post_infos;
}

function initialIdxFor(stack: WeddingStack, posts: StackPostInfo[]): number {
  const cover = coverPost(stack.post_infos);
  return cover ? Math.max(0, posts.findIndex((p) => p.url === cover.url)) : 0;
}

/** Shared carousel-track state for all three pager placements below: mounts the track at
 * `initialIdx` (jump, no smooth scroll, once the track has a real width — mount only, so a
 * later programmatic/manual scroll never gets overridden), then a `scroll` listener
 * (rAF-debounced so a fast swipe doesn't spam `setIdx` mid-gesture) derives the active index
 * from `scrollLeft` so a manual swipe keeps the pager's bars in sync, and `goTo` drives
 * `track.scrollTo` with wrap-around for the arrows/bars. Only the pager's on-screen position
 * differs between the three cells — the track, the scroll math, and this hook are identical. */
function useCarouselTrack(posts: StackPostInfo[], initialIdx: number) {
  const n = posts.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(initialIdx);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    track.scrollLeft = initialIdx * track.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial position only
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const width = track.clientWidth;
        if (width <= 0) return;
        const i = Math.min(n - 1, Math.max(0, Math.round(track.scrollLeft / width)));
        setIdx((prev) => (prev === i ? prev : i));
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [n]);

  const goTo = useCallback(
    (i: number) => {
      const clamped = ((i % n) + n) % n;
      const track = trackRef.current;
      if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
      setIdx(clamped);
    },
    [n],
  );

  return { trackRef, idx, goTo };
}

/** The horizontal snap-scroll media track itself — one full-width slide per embeddable
 * post, swipeable natively on touch, no peek. `overflow-x-hidden` on the wrapper is a guard
 * so the track's own horizontal scroll never leaks into the page; `items-start` on the flex
 * track (rather than a `ResizeObserver`) is what makes the row's height track the tallest
 * loaded slide, since a non-wrapping flex row's auto height is already the max of its
 * children. Identical across all three pager placements — never renders a pager itself. */
function CarouselTrack({ posts, trackRef }: { posts: StackPostInfo[]; trackRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="overflow-x-hidden">
      <div ref={trackRef} className="scrollbar-none flex items-start overflow-x-auto snap-x snap-mandatory overscroll-x-contain">
        {posts.map((post) => (
          <div key={post.url} className="w-full shrink-0 snap-center">
            <div className="w-full [&_iframe]:mb-0!">
              <InstagramPostEmbed post={post} eager />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The arrows-and-bars pager, identical markup in all three cells — only where a caller
 * places this component differs. Renders nothing for a single-post stack. */
function CarouselPager({ posts, idx, goTo }: { posts: StackPostInfo[]; idx: number; goTo: (i: number) => void }) {
  if (posts.length <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => goTo(idx - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.1] text-gray-500 hover:bg-gray-50"
        aria-label="Previous post"
      >
        <CaretLeft size={14} />
      </button>
      <div className="flex gap-1.5">
        {posts.map((p, i) => (
          <button
            key={p.url}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`View post ${i + 1} of ${posts.length}`}
            aria-current={i === idx ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-rose-400" : "w-1.5 bg-gray-200"}`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => goTo(idx + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.1] text-gray-500 hover:bg-gray-50"
        aria-label="Next post"
      >
        <CaretRight size={14} />
      </button>
    </div>
  );
}

type PagerPlacement = "media" | "beside";

/** The one carousel card (360 media column + 240 static `VenuePanel`, same track, same
 * panel) rendered two ways per `pagerPlacement` — the only thing that changes:
 * - "media": today's placement, pager under the media column, inside the card.
 * - "beside": arrows live outside the card entirely (absolutely positioned, vertically
 *   centered on the card), and only the dash/dot indicator row sits underneath it.
 * The `VenuePanel` never changes between placements or between posts — same stack, same
 * tiles, same order — only the pager moves. */
function CarouselCard({ stack, pagerPlacement }: { stack: WeddingStack; pagerPlacement: PagerPlacement }) {
  const posts = embeddableOrAll(stack);
  const { trackRef, idx, goTo } = useCarouselTrack(posts, initialIdxFor(stack, posts));
  const showPager = posts.length > 1;

  const card = (
    <article className="w-full overflow-hidden rounded-2xl border border-black/[0.07] bg-white md:flex md:items-start">
      <div className="border-b border-black/[0.06] p-4 md:w-[360px] md:shrink-0 md:border-b-0 md:border-r">
        <CarouselTrack posts={posts} trackRef={trackRef} />
        {pagerPlacement === "media" && showPager && (
          <div className="mt-5">
            <CarouselPager posts={posts} idx={idx} goTo={goTo} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 p-5 md:w-[240px] md:shrink-0">
        <VenuePanel stack={stack} />
      </div>
    </article>
  );

  if (pagerPlacement === "beside") {
    return (
      <div>
        <div className="relative mx-11">
          {card}
          {showPager && (
            <>
              <button
                type="button"
                onClick={() => goTo(idx - 1)}
                aria-label="Previous post"
                className="absolute top-1/2 -left-11 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.1] bg-white text-gray-500 hover:bg-gray-50"
              >
                <CaretLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => goTo(idx + 1)}
                aria-label="Next post"
                className="absolute top-1/2 -right-11 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.1] bg-white text-gray-500 hover:bg-gray-50"
              >
                <CaretRight size={14} />
              </button>
            </>
          )}
        </div>
        {showPager && (
          <div className="mt-3 flex justify-center gap-1.5">
            {posts.map((p, i) => (
              <button
                key={p.url}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`View post ${i + 1} of ${posts.length}`}
                aria-current={i === idx ? "true" : undefined}
                className={`rounded-full transition-all ${i === idx ? "h-1.5 w-5 bg-rose-400" : "h-1.5 w-1.5 bg-gray-200"}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return card;
}

/**
 * D058 follow-on swatch: the user picked the carousel, then asked "can i see what it'd
 * look like if we had the carousel for the whole card, not just the post ... so like if
 * the arrows were underneath the full card" (2026-09-11), then refined further: "instead
 * of putting the arrows dots and dash underneath the embed, put the arrows OUTSIDE the
 * card, to the left and right of it, and dashes underneath it and dots to signal that it
 * moves." This compares the original "under the photo" placement against that new
 * "arrows beside the card" idea over the SAME real hosted, multi-post stack — wedding 881
 * (The Arbory, 3 posts) by default — via `CarouselCard`'s `pagerPlacement`.
 */
export function Swatches({ multiStack }: { multiStack: WeddingStack | null }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">
        Carousel · pager placement · wedding
        {multiStack ? ` ${multiStack.id} (${multiStack.n_posts} post${multiStack.n_posts === 1 ? "" : "s"})` : ""}
      </h1>
      {multiStack ? (
        <>
          <p className="mb-6 text-sm text-black/[0.5]">
            The vendor stack panel — venue pinned, tiles grouped by category — is identical across both by design;
            only the pager&apos;s placement relative to the card changes.
          </p>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-black/[0.45]">A · Under the photo (today)</p>
              <CarouselCard stack={multiStack} pagerPlacement="media" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-black/[0.45]">D · Arrows beside the card</p>
              <CarouselCard stack={multiStack} pagerPlacement="beside" />
            </div>
          </div>
        </>
      ) : (
        <p className="mb-6 text-sm text-black/[0.5]">
          No hosted multi-post wedding found for this venue to demo the carousel on.
        </p>
      )}
    </div>
  );
}
