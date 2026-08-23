"use client";

import { List, MapTrifold as MapIcon } from "@phosphor-icons/react";

export type MapBrowseMobilePanel = "list" | "map";

export default function MapBrowsePanelToggle({
  panel,
  onPanelChange,
}: {
  panel: MapBrowseMobilePanel;
  onPanelChange: (panel: MapBrowseMobilePanel) => void;
}) {
  const showingMap = panel === "map";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4 lg:hidden">
      <button
        type="button"
        onClick={() => onPanelChange(showingMap ? "list" : "map")}
        className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full bg-gray-900 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(15,23,42,0.28)] transition-transform active:scale-[0.98]"
      >
        {showingMap ? (
          <>
            <List size={18} />
            Show list
          </>
        ) : (
          <>
            <MapIcon size={18} />
            Show map
          </>
        )}
      </button>
    </div>
  );
}
