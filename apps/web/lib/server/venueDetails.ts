/**
 * Live-row lookup for the generic VenueDetailsV3 renderer's `/lab/venue?u=` mode (D060 Phase 1b).
 * The `venue_details` / `venue_details_versions` tables this reads don't exist yet (they land in
 * Phase 2's DDL) — every failure, including "relation does not exist," is caught and treated as
 * "no served details yet" rather than surfaced as an error.
 */

import { getPool } from "./db";
import type { VenueDetailsV3 } from "@/lib/venueDetails/types";

export async function getVenueDetailsByUsername(username: string): Promise<VenueDetailsV3 | null> {
  try {
    const { rows } = await getPool().query<{ details: VenueDetailsV3 }>(
      `SELECT vv.details
         FROM venue_details vd
         JOIN accounts a ON a.id = vd.account_id
         JOIN venue_details_versions vv ON vv.id = vd.current_version_id
        WHERE a.username = $1::citext
        LIMIT 1`,
      [username],
    );
    if (rows.length === 0) return null;
    return rows[0].details;
  } catch {
    return null;
  }
}
