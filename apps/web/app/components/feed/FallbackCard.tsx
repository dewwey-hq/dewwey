import { InstagramLogo } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/app/components/Avatar";

/** Design principle 5: "failure is a card, not a hole" — same responsive footprint as
 * `InstagramPostEmbed` (100% width, capped at `maxWidth`), shown for a blocked owner, a
 * load timeout, or (from a variant) when `coverPost()` found nothing embeddable at all.
 * Never renders Instagram's own error text or a white box. D058 compliance pass
 * (2026-09-11): no fixed square crop — a real embed's height varies with its media, so
 * the fallback uses a plain portrait aspect instead of pretending to match a crop that no
 * longer exists. */
export function excerptCaption(caption: string | null | undefined, max = 160): string | null {
  if (!caption) return null;
  const trimmed = caption.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export function FallbackCard({
  maxWidth = 540,
  ownerName,
  ownerUsername,
  ownerAvatarUrl,
  title,
  caption,
  postUrl,
  reason = "none",
  className,
}: {
  maxWidth?: number;
  ownerName: string | null;
  ownerUsername: string | null;
  ownerAvatarUrl: string | null;
  title: string | null;
  caption: string | null;
  postUrl: string | null;
  /** Why there's no embed here — a small note, never Instagram's own error text. */
  reason?: "blocked" | "timeout" | "none";
  className?: string;
}) {
  const excerpt = excerptCaption(caption);
  const noteByReason: Record<typeof reason, string> = {
    blocked: "This account doesn't allow embeds.",
    timeout: "This post is taking a while to load.",
    none: "This post isn't available to preview.",
  };

  return (
    <div
      className={`mx-auto flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-xl border border-black/[0.07] bg-black/[0.02] p-4 ${className ?? ""}`}
      style={{ maxWidth, minWidth: Math.min(maxWidth, 260) }}
    >
      <div className="flex items-center gap-2">
        <Avatar
          src={ownerAvatarUrl}
          name={ownerName ?? ownerUsername ?? "?"}
          size={28}
          className="text-xs"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">
            {ownerName ?? ownerUsername ?? "Unknown"}
          </p>
          {ownerUsername && (
            <p className="truncate text-xs text-black/[0.45]">@{ownerUsername}</p>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden py-2">
        {title && <p className="text-sm font-medium text-gray-900">{title}</p>}
        {excerpt ? (
          <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-black/[0.56]">{excerpt}</p>
        ) : (
          <p className="mt-1 text-xs text-black/[0.45]">{noteByReason[reason]}</p>
        )}
      </div>
      {postUrl ? (
        <a
          href={postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white py-2 text-xs font-medium text-gray-700 transition-colors hover:border-black/[0.2]"
        >
          <InstagramLogo size={13} />
          Open on Instagram
        </a>
      ) : (
        <p className="text-center text-[11px] text-black/[0.35]">No linkable post</p>
      )}
    </div>
  );
}
