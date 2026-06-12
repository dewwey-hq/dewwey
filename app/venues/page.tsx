import type { Metadata } from "next";
import VenuesClient, { type VenueVendor } from "../components/VenuesClient";

const API_URL = "https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors";

export const metadata: Metadata = {
  title: "Chicago Wedding Venues | Dewy",
  description:
    "Browse and compare Chicago wedding venues by style, guest count, budget, and location.",
};

async function getVenues(): Promise<VenueVendor[]> {
  try {
    const res = await fetch(`${API_URL}?limit=12&city=Chicago&category=venue`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data.vendors ?? [];
  } catch {
    return [];
  }
}

export default async function VenuesPage() {
  const venues = await getVenues();

  return <VenuesClient venues={venues} />;
}
