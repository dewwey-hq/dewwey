"use client";

import { useState } from "react";
import Link from "next/link";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { VendorAvatar } from "../components/VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory, displayName, isDerivedName } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import type { EmbedSize, Side, Split, TileCols } from "../variant";
import type { StackVendor, WeddingStack } from "@/lib/server/graph";

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

/** Tiles visible before the "+N more vendors" fold. One column of tiles (the stack column is
 * capped at 340-400px beside the embed, so two columns truncated every name); the cap is
 * higher when the embed is tall (540/470 in 1-up) so the column fills the embed's height. */
const TILE_CAP = 6;
const TILE_CAP_TALL = 9;
const TILE_CAP_TALL_2COL = 12;

/** One tile in the stack grid — avatar, name (+ `@handle` when the name had to be
 * derived from it, large screens only), role/context subtitle, small `AddToTeamButton`.
 * Roster's tile shape (`RosterTile`), duplicated here per the lab's per-variant
 * convention, with Card's own `isDerivedName` `@handle` behavior kept. */
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

/** One card: a compliant `embed.js` embed flush against the card's own edges (so the
 * card's rounded corners clip the embed's own white border, nothing else) beside a
 * Roster-styled stack panel — "Hosted at {venue}" header, muted meta line, 2-col tile
 * grid with a 6-tile fold. Dots pager + "Show caption" toggle live under/near the embed.
 * No ResizeObserver height cap — the card is simply as tall as the taller column, panel
 * top-aligned via `md:items-start`. */
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
  const cover = coverPost(stack.post_infos);
  const initialIdx = cover ? Math.max(0, embeddablePosts.findIndex((p) => p.url === cover.url)) : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [interacted, setInteracted] = useState(false);
  const [captioned, setCaptioned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so InstagramPostEmbed's
  // own blocked-owner path has the real owner/caption instead of showing nothing.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);

  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = activePost?.url ?? stack.post_urls[0] ?? null;

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
  const tiles = groups.flatMap((g) => g.vendors);
  const tileCap = compact ? TILE_CAP : tileCols === 2 ? TILE_CAP_TALL_2COL : TILE_CAP_TALL;
  const visibleTiles = expanded ? tiles : tiles.slice(0, tileCap);
  const hiddenCount = tiles.length - visibleTiles.length;
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
  const embedCol = twoUp ? `minmax(326px, ${split}fr)` : `${embedWidth}px`;
  const panelCol = twoUp ? `minmax(0, ${100 - split}fr)` : `${panelWidthFor(embedWidth, split)}px`;
  const cardLayoutClass = `${SIDE_BY_SIDE_CLASS} md:items-start`;
  const cardStyle = {
    "--card-cols": flipped ? `${panelCol} ${embedCol}` : `${embedCol} ${panelCol}`,
  } as React.CSSProperties;
  const mediaBorderClass = flipped
    ? "border-b border-black/[0.06] md:order-2 md:border-b-0 md:border-l"
    : "border-b border-black/[0.06] md:border-b-0 md:border-r";
  const panelOrderClass = flipped ? "md:order-1" : "";

  return (
    <article
      className={`w-full overflow-hidden rounded-2xl border border-black/[0.07] bg-white ${
        twoUp ? "" : "md:mx-auto md:w-fit md:max-w-full"
      } ${cardLayoutClass}`}
      style={cardStyle}
    >
      {/* Media -- flush against the card's own edges (no padding) so the card's rounded
          corners clip the embed's own white border on the left/top/bottom-left; nothing
          else drawn over it. Dots pager (Roster-style) directly under the embed. */}
      <div className={`flex flex-col ${mediaBorderClass}`}>
        {/* embed.js puts an inline `margin: 0 0 12px` on the iframe it injects -- that was the
            "tail" under the post (user, 2026-09-11); zero it here, scoped to this column only. */}
        <div className="w-full [&_iframe]:mb-0!" style={{ maxWidth: embedWidth }}>
          <InstagramPostEmbed
            key={`${activePost?.url ?? "none"}-${captioned ? "cap" : "nocap"}`}
            post={activePost}
            eager={eagerCover || interacted}
            captioned={captioned}
          />
        </div>
        {embeddablePosts.length > 1 && (
          <div role="group" aria-label="Choose a post" className="flex items-center justify-center gap-2 py-3">
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

      {/* Stack panel -- white (no grey), Roster's Hosted-at header + meta line + tile
          grid, venue excluded (already the Hosted line), 6-tile fold. */}
      <div className={`flex min-w-0 flex-col p-5 md:self-start ${panelOrderClass}`}>
        <p className="text-[15px] font-semibold text-gray-900">
          <span className="font-semibold text-gray-500">Hosted at </span>
          {venueVendor ? (
            <Link href={`/vendors/${encodeURIComponent(venueVendor.username)}`} className="hover:text-gray-600">
              {venueLabel}
            </Link>
          ) : (
            venueLabel
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-black/[0.45]">
          <span>
            {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
          </span>
          {activePost?.postType === "Video" && (
            <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Reel
            </span>
          )}
          {activePost?.postType === "Sidecar" && (
            <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Carousel
            </span>
          )}
          {openUrl && (
            <>
              <span aria-hidden>·</span>
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
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => setCaptioned((c) => !c)}
            aria-pressed={captioned}
            className="font-medium text-gray-600 hover:text-gray-900"
          >
            {captioned ? "Hide caption" : "Show caption"}
          </button>
        </p>

        <div className={`mt-4 grid gap-y-2 [&>*]:min-w-0 ${tileCols === 2 && !compact ? "grid-cols-2 gap-x-3" : "grid-cols-1"}`}>
          {visibleTiles.map((v) => (
            <CardTile key={`${v.username}-${v.role}`} vendor={v} />
          ))}
        </div>

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 w-full rounded-lg border border-black/[0.07] py-1.5 text-xs font-medium text-black/[0.45] hover:bg-black/[0.02] hover:text-gray-900"
          >
            +{hiddenCount} more vendor{hiddenCount === 1 ? "" : "s"}
          </button>
        )}
        {expanded && tiles.length > tileCap && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 w-full rounded-lg border border-black/[0.07] py-1.5 text-xs font-medium text-black/[0.45] hover:bg-black/[0.02] hover:text-gray-900"
          >
            Show fewer
          </button>
        )}
      </div>
    </article>
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
 * drive a narrower/2-up card to a single-column tile grid; the panel is no longer
 * height-capped to the embed (that used a `ResizeObserver`, now removed) — it's simply
 * top-aligned (`md:items-start`) and the card is as tall as its taller column.
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
