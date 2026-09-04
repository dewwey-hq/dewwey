"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";

type FloorPlan = { label: string; imageUrl: string };

/**
 * Floor-plan resource button + in-site lightbox. Opens within the page instead of linking out
 * to the venue's own website — same idea as the real-weddings lightbox, applied to floor plans.
 */
export function FloorPlanButton({ spaceName, floorPlans }: { spaceName: string; floorPlans: FloorPlan[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(floorPlans.length - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [open, floorPlans.length]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-200 hover:text-rose-500"
      >
        <FileText size={12} />
        Floor plans ({floorPlans.length})
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black" onClick={() => setOpen(false)}>
          <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-8" onClick={(e) => e.stopPropagation()}>
            <div className="justify-self-start">
              <button type="button" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-1 py-2 text-white hover:bg-white/10" aria-label="Close">
                <X size={22} />
                <span className="text-sm font-medium">Close</span>
              </button>
            </div>
            <span className="text-sm font-medium text-white">
              {spaceName} · {index + 1} / {floorPlans.length}
            </span>
            <span />
          </div>

          <div className="relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="absolute left-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-black/50 text-white backdrop-blur-[2px] disabled:pointer-events-none disabled:opacity-0 sm:left-6"
              aria-label="Previous floor plan"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="flex h-full items-center justify-center overflow-y-auto px-14 py-4 sm:px-20">
              <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={floorPlans[index].imageUrl} alt={`${spaceName}: ${floorPlans[index].label}`} className="w-full bg-gray-50 object-contain" />
                <p className="border-t border-black/[0.06] px-4 py-2.5 text-center text-sm text-gray-700">{floorPlans[index].label}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(floorPlans.length - 1, i + 1))}
              disabled={index === floorPlans.length - 1}
              className="absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-black/50 text-white backdrop-blur-[2px] disabled:pointer-events-none disabled:opacity-0 sm:right-6"
              aria-label="Next floor plan"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
