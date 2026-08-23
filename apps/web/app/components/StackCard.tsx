import Link from "next/link";
import { Avatar } from "./Avatar";
import { StackPostEmbed } from "./StackPostEmbed";
import { AddToTeamButton } from "./team/AddToTeamButton";
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
 * The wedding (its date) is the entity; every credit — venue included —
 * is one row of the stack.
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
      <div className="flex items-center gap-3 border-b border-black/[0.05] bg-rose-50/40 px-5 py-3.5">
        <h3 className="font-medium text-gray-900">{formatDate(stack.event_date_est)}</h3>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {confirmed && (
            <span
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
              title={`${stack.n_posts} vendors independently posted this wedding`}
            >
              ✓ {stack.n_posts} posts
            </span>
          )}
        </div>
      </div>

      {/* The stack — venue first, per role order */}
      <ul className="divide-y divide-black/[0.04] px-5 py-2">
        {stack.vendors.map((v) => {
          const highlighted = v.username === highlightUsername;
          return (
            <li key={`${v.username}-${v.role}`} className="flex items-center gap-2 py-2.5">
              <span className="w-20 shrink-0 text-xs font-medium text-gray-600">
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
                <span className="hidden truncate text-sm text-gray-500 sm:inline">
                  @{v.username}
                </span>
              </Link>
              <span className="ml-auto">
                <AddToTeamButton
                  accountId={v.accountId}
                  username={v.username}
                  name={v.name}
                  role={v.role}
                  avatarUrl={v.avatar_url}
                />
              </span>
            </li>
          );
        })}
      </ul>

      <StackPostEmbed postUrls={stack.post_urls} />
    </article>
  );
}
