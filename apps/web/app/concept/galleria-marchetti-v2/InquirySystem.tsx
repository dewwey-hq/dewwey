"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { InquireForm, VenuePhotoThumb, earliestTourLabel, type InquiryMode } from "@/app/concept/_shared/wedding-posts";
import { uiHeadingClassName } from "@/lib/typography";
import { marchetti } from "./data";

const InquiryContext = createContext<(mode: InquiryMode) => void>(() => {});

/** Both the header trigger box and the sticky-bar CTA share one modal instance via this. */
export function useOpenInquiry() {
  return useContext(InquiryContext);
}

export function InquiryProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<InquiryMode | null>(null);

  return (
    <InquiryContext.Provider value={setMode}>
      {children}
      {mode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setMode(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`text-base text-gray-900 ${uiHeadingClassName}`}>{mode === "tour" ? "Request a tour" : "Ask a question"}</h3>
              <button type="button" onClick={() => setMode(null)} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <InquireForm mode={mode} onBack={() => setMode(null)} />
          </div>
        </div>
      )}
    </InquiryContext.Provider>
  );
}

/** Compact trigger — photo thumbnail + earliest-slot date on "Request a tour" (both real,
    proven-to-convert pieces from the actual product), "Ask a question" stays plain. Tighter
    than the real sidebar panel: two columns instead of three (dropped the invisible spacer
    div the original used purely to center text against the thumb), so it doesn't outgrow
    the header column next to it while still keeping the photo + date. */
export function InquiryTriggerBox() {
  const open = useOpenInquiry();
  const tourWhen = earliestTourLabel();

  return (
    <div className="space-y-2 rounded-2xl border border-black/[0.08] bg-[#fdf8f5] p-3">
      <button
        type="button"
        onClick={() => open("tour")}
        className="flex w-full items-center gap-2.5 rounded-xl bg-rose-400 px-3 py-2 text-white transition-colors hover:bg-rose-500"
      >
        <VenuePhotoThumb placeId={marchetti.placeId} photoNames={marchetti.photoNames} size="sm" />
        <span className="min-w-0 text-left">
          <span className="block text-sm font-medium leading-tight">Request a tour</span>
          <span className="block whitespace-nowrap text-[11px] leading-snug text-rose-50/90">{tourWhen}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => open("question")}
        className="w-full rounded-xl border border-rose-200 bg-white py-2.5 text-sm font-medium text-gray-900 transition-colors hover:border-rose-300 hover:bg-rose-50"
      >
        Ask a question
      </button>
    </div>
  );
}
