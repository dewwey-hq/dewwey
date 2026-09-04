"use client";

/**
 * Shared "flip through a stack of cards" stage — the fan-layered deck picked during the
 * Wedding Vendor Stacks swatch round, extracted so the real-weddings section at the top of
 * the page can reuse the same stage/peek/nav mechanics instead of duplicating them.
 *
 * No decorative "ghost card" fallback here (VendorStackDeck had one while it only had one
 * real stack) — both current callers already have enough real items to fill all three
 * layers, so a content-less placeholder card would be dead code from day one.
 */

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CardDeck<T>({
  items,
  keyFor,
  renderCard,
  cardHeight,
  peekAbove = 14,
  peekBelow = 18,
  maxWidth = 740,
  front: controlledFront,
  onFrontChange,
}: {
  items: T[];
  keyFor: (item: T) => string;
  renderCard: (item: T, index: number) => ReactNode;
  cardHeight: number;
  peekAbove?: number;
  peekBelow?: number;
  maxWidth?: number;
  /** Controlled front-card index — pass together with onFrontChange when a caller (e.g. a
   *  "view fullscreen" control rendered outside this deck) needs to know which card is
   *  currently front. Omit both for a deck that only manages its own state. */
  front?: number;
  onFrontChange?: (index: number) => void;
}) {
  const [internalFront, setInternalFront] = useState(0);
  const front = controlledFront ?? internalFront;
  const setFront = (updater: number | ((f: number) => number)) => {
    const next = typeof updater === "function" ? (updater as (f: number) => number)(front) : updater;
    if (onFrontChange) onFrontChange(next);
    else setInternalFront(next);
  };
  const n = items.length;
  const stageHeight = cardHeight + peekAbove + peekBelow;

  if (n === 0) return null;

  const next = () => setFront((f) => (f + 1) % n);
  const prev = () => setFront((f) => (f - 1 + n) % n);

  return (
    <div className="pb-2">
      <div className="relative mx-auto" style={{ height: stageHeight, maxWidth }}>
        {items.map((item, i) => {
          const pos = (i - front + n) % n; // 0 = front, 1 = peeks above, 2 = peeks below
          if (pos > 2) return null;
          const style =
            pos === 0
              ? { zIndex: 30, top: peekAbove, transform: "none", opacity: 1 }
              : pos === 1
                ? { zIndex: 20, top: 0, transform: "rotate(-3.5deg) scale(0.96)", opacity: 0.6 }
                : { zIndex: 10, top: peekAbove + peekBelow, transform: "rotate(4deg) scale(0.94)", opacity: 0.4 };
          return (
            <div
              key={keyFor(item)}
              className="absolute left-0 right-0 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-lg transition-all duration-300 ease-out"
              style={{ ...style, height: cardHeight }}
            >
              {renderCard(item, i)}
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="mt-5 flex items-center justify-center gap-4">
          <button type="button" onClick={prev} className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.1] text-gray-500 hover:bg-gray-50" aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <div className="flex gap-1.5">
            {items.map((item, i) => (
              <button
                key={keyFor(item)}
                type="button"
                onClick={() => setFront(i)}
                aria-label={`Go to card ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === front ? "w-5 bg-rose-400" : "w-1.5 bg-gray-200"}`}
              />
            ))}
          </div>
          <button type="button" onClick={next} className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.1] text-gray-500 hover:bg-gray-50" aria-label="Next">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
