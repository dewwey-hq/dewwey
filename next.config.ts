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
  },
};

export default nextConfig;
