import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { searchVendors } from "@/lib/server/vendors";
import VenuesClient, { type VenueVendor } from "../components/VenuesClient";
const PAGE_SIZE = 20;
/** Map view loads all Chicago venues once (client filters by bounds). Keep ≥ DB venue count. */
const MAP_FETCH_LIMIT = 500;

export const metadata: Metadata = {
  title: `Chicago Wedding Venues | ${BRAND_NAME}`,
  description:
    "Browse and compare Chicago wedding venues by style, guest count, budget, and location.",
};

async function getVenues(
  page: number,
  mapMode: boolean,
): Promise<{ vendors: VenueVendor[]; total: number }> {
  const limit = mapMode ? MAP_FETCH_LIMIT : PAGE_SIZE;
  const offset = mapMode ? 0 : (page - 1) * PAGE_SIZE;
  try {
    const { vendors, total } = await searchVendors({
      limit,
      offset,
      city: "Chicago",
      category: "venue",
    });
    return { vendors: (vendors as VenueVendor[]) ?? [], total: total ?? 0 };
  } catch {
    return { vendors: [], total: 0 };
  }
}

export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const viewMode = params.view === "map" ? "map" : "list";
  const currentPage = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const { vendors, total } = await getVenues(currentPage, viewMode === "map");

  return (
    <VenuesClient
      venues={vendors}
      total={total}
      currentPage={currentPage}
      pageSize={PAGE_SIZE}
      viewMode={viewMode}
    />
  );
}
