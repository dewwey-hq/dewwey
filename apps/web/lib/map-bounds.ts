export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export function venueInMapBounds(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
  bounds: MapBounds | null,
): boolean {
  if (!bounds) return true;

  const latitude = lat != null ? Number(lat) : NaN;
  const longitude = lng != null ? Number(lng) : NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  return (
    latitude <= bounds.north &&
    latitude >= bounds.south &&
    longitude <= bounds.east &&
    longitude >= bounds.west
  );
}

export function venuesInMapBounds<T extends { id: number; lat?: number | string | null; lng?: number | string | null }>(
  venues: T[],
  bounds: MapBounds | null,
  alwaysIncludeId?: number | null,
): T[] {
  const inBounds = venues.filter((v) => venueInMapBounds(v.lat, v.lng, bounds));

  if (alwaysIncludeId == null) return inBounds;
  if (inBounds.some((v) => v.id === alwaysIncludeId)) return inBounds;

  const selected = venues.find((v) => v.id === alwaysIncludeId);
  if (!selected) return inBounds;

  return [selected, ...inBounds];
}
