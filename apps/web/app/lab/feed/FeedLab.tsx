"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { pillClassName } from "@/lib/typography";
import { siteContainerClass } from "@/lib/site-layout";
import { coverPost } from "@/lib/feedDesign";
import { MeasurementContext, type MeasurementApi } from "./measurement-context";
import { CleanList } from "./variants/CleanList";
import { Grid } from "./variants/Grid";
import type { WeddingStack } from "@/lib/server/graph";
import type { Variant } from "./variant";

const VARIANT_LABELS: Record<Variant, string> = {
  a: "A2 · Clean list",
  b: "B2 · Grid",
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
}: {
  venue: { id: number; username: string; name: string };
  stacks: WeddingStack[];
  initialVariant: Variant;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [variant, setVariant] = useState<Variant>(initialVariant);

  useEffect(() => {
    setVariant(initialVariant);
  }, [initialVariant]);

  const setVariantAndUrl = useCallback(
    (v: Variant) => {
      setVariant(v);
      router.push(`${pathname}?venue=${encodeURIComponent(venue.username)}&variant=${v}`, {
        scroll: false,
      });
    },
    [pathname, router, venue.username],
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
                onClick={() => setVariantAndUrl(v)}
                className={pillClassName(v === variant)}
              >
                {VARIANT_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
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
          {variant === "a" && <CleanList stacks={stacks} />}
          {variant === "b" && <Grid stacks={stacks} />}
        </MeasurementContext.Provider>
      </main>
    </div>
  );
}
