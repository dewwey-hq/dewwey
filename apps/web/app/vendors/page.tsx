import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { listVendors } from "@/lib/server/graph";
import { TeamPicksSection } from "@/app/components/team/TeamPicksSection";
import { SLOT_ROLES, slotForRole } from "@/lib/team";
import { ROLE_LABELS, roleLabel } from "@/lib/roles";
import { SiteHeader } from "@/app/components/SiteHeader";
import { Avatar } from "@/app/components/Avatar";
import { siteContainerClass } from "@/lib/site-layout";
import { displayHeadingClassName } from "@/lib/typography";

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: `Chicago Wedding Vendors | ${BRAND_NAME}`,
  description:
    "Every vendor credited on a real Chicago wedding — ranked by documented weddings, not ad spend.",
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const role = typeof params.role === "string" && ROLE_LABELS[params.role] ? params.role : null;
  const q = typeof params.q === "string" ? params.q : null;
  const page = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const { vendors, total } = await listVendors({
    role,
    q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const picksRoles = role ? SLOT_ROLES[slotForRole(role)] ?? [role] : [];
  const picksNoun = role ? `${ROLE_LABELS[role]} vendors` : "Vendors";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageQuery = (n: number) =>
    `/vendors?${role ? `role=${role}&` : ""}${q ? `q=${encodeURIComponent(q)}&` : ""}page=${n}`;

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <SiteHeader activeLabel="Vendors" />
      <main className={`${siteContainerClass} py-10`}>
        <h1 className={`${displayHeadingClassName} text-3xl text-gray-900 sm:text-4xl`}>
          Chicago wedding vendors
        </h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          {total.toLocaleString()} vendors credited on real Chicago weddings — ranked by
          documented work, not ad spend.
        </p>

        {/* Role filter */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/vendors"
            className={`rounded-full px-3.5 py-1.5 text-sm ring-1 ring-inset transition-colors ${
              !role
                ? "bg-rose-500 text-white ring-rose-500"
                : "bg-white text-gray-600 ring-gray-200 hover:ring-rose-300"
            }`}
          >
            All
          </Link>
          {Object.entries(ROLE_LABELS)
            .filter(([r]) => !["other", "beauty_other", "content_creator"].includes(r))
            .map(([r, label]) => (
              <Link
                key={r}
                href={`/vendors?role=${r}`}
                className={`rounded-full px-3.5 py-1.5 text-sm ring-1 ring-inset transition-colors ${
                  role === r
                    ? "bg-rose-500 text-white ring-rose-500"
                    : "bg-white text-gray-600 ring-gray-200 hover:ring-rose-300"
                }`}
              >
                {label}
              </Link>
            ))}
        </div>

        {/* Grid */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vendors.map((v) => (
            <Link
              key={v.username}
              href={`/vendors/${encodeURIComponent(v.username)}`}
              className="group flex items-center gap-4 rounded-2xl border border-black/[0.07] bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
            >
              <Avatar src={v.avatar_url} name={v.name} size={56} className="text-xl" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-gray-900 group-hover:text-rose-600">
                  {v.name}
                </span>
                <span className="block truncate text-sm text-gray-400">
                  {roleLabel(v.role)} · @{v.username}
                </span>
                <span className="mt-0.5 block text-sm text-gray-500">
                  {v.n_weddings} documented wedding{v.n_weddings === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <nav className="mt-10 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={pageQuery(page - 1)}
              className="rounded-full border border-gray-300 px-4 py-2 text-gray-700 hover:border-rose-300 hover:text-rose-600"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-gray-400">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageQuery(page + 1)}
              className="rounded-full border border-gray-300 px-4 py-2 text-gray-700 hover:border-rose-300 hover:text-rose-600"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>
    </div>
  );
}
