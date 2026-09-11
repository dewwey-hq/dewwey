"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Buildings, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { VendorAvatar } from "../components/VendorAvatar";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
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

/** Tracks the front card's real, measured height for `PostDeck` below — a `ResizeObserver`
 * on `frontRef`, with the same "floor while switching" idea as `Card.tsx`'s
 * `switchFloorRef`: when a post switch remounts the embed, its loading placeholder is
 * shorter than the loaded frame, so the height never drops below the pre-switch height
 * until the column has been still for 3s (otherwise the stage visibly collapses and
 * springs back). Never sets an explicit height on the observed element itself — only
 * reports the number for a caller to apply elsewhere — so the front card's own content
 * (the embed) is never constrained or cropped. */
function useFrontCardHeight() {
  const frontRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const floorRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginSwitch = useCallback(() => {
    floorRef.current = frontRef.current ? Math.round(frontRef.current.getBoundingClientRect().height) : null;
  }, []);

  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const h = Math.round(entry.contentRect.height);
      const floor = floorRef.current;
      setHeight(floor != null && h < floor ? floor : h);
      if (floor != null) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          floorRef.current = null;
          setHeight(Math.round(el.getBoundingClientRect().height));
        }, 3000);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { frontRef, height, beginSwitch };
}

/**
 * The concept page's ("galleria-marchetti-v3") `CardDeck` feel, applied to compliant
 * Instagram embeds: a front card with one peeking above-left and one peeking below-right,
 * a pager underneath. Unlike `CardDeck`, the front card's height is never a fixed prop —
 * it's measured live (`useFrontCardHeight`) because a real embed's height varies by post
 * and can't be guessed, and ONLY the front card ever holds content: the two peeks are
 * always empty white cards that merely suggest more, so nothing Instagram delivers is ever
 * cropped, resized, or covered. The stage's own height is the front card's own natural
 * flow height (`renderFront` renders in normal flow, offset by `peekAbove`/`peekBelow`
 * margins) — the measured height only sizes the two decorative peek cards, so a
 * still-loading front card is never clipped even for a single frame.
 */
function PostDeck({
  posts,
  idx,
  onSelect,
  renderFront,
  peekAbove = 14,
  peekBelow = 18,
  maxWidth,
}: {
  posts: StackPostInfo[];
  idx: number;
  onSelect: (i: number) => void;
  renderFront: (post: StackPostInfo | null) => ReactNode;
  peekAbove?: number;
  peekBelow?: number;
  maxWidth: number;
}) {
  const n = posts.length;
  const { frontRef, height, beginSwitch } = useFrontCardHeight();
  if (n === 0) return null;
  const active = posts[idx] ?? null;

  const goTo = (i: number) => {
    beginSwitch();
    onSelect(((i % n) + n) % n);
  };

  return (
    <div>
      <div className="relative mx-auto" style={{ maxWidth }}>
        {n > 1 && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 rounded-2xl border border-black/[0.06] bg-white shadow-lg transition-all duration-300"
            style={{ height: height ?? undefined, transform: "rotate(-3.5deg) scale(0.96)", opacity: 0.6, zIndex: 20 }}
          />
        )}
        {n > 1 && (
          <div
            aria-hidden
            className="absolute inset-x-0 rounded-2xl border border-black/[0.06] bg-white shadow-lg transition-all duration-300"
            style={{
              top: peekAbove + peekBelow,
              height: height ?? undefined,
              transform: "rotate(4deg) scale(0.94)",
              opacity: 0.4,
              zIndex: 10,
            }}
          />
        )}
        <div ref={frontRef} className="relative z-30" style={{ marginTop: peekAbove, marginBottom: peekBelow }}>
          {renderFront(active)}
        </div>
      </div>

      {n > 1 && (
        <div className="mt-5 flex items-center justify-center gap-4">
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
                aria-label={`View post ${i + 1} of ${n}`}
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
      )}
    </div>
  );
}

/** Every post on the stack that's actually embeddable, falling back to the full list (so a
 * fully-blocked stack still shows `InstagramPostEmbed`'s own fallback card in the deck
 * rather than an empty deck) — same fallback idea as `Card.tsx`'s `coverOrFirstPost`. */
function embeddableOrAll(stack: WeddingStack): StackPostInfo[] {
  const embeddable = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  return embeddable.length > 0 ? embeddable : stack.post_infos;
}

function initialIdxFor(stack: WeddingStack, posts: StackPostInfo[]): number {
  const cover = coverPost(stack.post_infos);
  return cover ? Math.max(0, posts.findIndex((p) => p.url === cover.url)) : 0;
}

/** Option A · "Photo deck" — today's `Card.tsx` card (embed at 360, static stack panel at
 * 240) with the MEDIA COLUMN turned into the deck: the embed is the deck's front card,
 * blank cards peek behind it inside the column, and the pager sits under the column. The
 * stack panel to the right never changes as posts flip. */
function PhotoDeckCard({ stack }: { stack: WeddingStack }) {
  const posts = embeddableOrAll(stack);
  const [idx, setIdx] = useState(() => initialIdxFor(stack, posts));

  return (
    <article className="w-full overflow-hidden rounded-2xl border border-black/[0.07] bg-white md:flex md:items-start">
      <div className="border-b border-black/[0.06] p-4 md:w-[360px] md:shrink-0 md:border-b-0 md:border-r">
        <PostDeck
          posts={posts}
          idx={idx}
          onSelect={setIdx}
          maxWidth={360}
          renderFront={(post) => (
            <div className="w-full [&_iframe]:mb-0!">
              <InstagramPostEmbed key={post?.url ?? "none"} post={post} eager />
            </div>
          )}
        />
      </div>
      <div className="min-w-0 flex-1 p-5 md:w-[240px] md:shrink-0">
        <VenuePanel stack={stack} />
      </div>
    </article>
  );
}

/** "Carousel" cell — the same card shell as `PhotoDeckCard` (360 media column, 240 static
 * panel, same `VenuePanel`), but the media column is a horizontal snap-scroll track
 * instead of a flip deck: one full-width slide per embeddable post, swipeable natively on
 * touch, with the same arrows-and-bars pager as `Card.tsx` driving `track.scrollTo`. A
 * `scroll` listener (rAF-debounced) derives the active index from `scrollLeft` so a manual
 * swipe keeps the bars in sync. `overflow-x-hidden` on the column wrapper is a guard so the
 * track's own horizontal scroll never leaks into the page; `items-start` on the flex track
 * (rather than a `ResizeObserver`) is what makes the row's height track the tallest loaded
 * slide, since a non-wrapping flex row's auto height is already the max of its children. */
function CarouselCard({ stack }: { stack: WeddingStack }) {
  const posts = embeddableOrAll(stack);
  const n = posts.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(() => initialIdxFor(stack, posts));

  // Jump (no smooth scroll) to the initial post once the track has a real width — mount
  // only, so a later programmatic/manual scroll never gets overridden.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    track.scrollLeft = idx * track.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial position only
  }, []);

  // Swiping (or a trackpad) scrolls the track directly; this only keeps the pager's bars
  // in sync with wherever the track actually lands. rAF-debounced so a fast swipe doesn't
  // spam `setIdx` mid-gesture.
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

  const goTo = (i: number) => {
    const clamped = ((i % n) + n) % n;
    const track = trackRef.current;
    if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
    setIdx(clamped);
  };

  return (
    <article className="w-full overflow-hidden rounded-2xl border border-black/[0.07] bg-white md:flex md:items-start">
      <div className="border-b border-black/[0.06] p-4 md:w-[360px] md:shrink-0 md:border-b-0 md:border-r">
        <div className="overflow-x-hidden">
          <div
            ref={trackRef}
            className="scrollbar-none flex items-start overflow-x-auto snap-x snap-mandatory overscroll-x-contain"
          >
            {posts.map((post) => (
              <div key={post.url} className="w-full shrink-0 snap-center">
                <div className="w-full [&_iframe]:mb-0!">
                  <InstagramPostEmbed post={post} eager />
                </div>
              </div>
            ))}
          </div>
        </div>
        {n > 1 && (
          <div className="mt-5 flex items-center justify-center gap-4">
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
                  aria-label={`View post ${i + 1} of ${n}`}
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
        )}
      </div>
      <div className="min-w-0 flex-1 p-5 md:w-[240px] md:shrink-0">
        <VenuePanel stack={stack} />
      </div>
    </article>
  );
}

/**
 * D058 follow-on swatch: "the experience for if there's multiple posts isn't ideal ...
 * need a better design than just the dots underneath" (user, 2026-09-11) — followed by
 * "if there's three posts then show another one behind it and we can let the user flip
 * through like the ui ux we have here" pointing at the concept page's `CardDeck`. This
 * replaces the earlier panel-top, multi-post-switcher, and photo-deck/whole-card-deck
 * swatch rounds with a head-to-head: the flip-through stack (`PhotoDeckCard`) against a
 * horizontal snap carousel (`CarouselCard`) over the SAME real hosted, multi-post stack —
 * wedding 881 (The Arbory, 3 posts) by default.
 */
export function Swatches({ multiStack }: { multiStack: WeddingStack | null }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">
        Multi-post · Stack vs Carousel
        {multiStack ? ` · wedding ${multiStack.id} (${multiStack.n_posts} post${multiStack.n_posts === 1 ? "" : "s"})` : ""}
      </h1>
      {multiStack ? (
        <>
          <p className="mb-6 text-sm text-black/[0.5]">
            Stack flips through peeking cards behind the front post; carousel swipes (or uses the arrows) between
            full-width slides in a snap track — both keep every embed full-width and compliant.
          </p>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-black/[0.45]">Stack · photo deck</p>
              <PhotoDeckCard stack={multiStack} />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-black/[0.45]">Carousel</p>
              <CarouselCard stack={multiStack} />
            </div>
          </div>
        </>
      ) : (
        <p className="mb-6 text-sm text-black/[0.5]">
          No hosted multi-post wedding found for this venue to demo the deck on.
        </p>
      )}
    </div>
  );
}
