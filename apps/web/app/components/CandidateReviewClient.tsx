"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import InstagramEmbed from "./InstagramEmbed";
import { matchCandidateReviewKey, type CandidateReviewAction } from "@/lib/candidateReviewKeyboard";
import type { CandidateDecision, CandidateQueueItem } from "@/lib/server/candidateReview";

interface Progress {
  total: number;
  reviewed: number;
  by_decision: Record<string, number>;
}

// Same "fire and forget, retry a handful of times, never block advancing" pattern as
// LabelingClient's submitLabel -- a review decision that fails to save shouldn't stall the
// reviewer mid-keyboard-flow, but shouldn't silently vanish either (surfaced via onSettled).
async function submitDecision(
  payload: {
    candidate_id: number;
    decision: CandidateDecision;
    corrected_venue_username?: string | null;
    duplicate_of_wedding_id?: number | null;
    notes: string | null;
    client_ms: number | null;
  },
  onSettled: (ok: boolean, error?: string) => void
) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/candidate-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSettled(true);
        return;
      }
      // A 400 (e.g. unknown @handle) is a real input error, not a transient failure -- don't
      // burn retries on it, surface it immediately.
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        onSettled(false, body?.error ?? "Invalid input");
        return;
      }
    } catch {
      // fall through to retry
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  onSettled(false, "Failed to save after retries");
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const ANCHOR_SOURCE_LABEL: Record<string, string> = {
  credit_line: "credit line",
  author: "author is the venue",
  location_tag: "IG location tag",
  inline_at: "caption mention",
  venue_hashtag: "venue hashtag",
};

const CHICAGO_BADGE: Record<string, { label: string; className: string }> = {
  CHICAGO_CONFIRMED: { label: "Chicago confirmed", className: "bg-emerald-100 text-emerald-800" },
  CHICAGO_AMBIGUOUS: { label: "Chicago ambiguous", className: "bg-amber-100 text-amber-800" },
  CHICAGO_NOT_CONFIRMED: { label: "Chicago not confirmed", className: "bg-rose-100 text-rose-800" },
};

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

export function CandidateReviewClient({
  initialItems,
  initialProgress,
}: {
  initialItems: CandidateQueueItem[];
  initialProgress: Progress;
}) {
  const [items, setItems] = useState<CandidateQueueItem[]>(initialItems);
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [history, setHistory] = useState<CandidateQueueItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [venueInputOpen, setVenueInputOpen] = useState(false);
  const [venueInputValue, setVenueInputValue] = useState("");
  const [dupInputOpen, setDupInputOpen] = useState(false);
  const [dupInputValue, setDupInputValue] = useState("");

  const mountedAtRef = useRef<number>(0);
  const fetchingRef = useRef(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const venueInputRef = useRef<HTMLInputElement | null>(null);
  const dupInputRef = useRef<HTMLInputElement | null>(null);

  const current = items[0] ?? null;

  // Ref only (never setState) -- the inline-input state below is reset explicitly at every call
  // site that changes `current` (submit() and the BACK handler), not here, so this effect can't
  // trigger the cascading-render pattern react-hooks/set-state-in-effect warns about.
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, [current?.candidate_id]);

  useEffect(() => {
    if (venueInputOpen) venueInputRef.current?.focus();
  }, [venueInputOpen]);
  useEffect(() => {
    if (dupInputOpen) dupInputRef.current?.focus();
  }, [dupInputOpen]);

  const topUp = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/candidate-review?limit=5");
      if (res.ok) {
        const data = (await res.json()) as { items: CandidateQueueItem[]; progress: Progress };
        setItems((prev) => {
          const existing = new Set(prev.map((p) => p.candidate_id));
          const fresh = data.items.filter((i) => !existing.has(i.candidate_id));
          return [...prev, ...fresh];
        });
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (items.length < 3) void topUp();
  }, [items.length, topUp]);

  const submit = useCallback(
    (decision: CandidateDecision, extra?: { correctedVenueUsername?: string; duplicateOfWeddingId?: number }) => {
      if (!current) return;
      const clientMs = Date.now() - mountedAtRef.current;
      const submitted = current;
      const notes = noteDraft.trim() || null;

      setItems((prev) => prev.slice(1));
      setHistory((prev) => [submitted, ...prev].slice(0, 20));
      setProgress((p) => ({
        ...p,
        reviewed: p.reviewed + 1,
        by_decision: { ...p.by_decision, [decision]: (p.by_decision[decision] ?? 0) + 1 },
      }));
      setPendingCount((n) => n + 1);
      setNoteDraft("");
      setVenueInputOpen(false);
      setDupInputOpen(false);
      setErrorMsg(null);

      void submitDecision(
        {
          candidate_id: submitted.candidate_id,
          decision,
          corrected_venue_username: extra?.correctedVenueUsername ?? null,
          duplicate_of_wedding_id: extra?.duplicateOfWeddingId ?? null,
          notes,
          client_ms: clientMs,
        },
        (ok, error) => {
          setPendingCount((n) => Math.max(0, n - 1));
          if (!ok) setErrorMsg(error ?? "Failed to save");
        }
      );
    },
    [current, noteDraft]
  );

  const act = useCallback(
    (action: CandidateReviewAction) => {
      if (action === "FOCUS_NOTES") {
        notesRef.current?.focus();
        return;
      }
      if (action === "BACK") {
        setHistory((prev) => {
          if (prev.length === 0) return prev;
          const [last, ...rest] = prev;
          setItems((items) => [last, ...items]);
          setProgress((p) => ({ ...p, reviewed: Math.max(0, p.reviewed - 1) }));
          return rest;
        });
        setVenueInputOpen(false);
        setDupInputOpen(false);
        return;
      }
      if (!current) return;
      if (action === "WRONG_VENUE") {
        if (!venueInputOpen) {
          setDupInputOpen(false);
          setVenueInputOpen(true);
        }
        return;
      }
      if (action === "DUPLICATE") {
        if (!dupInputOpen) {
          setVenueInputOpen(false);
          setDupInputValue(current.duplicate_hint ? String(current.duplicate_hint.matched_wedding_id) : "");
          setDupInputOpen(true);
        }
        return;
      }
      const DIRECT: Partial<Record<CandidateReviewAction, CandidateDecision>> = {
        CONFIRM: "CONFIRM",
        NOT_WEDDING: "NOT_WEDDING",
        UNSURE: "UNSURE",
        SKIP: "SKIP",
      };
      const decision = DIRECT[action];
      if (decision) submit(decision);
    },
    [current, venueInputOpen, dupInputOpen, submit]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const action = matchCandidateReviewKey(e);
      if (!action) return;
      if (action === "SKIP") e.preventDefault();
      act(action);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [act]);

  if (!current) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-medium text-gray-900">Queue complete</h1>
        <p className="text-sm text-gray-600">
          {progress.reviewed} / {progress.total} candidates reviewed. No more structural-v1 candidates
          in this queue.
        </p>
      </div>
    );
  }

  const venue = current.venue;
  const venueLabel = venue.vendor_name ?? venue.full_name ?? (venue.username ? `@${venue.username}` : "Unknown venue");
  const chicagoBadge = venue.chicago_status ? CHICAGO_BADGE[venue.chicago_status] : null;
  const vendorsByRole = current.vendors.reduce<Record<string, string[]>>((acc, v) => {
    (acc[v.role] ??= []).push(v.username);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          {progress.reviewed} / {progress.total} candidates reviewed
          {Object.keys(progress.by_decision).length > 0 && (
            <span className="ml-2 text-gray-400">
              (
              {Object.entries(progress.by_decision)
                .map(([d, n]) => `${d}:${n}`)
                .join(" · ")}
              )
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {pendingCount > 0 && <span title="Saving...">saving {pendingCount}</span>}
          {errorMsg && <span className="text-red-600">{errorMsg}</span>}
        </span>
      </div>

      <p className="mb-4 rounded-lg bg-black/[0.03] px-3 py-2 text-xs text-gray-600">
        <strong className="font-medium text-gray-800">Confirm</strong> = real wedding, this venue,
        Chicago. <strong className="font-medium text-gray-800">Wrong venue</strong> = real wedding,
        different venue. <strong className="font-medium text-gray-800">Duplicate</strong> = already a
        documented wedding. <strong className="font-medium text-gray-800">Not a wedding</strong> =
        shower/styled shoot/marketing/other event.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        {/* Left column: candidate card */}
        <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.07] bg-white p-4">
          <div>
            <div className="text-base font-medium text-gray-900">{venueLabel}</div>
            {venue.username && (
              <Link
                href={`/vendors/${venue.username}`}
                target="_blank"
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                @{venue.username}
              </Link>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {venue.venue_anchor_source && (
              <Badge className="bg-gray-100 text-gray-700">
                anchor: {ANCHOR_SOURCE_LABEL[venue.venue_anchor_source] ?? venue.venue_anchor_source}
              </Badge>
            )}
            {chicagoBadge && <Badge className={chicagoBadge.className}>{chicagoBadge.label}</Badge>}
            <Badge className="bg-gray-100 text-gray-700">
              {venue.current_wedding_count} documented wedding{venue.current_wedding_count === 1 ? "" : "s"}
            </Badge>
          </div>

          {venue.venue_anchor_conflict && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <div className="font-semibold">VENUE CONFLICT</div>
              <div className="mt-0.5">
                Also credited as venue:{" "}
                {current.other_venue_credits.length > 0
                  ? current.other_venue_credits.map((v) => `@${v.username}`).join(", ")
                  : "(no other resolved account found)"}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500">
            {formatDate(current.event_date_est) && <div>Event date (est): {formatDate(current.event_date_est)}</div>}
            {current.couple_guess && <div>Couple guess: {current.couple_guess}</div>}
          </div>

          {Object.keys(vendorsByRole).length > 0 && (
            <div className="text-xs text-gray-600">
              <div className="mb-1 font-medium text-gray-700">Other vendor credits</div>
              <ul className="space-y-0.5">
                {Object.entries(vendorsByRole).map(([role, usernames]) => (
                  <li key={role}>
                    <span className="text-gray-400">{role}:</span> {usernames.map((u) => `@${u}`).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {current.duplicate_hint && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-semibold">Possible duplicate ({current.duplicate_hint.tier.toLowerCase()})</div>
              <div className="mt-0.5">
                Wedding #{current.duplicate_hint.matched_wedding_id}
                {current.duplicate_hint.venue_username && ` at @${current.duplicate_hint.venue_username}`}
                {formatDate(current.duplicate_hint.event_date_est) &&
                  `, ${formatDate(current.duplicate_hint.event_date_est)}`}
              </div>
              {(current.duplicate_hint.date_delta_days != null || current.duplicate_hint.vendor_jaccard != null) && (
                <div className="mt-0.5 text-amber-700">
                  {current.duplicate_hint.date_delta_days != null && `${current.duplicate_hint.date_delta_days}d apart`}
                  {current.duplicate_hint.date_delta_days != null && current.duplicate_hint.vendor_jaccard != null && ", "}
                  {current.duplicate_hint.vendor_jaccard != null &&
                    `${Math.round(current.duplicate_hint.vendor_jaccard * 100)}% vendor overlap`}
                </div>
              )}
              {current.duplicate_hint.venue_username && (
                <Link
                  href={`/vendors/${current.duplicate_hint.venue_username}`}
                  target="_blank"
                  className="mt-1 inline-block text-amber-800 underline"
                >
                  View that vendor&rsquo;s page
                </Link>
              )}
            </div>
          )}

          <textarea
            ref={notesRef}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Optional note (Shift+N to focus)"
            rows={2}
            className="w-full resize-none rounded-xl border border-black/[0.08] px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-black/20 focus:outline-none"
          />

          {venueInputOpen && (
            <input
              ref={venueInputRef}
              type="text"
              value={venueInputValue}
              onChange={(e) => setVenueInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const handle = venueInputValue.trim().replace(/^@/, "");
                  if (handle) submit("WRONG_VENUE", { correctedVenueUsername: handle });
                } else if (e.key === "Escape") {
                  setVenueInputOpen(false);
                }
              }}
              placeholder="@correct_venue_handle, Enter to submit, Esc to cancel"
              className="w-full rounded-xl border border-black/[0.08] px-3 py-2 text-sm focus:border-black/20 focus:outline-none"
            />
          )}
          {dupInputOpen && (
            <input
              ref={dupInputRef}
              type="text"
              inputMode="numeric"
              value={dupInputValue}
              onChange={(e) => setDupInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const id = parseInt(dupInputValue.trim(), 10);
                  if (Number.isFinite(id)) submit("DUPLICATE", { duplicateOfWeddingId: id });
                } else if (e.key === "Escape") {
                  setDupInputOpen(false);
                }
              }}
              placeholder="existing wedding id, Enter to submit, Esc to cancel"
              className="w-full rounded-xl border border-black/[0.08] px-3 py-2 text-sm focus:border-black/20 focus:outline-none"
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <ActionButton label="Confirm" hint="C" tone="positive" onClick={() => submit("CONFIRM")} />
            <ActionButton label="Not a wedding" hint="N" tone="negative" onClick={() => submit("NOT_WEDDING")} />
            <ActionButton label="Wrong venue" hint="V" tone="neutral" onClick={() => act("WRONG_VENUE")} />
            <ActionButton label="Duplicate" hint="D" tone="neutral" onClick={() => act("DUPLICATE")} />
            <ActionButton label="Unsure" hint="U" tone="neutral" onClick={() => submit("UNSURE")} />
            <ActionButton label="Skip" hint="Space" tone="neutral" onClick={() => submit("SKIP")} />
          </div>
          <button
            type="button"
            onClick={() => act("BACK")}
            disabled={history.length === 0}
            className="text-xs text-gray-500 underline hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
          >
            Back — re-show previous (B)
          </button>
        </div>

        {/* Right column: this candidate's posts */}
        <div className="flex flex-col gap-4">
          {current.posts.map((post) => (
            <div key={post.post_url} className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
              <InstagramEmbed postUrl={post.post_url} maxWidth={420} />
              <div className="border-t border-black/[0.05] px-4 py-3 text-xs text-gray-600">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-500">
                  <span className="font-medium text-gray-900">@{post.owner_username ?? "unknown"}</span>
                  {formatDate(post.posted_at) && <span>{formatDate(post.posted_at)}</span>}
                  {post.location_tag && <span>📍 {post.location_tag}</span>}
                </div>
                {post.caption && <p className="whitespace-pre-line text-gray-800">{post.caption}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Off-screen prefetch of the next candidate's first post embed. */}
      {items[1]?.posts[0] && (
        <div className="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
          <InstagramEmbed postUrl={items[1].posts[0].post_url} maxWidth={420} />
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  hint,
  onClick,
  tone,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
      : tone === "negative"
        ? "bg-rose-600 hover:bg-rose-700 text-white"
        : "bg-black/[0.06] hover:bg-black/[0.1] text-gray-900";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${toneClass}`}
    >
      {label}
      <span className="text-[10px] font-normal opacity-70">{hint}</span>
    </button>
  );
}
