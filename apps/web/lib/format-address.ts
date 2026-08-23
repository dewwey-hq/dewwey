type AddressFields = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  short_address?: string | null;
  neighborhood?: string | null;
};

/** Formats integers with thousands separators (5522 → 5,522). */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Formats 4+ digit street numbers with thousands separators (5522 → 5,522). */
export function formatAddressNumbers(text: string): string {
  return text.replace(/\b(\d{4,})\b/g, (_, digits: string) =>
    Number(digits).toLocaleString("en-US"),
  );
}

export function displayAddressFor(v: AddressFields): string {
  const streetLine = v.address ?? v.short_address;
  const parts = [streetLine, v.city, v.state].filter(Boolean);
  if (parts.length > 0) {
    return formatAddressNumbers(parts.join(", "));
  }
  return formatAddressNumbers(v.neighborhood ?? "Chicago, IL");
}
