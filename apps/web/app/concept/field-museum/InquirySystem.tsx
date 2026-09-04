"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { InquireForm, earliestTourLabel, type InquiryMode } from "@/app/concept/_shared/wedding-posts";
import { uiHeadingClassName } from "@/lib/typography";

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

/**
 * Pricing's "Request a Proposal" CTA (feedback 2026-08-15) — opens the "Ask a question" modal
 * instead of linking out to the venue's own contact-venue-rentals page. Every other CTA on this
 * page keeps the user in-product; an outbound link for pricing specifically was the one
 * exception, and undercut the point of being the couple's single point of contact.
 */
export function AskAboutPricingButton() {
  const open = useOpenInquiry();

  return (
    <button
      type="button"
      onClick={() => open("question")}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50"
    >
      Ask about pricing
    </button>
  );
}

/** Text-only trigger, matching LondonHouse's pattern — no photo thumbnail. */
export function InquiryTriggerBox() {
  const open = useOpenInquiry();
  const tourWhen = earliestTourLabel();

  return (
    <div className="space-y-2 rounded-2xl border border-black/[0.08] bg-[#fdf8f5] p-3">
      <button
        type="button"
        onClick={() => open("tour")}
        className="flex w-full flex-col items-center gap-0 rounded-xl bg-rose-400 px-3 py-2.5 text-center text-white transition-colors hover:bg-rose-500"
      >
        <span className="text-sm font-medium leading-tight">Request a tour</span>
        <span className="whitespace-nowrap text-[11px] leading-snug text-rose-50/90">{tourWhen}</span>
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
