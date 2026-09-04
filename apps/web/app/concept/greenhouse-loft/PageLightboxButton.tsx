"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, ExternalLink } from "lucide-react";

/**
 * Opens a real external page in an in-site fullscreen lightbox instead of a new browser tab —
 * same pattern as Diamond Garden/Field Museum. Greenhouse Loft's own /tour page sends no
 * X-Frame-Options/CSP header (checked directly via curl -I, 2026-08-24), so it genuinely frames;
 * its actual 360° tour content is a third-party script (vtours.360chicagotours.com) that couldn't
 * be confirmed as a direct, guessable embed URL — this frames the venue's own real page instead
 * of guessing that URL, same reasoning as Diamond Garden's Wix tour pages and Field Museum's
 * Vimeo wall.
 */

// Squarespace sites aren't always fully responsive at typical iframe widths, which can force
// horizontal scroll inside the card. Rendering the iframe wider than its visible box, then
// scaling the whole thing down, gives the layout enough virtual width to lay out normally.
const IFRAME_ZOOM = 0.8;

export function PageLightboxButton({
  label,
  icon,
  url,
  title,
  variant = "primary",
}: {
  label: string;
  icon: ReactNode;
  url: string;
  title: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

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
            ? "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-200 hover:text-rose-500"
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
              <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white">
                <ExternalLink size={13} />
                Open in new tab
              </a>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-4 sm:px-10 sm:py-6" onClick={(e) => e.stopPropagation()}>
            <div className="h-full w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <iframe
                src={url}
                title={title}
                className="origin-top-left border-0"
                style={{ width: `${100 / IFRAME_ZOOM}%`, height: `${100 / IFRAME_ZOOM}%`, transform: `scale(${IFRAME_ZOOM})` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
