"use client";

import Link from "next/link";
import { ArrowUpDown, Map as MapIcon, Search, SlidersHorizontal } from "lucide-react";
import { SITE_HEADER_HEIGHT_CLASS, SITE_PADDING_X_CLASS } from "@/app/lib/site-layout";
import { SITE_NAV_ITEMS_MAP } from "@/app/lib/site-nav";
import { SiteNavLinks } from "./SiteNavLinks";
import { SiteBrand } from "./SiteBrand";
import MapFilterDropdown from "./MapFilterDropdown";
import MapDateFilterPill from "./MapDateFilterPill";

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Highest rated" },
];

export default function MapBrowseToolbar({
  query,
  onQueryChange,
  sortBy,
  onSortChange,
  style,
  onStyleChange,
  budget,
  onBudgetChange,
  weddingDate,
  onWeddingDateChange,
  guestFilter,
  onGuestFilterChange,
  styleOptions,
  budgets,
  guestOptions,
  compareCount,
  showNavIcons = true,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  style: string;
  onStyleChange: (value: string) => void;
  budget: string;
  onBudgetChange: (value: string) => void;
  weddingDate: string;
  onWeddingDateChange: (value: string) => void;
  guestFilter: string;
  onGuestFilterChange: (value: string) => void;
  styleOptions: string[];
  budgets: string[];
  guestOptions: string[];
  compareCount: number;
  showNavIcons?: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-black/[0.08] bg-white">
      <div className={`flex ${SITE_HEADER_HEIGHT_CLASS} items-stretch justify-between gap-4 ${SITE_PADDING_X_CLASS}`}>
        <SiteBrand href="/" hideNameOnMobile className="self-center" />

        <SiteNavLinks
          activeLabel="Venues"
          items={SITE_NAV_ITEMS_MAP}
          showIcons={showNavIcons}
          className="hidden min-w-0 flex-1 justify-center self-stretch md:flex"
        />

        <div className="flex shrink-0 items-center gap-2 self-center">
          <div className="inline-flex rounded-full border border-black/[0.08] bg-white p-1">
            <Link
              href="/venues"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <SlidersHorizontal size={14} />
              List
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">
              <MapIcon size={14} />
              Map
            </span>
          </div>
          <a
            href="#compare"
            className="hidden rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 sm:inline-block"
          >
            Compare {compareCount > 0 ? compareCount : ""}
          </a>
        </div>
      </div>

      <div className={`border-t border-black/[0.06] py-3 ${SITE_PADDING_X_CLASS}`}>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-black/[0.06] bg-gray-50 px-3.5 py-1.5 text-xs font-medium text-gray-400"
            >
              <SlidersHorizontal size={14} />
              Filters
            </button>

            <div className="relative inline-flex shrink-0">
              <span className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-black/[0.1] bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700">
                <ArrowUpDown size={14} className="text-gray-500" />
                {SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? "Sort"}
              </span>
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value)}
                aria-label="Sort venues"
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex items-center gap-2 rounded-full border border-black/[0.1] bg-white px-3.5 py-1.5 shadow-sm">
              <Search size={14} className="shrink-0 text-gray-400" />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search name, address, or venue type"
                className="w-40 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400 sm:w-48"
              />
            </label>
          </div>

          <span aria-hidden className="mx-0.5 shrink-0 text-sm text-gray-300">
            |
          </span>

          <div className="flex shrink-0 items-center gap-2">
            <MapFilterDropdown
              label="Budget"
              value={budget}
              options={budgets}
              onChange={onBudgetChange}
              defaultValue="Any"
            />
            <MapFilterDropdown
              label="Venue type"
              value={style}
              options={styleOptions}
              onChange={onStyleChange}
            />
            <MapDateFilterPill value={weddingDate} onChange={onWeddingDateChange} />
            <MapFilterDropdown
              label="Guests"
              value={guestFilter}
              options={guestOptions}
              onChange={onGuestFilterChange}
              defaultValue="Any"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
