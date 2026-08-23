import type { Metadata } from "next";
import Link from "next/link";
import {
  MagnifyingGlass,
  Star,
  SquaresFour,
  ListBullets,
} from "@phosphor-icons/react/dist/ssr";
import { BRAND_NAME } from "@/lib/brand";
import { listVendors } from "@/lib/server/graph";
import { TeamPicksSection } from "@/app/components/team/TeamPicksSection";
import { DEFAULT_SLOTS, SLOT_ROLES, slotForRole } from "@/lib/team";
import { ROLE_LABELS, roleLabel } from "@/lib/roles";
import {
  showHandle,
  vendorsHref,
  vendorsSearchParams,
  weddingCountLabel,
  type VendorsQuery,
} from "@/lib/slots";
import { formatCount } from "@/lib/format-address";
import { SiteHeader } from "@/app/components/SiteHeader";
import { Avatar } from "@/app/components/Avatar";
import { SlotRail } from "@/app/components/SlotRail";
import { VendorFilterControls } from "@/app/components/VendorFilterControls";
import { VenuePlacePhoto } from "@/app/components/VenuePlacePhoto";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { siteContainerClass, SITE_SUBHEADER_TOP_CLASS } from "@/lib/site-layout";

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: `Chicago Wedding Vendors | ${BRAND_NAME}`,
  description:
    "Every vendor credited on a real Chicago wedding, ranked by documented weddings, not ad spend.",
};

type VendorRow = Awaited<ReturnType<typeof listVendors>>["vendors"][number];

function metaLine(v: VendorRow): string {
  const parts = [roleLabel(v.role)];
  if (showHandle(v.name, v.username)) parts.push(`@${v.username}`);
  if (v.neighborhood) parts.push(v.neighborhood);
  return parts.join(" · ");
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim() : null;
  const page = Math.max(1, parseInt((params.page as string) ?? "1", 10));
  const min = params.min === "3" ? 3 : params.min === "10" ? 10 : 1;
  const view = params.view === "list" ? "list" : "grid";
  const teamIds =
    typeof params.team === "string"
      ? params.team.split(",").map(Number).filter(Number.isInteger).slice(0, 50)
      : [];

  // Pre-slot ?role= links must keep filtering even when no slot claims the role.
  const roleParam =
    typeof params.role === "string"
      ? params.role.split(",").filter((r) => ROLE_LABELS[r])
      : [];
  let slot =
    typeof params.slot === "string" && (DEFAULT_SLOTS as readonly string[]).includes(params.slot)
      ? params.slot
      : null;
  if (!slot && roleParam.length > 0) {
    const inferred = slotForRole(roleParam[0]);
    slot = (DEFAULT_SLOTS as readonly string[]).includes(inferred) ? inferred : null;
  }
  const slotRoles = slot ? SLOT_ROLES[slot] : null;
  const selectedRoles = slotRoles ? roleParam.filter((r) => slotRoles.includes(r)) : roleParam;
  const roles = selectedRoles.length > 0 ? selectedRoles : slotRoles;

  const { vendors, total } = await listVendors({
    roles,
    q,
    minWeddings: min,
    teamIds,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // `state` omits `page`, so every filter link resets pagination.
  const state: VendorsQuery = { slot, roles: selectedRoles, q, min, team: teamIds, view };
  const query = (over: Partial<VendorsQuery>) => vendorsHref({ ...state, ...over });
  const picksNoun = slot ? `${slot} vendors` : "Vendors";

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeLabel={slot === "Venue" ? "Venues" : "Vendors"} />

      {/* Sticky filter deck */}
      <div className={`sticky ${SITE_SUBHEADER_TOP_CLASS} z-40 border-b border-black/[0.06] bg-white`}>
        <div className={`${siteContainerClass} flex items-center gap-2 py-3`}>
          <VendorFilterControls
            current={state}
            min={min}
            teamActive={teamIds.length > 0}
          />

          <span aria-hidden className="h-6 w-px shrink-0 bg-black/[0.08]" />

          <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <SlotRail state={state} />
          </div>

          <form action="/vendors" method="get" className="hidden shrink-0 items-center gap-2 rounded-full border border-black/[0.10] px-3.5 py-1.5 focus-within:border-black/[0.30] md:flex">
            <MagnifyingGlass size={14} className="shrink-0 text-black/[0.45]" />
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder={slot ? `Search ${slot.toLowerCase()}…` : "Search vendors…"}
              className="w-32 bg-transparent text-sm text-gray-800 outline-none placeholder:text-black/[0.40] lg:w-40"
            />
            {[...vendorsSearchParams({ ...state, q: null }).entries()].map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          </form>

          <div className="flex shrink-0 rounded-full border border-black/[0.10] p-0.5">
            <Link
              href={query({ view: "grid" })}
              aria-label="Grid view"
              title="Grid view"
              className={`rounded-full p-1.5 transition-colors ${
                view === "grid" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <SquaresFour size={16} />
            </Link>
            <Link
              href={query({ view: "list" })}
              aria-label="List view"
              title="List view"
              className={`rounded-full p-1.5 transition-colors ${
                view === "list" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <ListBullets size={16} />
            </Link>
          </div>
        </div>
      </div>

      <main className={`${siteContainerClass} py-6`}>
        {/* Vendors co-credited with the user's hearted team */}
        <TeamPicksSection roles={roles ?? []} nounPlural={picksNoun} />

        {vendors.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-black/[0.12] p-8 text-sm text-gray-600">
            No vendors match these filters yet. Try clearing a filter, or browse all{" "}
            <Link href="/vendors" className="font-medium text-gray-900 underline">
              Chicago vendors
            </Link>
            .
          </p>
        ) : view === "grid" ? (
          /* Grid view */
          <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {vendors.map((v) => (
              <li
                key={v.username}
                className="group relative overflow-hidden rounded-2xl border border-black/[0.07] bg-white transition-colors hover:border-black/[0.18]"
              >
                <Link href={`/vendors/${encodeURIComponent(v.username)}`} className="block">
                  <div className="relative h-44 overflow-hidden bg-black/[0.03]">
                    {v.place_id || (v.photos && v.photos.length > 0) ? (
                      <VenuePlacePhoto
                        placeId={v.place_id ?? undefined}
                        photoNames={v.photos}
                        alt={v.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Avatar src={v.avatar_url} name={v.name} size={88} className="text-2xl" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-[15px] font-medium text-gray-900">
                        {v.name}
                      </span>
                      {v.rating != null && (
                        <span className="flex shrink-0 items-center gap-1 text-sm text-gray-800">
                          <Star size={12} weight="fill" className="text-amber-400" />
                          {v.rating}
                          {v.review_count != null && (
                            <span className="text-xs text-black/[0.55]">
                              ({formatCount(v.review_count)})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-black/[0.56]">{metaLine(v)}</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {weddingCountLabel(v.n_weddings)}
                      {typeof v.followers === "number" && v.followers > 0 && (
                        <span className="font-normal text-black/[0.56]">
                          {" "}· {formatCount(v.followers)} followers
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
                <span className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur-sm">
                  <AddToTeamButton
                    accountId={v.id}
                    username={v.username}
                    name={v.name}
                    role={v.role}
                    avatarUrl={v.avatar_url}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          /* List view */
          <ul className="mt-6 grid grid-cols-1 gap-x-12 lg:grid-cols-2">
            {vendors.map((v) => (
              <li key={v.username} className="flex items-center border-b border-black/[0.06]">
                <Link
                  href={`/vendors/${encodeURIComponent(v.username)}`}
                  className="group -mx-2 flex min-w-0 flex-1 items-center gap-4 rounded-lg px-2 py-3.5 transition-colors hover:bg-black/[0.03]"
                >
                  <Avatar src={v.avatar_url} name={v.name} size={48} className="text-lg" />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-gray-900">{v.name}</span>
                      {v.rating != null && (
                        <span className="flex shrink-0 items-center gap-0.5 text-sm text-gray-800">
                          <Star size={11} weight="fill" className="text-amber-400" />
                          {v.rating}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-sm text-black/[0.56]">
                      {metaLine(v)}
                      {" · "}
                      {weddingCountLabel(v.n_weddings)}
                      {typeof v.followers === "number" && v.followers > 0 &&
                        ` · ${formatCount(v.followers)} followers`}
                    </span>
                  </span>
                </Link>
                <span className="shrink-0 pl-2">
                  <AddToTeamButton
                    accountId={v.id}
                    username={v.username}
                    name={v.name}
                    role={v.role}
                    avatarUrl={v.avatar_url}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}

        <nav className="mt-10 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={query({ page: page - 1 })}
              className="rounded-full border border-black/[0.10] px-4 py-2 text-gray-700 transition-colors hover:border-black/[0.25]"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-black/[0.56]">
            {total.toLocaleString()} vendors · Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={query({ page: page + 1 })}
              className="rounded-full border border-black/[0.10] px-4 py-2 text-gray-700 transition-colors hover:border-black/[0.25]"
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
