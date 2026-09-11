"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/app/components/Avatar";
import { groupStackByCategory } from "@/lib/feedDesign";
import { roleLabel } from "@/lib/roles";
import type { StackVendor } from "@/lib/server/graph";

/** Design principle 4: "the stack is a rail of faces, venue first." The venue (matched by
 * username against `venueUsername`) is pinned first with a "Hosted" mark; everyone else is
 * an avatar chip grouped by category, role shown on hover/tap; a "+N" chip expands the
 * rest inline. Every chip links to `/vendors/<username>` — discovery leaves the feed. */
export function StackRail({
  vendors,
  venueUsername,
  max = 8,
}: {
  vendors: StackVendor[];
  venueUsername: string | null;
  max?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const venueKey = venueUsername?.toLowerCase();
  const venue = venueKey ? vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others = venue ? vendors.filter((v) => v !== venue) : vendors;
  const groups = groupStackByCategory(others);
  const flatOthers = groups.flatMap((g) => g.vendors);
  const visibleOthers = expanded ? flatOthers : flatOthers.slice(0, max);
  const visibleSet = new Set(visibleOthers.map((v) => v.username));
  const overflow = flatOthers.length - visibleOthers.length;

  if (!venue && others.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {venue && (
        <Link
          href={`/vendors/${encodeURIComponent(venue.username)}`}
          className="flex items-center gap-2 rounded-full border border-black/[0.10] bg-white py-1 pl-1 pr-3 transition-colors hover:border-black/[0.25]"
        >
          <Avatar src={venue.avatar_url} name={venue.name} size={28} className="text-xs" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-900">{venue.name}</span>
            <span className="block text-[11px] font-medium text-rose-500">Hosted</span>
          </span>
        </Link>
      )}
      {groups.flatMap((g) =>
        g.vendors
          .filter((v) => visibleSet.has(v.username))
          .map((v) => (
            <Link
              key={v.username}
              href={`/vendors/${encodeURIComponent(v.username)}`}
              title={`${v.name} · ${roleLabel(v.role)}`}
              className="group relative"
            >
              <Avatar
                src={v.avatar_url}
                name={v.name}
                size={28}
                className="text-xs ring-1 ring-inset ring-black/[0.08] transition-shadow group-hover:ring-black/[0.25]"
              />
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {roleLabel(v.role)}
              </span>
            </Link>
          )),
      )}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex h-7 items-center rounded-full bg-black/[0.05] px-2.5 text-xs font-medium text-gray-600 hover:bg-black/[0.08]"
        >
          +{overflow}
        </button>
      )}
    </div>
  );
}
