"use client";

/**
 * Locked FAQ visual format (golden-set-template.md §2, Greenhouse Loft's fix): bare full-width
 * rows, each with its own bottom rule and a chevron that rotates open on click — no outer
 * bordered box, deliberately distinct from Policies' pill-row look. "Questions every couple
 * asks" (derived from the spine) always renders first; the venue's own real FAQs follow under
 * "From {name}'s site" only when there are any.
 */

import { ChevronDown } from "lucide-react";
import { uiHeadingClassName } from "@/lib/typography";

export interface FaqListItem {
  question: string;
  answer: string;
}

export function FaqList({ standard, venue, venueName }: { standard: FaqListItem[]; venue: FaqListItem[]; venueName: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
      <div className={`border-t border-black/[0.08] ${venue.length > 0 ? "mb-6" : ""}`}>
        {standard.map((f) => (
          <FaqRow key={f.question} {...f} />
        ))}
      </div>

      {venue.length > 0 && (
        <>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From {venueName}&apos;s site</p>
          <div className="border-t border-black/[0.08]">
            {venue.map((f) => (
              <FaqRow key={f.question} {...f} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FaqRow({ question, answer }: FaqListItem) {
  return (
    <details className="group border-b border-black/[0.08] py-3">
      <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}>
        {question}
        <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 text-sm leading-[1.6] text-gray-600">{answer}</p>
    </details>
  );
}
