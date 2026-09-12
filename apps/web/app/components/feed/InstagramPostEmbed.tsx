"use client";

import { useEffect, useRef, useState } from "react";
import { useMeasurement } from "./measurement-context";
import { processInstagramEmbeds } from "./embed-script";
import { FallbackCard } from "./FallbackCard";
import type { StackPostInfo } from "@/lib/server/graph";

const TIMEOUT_MS = 8000;
/** Meta's oEmbed docs: `maxwidth` must be between 326 and 540. */
const MIN_WIDTH = 326;
const MAX_WIDTH = 540;

/**
 * D058 compliance pass (2026-09-11, against developers.facebook.com/docs/instagram-
 * platform/oembed): the OFFICIAL embed method — a `<blockquote class="instagram-media">`
 * that Instagram's own `embed.js` turns into an iframe, sized to the real media height,
 * with the header (username) and footer ("View on Instagram") intact. No cropping, no
 * forced square, no overlay on top of it — that's what made the old, now-removed `EmbedFrame` non-
 * compliant (it hid the attribution embed.js delivers). `hidecaption` (no caption
 * attribute at all — see the oEmbed `hidecaption` option) keeps every tile uniform; the
 * lab supplies its own title/date/stack around the frame instead.
 *
 * Still lazy-mounts via IntersectionObserver (200px root margin) and still falls back to
 * `FallbackCard` after an 8s load timeout or when the owner disallows embeds — Instagram's
 * script gives no load event, so "loaded" is detected by watching the blockquote's
 * subtree for the iframe it injects.
 */
export function InstagramPostEmbed({
  post,
  className,
  eager = false,
  captioned = false,
  renderFallback,
}: {
  post: StackPostInfo | null;
  className?: string;
  /** Skip the IntersectionObserver and mount right away — for a card that's already in
   * the initial viewport (the first item or two in a variant, or a post the user just
   * expanded by clicking "+N posts"), so the compliant markup lands in the very first
   * server-rendered HTML instead of waiting on client-only lazy mount. Everything else
   * stays lazy so a 24+ wedding page never has more than a handful of live embeds. */
  eager?: boolean;
  /** Sets `data-instgrm-captioned` so Instagram renders the caption inside its own
   * frame — off by default (uniform, uncaptioned tiles). A caller that wants to toggle
   * this after the blockquote has already been processed must change this component's
   * `key` too (e.g. include `captioned` in it) — embed.js doesn't reprocess a blockquote
   * it's already turned into an iframe, so the only reliable way to switch is a remount. */
  captioned?: boolean;
  /** Optional override for the blocked/timeout presentation — used by variant D
   * ("Recipe") for its own fallback copy without touching `FallbackCard`'s default
   * (still used by A/B/C). Reuses all the same detection here (lazy mount, MutationObserver
   * load detection, 8s timeout, blocked-owner check) — only the rendered content changes. */
  renderFallback?: (args: {
    reason: "blocked" | "timeout" | "none";
    post: StackPostInfo | null;
  }) => React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const { reportMount, reportLoad } = useMeasurement();

  const blocked = !post || !post.ok;

  // Lazy mount (skipped entirely for an eager card).
  useEffect(() => {
    if (blocked || eager) return;
    const el = rootRef.current;
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
  }, [visible, blocked]);

  // An eager card skips the observer above (it never fires an intersection event, since
  // the card starts already mounted), so report its "mount" here instead — otherwise the
  // measurement strip's iframe count would silently miss it.
  useEffect(() => {
    if (eager && !blocked) reportMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, by design
  }, []);

  // Once the blockquote is in the DOM: load embed.js (shared, once) and ask it to process
  // this blockquote; watch for the iframe it injects (or `data-instgrm-processed`) to know
  // the embed actually rendered, and give up after TIMEOUT_MS.
  useEffect(() => {
    if (!visible || blocked || loaded) return;
    const container = mountRef.current;
    if (!container) return;
    let cancelled = false;

    const checkLoaded = (): boolean => {
      const iframe = container.querySelector("iframe");
      const processed = container.querySelector('blockquote[data-instgrm-processed]');
      if (iframe || processed) {
        setLoaded(true);
        reportLoad();
        return true;
      }
      return false;
    };

    const observer = new MutationObserver(() => {
      checkLoaded();
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-instgrm-processed"],
    });

    processInstagramEmbeds(container).then(() => {
      if (!cancelled) checkLoaded();
    });

    const timer = setTimeout(() => {
      if (!checkLoaded()) setTimedOut(true);
    }, TIMEOUT_MS);

    return () => {
      cancelled = true;
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [visible, blocked, loaded, reportLoad]);

  const showFallback = blocked || timedOut;
  const fallbackReason: "blocked" | "timeout" | "none" =
    timedOut ? "timeout" : blocked && post ? "blocked" : "none";

  if (showFallback) {
    return (
      <div ref={rootRef} className={className}>
        {renderFallback ? (
          renderFallback({ reason: fallbackReason, post })
        ) : (
          <FallbackCard
            maxWidth={MAX_WIDTH}
            ownerName={post?.ownerName ?? null}
            ownerUsername={post?.ownerUsername ?? null}
            ownerAvatarUrl={post?.ownerAvatarUrl ?? null}
            title={null}
            caption={post?.caption ?? null}
            postUrl={post?.url ?? null}
            reason={fallbackReason}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ width: "100%", maxWidth: MAX_WIDTH, minWidth: MIN_WIDTH, margin: "0 auto" }}
    >
      {/* Until embed.js swaps the blockquote for its iframe, the blockquote is a 56px link.
          Without a held height every mounting card collapsed by ~400px, pulling the next card
          into the lazy observer's range -- a cascade that mounted 12 of 20 cards on load
          (found 2026-09-11 while promoting the card). Keep the placeholder's 4:5 footprint
          until the iframe is in; `aspect-ratio` yields once real content is taller. */}
      {visible ? (
        <div ref={mountRef} className={loaded ? undefined : "aspect-[4/5] animate-pulse rounded-xl bg-black/[0.04]"}>
          {/* `data-instgrm-captioned` only when the caller asks -- default uncaptioned
              (uniform tiles); our own strip supplies title/date/stack instead. Never the
              scraped caption text itself -- only Instagram's own rendering of it. */}
          <blockquote
            className="instagram-media"
            data-instgrm-permalink={post.url}
            data-instgrm-version="14"
            {...(captioned ? { "data-instgrm-captioned": true } : {})}
            style={{
              background: "#FFF",
              border: 0,
              margin: "0 auto",
              maxWidth: MAX_WIDTH,
              minWidth: MIN_WIDTH,
              width: "100%",
            }}
          >
            {/* Meta's documented markup: a plain link inside the blockquote as the
                pre-JS/no-JS fallback — embed.js replaces this with the real iframe. */}
            <div style={{ padding: 16 }}>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                View this post on Instagram
              </a>
            </div>
          </blockquote>
        </div>
      ) : (
        <div
          className="aspect-[4/5] w-full animate-pulse rounded-xl bg-black/[0.04]"
          aria-hidden
        />
      )}
    </div>
  );
}
