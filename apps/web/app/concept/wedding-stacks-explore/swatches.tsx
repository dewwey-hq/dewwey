"use client";

import { useState } from "react";
import { WEDDINGS, VENDORS, vendorsOf, photosOf, matchesPair } from "./data";
import { Coin, Photo, LookTile, PairBar } from "./ui";

export function TodaySwatch() {
  const w = WEDDINGS[0];
  const vs = vendorsOf(w);
  return (
    <div className="grid gap-0 lg:grid-cols-2">
      <div className="border-b border-black/[0.06] p-5 lg:border-b-0 lg:border-r">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
          Venue page · card deck
        </p>
        <MiniDeck />
        <p className="mt-4 text-xs leading-relaxed text-gray-500">
          Three other weddings peek as decoration. You cannot scan them. You cannot ask for
          a pair. Full-screen is an Instagram embed.
        </p>
      </div>
      <div className="bg-[#fafafa] p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
          /weddings · feed
        </p>
        <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white md:grid md:grid-cols-[minmax(0,180px)_1fr]">
          <Photo src={photosOf(w)[0]} alt={w.couple} className="aspect-[4/5] w-full md:aspect-auto md:min-h-[280px]" />
          <div className="p-3">
            <p className="text-sm font-medium text-gray-900">{w.date}</p>
            <ul className="mt-2 divide-y divide-black/[0.04]">
              {vs.slice(0, 6).map((v) => (
                <li key={v.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-16 shrink-0 text-[11px] text-gray-500">{v.role}</span>
                  <Coin vendor={v} size={20} />
                  <span className="truncate text-xs text-gray-900">{v.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-gray-400">+ Add on every row. No “more like this pair.”</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniDeck() {
  const shown = WEDDINGS.slice(0, 3);
  const vs = vendorsOf(shown[0]);
  return (
    <div className="relative mx-auto h-[300px] max-w-[420px]">
      {shown.map((w, i) => {
        const style =
          i === 0
            ? { zIndex: 30, top: 14, transform: "none", opacity: 1 }
            : i === 1
              ? { zIndex: 20, top: 0, transform: "rotate(-3.5deg) scale(0.96)", opacity: 0.55 }
              : { zIndex: 10, top: 32, transform: "rotate(4deg) scale(0.94)", opacity: 0.35 };
        return (
          <div
            key={w.id}
            className="absolute inset-x-0 overflow-hidden rounded-2xl border border-black/[0.06] bg-white"
            style={{ ...style, height: 268 }}
          >
            {i === 0 ? (
              <div className="flex h-full">
                <Photo src={photosOf(w)[0]} alt={w.couple} className="h-full w-[46%]" />
                <div className="flex flex-1 flex-col justify-center p-3">
                  <p className="text-[10px] text-gray-400">{w.date}</p>
                  <div className="mt-2 grid grid-cols-1 gap-1.5">
                    {vs.slice(0, 5).map((v) => (
                      <div key={v.id} className="flex items-center gap-1.5">
                        <Coin vendor={v} size={18} />
                        <span className="min-w-0">
                          <span className="block text-[9px] uppercase tracking-wide text-gray-400">{v.role}</span>
                          <span className="block truncate text-[11px] text-gray-900">{v.name}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Photo src={photosOf(w)[0]} alt="" className="h-full w-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MosaicSwatch() {
  return (
    <div className="bg-[#fdf8f5] p-4 sm:p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
        Scan · 13 Chicago Saturdays
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {WEDDINGS.map((w) => (
          <LookTile key={w.id} wedding={w} />
        ))}
      </div>
    </div>
  );
}

export function PairSwatch() {
  const [pair, setPair] = useState<string[]>(["mayah", "flowerchild"]);
  const results = WEDDINGS.filter((w) => matchesPair(w, pair));
  const toggle = (id: string) =>
    setPair((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));

  return (
    <div className="p-4 sm:p-5">
      <PairBar pair={pair} onRemove={(id) => toggle(id)} onClear={() => setPair([])} count={results.length} />
      <p className="mb-3 mt-3 text-xs text-gray-500">
        Seeded with Mayah Lee + Flowerchild. Click a coin on any tile to add or drop a vendor.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {results.map((w) => (
          <LookTile key={w.id} wedding={w} pair={pair} onToggleVendor={toggle} />
        ))}
      </div>
      {results.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">No weddings with that exact pairing yet.</p>
      )}
    </div>
  );
}

export function CollageSwatch() {
  const w = WEDDINGS[0];
  const vs = vendorsOf(w);
  return (
    <div className="grid gap-6 p-5 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="relative mx-auto aspect-[4/3] max-w-lg">
          {vs.slice(0, 8).map((v, i) => {
            const col = i % 4;
            const row = Math.floor(i / 4);
            return (
              <div
                key={v.id}
                className="absolute w-[38%] rounded-sm border-[6px] border-white bg-white"
                style={{
                  left: `${col * 21 + (row % 2 === 0 ? 0 : 6)}%`,
                  top: `${row * 46 + (col % 2) * 4}%`,
                  transform: `rotate(${[-6, 4, -3, 7, 2, -5, 6, -2][i]}deg)`,
                }}
              >
                <div className="flex aspect-square items-center justify-center bg-[#fdf8f5]">
                  <Coin vendor={v} size={48} />
                </div>
                <p className="truncate px-1 py-1 text-center text-[10px] text-gray-700">{v.name}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-16 text-sm text-gray-500 lg:mt-4">
          Eight polaroids of vendors. The Saturday is missing. This is what “show multiple
          vendors in one image” becomes if the image is faces instead of the day they made.
        </p>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Instead</p>
        <LookTile wedding={w} />
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          One photo of the day. Coins on the photo are the vendors. When three vendors posted,
          the tile itself mosaics their shots of the same Saturday. That is multiple vendors
          in one image without losing the wedding.
        </p>
      </div>
    </div>
  );
}

export function GraphSwatch() {
  const nodes = [
    { id: "marchetti", x: 50, y: 42, r: 28 },
    { id: "mayah", x: 22, y: 22, r: 18 },
    { id: "flowerchild", x: 78, y: 20, r: 18 },
    { id: "fox", x: 18, y: 68, r: 16 },
    { id: "leaf", x: 82, y: 66, r: 16 },
    { id: "greenhouse", x: 50, y: 78, r: 18 },
    { id: "clementine", x: 36, y: 14, r: 12 },
    { id: "fft", x: 64, y: 86, r: 12 },
  ];
  const edges: [string, string][] = [
    ["marchetti", "mayah"],
    ["marchetti", "flowerchild"],
    ["mayah", "flowerchild"],
    ["marchetti", "fox"],
    ["fox", "leaf"],
    ["mayah", "greenhouse"],
    ["flowerchild", "greenhouse"],
    ["marchetti", "clementine"],
    ["greenhouse", "fft"],
  ];
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return (
    <div className="p-5">
      <div className="relative mx-auto aspect-[16/9] max-w-2xl rounded-xl bg-[#fdf8f5]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          {edges.map(([a, b]) => (
            <line
              key={a + b}
              x1={pos[a].x}
              y1={pos[a].y}
              x2={pos[b].x}
              y2={pos[b].y}
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="0.4"
            />
          ))}
        </svg>
        {nodes.map((n) => {
          const v = VENDORS[n.id];
          return (
            <div
              key={n.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
            >
              <Coin vendor={v} size={n.r} />
              <span className="mt-1 max-w-[90px] truncate text-[10px] text-gray-600">{v.name}</span>
            </div>
          );
        })}
      </div>
      <p className="mx-auto mt-4 max-w-xl text-center text-sm text-gray-500">
        Accurate. Fun for us. A couple planning one wedding should never have to read this.
        The pair-chip bar is the same graph, asked as a question they already understand.
      </p>
    </div>
  );
}
