"use client";

/**
 * Real wedding vendor stack(s), shown as a stacked deck the user flips through — the "stack"
 * metaphor made literal, borrowed from testimonial/case-study deck patterns (Stripe, Notion,
 * etc.). Picked over a flat list after a round of design swatches (2026-08-15): a wider photo
 * since that's the actual highlight of a real-wedding stack, and a "fan" layering — one card
 * peeking above the front card, one peeking below — picked over a straight stack, a side peek,
 * a shadow-only treatment, and a 3D perspective tilt after a second swatch round.
 *
 * v4: rebuilt with lucide-react icons instead of v3's custom /icons/*-svgrepo-com.svg files,
 * which no longer exist in apps/web/public/icons — deleted by the 2026-08-23 Phosphor-icon
 * sweep, which never touched /concept, so v3's vendor-category icons are broken images in
 * production (see golden-set-template.md §2's Wedding stack format note). `geraghty`'s copy of
 * this file made the same fix first; this reuses its icon mapping directly.
 *
 * Stage/peek/nav mechanics live in the shared CardDeck, used by RealWeddingDeck at the top of
 * the page — this file no longer renders its own deck (the Vendors section further down is a
 * flat by-category directory instead, per user feedback 2026-08-15: once the top of the page
 * already shows the real wedding stacks, a second identical deck lower down was pure
 * duplication). StackCard/CARD_HEIGHT/Stack/VendorIcon/ICON_SRC stay exported — still used by
 * RealWeddingDeck and by VendorCategoryList's category icons.
 */

import { Camera, Video, Flower2, Sparkles as SparklesIcon, Music, NotebookPen, Shirt, Mail, type LucideIcon } from "lucide-react";
import InstagramEmbed from "@/app/components/InstagramEmbed";
import { marchetti } from "./data";

// Compact Instagram embeds render at a fixed pixel size — they don't stretch to fill a
// container — so the card is sized around the embed, not the other way around. Widened from
// 380 on the assumption most real stacks won't be as vendor-heavy as the current 8-category
// one, so the content column doesn't need as much width reserved for it.
const EMBED_WIDTH = 420;
const EMBED_HEIGHT = EMBED_WIDTH + 54;
export const CARD_HEIGHT = EMBED_HEIGHT;

export const ICON_SRC: Record<string, LucideIcon> = {
  Photography: Camera,
  Videography: Video,
  Florals: Flower2,
  "Hair & Makeup": SparklesIcon,
  "Music & Entertainment": Music,
  Planning: NotebookPen,
  Attire: Shirt,
  Stationery: Mail,
};

export function VendorIcon({ category, size = 17 }: { category: string; size?: number }) {
  const Icon = ICON_SRC[category];
  if (!Icon) return null;
  return <Icon size={size} className="shrink-0 text-rose-400" />;
}

function formatMonthYear(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export type Stack = (typeof marchetti.weddingStacks)[number];

export function StackCard({ stack }: { stack: Stack }) {
  // A single credit reused the full multi-vendor grid at tiny scale and looked like a stray
  // leftover row floating in empty space. Below this threshold, spotlight it instead — bigger
  // icon, bigger text, a plain-language lead-in — rather than shrinking the multi-vendor layout.
  const spotlight = stack.vendors.length <= 2;

  return (
    <div className="flex h-full flex-col sm:flex-row">
      {/* sm:w-[420px] must stay in sync with EMBED_WIDTH (Tailwind arbitrary values can't
          read a JS constant directly). */}
      <div className="flex shrink-0 items-center justify-center bg-black sm:w-[420px]">
        <InstagramEmbed postUrl={stack.postUrl} caption={stack.postCaption} previewImageUrl={stack.postImageUrl} compact maxWidth={EMBED_WIDTH} />
      </div>
      {/* Centered vertically against the photo's height, not pinned to the top — the "A real
          wedding's full vendor stack" label lived here before but duplicated what the section
          heading/subtitle above the whole deck already say, so it's gone rather than moved. */}
      <div className="flex flex-1 flex-col justify-center p-5">
        <p className={`mb-3 text-xs text-gray-400 ${spotlight ? "border-t border-black/[0.06] pt-3" : ""}`}>{formatMonthYear(stack.postTimestamp)}</p>

        {spotlight ? (
          <div className="space-y-3">
            {stack.vendors.map((v) => (
              <div key={v.name} className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fdf8f5]">
                  <VendorIcon category={v.category} size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-gray-400">{v.category} by</span>
                  <span className="block text-base font-semibold leading-snug text-gray-900">{v.name}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {stack.vendors.map((v) => (
              <div key={v.name} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fdf8f5]">
                  <VendorIcon category={v.category} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">{v.category}</span>
                  <span className="block text-sm font-medium leading-snug text-gray-900">{v.name}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Quiet text link, not a button — the real post is already embedded above, so this
            is only for people who want to go engage with it on Instagram itself, not the
            primary action of the card. The soft bottom line lives on this wrapping div, not
            the link itself — the link is `w-fit` (sized to its own text), so a border on it
            directly would only span the text width, not the full column like the line above
            the date does. */}
        <div className={`mt-4 ${spotlight ? "border-b border-black/[0.06] pb-3" : ""}`}>
          <a href={stack.postUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-xs text-gray-400 hover:text-rose-500">
            See this real wedding on Instagram →
          </a>
        </div>
      </div>
    </div>
  );
}
