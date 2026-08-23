"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { MapBounds } from "@/lib/map-bounds";

const BOUNDS_DEBOUNCE_MS = 300;

export function MapBoundsReporter({
  onBoundsChange,
  onUserMove,
}: {
  onBoundsChange: (bounds: MapBounds) => void;
  onUserMove: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    let timeout: number | undefined;

    const reportBounds = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        const bounds = map.getBounds();
        if (!bounds) return;
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        onBoundsChange({
          north: ne.lat(),
          south: sw.lat(),
          east: ne.lng(),
          west: sw.lng(),
        });
      }, BOUNDS_DEBOUNCE_MS);
    };

    const markMoved = () => onUserMove();

    const listeners = [
      map.addListener("idle", reportBounds),
      map.addListener("dragstart", markMoved),
    ];

    reportBounds();

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      listeners.forEach((listener) => listener.remove());
    };
  }, [map, onBoundsChange, onUserMove]);

  return null;
}
