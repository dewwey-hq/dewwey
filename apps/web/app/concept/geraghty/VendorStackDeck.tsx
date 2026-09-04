"use client";

/**
 * Real wedding vendor stack card — same "stack" shape as Marchetti's VendorStackDeck, rebuilt
 * with lucide-react icons instead of the custom /icons/*-svgrepo-com.svg files Marchetti's
 * version points to. Those files no longer exist in apps/web/public/icons (deleted by the
 * 2026-08-23 Phosphor-icon sweep without anyone re-checking the /concept pages — see data.ts
 * header) — Marchetti's and Field Museum's vendor icons are currently broken images in
 * production. lucide-react is already a dependency used elsewhere on every golden-set page, so
 * it carries no missing-asset risk.
 */

import { Camera, Video, Flower2, Sparkles as SparklesIcon, Music, NotebookPen, Shirt, Mail, Armchair, CakeSlice, UtensilsCrossed, Images, type LucideIcon } from "lucide-react";
import InstagramEmbed from "@/app/components/InstagramEmbed";
import { geraghty } from "./data";

const EMBED_WIDTH = 420;
const EMBED_HEIGHT = EMBED_WIDTH + 54;
export const CARD_HEIGHT = EMBED_HEIGHT;

export const ICON_SRC: Record<string, LucideIcon> = {
  Planning: NotebookPen,
  Photography: Camera,
  Videography: Video,
  Florals: Flower2,
  "Hair & Makeup": SparklesIcon,
  "Music & Entertainment": Music,
  Attire: Shirt,
  Stationery: Mail,
  Rentals: Armchair,
  Cake: CakeSlice,
  Catering: UtensilsCrossed,
  Photobooth: Images,
};

export function VendorIcon({ category, size = 17 }: { category: string; size?: number }) {
  const Icon = ICON_SRC[category];
  if (!Icon) return null;
  return <Icon size={size} className="shrink-0 text-rose-400" />;
}

function formatMonthYear(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export type Stack = (typeof geraghty.weddingStacks)[number];

export function StackCard({ stack }: { stack: Stack }) {
  const spotlight = stack.vendors.length <= 2;

  return (
    <div className="flex h-full flex-col sm:flex-row">
      {/* sm:w-[420px] must stay in sync with EMBED_WIDTH. */}
      <div className="flex shrink-0 items-center justify-center bg-black sm:w-[420px]">
        <InstagramEmbed postUrl={stack.postUrl} caption={stack.postCaption} previewImageUrl={stack.postImageUrl} compact maxWidth={EMBED_WIDTH} />
      </div>
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

        <div className={`mt-4 ${spotlight ? "border-b border-black/[0.06] pb-3" : ""}`}>
          <a href={stack.postUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-xs text-gray-400 hover:text-rose-500">
            See this real wedding on Instagram →
          </a>
        </div>
      </div>
    </div>
  );
}
