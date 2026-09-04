"use client";

/**
 * Shared in-site lightbox for a venue's real resource links (PDFs, hosted pages, video embeds) —
 * generalizes Greenhouse Loft's PageLightboxButton and Field Museum's VideoTourButton into one
 * component so every golden-set venue can default to keeping a reader on the page instead of
 * sending them to a new tab (feedback 2026-08-27: "maybe we should just show all of them
 * lightbox style... that way users stay on page instead of leaving/easier"). Keeps the same
 * "open in new tab" escape hatch every prior lightbox already had — this is a convenience
 * default, not a way to trap anyone on the page.
 *
 * Two content shapes, picked per resource by the caller (not auto-detected):
 * - `frame="page"` (default): a white rounded card holding an iframe — right for a PDF or a
 *   real hosted web page. Good for a PDF specifically because the browser's own inline PDF
 *   viewer renders inside it with no extra work.
 * - `frame="video"`: a black aspect-video box — right for a YouTube/Vimeo embed player.
 *
 * Embeddability is a per-URL fact, not something this component can detect at render time — an
 * iframe blocked by `X-Frame-Options`/CSP `frame-ancestors` fails silently (or blank) rather
 * than throwing. Check with `curl -I` (or `curl -sIL` if the host redirects) before wiring a new
 * resource to this component; if the response carries `x-frame-options: DENY/SAMEORIGIN` or a
 * restrictive `frame-ancestors`, don't use this component for that URL — link out instead, and
 * say why in a code comment (same standing rule as the Vimeo-bot-wall / Wix-Access-Denied cases
 * in golden-set-template.md §2). `galleria-marchetti-v4`'s brochure PDF is the first confirmed
 * case of this (framerusercontent.com serves it with `x-frame-options: DENY`, checked 2026-08-27)
 * — it stays a plain new-tab link.
 */

import { useEffect, useState, type ReactNode } from "react";
import { X, ExternalLink } from "lucide-react";

export function ResourceLightboxButton({
  label,
  icon,
  title,
  embedSrc,
  href,
  openLabel = "Open in new tab",
  zoom = 1,
  frame = "page",
  variant = "primary",
}: {
  label: string;
  icon: ReactNode;
  title: string;
  embedSrc: string;
  href?: string;
  openLabel?: string;
  zoom?: number;
  frame?: "page" | "video";
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const openHref = href ?? embedSrc;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-200 hover:text-rose-500"
        }
      >
        {icon}
        {label}
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
            <span className="truncate text-sm font-medium text-white">{title}</span>
            <div className="justify-self-end">
              <a href={openHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white">
                <ExternalLink size={13} />
                {openLabel}
              </a>
            </div>
          </div>

          {frame === "video" ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-10" onClick={(e) => e.stopPropagation()}>
              <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-xl bg-gray-900 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <iframe src={embedSrc} title={title} className="h-full w-full border-0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-4 sm:px-10 sm:py-6" onClick={(e) => e.stopPropagation()}>
              <div className="h-full w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <iframe
                  src={embedSrc}
                  title={title}
                  className="origin-top-left border-0"
                  style={zoom === 1 ? { width: "100%", height: "100%" } : { width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
