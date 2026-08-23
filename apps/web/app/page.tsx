import HomepageClient, { type Vendor } from "./components/HomepageClient";
import { searchVendors } from "@/lib/server/vendors";
import { categoryCounts, homeStats, listWeddingStacks, type WeddingStack } from "@/lib/server/graph";

export const revalidate = 3600; // rebuild at most once per hour

async function getFeaturedVendors(): Promise<Vendor[]> {
  try {
    const { vendors } = await searchVendors({ limit: 3, city: "Chicago" });
    return (vendors as Vendor[]) ?? [];
  } catch {
    return [];
  }
}

async function getHeroStack(): Promise<WeddingStack | null> {
  try {
    const { stacks } = await listWeddingStacks({ limit: 8 });
    if (stacks.length === 0) return null;
    const confirmed = stacks.filter((s) => s.n_posts > 1);
    const pool = confirmed.length > 0 ? confirmed : stacks;
    return pool.reduce((best, s) => (s.vendors.length > best.vendors.length ? s : best));
  } catch {
    return null;
  }
}

export default async function Home() {
  const [featuredVendors, stats, roleCounts, heroStack] = await Promise.all([
    getFeaturedVendors(),
    homeStats().catch(() => ({ chicago_weddings: 0, credited_vendors: 0, collaborations: 0 })),
    categoryCounts().catch(() => ({})),
    getHeroStack(),
  ]);
  return (
    <HomepageClient
      featuredVendors={featuredVendors}
      stats={stats}
      roleCounts={roleCounts}
      heroStack={heroStack}
    />
  );
}
