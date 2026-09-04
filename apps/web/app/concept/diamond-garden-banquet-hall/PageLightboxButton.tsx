"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, ExternalLink } from "lucide-react";

/**
 * Opens a real external page in an in-site fullscreen lightbox (same shell as Marchetti's
 * FloorPlanButton / the real wedding lightbox) instead of a new browser tab — feedback
 * 2026-08-15: "same as we do for Instagram... feels more internal instead of literally open
 * new browser tab." One real difference from the Instagram embed pattern worth knowing: these
 * are diamondgardenhall.com's normal site pages, not a stripped embed endpoint the way
 * Instagram's /embed/ URLs are — no X-Frame-Options or CSP header blocks it (checked directly),
 * so the iframe genuinely renders their whole site (header, nav, footer), not just the
 * video/tour widget. To read as "our page previewing their content" rather than "you're now on
 * their site," the iframe sits in a padded, rounded, shadowed card against the dark backdrop —
 * same visual treatment as the real Instagram lightbox's embed card — instead of stretching
 * edge-to-edge. The "Open in new tab" link inside is the fallback if a page ever does start
 * blocking framing.
 */

// Their site isn't fully responsive at typical iframe widths, which forced horizontal scroll
// inside the card. Rendering the iframe ~25% wider than its visible box, then scaling the
// whole thing down to fit, gives their layout enough virtual width to lay out normally.
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
            {/* Their site isn't fully responsive, so a narrow iframe forces horizontal scroll
                inside it. Standard fix: render the iframe at a wider virtual width, then scale
                it down with a CSS transform so it still visually fits the card — pure CSS, no
                JS measurement needed (the percentage sizes are relative to this wrapper, so it
                stays responsive as the wrapper's own size changes). */}
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
