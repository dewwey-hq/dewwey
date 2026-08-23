"use client";

import { Heart } from "@phosphor-icons/react";
import { useTeam } from "./TeamProvider";
import { slotForRole } from "@/lib/team";

/** One-tap add anywhere a dewwey vendor appears. */
export function AddToTeamButton({
  accountId,
  username,
  name,
  role,
  avatarUrl,
}: {
  accountId: number;
  username: string;
  name: string;
  role: string | null;
  avatarUrl: string | null;
}) {
  const { hasAccount, addEntry, setOpen } = useTeam();
  const added = hasAccount(accountId);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (added) {
          setOpen(true);
          return;
        }
        addEntry({
          slot: slotForRole(role),
          kind: "dewwey",
          status: "considering",
          name,
          accountId,
          username,
          avatarUrl,
        });
      }}
      title={added ? "In your team" : "Add to your team"}
      aria-label={added ? `${name} is in your team` : `Add ${name} to your team`}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors ${
        added
          ? "bg-white text-rose-500 ring-rose-200"
          : "bg-white text-black/[0.40] ring-black/[0.10] hover:text-rose-500 hover:ring-rose-300"
      }`}
    >
      <Heart size={13} weight={added ? "fill" : "regular"} />
    </button>
  );
}
