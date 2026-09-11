"use client";

import { useState } from "react";
import Link from "next/link";
import { InstagramPostEmbed } from "../components/InstagramPostEmbed";
import { MeasuredCard } from "../components/MeasuredCard";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverPost, coverOrFirstPost, groupStackByCategory, displayName } from "@/lib/feedDesign";
import { contextLabel, roleLabel } from "@/lib/roles";
import type { EmbedSize } from "../variant";
import type { StackCategoryGroup } from "@/lib/feedDesign";
import type { StackPostInfo, StackVendor, WeddingStack } from "@/lib/server/graph";

type LedgerVendor = StackVendor & { extraRoles: string[] };

/** "November 2025" — same local helper as `Card.tsx`/`Recipe.tsx` (not centralized;
 * same-rules addition per variant). Read as UTC since wedding dates are date-only. */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The D-style dead/blocked-post block, at the embed's own width — same copy as
 * `Recipe.tsx`'s `RecipeFallback` (duplicated locally, same-rules addition per variant),
 * reusing `InstagramPostEmbed`'s own blocked-owner/timeout detection via `renderFallback`. */
function LedgerFallback({ post }: { post: StackPostInfo | null }) {
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

/**
 * One ledger line: `CATEGORY   Name, Name (context), Name`. Names beyond the visible cap
 * collapse into a "+N" that expands inline. A line-level `AddToTeamButton` only appears
 * when the category names exactly one vendor — with more than one name on a line, there's
 * no single unambiguous target for a single save button, so it's omitted rather than
 * guessing (clicking a name still reaches that vendor's own page, which has its own save
 * action).
 */
function CategoryLine({
  group,
  compact,
  showSave,
}: {
  group: StackCategoryGroup<LedgerVendor>;
  compact: boolean;
  showSave: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxNames = compact ? 2 : 3;
  const visible = expanded ? group.vendors : group.vendors.slice(0, maxNames);
  const hiddenCount = group.vendors.length - visible.length;
  const saveVendor = showSave && group.vendors.length === 1 ? group.vendors[0] : null;

  return (
    <div className="flex items-start gap-2 break-inside-avoid py-1">
      <span className="w-[110px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-black/[0.4]">
        {group.label.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed text-gray-500">
        {visible.map((v, i) => {
          const ctx = v.contexts
            .map((c) => contextLabel(c))
            .filter((c): c is string => Boolean(c))[0];
          // A second role earned by dedupe (e.g. "Catering · Bar service") shares the
          // same parenthetical the context modifier already uses on this line.
          const extraRoleChip = v.extraRoles.map((r) => roleLabel(r)).join(" · ");
          const parenthetical = [extraRoleChip, ctx].filter(Boolean).join(" · ");
          return (
            <span key={v.username}>
              <Link
                href={`/vendors/${encodeURIComponent(v.username)}`}
                className="font-medium text-gray-900 hover:text-gray-600"
              >
                {displayName(v.name, v.username)}
              </Link>
              {parenthetical && (
                <span className="text-xs font-normal text-black/[0.4]"> ({parenthetical})</span>
              )}
              {i < visible.length - 1 ? ", " : ""}
            </span>
          );
        })}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-1 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            +{hiddenCount}
          </button>
        )}
      </span>
      {saveVendor && (
        // Visually ~20px (the component itself is a fixed 24px hit target -- scaled down
        // rather than editing the shared `AddToTeamButton` for one lab variant).
        <span className="inline-block shrink-0 scale-[0.83]">
          <AddToTeamButton
            accountId={saveVendor.accountId}
            username={saveVendor.username}
            name={saveVendor.name}
            role={saveVendor.role}
            avatarUrl={saveVendor.avatar_url}
          />
        </span>
      )}
    </div>
  );
}

function LedgerRow({
  stack,
  eagerCover,
  embedWidth,
  twoUp,
}: {
  stack: WeddingStack;
  eagerCover: boolean;
  embedWidth: EmbedSize;
  twoUp: boolean;
}) {
  const embeddablePosts = stack.post_infos.filter((p) => p.ok && Boolean(p.url));
  const cover = coverPost(stack.post_infos);
  const initialIdx = cover ? Math.max(0, embeddablePosts.findIndex((p) => p.url === cover.url)) : 0;
  const [idx, setIdx] = useState(initialIdx);
  const [interacted, setInteracted] = useState(false);
  const [foldExpanded, setFoldExpanded] = useState(false);
  const activeEmbeddable = embeddablePosts[idx] ?? null;
  // Nothing embeddable at all -- fall back to the first post anyway so the fallback
  // presentation still has a real post URL to link out to.
  const activePost = activeEmbeddable ?? coverOrFirstPost(stack.post_infos);

  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = activePost?.url ?? stack.post_urls[0] ?? null;

  // Same compact rule as C/D: <=400px-equivalent or 2-up switches density automatically.
  const compact = embedWidth <= 400 || twoUp;
  const foldAt = compact ? 4 : 5;
  // A save button only when there's real room for it (wide embed, 1-up) -- keeps lines
  // clean otherwise, per the spec.
  const showSave = embedWidth >= 400 && !twoUp;

  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const allGroups = groupStackByCategory(others);
  const visibleGroups = allGroups.slice(0, foldAt);
  const foldedGroups = allGroups.slice(foldAt);
  const foldedVendorCount = foldedGroups.reduce((sum, g) => sum + g.vendors.length, 0);

  return (
    <div
      className={
        twoUp
          ? "flex flex-col items-start gap-3"
          : "flex flex-col items-start gap-3 md:flex-row"
      }
    >
      {/* Media -- nothing around it; height follows the embed, never cropped/forced. */}
      <div className="w-full shrink-0" style={{ maxWidth: embedWidth }}>
        <InstagramPostEmbed
          key={activePost?.url ?? "none"}
          post={activePost}
          eager={eagerCover || interacted}
          renderFallback={({ post }) => <LedgerFallback post={post} />}
        />
        {embeddablePosts.length > 1 && (
          <div
            role="group"
            aria-label="Choose a post"
            className="mt-3 flex items-center justify-center gap-2"
          >
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
                  i === idx
                    ? "h-2.5 w-2.5 bg-rose-400"
                    : "h-2 w-2 bg-black/[0.15] hover:bg-black/[0.3]"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stack card -- a plain bordered rectangle, content-height only (the row's
          `items-start` keeps it from stretching to the embed's height). */}
      <div className="w-full flex-1 self-start rounded-2xl border border-black/[0.07] bg-white p-4 md:p-5">
        {venueVendor && (
          <p className="text-[15px] font-semibold text-gray-900">
            <span className="font-semibold text-gray-500">Hosted at </span>
            <Link
              href={`/vendors/${encodeURIComponent(venueVendor.username)}`}
              className="hover:text-gray-600"
            >
              {displayName(venueVendor.name, venueVendor.username)}
            </Link>
          </p>
        )}
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

        <div className={`mt-3 ${twoUp ? "" : "xl:columns-2 xl:gap-x-6"}`}>
          {visibleGroups.map((group) => (
            <CategoryLine key={group.slug} group={group} compact={compact} showSave={showSave} />
          ))}
          {foldedGroups.length > 0 && (
            <div className="break-inside-avoid py-1">
              <button
                type="button"
                onClick={() => setFoldExpanded((e) => !e)}
                aria-expanded={foldExpanded}
                className="text-xs font-medium text-black/[0.45] hover:text-gray-900"
              >
                {foldExpanded
                  ? "Show fewer"
                  : `${foldedGroups.map((g) => g.label).join(", ")} · ${foldedVendorCount} vendor${
                      foldedVendorCount === 1 ? "" : "s"
                    }`}
              </button>
              {foldExpanded && (
                <div className="mt-1">
                  {foldedGroups.map((group) => (
                    <CategoryLine
                      key={group.slug}
                      group={group}
                      compact={compact}
                      showSave={showSave}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * E. Ledger — no outer card. Each wedding is a row: the intact embed on the left with
 * nothing around it, and a plain bordered "stack card" beside it (below it in 2-up) whose
 * height is its own content, never the embed's. The stack card is a record, not a rail:
 * "Hosted at <venue>", a date/post-count/Open-on-Instagram line, then one line per vendor
 * category in priority order (`ROLE_CATEGORIES`, already correct once venue is excluded)
 * — names comma-separated, no avatars, no role labels, category headers doing that job.
 * Categories past the first 5 (4 when compact) fold into one line; names past 3 (2 when
 * compact) on any one line fold the same way. Same Size/Layout controls as C/D.
 */
export function Ledger({
  stacks,
  embedWidth,
  twoUp,
}: {
  stacks: WeddingStack[];
  embedWidth: EmbedSize;
  twoUp: boolean;
}) {
  return (
    <div className={twoUp ? "grid grid-cols-1 gap-8 xl:grid-cols-2" : "flex flex-col gap-8"}>
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <LedgerRow stack={stack} eagerCover={i < 2} embedWidth={embedWidth} twoUp={twoUp} />
        </MeasuredCard>
      ))}
    </div>
  );
}
