"use client";

import type { Wedding, Vendor } from "./data";
import { VENDORS, vendorsOf, photosOf, venueOf, initial, hueFor } from "./data";

export function Coin({ vendor, size, active = false }: { vendor: Vendor; size: number; active?: boolean }) {
  return (
    <span
      title={vendor.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[9px] font-medium text-gray-800"
      style={{
        width: size,
        height: size,
        background: `hsl(${hueFor(vendor.id)} 32% ${active ? 72 : 84}%)`,
        boxShadow: active ? "0 0 0 2px #111" : undefined,
      }}
    >
      {initial(vendor.name)}
    </span>
  );
}

export function Photo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`object-cover ${className ?? ""}`} />
  );
}

export function PairBar({
  pair,
  onRemove,
  onClear,
  count,
  emptyHint,
}: {
  pair: string[];
  onRemove: (id: string) => void;
  onClear: () => void;
  count: number;
  emptyHint?: string;
}) {
  if (pair.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-black/[0.12] px-3 py-2 text-sm text-gray-400">
        {emptyHint ?? "No pairing yet."}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/[0.08] bg-[#fdf8f5] px-3 py-2">
      <span className="text-xs font-medium text-gray-500">Looking at</span>
      {pair.map((id, i) => {
        const v = VENDORS[id];
        return (
          <span key={id} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-xs text-gray-400">+</span>}
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-xs text-gray-900 ring-1 ring-inset ring-black/[0.08] hover:ring-rose-300"
            >
              <Coin vendor={v} size={16} />
              {v.name}
              <span className="text-gray-400">×</span>
            </button>
          </span>
        );
      })}
      <span className="text-xs text-gray-500">
        {count} {count === 1 ? "wedding" : "weddings"}
      </span>
      <button type="button" onClick={onClear} className="ml-auto text-xs text-gray-400 hover:text-gray-700">
        Clear
      </button>
    </div>
  );
}

export function LookTile({
  wedding,
  pair = [],
  onToggleVendor,
  onOpen,
  selected = false,
}: {
  wedding: Wedding;
  pair?: string[];
  onToggleVendor?: (id: string) => void;
  onOpen?: () => void;
  selected?: boolean;
}) {
  const photos = photosOf(wedding);
  const vs = vendorsOf(wedding);
  const venue = venueOf(wedding);
  const mosaic = photos.length >= 2;
  const three = photos.length >= 3;

  return (
    <article
      className={`overflow-hidden rounded-xl bg-white ring-1 ring-inset ${
        selected ? "ring-gray-900" : "ring-black/[0.08]"
      }`}
    >
      <div
        className={`relative ${
          three
            ? "grid aspect-[4/5] grid-cols-2 grid-rows-2 gap-px bg-white"
            : mosaic
              ? "grid aspect-[4/5] grid-cols-2 gap-px bg-white"
              : "aspect-[4/5]"
        } ${onOpen ? "cursor-pointer" : ""}`}
        onClick={onOpen}
        onKeyDown={
          onOpen
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
        {three ? (
          <>
            <Photo src={photos[0]} alt="" className="col-span-1 row-span-2 h-full w-full" />
            <Photo src={photos[1]} alt="" className="h-full w-full" />
            <Photo src={photos[2]} alt="" className="h-full w-full" />
          </>
        ) : mosaic ? (
          <>
            <Photo src={photos[0]} alt="" className="h-full w-full" />
            <Photo src={photos[1]} alt="" className="h-full w-full" />
          </>
        ) : (
          <Photo src={photos[0]} alt={wedding.couple} className="h-full w-full" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-10">
          <p className="truncate text-[13px] font-medium text-white">{venue.name}</p>
          <p className="truncate text-[11px] text-white/75">{wedding.date}</p>
        </div>
        {wedding.nPosts > 1 && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-gray-800">
            {wedding.nPosts} posted
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 px-2 py-2">
        {vs.slice(0, 5).map((v) =>
          onToggleVendor ? (
            <button
              key={v.id}
              type="button"
              title={`${pair.includes(v.id) ? "Unpin" : "Pin"} ${v.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVendor(v.id);
              }}
              className="rounded-full"
            >
              <Coin vendor={v} size={22} active={pair.includes(v.id)} />
            </button>
          ) : (
            <Coin key={v.id} vendor={v} size={22} />
          ),
        )}
        {vs.length > 5 && <span className="text-[10px] text-gray-400">+{vs.length - 5}</span>}
      </div>
    </article>
  );
}
