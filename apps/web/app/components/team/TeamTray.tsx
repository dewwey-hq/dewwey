"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Plus, X } from "lucide-react";
import { useTeam } from "./TeamProvider";
import { Avatar } from "../Avatar";
import type { TeamEntry } from "@/lib/team";

function EntryRow({ entry }: { entry: TeamEntry }) {
  const { removeEntry, setStatus } = useTeam();
  const booked = entry.status === "booked";
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      {entry.kind === "dewwey" ? (
        <Avatar src={entry.avatarUrl ?? null} name={entry.name} size={30} className="text-xs" />
      ) : (
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
          {entry.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className={`block truncate text-sm ${booked ? "text-gray-900" : "text-gray-700"}`}>
          {entry.name}
        </span>
        {entry.username && (
          <span className="block truncate text-xs text-gray-400">@{entry.username}</span>
        )}
        {entry.kind === "custom" && (entry.instagram || entry.website) && (
          <span className="block truncate text-xs text-gray-400">
            {entry.instagram ? `@${entry.instagram.replace(/^@/, "")}` : entry.website}
          </span>
        )}
      </span>
    </span>
  );

  return (
    <li className="group flex items-center gap-2 py-1.5">
      {entry.kind === "dewwey" && entry.username ? (
        <Link
          href={`/vendors/${encodeURIComponent(entry.username)}`}
          className="min-w-0 flex-1 hover:text-rose-600"
        >
          {body}
        </Link>
      ) : (
        <span className="min-w-0 flex-1">{body}</span>
      )}
      <button
        onClick={() => setStatus(entry.id, booked ? "considering" : "booked")}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors ${
          booked
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-white text-gray-400 ring-gray-200 hover:text-emerald-600 hover:ring-emerald-200"
        }`}
        title={booked ? "Marked booked" : "Mark booked"}
      >
        {booked ? "Booked ✓" : "Booked?"}
      </button>
      <button
        onClick={() => removeEntry(entry.id)}
        className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
        aria-label={`Remove ${entry.name}`}
      >
        <X size={14} />
      </button>
    </li>
  );
}

function AddCustomForm({ slot, onDone }: { slot: string; onDone: () => void }) {
  const { addEntry } = useTeam();
  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");

  return (
    <form
      className="mt-1 space-y-1.5 rounded-xl bg-gray-50 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        addEntry({
          slot,
          kind: "custom",
          status: "considering",
          name: name.trim(),
          instagram: instagram.trim() || undefined,
        });
        onDone();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. my friend Sam)"
        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-rose-300"
      />
      <input
        value={instagram}
        onChange={(e) => setInstagram(e.target.value)}
        placeholder="Instagram or website (optional)"
        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-rose-300"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-rose-500 px-3 py-1 text-xs font-medium text-white hover:bg-rose-600"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TeamTray() {
  const { team, isOpen, setOpen, addSlot } = useTeam();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState("");

  const filled = new Set(team.entries.map((e) => e.slot));
  const bookedCount = team.entries.filter((e) => e.status === "booked").length;

  return (
    <>
      {/* Floating toggle */}
      <button
        onClick={() => setOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-rose-500 px-4 py-3 text-sm font-medium text-white shadow-[0_10px_30px_rgba(244,63,94,0.4)] transition-transform hover:scale-105"
        aria-label="Your team"
      >
        <Heart size={16} fill="currentColor" />
        Your team
        {team.entries.length > 0 && (
          <span className="rounded-full bg-white/25 px-1.5 text-xs">{team.entries.length}</span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <aside className="fixed bottom-20 right-5 z-[60] flex max-h-[75vh] w-[22rem] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-black/[0.05] bg-rose-50/50 px-4 py-3">
            <div>
              <div className="font-medium text-gray-900">Your team</div>
              <div className="text-xs text-gray-500">
                {bookedCount} booked · {filled.size} of {team.slots.length} slots started
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {team.slots.map((slot) => {
              const entries = team.entries.filter((e) => e.slot === slot);
              return (
                <div key={slot} className="border-b border-black/[0.04] py-2.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">
                      {slot}
                    </span>
                    <button
                      onClick={() => setAddingTo(addingTo === slot ? null : slot)}
                      className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Plus size={12} /> add
                    </button>
                  </div>
                  {entries.length > 0 && (
                    <ul className="mt-1">
                      {entries.map((e) => (
                        <EntryRow key={e.id} entry={e} />
                      ))}
                    </ul>
                  )}
                  {entries.length === 0 && addingTo !== slot && (
                    <div className="mt-1 text-xs text-gray-300">Nothing yet</div>
                  )}
                  {addingTo === slot && (
                    <AddCustomForm slot={slot} onDone={() => setAddingTo(null)} />
                  )}
                </div>
              );
            })}

            <form
              className="flex items-center gap-2 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                addSlot(newSlot);
                setNewSlot("");
              }}
            >
              <input
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                placeholder="Add a slot (e.g. Photobooth)"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-rose-300"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:border-rose-300 hover:text-rose-600"
              >
                Add slot
              </button>
            </form>
          </div>
        </aside>
      )}
    </>
  );
}
