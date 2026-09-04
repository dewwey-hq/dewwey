"use client";

import { Component, useState, type ReactNode } from "react";

/**
 * Local tab switcher for the v5 concept, standing in for the shared VendorTabs component
 * (app/components/VendorTabs.tsx) rather than reusing it directly. Two differences, both
 * scoped to this route only:
 *
 * 1. Lazy-mounts the Details panel instead of always mounting all three panels and hiding the
 *    inactive ones behind a CSS `hidden` class. The real VendorTabs' "keep everything mounted"
 *    approach is fine for its own plain DetailRow grid, but this Details panel is much heavier
 *    (CardDeck, CostCalculator, a Google Maps iframe, several client components) — mounting all
 *    of that on first paint, before it's ever visible, is unnecessary and one more thing that
 *    could go wrong before the user even opens the tab.
 * 2. Wraps the Details panel in an error boundary so a render error in any one of those heavier
 *    subcomponents shows a fallback instead of taking down the tab switcher itself.
 */

class DetailsErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Details tab failed to render: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function V5Tabs({
  feed,
  worksWith,
  details,
  feedCount,
  worksWithCount,
}: {
  feed: ReactNode;
  worksWith: ReactNode;
  details: ReactNode;
  feedCount: number;
  worksWithCount: number;
}) {
  const [tab, setTab] = useState<"feed" | "works" | "details">("feed");

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-medium transition-colors ${
      active ? "border-rose-400 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
    }`;

  return (
    <div className="mt-10">
      <div className="flex gap-7 border-b border-black/[0.07]">
        <button type="button" className={tabClass(tab === "feed")} onClick={() => setTab("feed")}>
          Feed
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{feedCount}</span>
        </button>
        <button type="button" className={tabClass(tab === "works")} onClick={() => setTab("works")}>
          Works with
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{worksWithCount}</span>
        </button>
        <button type="button" className={tabClass(tab === "details")} onClick={() => setTab("details")}>
          Details
        </button>
      </div>
      {tab === "feed" && <div className="mt-6">{feed}</div>}
      {tab === "works" && <div className="mt-6">{worksWith}</div>}
      {tab === "details" && (
        <div className="mt-6">
          <DetailsErrorBoundary>{details}</DetailsErrorBoundary>
        </div>
      )}
    </div>
  );
}
