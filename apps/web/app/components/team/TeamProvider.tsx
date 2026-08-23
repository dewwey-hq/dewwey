"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  emptyTeam,
  TEAM_STORAGE_KEY,
  type TeamEntry,
  type TeamState,
} from "@/lib/team";

interface TeamContextValue {
  team: TeamState;
  hydrated: boolean;
  user: User | null;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  addEntry: (entry: Omit<TeamEntry, "id">) => void;
  removeEntry: (id: string) => void;
  setStatus: (id: string, status: TeamEntry["status"]) => void;
  addSlot: (slot: string) => void;
  hasAccount: (accountId: number) => boolean;
  dewweyAccountIds: number[];
  signOut: () => Promise<void>;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used inside TeamProvider");
  return ctx;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(r: any): TeamEntry {
  return {
    id: r.id,
    slot: r.slot,
    kind: r.kind,
    status: r.status,
    name: r.name,
    accountId: r.account_id ?? undefined,
    username: r.username ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    instagram: r.instagram ?? undefined,
    website: r.website ?? undefined,
  };
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<TeamState>(emptyTeam);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setOpen] = useState(false);
  const supabase = useMemo(() => supabaseBrowser(), []);
  const teamIdRef = useRef<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSync = useRef(false);

  // 1. Hydrate from localStorage (guest mode / instant paint).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEAM_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TeamState;
        if (Array.isArray(parsed.slots) && Array.isArray(parsed.entries)) {
          setTeam(parsed);
        }
      }
    } catch {
      // corrupted state — start fresh
    }
    setHydrated(true);
  }, []);

  // 2. Auth state → reconcile with the server copy.
  useEffect(() => {
    if (!hydrated) return;

    async function reconcile(u: User) {
      const { data: teamRow } = await supabase
        .from("user_teams")
        .select("id, slots")
        .eq("user_id", u.id)
        .maybeSingle();

      if (teamRow) {
        teamIdRef.current = teamRow.id;
        const { data: rows } = await supabase
          .from("user_team_entries")
          .select("*")
          .eq("team_id", teamRow.id)
          .order("created_at");
        const serverTeam: TeamState = {
          slots: teamRow.slots?.length ? teamRow.slots : emptyTeam().slots,
          entries: (rows ?? []).map(rowToEntry),
        };
        // Server wins; guest-only additions merge in by account/name.
        setTeam((local) => {
          const known = new Set(
            serverTeam.entries.map((e) => e.accountId ?? `c:${e.name}:${e.slot}`),
          );
          const extras = local.entries.filter(
            (e) => !known.has(e.accountId ?? `c:${e.name}:${e.slot}`),
          );
          suppressSync.current = extras.length === 0;
          return {
            slots: [...new Set([...serverTeam.slots, ...local.slots])],
            entries: [...serverTeam.entries, ...extras],
          };
        });
      } else {
        const { data: created } = await supabase
          .from("user_teams")
          .insert({ user_id: u.id, slots: emptyTeam().slots })
          .select("id")
          .single();
        teamIdRef.current = created?.id ?? null;
        suppressSync.current = false; // push whatever the guest built
        setTeam((t) => ({ ...t }));
      }
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) reconcile(data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_IN" && session?.user) reconcile(session.user);
      if (event === "SIGNED_OUT") teamIdRef.current = null;
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrated, supabase]);

  // 3. Persist: localStorage always; server (debounced full replace) when authed.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(team));
    } catch {
      // storage blocked — in-memory still works
    }
    if (!user || !teamIdRef.current) return;
    if (suppressSync.current) {
      suppressSync.current = false;
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    const teamId = teamIdRef.current;
    syncTimer.current = setTimeout(async () => {
      await supabase.from("user_teams").update({
        slots: team.slots,
        updated_at: new Date().toISOString(),
      }).eq("id", teamId);
      await supabase.from("user_team_entries").delete().eq("team_id", teamId);
      if (team.entries.length > 0) {
        await supabase.from("user_team_entries").insert(
          team.entries.map((e) => ({
            team_id: teamId,
            slot: e.slot,
            kind: e.kind,
            status: e.status,
            name: e.name,
            account_id: e.accountId ?? null,
            username: e.username ?? null,
            avatar_url: e.avatarUrl ?? null,
            instagram: e.instagram ?? null,
            website: e.website ?? null,
          })),
        );
      }
    }, 800);
  }, [team, hydrated, user, supabase]);

  const addEntry = useCallback((entry: Omit<TeamEntry, "id">) => {
    setTeam((t) => {
      if (
        entry.kind === "dewwey" &&
        t.entries.some((e) => e.accountId === entry.accountId)
      ) {
        return t;
      }
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const slots = t.slots.includes(entry.slot) ? t.slots : [...t.slots, entry.slot];
      return { slots, entries: [...t.entries, { ...entry, id }] };
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setTeam((t) => ({ ...t, entries: t.entries.filter((e) => e.id !== id) }));
  }, []);

  const setStatus = useCallback((id: string, status: TeamEntry["status"]) => {
    setTeam((t) => ({
      ...t,
      entries: t.entries.map((e) => (e.id === id ? { ...e, status } : e)),
    }));
  }, []);

  const addSlot = useCallback((slot: string) => {
    const clean = slot.trim();
    if (!clean) return;
    setTeam((t) =>
      t.slots.some((s) => s.toLowerCase() === clean.toLowerCase())
        ? t
        : { ...t, slots: [...t.slots, clean] },
    );
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setTeam(emptyTeam());
    try {
      localStorage.removeItem(TEAM_STORAGE_KEY);
    } catch {
      // fine
    }
  }, [supabase]);

  const dewweyAccountIds = useMemo(
    () =>
      team.entries
        .filter((e) => e.kind === "dewwey" && typeof e.accountId === "number")
        .map((e) => e.accountId as number),
    [team.entries],
  );

  const hasAccount = useCallback(
    (accountId: number) => dewweyAccountIds.includes(accountId),
    [dewweyAccountIds],
  );

  const value = useMemo(
    () => ({
      team,
      hydrated,
      user,
      isOpen,
      setOpen,
      addEntry,
      removeEntry,
      setStatus,
      addSlot,
      hasAccount,
      dewweyAccountIds,
      signOut,
    }),
    [team, hydrated, user, isOpen, addEntry, removeEntry, setStatus, addSlot, hasAccount, dewweyAccountIds, signOut],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}
