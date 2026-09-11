import Link from "next/link";
import { Buildings, InstagramLogo, TextAlignLeft } from "@phosphor-icons/react/dist/ssr";
import { VendorAvatar } from "../components/VendorAvatar";
import { AddToTeamButton } from "@/app/components/team/AddToTeamButton";
import { coverOrFirstPost, displayName, groupStackByCategory, isDerivedName } from "@/lib/feedDesign";
import { roleLabel, contextLabel } from "@/lib/roles";
import type { StackVendor, WeddingStack } from "@/lib/server/graph";

/** "August 2026" — copied verbatim from `variants/Card.tsx` per the lab's per-file
 * duplication convention (see that file's own comment for the UTC rationale). */
function monthYearLabel(date: string | null): string {
  if (!date) return "Date unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** One vendor row — avatar, name (+ `@handle` when derived), role/context subtitle, a
 * small `AddToTeamButton`. Copied from `Card.tsx`'s `CardTile` verbatim (same per-variant
 * duplication convention) so all three options render pixel-identical tiles. */
function SwatchTile({ vendor }: { vendor: StackVendor & { extraRoles: string[] } }) {
  const ctx = vendor.contexts
    .map((c) => contextLabel(c))
    .filter((c): c is string => Boolean(c))
    .join(" / ");
  const roleText = [vendor.role, ...vendor.extraRoles].map((r) => roleLabel(r)).join(" · ");
  const subLine = [roleText, ctx].filter(Boolean).join(" · ");
  const vName = displayName(vendor.name, vendor.username);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <VendorAvatar src={vendor.avatar_url} name={vendor.name} role={vendor.role} size={36} />
      <Link
        href={`/vendors/${encodeURIComponent(vendor.username)}`}
        className="min-w-0 flex-1 text-gray-900 hover:text-gray-600"
      >
        <span className="block truncate text-sm font-medium">
          {vName}
          {!isDerivedName(vendor.name, vendor.username) && (
            <span className="hidden text-xs font-normal text-black/[0.45] lg:inline"> @{vendor.username}</span>
          )}
        </span>
        {subLine && <span className="block truncate text-xs text-black/[0.45]">{subLine}</span>}
      </Link>
      <span className="inline-block shrink-0 scale-[0.83]">
        <AddToTeamButton
          accountId={vendor.accountId}
          username={vendor.username}
          name={vendor.name}
          role={vendor.role}
          avatarUrl={vendor.avatar_url}
        />
      </span>
    </div>
  );
}

const DIVIDER = <div className="border-t border-black/[0.06]" />;

interface PanelTopProps {
  stack: WeddingStack;
  venueHref: string | null;
  venueLabel: string;
  monthYear: string;
  openUrl: string | null;
}

/** Option 1 · "Venue row + action footer" — an eyebrow + venue-name-with-icon header,
 * date/count underneath, tiles in between, and the Open/Caption actions demoted to a
 * pinned pill-button footer instead of living inline in the meta line. */
function Option1Panel({ stack, venueHref, venueLabel, monthYear, tiles, openUrl }: PanelTopProps & { tiles: (StackVendor & { extraRoles: string[] })[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="text-[11px] font-medium uppercase tracking-wide text-black/[0.4]">Venue</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[15px] font-semibold text-gray-900">
        <Buildings size={16} className="shrink-0 text-black/[0.45]" />
        {venueHref ? (
          <Link href={venueHref} className="truncate hover:text-gray-600">
            {venueLabel}
          </Link>
        ) : (
          <span className="truncate">{venueLabel}</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-black/[0.45]">
        {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
      </p>
      <div className="mt-3">{DIVIDER}</div>
      <div className="mt-4 flex flex-col gap-y-2">
        {tiles.map((v) => (
          <SwatchTile key={`${v.username}-${v.role}`} vendor={v} />
        ))}
      </div>
      <div className="sticky bottom-0 mt-3 flex items-center gap-2 border-t border-black/[0.06] bg-white pt-3">
        <a
          href={openUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-black/[0.12] hover:ring-black/[0.3]"
        >
          <InstagramLogo size={14} />
          Open
        </a>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-black/[0.12] hover:ring-black/[0.3]"
        >
          <TextAlignLeft size={14} />
          Caption
        </button>
      </div>
    </div>
  );
}

/** Option 2 · "Venue as first tile + icon buttons" — the date/count moves to the top
 * next to two icon-only actions, and the venue itself becomes the first tile in the
 * stack (same tile markup as every vendor) instead of a distinct header treatment. */
function Option2Panel({
  stack,
  venueHref,
  venueLabel,
  monthYear,
  tiles,
  openUrl,
  venueAvatarUrl,
}: PanelTopProps & { tiles: (StackVendor & { extraRoles: string[] })[]; venueAvatarUrl: string | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-black/[0.45]">
          {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1">
          <a
            href={openUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on Instagram"
            aria-label="Open on Instagram"
            className="rounded-full p-1.5 text-gray-500 hover:bg-black/[0.05] hover:text-gray-900"
          >
            <InstagramLogo size={16} />
          </a>
          <button
            type="button"
            title="Show caption"
            aria-label="Show caption"
            className="rounded-full p-1.5 text-gray-500 hover:bg-black/[0.05] hover:text-gray-900"
          >
            <TextAlignLeft size={16} />
          </button>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex min-w-0 items-center gap-2">
          <VendorAvatar src={venueAvatarUrl} name={venueLabel} role="venue" size={36} />
          {venueHref ? (
            <Link href={venueHref} className="min-w-0 flex-1 text-gray-900 hover:text-gray-600">
              <span className="block truncate text-sm font-medium">{venueLabel}</span>
              <span className="block truncate text-xs text-black/[0.45]">{roleLabel("venue")}</span>
            </Link>
          ) : (
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{venueLabel}</span>
              <span className="block truncate text-xs text-black/[0.45]">{roleLabel("venue")}</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">{DIVIDER}</div>
      <div className="mt-4 flex flex-col gap-y-2">
        {tiles.map((v) => (
          <SwatchTile key={`${v.username}-${v.role}`} vendor={v} />
        ))}
      </div>
    </div>
  );
}

/** Option 3 · "Title panel + text actions" — the venue name IS the panel title (largest
 * text in the panel), a subtitle line folds venue/date/count into one row, and the
 * actions demote all the way to plain text links under the tiles. */
function Option3Panel({ stack, venueHref, venueLabel, monthYear, tiles, openUrl }: PanelTopProps & { tiles: (StackVendor & { extraRoles: string[] })[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {venueHref ? (
        <Link href={venueHref} className="shrink-0 truncate text-[17px] font-semibold tracking-tight text-gray-900 hover:text-gray-600">
          {venueLabel}
        </Link>
      ) : (
        <p className="shrink-0 truncate text-[17px] font-semibold tracking-tight text-gray-900">{venueLabel}</p>
      )}
      <p className="mt-0.5 shrink-0 text-xs text-black/[0.45]">
        Venue · {monthYear} · {stack.n_posts} post{stack.n_posts === 1 ? "" : "s"}
      </p>
      <div className="mt-3">{DIVIDER}</div>
      <div className="mt-4 flex flex-col gap-y-2">
        {tiles.map((v) => (
          <SwatchTile key={`${v.username}-${v.role}`} vendor={v} />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <a
          href={openUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          Open on Instagram ↗
        </a>
        <button type="button" className="text-xs font-medium text-gray-600 hover:text-gray-900">
          Show caption
        </button>
      </div>
    </div>
  );
}

/**
 * D058 follow-on swatch: three treatments of the stack panel's top block ("Hosted at
 * {venue}" + the "↗ Open on Instagram"/"Show caption" meta line the user called "clunky",
 * 2026-09-11), stacked side by side over the SAME real hosted stack so the tiles below are
 * identical in all three. Each 240px-wide panel is fixed-height with its own scroll, the
 * same footprint the real panel has beside a 360px embed in `Card.tsx`. Purely a visual
 * swatch — every Open/Caption control here is inert (no state, `href="#"` where there's no
 * real post URL).
 */
export function Swatches({ stack }: { stack: WeddingStack }) {
  const venueKey = stack.venue_username?.toLowerCase();
  const venueVendor = venueKey ? stack.vendors.find((v) => v.username.toLowerCase() === venueKey) : undefined;
  const others: StackVendor[] = venueVendor ? stack.vendors.filter((v) => v !== venueVendor) : stack.vendors;
  const groups = groupStackByCategory(others);
  const tiles = groups.flatMap((g) => g.vendors);

  const venueLabel = venueVendor ? displayName(venueVendor.name, venueVendor.username) : stack.venue_name ?? "Unknown venue";
  const venueUsernameForLink = venueVendor?.username ?? stack.venue_username;
  const venueHref = venueUsernameForLink ? `/vendors/${encodeURIComponent(venueUsernameForLink)}` : null;
  const venueAvatarUrl = venueVendor?.avatar_url ?? stack.venue_avatar_url;

  const monthYear = monthYearLabel(stack.event_date_est);
  const openUrl = coverOrFirstPost(stack.post_infos)?.url ?? stack.post_urls[0] ?? null;

  const shared: PanelTopProps = { stack, venueHref, venueLabel, monthYear, openUrl };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">Feed panel-top swatch</h1>
      <p className="mb-6 text-sm text-black/[0.5]">
        Three treatments of the stack panel&apos;s top block, over {venueLabel}&apos;s {monthYear} wedding — same
        tiles below in all three.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-medium text-black/[0.45]">Option 1 · Venue row + action footer</p>
          <div className="h-[600px] w-[240px] overflow-y-auto rounded-2xl border border-black/[0.07] bg-white p-5">
            <Option1Panel {...shared} tiles={tiles} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-black/[0.45]">Option 2 · Venue as first tile + icon buttons</p>
          <div className="h-[600px] w-[240px] overflow-y-auto rounded-2xl border border-black/[0.07] bg-white p-5">
            <Option2Panel {...shared} tiles={tiles} venueAvatarUrl={venueAvatarUrl} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-black/[0.45]">Option 3 · Title panel + text actions</p>
          <div className="h-[600px] w-[240px] overflow-y-auto rounded-2xl border border-black/[0.07] bg-white p-5">
            <Option3Panel {...shared} tiles={tiles} />
          </div>
        </div>
      </div>
    </div>
  );
}
