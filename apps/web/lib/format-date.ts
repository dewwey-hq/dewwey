/** Wedding event dates are date-only; render in UTC to avoid timezone drift. */
export function formatEventDate(d: string | null): string {
  if (!d) return "Date unknown";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
