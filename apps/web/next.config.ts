import type { NextConfig } from "next";

// NEXT_PUBLIC_* vars from the env contract (.env.example) are inlined by Next
// automatically — no env aliasing needed here.
const nextConfig: NextConfig = {
  // Phosphor's entry re-exports ~1,500 icons; without this, dev/build pulls
  // the whole barrel into every importing chunk.
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
