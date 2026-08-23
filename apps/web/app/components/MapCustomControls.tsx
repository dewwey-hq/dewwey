"use client";

import { ControlPosition, MapControl, useMap } from "@vis.gl/react-google-maps";
import { ArrowsOutSimple as Expand, Minus, Plus, ArrowsInSimple as Shrink } from "@phosphor-icons/react";

export default function MapCustomControls({
  expanded,
  onToggleExpanded,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const map = useMap();

  const zoomBy = (delta: number) => {
    if (!map) return;
    const z = map.getZoom();
    if (z != null) map.setZoom(z + delta);
  };

  return (
    <MapControl position={ControlPosition.RIGHT_TOP}>
      <div className="mr-3 mt-3 flex flex-col items-center gap-2">
        <button
          type="button"
          aria-label={expanded ? "Show venue list" : "Expand map"}
          onClick={onToggleExpanded}
          className="hidden h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-gray-50 lg:flex"
        >
          {expanded ? <Shrink size={18} /> : <Expand size={18} />}
        </button>

        <div className="flex flex-col overflow-hidden rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1)}
            className="flex h-10 w-10 items-center justify-center text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Plus size={18} />
          </button>
          <div className="mx-2.5 border-t border-black/[0.10]" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(-1)}
            className="flex h-10 w-10 items-center justify-center text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Minus size={18} />
          </button>
        </div>
      </div>
    </MapControl>
  );
}
