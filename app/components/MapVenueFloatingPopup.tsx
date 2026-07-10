"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "@vis.gl/react-google-maps";
import MapVenuePopupCard from "./MapVenuePopupCard";
import type { MapVenueCard } from "./venues-browse-types";

const PADDING = 12;
const PIN_TIP_HEIGHT = 50;
const GAP = 10;
const DEFAULT_CARD_W = 300;
const DEFAULT_CARD_H = 340;

function usePinContainerPixel(
  map: google.maps.Map | null,
  latLng: { lat: number; lng: number } | null,
) {
  const [pixel, setPixel] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!map || !latLng || typeof google === "undefined") {
      setPixel(null);
      return;
    }

    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.draw = function draw() {
      const projection = overlay.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToContainerPixel(
        new google.maps.LatLng(latLng.lat, latLng.lng),
      );
      if (point) setPixel({ x: point.x, y: point.y });
    };
    overlay.onRemove = () => {};
    overlay.setMap(map);

    const refresh = () => overlay.draw();
    const listeners = ["bounds_changed", "zoom_changed", "center_changed", "idle"].map(
      (event) => map.addListener(event, refresh),
    );

    return () => {
      overlay.setMap(null);
      listeners.forEach((l) => l.remove());
    };
  }, [map, latLng?.lat, latLng?.lng]);

  return pixel;
}

function clampPopupPosition(
  pin: { x: number; y: number },
  cardW: number,
  cardH: number,
  containerW: number,
  containerH: number,
) {
  let left = pin.x - cardW / 2;
  let top = pin.y - PIN_TIP_HEIGHT - GAP - cardH;

  if (top < PADDING) {
    top = pin.y + GAP;
  }

  left = Math.max(PADDING, Math.min(left, containerW - cardW - PADDING));
  top = Math.max(PADDING, Math.min(top, containerH - cardH - PADDING));

  return { left, top };
}

export default function MapVenueFloatingPopup({
  overlayRoot,
  venue,
  position,
  saved,
  onToggleSave,
  onClose,
  onOpen,
}: {
  overlayRoot: React.RefObject<HTMLDivElement | null>;
  venue: MapVenueCard;
  position: { lat: number; lng: number };
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  const map = useMap();
  const pinPixel = usePinContainerPixel(map, position);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: DEFAULT_CARD_W, h: DEFAULT_CARD_H });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [venue.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[data-venue-detail-modal="true"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!pinPixel || !overlayRoot.current || !map) return null;

  const containerW = map.getDiv().clientWidth;
  const containerH = map.getDiv().clientHeight;
  const cardW = Math.min(DEFAULT_CARD_W, containerW - PADDING * 2);
  const { left, top } = clampPopupPosition(
    pinPixel,
    cardSize.w || cardW,
    cardSize.h || DEFAULT_CARD_H,
    containerW,
    containerH,
  );

  return createPortal(
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={cardRef}
        className="pointer-events-auto absolute"
        style={{ left, top, width: cardW }}
      >
        <MapVenuePopupCard
          venue={venue}
          saved={saved}
          onToggleSave={onToggleSave}
          onClose={onClose}
          onOpen={onOpen}
        />
      </div>
    </div>,
    overlayRoot.current,
  );
}
