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
import { VendorTabs } from "@/app/components/VendorTabs";
import { WeddingFeedCard } from "@/app/components/WeddingFeedCard";
import { siteContainerClass } from "@/lib/site-layout";
import { displayHeadingClassName } from "@/lib/typography";

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
    title: `${p.name} - ${roleLabel(p.role)} | ${BRAND_NAME}`,
    description: `${p.name} (@${p.username}) on Dewwey. See the real weddings they've worked and who they work with.`,
  };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-[15px] text-gray-900">{value}</div>
    </div>
  );
}

export default async function VendorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const data = await getVendorProfile(decodeURIComponent(username));
  if (!data) notFound();
  const { profile: p, partners, stacks, enrichment } = data;

  const detailRows: { label: string; value: string }[] = [];
  if (enrichment?.capacity_as_stated || enrichment?.capacity_max) {
    detailRows.push({
      label: "Guest capacity",
      value:
        enrichment.capacity_as_stated ??
        (enrichment.capacity_min
          ? `${enrichment.capacity_min}–${enrichment.capacity_max}`
          : `Up to ${enrichment.capacity_max}`),
    });
  }
  if (enrichment?.catering) detailRows.push({ label: "Catering", value: enrichment.catering });
  if (enrichment?.event_insurance)
    detailRows.push({ label: "Event insurance", value: enrichment.event_insurance });
  if (enrichment?.pricing_model || enrichment?.price_display)
    detailRows.push({
      label: "Pricing",
      value: enrichment.price_display ?? enrichment.pricing_model,
    });
  if (p.address) detailRows.push({ label: "Address", value: p.address });
  if (p.rating)
    detailRows.push({
      label: "Google rating",
      value: `★ ${p.rating} (${p.review_count} reviews)`,
    });

  const details =
    detailRows.length > 0 ? (
      <div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {detailRows.map((r) => (
            <DetailRow key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
        {enrichment && (
          <p className="mt-4 text-xs text-gray-400">
            Venue facts extracted from the venue&apos;s own website
            {enrichment.website ? (
              <>
                {" "}
                (
                <a
                  className="underline hover:text-gray-900"
                  href={enrichment.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  source
                </a>
                )
              </>
            ) : null}
            .
          </p>
        )}
      </div>
    ) : undefined;

  const worksWith = (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {partners.length === 0 && (
        <li className="text-sm text-gray-500">No co-credited vendors yet.</li>
      )}
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
          {/* Profile header */}
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
                {typeof p.followers === "number" && (
                  <span>{p.followers.toLocaleString()} followers</span>
                )}
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
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-gray-600">
                  {p.biography}
                </p>
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

          <VendorTabs
            feed={feed}
            worksWith={worksWith}
            details={details}
            feedCount={stacks.length}
            worksWithCount={partners.length}
          />
        </div>
      </main>
    </div>
  );
}
