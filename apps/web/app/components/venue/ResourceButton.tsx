/**
 * Locked action-button size (golden-set-template.md §2, 2026-08-26):
 * `inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3
 * py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50`, 13px icon. Opens in a new tab.
 *
 * `variant="secondary"` (2026-09-18 review, matching the concept pages' `PageLightboxButton`/
 * `FloorPlanButton` secondary treatment): a grey pill for a space card's second/third action —
 * e.g. Diamond Garden's "Wedding videos" button next to its primary "Virtual tour" — so the
 * card header doesn't read as 3 equally-weighted rose CTAs.
 *
 * PUNCH LIST (Phase 5, per the plan's "must-nots as assertion fixtures" / non-goals list): the
 * template's locked format actually defaults every resource link to an in-page lightbox
 * (`ResourceLightboxButton` in the concept pages), checked per-URL for embeddability first. That
 * check (`checkResourceEmbeddability.ts`) doesn't exist yet for the generic pipeline, so every
 * resource here is a plain new-tab link until it lands — recorded as a gap, not silently dropped.
 */
import type { LucideIcon } from "lucide-react";

export function ResourceButton({ label, icon: Icon, url, variant = "primary" }: { label: string; icon: LucideIcon; url: string; variant?: "primary" | "secondary" }) {
  const className =
    variant === "primary"
      ? "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
      : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-200 hover:text-rose-500";
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      <Icon size={13} className={variant === "primary" ? "text-rose-400" : "text-gray-400"} />
      {label}
    </a>
  );
}
