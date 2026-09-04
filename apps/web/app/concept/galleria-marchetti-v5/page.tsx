import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstagramLogo } from "@phosphor-icons/react/dist/ssr";
import { BRAND_NAME } from "@/lib/brand";
import { getVendorProfile } from "@/lib/server/graph";
import { roleLabel } from "@/lib/roles";
import { SiteHeader } from "@/app/components/SiteHeader";
import { Avatar } from "@/app/components/Avatar";
import { AddToTeamCta } from "@/app/components/team/AddToTeamCta";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { WeddingFeedCard } from "@/app/components/WeddingFeedCard";
import { siteContainerClass } from "@/lib/site-layout";
import { displayHeadingClassName } from "@/lib/typography";
import { DetailsContent } from "./DetailsContent";
import { V5Tabs } from "./V5Tabs";

const USERNAME = "galleriamarchetti";

export const metadata: Metadata = {
  title: `Galleria Marchetti v5: Details tab concept | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

/**
 * v5 concept — same real /vendors/[username] header (live profile data), but tabs use the local
 * V5Tabs (./V5Tabs) instead of the shared app/components/VendorTabs, so the Details tab — wired
 * to the galleria-marchetti-v4 mockup's "About and beyond" content, see ./DetailsContent —
 * lazy-mounts instead of always rendering behind a hidden CSS class. Hardcoded to this one
 * vendor and kept out of app/vendors/[username]/page.tsx entirely so it doesn't touch the
 * general vendor page for anyone else — see DetailsContent's own comment for why the v4
 * hero/sticky-bar/inquiry-modal don't carry over here.
 */
export default async function GalleriaMarchettiV5Page() {
  const data = await getVendorProfile(USERNAME);
  if (!data) notFound();
  const { profile: p, partners, stacks } = data;

  const worksWith = (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {partners.length === 0 && <li className="text-sm text-gray-500">No co-credited vendors yet.</li>}
      {partners.map((partner) => (
        <li key={partner.username}>
          <span className="flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-3 py-2.5 transition-colors hover:border-black/[0.18]">
            <Link
              href={`/vendors/${encodeURIComponent(partner.username)}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar src={partner.avatar_url} name={partner.name} size={38} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] text-gray-900">{partner.name}</span>
                <span className="block text-xs text-gray-500">{roleLabel(partner.role)}</span>
              </span>
            </Link>
            <span
              className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
              title={`${partner.n_weddings} weddings together`}
            >
              ×{partner.n_weddings}
            </span>
            <AddToTeamButton
              accountId={partner.id}
              username={partner.username}
              name={partner.name}
              role={partner.role}
              avatarUrl={partner.avatar_url}
            />
          </span>
        </li>
      ))}
    </ul>
  );

  const feed = (
    <div className="space-y-6">
      {stacks.length === 0 && (
        <p className="rounded-2xl border border-dashed border-black/[0.12] p-6 text-sm text-gray-500">
          No credited weddings in the graph yet.
        </p>
      )}
      {stacks.map((s) => (
        <WeddingFeedCard key={s.id} stack={s} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeLabel="Vendors" />
      <main className={`${siteContainerClass} py-10`}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-2.5 text-center text-xs text-rose-600">
            Concept preview v5: real profile header + tabs, Details tab wired to the
            galleria-marchetti-v4 mockup content. Doesn&apos;t touch the live vendor page. Compare:{" "}
            <Link href={`/vendors/${USERNAME}`} className="underline hover:text-rose-800">
              live page
            </Link>{" "}
            ·{" "}
            <Link href="/concept/galleria-marchetti-v4" className="underline hover:text-rose-800">
              v4 full-page mockup
            </Link>
          </div>

          {/* Profile header — identical to app/vendors/[username]/page.tsx, live data */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar src={p.avatar_url} name={p.name} size={96} className="text-3xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className={`${displayHeadingClassName} text-3xl text-gray-900`}>{p.name}</h1>
                {p.role && (
                  <span className="rounded-full bg-black/[0.05] px-3 py-1 text-sm font-medium text-gray-700">
                    {roleLabel(p.role)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                <a
                  href={`https://www.instagram.com/${p.username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-gray-900"
                >
                  <InstagramLogo size={14} />
                  @{p.username}
                </a>
                {typeof p.followers === "number" && <span>{p.followers.toLocaleString()} followers</span>}
                {p.website && (
                  <a
                    href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gray-900"
                  >
                    Website ↗
                  </a>
                )}
              </div>
              {p.biography && (
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-gray-600">{p.biography}</p>
              )}
            </div>
            <div className="sm:ml-auto sm:self-start">
              <AddToTeamCta
                accountId={p.id}
                username={p.username}
                name={p.name}
                role={p.role}
                avatarUrl={p.avatar_url}
              />
            </div>
          </div>

          <V5Tabs
            feed={feed}
            worksWith={worksWith}
            details={<DetailsContent />}
            feedCount={stacks.length}
            worksWithCount={partners.length}
          />
        </div>
      </main>
    </div>
  );
}
