import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { listV1ContentCorpus } from "@/lib/server/v1corpus";
import { SiteHeader } from "@/app/components/SiteHeader";
import { V1FeedCard } from "@/app/components/V1FeedCard";
import { siteContainerClass } from "@/lib/site-layout";
import { displayHeadingClassName } from "@/lib/typography";

const PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: `Feed | ${BRAND_NAME}`,
  description: "The V1 content corpus: candidate-generation score, then V3-verified INCLUDE.",
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const { posts, total } = await listV1ContentCorpus({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeLabel="Feed" />
      <main className={`${siteContainerClass} py-10`}>
        <div className="mx-auto max-w-2xl">
          <h1 className={`${displayHeadingClassName} text-3xl text-gray-900 sm:text-4xl`}>
            V1 content feed
          </h1>
          <p className="mt-2 text-gray-600">
            {total.toLocaleString()} posts — candidate-generation score ≥12, V3-classified
            INCLUDE. Sorted by candidate score, highest first.
          </p>

          <div className="mt-8 space-y-6">
            {posts.map((p) => (
              <V1FeedCard key={p.post_url} post={p} />
            ))}
          </div>

          <nav className="mt-10 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link
                href={`/feed?page=${page - 1}`}
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
                href={`/feed?page=${page + 1}`}
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
