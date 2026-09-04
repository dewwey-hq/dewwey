"use client";

import { useEffect, useState } from "react";
import { PlayCircle, X, ExternalLink } from "lucide-react";

/**
 * Video-tour resource button + in-site lightbox, same idea as Marchetti's FloorPlanButton
 * (feedback 2026-08-15: opens within the page instead of taking the user to vimeo.com in a new
 * tab). Embeds via Vimeo's standard player iframe (player.vimeo.com/video/{id}) — the same
 * public embed mechanism the venue's own site uses, not a hotlinked/scraped file.
 *
 * One real risk this can't be verified against without a live browser: Vimeo lets an uploader
 * restrict embedding to specific domains ("Where can this be embedded?"). If Field Museum set
 * that, the iframe will load but Vimeo's own player will refuse to play here — there's no
 * reliable cross-origin way to detect that failure from this side. The quiet "Watch on Vimeo"
 * link below the embed is the fallback for that case, not just a courtesy citation.
 */
export function VideoTourButton({ spaceName, videoId, videoUrl }: { spaceName: string; videoId: string; videoUrl: string }) {
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
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
      >
        <PlayCircle size={13} className="text-rose-400" />
        Video tour
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
            <span className="text-sm font-medium text-white">{spaceName}</span>
            <span />
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-4 sm:px-10" onClick={(e) => e.stopPropagation()}>
            <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-xl bg-gray-900 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <iframe
                src={`https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&dnt=1`}
                title={`${spaceName} video tour`}
                className="h-full w-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80">
              <ExternalLink size={11} />
              Watch on Vimeo
            </a>
          </div>
        </div>
      )}
    </>
  );
}
