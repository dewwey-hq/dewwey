"use client";

/**
 * The collapsed form of `ResourceButton` (fix round, 2026-09-13 review): when a space card or
 * section heading would otherwise need more resource buttons than fit inline (a space with 7+
 * floor plans overflowed the card header and caused horizontal scroll at phone width), render
 * ONE locked-size button — "Floor plans (N)" / "Resources (N)" — that opens a small popover
 * listing each resource as its own new-tab link. Same locked button size as `ResourceButton`;
 * see that file's own lightbox punch-list note (this also opens links in a new tab for now).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface ResourceMenuItem {
  id: string;
  label: string;
  url: string;
}

/** `icon` is a pre-rendered node (e.g. `<LayoutGrid size={13} />`), not a component reference —
 * this is a client component, and a raw `LucideIcon` function can't cross the server/client
 * boundary from `VenueDetailsView` (a server component); only serializable elements can.
 *
 * `variant` mirrors `ResourceButton`'s (2026-09-18 review): a grey pill for a secondary action. */
export function ResourceMenuButton({ label, icon, items, variant = "primary" }: { label: string; icon: ReactNode; items: ResourceMenuItem[]; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const buttonClassName =
    variant === "primary"
      ? "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
      : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-200 hover:text-rose-500";

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClassName}>
        {icon}
        {label}
        <ChevronDown size={12} className={`transition-transform ${variant === "primary" ? "text-rose-300" : "text-gray-400"} ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-56 max-w-[80vw] rounded-lg border border-black/[0.08] bg-white p-1.5 text-left shadow-lg">
          {items.map((it) => (
            <a
              key={it.id}
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate rounded-md px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:text-rose-500"
            >
              {it.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
