"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { APIProvider, AdvancedMarker, AdvancedMarkerAnchorPoint, Map, useMap } from "@vis.gl/react-google-maps";
import MapCustomControls from "./MapCustomControls";
import MapVenueFloatingPopup from "./MapVenueFloatingPopup";
import { MapBoundsReporter } from "./MapSyncHandlers";
import type { MapBounds } from "@/app/lib/map-bounds";
import type { MapVenueCard } from "./venues-browse-types";
import type { VenueVendor } from "./VenuesClient";

/** West of the Loop — fallback before pins load; keeps Lake Michigan out of frame. */
const CHICAGO_CENTER = { lat: 41.865, lng: -87.715 };
const DEFAULT_ZOOM = 13;

/** Extra padding on the east (right) edge pulls the frame inland, away from the lake. */
const MAP_BOUNDS_PADDING = { top: 32, right: 100, bottom: 32, left: 32 };
const MAP_BOUNDS_ZOOM_BUMP = 1;
const MAP_MAX_ZOOM = 14;
const PIN_URL = "/icons/map-pin-rose.svg";
const PIN_SELECTED_URL = "/icons/map-pin-black.svg";

export function venueCoords(v: VenueVendor): { lat: number; lng: number } | null {
  const lat = v.lat != null ? Number(v.lat) : NaN;
  const lng = v.lng != null ? Number(v.lng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function MapVenueBoundsHandler({
  venueKey,
  venues,
  userMovedMapRef,
}: {
  venueKey: string;
  venues: MapVenueCard[];
  userMovedMapRef: MutableRefObject<boolean>;
}) {
  const map = useMap();

  useEffect(() => {
    userMovedMapRef.current = false;
  }, [venueKey, userMovedMapRef]);

  useEffect(() => {
    if (!map || typeof google === "undefined" || !venueKey) return;
    if (userMovedMapRef.current) return;

    const coords = venues
      .map(venueCoords)
      .filter((c): c is { lat: number; lng: number } => c != null);
    if (coords.length === 0) return;

    const id = window.requestAnimationFrame(() => {
      if (coords.length === 1) {
        map.setCenter(coords[0]);
        map.setZoom(15);
        return;
      }

      const bounds = new google.maps.LatLngBounds();
      for (const c of coords) bounds.extend(c);
      map.fitBounds(bounds, MAP_BOUNDS_PADDING);

      const listener = map.addListener("idle", () => {
        listener.remove();
        const z = map.getZoom();
        if (z != null) map.setZoom(Math.min(z + MAP_BOUNDS_ZOOM_BUMP, MAP_MAX_ZOOM));
      });
    });

    return () => window.cancelAnimationFrame(id);
    // Only refit when the visible venue set changes — not on hover re-renders.
  }, [map, venueKey, venues, userMovedMapRef]);

  return null;
}

function MapResizeHandler({ layoutKey }: { layoutKey: string }) {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const id = window.requestAnimationFrame(() => {
      google.maps.event.trigger(map, "resize");
    });
    return () => window.cancelAnimationFrame(id);
  }, [map, layoutKey]);

  return null;
}

function VenuePinMarker({
  venue,
  selected,
  highlighted,
  onSelect,
  onHover,
  onHoverEnd,
}: {
  venue: MapVenueCard;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}) {
  const pos = venueCoords(venue)!;
  const w = selected ? 42 : highlighted ? 40 : 36;
  const h = selected ? 50 : highlighted ? 48 : 44;
  const pinUrl = selected ? PIN_SELECTED_URL : PIN_URL;

  return (
    <AdvancedMarker
      position={pos}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      zIndex={selected ? 1000 : highlighted ? 500 : 1}
      anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pinUrl} alt="" width={w} height={h} draggable={false} className="block" />
    </AdvancedMarker>
  );
}

export default function VenuesMapPanel({
  venues,
  fitBoundsVenues,
  selectedId,
  savedIds,
  mapExpanded,
  mapLayoutKey,
  hoveredPinId,
  onBoundsChange,
  onHoverPin,
  onToggleMapExpanded,
  onSelectVenue,
  onOpenVenue,
  onToggleSave,
}: {
  venues: MapVenueCard[];
  fitBoundsVenues: MapVenueCard[];
  selectedId: number | null;
  savedIds: Set<number>;
  mapExpanded: boolean;
  mapLayoutKey: string;
  hoveredPinId: number | null;
  onBoundsChange: (bounds: MapBounds) => void;
  onHoverPin: (id: number | null) => void;
  onToggleMapExpanded: () => void;
  onSelectVenue: (id: number | null) => void;
  onOpenVenue: (id: number) => void;
  onToggleSave: (id: number) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const popupOverlayRef = useRef<HTMLDivElement>(null);
  const userMovedMapRef = useRef(false);
  const mappable = useMemo(() => venues.filter((v) => venueCoords(v)), [venues]);
  const fitMappable = useMemo(() => fitBoundsVenues.filter((v) => venueCoords(v)), [fitBoundsVenues]);
  const mappableKey = useMemo(
    () =>
      fitMappable
        .map((v) => v.id)
        .sort((a, b) => a - b)
        .join(","),
    [fitMappable],
  );
  const selected = mappable.find((v) => v.id === selectedId) ?? null;
  const selectedPos = selected ? venueCoords(selected) : null;

  if (!apiKey || !mapId) {
    return (
      <div className="flex h-full items-center justify-center bg-[#fdf8f5] p-8 text-center">
        <div>
          <p className="text-sm font-medium text-gray-900">Map not configured</p>
          <p className="mt-1 text-sm text-gray-500">
            Add{" "}
            <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> and{" "}
            <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID</code> in Vercel, then
            redeploy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["marker"]}>
      <div className="relative h-full w-full">
        <div ref={popupOverlayRef} className="pointer-events-none absolute inset-0 z-[5]" />
        <Map
          mapId={mapId}
          defaultCenter={CHICAGO_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          gestureHandling="greedy"
          fullscreenControl={false}
          zoomControl={false}
          mapTypeControl={false}
          streetViewControl={false}
          style={{ width: "100%", height: "100%" }}
        >
          <MapCustomControls expanded={mapExpanded} onToggleExpanded={onToggleMapExpanded} />
          <MapResizeHandler layoutKey={mapLayoutKey} />
          <MapBoundsReporter
            onBoundsChange={onBoundsChange}
            onUserMove={() => {
              userMovedMapRef.current = true;
            }}
          />
          <MapVenueBoundsHandler
            venueKey={mappableKey}
            venues={fitMappable}
            userMovedMapRef={userMovedMapRef}
          />
        {mappable.map((venue) => (
          <VenuePinMarker
            key={venue.id}
            venue={venue}
            selected={venue.id === selectedId}
            highlighted={venue.id === hoveredPinId && venue.id !== selectedId}
            onSelect={() => onSelectVenue(venue.id)}
            onHover={() => onHoverPin(venue.id)}
            onHoverEnd={() => onHoverPin(null)}
          />
        ))}
        {selected && selectedPos ? (
          <MapVenueFloatingPopup
            overlayRoot={popupOverlayRef}
            venue={selected}
            position={selectedPos}
            saved={savedIds.has(selected.id)}
            onToggleSave={() => onToggleSave(selected.id)}
            onClose={() => onSelectVenue(null)}
            onOpen={() => onOpenVenue(selected.id)}
          />
        ) : null}
        </Map>
      </div>
    </APIProvider>
  );
}
