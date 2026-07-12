"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import InstagramEmbed, {
  computeLightboxEmbedLayout,
} from "./InstagramEmbed";
import { displayAddressFor, formatCount } from "@/app/lib/format-address";
import { venueMatchesSearch } from "@/app/lib/venue-search";
import { BRAND_EMAIL, BRAND_NAME } from "@/app/lib/brand";
import { siteContainerClass, SITE_HEADER_HEIGHT_CLASS, SITE_MAX_WIDTH_CLASS, SITE_PADDING_X_CLASS } from "@/app/lib/site-layout";
import { displayHeadingClassName, uiHeadingClassName } from "@/app/lib/typography";
import { type MapBounds, venuesInMapBounds } from "@/app/lib/map-bounds";
import VenuesMapPanel from "./VenuesMapPanel";
import MapBrowseToolbar from "./MapBrowseToolbar";
import MapBrowsePanelToggle, { type MapBrowseMobilePanel } from "./MapBrowsePanelToggle";
import VenueMapBrowseCard from "./VenueMapBrowseCard";
import CategoryIcon, { resolveCategoryIcon } from "./CategoryIcon";
import { SiteNavLinks } from "./SiteNavLinks";
import { SiteBrand } from "./SiteBrand";
import { useNavIconsVisible } from "@/app/hooks/use-nav-icons-visible";
import VenueRating from "./VenueRating";
import { VenuePlacePhoto } from "./VenuePlacePhoto";
import { usePlacePhotos } from "@/app/hooks/use-place-photos";
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  Leaf,
  Map as MapIcon,
  MapPin,
  ParkingCircle,
  Search,
  Share2,
  SlidersHorizontal,
  Star,
  UtensilsCrossed,
  Users,
  Wine,
  X,
} from "lucide-react";

const DETAIL_API_URL = "https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VenueVendor = {
  id: number;
  place_id: string;
  name: string;
  category: string;
  primary_type: string | null;
  rating: number | string | null;
  review_count: number | null;
  address: string | null;
  short_address: string | null;
  neighborhood: string | null;
  website: string | null;
  photos: string[] | null;
  price_level: number | null;
  editorial_summary: string | null;
  ai_summary?: string | null;
  outdoor_seating?: boolean | null;
  good_for_groups?: boolean | null;
  serves_cocktails?: boolean | null;
  serves_wine?: boolean | null;
  serves_beer?: boolean | null;
  serves_dinner?: boolean | null;
  parking_options?: Record<string, boolean> | null;
  instagram_handle?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  city?: string | null;
  state?: string | null;
};

type RealWeddingPost = {
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

type Partner = {
  id: number;
  name: string;
  category: string;
  photos: string[] | null;
  times_mentioned: number;
};

type VenueDetail = {
  vendor: VenueVendor;
  realWeddings: RealWeddingPost[];
  frequentlyWorksWith: Partner[];
};

type Fact = { Icon: React.ElementType; label: string };

type VenueCard = VenueVendor & {
  displayRating: number;
  displayReviews: number;
  location: string;
  displayAddress: string;
  styleLabel: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BUDGETS = ["Any", "$", "$$", "$$$", "$$$$"];
const GUEST_FILTERS = ["Any", "50+", "100+", "150+", "200+"];

const CATEGORY_LABELS: Record<string, string> = {
  venue: "Venue",
  wedding_venue: "Wedding Venue",
  event_venue: "Event Space",
  banquet_hall: "Banquet Hall",
  historical_landmark: "Historic",
  hotel: "Hotel",
  caterer: "Catering",
  florist: "Florals",
  photographer: "Photography",
  dj_music: "DJ & Music",
  hair_makeup: "Hair & Makeup",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrimaryType(type: string | null): string {
  if (!type) return "Venue";
  const MAP: Record<string, string> = {
    wedding_venue: "Wedding Venue",
    event_venue: "Event Space",
    historical_landmark: "Historic",
    banquet_hall: "Banquet Hall",
    hotel: "Hotel",
    restaurant: "Restaurant",
    park: "Park",
    art_gallery: "Art Gallery",
    museum: "Museum",
    country_club: "Country Club",
  };
  return MAP[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeRating(value: number | string | null): number {
  if (value == null) return 0;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function budgetLabel(priceLevel: number | null): string {
  if (priceLevel == null) return "";
  return "$".repeat(Math.max(1, Math.min(priceLevel, 4)));
}

function locationFor(v: VenueVendor): string {
  return v.neighborhood ?? v.short_address ?? v.address ?? "Chicago";
}

function categoryIcon(category: string | null, primaryType?: string | null): string {
  return resolveCategoryIcon(category, primaryType);
}

function categoryLabel(category: string | null, primaryType?: string | null): string {
  if (category && CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  if (primaryType) return formatPrimaryType(primaryType);
  return "Vendor";
}

function fullAddress(v: VenueVendor): string {
  return [v.address, v.city, v.state].filter(Boolean).join(", ") || locationFor(v);
}

function googleMapsUrl(v: VenueVendor): string {
  const lat = v.lat != null ? Number(v.lat) : NaN;
  const lng = v.lng != null ? Number(v.lng) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(v))}`;
}

function aboutFor(v: VenueVendor): string | null {
  const text = v.editorial_summary?.trim() || v.ai_summary?.trim();
  return text || null;
}

// outdoor_seating is true-or-null in our data (never confirmed false), so this
// is a best-effort signal, not a guarantee.
function factsFor(v: VenueVendor): Fact[] {
  const facts: Fact[] = [];
  if (v.outdoor_seating) facts.push({ Icon: Leaf, label: "Outdoor space" });
  if (v.serves_cocktails || v.serves_wine || v.serves_beer)
    facts.push({ Icon: Wine, label: "Full bar" });
  if (v.serves_dinner) facts.push({ Icon: UtensilsCrossed, label: "On-site dining" });
  if (v.good_for_groups) facts.push({ Icon: Users, label: "Great for groups" });
  if (v.parking_options && Object.values(v.parking_options).some(Boolean))
    facts.push({ Icon: ParkingCircle, label: "Parking available" });
  return facts;
}

function buildVenueCards(venues: VenueVendor[]): VenueCard[] {
  return venues.map((venue) => ({
    ...venue,
    displayRating: normalizeRating(venue.rating),
    displayReviews: venue.review_count ?? 0,
    location: venue.neighborhood ?? venue.short_address ?? venue.address ?? "Chicago",
    displayAddress: displayAddressFor(venue),
    styleLabel: formatPrimaryType(venue.primary_type),
  }));
}

// ── Venue Detail Modal ───────────────────────────────────────────────────────

function VenueSectionHeading({
  title,
  subtitle,
  className = "",
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`mb-3 ${className}`}>
      <h3 className={`text-lg leading-snug text-gray-900 ${uiHeadingClassName}`}>
        {title}
      </h3>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
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

function hasVenueOverlay(): boolean {
  return Boolean(document.querySelector('[data-venue-overlay="true"]'));
}

function PhotoLightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") setCurrent((c) => Math.max(0, c - 1));
      if (e.key === "ArrowRight") setCurrent((c) => Math.min(photos.length - 1, c + 1));
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose, photos.length]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      data-venue-overlay="true"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm text-white/70">
          {current + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-2 hover:bg-white/10 transition-colors"
          aria-label="Close gallery"
        >
          <X size={20} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-8" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[current]}
          alt=""
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
        />
        {current > 0 && (
          <button
            onClick={() => setCurrent((c) => c - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 shadow-lg hover:bg-white transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-800" />
          </button>
        )}
        {current < photos.length - 1 && (
          <button
            onClick={() => setCurrent((c) => c + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 shadow-lg hover:bg-white transition-colors"
          >
            <ChevronRight size={20} className="text-gray-800" />
          </button>
        )}
      </div>
    </div>
  );
}

function PhotoGrid({
  placeId,
  photoNames,
  alt,
}: {
  placeId: string;
  photoNames?: string[] | null;
  alt: string;
}) {
  const { urls: photos, loading } = usePlacePhotos(placeId, {
    maxWidth: 1200,
    count: 10,
    photoNames: photoNames ?? undefined,
  });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (loading && photos.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-pink-200 sm:h-72">
        <span className="text-sm text-rose-300/80">Loading photos…</span>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-pink-200 sm:h-72">
        <span className="text-5xl text-rose-300">✦</span>
      </div>
    );
  }

  const open = (index: number) => setLightboxIndex(index);
  const gridPhotos = photos.slice(0, 5);
  const extraCount = photos.length - 5;

  const cell = (src: string, index: number, className: string, showMore?: boolean) => (
    <button
      key={index}
      type="button"
      onClick={() => open(index)}
      className={`relative overflow-hidden bg-gray-100 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
      {showMore && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
          Show all photos
        </span>
      )}
    </button>
  );

  let grid: ReactNode;

  if (photos.length === 1) {
    grid = cell(photos[0], 0, "h-56 w-full rounded-2xl sm:h-80");
  } else if (photos.length === 2) {
    grid = (
      <div className="grid h-56 grid-cols-2 gap-2 sm:h-72">
        {photos.map((src, i) => cell(src, i, "rounded-xl first:rounded-l-2xl last:rounded-r-2xl"))}
      </div>
    );
  } else if (photos.length === 3) {
    grid = (
      <div className="grid h-56 grid-cols-2 grid-rows-2 gap-2 sm:h-72">
        {cell(photos[0], 0, "col-span-1 row-span-2 rounded-l-2xl")}
        {cell(photos[1], 1, "rounded-tr-2xl")}
        {cell(photos[2], 2, "rounded-br-2xl")}
      </div>
    );
  } else {
    const smallPhotos = gridPhotos.slice(1);
    grid = (
      <div className="grid h-56 grid-cols-4 grid-rows-2 gap-2 sm:h-80">
        {cell(gridPhotos[0], 0, "col-span-2 row-span-2 rounded-l-2xl")}
        {smallPhotos.map((src, i) => {
          const index = i + 1;
          const isLast = index === 4 && extraCount > 0;
          const cornerClasses: string[] = [];
          // Right column is a 2×2 grid: i=1 is top-right, i=3 is bottom-right of the full layout.
          if (i === 1) cornerClasses.push("rounded-tr-2xl");
          if (i === 3) cornerClasses.push("rounded-br-2xl");
          else if (smallPhotos.length === 3 && i === 2) cornerClasses.push("rounded-br-2xl");
          return cell(src, index, cornerClasses.join(" "), isLast);
        })}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {grid}
        {photos.length > 1 && photos.length <= 4 && (
          <button
            type="button"
            onClick={() => open(0)}
            className="absolute bottom-3 right-3 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Show all photos
          </button>
        )}
      </div>
      {lightboxIndex !== null && (
        <PhotoLightbox photos={photos} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
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

function WeddingPostLightbox({
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

function RealWeddingsSection({ posts }: { posts: RealWeddingPost[] }) {
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
  const goNext = () => setWindowStart((s) => {
    const next = s + pageSize;
    return next < carouselPosts.length ? next : s;
  });

  const pageLabel = `${currentPage} of ${pageCount}`;
  const galleryCountLabel = posts.length > 1 ? ` (${posts.length})` : "";
  const viewAllAriaLabel =
    posts.length === 1 ? "View wedding" : `View all ${posts.length} weddings`;

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
                <WeddingEmbedGridCard
                  post={post}
                  onClick={() => setLightboxIndex(i)}
                />
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
        <WeddingPostLightbox
          posts={posts}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </section>
  );
}

function VenueMap({ vendor }: { vendor: VenueVendor }) {
  const address = fullAddress(vendor);
  const lat = vendor.lat != null ? Number(vendor.lat) : NaN;
  const lng = vendor.lng != null ? Number(vendor.lng) : NaN;
  const query =
    Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : address;
  // Classic embed — no Maps Embed API key required (Places API key alone is not enough).
  const embedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;

  return (
    <div>
      <VenueSectionHeading title="Location" />
      <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
        <iframe
          title={`Map of ${vendor.name}`}
          src={embedSrc}
          className="h-52 w-full border-0 sm:h-60"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-1.5 text-sm text-gray-500">
          <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
          {address}
        </p>
        <a
          href={googleMapsUrl(vendor)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm font-medium text-rose-500 hover:text-rose-600 transition-colors"
        >
          Open in Google Maps →
        </a>
      </div>
    </div>
  );
}

function FrequentlyWorksWith({
  partners,
  onNavigateToVendor,
}: {
  partners: Partner[];
  onNavigateToVendor?: (id: number) => void;
}) {
  if (partners.length === 0) return null;
  return (
    <div>
      <VenueSectionHeading
        title="Commonly tagged here"
        subtitle="From real wedding posts at this venue"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {partners.map((p) => {
          const label = categoryLabel(p.category, null);
          const icon = categoryIcon(p.category, null);
          const tile = (
            <>
              <div className="mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                <Image src={icon} alt="" width={26} height={26} className="object-contain" />
              </div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
              <p className="mt-1 text-sm font-medium leading-snug text-gray-900">{p.name}</p>
              {p.times_mentioned > 1 && (
                <p className="mt-1 text-[11px] text-gray-400">Tagged {p.times_mentioned}×</p>
              )}
            </>
          );
          if (onNavigateToVendor) {
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onNavigateToVendor(p.id)}
                className="flex flex-col items-center rounded-2xl border border-black/[0.06] bg-[#fdf8f5] p-4 text-center transition-colors hover:border-rose-200 hover:bg-rose-50/40"
              >
                {tile}
              </button>
            );
          }
          return (
            <div
              key={p.id}
              className="flex flex-col items-center rounded-2xl border border-black/[0.06] bg-[#fdf8f5] p-4 text-center"
            >
              {tile}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type InquiryMode = "tour" | "question";

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

function earliestTourLabel(): string {
  const slot = addBusinessDays(new Date(), 3);
  const datePart = slot.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${datePart} 9:00 AM`;
}

function InquireForm({
  mode,
  onBack,
}: {
  mode: InquiryMode;
  onBack: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", date: "", guests: "", message: "" });
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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

function VenuePhotoThumb({
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
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-rose-300/40 ${className}`}
    >
      <span className={size === "sm" ? "text-xs text-white/80" : "text-sm text-white/80"}>✦</span>
    </div>
  );
}

function VenueInquiryPanel({
  id,
  placeId,
  photoNames,
}: {
  id?: string;
  placeId?: string;
  photoNames?: string[] | null;
}) {
  const [mode, setMode] = useState<InquiryMode | null>(null);
  const tourWhen = earliestTourLabel();

  return (
    <div id={id} className="scroll-mt-24 rounded-2xl border border-black/[0.08] bg-[#fdf8f5] p-4">
      {mode ? (
        <InquireForm mode={mode} onBack={() => setMode(null)} />
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMode("tour")}
            className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-1.5 rounded-xl bg-rose-400 px-2 py-3.5 text-white shadow-sm transition-colors hover:bg-rose-500"
          >
            <VenuePhotoThumb placeId={placeId} photoNames={photoNames} size="sm" />
            <div className="min-w-0 text-center">
              <span className="block text-sm font-medium leading-tight">Request a tour</span>
              <span className="block whitespace-nowrap text-[10px] leading-snug text-rose-50/90">{tourWhen}</span>
            </div>
            <div className="h-8 w-8 shrink-0" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setMode("question")}
            className="flex w-full items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-3.5 text-sm font-medium text-gray-900 transition-colors hover:border-rose-300 hover:bg-rose-50"
          >
            Ask a question
          </button>
        </div>
      )}
    </div>
  );
}

function VenueDetailModal({
  venueId,
  onClose,
  onNavigateToVendor,
}: {
  venueId: number;
  onClose: () => void;
  onNavigateToVendor?: (id: number) => void;
}) {
  const [detail, setDetail] = useState<VenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [readMore, setReadMore] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showStickyTitle, setShowStickyTitle] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${DETAIL_API_URL}/${venueId}`)
      .then((res) => res.json())
      .then((data) => setDetail(data))
      .finally(() => setLoading(false));
  }, [venueId]);

  useEffect(() => {
    setShowStickyTitle(false);
    setReadMore(false);
    setLoading(true);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [venueId]);

  useEffect(() => {
    const root = scrollRef.current;
    const hero = heroRef.current;
    if (!root || !hero || loading || !detail) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyTitle(!entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [loading, detail, venueId]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || hasVenueOverlay()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const scrollToInquiry = () => {
    const el = document.getElementById("venue-inquiry-form");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const v = detail?.vendor;
  const rating = v ? normalizeRating(v.rating) : 0;
  const price = v ? budgetLabel(v.price_level) : "";
  const facts = v ? factsFor(v) : [];
  const about = v ? aboutFor(v) : null;
  const short = about && about.length > 200 ? about.slice(0, 200) + "…" : about;
  const typeLabel = v ? formatPrimaryType(v.primary_type) : "";

  return (
    <div
      data-venue-detail-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky top bar */}
        <div className="sticky top-0 z-20 shrink-0 border-b border-black/[0.06] bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Venues</span>
            </button>

            <div
              className={`flex min-w-0 items-center justify-center gap-1.5 transition-opacity duration-200 ${
                showStickyTitle && v ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={!showStickyTitle}
            >
              {v && (
                <>
                  <CategoryIcon category={v.category} primaryType={v.primary_type} compact />
                  <p className="min-w-0 truncate text-sm font-medium text-gray-600">{v.name}</p>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setSaved((s) => !s)}
                className="rounded-full p-2.5 text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Save venue"
              >
                <Heart size={18} className={saved ? "fill-rose-500 text-rose-500" : ""} />
              </button>
              <button
                type="button"
                className="rounded-full p-2.5 text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Share venue"
              >
                <Share2 size={18} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2.5 text-gray-600 hover:bg-gray-100 transition-colors sm:hidden"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loading || !detail || !v ? (
            <div className="flex items-center justify-center py-32">
              <p className="text-sm text-gray-400">Loading venue…</p>
            </div>
          ) : (
            <>
            <div className="px-4 pb-6 sm:px-6 lg:px-8">
              <div ref={heroRef} className="border-b border-black/[0.06] pb-5 pt-4 sm:pt-5">
                <div className="flex items-stretch gap-4">
                  <CategoryIcon category={v.category} primaryType={v.primary_type} large />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">
                      {typeLabel}
                    </p>
                    <h2 className={`text-2xl leading-tight text-gray-900 sm:text-3xl ${displayHeadingClassName}`}>
                      {v.name}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {rating > 0 && (
                        <div className="flex items-center gap-1">
                          <Star size={14} className="fill-rose-400 text-rose-400" />
                          <span className="text-sm font-medium text-gray-800">{rating.toFixed(1)}</span>
                          {v.review_count ? (
                            <span className="text-sm text-gray-400">
                              ({formatCount(v.review_count)} reviews)
                            </span>
                          ) : null}
                        </div>
                      )}
                      {price && (
                        <span className="text-sm font-medium text-gray-500">{price}</span>
                      )}
                      {v.website && (
                        <a
                          href={v.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          <ExternalLink size={13} />
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="py-5 sm:py-6">
                <PhotoGrid placeId={v.place_id} photoNames={v.photos} alt={v.name} />
              </div>
            </div>

            <div className="px-4 pb-28 sm:px-6 sm:pb-8 lg:px-8">
              <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-10 lg:items-start lg:pt-2">
                <div className="min-w-0 space-y-8">
                  {about && (
                    <div>
                      <VenueSectionHeading title="About this venue" />
                      <p className="text-sm leading-[1.65] text-gray-600">{readMore ? about : short}</p>
                      {about.length > 200 && (
                        <button
                          type="button"
                          onClick={() => setReadMore(!readMore)}
                          className="mt-2 text-sm font-medium text-rose-500 transition-colors hover:text-rose-600"
                        >
                          {readMore ? "Show less" : "Read more"}
                        </button>
                      )}
                    </div>
                  )}

                  {facts.length > 0 && (
                    <div>
                      <VenueSectionHeading title="Good to know" />
                      <div className="flex flex-wrap gap-2">
                        {facts.map(({ Icon, label }) => (
                          <span
                            key={label}
                            className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700"
                          >
                            <Icon size={14} className="shrink-0 text-rose-400" />
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="lg:hidden">
                    <VenueInquiryPanel id="venue-inquiry-form" placeId={v.place_id} photoNames={v.photos} />
                  </div>
                </div>

                <aside className="hidden lg:block">
                  <div className="sticky top-20">
                    <VenueInquiryPanel id="venue-inquiry-form-desktop" placeId={v.place_id} photoNames={v.photos} />
                  </div>
                </aside>
              </div>

              <div className="mt-8 space-y-8">
                <RealWeddingsSection posts={detail.realWeddings ?? []} />
                <VenueMap vendor={v} />
                <FrequentlyWorksWith
                  partners={detail.frequentlyWorksWith}
                  onNavigateToVendor={onNavigateToVendor}
                />
              </div>
            </div>
            </>
          )}
        </div>

        {/* Mobile sticky CTA */}
        {!loading && detail && v && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.08] bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] sm:hidden">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{v.name}</p>
                {rating > 0 && (
                  <p className="text-xs text-gray-400">
                    ★ {rating.toFixed(1)}
                    {v.review_count ? ` · ${formatCount(v.review_count)} reviews` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={scrollToInquiry}
                className="shrink-0 rounded-xl bg-rose-400 px-5 py-3 text-sm font-medium text-white hover:bg-rose-500 transition-colors"
              >
                Contact
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Browse layout helpers ─────────────────────────────────────────────────────

function ViewModeToggle({ viewMode }: { viewMode: "list" | "map" }) {
  return (
    <div className="inline-flex rounded-full border border-black/[0.08] bg-white p-1 shadow-sm">
      <Link
        href="/venues"
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
        }`}
      >
        <SlidersHorizontal size={14} />
        List
      </Link>
      <Link
        href="/venues?view=map"
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          viewMode === "map" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
        }`}
      >
        <MapIcon size={14} />
        Map
      </Link>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const MAP_LIST_PAGE_SIZE = 24;

function MapBrowsePagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  const delta = 2;
  const range: number[] = [];
  for (
    let i = Math.max(1, currentPage - delta);
    i <= Math.min(totalPages, currentPage + delta);
    i++
  ) {
    range.push(i);
  }
  if (range[0] > 1) {
    pages.push(1);
    if (range[0] > 2) pages.push("…");
  }
  pages.push(...range);
  if (range[range.length - 1] < totalPages) {
    if (range[range.length - 1] < totalPages - 1) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="mt-8 flex items-center justify-center gap-1 pb-2">
      {currentPage > 1 && (
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          className="rounded-full border border-black/[0.08] px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          ← Prev
        </button>
      )}

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-gray-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              p === currentPage
                ? "bg-rose-400 text-white"
                : "border border-black/[0.08] text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {p}
          </button>
        ),
      )}

      {currentPage < totalPages && (
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          className="rounded-full border border-black/[0.08] px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          Next →
        </button>
      )}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  // Build page number list: always show first, last, and up to 2 around current
  const pages: (number | "…")[] = [];
  const delta = 2;
  const range: number[] = [];
  for (
    let i = Math.max(1, currentPage - delta);
    i <= Math.min(totalPages, currentPage + delta);
    i++
  ) {
    range.push(i);
  }
  if (range[0] > 1) {
    pages.push(1);
    if (range[0] > 2) pages.push("…");
  }
  pages.push(...range);
  if (range[range.length - 1] < totalPages) {
    if (range[range.length - 1] < totalPages - 1) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="mt-10 flex items-center justify-center gap-1">
      {currentPage > 1 && (
        <a
          href={`/venues?page=${currentPage - 1}`}
          className="rounded-full border border-black/[0.08] px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          ← Prev
        </a>
      )}

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-gray-400">
            …
          </span>
        ) : (
          <a
            key={p}
            href={`/venues?page=${p}`}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              p === currentPage
                ? "bg-rose-400 text-white"
                : "border border-black/[0.08] text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {p}
          </a>
        )
      )}

      {currentPage < totalPages && (
        <a
          href={`/venues?page=${currentPage + 1}`}
          className="rounded-full border border-black/[0.08] px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          Next →
        </a>
      )}
    </div>
  );
}

export default function VenuesClient({
  venues,
  total,
  currentPage,
  pageSize,
  viewMode = "list",
}: {
  venues: VenueVendor[];
  total: number;
  currentPage: number;
  pageSize: number;
  viewMode?: "list" | "map";
}) {
  const totalPages = Math.ceil(total / pageSize);
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("All");
  const [budget, setBudget] = useState("Any");
  const [weddingDate, setWeddingDate] = useState("");
  const [guestFilter, setGuestFilter] = useState("Any");
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("recommended");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapMobilePanel, setMapMobilePanel] = useState<MapBrowseMobilePanel>("list");
  const [mapHoveredPinId, setMapHoveredPinId] = useState<number | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [mapListPage, setMapListPage] = useState(1);
  const [savedVenueIds, setSavedVenueIds] = useState<Set<number>>(new Set());
  const listItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const mapListScrollRef = useRef<HTMLDivElement>(null);
  const navIconsVisible = useNavIconsVisible(32, viewMode === "map" ? mapListScrollRef : undefined);

  const venueCards = useMemo(() => buildVenueCards(venues), [venues]);

  const styleOptions = useMemo(() => {
    const types = new Set(venueCards.map((v) => v.styleLabel));
    return ["All", ...Array.from(types).sort()];
  }, [venueCards]);

  const filteredVenues = useMemo(() => {
    return venueCards
      .filter((venue) => {
        const matchesSearch = venueMatchesSearch(venue, query);
        const matchesStyle = style === "All" || venue.styleLabel === style;
        const matchesBudget =
          budget === "Any" || budgetLabel(venue.price_level) === budget;

        return matchesSearch && matchesStyle && matchesBudget;
      })
      .sort((a, b) => {
        if (sortBy === "rating") return b.displayRating - a.displayRating;
        return (
          b.displayRating * 100 + b.displayReviews -
          (a.displayRating * 100 + a.displayReviews)
        );
      });
  }, [budget, query, sortBy, style, venueCards]);

  const handleMapBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
  }, []);

  const mapAreaVenues = useMemo(
    () => venuesInMapBounds(filteredVenues, mapBounds, mapSelectedId),
    [filteredVenues, mapBounds, mapSelectedId],
  );

  const mapListTotalPages = Math.max(1, Math.ceil(mapAreaVenues.length / MAP_LIST_PAGE_SIZE));

  const paginatedMapVenues = useMemo(() => {
    const start = (mapListPage - 1) * MAP_LIST_PAGE_SIZE;
    return mapAreaVenues.slice(start, start + MAP_LIST_PAGE_SIZE);
  }, [mapAreaVenues, mapListPage]);

  const comparedVenues = venueCards.filter((v) => compareIds.has(v.place_id));

  const focusMapList = () => {
    mapListScrollRef.current?.focus({ preventScroll: true });
  };

  const handleMapSelectVenue = (id: number | null) => {
    setMapSelectedId(id);
    if (id === null) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      focusMapList();
    }
  };

  const toggleCompare = (placeId: string) => {
    setCompareIds((current) => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else if (next.size < 3) {
        next.add(placeId);
      }
      return next;
    });
  };

  useEffect(() => {
    setMapListPage(1);
  }, [query, style, budget]);

  useEffect(() => {
    if (mapSelectedId == null) return;
    const index = mapAreaVenues.findIndex((v) => v.id === mapSelectedId);
    if (index >= 0) {
      setMapListPage(Math.floor(index / MAP_LIST_PAGE_SIZE) + 1);
    }
    // Jump to the selected venue's page when selection changes — not on every map pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapAreaVenues read at selection time only
  }, [mapSelectedId]);

  useEffect(() => {
    if (viewMode !== "map") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const resetMobilePanel = () => {
      if (mq.matches) setMapMobilePanel("list");
    };
    resetMobilePanel();
    mq.addEventListener("change", resetMobilePanel);
    return () => mq.removeEventListener("change", resetMobilePanel);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "map") return;
    const search = query.trim();
    if (search.length > 0 && filteredVenues.length === 1) {
      setMapSelectedId(filteredVenues[0].id);
      return;
    }
    setMapSelectedId((current) =>
      current != null && !filteredVenues.some((v) => v.id === current) ? null : current,
    );
  }, [filteredVenues, query, viewMode]);

  useEffect(() => {
    if (mapListPage > mapListTotalPages) setMapListPage(mapListTotalPages);
  }, [mapListPage, mapListTotalPages]);

  const goToMapListPage = (page: number) => {
    setMapListPage(page);
    mapListScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (mapSelectedId == null) return;
    requestAnimationFrame(() => {
      listItemRefs.current.get(mapSelectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [mapSelectedId, mapListPage]);

  const handleMapListSelect = (venue: VenueCard) => {
    setMapSelectedId(venue.id);
  };

  const toggleSaveVenue = (id: number) => {
    setSavedVenueIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (viewMode === "map") {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-white font-sans text-gray-900">
        <MapBrowseToolbar
          query={query}
          onQueryChange={setQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          style={style}
          onStyleChange={setStyle}
          budget={budget}
          onBudgetChange={setBudget}
          weddingDate={weddingDate}
          onWeddingDateChange={setWeddingDate}
          guestFilter={guestFilter}
          onGuestFilterChange={setGuestFilter}
          styleOptions={styleOptions}
          budgets={BUDGETS}
          guestOptions={GUEST_FILTERS}
          compareCount={compareIds.size}
          showNavIcons={navIconsVisible}
        />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* List scrolls full-width so the scrollbar sits on the page edge; content stays left */}
          <div
            ref={mapListScrollRef}
            tabIndex={-1}
            className={`min-h-0 flex-1 overflow-y-auto outline-none lg:pointer-events-none lg:absolute lg:inset-0 lg:z-[1] ${
              mapMobilePanel === "map" ? "hidden lg:block" : ""
            } ${mapExpanded ? "lg:hidden" : ""}`}
          >
            {/* Far-right gutter: scroll works here without hitting the map */}
            <div
              aria-hidden
              className="hidden lg:pointer-events-auto lg:absolute lg:inset-y-0 lg:right-0 lg:z-10 lg:w-10"
            />
            {/* Narrow seam — scroll the list when the cursor is between cards and map */}
            <div
              aria-hidden
              className="hidden lg:pointer-events-auto lg:absolute lg:inset-y-0 lg:left-[56%] lg:z-10 lg:w-3 lg:-translate-x-1/2"
            />
            <div className="@container px-4 py-4 pb-24 sm:px-6 lg:pointer-events-auto lg:w-[56%] lg:px-6 lg:pr-4 lg:pb-8">
              <p className="mb-4 text-base font-semibold text-gray-900">
                {mapAreaVenues.length === 1
                  ? "1 venue in this area"
                  : `${mapAreaVenues.length} venues in this area`}
              </p>
              {paginatedMapVenues.length === 0 ? (
                <div className="rounded-2xl border border-black/[0.06] bg-gray-50 px-5 py-10 text-center">
                  <p className="text-sm font-medium text-gray-900">No venues in this map area</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Try zooming out, moving the map, or adjusting your filters.
                  </p>
                </div>
              ) : (
              <div className="grid grid-cols-1 gap-x-3 gap-y-6 @md:grid-cols-2 @3xl:grid-cols-3">
                {paginatedMapVenues.map((venue) => (
                  <VenueMapBrowseCard
                    key={venue.id}
                    venue={venue}
                    active={mapSelectedId === venue.id}
                    saved={savedVenueIds.has(venue.id)}
                    onSelect={() => handleMapListSelect(venue)}
                    onToggleSave={() => toggleSaveVenue(venue.id)}
                    onOpen={() => setSelectedVenueId(venue.id)}
                    onHover={() => setMapHoveredPinId(venue.id)}
                    onHoverEnd={() => setMapHoveredPinId(null)}
                    listRef={(el) => {
                      if (el) listItemRefs.current.set(venue.id, el);
                      else listItemRefs.current.delete(venue.id);
                    }}
                  />
                ))}
              </div>
              )}
              {mapAreaVenues.length > 0 ? (
                <MapBrowsePagination
                  currentPage={mapListPage}
                  totalPages={mapListTotalPages}
                  onPageChange={goToMapListPage}
                />
              ) : null}
            </div>
          </div>

          {/* Map stays fixed on screen while the list scrolls (desktop: pinned right) */}
          <div
            className={`relative min-h-0 lg:absolute lg:inset-y-0 lg:z-0 lg:min-h-0 lg:transition-[left,padding] lg:duration-300 ${
              mapMobilePanel === "list" ? "hidden lg:block" : "flex min-h-0 flex-1 flex-col"
            } ${
              mapExpanded
                ? "lg:inset-x-0 lg:left-0 lg:p-4 lg:px-6"
                : "lg:left-[56%] lg:right-10 lg:p-3 lg:pl-1 lg:pr-1"
            }`}
          >
            <div
              className={`h-full overflow-hidden rounded-2xl border border-black/[0.08] shadow-sm lg:min-h-0 ${
                mapMobilePanel === "map" ? "min-h-0 flex-1" : ""
              }`}
            >
              <VenuesMapPanel
                venues={mapAreaVenues}
                fitBoundsVenues={filteredVenues}
                selectedId={mapSelectedId}
                savedIds={savedVenueIds}
                mapExpanded={mapExpanded}
                mapLayoutKey={`${mapExpanded}-${mapMobilePanel}`}
                hoveredPinId={mapHoveredPinId}
                onBoundsChange={handleMapBoundsChange}
                onHoverPin={setMapHoveredPinId}
                onToggleMapExpanded={() => setMapExpanded((v) => !v)}
                onSelectVenue={handleMapSelectVenue}
                onOpenVenue={setSelectedVenueId}
                onToggleSave={toggleSaveVenue}
              />
            </div>
          </div>
        </div>

        <MapBrowsePanelToggle panel={mapMobilePanel} onPanelChange={setMapMobilePanel} />

        {selectedVenueId !== null && (
          <VenueDetailModal
            key={selectedVenueId}
            venueId={selectedVenueId}
            onClose={() => setSelectedVenueId(null)}
            onNavigateToVendor={setSelectedVenueId}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <header className="sticky top-0 z-50 border-b border-black/[0.08] bg-white/95 backdrop-blur">
        <div className={`flex ${SITE_HEADER_HEIGHT_CLASS} items-stretch justify-between ${siteContainerClass}`}>
          <SiteBrand href="/" className="self-center" />

          <SiteNavLinks activeLabel="Venues" showIcons={navIconsVisible} />

          <a
            href="#compare"
            className="self-center rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            Compare {compareIds.size > 0 ? compareIds.size : ""}
          </a>
        </div>
      </header>

      <main>
        {/* ── Hero / search bar ── */}
        <section className="relative overflow-hidden bg-[#fdf8f5]">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute right-0 top-0 h-[540px] w-[540px] translate-x-1/3 -translate-y-1/3 rounded-full bg-rose-100/50 blur-[110px]" />
            <div className="absolute bottom-0 left-0 h-[360px] w-[360px] -translate-x-1/3 translate-y-1/3 rounded-full bg-amber-100/40 blur-[100px]" />
          </div>

          <div className={`relative ${siteContainerClass} pb-12 pt-16 lg:pb-16 lg:pt-20`}>
            <div className="max-w-3xl">
              <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-rose-500">
                Chicago venues
              </p>
              <h1 className={`text-5xl leading-[1.05] tracking-tight text-gray-900 sm:text-6xl ${displayHeadingClassName}`}>
                Find the room that feels like your wedding.
              </h1>
            </div>

            <div className="mt-10 rounded-[2rem] border border-black/[0.06] bg-white p-3 shadow-[0_16px_50px_rgba(15,23,42,0.10)]">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                <label className="flex items-center gap-3 rounded-3xl bg-gray-50 px-5 py-4">
                  <Search size={18} className="text-gray-400" />
                  <span className="sr-only">Search venues</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, address, or venue type"
                    className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                  />
                </label>

                <label className="rounded-3xl bg-gray-50 px-5 py-3">
                  <span className="block text-[11px] font-medium uppercase tracking-widest text-gray-400">
                    Guests
                  </span>
                  <input
                    type="number"
                    min={20}
                    max={1000}
                    value={guestCount ?? ""}
                    onChange={(e) =>
                      setGuestCount(e.target.value === "" ? null : Number(e.target.value))
                    }
                    placeholder="Any"
                    className="mt-1 w-full bg-transparent text-sm font-medium text-gray-800 outline-none placeholder:font-normal placeholder:text-gray-400"
                  />
                </label>

                <label className="rounded-3xl bg-gray-50 px-5 py-3">
                  <span className="block text-[11px] font-medium uppercase tracking-widest text-gray-400">
                    Sort
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="mt-1 w-full bg-transparent text-sm font-medium text-gray-800 outline-none"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="rating">Highest rated</option>
                  </select>
                </label>

                <button className="rounded-3xl bg-rose-400 px-7 py-4 text-sm font-medium text-white transition-colors hover:bg-rose-500">
                  Browse venues
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Filter pills ── */}
        <section className="border-b border-black/[0.06] bg-white">
          <div className={`flex flex-col gap-4 py-5 ${siteContainerClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                <SlidersHorizontal size={16} />
                Refine your shortlist
              </div>
              <ViewModeToggle viewMode="list" />
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {styleOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => setStyle(item)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                    style === item
                      ? "border-rose-200 bg-rose-50 text-rose-600"
                      : "border-black/[0.08] bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {item}
                </button>
              ))}

              <div className="mx-1 h-10 w-px shrink-0 bg-black/[0.08]" />

              {BUDGETS.map((item) => (
                <button
                  key={item}
                  onClick={() => setBudget(item)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                    budget === item
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-black/[0.08] bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Venue grid ── */}
        <section className={`py-10 ${siteContainerClass}`}>
          <div>
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm text-gray-400">
                  {filteredVenues.length} of {total} venues · page {currentPage} of {totalPages}
                </p>
                <h2 className={`mt-1 text-3xl text-gray-900 ${displayHeadingClassName}`}>
                  Chicago venue options
                </h2>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <ArrowUpDown size={15} />
                Compare favorites as you browse
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {filteredVenues.map((venue) => {

                const isComparing = compareIds.has(venue.place_id);
                const disabled = !isComparing && compareIds.size >= 3;

                return (
                  <article
                    key={venue.place_id}
                    onClick={() => setSelectedVenueId(venue.id)}
                    className="group cursor-pointer overflow-hidden rounded-[1.7rem] border border-black/[0.07] bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
                  >
                    {/* Photo */}
                    <div className="relative h-64 overflow-hidden bg-gray-100">
                      <VenuePlacePhoto
                        placeId={venue.place_id}
                        photoNames={venue.photos}
                        alt={venue.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompare(venue.place_id);
                        }}
                        disabled={disabled}
                        className={`absolute right-3 top-3 rounded-full px-3 py-2 text-xs font-medium shadow-sm backdrop-blur transition-colors ${
                          isComparing
                            ? "bg-rose-500 text-white"
                            : "bg-white/90 text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:text-gray-300"
                        }`}
                      >
                        {isComparing ? "Comparing" : "Compare"}
                      </button>
                      <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 backdrop-blur">
                        {venue.styleLabel}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-5">
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-medium leading-snug text-gray-900">
                            {venue.name}
                          </h3>
                          <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                            <MapPin size={14} className="shrink-0 text-gray-400" />
                            {venue.displayAddress}
                          </p>
                        </div>
                        <VenueRating
                          rating={venue.displayRating}
                          reviews={venue.displayReviews}
                        />
                      </div>

                      <div className="flex items-center justify-between border-t border-black/[0.06] pt-3">
                        {venue.website ? (
                          <a
                            href={venue.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-rose-500 hover:text-rose-600 transition-colors"
                          >
                            Visit website →
                          </a>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-3">
                          {budgetLabel(venue.price_level) && (
                            <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
                              {budgetLabel(venue.price_level)}
                            </span>
                          )}
                          <a
                            href={`mailto:${BRAND_EMAIL}?subject=Claim listing: ${encodeURIComponent(venue.name)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Claim this listing
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <Pagination currentPage={currentPage} totalPages={totalPages} />
          </div>
        </section>

        {/* ── Compare section ── */}
        <section id="compare" className={`border-t border-black/[0.06] bg-gray-950 py-12 text-white ${SITE_PADDING_X_CLASS}`}>
          <div className={`mx-auto w-full ${SITE_MAX_WIDTH_CLASS}`}>
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-rose-300">Compare</p>
                <h2 className={`mt-2 text-3xl ${displayHeadingClassName}`}>
                  Your venue shortlist
                </h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-gray-400">
                Pick up to three venues while browsing. Compare style, rating, budget, and location.
              </p>
            </div>

            {comparedVenues.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6 text-sm text-gray-400">
                Tap Compare on any venue card to start a shortlist.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {comparedVenues.map((venue) => (
                  <div key={venue.place_id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white">{venue.name}</h3>
                        <p className="mt-1 text-sm text-gray-400">{venue.location}</p>
                      </div>
                      <button
                        onClick={() => toggleCompare(venue.place_id)}
                        className="rounded-full bg-white/10 p-1 text-gray-300 transition-colors hover:bg-white/15 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <dl className="space-y-3 text-sm">
                      {[
                        ["Style", venue.styleLabel],
                        ["Rating", venue.displayRating > 0 ? `${venue.displayRating.toFixed(1)}${venue.displayReviews > 0 ? ` (${formatCount(venue.displayReviews)})` : ""}` : "—"],
                        ["Budget", budgetLabel(venue.price_level) || "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 border-t border-white/10 pt-3">
                          <dt className="text-gray-500">{label}</dt>
                          <dd className="text-right text-gray-200">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {venue.website && (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <a
                          href={venue.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-rose-300 hover:text-rose-200 transition-colors"
                        >
                          <Check size={14} />
                          Visit website
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {selectedVenueId !== null && (
        <VenueDetailModal
          key={selectedVenueId}
          venueId={selectedVenueId}
          onClose={() => setSelectedVenueId(null)}
          onNavigateToVendor={setSelectedVenueId}
        />
      )}
    </div>
  );
}
