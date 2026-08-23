import Link from "next/link";
import { Avatar } from "./Avatar";
import { roleLabel } from "@/lib/roles";
import type { WeddingStack } from "@/lib/server/graph";

function formatDate(d: string | null): string {
  if (!d) return "Date unknown";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A wedding rendered the way it was found: as a credit stack.
 * Venue anchors the card; every credited vendor is one row, linked.
 */
export function StackCard({
  stack,
  highlightUsername,
}: {
  stack: WeddingStack;
  highlightUsername?: string;
}) {
  const confirmed = stack.n_posts > 1;
  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-black/[0.07] bg-white">
      {/* Venue anchor */}
      <div className="flex items-center gap-3 border-b border-black/[0.05] bg-rose-50/40 px-5 py-4">
        {stack.venue_username ? (
          <Link
            href={`/vendors/${encodeURIComponent(stack.venue_username)}`}
            className="flex min-w-0 items-center gap-3"
          >
            <Avatar src={stack.venue_avatar_url} name={stack.venue_name ?? "?"} size={44} />
            <div className="min-w-0">
              <div className="truncate font-medium text-gray-900">{stack.venue_name}</div>
              <div className="text-sm text-gray-500">{formatDate(stack.event_date_est)}</div>
            </div>
          </Link>
        ) : (
          <div className="min-w-0">
            <div className="font-medium text-gray-900">Venue unknown</div>
            <div className="text-sm text-gray-500">{formatDate(stack.event_date_est)}</div>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {confirmed && (
            <span
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
              title={`${stack.n_posts} vendors independently posted this wedding`}
            >
              ✓ {stack.n_posts} posts
            </span>
          )}
          {stack.post_urls[0] && (
            <a
              href={stack.post_urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-rose-200 hover:text-rose-600"
            >
              View on IG ↗
            </a>
          )}
        </div>
      </div>

      {/* The stack */}
      <ul className="divide-y divide-black/[0.04] px-5 py-2">
        {stack.vendors
          .filter((v) => v.role !== "venue")
          .map((v) => {
            const highlighted = v.username === highlightUsername;
            return (
              <li key={`${v.username}-${v.role}`} className="flex items-center gap-3 py-2.5">
                <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {roleLabel(v.role)}
                </span>
                <Link
                  href={`/vendors/${encodeURIComponent(v.username)}`}
                  className={`flex min-w-0 items-center gap-2.5 ${
                    highlighted ? "text-rose-600" : "text-gray-800"
                  } hover:text-rose-600`}
                >
                  <Avatar src={v.avatar_url} name={v.name} size={28} className="text-xs" />
                  <span className="truncate text-[15px]">{v.name}</span>
                  <span className="hidden truncate text-sm text-gray-400 sm:inline">
                    @{v.username}
                  </span>
                </Link>
              </li>
            );
          })}
      </ul>
    </article>
  );
}
