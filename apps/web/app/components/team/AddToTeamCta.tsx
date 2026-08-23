"use client";

import { Heart } from "lucide-react";
import { useTeam } from "./TeamProvider";
import { slotForRole } from "@/lib/team";

/** Full-size add button for a vendor's own profile page. */
export function AddToTeamCta({
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

  if (added) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-100"
      >
        <Heart size={15} className="fill-current" /> In your team
      </button>
    );
  }
  return (
    <button
      onClick={() => {
        addEntry({
          slot: slotForRole(role),
          kind: "dewwey",
          status: "considering",
          name,
          accountId,
          username,
          avatarUrl,
        });
        setOpen(true);
      }}
      className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600"
    >
      <Heart size={15} /> Add to your team
    </button>
  );
}
