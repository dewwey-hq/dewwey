/**
 * Locked action-button size (golden-set-template.md §2, 2026-08-26):
 * `inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3
 * py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50`, 13px icon. Opens in a new tab.
 *
 * PUNCH LIST (Phase 5, per the plan's "must-nots as assertion fixtures" / non-goals list): the
 * template's locked format actually defaults every resource link to an in-page lightbox
 * (`ResourceLightboxButton` in the concept pages), checked per-URL for embeddability first. That
 * check (`checkResourceEmbeddability.ts`) doesn't exist yet for the generic pipeline, so every
 * resource here is a plain new-tab link until it lands — recorded as a gap, not silently dropped.
 */
import type { LucideIcon } from "lucide-react";

export function ResourceButton({ label, icon: Icon, url }: { label: string; icon: LucideIcon; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
    >
      <Icon size={13} className="text-rose-400" />
      {label}
    </a>
  );
}
