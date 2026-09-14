/**
 * Minimal CSV line parser shared by `discoverWebsites.ts` (`--manual-map`) and
 * `crawlVenue.ts` (`--seed-urls`). Handles quoted fields with `""`-escaped quotes; no other CSV
 * quirks (no embedded newlines inside a quoted field) since every caller's input is a small,
 * hand-maintained CSV.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

/** Parses a CSV's non-empty lines into row objects keyed by its header row, given the set of
 * required column names (throws if any is missing). */
export function parseCsvRows(text: string, requiredColumns: string[]): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  for (const col of requiredColumns) {
    if (!header.includes(col)) {
      throw new Error(`csv must have a "${col}" column header (got: ${header.join(",")})`);
    }
  }
  return { header, rows: lines.slice(1).map(parseCsvLine) };
}
