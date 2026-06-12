require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const SEARCH_TERM = "wedding venue Chicago IL";
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.photos",
  "places.regularOpeningHours",
  "places.editorialSummary",
  "places.outdoorSeating",
  "places.liveMusic",
  "places.goodForGroups",
  "places.allowsDogs",
  "places.servesCocktails",
  "places.servesBeer",
  "places.servesWine",
  "places.servesDinner",
  "places.restroom",
  "places.reservable",
  "places.parkingOptions",
  "places.paymentOptions",
].join(",");

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAddress(formatted) {
  if (!formatted) return {};
  // "123 Main St, Chicago, IL 60601, USA"
  const parts = formatted.split(",").map((p) => p.trim());
  const stateZip = parts[2] || "";
  const [state, zip] = stateZip.trim().split(" ");
  return {
    address: parts[0] || null,
    city: parts[1] || null,
    state: state || null,
    zip: zip || null,
  };
}

function mapPriceLevel(level) {
  // Google returns e.g. "PRICE_LEVEL_MODERATE"
  const map = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? null;
}

function mapPlace(place) {
  const { address, city, state, zip } = parseAddress(place.formattedAddress);
  const photoNames = (place.photos || []).map((p) => p.name);
  const openingHours = place.regularOpeningHours?.weekdayDescriptions || null;

  return {
    place_id: place.id,
    name: place.displayName?.text || null,
    category: "venue",
    primary_type: place.primaryType || null,
    place_types: place.types || null,
    address,
    short_address: place.shortFormattedAddress || null,
    neighborhood: null, // not returned by Places API directly
    city,
    state,
    zip,
    phone: place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    google_maps_url: null,
    rating: place.rating || null,
    review_count: place.userRatingCount || null,
    price_level: mapPriceLevel(place.priceLevel),
    photos: photoNames.length ? photoNames : null,
    opening_hours: openingHours,
    editorial_summary: place.editorialSummary?.text || null,
    ai_summary: null,
    review_summary: null,
    outdoor_seating: place.outdoorSeating ?? null,
    live_music: place.liveMusic ?? null,
    good_for_groups: place.goodForGroups ?? null,
    allows_dogs: place.allowsDogs ?? null,
    serves_cocktails: place.servesCocktails ?? null,
    serves_wine: place.servesWine ?? null,
    serves_beer: place.servesBeer ?? null,
    serves_dinner: place.servesDinner ?? null,
    restroom: place.restroom ?? null,
    reservable: place.reservable ?? null,
    wheelchair_accessible_entrance: place.wheelchairAccessibleEntrance ?? null,
    wheelchair_accessible_seating: place.wheelchairAccessibleSeating ?? null,
    parking_options: place.parkingOptions || null,
    payment_options: place.paymentOptions || null,
    lat: place.location?.latitude || null,
    lng: place.location?.longitude || null,
    ai_tags: null,
    search_term: SEARCH_TERM,
    is_claimed: false,
    claimed_by_user_id: null,
    featured: false,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Connect to PostgreSQL
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 2. Call Google Places API
    console.log(`\nSearching Google Places for: "${SEARCH_TERM}"\n`);

    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: SEARCH_TERM }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google Places API error ${response.status}: ${err}`);
    }

    const data = await response.json();

    // 3. Log raw response
    console.log("── Raw API response ──────────────────────────────────────");
    console.log(JSON.stringify(data, null, 2));
    console.log("──────────────────────────────────────────────────────────\n");

    const places = (data.places || []).slice(0, 3);
    console.log(`Found ${data.places?.length ?? 0} results — inserting first ${places.length}.\n`);

    if (places.length === 0) {
      console.log("No results to insert.");
      return;
    }

    // 4. Map and insert
    const vendors = places.map(mapPlace);

    const INSERT_SQL = `
      INSERT INTO vendors (
        place_id, name, category, primary_type, place_types,
        address, short_address, neighborhood, city, state, zip,
        phone, website, google_maps_url, rating, review_count, price_level,
        photos, opening_hours, editorial_summary, ai_summary, review_summary,
        outdoor_seating, live_music, good_for_groups, allows_dogs,
        serves_cocktails, serves_wine, serves_beer, serves_dinner,
        restroom, reservable, wheelchair_accessible_entrance,
        wheelchair_accessible_seating, parking_options, payment_options,
        lat, lng, ai_tags, search_term, is_claimed, claimed_by_user_id, featured
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
        $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43
      )
      ON CONFLICT (place_id) DO NOTHING
    `;

    let inserted = 0;
    for (const v of vendors) {
      const values = [
        v.place_id, v.name, v.category, v.primary_type,
        v.place_types ? JSON.stringify(v.place_types) : null,
        v.address, v.short_address, v.neighborhood, v.city, v.state, v.zip,
        v.phone, v.website, v.google_maps_url, v.rating, v.review_count, v.price_level,
        v.photos ? JSON.stringify(v.photos) : null,
        v.opening_hours ? JSON.stringify(v.opening_hours) : null,
        v.editorial_summary, v.ai_summary, v.review_summary,
        v.outdoor_seating, v.live_music, v.good_for_groups, v.allows_dogs,
        v.serves_cocktails, v.serves_wine, v.serves_beer, v.serves_dinner,
        v.restroom, v.reservable, v.wheelchair_accessible_entrance,
        v.wheelchair_accessible_seating,
        v.parking_options ? JSON.stringify(v.parking_options) : null,
        v.payment_options ? JSON.stringify(v.payment_options) : null,
        v.lat, v.lng,
        v.ai_tags ? JSON.stringify(v.ai_tags) : null,
        v.search_term, v.is_claimed, v.claimed_by_user_id, v.featured,
      ];

      const result = await pool.query(INSERT_SQL, values);
      if (result.rowCount > 0) {
        inserted++;
        console.log(`  ✓ Inserted: ${v.name}`);
      } else {
        console.log(`  – Skipped (already exists): ${v.name}`);
      }
    }

    console.log(`\nDone. Inserted ${inserted} of ${places.length} vendors.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
