"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, Heart } from "@phosphor-icons/react";
import { vendorsHref, type VendorsQuery } from "@/lib/slots";
import { pillClassName } from "@/lib/typography";
import { useTeam } from "./team/TeamProvider";

export function VendorFilterControls({
  current,
  min,
  teamActive,
}: {
  current: VendorsQuery;
  min: number;
  teamActive: boolean;
}) {
  const router = useRouter();
  const { dewweyAccountIds, hydrated } = useTeam();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const hasTeam = hydrated && dewweyAccountIds.length > 0;
  const activeCount = (min > 1 ? 1 : 0) + (teamActive ? 1 : 0);

  const apply = (nextMin: number, nextTeam: boolean) => {
    router.push(
      vendorsHref({ ...current, min: nextMin, team: nextTeam && hasTeam ? dewweyAccountIds : [] }),
    );
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors ${
          activeCount > 0
            ? "border-gray-900 bg-gray-900 text-white"
            : "border-black/[0.10] text-gray-700 hover:border-black/[0.25]"
        }`}
      >
        <SlidersHorizontal size={15} />
        Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-black/[0.08] bg-white p-4 shadow-lg">
          <p className="text-sm font-medium text-gray-900">Your team</p>
          <label
            className={`mt-2 flex items-start gap-2.5 text-sm ${
              hasTeam ? "cursor-pointer text-gray-700" : "cursor-not-allowed text-black/[0.35]"
            }`}
          >
            <input
              type="checkbox"
              disabled={!hasTeam}
              checked={teamActive}
              onChange={(e) => apply(min, e.target.checked)}
              className="mt-0.5 accent-gray-900"
            />
            <span>
              <span className="flex items-center gap-1">
                Works with your team
                <Heart size={12} weight="fill" className="text-rose-500" />
              </span>
              <span className="block text-xs text-black/[0.56]">
                {hasTeam
                  ? "Only vendors credited alongside someone you've hearted."
                  : "Heart a vendor first to unlock this."}
              </span>
            </span>
          </label>

          <p className="mt-4 text-sm font-medium text-gray-900">Documented work</p>
          <div className="mt-2 flex gap-2">
            {[
              { label: "Any", value: 1 },
              { label: "3+", value: 3 },
              { label: "10+", value: 10 },
            ].map(({ label, value }) => (
              <button
                key={label}
                type="button"
                onClick={() => apply(value, teamActive)}
                className={pillClassName(min === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
