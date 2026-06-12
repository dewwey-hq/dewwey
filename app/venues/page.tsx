import type { Metadata } from "next";
import VenuesClient, { type VenueVendor } from "../components/VenuesClient";

const API_URL = "https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors";
const PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: "Chicago Wedding Venues | Dewy",
  description:
    "Browse and compare Chicago wedding venues by style, guest count, budget, and location.",
};

async function getVenues(
  page: number
): Promise<{ vendors: VenueVendor[]; total: number }> {
  const offset = (page - 1) * PAGE_SIZE;
  try {
    const res = await fetch(
      `${API_URL}?limit=${PAGE_SIZE}&offset=${offset}&city=Chicago&category=venue`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return { vendors: [], total: 0 };
    const data = await res.json();
    return { vendors: data.vendors ?? [], total: data.total ?? 0 };
  } catch {
    return { vendors: [], total: 0 };
  }
}

export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt((pageParam as string) ?? "1", 10));
  const { vendors, total } = await getVenues(currentPage);

  return (
    <VenuesClient
      venues={vendors}
      total={total}
      currentPage={currentPage}
      pageSize={PAGE_SIZE}
    />
  );
}
