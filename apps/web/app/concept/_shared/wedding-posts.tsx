"use client";

/**
 * Forked from wedding-app's VenuesClient.tsx for the /concept golden examples.
 * dewwey's production VenuesClient.tsx dropped these exports in the vendors-browse
 * refactor, so the concept pages carry their own copy instead of depending on it.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import InstagramEmbed, { computeLightboxEmbedLayout } from "@/app/components/InstagramEmbed";
import { usePlacePhotos } from "@/lib/hooks/use-place-photos";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";

// ── Shared post helpers ─────────────────────────────────────────────────────

export type RealWeddingPost = {
  post_url: string;
  post_timestamp: string | null;
  mentions: string[] | null;
  likes_count: number | null;
  image_url?: string | null;
  images?: string[] | null;
  caption?: string | null;
  post_type?: string | null;
  media_width?: number | null;
  media_height?: number | null;
};

function postPreviewImageUrl(post: RealWeddingPost): string | null {
  return post.image_url || post.images?.[0] || null;
}

function postImageCount(post: RealWeddingPost): number {
  if (Array.isArray(post.images) && post.images.length > 0) return post.images.length;
  if (post.post_type?.toLowerCase() === "sidecar") return 2;
  return post.image_url ? 1 : 0;
}

function postMediaMeta(post: RealWeddingPost) {
  return {
    imageUrl: postPreviewImageUrl(post),
    imageCount: Math.max(postImageCount(post), 1),
    mediaWidth: post.media_width ?? null,
    mediaHeight: post.media_height ?? null,
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function formatPostDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch {
    return null;
  }
}

const WEDDING_VISIBLE = 3;
/** Carousel pages through at most this many posts; lightbox shows all. */
const CAROUSEL_MAX_POSTS = 12;

const EMBED_GRID_WIDTH = 280;

function WeddingEmbedGridCard({
  post,
  onClick,
}: {
  post: RealWeddingPost;
  onClick: () => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = useState(EMBED_GRID_WIDTH);
  const dateLabel = formatPostDate(post.post_timestamp);
  const embedWidth = cellWidth > 0 ? cellWidth : EMBED_GRID_WIDTH;

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setCellWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[4/5] w-full flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white text-left shadow-sm transition-all hover:border-black/[0.14] hover:shadow-md"
      aria-label={dateLabel ? `View wedding post from ${dateLabel}` : "View wedding post"}
    >
      <div ref={measureRef} className="min-h-0 flex-1 overflow-hidden p-1">
        <InstagramEmbed
          postUrl={post.post_url}
          caption={post.caption}
          maxWidth={embedWidth}
          previewImageUrl={postPreviewImageUrl(post)}
          compact
          className="h-full w-full"
        />
      </div>
      {dateLabel ? (
        <p className="shrink-0 border-t border-black/[0.04] py-1.5 text-center text-[11px] text-gray-400">
          {dateLabel}
        </p>
      ) : null}
    </button>
  );
}

export function WeddingPostLightbox({
  posts,
  startIndex,
  onClose,
}: {
  posts: RealWeddingPost[];
  startIndex: number;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(startIndex);
  const [entered, setEntered] = useState(false);
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const [liked, setLiked] = useState(false);
  const post = posts[current];
  const previewImage = postPreviewImageUrl(post);
  const canPrev = current > 0;
  const canNext = current < posts.length - 1;
  const embedLayout = useMemo(
    () =>
      computeLightboxEmbedLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        footerHeightPx: 0,
        ...postMediaMeta(post),
      }),
    [viewport, post],
  );

  useEffect(() => {
    setCurrent(startIndex);
  }, [startIndex]);

  useEffect(() => {
    const updateSize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (entered) dialogRef.current?.focus();
  }, [entered, current]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        setCurrent((c) => c - 1);
      }
      if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        setCurrent((c) => c + 1);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose, canPrev, canNext]);

  const goPrev = () => {
    if (canPrev) setCurrent((c) => c - 1);
  };

  const goNext = () => {
    if (canNext) setCurrent((c) => c + 1);
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      data-venue-overlay="true"
      className={`fixed inset-0 z-[60] flex flex-col bg-black outline-none transition-opacity duration-200 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Wedding posts"
    >
      <div
        className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="justify-self-start">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg px-1 py-2 text-white transition-colors hover:bg-white/10"
            aria-label="Close"
          >
            <X size={22} strokeWidth={2} />
            <span className="text-sm font-medium">Close</span>
          </button>
        </div>
        <span className="text-sm font-medium tabular-nums text-white">
          {current + 1} / {posts.length}
        </span>
        <div className="justify-self-end">
          <button
            type="button"
            onClick={() => setLiked((l) => !l)}
            className="rounded-full p-2.5 text-white transition-colors hover:bg-white/10"
            aria-label={liked ? "Unsave" : "Save"}
          >
            <Heart size={20} className={liked ? "fill-white text-white" : ""} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={goPrev}
          disabled={!canPrev}
          className="absolute left-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-black/50 text-white backdrop-blur-[2px] transition-all hover:bg-black/65 disabled:pointer-events-none disabled:opacity-0 sm:left-6 md:left-10"
          aria-label="Previous wedding"
        >
          <ChevronLeft size={24} strokeWidth={2} />
        </button>

        <div className="flex h-full items-center justify-center overflow-y-auto px-14 py-4 sm:px-20 md:px-24">
          <div
            className="w-full overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] transition-opacity duration-300"
            style={{ maxWidth: embedLayout.width }}
          >
            <div
              className="relative overflow-hidden transition-[height] duration-200 ease-out"
              style={{ height: embedLayout.iframeHeight }}
            >
              <InstagramEmbed
                key={post.post_url}
                postUrl={post.post_url}
                maxWidth={embedLayout.width}
                previewImageUrl={previewImage}
                imageCount={Math.max(postImageCount(post), 1)}
                mediaWidth={post.media_width}
                mediaHeight={post.media_height}
                iframeHeight={embedLayout.iframeHeight}
                scrollIframe={embedLayout.scrollIframe}
                lightboxMedia
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={!canNext}
          className="absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-black/50 text-white backdrop-blur-[2px] transition-all hover:bg-black/65 disabled:pointer-events-none disabled:opacity-0 sm:right-6 md:right-10"
          aria-label="Next wedding"
        >
          <ChevronRight size={24} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export function RealWeddingsSection({ posts }: { posts: RealWeddingPost[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [windowStart, setWindowStart] = useState(0);

  const carouselPosts = useMemo(() => posts.slice(0, CAROUSEL_MAX_POSTS), [posts]);

  const pageSize = WEDDING_VISIBLE;
  const canPage = carouselPosts.length > pageSize;

  useEffect(() => {
    setWindowStart(0);
  }, [posts]);

  useEffect(() => {
    if (carouselPosts.length === 0 || lightboxIndex != null || !canPage) return;

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === "ArrowLeft" && windowStart > 0) {
        e.preventDefault();
        setWindowStart((s) => Math.max(0, s - pageSize));
      }
      if (e.key === "ArrowRight" && windowStart + pageSize < carouselPosts.length) {
        e.preventDefault();
        setWindowStart((s) => {
          const next = s + pageSize;
          return next < carouselPosts.length ? next : s;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [carouselPosts.length, lightboxIndex, canPage, windowStart, pageSize]);

  if (posts.length === 0) return null;

  const canGoPrev = windowStart > 0;
  const canGoNext = windowStart + pageSize < carouselPosts.length;
  const pageCount = Math.ceil(carouselPosts.length / pageSize);
  const currentPage = Math.floor(windowStart / pageSize) + 1;
  const gapRem = 0.5;
  const gapsTotalRem = Math.max(0, pageSize - 1) * gapRem;
  const centerTrack = carouselPosts.length <= pageSize;
  const slideVars = {
    ["--wedding-gap" as string]: `${gapRem}rem`,
    ["--wedding-card" as string]: `calc((100% - ${gapsTotalRem}rem) / ${pageSize})`,
  } as CSSProperties;

  const goPrev = () => setWindowStart((s) => Math.max(0, s - pageSize));
  const goNext = () =>
    setWindowStart((s) => {
      const next = s + pageSize;
      return next < carouselPosts.length ? next : s;
    });

  const pageLabel = `${currentPage} of ${pageCount}`;
  const galleryCountLabel = posts.length > 1 ? ` (${posts.length})` : "";
  const viewAllAriaLabel = posts.length === 1 ? "View wedding" : `View all ${posts.length} weddings`;

  return (
    <section className="mt-6" aria-label={viewAllAriaLabel}>
      <div className="border-y border-black/[0.06] py-4 sm:py-5">
        <div className="min-w-0 overflow-hidden" style={slideVars}>
          <div
            className={`flex transition-transform duration-300 ease-in-out${centerTrack ? " justify-center" : ""}`}
            style={{
              gap: "var(--wedding-gap)",
              transform: centerTrack
                ? undefined
                : `translateX(calc(-${windowStart} * (var(--wedding-card) + var(--wedding-gap))))`,
            }}
          >
            {carouselPosts.map((post, i) => (
              <div key={post.post_url} className="shrink-0" style={{ width: "var(--wedding-card)" }}>
                <WeddingEmbedGridCard post={post} onClick={() => setLightboxIndex(i)} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-col items-center gap-2">
          {canPage && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canGoPrev}
                className="rounded-full border border-black/[0.08] bg-white p-2 text-gray-600 transition-colors hover:border-gray-300 hover:bg-white disabled:pointer-events-none disabled:opacity-25"
                aria-label="Previous weddings"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-gray-500">{pageLabel}</span>
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext}
                className="rounded-full border border-black/[0.08] bg-white p-2 text-gray-600 transition-colors hover:border-gray-300 hover:bg-white disabled:pointer-events-none disabled:opacity-25"
                aria-label="Next weddings"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            aria-label={viewAllAriaLabel}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200/70 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-rose-300 hover:bg-rose-50/40"
          >
            {posts.length === 1 ? "View wedding" : `View weddings${galleryCountLabel}`}
          </button>
        </div>
      </div>

      {lightboxIndex != null && (
        <WeddingPostLightbox posts={posts} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </section>
  );
}

// ── Inquiry ──────────────────────────────────────────────────────────────────

export type InquiryMode = "tour" | "question";

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

export function earliestTourLabel(): string {
  const slot = addBusinessDays(new Date(), 3);
  const datePart = slot.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${datePart} 9:00 AM`;
}

export function InquireForm({ mode, onBack }: { mode: InquiryMode; onBack: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", date: "", guests: "", message: "" });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const isTour = mode === "tour";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ChevronLeft size={16} />
        Back
      </button>
      <input
        type="text"
        placeholder="Your name"
        value={form.name}
        onChange={set("name")}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-rose-300"
      />
      <input
        type="email"
        placeholder="Email address"
        value={form.email}
        onChange={set("email")}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-rose-300"
      />
      {isTour && (
        <div className="grid grid-cols-2 gap-3">
          <input
            type="date"
            value={form.date}
            onChange={set("date")}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 outline-none transition-colors focus:border-rose-300"
          />
          <input
            type="number"
            placeholder="Guests"
            value={form.guests}
            onChange={set("guests")}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-rose-300"
          />
        </div>
      )}
      <textarea
        placeholder={isTour ? "Notes for your visit (optional)" : "Your question"}
        value={form.message}
        onChange={set("message")}
        rows={3}
        className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-rose-300"
      />
      <button className="w-full rounded-xl bg-rose-400 py-3.5 text-sm font-medium text-white transition-colors hover:bg-rose-500">
        {isTour ? "Request tour" : "Send"}
      </button>
    </div>
  );
}

export function VenuePhotoThumb({
  placeId,
  photoNames,
  className = "",
  size = "md",
}: {
  placeId?: string;
  photoNames?: string[] | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const { urls } = usePlacePhotos(placeId, {
    maxWidth: 200,
    count: 1,
    photoNames: photoNames ?? undefined,
  });
  const src = urls[0] ?? null;
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-white/40 ${className}`}
      />
    );
  }
  return (
    <div className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-rose-300/40 ${className}`}>
      <span className={size === "sm" ? "text-xs text-white/80" : "text-sm text-white/80"}>✦</span>
    </div>
  );
}
