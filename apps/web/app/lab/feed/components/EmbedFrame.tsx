"use client";

import { useEffect, useRef, useState } from "react";
import InstagramEmbed from "@/app/components/InstagramEmbed";
import { useMeasurement } from "../measurement-context";
import { FallbackCard } from "./FallbackCard";
import type { StackPostInfo } from "@/lib/server/graph";

/** IG embed compact-mode header bar height — see `EMBED_COMPACT_CHROME_PX` in
 * `InstagramEmbed.tsx` (not exported; a fixed IG chrome measurement, kept in sync by
 * hand). Cropping it via a negative top offset is the same trick `WeddingFeedCard` uses
 * for its non-compact embed. */
const COMPACT_CHROME_PX = 54;

/**
 * The unit of every variant: one wedding's cover post, framed as a uniform square with
 * Instagram's profile header cropped off. Lazy-mounts its iframe via IntersectionObserver
 * (200px root margin) so a 24-wedding page never has more than a handful of live embeds
 * at once. Falls back to `FallbackCard` for a blocked owner, a load timeout, or when the
 * caller has no cover post to give it (`post === null` — `coverPost()` found nothing
 * embeddable).
 */
export function EmbedFrame({
  post,
  width,
  className,
}: {
  post: StackPostInfo | null;
  width: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const { reportMount, reportLoad } = useMeasurement();

  useEffect(() => {
    const el = containerRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          reportMount();
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reportMount is stable per render tree
  }, [visible]);

  const blocked = !post || !post.ok;
  const showFallback = blocked || timedOut;

  if (showFallback) {
    return (
      <div ref={containerRef} className={className} style={{ width }}>
        <FallbackCard
          width={width}
          ownerName={post?.ownerName ?? null}
          ownerUsername={post?.ownerUsername ?? null}
          ownerAvatarUrl={post?.ownerAvatarUrl ?? null}
          title={null}
          caption={post?.caption ?? null}
          postUrl={post?.url ?? null}
          reason={timedOut ? "timeout" : blocked && post ? "blocked" : "none"}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative aspect-square w-full overflow-hidden rounded-xl bg-black/[0.02] ${className ?? ""}`}
      style={{ width }}
    >
      {post.postType === "Video" && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          Reel
        </span>
      )}
      {post.postType === "Sidecar" && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          Carousel
        </span>
      )}
      {visible ? (
        <div className="absolute inset-x-0" style={{ top: -COMPACT_CHROME_PX }}>
          <InstagramEmbed
            postUrl={post.url}
            maxWidth={width}
            mediaWidth={post.mediaWidth}
            mediaHeight={post.mediaHeight}
            compact
            onLoad={reportLoad}
            onTimeout={() => setTimedOut(true)}
          />
        </div>
      ) : null}
    </div>
  );
}
