import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Browser keys only — never fall back to server-only GOOGLE_MAPS_API_KEY.
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY,
    NEXT_PUBLIC_GOOGLE_PLACES_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    // Required for Advanced Markers on the venues map.
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ??
      process.env.GOOGLE_MAPS_MAP_ID,
  },
};

export default nextConfig;
