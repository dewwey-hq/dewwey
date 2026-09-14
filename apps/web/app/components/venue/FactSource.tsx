"use client";

/**
 * The "why" affordance next to every stated fact (D060 Phase 1b): a tiny popover showing the
 * verbatim quote it was grounded against, a link to the source page, and when it was captured.
 * Kept unobtrusive per the plan spec (`text-gray-300 hover:text-rose-400`) — this is a provenance
 * detail for the curious, not a primary UI element.
 *
 * Accepts either a single fact (`quote`/`source_url`/`snapshot_id`) or, for a `conflicting`
 * spine field, a `candidates` array — every candidate's quote+link is shown. `snapshot_id: null`
 * means a golden fixture ("from the golden set") rather than a live crawl snapshot; `capturedAt`
 * threads down `sources.crawled_at` since individual facts don't carry their own date.
 */

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

export interface FactSourceCandidate {
  quote?: string;
  source_url: string;
  snapshot_id: number | null;
}

export interface FactSourceProps {
  quote?: string;
  source_url?: string;
  snapshot_id?: number | null;
  candidates?: FactSourceCandidate[];
  capturedAt?: string | null;
  className?: string;
}

function capturedLabel(snapshotId: number | null, capturedAt: string | null | undefined): string {
  if (snapshotId == null) return "from the golden set";
  return capturedAt ? `captured ${capturedAt}` : "captured date unknown";
}

export function FactSource({ quote, source_url, snapshot_id, candidates, capturedAt, className }: FactSourceProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const items: FactSourceCandidate[] =
    candidates && candidates.length > 0 ? candidates : source_url != null ? [{ quote, source_url, snapshot_id: snapshot_id ?? null }] : [];
  if (items.length === 0) return null;

  return (
    <span ref={ref} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="text-gray-300 hover:text-rose-400"
        aria-label="Why this fact"
      >
        <Info size={12} />
      </button>
      {open && (
        <span className="absolute left-1/2 top-full z-20 mt-1.5 w-64 -translate-x-1/2 rounded-lg border border-black/[0.08] bg-white p-3 text-left text-xs text-gray-600 shadow-lg">
          {items.map((c, i) => (
            <span key={`${c.source_url}-${i}`} className={i > 0 ? "mt-2 block border-t border-black/[0.06] pt-2" : "block"}>
              {c.quote ? <span className="block italic text-gray-500">&ldquo;{c.quote}&rdquo;</span> : null}
              <span className="mt-1 flex items-center justify-between gap-2">
                <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                  View source
                </a>
                <span className="text-gray-400">{capturedLabel(c.snapshot_id, capturedAt)}</span>
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
