"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "./TeamProvider";
import { Avatar } from "../Avatar";
import { AddToTeamButton } from "./AddToTeamButton";
import { roleLabel } from "@/lib/roles";

interface Pick {
  accountId: number;
  username: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  weddingsTogether: number;
  receipts: { username: string; name: string; n: number }[];
}

/**
 * "…who've worked with your team" — the personalized shelf. Renders nothing
 * until the tray holds at least one dewwey vendor.
 */
export function TeamPicksSection({
  roles,
  nounPlural,
}: {
  roles?: string[];
  nounPlural: string;
}) {
  const { dewweyAccountIds, hydrated } = useTeam();
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const idsKey = dewweyAccountIds.join(",");
  const rolesKey = (roles ?? []).join(",");

  useEffect(() => {
    if (!hydrated || !idsKey) {
      setPicks(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/vendors/for-team?ids=${idsKey}&roles=${rolesKey}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPicks(d.picks ?? []);
      })
      .catch(() => {
        if (!cancelled) setPicks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, idsKey, rolesKey]);

  if (!picks || picks.length === 0) return null;

  return (
    <section className="mt-8 rounded-[1.4rem] border border-rose-200/70 bg-rose-50/40 p-5">
      <h2 className="font-medium text-gray-900">
        {nounPlural} who&apos;ve worked with your team
      </h2>
      <p className="mt-0.5 text-sm text-gray-500">
        Ranked by real weddings worked alongside people you&apos;ve picked.
      </p>
      <div className="scrollbar-none mt-4 flex gap-3 overflow-x-auto pb-2">
        {picks.map((p) => {
          const top = p.receipts[0];
          return (
            <div
              key={p.accountId}
              className="flex w-64 shrink-0 flex-col rounded-2xl border border-black/[0.06] bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <Link href={`/vendors/${encodeURIComponent(p.username)}`}>
                  <Avatar src={p.avatarUrl} name={p.name} size={44} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/vendors/${encodeURIComponent(p.username)}`}
                    className="block truncate text-[15px] font-medium text-gray-900 hover:text-rose-600"
                  >
                    {p.name}
                  </Link>
                  <div className="text-xs text-gray-400">{roleLabel(p.role)}</div>
                </div>
                <AddToTeamButton
                  accountId={p.accountId}
                  username={p.username}
                  name={p.name}
                  role={p.role}
                  avatarUrl={p.avatarUrl}
                />
              </div>
              <div className="mt-3 rounded-xl bg-rose-50/70 px-3 py-2 text-xs leading-relaxed text-gray-600">
                <span className="font-medium text-rose-600">
                  {p.weddingsTogether} wedding{p.weddingsTogether === 1 ? "" : "s"}
                </span>{" "}
                with your team
                {top && (
                  <>
                    {" "}
                    · incl. {top.n} with{" "}
                    <span className="font-medium">{top.name}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
