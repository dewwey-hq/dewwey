import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { getVendorProfile } from "@/lib/server/graph";
import { roleLabel } from "@/lib/roles";
import { SiteHeader } from "@/app/components/SiteHeader";
import { Avatar } from "@/app/components/Avatar";
import { StackCard } from "@/app/components/StackCard";
import { siteContainerClass } from "@/lib/site-layout";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const data = await getVendorProfile(decodeURIComponent(username));
  if (!data) return { title: `Vendor not found | ${BRAND_NAME}` };
  const p = data.profile;
  return {
    title: `${p.name} — ${roleLabel(p.role)} | ${BRAND_NAME}`,
    description: `${p.name} (@${p.username}) has ${p.n_weddings} documented weddings. See who they work with and the real wedding teams they've been part of.`,
  };
}

export default async function VendorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const data = await getVendorProfile(decodeURIComponent(username));
  if (!data) notFound();
  const { profile: p, partners, stacks } = data;

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <SiteHeader activeLabel="Vendors" />
      <main className={`${siteContainerClass} py-10`}>
        <div className="mx-auto max-w-5xl">
          {/* Profile header */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar src={p.avatar_url} name={p.name} size={96} className="text-3xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className={`${displayHeadingClassName} text-3xl text-gray-900`}>{p.name}</h1>
                {p.role && (
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-600 ring-1 ring-inset ring-rose-200">
                    {roleLabel(p.role)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                <a
                  href={`https://www.instagram.com/${p.username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-rose-600"
                >
                  @{p.username} ↗
                </a>
                {typeof p.followers === "number" && (
                  <span>{p.followers.toLocaleString()} followers</span>
                )}
                {p.website && (
                  <a
                    href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-rose-600"
                  >
                    Website ↗
                  </a>
                )}
                {p.rating && (
                  <span>
                    ★ {p.rating} ({p.review_count})
                  </span>
                )}
              </div>
              {p.biography && (
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-gray-600">
                  {p.biography}
                </p>
              )}
            </div>
            <div className="sm:ml-auto sm:text-right">
              <div className={`${displayHeadingClassName} text-4xl text-rose-500`}>
                {p.n_weddings}
              </div>
              <div className="text-sm text-gray-500">
                documented wedding{p.n_weddings === 1 ? "" : "s"}
                {p.n_chicago_weddings > 0 && p.n_chicago_weddings !== p.n_weddings && (
                  <> · {p.n_chicago_weddings} Chicago</>
                )}
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
            {/* Stacks */}
            <section>
              <h2 className={`${uiHeadingClassName} text-lg text-gray-900`}>
                Weddings they&apos;ve worked
              </h2>
              <div className="mt-4 space-y-5">
                {stacks.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                    No credited weddings in the graph yet.
                  </p>
                )}
                {stacks.map((s) => (
                  <StackCard key={s.id} stack={s} highlightUsername={p.username} />
                ))}
              </div>
            </section>

            {/* Partners */}
            <aside>
              <h2 className={`${uiHeadingClassName} text-lg text-gray-900`}>Works with</h2>
              <ul className="mt-4 space-y-1">
                {partners.length === 0 && (
                  <li className="text-sm text-gray-500">No co-credited vendors yet.</li>
                )}
                {partners.map((partner) => (
                  <li key={partner.username}>
                    <Link
                      href={`/vendors/${encodeURIComponent(partner.username)}`}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-rose-50/60"
                    >
                      <Avatar src={partner.avatar_url} name={partner.name} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] text-gray-800">
                          {partner.name}
                        </span>
                        <span className="block text-xs text-gray-400">
                          {roleLabel(partner.role)}
                        </span>
                      </span>
                      <span
                        className="ml-auto shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                        title={`${partner.n_weddings} weddings together`}
                      >
                        ×{partner.n_weddings}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
