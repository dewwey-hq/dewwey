"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { pillClassName } from "@/lib/typography";
import { siteContainerClass } from "@/lib/site-layout";
import { coverPost } from "@/lib/feedDesign";
import { MeasurementContext, type MeasurementApi } from "./measurement-context";
import { Card } from "./variants/Card";
import type { WeddingStack } from "@/lib/server/graph";
import {
  EMBED_SIZES,
  LAYOUTS,
  SIDES,
  SPLITS,
  TILE_COLS,
  type EmbedSize,
  type Layout,
  type Side,
  type Split,
  type TileCols,
  type Variant,
} from "./variant";

const VARIANT_LABELS: Record<Variant, string> = {
  c: "C · Card",
};

/**
 * Client half of the D058 lab: a sticky A/B toggle that updates the URL, a measurement
 * strip (live iframes, median card height, ms to first embed load — see
 * `measurement-context.tsx`), and a "data notes" line so the comparison isn't taste-only.
 * D058 compliance pass (2026-09-11): Story/Season magazine dropped, both remaining
 * variants render Instagram's official `embed.js` embed untouched (see
 * `InstagramPostEmbed.tsx`).
 */
export function FeedLab({
  venue,
  stacks,
  initialVariant,
  initialEmbedSize,
  initialLayout,
  initialSplit,
  initialTileCols,
  initialSide,
}: {
  venue: { id: number; username: string; name: string };
  stacks: WeddingStack[];
  initialVariant: Variant;
  initialEmbedSize: EmbedSize;
  initialLayout: Layout;
  initialSplit: Split;
  initialTileCols: TileCols;
  initialSide: Side;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [variant, setVariant] = useState<Variant>(initialVariant);
  const [embedSize, setEmbedSize] = useState<EmbedSize>(initialEmbedSize);
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [split, setSplit] = useState<Split>(initialSplit);
  const [tileCols, setTileCols] = useState<TileCols>(initialTileCols);
  const [side, setSide] = useState<Side>(initialSide);

  useEffect(() => {
    setVariant(initialVariant);
    setEmbedSize(initialEmbedSize);
    setLayout(initialLayout);
    setSplit(initialSplit);
    setTileCols(initialTileCols);
    setSide(initialSide);
  }, [initialVariant, initialEmbedSize, initialLayout, initialSplit, initialTileCols, initialSide]);

  // One URL-sync helper for all three toggles (variant/size/layout) — size and layout
  // only matter for C/D, but staying in the URL regardless means switching back to C or
  // D later remembers the last choice instead of resetting to the default.
  const updateQuery = useCallback(
    (overrides: { variant?: Variant; size?: EmbedSize; layout?: Layout; split?: Split; tiles?: TileCols; side?: Side }) => {
      const nextVariant = overrides.variant ?? variant;
      const nextSize = overrides.size ?? embedSize;
      const nextLayout = overrides.layout ?? layout;
      const nextSplit = overrides.split ?? split;
      const nextTiles = overrides.tiles ?? tileCols;
      const nextSide = overrides.side ?? side;
      setVariant(nextVariant);
      setEmbedSize(nextSize);
      setLayout(nextLayout);
      setSplit(nextSplit);
      setTileCols(nextTiles);
      setSide(nextSide);
      const sp = new URLSearchParams();
      sp.set("venue", venue.username);
      sp.set("variant", nextVariant);
      sp.set("size", String(nextSize));
      sp.set("layout", nextLayout);
      sp.set("split", String(nextSplit));
      sp.set("tiles", String(nextTiles));
      sp.set("side", nextSide);
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [pathname, router, venue.username, variant, embedSize, layout, split, tileCols, side],
  );

  // -- Measurement strip: mounted iframes, median card height, ms to first embed load.
  // Reset whenever the variant changes so each design is measured on its own terms.
  const [mountedCount, setMountedCount] = useState(0);
  const [firstLoadMs, setFirstLoadMs] = useState<number | null>(null);
  const [medianHeight, setMedianHeight] = useState<number | null>(null);
  const cardHeights = useRef<Map<string, number>>(new Map());
  const navStartRef = useRef<number>(0);

  useEffect(() => {
    navStartRef.current = performance.now();
    setMountedCount(0);
    setFirstLoadMs(null);
    cardHeights.current.clear();
    setMedianHeight(null);
  }, [variant]);

  const measurement = useMemo<MeasurementApi>(
    () => ({
      reportMount: () => setMountedCount((c) => c + 1),
      reportLoad: () =>
        setFirstLoadMs((prev) =>
          prev !== null ? prev : Math.round(performance.now() - navStartRef.current),
        ),
      reportCardHeight: (id, height) => {
        cardHeights.current.set(id, height);
        const values = [...cardHeights.current.values()].sort((a, b) => a - b);
        if (values.length === 0) {
          setMedianHeight(null);
          return;
        }
        const mid = Math.floor(values.length / 2);
        const median =
          values.length % 2 === 0 ? Math.round((values[mid - 1] + values[mid]) / 2) : values[mid];
        setMedianHeight(median);
      },
    }),
    [],
  );

  const singlePost = stacks.filter((s) => s.n_posts === 1).length;
  const blockedOwner = stacks.filter((s) => coverPost(s.post_infos) === null).length;

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="sticky top-0 z-20 border-b border-black/[0.07] bg-white/90 backdrop-blur">
        <div className={`${siteContainerClass} flex flex-wrap items-center justify-between gap-3 py-3`}>
          <div>
            <p className="text-sm font-medium text-gray-900">Feed design lab</p>
            <p className="text-xs text-black/[0.45]">
              {venue.name} (@{venue.username})
            </p>
          </div>
          <div className="flex gap-1.5">
            {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => updateQuery({ variant: v })}
                className={pillClassName(v === variant)}
              >
                {VARIANT_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
        {variant === "c" && (
          <div
            className={`${siteContainerClass} flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2.5 text-xs`}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-black/[0.4]">Size</span>
              <span className="flex gap-1">
                {EMBED_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateQuery({ size: s })}
                    aria-pressed={s === embedSize}
                    className={`rounded-full px-2.5 py-1 font-medium ring-1 ring-inset transition-colors ${
                      s === embedSize
                        ? "bg-gray-900 text-white ring-gray-900"
                        : "bg-white text-gray-600 ring-black/[0.10] hover:ring-black/[0.25]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-black/[0.4]">Layout</span>
              <span className="flex gap-1">
                {LAYOUTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => updateQuery({ layout: l })}
                    aria-pressed={l === layout}
                    className={`rounded-full px-2.5 py-1 font-medium ring-1 ring-inset transition-colors ${
                      l === layout
                        ? "bg-gray-900 text-white ring-gray-900"
                        : "bg-white text-gray-600 ring-black/[0.10] hover:ring-black/[0.25]"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </span>
            </span>
            {variant === "c" && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="text-black/[0.4]">Embed share</span>
                  <span className="flex gap-1">
                    {SPLITS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => updateQuery({ split: pct })}
                        aria-pressed={pct === split}
                        className={`rounded-full px-2.5 py-1 font-medium ring-1 ring-inset transition-colors ${
                          pct === split
                            ? "bg-gray-900 text-white ring-gray-900"
                            : "bg-white text-gray-600 ring-black/[0.10] hover:ring-black/[0.25]"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-black/[0.4]">Tile columns</span>
                  <span className="flex gap-1">
                    {TILE_COLS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateQuery({ tiles: c })}
                        aria-pressed={c === tileCols}
                        className={`rounded-full px-2.5 py-1 font-medium ring-1 ring-inset transition-colors ${
                          c === tileCols
                            ? "bg-gray-900 text-white ring-gray-900"
                            : "bg-white text-gray-600 ring-black/[0.10] hover:ring-black/[0.25]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-black/[0.4]">Embed side</span>
                  <span className="flex gap-1">
                    {SIDES.map((sd) => (
                      <button
                        key={sd}
                        type="button"
                        onClick={() => updateQuery({ side: sd })}
                        aria-pressed={sd === side}
                        className={`rounded-full px-2.5 py-1 font-medium ring-1 ring-inset transition-colors ${
                          sd === side
                            ? "bg-gray-900 text-white ring-gray-900"
                            : "bg-white text-gray-600 ring-black/[0.10] hover:ring-black/[0.25]"
                        }`}
                      >
                        {sd}
                      </button>
                    ))}
                  </span>
                </span>
              </>
            )}
          </div>
        )}
        <div
          className={`${siteContainerClass} flex flex-wrap items-center gap-x-5 gap-y-1 pb-2.5 text-[11px] text-black/[0.5]`}
        >
          <span>{mountedCount} iframes mounted</span>
          <span>Median card height: {medianHeight !== null ? `${medianHeight}px` : "—"}</span>
          <span>First embed load: {firstLoadMs !== null ? `${firstLoadMs}ms` : "—"}</span>
          <span className="ml-auto">
            {stacks.length} weddings · {singlePost} single-post · {blockedOwner} blocked owner
          </span>
        </div>
      </div>

      <main className={`${siteContainerClass} mt-8`}>
        <MeasurementContext.Provider value={measurement}>
          {variant === "c" && (
            <Card
              stacks={stacks}
              embedWidth={embedSize}
              twoUp={layout === "2-up"}
              split={split}
              tileCols={tileCols}
              mediaSide={side}
            />
          )}
        </MeasurementContext.Provider>
      </main>
    </div>
  );
}
