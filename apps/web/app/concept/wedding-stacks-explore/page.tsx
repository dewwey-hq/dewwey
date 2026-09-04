import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { siteContainerClass } from "@/lib/site-layout";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: `Wedding teams as explore | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

export default function WeddingStacksExplorePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-black/[0.06] bg-[#fdf8f5]">
        <div className={`${siteContainerClass} py-3 text-center text-xs text-gray-500`}>
          Concept swatch. Not wired to live data. Compare:{" "}
          <Link href="/concept/galleria-marchetti-v4" className="underline hover:text-gray-800">
            v4 card deck
          </Link>{" "}
          ·{" "}
          <Link href="/weddings" className="underline hover:text-gray-800">
            live feed
          </Link>
        </div>
      </div>
      <main className={`${siteContainerClass} py-10 pb-24`}>
        <ExploreClient />
      </main>
    </div>
  );
}
