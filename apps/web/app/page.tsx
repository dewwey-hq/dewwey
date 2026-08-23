import HomepageClient, { type Vendor } from "./components/HomepageClient";
import { searchVendors } from "@/lib/server/vendors";
import { categoryCounts, homeStats } from "@/lib/server/graph";

export const revalidate = 3600; // rebuild at most once per hour

async function getFeaturedVendors(): Promise<Vendor[]> {
  try {
    const { vendors } = await searchVendors({ limit: 3, city: "Chicago" });
    return (vendors as Vendor[]) ?? [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const [featuredVendors, stats, roleCounts] = await Promise.all([
    getFeaturedVendors(),
    homeStats().catch(() => ({ chicago_weddings: 0, credited_vendors: 0, collaborations: 0 })),
    categoryCounts().catch(() => ({})),
  ]);
  return <HomepageClient featuredVendors={featuredVendors} stats={stats} roleCounts={roleCounts} />;
}
