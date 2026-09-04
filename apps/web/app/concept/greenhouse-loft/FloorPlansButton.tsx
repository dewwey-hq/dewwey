"use client";

import { useEffect, useState } from "react";
import { FileText, X, ExternalLink } from "lucide-react";

/**
 * Collapses the venue's two real floor-plan PDFs into one button instead of two side-by-side
 * ones — feedback 2026-08-24: the button row was overflowing with Virtual tour, Real weddings,
 * and two separate floor-plan links all in one row.
 *
 * Feedback 2026-08-27: picking an item used to open it in a new tab — converted to the same
 * in-page lightbox every other resource on the page uses ("show all of them lightbox style...
 * that way users stay on page"). Both PDFs are served by Squarespace with no
 * `X-Frame-Options`/CSP restriction (checked via `curl -sIL`, 2026-08-27), so they embed cleanly.
 * Kept as its own small component rather than reusing `_shared/ResourceLightboxButton` directly,
 * since the trigger here is a dropdown picking between two documents, not a single button.
 */
export function FloorPlansButton({ resources }: { resources: { label: string; url: string }[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<{ label: string; url: string } | null>(null);

  useEffect(() => {
    if (!selected) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [selected]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-200 hover:text-rose-500"
      >
        <FileText size={13} />
        Floor plans ({resources.length})
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-black/[0.08] bg-white p-1 shadow-lg">
            {resources.map((r) => (
              <button
                key={r.url}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSelected(r);
                }}
                className="block w-full rounded-md px-2.5 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 hover:text-rose-500"
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black" onClick={() => setSelected(null)}>
          <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-8" onClick={(e) => e.stopPropagation()}>
            <div className="justify-self-start">
              <button type="button" onClick={() => setSelected(null)} className="flex items-center gap-2 rounded-lg px-1 py-2 text-white hover:bg-white/10" aria-label="Close">
                <X size={22} />
                <span className="text-sm font-medium">Close</span>
              </button>
            </div>
            <span className="truncate text-sm font-medium text-white">{selected.label}</span>
            <div className="justify-self-end">
              <a href={selected.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white">
                <ExternalLink size={13} />
                Open in new tab
              </a>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-4 sm:px-10 sm:py-6" onClick={(e) => e.stopPropagation()}>
            <div className="h-full w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <iframe src={selected.url} title={selected.label} className="h-full w-full border-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
