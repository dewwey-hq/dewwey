type SearchableVenue = {
  name: string;
  location: string;
  displayAddress: string;
  styleLabel: string;
  neighborhood?: string | null;
  address?: string | null;
  short_address?: string | null;
  city?: string | null;
  state?: string | null;
  primary_type?: string | null;
};

/** Normalizes address tokens so "Rockwell Street" matches "Rockwell St". */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''ʼ`´]/g, "")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bcourt\b/g, "ct")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function venueSearchHaystack(venue: SearchableVenue): string {
  return [
    venue.name,
    venue.location,
    venue.displayAddress,
    venue.styleLabel,
    venue.neighborhood,
    venue.address,
    venue.short_address,
    venue.city,
    venue.state,
    venue.primary_type?.replace(/_/g, " "),
  ]
    .filter(Boolean)
    .join(" ");
}

export function venueMatchesSearch(venue: SearchableVenue, search: string): boolean {
  const trimmed = search.trim();
  if (!trimmed) return true;
  const haystack = normalizeForSearch(venueSearchHaystack(venue));
  const needle = normalizeForSearch(trimmed);
  return haystack.includes(needle);
}
