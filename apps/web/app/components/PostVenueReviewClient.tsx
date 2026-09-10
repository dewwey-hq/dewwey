"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { embedUrl } from "./InstagramEmbed";
import { matchPostVenueReviewKey, type PostVenueReviewAction } from "@/lib/postVenueReviewKeyboard";
import type {
  PostVenueVerdict,
  PostReviewQueueItem,
  GroupVerdict,
  SpotCheckReport,
} from "@/lib/server/postVenueReview";

// Post-per-screen wedding-venue review (D055, 2026-09-08). Replaces the candidate-level
// CandidateReviewClient (0 decisions ever recorded there -- per the user, after trying it, "this
// ui is confusing... lets design something better for labeling"). Modeled directly on
// LabelingClient.tsx (the flow already used ~3,000 times at /label): same media-left/info-right
// split, same fire-and-forget submit with retry, same prefetch-ahead-of-5, same undo/back. The
// one addition is the venue context strip above the post -- this queue is venue-anchored, unlike
// plain /label, so the reviewer needs to see which venue a post is being checked against.

// Cropped IG embed -- same helper as LabelingClient.tsx's (not exported from there, so
// reimplemented here rather than importing a client component's internal).
function CroppedEmbed({ postUrl }: { postUrl: string }) {
  const src = embedUrl(postUrl, false);
  if (!src) return null;
  return (
    <iframe
      key={src}
      src={src}
      title="Instagram post"
      loading="lazy"
      scrolling="no"
      className="absolute inset-x-0 -top-[54px] h-[calc(100%+54px)] w-full bg-white"
    />
  );
}

interface Progress {
  posts_total: number;
  posts_reviewed: number;
  // D055: remaining (not-yet-verdicted) posts within the queue's eligibility filter, split by
  // chicago_status -- 0/0 in spot-check mode, where they're meaningless (see spotCheck below).
  remaining_confirmed: number;
  remaining_ambiguous: number;
  candidates_total: number;
  candidates_complete: number;
  by_verdict: Record<string, number>;
}

// D055: spot-check mode (?spotcheck=<reviewer>) — a blind random sample of posts `targetReviewer`
// already verdicted that the human hasn't touched yet. n is the sample size requested from the
// server (the actual served count may be smaller once posts run out).
interface SpotCheckMode {
  active: true;
  targetReviewer: string;
  n: number;
}

// Phase 2 (D055): direct-open mode (?post=<shortcode>[,<shortcode>...]) — a fixed, explicitly
// requested list of posts (a correction list), not the general queue. `requested` is the count of
// shortcodes parsed from the URL, which may exceed `initialItems.length` when a shortcode didn't
// resolve to a candidate post.
interface DirectMode {
  active: true;
  requested: number;
}

interface LastVerdict {
  item: PostReviewQueueItem;
  verdict: PostVenueVerdict;
  notes: string | null;
}

// D055 addendum (2026-09-08): reason chips for the N ("not a wedding") inline note flow -- the
// user's own words mid-review: "what if i want to leave a comment on n. like i just passed morgan
// mfg and it had styled wedding but i couldn't enter that." tag order matches the on-screen chip
// order (S/M/E/O), and the tag strings themselves are D049's vocabulary -- writing "styled_shoot"
// into notes is exactly the 'styl' substring D049's styled-shoot CONFIRMED bucket already matches
// on once this flows through syncHumanLabelsToGoldenSet.ts into golden_set.notes.
type ReasonTag = "styled_shoot" | "marketing" | "other_event" | "other";
const REASON_CHIPS: { tag: ReasonTag; hint: string; label: string }[] = [
  { tag: "styled_shoot", hint: "S", label: "Styled shoot" },
  { tag: "marketing", hint: "M", label: "Venue marketing" },
  { tag: "other_event", hint: "E", label: "Other event" },
  { tag: "other", hint: "O", label: "Other" },
];
const REASON_KEY_MAP: Record<string, ReasonTag> = { s: "styled_shoot", m: "marketing", e: "other_event", o: "other" };

// Phase 2 (D055): maps the Haiku reader's event_type (extractPrompt.ts's ExtractEventType) to the
// N-flow's reason chip, for pre-selecting a chip when the model already called this post
// NOT_WEDDING -- same "pre-select, never auto-submit" pattern as the D056 styled-signal
// pre-selection below. Anything without a direct chip (pre_wedding, unclear, or an unrecognized
// value) falls back to "other".
const MODEL_EVENT_TYPE_TO_CHIP: Partial<Record<string, ReasonTag>> = {
  styled_shoot: "styled_shoot",
  marketing: "marketing",
  other_event: "other_event",
};
function modelEventTypeToChip(eventType: string | null): ReasonTag {
  return (eventType && MODEL_EVENT_TYPE_TO_CHIP[eventType]) || "other";
}

// Letter shorthand for a verdict, matching the on-screen W/V/N/D/U hints -- used only for the
// "your current verdict" line in direct-open mode.
const VERDICT_LETTER: Record<PostVenueVerdict, string> = {
  THIS_VENUE: "W",
  OTHER_VENUE: "V",
  NOT_WEDDING: "N",
  DUPLICATE: "D",
  UNSURE: "U",
  SKIP: "Skip",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Same "fire and forget, retry a handful of times, never block advancing" pattern as
// LabelingClient's submitLabel / the old CandidateReviewClient's submitDecision.
async function submitVerdict(
  payload: {
    post_url: string;
    candidate_id: number;
    verdict: PostVenueVerdict;
    corrected_venue_username?: string | null;
    duplicate_of_wedding_id?: number | null;
    client_ms: number | null;
    notes?: string | null;
  },
  onSettled: (ok: boolean, error?: string) => void
) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/post-venue-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSettled(true);
        return;
      }
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

// D055 addendum #2 ("clear a whole group in one keystroke", Shift+W/Shift+X): unlike
// submitVerdict above, this is awaited (not fire-and-forget) -- the caller needs the server's
// `written` count before it can bump progress, since a group action can write more verdicts than
// are loaded client-side (siblings not yet prefetched into `items`). No retry loop: a bulk write
// that partially fails is worth surfacing immediately rather than silently retrying.
async function submitGroupVerdict(payload: {
  candidate_id: number;
  verdict: GroupVerdict;
}): Promise<{ ok: true; written: number; post_urls: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/post-venue-review/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error ?? "Failed to save group" };
    }
    return { ok: true, written: body.written ?? 0, post_urls: body.post_urls ?? [] };
  } catch {
    return { ok: false, error: "Failed to save group" };
  }
}

const ANCHOR_SOURCE_LABEL: Record<string, string> = {
  credit_line: "credit line",
  author: "author is the venue",
  location_tag: "IG location tag",
  inline_at: "caption mention",
  venue_hashtag: "venue hashtag",
};

// D050/D055: distinguishes a ceremony-site credit (church/parish/temple/etc, or a label that says
// "Ceremony" outright) from a plain "Venue"-type label -- same regex as the reception-priority
// ORDER BY in pipeline/schema.sql's credit_line_venue CTE, kept in sync deliberately. A post
// crediting both a reception (the anchor, per D050) and a ceremony site is a real, expected
// pair, not a conflict; two competing plain-"Venue" credits on one post still are.
const CEREMONY_LABEL_RE = /ceremony|church|parish|chapel|cathedral|temple|synagogue|mosque/i;
function isCeremonyLabel(label: string | null): boolean {
  return !!label && CEREMONY_LABEL_RE.test(label);
}

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

export function PostVenueReviewClient({
  initialItems,
  initialProgress,
  spotCheck,
  spotCheckReport,
  directMode,
}: {
  initialItems: PostReviewQueueItem[];
  initialProgress: Progress;
  // D055: present only when this page load is a blind spot-check (?spotcheck=<reviewer>).
  spotCheck?: SpotCheckMode;
  spotCheckReport?: SpotCheckReport;
  // Phase 2 (D055): present only when this page load is a direct-open correction list
  // (?post=<shortcode>[,...]).
  directMode?: DirectMode;
}) {
  const [items, setItems] = useState<PostReviewQueueItem[]>(initialItems);
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [lastVerdict, setLastVerdict] = useState<LastVerdict | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [venueInputOpen, setVenueInputOpen] = useState(false);
  const [venueInputValue, setVenueInputValue] = useState("");
  const [dupInputOpen, setDupInputOpen] = useState(false);
  const [dupInputValue, setDupInputValue] = useState("");
  // D055 addendum: the inline note box. "n" mode = the N-verdict reason-chip flow (opened by
  // pressing N, or clicking "Not a wedding"); "free" mode = the "/"-opened box that attaches to
  // whatever verdict is submitted next. Only one is ever open at a time.
  //
  // Isolation invariant (2026-09-08 fix): the N flow's reason/text state (noteReasonTag,
  // noteText while noteUiMode === "n") is cleared both on cancel (Esc, in handleNoteKeyDown
  // below) and after submit (in submit() itself) -- it never survives past the keystroke that
  // closed the N box. It is also a wholly separate piece of state from the "/"-opened free note
  // (noteUiMode === "free"): submit()'s pendingFreeNote fallback only reads noteText when
  // noteUiMode is "free", so a W/V/D/U/Space fired after an N-cancel can only carry a note if the
  // reviewer explicitly reopened one with "/" -- text typed and discarded under N can never leak
  // onto a later, different verdict.
  const [noteUiOpen, setNoteUiOpen] = useState(false);
  const [noteUiMode, setNoteUiMode] = useState<"n" | "free">("n");
  const [noteReasonTag, setNoteReasonTag] = useState<ReasonTag | null>(null);
  const [noteText, setNoteText] = useState("");
  // D055 addendum #2: the Shift+W/Shift+X "clear the rest of this group" toast. Separate from
  // errorMsg (which is sticky until the next action) -- this one self-clears.
  const [groupToast, setGroupToast] = useState<string | null>(null);

  const mountedAtRef = useRef<number>(0);
  const fetchingRef = useRef(false);
  const venueInputRef = useRef<HTMLInputElement | null>(null);
  const dupInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLInputElement | null>(null);

  const current = items[0] ?? null;
  const lookahead = items[1] ?? null;

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, [current?.post.post_url]);

  useEffect(() => {
    if (venueInputOpen) venueInputRef.current?.focus();
  }, [venueInputOpen]);
  useEffect(() => {
    if (dupInputOpen) dupInputRef.current?.focus();
  }, [dupInputOpen]);
  useEffect(() => {
    // Re-focuses on noteUiMode too, not just noteUiOpen -- N inheriting an already-open "free"
    // note box (see act()'s NOT_WEDDING branch) flips the mode without noteUiOpen itself changing.
    if (noteUiOpen) noteInputRef.current?.focus();
  }, [noteUiOpen, noteUiMode]);

  useEffect(() => {
    if (!groupToast) return;
    const t = setTimeout(() => setGroupToast(null), 4000);
    return () => clearTimeout(t);
  }, [groupToast]);

  const topUp = useCallback(async () => {
    // Phase 2 (D055): direct-open mode serves a fixed, explicitly requested list -- never top up
    // from the general queue or spot-check sample, so the "done" state below is reached instead.
    if (directMode?.active) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      // D055: in spot-check mode, top up from the same blind random sample, not the normal queue.
      const url = spotCheck?.active
        ? `/api/post-venue-review?spotcheck=${encodeURIComponent(spotCheck.targetReviewer)}&n=5`
        : "/api/post-venue-review?limit=5";
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { items: PostReviewQueueItem[] };
        setItems((prev) => {
          const existing = new Set(prev.map((p) => p.post.post_url));
          const fresh = data.items.filter((i) => !existing.has(i.post.post_url));
          return [...prev, ...fresh];
        });
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [spotCheck, directMode]);

  useEffect(() => {
    if (items.length < 3) void topUp();
  }, [items.length, topUp]);

  const submit = useCallback(
    (
      verdict: PostVenueVerdict,
      extra?: { correctedVenueUsername?: string; duplicateOfWeddingId?: number },
      // D055 addendum: an explicit override (the N chip flow's Enter/Esc, which always knows
      // exactly what notes -- if any -- it wants, including deliberately null) always wins.
      // undefined means "no override" -- fall back to whatever's pending in a "/"-opened free
      // note box, so a note typed before pressing W/V/D/U/Space still attaches.
      notesOverride?: string | null
    ) => {
      if (!current) return;
      const clientMs = Date.now() - mountedAtRef.current;
      const submitted = current;

      const pendingFreeNote =
        noteUiOpen && noteUiMode === "free" && noteText.trim().length > 0 ? noteText.trim() : null;
      const notes = notesOverride !== undefined ? notesOverride : pendingFreeNote;

      setItems((prev) => prev.slice(1));
      setLastVerdict({ item: submitted, verdict, notes });
      setProgress((p) => ({
        ...p,
        posts_reviewed: p.posts_reviewed + 1,
        by_verdict: { ...p.by_verdict, [verdict]: (p.by_verdict[verdict] ?? 0) + 1 },
      }));
      setPendingCount((n) => n + 1);
      setVenueInputOpen(false);
      setDupInputOpen(false);
      setNoteUiOpen(false);
      setNoteText("");
      setNoteReasonTag(null);
      setErrorMsg(null);

      void submitVerdict(
        {
          post_url: submitted.post.post_url,
          candidate_id: submitted.group.candidate_id,
          verdict,
          corrected_venue_username: extra?.correctedVenueUsername ?? null,
          duplicate_of_wedding_id: extra?.duplicateOfWeddingId ?? null,
          client_ms: clientMs,
          notes,
        },
        (ok, error) => {
          setPendingCount((n) => Math.max(0, n - 1));
          if (!ok) setErrorMsg(error ?? "Failed to save");
        }
      );
    },
    [current, noteUiOpen, noteUiMode, noteText]
  );

  // D055 addendum #2 ("clear a whole group in one keystroke", Shift+W/Shift+X): applies `verdict`
  // to every not-yet-reviewed post sharing the current post's candidate_id. Local removal is
  // optimistic (fires before the request resolves); the progress bump and toast wait for the
  // server's `written` count, since the group can include sibling posts never prefetched into
  // `items` -- there's no local count to trust in advance. On failure, the removed items are
  // restored (best effort) and lastVerdict is left untouched (no group-level "Back" state; see
  // the header comment for why B stays single-post-only here).
  const submitGroup = useCallback(
    (verdict: GroupVerdict) => {
      if (!current || current.group.size <= 1) return;
      const candidateId = current.group.candidate_id;
      const submitted = current;
      const removed = items.filter((it) => it.group.candidate_id === candidateId);

      setItems((prev) => prev.filter((it) => it.group.candidate_id !== candidateId));
      // Reuses the single-post Back mechanism: B re-shows just the post that was on screen when
      // the shortcut fired, not the whole group (see file header comment for why).
      setLastVerdict({ item: submitted, verdict, notes: null });
      setVenueInputOpen(false);
      setDupInputOpen(false);
      setNoteUiOpen(false);
      setNoteText("");
      setNoteReasonTag(null);
      setErrorMsg(null);
      setPendingCount((n) => n + 1);

      void submitGroupVerdict({ candidate_id: candidateId, verdict }).then((res) => {
        setPendingCount((n) => Math.max(0, n - 1));
        if (!res.ok) {
          setItems((prev) => [...removed, ...prev]);
          setErrorMsg(res.error);
          return;
        }
        setProgress((p) => ({
          ...p,
          posts_reviewed: p.posts_reviewed + res.written,
          by_verdict: { ...p.by_verdict, [verdict]: (p.by_verdict[verdict] ?? 0) + res.written },
        }));
        setGroupToast(`Marked ${res.written} post${res.written === 1 ? "" : "s"} as ${verdict}`);
      });
    },
    [current, items]
  );

  const act = useCallback(
    (action: PostVenueReviewAction) => {
      if (action === "BACK") {
        if (!lastVerdict) return;
        setItems((prev) => [lastVerdict.item, ...prev]);
        setLastVerdict(null);
        setProgress((p) => ({ ...p, posts_reviewed: Math.max(0, p.posts_reviewed - 1) }));
        setVenueInputOpen(false);
        setDupInputOpen(false);
        setNoteUiOpen(false);
        setNoteText("");
        setNoteReasonTag(null);
        return;
      }
      if (!current) return;

      // D055 addendum: "/" toggles the free note box -- opening it cancels any in-progress venue
      // input (mirrors OTHER_VENUE/DUPLICATE below), closing it abandons whatever was typed.
      if (action === "NOTE_TOGGLE") {
        if (noteUiOpen) {
          setNoteUiOpen(false);
          setNoteText("");
          setNoteReasonTag(null);
        } else {
          setVenueInputOpen(false);
          setDupInputOpen(false);
          setNoteUiMode("free");
          setNoteUiOpen(true);
          setNoteText("");
          setNoteReasonTag(null);
        }
        return;
      }

      // D055 addendum: N no longer submits immediately -- it opens the reason-chip note UI.
      // Enter (in the input's onKeyDown below) submits NOT_WEDDING with whatever reason/text was
      // entered; Esc cancels -- submits nothing and discards them (2026-09-08 fix: Esc used to
      // submit NOT_WEDDING with no note, so there was no way to back out of N once opened --
      // plain N is now "N, Enter" only). If a "/" free note was already pending, its text is
      // inherited rather than thrown away -- noteText is deliberately left untouched here.
      //
      // D056 addendum: when the current post carries the styled-shoot signal (Models credit or a
      // styled/style-shoot phrase -- see the amber badge above the caption), the S ("Styled
      // shoot") reason chip is pre-selected rather than starting from no reason -- the user's own
      // motivating example for this signal was exactly this flow ("clearly this is styled shoot"
      // on an N-bound post). Still just a pre-selection: any other chip, or plain typing, still
      // overrides it before Enter submits.
      if (action === "NOT_WEDDING") {
        setVenueInputOpen(false);
        setDupInputOpen(false);
        setNoteUiMode("n");
        setNoteUiOpen(true);
        // Phase 2 (D055): when the model already called this post NOT_WEDDING, its event_type
        // wins the pre-selection (more specific than the styled-shoot signal alone); otherwise
        // fall back to the existing D056 styled-signal pre-selection.
        const modelPreselect =
          current.model && current.model.verdict === "NOT_WEDDING"
            ? modelEventTypeToChip(current.model.event_type)
            : null;
        setNoteReasonTag(modelPreselect ?? (current.styled_signal === "LIKELY" ? "styled_shoot" : null));
        return;
      }

      if (action === "OTHER_VENUE") {
        if (!venueInputOpen) {
          // Abandon an in-progress N reason-chip flow, but leave a "/" free note pending --
          // submit() (called when this new venue input's own Enter fires) still picks it up.
          if (noteUiMode === "n") {
            setNoteUiOpen(false);
            setNoteText("");
            setNoteReasonTag(null);
          }
          setDupInputOpen(false);
          setVenueInputValue("");
          setVenueInputOpen(true);
        }
        return;
      }
      if (action === "DUPLICATE") {
        if (!dupInputOpen) {
          if (noteUiMode === "n") {
            setNoteUiOpen(false);
            setNoteText("");
            setNoteReasonTag(null);
          }
          setVenueInputOpen(false);
          setDupInputValue(current.duplicate_hint ? String(current.duplicate_hint.matched_wedding_id) : "");
          setDupInputOpen(true);
        }
        return;
      }
      // D055 addendum #2: no-ops when the current post isn't part of a merged group (size 1) --
      // there's nothing to clear beyond the post already handled by W/N.
      if (action === "GROUP_THIS_VENUE" || action === "GROUP_NOT_WEDDING") {
        if (current.group.size <= 1) return;
        submitGroup(action === "GROUP_THIS_VENUE" ? "THIS_VENUE" : "NOT_WEDDING");
        return;
      }

      const DIRECT: Partial<Record<PostVenueReviewAction, PostVenueVerdict>> = {
        THIS_VENUE: "THIS_VENUE",
        UNSURE: "UNSURE",
        SKIP: "SKIP",
      };
      const verdict = DIRECT[action];
      if (verdict) submit(verdict);
    },
    [current, lastVerdict, venueInputOpen, dupInputOpen, noteUiOpen, noteUiMode, submit, submitGroup]
  );

  // D055 addendum: keydown handler for the note textbox itself (both modes) -- kept separate from
  // the global window-level handler (matchPostVenueReviewKey) the same way venueInputRef/
  // dupInputRef's own onKeyDown are, since Enter/Escape here mean something different per mode.
  const handleNoteKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (noteUiMode === "n") {
        // Reason-chip hotkeys, but ONLY while the box is still empty -- once the reviewer starts
        // typing, s/m/e/o must type literally (e.g. a note starting with "styled" or "small").
        if (noteText.length === 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const tag = REASON_KEY_MAP[e.key.toLowerCase()];
          if (tag) {
            e.preventDefault();
            setNoteReasonTag(tag);
            return;
          }
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const text = noteText.trim();
          const notes = noteReasonTag ? noteReasonTag + (text ? `: ${text}` : "") : text || null;
          submit("NOT_WEDDING", undefined, notes);
        } else if (e.key === "Escape") {
          // Esc cancels the N flow outright -- it must never submit NOT_WEDDING (mirrors
          // venueInputRef/dupInputRef's own Esc-to-cancel below). Discards the reason tag and
          // note text immediately rather than leaving them for the next open, so a verdict
          // submitted right after (W/V/D/U/Space) can't inherit them -- see the isolation
          // invariant on the noteUiOpen state declaration above.
          e.preventDefault();
          setNoteUiOpen(false);
          setNoteText("");
          setNoteReasonTag(null);
        }
        return;
      }
      // "free" mode: Enter confirms and blurs (so window-level letter keys resume reaching the
      // global handler) without submitting anything itself -- whatever's typed attaches to
      // whichever verdict gets submitted next, per submit()'s pendingFreeNote fallback. Escape
      // cancels outright, same convention as venueInputRef/dupInputRef.
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setNoteUiOpen(false);
        setNoteText("");
      }
    },
    [noteUiMode, noteText, noteReasonTag, submit]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const action = matchPostVenueReviewKey(e);
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
        <h1 className="text-lg font-medium text-gray-900">
          {directMode?.active ? "Done" : spotCheck?.active ? "Spot-check sample complete" : "Queue complete"}
        </h1>
        {directMode?.active ? (
          <p className="text-sm text-gray-600">
            {progress.posts_reviewed} of {directMode.requested} requested post
            {directMode.requested === 1 ? "" : "s"} reviewed.
          </p>
        ) : spotCheck?.active ? (
          <p className="text-sm text-gray-600">
            {progress.posts_reviewed} post{progress.posts_reviewed === 1 ? "" : "s"} spot-checked
            against @{spotCheck.targetReviewer}&apos;s verdicts. No more sampled posts left.
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            {progress.posts_reviewed} / {progress.posts_total} posts reviewed ·{" "}
            {progress.candidates_complete} / {progress.candidates_total} candidates complete. No
            more structural-v2 posts in this queue.
          </p>
        )}
        {spotCheckReport && (
          <SpotCheckReportPanel report={spotCheckReport} />
        )}
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

  // D050/D055: the anchor's own credit-line label ("Reception", "Venue", ...) when it has one,
  // else a human name for whichever non-credit-line source anchored it (author / location tag /
  // inline mention / hashtag) -- same fallback the existing anchor-source badge below uses.
  const anchorLabelText =
    venue.anchor_label ??
    (venue.venue_anchor_source ? (ANCHOR_SOURCE_LABEL[venue.venue_anchor_source] ?? venue.venue_anchor_source) : null);

  // A post can legitimately credit both a reception (the anchor, per D050) and a ceremony site --
  // that's not a conflict, it's the expected shape. Only treat it as a real conflict when at least
  // one of the OTHER credited venues is itself a plain "Venue"-type label (i.e. also ambiguous,
  // not identifiably a ceremony site) -- two competing "Venue:" lines with no way to tell them
  // apart.
  const ceremonyCredits = current.other_venue_credits.filter((v) => isCeremonyLabel(v.label));
  const nonCeremonyCredits = current.other_venue_credits.filter((v) => !isCeremonyLabel(v.label));
  // Still shows the conflict badge (with its existing "no other resolved account found" fallback)
  // when other_venue_credits came back empty entirely -- that's a handle-resolution miss, not a
  // confirmed ceremony+reception pair, so it must not silently disappear.
  const showConflictBadge =
    venue.venue_anchor_conflict && (nonCeremonyCredits.length > 0 || current.other_venue_credits.length === 0);
  const showAlsoCredited = !showConflictBadge && ceremonyCredits.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span className="flex items-center">
          {spotCheck?.active && (
            <Badge className="mr-2 bg-purple-100 text-purple-800">SPOT-CHECK</Badge>
          )}
          {spotCheck?.active ? (
            <>
              {progress.posts_reviewed} / {spotCheck.n} spot-checked
            </>
          ) : (
            <>
              {progress.posts_reviewed} / {progress.posts_total} posts reviewed
              <span className="ml-2 text-gray-400">
                ({progress.remaining_confirmed} confirmed + {progress.remaining_ambiguous} ambiguous
                remaining)
              </span>
              <span className="ml-2 text-gray-400">
                ({progress.candidates_complete} / {progress.candidates_total} candidates complete)
              </span>
            </>
          )}
          {Object.keys(progress.by_verdict).length > 0 && (
            <span className="ml-2 text-gray-400">
              (
              {Object.entries(progress.by_verdict)
                .map(([v, n]) => `${v}:${n}`)
                .join(" · ")}
              )
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {pendingCount > 0 && <span title="Saving...">saving {pendingCount}</span>}
          {groupToast && <span className="text-emerald-700">{groupToast}</span>}
          {errorMsg && <span className="text-red-600">{errorMsg}</span>}
          <Link href="/label" className="text-gray-500 underline hover:text-gray-900">
            ← Post label queue
          </Link>
        </span>
      </div>

      <p className="mb-3 rounded-lg bg-black/[0.03] px-3 py-2 text-xs text-gray-600">
        <strong className="font-medium text-gray-800">W</strong> = real wedding; anchor is the
        reception venue when both are listed — the ceremony site is credited automatically.{" "}
        <strong className="font-medium text-gray-800">V</strong> = real wedding, other
        venue. <strong className="font-medium text-gray-800">D</strong> = already a documented
        wedding. <strong className="font-medium text-gray-800">N</strong> = shower / styled shoot /
        marketing / other event (opens an optional reason + note — Enter to submit, Esc to
        cancel).{" "}
        <strong className="font-medium text-gray-800">/</strong> = add a note for the next verdict.
      </p>

      {/* Venue context strip -- this queue is venue-anchored, unlike plain /label, so the
          reviewer needs the venue's identity/status in view before judging the post below it. */}
      <div className="mb-3 rounded-2xl border border-black/[0.07] bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-sm font-medium text-gray-900">
              {anchorLabelText && <strong className="mr-1 font-semibold text-gray-900">{anchorLabelText}</strong>}
              {venueLabel}
              <span className="ml-1 text-xs font-normal text-gray-400">(anchor)</span>
            </span>
            {venue.username && (
              <Link
                href={`/vendors/${venue.username}`}
                target="_blank"
                className="ml-2 text-xs text-gray-500 hover:text-gray-900"
              >
                @{venue.username}
              </Link>
            )}
            {/* Phase 2 (D055): direct-open mode only -- the human's own latest verdict on this
                exact post, so they know what they're overriding. Never another reviewer's. */}
            {current.your_verdict != null && (
              <span className="ml-2 text-xs text-gray-400">
                your current verdict: {VERDICT_LETTER[current.your_verdict]}
              </span>
            )}
            {/* Split-handle nudge (scripts/graph/findVenueAliasCandidates.ts, T1/T2, not yet in
                account_aliases -- see loadAliasHints in lib/server/postVenueReview.ts). Muted so
                it doesn't compete with the venue identity line above it; no keyboard action, no
                verdict semantics -- purely a "go look at this" hint. */}
            {venue.alias_hints.length > 0 && (
              <div className="mt-0.5 text-xs text-amber-700">
                {venue.alias_hints
                  .map((h) => `possible alias: @${h.other} (${h.signals.join(", ")})`)
                  .join(" · ")}
              </div>
            )}
          </div>
          {current.group.size > 1 && (
            <span className="text-xs text-gray-500">
              Post {current.group.index} of {current.group.size} in this group
              <span className="ml-2 text-gray-400">
                (<strong className="font-medium text-gray-600">Shift+W</strong> this venue, rest of group ·{" "}
                <strong className="font-medium text-gray-600">Shift+X</strong> not wedding, rest of group)
              </span>
            </span>
          )}
        </div>
        {/* Phase 2 (D055): the Haiku reader's (scripts/classify/runExtract.ts) opinion on this
            post, when it's already been read -- shown so the human sees what the model thought
            before deciding. Never auto-submitted; see the N-flow pre-selection above for the one
            place this feeds back into the UI. */}
        {current.model && (
          <div className="mt-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <div className="font-semibold">
              MODEL: {current.model.verdict}
              {current.model.confidence != null && ` ${Math.round(current.model.confidence * 100)}%`}
              {current.model.event_type && ` · ${current.model.event_type}`}
            </div>
            {current.model.evidence && (
              <div className="mt-0.5 text-sky-700">&ldquo;{current.model.evidence}&rdquo;</div>
            )}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {venue.venue_anchor_source && (
            <Badge className="bg-gray-100 text-gray-700">
              anchor: {ANCHOR_SOURCE_LABEL[venue.venue_anchor_source] ?? venue.venue_anchor_source}
            </Badge>
          )}
          {chicagoBadge && <Badge className={chicagoBadge.className}>{chicagoBadge.label}</Badge>}
          <Badge className="bg-gray-100 text-gray-700">
            {venue.current_wedding_count} documented wedding{venue.current_wedding_count === 1 ? "" : "s"} today ·
            bucket {venue.coverage_bucket}
          </Badge>
        </div>
        {showConflictBadge && (
          <div className="mt-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <div className="font-semibold">VENUE CONFLICT</div>
            <div className="mt-0.5">
              Also credited as venue on this post:{" "}
              {nonCeremonyCredits.length > 0
                ? nonCeremonyCredits.map((v) => (v.label ? `${v.label} @${v.username}` : `@${v.username}`)).join(", ")
                : "(no other resolved account found)"}
            </div>
          </div>
        )}
        {showAlsoCredited && (
          <div className="mt-1.5 text-xs text-gray-600">
            {ceremonyCredits.map((v) => `${v.label} @${v.username} — also credited`).join(" · ")}
          </div>
        )}
        {(current.couple_guess || Object.keys(vendorsByRole).length > 0) && (
          <div className="mt-1.5 text-xs text-gray-500">
            {current.couple_guess && <div>Couple guess: {current.couple_guess}</div>}
            {Object.keys(vendorsByRole).length > 0 && (
              <div className="mt-0.5">
                Other vendor credits on this post:{" "}
                {Object.entries(vendorsByRole)
                  .map(([role, usernames]) => `${role}: ${usernames.map((u) => `@${u}`).join(", ")}`)
                  .join(" · ")}
              </div>
            )}
          </div>
        )}
        {current.duplicate_hint && (
          <div className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
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
          </div>
        )}
      </div>

      {/* Post left, info+controls right -- same split /weddings and LabelingClient use, so
          everything is visible without scrolling the page. See LabelingClient.tsx's own comment
          for why this is flex (not grid): a long caption must scroll inside the info column
          rather than pushing the buttons off-screen. */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white md:flex md:h-[600px]">
        <div className="relative h-[380px] flex-shrink-0 overflow-hidden border-b border-black/[0.05] bg-black/[0.02] md:h-full md:w-[380px] md:border-b-0 md:border-r">
          <CroppedEmbed key={current.post.post_url} postUrl={current.post.post_url} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col md:h-full">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-black/[0.05] px-4 py-3 text-xs text-gray-500">
            <span className="font-medium text-gray-900">@{current.post.owner_username ?? "unknown"}</span>
            {formatDate(current.post.posted_at) && <span>{formatDate(current.post.posted_at)}</span>}
            {current.post.location_tag && <span>📍 {current.post.location_tag}</span>}
            <a
              href={current.post.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-400 hover:text-gray-900"
            >
              Open on IG
            </a>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {/* D056: a Models-credit or styled/style-shoot phrase in this post's own caption
                (pipeline/schema.sql's post_styled_shoot_signal view, computed inline here -- see
                styledSignalSql in lib/server/postVenueReview.ts). Shown above the caption, not
                just implied by an N-flow chip, so the reviewer sees it before deciding at all. */}
            {current.styled_signal === "LIKELY" && (
              <div className="mb-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
                STYLED-SHOOT SIGNAL — Models credited / styled shoot phrase
              </div>
            )}
            {current.post.caption && (
              <p className="whitespace-pre-line text-sm text-gray-800">{current.post.caption}</p>
            )}
          </div>

          <div className="border-t border-black/[0.05] px-4 py-3">
            {noteUiOpen && (
              <div className="mb-2">
                {noteUiMode === "n" && (
                  <>
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {REASON_CHIPS.map((c) => (
                        <button
                          key={c.tag}
                          type="button"
                          onClick={() => {
                            setNoteReasonTag(c.tag);
                            noteInputRef.current?.focus();
                          }}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            noteReasonTag === c.tag
                              ? "bg-gray-900 text-white"
                              : "bg-black/[0.06] text-gray-700 hover:bg-black/[0.1]"
                          }`}
                        >
                          {c.hint} {c.label}
                        </button>
                      ))}
                    </div>
                    <p className="mb-1.5 text-[11px] text-gray-400">
                      Enter = submit Not a wedding · Esc = cancel
                    </p>
                  </>
                )}
                <input
                  ref={noteInputRef}
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={handleNoteKeyDown}
                  placeholder={
                    noteUiMode === "n"
                      ? "optional note — Enter to submit, Esc to cancel"
                      : "note for the next verdict — Enter to confirm, Esc to cancel"
                  }
                  className="w-full rounded-xl border border-black/[0.08] px-3 py-2 text-sm focus:border-black/20 focus:outline-none"
                />
              </div>
            )}
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
                    submit("OTHER_VENUE", handle ? { correctedVenueUsername: handle } : undefined);
                  } else if (e.key === "Escape") {
                    setVenueInputOpen(false);
                  }
                }}
                placeholder="@correct_venue_handle (optional), Enter to submit, Esc to cancel"
                className="mb-2 w-full rounded-xl border border-black/[0.08] px-3 py-2 text-sm focus:border-black/20 focus:outline-none"
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
                className="mb-2 w-full rounded-xl border border-black/[0.08] px-3 py-2 text-sm focus:border-black/20 focus:outline-none"
              />
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ReviewButton label="This venue" hint="W" onClick={() => submit("THIS_VENUE")} tone="positive" />
              <ReviewButton label="Not a wedding" hint="N" onClick={() => act("NOT_WEDDING")} tone="negative" />
              <ReviewButton label="Other venue" hint="V" onClick={() => act("OTHER_VENUE")} tone="neutral" />
              <ReviewButton label="Duplicate" hint="D" onClick={() => act("DUPLICATE")} tone="neutral" />
              <ReviewButton label="Unsure" hint="U" onClick={() => submit("UNSURE")} tone="neutral" />
              <ReviewButton label="Skip" hint="Space" onClick={() => submit("SKIP")} tone="neutral" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              {lastVerdict?.notes && (
                <span className="min-w-0 truncate text-gray-400" title={lastVerdict.notes}>
                  note: {lastVerdict.notes}
                </span>
              )}
              <button
                type="button"
                onClick={() => act("BACK")}
                disabled={!lastVerdict}
                className="ml-auto shrink-0 text-gray-500 underline hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Back — re-show previous (B)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Off-screen prefetch: mounting the next item's iframe now means its request is already
          in flight by the time it's shown. */}
      {lookahead && (
        <div className="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
          <div className="relative h-[380px] w-[380px]">
            <CroppedEmbed key={lookahead.post.post_url} postUrl={lookahead.post.post_url} />
          </div>
        </div>
      )}

      {/* D055: agreement-so-far panel, computed once at page load (not live-updated as the
          human keeps spot-checking this session -- reload to refresh). */}
      {spotCheckReport && <SpotCheckReportPanel report={spotCheckReport} />}
    </div>
  );
}

// D055: renders SpotCheckReport.text (already formatted server-side, see
// formatSpotCheckReportText in lib/server/postVenueReview.ts) as a small monospace panel --
// appears both mid-session (below the review card) and on the "sample complete" empty state.
function SpotCheckReportPanel({ report }: { report: SpotCheckReport }) {
  return (
    <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-3 text-left">
      <div className="mb-1.5 text-xs font-semibold text-gray-700">
        Agreement so far: {report.reviewer} vs {report.human_reviewer} ({report.total_paired} paired
        post{report.total_paired === 1 ? "" : "s"}
        {report.agreement_pct != null ? `, ${report.agreement_pct}% agree` : ""})
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre text-[11px] leading-relaxed text-gray-600">
        {report.text}
      </pre>
    </div>
  );
}

function ReviewButton({
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
