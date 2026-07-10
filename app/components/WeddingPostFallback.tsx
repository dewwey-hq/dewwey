"use client";

type WeddingPostFallbackProps = {
  postUrl: string;
  height?: number;
  maxWidth?: number;
  compact?: boolean;
  className?: string;
  /** When "display", renders non-interactive chrome for use inside clickable cards. */
  variant?: "link" | "display";
  onClick?: (e: React.MouseEvent) => void;
};

function InstagramCta({ className }: { className?: string }) {
  return (
    <span
      className={
        className ??
        "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white/95 px-3 py-2 text-[11px] font-medium text-gray-700 shadow-sm backdrop-blur-sm"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/instagram-glyph.svg" alt="" className="h-3.5 w-3.5 opacity-70" />
      View Instagram Post
    </span>
  );
}

export default function WeddingPostFallback({
  postUrl,
  height,
  maxWidth,
  compact,
  className,
  variant = "link",
  onClick,
}: WeddingPostFallbackProps) {
  const iconSize = compact ? "h-28 w-28 sm:h-32 sm:w-32" : "h-32 w-32";
  const baseClass =
    "instagram-post-card flex h-full min-h-0 w-full flex-col overflow-hidden bg-gradient-to-b from-rose-50/95 to-[#fdf8f5]";

  const content = (
    <>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/newlyweds-wedding-svgrepo-com.svg"
          alt=""
          className={`${iconSize} shrink-0 opacity-85`}
        />
      </div>
      <div className="shrink-0 px-3 pb-3 pt-2">
        <InstagramCta />
      </div>
    </>
  );

  const style = { height, maxWidth: compact ? maxWidth : undefined };

  if (variant === "display") {
    return (
      <div
        className={className ? `${baseClass} ${className}` : baseClass}
        style={style}
        aria-hidden
      >
        {content}
      </div>
    );
  }

  return (
    <a
      href={postUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className ? `${baseClass} ${className}` : baseClass}
      style={style}
      onClick={(e) => {
        onClick?.(e);
        e.stopPropagation();
      }}
    >
      {content}
    </a>
  );
}
