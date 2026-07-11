require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";

function getApiKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
  );
}

async function fetchFreshPhotos(placeId, apiKey) {
  const res = await fetch(`${PLACE_DETAILS_URL}/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "photos",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${placeId}: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.photos ?? []).map((photo) => photo.name).filter(Boolean);
}

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY in .env.local");
    process.exit(1);
  }

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  const { rows } = await pool.query(
    `SELECT id, place_id, name FROM vendors WHERE place_id IS NOT NULL ORDER BY id`,
  );

  console.log(`Refreshing photos for ${rows.length} vendors…`);

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const photos = await fetchFreshPhotos(row.place_id, apiKey);
      if (photos.length === 0) {
        console.log(`  skip ${row.name} — no photos returned`);
        continue;
      }

      await pool.query(`UPDATE vendors SET photos = $1 WHERE id = $2`, [
        JSON.stringify(photos),
        row.id,
      ]);
      updated++;
      console.log(`  ✓ ${row.name} (${photos.length} photos)`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${row.name}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 120));
  }

  await pool.end();
  console.log(`Done. Updated ${updated}, failed ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
