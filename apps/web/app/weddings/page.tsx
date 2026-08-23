import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { listWeddingStacks } from "@/lib/server/graph";
import { SiteHeader } from "@/app/components/SiteHeader";
import { WeddingFeedCard } from "@/app/components/WeddingFeedCard";
import { siteContainerClass } from "@/lib/site-layout";
import { displayHeadingClassName } from "@/lib/typography";

const PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: `Real Chicago Wedding Teams | ${BRAND_NAME}`,
  description:
    "Real weddings, real vendor teams: credit stacks from Chicago weddings, straight from the vendors who worked them.",
};

export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const { stacks, total } = await listWeddingStacks({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeLabel="Weddings" />
      <main className={`${siteContainerClass} py-10`}>
        <div className="mx-auto max-w-4xl">
          <h1 className={`${displayHeadingClassName} text-3xl text-gray-900 sm:text-4xl`}>
            Real wedding teams
          </h1>
          <p className="mt-2 text-gray-600">
            {total.toLocaleString()} Chicago weddings, reconstructed from the credit
            stacks vendors post. Every team is who actually worked the day.
          </p>

          <div className="mt-8 space-y-6">
            {stacks.map((s) => (
              <WeddingFeedCard key={s.id} stack={s} />
            ))}
          </div>

          <nav className="mt-10 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link
                href={`/weddings?page=${page - 1}`}
                className="rounded-full border border-black/[0.10] px-4 py-2 text-gray-700 hover:border-black/[0.25]"
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-black/[0.56]">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={`/weddings?page=${page + 1}`}
                className="rounded-full border border-black/[0.10] px-4 py-2 text-gray-700 hover:border-black/[0.25]"
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>
      </main>
    </div>
  );
}
