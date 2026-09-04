"use client";

import { useMemo, useState } from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { displayHeadingClassName, pillClassName } from "@/lib/typography";
import {
  WEDDINGS,
  VENDORS,
  type Wedding,
  vendorsOf,
  photosOf,
  suggestedPair,
  countWith,
  matchesPair,
} from "./data";
import { Coin, Photo, LookTile, PairBar } from "./ui";

export function Recommended() {
  const [context, setContext] = useState<"explore" | "venue">("explore");
  const [pair, setPair] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>("carrie-mike");
  const [saved, setSaved] = useState<string[]>([]);

  const venuePinned = context === "venue";
  const base = useMemo(
    () => (venuePinned ? WEDDINGS.filter((w) => w.venueId === "marchetti") : WEDDINGS),
    [venuePinned],
  );
  const results = base.filter((w) => matchesPair(w, pair));
  const open = WEDDINGS.find((w) => w.id === openId) ?? null;

  const toggle = (id: string) =>
    setPair((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));

  const save = (ids: string[]) => setSaved((s) => Array.from(new Set([...s, ...ids])));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setContext("explore");
            setPair([]);
          }}
          className={pillClassName(context === "explore")}
        >
          Explore Chicago
        </button>
        <button
          type="button"
          onClick={() => {
            setContext("venue");
            setPair((p) => p.filter((id) => id !== "marchetti"));
          }}
          className={pillClassName(context === "venue")}
        >
          At Galleria Marchetti
        </button>
        <span className="ml-auto text-xs text-gray-400">
          {results.length} wedding{results.length === 1 ? "" : "s"}
          {venuePinned ? " here" : ""}
        </span>
      </div>

      <div className="px-4 pt-3">
        <PairBar
          pair={pair}
          onRemove={toggle}
          onClear={() => setPair([])}
          count={results.length}
          emptyHint={
            venuePinned
              ? "Tap credits to ask for a pair at this venue."
              : "Tap credits to ask for a pair across Chicago."
          }
        />
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,38%)]">
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((w) => (
              <LookTile
                key={w.id}
                wedding={w}
                pair={pair}
                onToggleVendor={toggle}
                onOpen={() => setOpenId(w.id)}
                selected={w.id === openId}
              />
            ))}
          </div>
          {results.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-500">
              Nothing with that exact pairing. Drop a vendor, or keep the pair and look citywide.
            </p>
          )}
        </div>

        {open && (
          <Detail
            key={open.id}
            wedding={open}
            pair={pair}
            venuePinned={venuePinned}
            saved={saved}
            onToggle={toggle}
            onUsePair={(ids) => setPair(ids)}
            onSave={save}
            onClose={() => setOpenId(null)}
          />
        )}
      </div>

      {saved.length > 0 && <TeamPayoff saved={saved} />}
    </div>
  );
}

function Detail({
  wedding,
  pair,
  venuePinned,
  saved,
  onToggle,
  onUsePair,
  onSave,
  onClose,
}: {
  wedding: Wedding;
  pair: string[];
  venuePinned: boolean;
  saved: string[];
  onToggle: (id: string) => void;
  onUsePair: (ids: string[]) => void;
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const vs = vendorsOf(wedding);
  const photos = photosOf(wedding);
  const [idx, setIdx] = useState(0);
  const seed = suggestedPair(wedding, venuePinned);
  const more = countWith(seed, wedding.id);
  const seedVendors = seed.map((id) => VENDORS[id]);

  return (
    <aside className="border-t border-black/[0.06] bg-[#fafafa] lg:border-l lg:border-t-0">
      <div className="relative">
        <Photo
          src={photos[idx] ?? photos[0]}
          alt={wedding.couple}
          className="aspect-[4/5] w-full sm:aspect-[5/4] lg:aspect-[4/5]"
        />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700"
            >
              <CaretLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setIdx((i) => (i + 1) % photos.length)}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700"
            >
              <CaretRight size={14} />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {photos.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
              ))}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-600"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4">
        <p className="text-xs text-gray-400">
          {wedding.date}
          {wedding.nPosts > 1 ? ` · ${wedding.nPosts} vendors posted this day` : ""}
        </p>
        <h3 className={`mt-0.5 text-lg text-gray-900 ${displayHeadingClassName}`}>{wedding.couple}</h3>
        <p className="text-sm text-gray-600">{wedding.tone}</p>

        <button
          type="button"
          onClick={() => onUsePair(seed)}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl bg-gray-900 px-3.5 py-3 text-left text-sm text-white"
        >
          <span>
            <span className="block font-medium">
              {more > 0 ? `See ${more} more with this pairing` : "Use this pairing as a search"}
            </span>
            <span className="block text-xs text-white/70">{seedVendors.map((v) => v.name).join(" + ")}</span>
          </span>
          <CaretRight size={16} className="shrink-0" />
        </button>

        <ul className="mt-4 divide-y divide-black/[0.05]">
          {vs.map((v) => {
            const inPair = pair.includes(v.id);
            const inTeam = saved.includes(v.id);
            return (
              <li key={v.id} className="flex items-center gap-2 py-2">
                <Coin vendor={v} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-900">{v.name}</span>
                  <span className="block text-[11px] text-gray-400">{v.role}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggle(v.id)}
                  className={`rounded-full px-2 py-1 text-[11px] ring-1 ring-inset ${
                    inPair
                      ? "bg-gray-900 text-white ring-gray-900"
                      : "text-gray-600 ring-black/[0.12] hover:ring-black/[0.28]"
                  }`}
                >
                  {inPair ? "Pinned" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => onSave([v.id])}
                  className="rounded-full px-2 py-1 text-[11px] text-gray-600 ring-1 ring-inset ring-black/[0.12] hover:ring-black/[0.28]"
                >
                  {inTeam ? "Saved" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => onSave(wedding.vendorIds)}
          className="mt-3 w-full rounded-full border border-black/[0.1] py-2 text-sm text-gray-800 hover:border-black/[0.25]"
        >
          Save this whole team
        </button>
      </div>
    </aside>
  );
}

function TeamPayoff({ saved }: { saved: string[] }) {
  const vs = saved.map((id) => VENDORS[id]).filter(Boolean);
  const venue = vs.find((v) => v.role === "Venue");
  const catering = vs.find((v) => v.role === "Catering");
  const linked = Boolean(venue && catering);

  return (
    <div className="border-t border-black/[0.06] px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Your team, from this explore</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {vs.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#fdf8f5] px-2.5 py-1 text-xs text-gray-800"
          >
            <Coin vendor={v} size={16} />
            {v.name}
          </span>
        ))}
      </div>
      {linked ? (
        <p className="mt-3 text-sm text-gray-700">
          {venue!.name} and {catering!.name} are saved together. A cost estimate can use both
          (rental {venue!.est}, food {catering!.est}) instead of treating them as two strangers.
        </p>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          Save a venue and a caterer from the same Saturday and the estimate can treat them as
          one pairing, not two independent line items.
        </p>
      )}
    </div>
  );
}
