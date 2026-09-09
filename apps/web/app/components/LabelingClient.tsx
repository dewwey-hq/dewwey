"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { embedUrl } from "./InstagramEmbed";
import { matchKeyToAction, type LabelAction } from "@/lib/labelKeyboard";
import type { QueueItem, HumanLabelDecision } from "@/lib/server/labeling";

// Cropped IG embed -- hides the iframe's own ~54px profile header the same
// way WeddingFeedCard does (/weddings), so the post fills the media column
// without wasted chrome. Deliberately a raw iframe, not the InstagramEmbed
// component: that component's own caption panel would duplicate the
// caption we render in the info column here.
function CroppedEmbed({ postUrl }: { postUrl: string }) {
  const src = embedUrl(postUrl, false);
  if (!src) return null;
  return (
    <iframe
      key={src}
      src={src}
      title="Instagram post"
      loading="lazy"
      scrolling="no"
      className="absolute inset-x-0 -top-[54px] h-[calc(100%+54px)] w-full bg-white"
    />
  );
}

const ACTION_TO_DECISION: Record<Exclude<LabelAction, "UNDO">, HumanLabelDecision> = {
  WEDDING: "WEDDING",
  NOT_WEDDING: "NOT_WEDDING",
  UNSURE: "UNSURE",
  SKIP: "SKIP",
  UNVIEWABLE: "UNVIEWABLE",
};

interface LastLabeled {
  item: QueueItem;
  decision: HumanLabelDecision;
  notes: string | null;
}

function formatPostedAt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Fires the label POST without ever blocking the UI from advancing. Retries
// a handful of times on failure (network hiccup, cold connection) so a
// label isn't silently lost -- errors are surfaced via onFailure so the
// caller can show a small "unsaved" indicator rather than pretending
// everything succeeded.
async function submitLabel(
  payload: {
    post_url: string;
    decision: HumanLabelDecision;
    client_ms: number | null;
    notes: string | null;
  },
  onSettled: (ok: boolean) => void
) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSettled(true);
        return;
      }
    } catch {
      // fall through to retry
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  onSettled(false);
}

export function LabelingClient({
  initialItems,
  initialProgress,
}: {
  initialItems: QueueItem[];
  initialProgress: { total: number; labeled: number };
}) {
  const [items, setItems] = useState<QueueItem[]>(initialItems);
  const [progress, setProgress] = useState(initialProgress);
  const [lastLabeled, setLastLabeled] = useState<LastLabeled | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [noteDraft, setNoteDraft] = useState("");
  // Set for real in the effect below (Date.now() is an impure call, not
  // allowed directly in a render body per the react-hooks/purity rule) --
  // 0 is just a static placeholder until the first effect run.
  const mountedAtRef = useRef<number>(0);
  const fetchingRef = useRef(false);

  const current = items[0] ?? null;
  const lookahead = items[1] ?? null;

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, [current?.post_url]);

  const topUp = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/labels?limit=5");
      if (res.ok) {
        const data = (await res.json()) as { items: QueueItem[] };
        setItems((prev) => {
          const existing = new Set(prev.map((p) => p.post_url));
          const fresh = data.items.filter((i) => !existing.has(i.post_url));
          return [...prev, ...fresh];
        });
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (items.length < 3) void topUp();
  }, [items.length, topUp]);

  const act = useCallback(
    (action: LabelAction) => {
      if (action === "UNDO") {
        if (!lastLabeled) return;
        setItems((prev) => [lastLabeled.item, ...prev]);
        setNoteDraft(lastLabeled.notes ?? ""); // restore whatever was typed, easy to fix and resubmit
        setLastLabeled(null);
        setProgress((p) => ({ ...p, labeled: Math.max(0, p.labeled - 1) }));
        return;
      }
      if (!current) return;
      const decision = ACTION_TO_DECISION[action];
      const clientMs = Date.now() - mountedAtRef.current;
      const submitted = current;
      const notes = noteDraft.trim() || null;

      setItems((prev) => prev.slice(1));
      setLastLabeled({ item: submitted, decision, notes });
      setProgress((p) => ({ ...p, labeled: p.labeled + 1 }));
      setPendingCount((n) => n + 1);
      setNoteDraft("");

      void submitLabel(
        { post_url: submitted.post_url, decision, client_ms: clientMs, notes },
        (ok) => {
          setPendingCount((n) => Math.max(0, n - 1));
          if (!ok) setFailedCount((n) => n + 1);
        }
      );
    },
    [current, lastLabeled, noteDraft]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack typing if focus is ever inside an input/textarea (not
      // expected in this UI today, but a cheap safety net).
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const action = matchKeyToAction(e);
      if (!action) return;
      if (action === "SKIP") e.preventDefault(); // stop Space from scrolling the page
      act(action);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [act]);

  if (!current) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-medium text-gray-900">Queue complete</h1>
        <p className="text-sm text-gray-600">
          {progress.labeled} / {progress.total} labeled. No more unlabeled posts in this queue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
        <span>
          {progress.labeled} / {progress.total} labeled
        </span>
        <span className="flex items-center gap-2">
          {pendingCount > 0 && <span title="Saving...">saving {pendingCount}</span>}
          {failedCount > 0 && (
            <span className="text-red-600" title="Some labels failed to save">
              {failedCount} failed to save
            </span>
          )}
          {/* D055: the venue-anchored post review surface (post-per-screen, same flow as this
              page, but with venue context attached) -- a separate queue/decision log from this
              one, linked not merged. */}
          <Link href="/label/candidates" className="text-gray-500 underline hover:text-gray-900">
            Venue review →
          </Link>
        </span>
      </div>

      {/* Post left, info+controls right -- same split /weddings uses
          (WeddingFeedCard), so everything (caption, note box, buttons) is
          visible without scrolling the page. Fixed height on md+; stacks
          on mobile where there isn't room for two columns.
          Flex, not grid: a CSS grid container's implicit row sizes to its
          content's max-content height regardless of the container's own
          fixed height, so a long caption (e.g. a full vendor-credit list)
          pushed the buttons off-screen -- confirmed live. Flexbox's default
          align-items:stretch actually clamps both columns to the
          container's height, letting the inner overflow-y-auto region
          scroll instead of the whole card growing. */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white md:flex md:h-[600px]">
        <div className="relative h-[380px] flex-shrink-0 overflow-hidden border-b border-black/[0.05] bg-black/[0.02] md:h-full md:w-[380px] md:border-b-0 md:border-r">
          <CroppedEmbed key={current.post_url} postUrl={current.post_url} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col md:h-full">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-black/[0.05] px-4 py-3 text-xs text-gray-500">
            <span className="font-medium text-gray-900">@{current.owner_username ?? "unknown"}</span>
            {formatPostedAt(current.posted_at) && <span>{formatPostedAt(current.posted_at)}</span>}
            {current.location_tag && <span>📍 {current.location_tag}</span>}
            <a
              href={current.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-400 hover:text-gray-900"
            >
              Open on IG
            </a>
          </div>

          {/* Only this region scrolls -- long captions never push the
              buttons below the fold. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {current.caption && (
              <p className="whitespace-pre-line text-sm text-gray-800">{current.caption}</p>
            )}
            {current.hashtags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {current.hashtags.slice(0, 6).map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-black/[0.04] px-2 py-0.5 text-xs text-gray-600"
                  >
                    #{h.replace(/^#/, "")}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-black/[0.05] px-4 py-3">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Optional note -- attaches to whichever label you pick"
              rows={2}
              className="w-full resize-none rounded-xl border border-black/[0.08] px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-black/20 focus:outline-none"
            />
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <LabelButton label="Wedding" hint="W" onClick={() => act("WEDDING")} tone="positive" />
              <LabelButton
                label="Not wedding"
                hint="N"
                onClick={() => act("NOT_WEDDING")}
                tone="negative"
              />
              <LabelButton label="Unsure" hint="U" onClick={() => act("UNSURE")} tone="neutral" />
              <LabelButton label="Skip" hint="Space" onClick={() => act("SKIP")} tone="neutral" />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => act("UNVIEWABLE")}
                className="text-gray-500 underline hover:text-gray-900"
              >
                Broken / can’t view (B)
              </button>
              <button
                type="button"
                onClick={() => act("UNDO")}
                disabled={!lastLabeled}
                className="text-gray-500 underline hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Undo last (Z)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Off-screen prefetch: mounting the next item's iframe now means its
          request is already in flight by the time it's shown. */}
      {lookahead && (
        <div className="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
          <div className="relative h-[380px] w-[380px]">
            <CroppedEmbed key={lookahead.post_url} postUrl={lookahead.post_url} />
          </div>
        </div>
      )}
    </div>
  );
}

function LabelButton({
  label,
  hint,
  onClick,
  tone,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
      : tone === "negative"
        ? "bg-rose-600 hover:bg-rose-700 text-white"
        : "bg-black/[0.06] hover:bg-black/[0.1] text-gray-900";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${toneClass}`}
    >
      {label}
      <span className="text-[10px] font-normal opacity-70">{hint}</span>
    </button>
  );
}
