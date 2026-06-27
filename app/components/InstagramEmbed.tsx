"use client";

import { useEffect, useState } from "react";
import {
  getCachedEmbedStatus,
  setCachedEmbedStatus,
} from "@/app/lib/instagram-embed-status-cache";

export function proxiedInstagramImageUrl(cdnUrl: string | null | undefined): string | null {
  if (!cdnUrl) return null;
  return `/api/instagram-image?url=${encodeURIComponent(cdnUrl)}`;
}

function embedUrl(postUrl: string, captioned: boolean): string | null {
  try {
    const url = new URL(postUrl);
    const match = url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) return null;
    const [, type, shortcode] = match;
    return captioned
      ? `https://www.instagram.com/${type}/${shortcode}/embed/captioned/`
      : `https://www.instagram.com/${type}/${shortcode}/embed/`;
  } catch {
    return null;
  }
}

const EMBED_CHROME_PX = 80;
/** IG embed header bar (profile row) — measured from official embeds */
const EMBED_COMPACT_CHROME_PX = 54;
const EMBED_CAROUSEL_CHROME_PX = 32;
/** Small slack so lightbox iframes don't clip the last few px of IG chrome */
const EMBED_LIGHTBOX_BUFFER_PX = 12;

export const LIGHTBOX_TOP_BAR_PX = 56;
export const LIGHTBOX_CONTENT_PAD_PX = 32;
export const LIGHTBOX_MIN_EMBED_WIDTH = 280;
export const LIGHTBOX_MAX_EMBED_WIDTH = 580;

/**
 * Instagram feed media (height ÷ width). Official upload sizes:
 * - square:     1080×1080  → 1.00  (embed padding-bottom 100%)
 * - portrait:   1080×1350  → 1.25  (4:5, embed 125%)
 * - portraitTall: 1080×1440 → 1.333 (3:4, embed ~133%)
 * - landscape:  1080×566   → 0.524 (1.91:1, embed ~52%)
 * - landscapeWide: mixed carousel ~2:3 → 0.667 (embed ~67%)
 */
export const INSTAGRAM_MEDIA_ASPECT = {
  square: 1,
  portrait: 5 / 4,
  portraitTall: 4 / 3,
  landscape: 566 / 1080,
  landscapeWide: 2 / 3,
} as const;

export type InstagramMediaMeta = {
  imageUrl?: string | null;
  imageCount?: number;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
};

function aspectFromRatio(ratio: number): number {
  if (ratio >= 0.95 && ratio <= 1.05) return INSTAGRAM_MEDIA_ASPECT.square;
  if (ratio >= 1.2 && ratio <= 1.28) return INSTAGRAM_MEDIA_ASPECT.portrait;
  if (ratio >= 1.3 && ratio <= 1.36) return INSTAGRAM_MEDIA_ASPECT.portraitTall;
  if (ratio >= 0.5 && ratio <= 0.55) return INSTAGRAM_MEDIA_ASPECT.landscape;
  if (ratio >= 0.64 && ratio <= 0.7) return INSTAGRAM_MEDIA_ASPECT.landscapeWide;
  return ratio;
}

function dimensionsFromUrl(url: string): { w: number; h: number } | null {
  let bestW = 0;
  let bestH = 0;
  let bestArea = 0;

  const consider = (w: number, h: number) => {
    if (w < 200 || h < 200) return;
    const area = w * h;
    if (area > bestArea) {
      bestW = w;
      bestH = h;
      bestArea = area;
    }
  };

  for (const match of url.matchAll(/(\d{3,4})x(\d{3,4})/gi)) {
    consider(Number(match[1]), Number(match[2]));
  }

  const stp = url.match(/stp=([^&]+)/)?.[1];
  if (stp) {
    for (const match of stp.matchAll(/(\d{3,4})\.(\d{3,4})/g)) {
      consider(Number(match[1]), Number(match[2]));
    }
  }

  if (bestArea === 0) return null;
  return { w: bestW, h: bestH };
}

function aspectFromDimensions(w: number, h: number): number {
  return aspectFromRatio(h / w);
}

function mediaAspectFromImageUrl(url: string): number | null {
  const dims = dimensionsFromUrl(url);
  if (dims) return aspectFromDimensions(dims.w, dims.h);

  if (/1080x1440|x1440\b/i.test(url)) return INSTAGRAM_MEDIA_ASPECT.portraitTall;
  if (/1080x1350|x1350|750x937|4_5/i.test(url)) return INSTAGRAM_MEDIA_ASPECT.portrait;
  if (/1080x566|1080x608|x566\b|191x100/i.test(url)) return INSTAGRAM_MEDIA_ASPECT.landscape;
  return null;
}

/** IG crop prefix (e.g. c0.180.1440.1440a) — portrait slice from a square master. */
function isPortraitCropUrl(url: string): boolean {
  const crop = url.match(/stp=c([\d.a]+)/i)?.[1];
  if (!crop) return false;
  const nums = crop.replace(/a$/i, "").split(".").map(Number).filter((n) => n > 0);
  if (nums.length < 4) return false;
  const w = nums[nums.length - 2];
  const h = nums[nums.length - 1];
  return h / w >= 1.15;
}

/** Square crop with horizontal offset — landscape photo, square CDN thumb. */
function isLandscapeCropUrl(url: string): boolean {
  const crop = url.match(/stp=c([\d.a]+)/i)?.[1];
  if (!crop) return false;
  const nums = crop.replace(/a$/i, "").split(".").map(Number);
  if (nums.length < 4) return false;
  const [x, , cw, ch] = nums;
  if (cw < 200 || ch < 200) return false;
  return Math.abs(cw - ch) < cw * 0.08 && x > 20;
}

/** Carousel posts whose CDN thumbs use `pWxH` (portrait feed) vs `sWxH` (square feed). */
function isPortraitCarouselUrl(url: string): boolean {
  if (isPortraitCropUrl(url)) return true;
  if (isLandscapeCropUrl(url)) return false;
  if (/[_/]p\d{3,4}x\d{3,4}/i.test(url)) return true;
  if (/1080x1350|x1350|750x937/i.test(url)) return true;
  return false;
}

/** Media height÷width — prefers scraped dimensions, then CDN URL heuristics. */
export function instagramMediaAspect(meta: InstagramMediaMeta): number {
  const imageUrl = meta.imageUrl;
  const imageCount = Math.max(meta.imageCount ?? 1, 1);

  if (meta.mediaWidth && meta.mediaHeight && meta.mediaWidth > 0 && meta.mediaHeight > 0) {
    return meta.mediaHeight / meta.mediaWidth;
  }

  const fromUrl = imageUrl ? mediaAspectFromImageUrl(imageUrl) : null;

  if (imageCount > 1) {
    if (imageUrl && isPortraitCarouselUrl(imageUrl)) {
      return INSTAGRAM_MEDIA_ASPECT.portrait;
    }
    if (imageUrl && isLandscapeCropUrl(imageUrl)) {
      return INSTAGRAM_MEDIA_ASPECT.landscapeWide;
    }
    if (fromUrl === INSTAGRAM_MEDIA_ASPECT.square) {
      return INSTAGRAM_MEDIA_ASPECT.square;
    }
    return fromUrl ?? INSTAGRAM_MEDIA_ASPECT.portrait;
  }

  if (imageUrl && isLandscapeCropUrl(imageUrl)) {
    return INSTAGRAM_MEDIA_ASPECT.landscapeWide;
  }

  if (fromUrl) return fromUrl;
  return INSTAGRAM_MEDIA_ASPECT.portrait;
}

export function instagramEmbedChromePx(
  imageCount: number,
  mode: "default" | "lightbox" | "lightboxMedia" | "compact",
): number {
  let chrome =
    mode === "compact" || mode === "lightboxMedia"
      ? EMBED_COMPACT_CHROME_PX
      : EMBED_CHROME_PX;
  if (imageCount > 1 && mode === "lightboxMedia") {
    chrome += EMBED_CAROUSEL_CHROME_PX;
  }
  return chrome;
}

/** Total iframe height = IG header + media + carousel chrome at a given width. */
export function instagramEmbedTotalHeight(
  width: number,
  meta: InstagramMediaMeta,
  mode: "default" | "lightbox" | "lightboxMedia" | "compact",
): number {
  const imageCount = Math.max(meta.imageCount ?? 1, 1);
  if (mode === "compact") {
    // Portal grid: uniform square media preview inside 4:5 cards.
    return Math.round(width * INSTAGRAM_MEDIA_ASPECT.square + EMBED_COMPACT_CHROME_PX);
  }
  const media = width * instagramMediaAspect(meta);
  const total = Math.round(media + instagramEmbedChromePx(imageCount, mode));
  if (mode === "lightboxMedia") return total + EMBED_LIGHTBOX_BUFFER_PX;
  return total;
}

export function instagramEmbedHeight(
  width: number,
  meta: InstagramMediaMeta,
  mode: "default" | "lightbox" | "lightboxMedia" | "compact" = "default",
): number {
  return instagramEmbedTotalHeight(width, meta, mode);
}

/** Fit embed inside the wedding lightbox viewport (top bar + footer + padding). */
export function computeLightboxEmbedLayout({
  viewportWidth,
  viewportHeight,
  footerHeightPx,
  imageUrl,
  imageCount = 1,
  mediaWidth,
  mediaHeight,
}: {
  viewportWidth: number;
  viewportHeight: number;
  footerHeightPx: number;
  imageUrl?: string | null;
  imageCount?: number;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}): { width: number; iframeHeight: number; scrollIframe: boolean } {
  const meta: InstagramMediaMeta = {
    imageUrl,
    imageCount: Math.max(imageCount, 1),
    mediaWidth,
    mediaHeight,
  };

  const arrowGutter = viewportWidth < 640 ? 88 : viewportWidth < 1024 ? 120 : 144;
  const maxWidth = Math.min(
    LIGHTBOX_MAX_EMBED_WIDTH,
    Math.max(LIGHTBOX_MIN_EMBED_WIDTH, viewportWidth - arrowGutter),
  );

  const maxCardHeight = viewportHeight - LIGHTBOX_TOP_BAR_PX - LIGHTBOX_CONTENT_PAD_PX;
  const maxIframeHeight = Math.max(220, maxCardHeight - footerHeightPx);

  const heightAt = (w: number) => instagramEmbedTotalHeight(w, meta, "lightboxMedia");

  let width = maxWidth;
  let iframeHeight = heightAt(width);

  while (width > LIGHTBOX_MIN_EMBED_WIDTH && iframeHeight > maxIframeHeight) {
    width -= 8;
    iframeHeight = heightAt(width);
  }

  const scrollIframe = iframeHeight > maxIframeHeight;
  if (scrollIframe) iframeHeight = maxIframeHeight;

  return { width, iframeHeight, scrollIframe };
}

function InstagramPostImagePreview({
  postUrl,
  previewImageUrl,
  height,
  maxWidth,
  compact,
  className,
  onLoad,
}: {
  postUrl: string;
  previewImageUrl: string;
  height: number;
  maxWidth: number;
  compact?: boolean;
  className?: string;
  onLoad?: () => void;
}) {
  const proxySrc = proxiedInstagramImageUrl(previewImageUrl);
  const [failed, setFailed] = useState(false);

  if (failed || !proxySrc) {
    return (
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={
          className
            ? `instagram-post-card flex flex-col items-center justify-center bg-[#fdf8f5] text-center ${className}`
            : "instagram-post-card flex flex-col items-center justify-center bg-[#fdf8f5] text-center"
        }
        style={{ height, maxWidth: compact ? maxWidth : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/instagram-glyph.svg" alt="" className="h-6 w-6 opacity-50" />
        <span className="mt-2 text-[11px] font-medium text-gray-500">View on Instagram</span>
      </a>
    );
  }

  return (
    <div
      className={className ? `instagram-post-card overflow-hidden ${className}` : "instagram-post-card overflow-hidden"}
      style={{ height, maxWidth: compact ? maxWidth : undefined }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxySrc}
        alt=""
        className="h-full w-full object-cover"
        onLoad={onLoad}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function InstagramEmbed({
  postUrl,
  caption,
  maxWidth = 300,
  iframeHeight,
  previewImageUrl,
  lightbox = false,
  lightboxMedia = false,
  compact = false,
  className,
  onLoad,
  imageCount = 1,
  scrollIframe = false,
  mediaWidth,
  mediaHeight,
  embedAvailable: embedAvailableProp,
}: {
  postUrl: string;
  caption?: string | null;
  maxWidth?: number;
  iframeHeight?: number;
  previewImageUrl?: string | null;
  lightbox?: boolean;
  lightboxMedia?: boolean;
  compact?: boolean;
  className?: string;
  onLoad?: () => void;
  imageCount?: number;
  scrollIframe?: boolean;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  /** When false, skip iframe and use scraped photo. Omit to load iframe optimistically. */
  embedAvailable?: boolean;
}) {
  const [embedAvailable, setEmbedAvailable] = useState<boolean | null>(() => {
    if (embedAvailableProp === false) return false;
    if (embedAvailableProp === true) return true;
    const cached = getCachedEmbedStatus(postUrl);
    return cached === undefined ? null : cached;
  });

  useEffect(() => {
    if (embedAvailableProp === false) {
      setEmbedAvailable(false);
      return;
    }
    if (embedAvailableProp === true) {
      setEmbedAvailable(true);
      return;
    }

    const cached = getCachedEmbedStatus(postUrl);
    if (cached !== undefined) {
      setEmbedAvailable(cached);
      return;
    }

    let cancelled = false;
    fetch(`/api/instagram/embed-status?postUrl=${encodeURIComponent(postUrl)}`)
      .then((res) => res.json())
      .then((data: { embedAvailable?: boolean }) => {
        const available = Boolean(data.embedAvailable);
        setCachedEmbedStatus(postUrl, available);
        if (!cancelled) setEmbedAvailable(available);
      })
      .catch(() => {
        if (!cancelled) setEmbedAvailable(null);
      });
    return () => {
      cancelled = true;
    };
  }, [postUrl, embedAvailableProp]);

  const text = caption?.trim();
  const captioned = lightboxMedia || compact ? false : lightbox ? true : !text;
  const src = embedUrl(postUrl, captioned);
  if (!src) return null;

  const mode = lightboxMedia
    ? "lightboxMedia"
    : lightbox
      ? "lightbox"
      : compact
        ? "compact"
        : "default";
  const height =
    iframeHeight ??
    instagramEmbedHeight(
      maxWidth,
      {
        imageUrl: previewImageUrl,
        imageCount,
        mediaWidth,
        mediaHeight,
      },
      mode,
    );

  const useIframe = embedAvailable !== false;
  const useImagePreview = embedAvailable === false && !!previewImageUrl;

  if (useImagePreview) {
    return (
      <InstagramPostImagePreview
        postUrl={postUrl}
        previewImageUrl={previewImageUrl}
        height={height}
        maxWidth={maxWidth}
        compact={compact}
        className={className}
        onLoad={onLoad}
      />
    );
  }

  if (embedAvailable === false && !previewImageUrl) {
    return (
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={
          className
            ? `instagram-post-card flex flex-col items-center justify-center bg-[#fdf8f5] text-center ${className}`
            : "instagram-post-card flex flex-col items-center justify-center bg-[#fdf8f5] text-center"
        }
        style={{ height, maxWidth: compact ? maxWidth : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/instagram-glyph.svg" alt="" className="h-6 w-6 opacity-50" />
        <span className="mt-2 text-[11px] font-medium text-gray-500">View on Instagram</span>
      </a>
    );
  }

  return (
    <div
      className={
        className
          ? `instagram-post-card relative ${className}`
          : "instagram-post-card relative"
      }
    >
      {useIframe ? (
        <>
          {lightboxMedia && previewImageUrl ? (
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-xl"
              aria-hidden
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxiedInstagramImageUrl(previewImageUrl) ?? undefined}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
          <iframe
            src={src}
            title="Instagram post"
            className={`instagram-embed-iframe w-full border-0 bg-white${
              lightboxMedia && previewImageUrl ? " relative z-[1]" : ""
            }`}
            style={{ width: compact ? maxWidth : undefined, maxWidth, height }}
            scrolling={
              scrollIframe || (lightbox && !lightboxMedia)
                ? "yes"
                : lightboxMedia
                  ? "auto"
                  : "no"
            }
            allowFullScreen
            onLoad={onLoad}
          />
        </>
      ) : null}
      {!compact && !lightbox && !lightboxMedia && text ? (
        <InstagramCaption text={text} postUrl={postUrl} />
      ) : null}
    </div>
  );
}

function InstagramCaption({ text, postUrl }: { text: string; postUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 120;

  return (
    <div className="border-t border-gray-100 px-3 py-2.5 text-left">
      <p
        className={`whitespace-pre-line text-xs leading-snug text-gray-900 ${
          expanded || !long ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[11px] font-medium text-rose-500 hover:text-rose-600"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block text-[11px] text-gray-400 hover:text-gray-600"
      >
        View on Instagram
      </a>
    </div>
  );
}
