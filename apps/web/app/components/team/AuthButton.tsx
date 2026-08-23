"use client";

import Link from "next/link";
import { useTeam } from "./TeamProvider";

export function AuthButton() {
  const { user, signOut } = useTeam();
  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-sm font-medium text-rose-600"
          title={user.email ?? undefined}
        >
          {(user.email ?? "?").charAt(0).toUpperCase()}
        </span>
        <button
          onClick={() => signOut()}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <Link
      href="/login"
      className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
    >
      Sign in
    </Link>
  );
}
