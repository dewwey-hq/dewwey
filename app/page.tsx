import HomepageClient, { type Vendor } from "./components/HomepageClient";

const API_URL = "https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors";

async function getFeaturedVendors(): Promise<Vendor[]> {
  try {
    const res = await fetch(`${API_URL}?limit=3&city=Chicago`, {
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
