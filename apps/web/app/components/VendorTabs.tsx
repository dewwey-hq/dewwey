"use client";

import { useState, type ReactNode } from "react";

/**
 * Vendor profile tabs. Both panels stay mounted so IG embeds don't reload
 * when flipping back to the feed.
 */
export function VendorTabs({
  feed,
  worksWith,
  details,
  feedCount,
  worksWithCount,
}: {
  feed: ReactNode;
  worksWith: ReactNode;
  details?: ReactNode;
  feedCount: number;
  worksWithCount: number;
}) {
  const [tab, setTab] = useState<"feed" | "works" | "details">("feed");

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-medium transition-colors ${
      active
        ? "border-rose-400 text-gray-900"
        : "border-transparent text-gray-500 hover:text-gray-800"
    }`;

  return (
    <div className="mt-10">
      <div className="flex gap-7 border-b border-black/[0.07]">
        <button className={tabClass(tab === "feed")} onClick={() => setTab("feed")}>
          Feed
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {feedCount}
          </span>
        </button>
        <button className={tabClass(tab === "works")} onClick={() => setTab("works")}>
          Works with
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {worksWithCount}
          </span>
        </button>
        {details && (
          <button className={tabClass(tab === "details")} onClick={() => setTab("details")}>
            Details
          </button>
        )}
      </div>
      <div className={tab === "feed" ? "mt-6" : "hidden"}>{feed}</div>
      <div className={tab === "works" ? "mt-6" : "hidden"}>{worksWith}</div>
      {details && <div className={tab === "details" ? "mt-6" : "hidden"}>{details}</div>}
    </div>
  );
}
