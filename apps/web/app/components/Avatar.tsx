/** IG avatar from R2, falling back to the name's initial. */
export function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        style={style}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover bg-black/[0.05] ${className}`}
      />
    );
  }
  return (
    <div
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-black/[0.04] font-medium text-gray-600 ${className}`}
      aria-hidden
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}
