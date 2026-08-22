import HomepageClient, { type Vendor } from "./components/HomepageClient";
import { searchVendors } from "@/lib/server/vendors";

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
  const featuredVendors = await getFeaturedVendors();
  return <HomepageClient featuredVendors={featuredVendors} />;
}
