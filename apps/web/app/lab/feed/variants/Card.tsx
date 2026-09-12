"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Buildings, CaretLeft, CaretRight, Image as ImageIcon, TextAlignLeft } from "@phosphor-icons/react";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { VendorAvatar } from "../components/VendorAvatar";
import { Avatar } from "@/app/components/Avatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory, displayName } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import type { EmbedSize, Side, Split, TileCols } from "../variant";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

/** "July 2026" — no couple names anywhere in this variant (user feedback, 2026-09-11:
 * keep the card, drop `titleFromCaption`). Wedding dates are date-only; read as UTC so a
 * local timezone can't push the month/year off by one (same rationale as
 * `formatEventDate`). */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Side-by-side grid template as a CSS variable (`--card-cols`), so the embed share
 * (`split`, user 2026-09-11) can be any of the allowed percentages without a static class
 * per combination: the embed column is `embedWidth`, the stack column is derived from the
 * share (`embedWidth * (100 - split) / split`) because the embed itself can't grow past
 * Meta's 540px. Tailwind only needs the one arbitrary-property class below. */
const SIDE_BY_SIDE_CLASS = "md:grid md:[grid-template-columns:var(--card-cols)]";
function panelWidthFor(embedWidth: number, split: number): number {
  return Math.round((embedWidth * (100 - split)) / split);
}

/** Mobile-only fold cap. At md+ the stack panel now shows every tile and scrolls
 * internally instead of folding (user feedback, 2026-09-11: don't grow the card past the
 * embed's height, offer a scroll) -- the fold only still makes sense below md, where the
 * panel is stacked under the embed with no height to respect. */
const TILE_CAP = 6;

/** One tile in the stack grid — avatar, name (+ `@handle` when the name had to be
 * derived from it, large screens only), role/context subtitle, small `AddToTeamButton`.
 * Roster's tile shape (`RosterTile`), duplicated here per the lab's per-variant
 * convention; no `@handle` suffix (user, 2026-09-11: "we don't need the instagram handles"). */
function CardTile({ vendor }: { vendor: StackVendor & { extraRoles: string[] } }) {
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
        <span className="block truncate text-sm font-medium">{vName}</span>
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

/** FLIP target for "Show caption" (user, 2026-09-11: "instead of it elongating the post,
 * if we have the caption take over the image") — replaces the embed+dots content in the
 * media column at the SAME height that column was last measured at, so toggling never
 * resizes the card. Owner row (avatar + `@handle`, linked to the post) up top (the Photo pill
 * in the action row flips back), caption text scrolling within the fixed height below. */
function PostCaptionCard({
  post,
  height,
}: {
  post: StackPostInfo | null;
  height: number;
}) {
  const ownerName = post?.ownerName ?? post?.ownerUsername ?? "Unknown";
  return (
    <div className="flex w-full flex-col bg-neutral-50 p-5" style={{ height }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar src={post?.ownerAvatarUrl ?? null} name={ownerName} size={32} />
          {post?.ownerUsername ? (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-gray-900 hover:text-gray-600"
            >
              @{post.ownerUsername}
            </a>
          ) : (
            <span className="truncate text-sm font-medium text-gray-900">Unknown owner</span>
          )}
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
        {post?.caption || "No caption on this post."}
      </div>
    </div>
  );
}

/** One card: a compliant `embed.js` embed flush against the card's own edges (so the
 * card's rounded corners clip the embed's own white border, nothing else) beside a
 * Roster-styled stack panel — "Hosted at {venue}" header, muted meta line, a hairline
 * divider, then the tile grid. Dots pager + "Show caption" toggle live under/near the
 * embed. A `ResizeObserver` on the media column feeds `mediaHeight`, exposed as the
 * `--media-h` CSS variable on the article: at md+ the stack panel is capped to that
 * height and scrolls internally (user, 2026-09-11: "keep instagram post as the
 * determining factor for the size of the card ... offer a scroll" instead of expanding
 * past it) with a bottom fade while there's more to scroll to; below md there's no
 * side-by-side height to respect, so it keeps the old 6-tile fold instead. */
function FeedCardC({
  stack,
  eagerCover,
  embedWidth,
  twoUp,
  split,
  tileCols,
  mediaSide,
}: {
  stack: WeddingStack;
  eagerCover: boolean;
  embedWidth: EmbedSize;
  twoUp: boolean;
  split: Split;
  tileCols: TileCols;
  mediaSide: Side;
}) {
  const embeddablePosts = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  const n = embeddablePosts.length;
  const cover = coverPost(stack.post_infos);
  const initialIdx = cover ? Math.max(0, embeddablePosts.findIndex((p) => p.url === cover.url)) : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [captioned, setCaptioned] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Carousel track (D058 user pick, 2026-09-11: swipeable snap carousel over the
  // flip-through deck) -- one full-width slide per embeddable post, ported from the
  // swatch's `CarouselCard`. Mount-only jump to the cover slide (no smooth scroll, so it
  // never fights a later programmatic/manual scroll); after that, `goToPost`'s smooth
  // `scrollTo` and native swipes both land on this same rAF-debounced scroll listener,
  // which derives `idx` from `scrollLeft` so the pager's bars stay in sync either way.
  const trackRef = useRef<HTMLDivElement>(null);
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

  const goToPost = (i: number) => {
    beginPostSwitch();
    const clamped = ((i % n) + n) % n;
    const track = trackRef.current;
    if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
    setIdx(clamped);
  };

  // Media column height, fed to the stack panel's `--media-h` cap (below) and reused as
  // the caption card's fixed height on flip -- same state either way, so the two always
  // agree and the card never resizes when "Show caption" is toggled.
  const mediaRef = useRef<HTMLDivElement>(null);
  const [mediaHeight, setMediaHeight] = useState<number | null>(null);
  // The embed+dots region alone (the part the caption card replaces) -- the media column
  // also holds the action row below it, which stays visible while the caption shows.
  const swapRef = useRef<HTMLDivElement>(null);
  const [swapHeight, setSwapHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = swapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const h = Math.round(entry.contentRect.height);
      if (h > 0) setSwapHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Switching posts remounts the embed, and its loading placeholder is shorter than the
  // loaded frame -- without a floor the panel cap collapsed and sprang back, which read as
  // "the stack reloads" (user, 2026-09-11). While a switch is in flight the cap never drops
  // below the previous height; the floor clears once the column has been still for 3 s.
  const switchFloorRef = useRef<number | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginPostSwitch = useCallback(() => {
    switchFloorRef.current = mediaRef.current ? Math.round(mediaRef.current.getBoundingClientRect().height) : null;
  }, []);
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const h = Math.round(entry.contentRect.height);
      const floor = switchFloorRef.current;
      setMediaHeight(floor != null && h < floor ? floor : h);
      if (floor != null) {
        if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
        switchTimerRef.current = setTimeout(() => {
          switchFloorRef.current = null;
          setMediaHeight(Math.round(el.getBoundingClientRect().height));
        }, 3000);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    };
  }, []);

  // Stack panel scroll state, for the bottom fade -- only shown at md+ while there's more
  // below the fold to scroll to (not merely because the panel happens to be scrollable).
  const panelRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const updateScrollState = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);
  useEffect(() => {
    updateScrollState();
  }, [mediaHeight, updateScrollState]);
  useEffect(() => {
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState]);

  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so InstagramPostEmbed's
  // own blocked-owner path has the real owner/caption instead of showing nothing.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);

  const monthYear = monthYearLabel(stack.event_date_est);

  // User feedback (2026-09-11): "the cards ... too large, make them smaller within
  // Instagram guidance" -- `embedWidth` (360/400/470, Instagram's floor is 326) drives
  // the media column's max width; `twoUp` stacks media above the panel instead of beside
  // it so two cards fit side by side. Below 400px-equivalent-or-narrower, or in 2-up
  // (where each card is already half-width), the stack panel switches to a single-column
  // tile grid so vendor names don't truncate.
  const compact = embedWidth <= 400 || twoUp;

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);
  // The page's venue is pinned as the FIRST tile (user, 2026-09-11: "show the selected
  // venue/whatever vendor as the top in the credit stack"), then everyone else by category.
  const tiles = [
    ...(venueVendor ? [{ ...venueVendor, extraRoles: [] as string[] }] : []),
    ...groups.flatMap((g) => g.vendors),
  ];
  // Fold (user, 2026-09-11: "if the vendor stack is too long, naturally condense it and add
  // the show-more button ... so it doesn't show the scroll bar"): the cap is however many
  // tiles fit beside the embed -- derived from the measured media height minus the panel's
  // header/divider/button chrome (~150px) at ~44px per tile -- so the folded panel never
  // needs to scroll. Expanded, the panel still can't outgrow the embed; it scrolls with the
  // scrollbar hidden (`scrollbar-none`) and the fade below as the only affordance.
  const tileCap = mediaHeight != null ? Math.max(4, Math.floor((mediaHeight - 150) / 44)) : TILE_CAP;
  const hiddenCount = Math.max(0, tiles.length - tileCap);
  // Card has no `venue` prop (unlike Roster's `venueFallbackName`) -- `stack.venue_name`
  // is already the per-wedding fallback straight from the query, so no new prop is needed.
  const venueLabel = venueVendor ? displayName(venueVendor.name, venueVendor.username) : (stack.venue_name ?? "Unknown venue");

  // Side by side at md+ in BOTH layouts (user, 2026-09-11: in 2-up "the hosted at ... just
  // shows at the bottom unfortunately"). 1-up: fixed px columns (embed at `embedWidth`, stack
  // derived from `split`). 2-up: the cell is ~half the page, so fractional columns in the
  // same ratio with the embed's 326px floor; the embed fills its column (≤540). `mediaSide`
  // flips the column order (and the template) — the card's overflow-hidden rounds whichever
  // corners the embed ends up on.
  const flipped = mediaSide === "right";
  // 2-up: the embed column is `split`% of the card but never wider than the embed itself can
  // be (540px) -- below xl the 2-up grid collapses to one column, and without the cap the
  // column outgrew the embed and left a blank strip before "Hosted at" (user, 2026-09-11).
  const embedCol = twoUp ? `minmax(326px, min(${embedWidth}px, ${split}%))` : `${embedWidth}px`;
  const panelCol = twoUp ? "minmax(0, 1fr)" : `${panelWidthFor(embedWidth, split)}px`;
  const cardLayoutClass = `${SIDE_BY_SIDE_CLASS} md:items-start`;
  const cardStyle = {
    "--card-cols": flipped ? `${panelCol} ${embedCol}` : `${embedCol} ${panelCol}`,
    // Unset (rather than a guessed default) until the ResizeObserver's first callback --
    // `var()` referencing an unset custom property makes `max-height` invalid, so the
    // panel simply isn't capped yet, which is the right behavior for that one frame.
    ...(mediaHeight != null ? { "--media-h": `${mediaHeight}px` } : {}),
  } as React.CSSProperties;
  const mediaBorderClass = flipped
    ? "border-b border-black/[0.06] md:order-2 md:border-b-0 md:border-l"
    : "border-b border-black/[0.06] md:border-b-0 md:border-r";
  const panelOrderClass = flipped ? "md:order-1" : "";

  return (
    <div className={`relative ${twoUp ? "" : "md:mx-auto md:w-fit md:max-w-full"}`}>
    {/* Post switcher (user pick D, 2026-09-11): round arrows OUTSIDE the card, flanking it
        at md+ (hidden on phone, where the track swipes), and a dash-for-active / dots-for-
        the-rest row centered under the card. Nothing under the embed inside the card. */}
    {n > 1 && (
      <>
        <button
          type="button"
          onClick={() => goToPost((idx - 1 + n) % n)}
          className="absolute -left-11 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.1] bg-white text-gray-500 hover:bg-gray-50 md:flex"
          aria-label="Previous post"
        >
          <CaretLeft size={14} />
        </button>
        <button
          type="button"
          onClick={() => goToPost((idx + 1) % n)}
          className="absolute -right-11 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.1] bg-white text-gray-500 hover:bg-gray-50 md:flex"
          aria-label="Next post"
        >
          <CaretRight size={14} />
        </button>
      </>
    )}
    <article
      className={`w-full overflow-hidden rounded-2xl border border-black/[0.07] bg-white ${cardLayoutClass}`}
      style={cardStyle}
    >
      {/* Media -- flush against the card's own edges (no padding) so the card's rounded
          corners clip the embed's own white border on the left/top/bottom-left; nothing
          else drawn over it. Dots pager (Roster-style) directly under the embed. */}
      <div ref={mediaRef} className={`flex flex-col ${mediaBorderClass}`}>
        {/* Embed + dots pager stay mounted (never unmounted, so flipping back to the photo
            never reloads embed.js's iframe) but hidden while the caption card is showing --
            it takes over this same column at the column's last-measured height instead of
            growing it (user, 2026-09-11: "have the caption take over the image"). */}
        <div ref={swapRef} hidden={captioned}>
          {/* Snap track -- one full-width slide per embeddable post, swipeable natively on
              touch, ported from the swatch's `CarouselCard`. `overflow-x-hidden` on the
              outer wrapper is a guard so the track's own horizontal scroll never leaks into
              the page; `items-start` on the non-wrapping flex row is what makes the row's
              height track the tallest loaded slide. Only the cover slide is `eager` --
              every other slide relies on `InstagramPostEmbed`'s own IntersectionObserver
              lazy mount, which fires naturally as it's scrolled into view. embed.js puts an
              inline `margin: 0 0 12px` on the iframe it injects -- that was the "tail" under
              the post (user, 2026-09-11); zero it here, scoped to this column only. */}
          <div className="overflow-x-hidden">
            <div
              ref={trackRef}
              className="scrollbar-none flex items-start overflow-x-auto snap-x snap-mandatory overscroll-x-contain"
            >
              {embeddablePosts.map((p, i) => (
                <div key={p.url} className="w-full shrink-0 snap-center">
                  <div className="w-full [&_iframe]:mb-0!" style={{ maxWidth: embedWidth }}>
                    <InstagramPostEmbed post={p} eager={i === initialIdx && eagerCover} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {captioned && (
          <PostCaptionCard post={activePost} height={swapHeight ?? 480} />
        )}
      </div>

      {/* Stack panel -- white (no grey), Roster's Hosted-at header + meta line + tile
          grid, venue excluded (already the Hosted line). Capped to the media column's
          height at md+ (`--media-h`) and scrolls internally instead of growing the card;
          below md it's the old 6-tile fold with no cap. */}
      <div
        ref={panelRef}
        onScroll={updateScrollState}
        className={`scrollbar-none relative min-w-0 md:max-h-(--media-h) md:self-start md:overflow-y-auto ${panelOrderClass}`}
      >
        <div className="flex flex-col p-5">
          {/* Swatch Option 3 (user pick, 2026-09-11) with a building icon so "venue" isn't
              undersold: the venue name IS the panel title; one subtitle line. The only
              action is the caption/photo flip, icon-only, top-right (no "Open" -- the embed's
              own "View more on Instagram" covers it). */}
          <div className="flex items-start justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-[17px] font-semibold tracking-tight text-gray-900">
              <Buildings size={18} className="shrink-0 text-black/[0.45]" aria-hidden />
              {venueVendor ? (
                <Link
                  href={`/vendors/${encodeURIComponent(venueVendor.username)}`}
                  className="truncate hover:text-gray-600"
                >
                  {venueLabel}
                </Link>
              ) : (
                <span className="truncate">{venueLabel}</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setCaptioned((c) => !c)}
              aria-pressed={captioned}
              title={captioned ? "Back to the photo" : "Read the post's caption"}
              className={`-mt-0.5 inline-flex w-[78px] shrink-0 items-center justify-center gap-1 rounded-full py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
                captioned
                  ? "bg-gray-900 text-white ring-gray-900"
                  : "bg-white text-gray-600 ring-black/[0.12] hover:text-gray-900 hover:ring-black/[0.3]"
              }`}
            >
              {captioned ? <ImageIcon size={13} /> : <TextAlignLeft size={13} />}
              {captioned ? "Photo" : "Caption"}
            </button>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-black/[0.45]">
            <span>{monthYear}</span>
            {activePost?.postType === "Video" && (
              <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-600">
                Reel
              </span>
            )}
          </p>

          {/* Hairline separating the header/meta block from the vendor stack (user,
              2026-09-11: "consider adding lines to separate the hosted the arbory part
              and ... the vendor stack"). */}
          <div className="mt-3 border-t border-black/[0.06] pt-3" />

          <div className={`grid gap-y-2 [&>*]:min-w-0 ${tileCols === 2 && !compact ? "grid-cols-2 gap-x-3" : "grid-cols-1"}`}>
            {tiles.map((v, i) => (
              <div key={`${v.username}-${v.role}`} className={i >= tileCap && !expanded ? "hidden" : ""}>
                <CardTile vendor={v} />
              </div>
            ))}
          </div>

          {hiddenCount > 0 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 w-full rounded-lg border border-black/[0.07] py-1.5 text-xs font-medium text-black/[0.45] hover:bg-black/[0.02] hover:text-gray-900"
            >
              Show more ({hiddenCount})
            </button>
          )}
          {expanded && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-2 w-full rounded-lg border border-black/[0.07] py-1.5 text-xs font-medium text-black/[0.45] hover:bg-black/[0.02] hover:text-gray-900"
            >
              Show less
            </button>
          )}
        </div>

        {/* Bottom scroll affordance -- only while the panel is actually capped and there's
            more below the fold (user, 2026-09-11: offer a scroll instead of expanding).
            `-mt-8` pulls it over the last 32px of content instead of adding scroll height
            of its own; `sticky bottom-0` keeps it pinned while scrolling. */}
        {canScrollMore && (
          <div
            aria-hidden
            className="pointer-events-none sticky bottom-0 -mt-8 hidden h-8 bg-gradient-to-t from-white to-transparent md:block"
          />
        )}
      </div>
    </article>
    {n > 1 && (
      <div role="group" aria-label="Choose a post" className="mt-3 flex items-center justify-center gap-1.5">
        {embeddablePosts.map((p, i) => (
          <button
            key={p.url}
            type="button"
            onClick={() => goToPost(i)}
            aria-label={`View post ${i + 1} of ${n}`}
            aria-current={i === idx ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-rose-400" : "w-1.5 bg-gray-200 hover:bg-gray-300"}`}
          />
        ))}
      </div>
    )}
    </div>
  );
}

/**
 * C. Card — user feedback (2026-09-11): "labeled 'Role · Name' rows are the discovery
 * tool, hover is slow" — the shape of today's `WeddingFeedCard` (photo left, labeled
 * vendor list right, one card = one wedding), made compliant (official `embed.js` embed,
 * no crop). A later round the same day ("I like when the Instagram post has rounded edge
 * on the left top corner and bottom left corner... I like Roster's Hosted at/date/post
 * line and the way we did the stack there — I just want it beside the photo, not beneath
 * it") pulled Roster's (variant F) header/meta/tile-grid styling in here: no couple names
 * (month + year only), a flush, unpadded embed so the card's own rounding clips the
 * embed's corner, "Hosted at {venue}" as plain text (no pinned avatar row/pill), and the
 * stack as a 2-column grid of vendor tiles instead of a category-headed list — category
 * order is preserved (`groupStackByCategory`) but the category labels are no longer
 * drawn. `embedWidth`/`twoUp` (`FeedLab.tsx`'s Size/Layout controls, C and D only) still
 * drive a narrower/2-up card to a single-column tile grid. A further round the same day
 * ("keep instagram post as the determining factor for the size of the card ... offer a
 * scroll" / "have the caption take over the image") re-added a `ResizeObserver` on the
 * media column (`FeedCardC`): at md+ the panel is capped to that height and scrolls
 * internally instead of expanding the card, and "Show caption" flips the same column to
 * a same-height caption card instead of remounting the embed captioned. Below md the
 * panel keeps the old 6-tile fold, since there's no side-by-side height to respect there.
 */
export function Card({
  stacks,
  embedWidth,
  twoUp,
  split,
  tileCols,
  mediaSide,
}: {
  stacks: WeddingStack[];
  embedWidth: EmbedSize;
  twoUp: boolean;
  split: Split;
  tileCols: TileCols;
  mediaSide: Side;
}) {
  return (
    <div
      className={
        twoUp
          ? "grid grid-cols-1 gap-4 xl:grid-cols-2"
          : "mx-auto flex max-w-6xl flex-col gap-6"
      }
    >
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <FeedCardC
            stack={stack}
            eagerCover={i < 2}
            embedWidth={embedWidth}
            twoUp={twoUp}
            split={split}
            tileCols={tileCols}
            mediaSide={mediaSide}
          />
        </MeasuredCard>
      ))}
    </div>
  );
}
