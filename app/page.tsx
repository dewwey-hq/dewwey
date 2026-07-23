import HomepageClient, { type Vendor } from "./components/HomepageClient";
import { getVendorApiBaseUrl } from "./lib/api";

async function getFeaturedVendors(): Promise<Vendor[]> {
  try {
    const res = await fetch(`${getVendorApiBaseUrl()}?limit=3&city=Chicago`, {
      next: { revalidate: 3600 }, // revalidate at most once per hour
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.vendors ?? [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const featuredVendors = await getFeaturedVendors();
  return <HomepageClient featuredVendors={featuredVendors} />;
}
