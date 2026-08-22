import Image from "next/image";

const CATEGORY_ICONS: Record<string, string> = {
  venue: "/icons/wedding-location-svgrepo-com.svg",
  wedding_venue: "/icons/wedding-location-svgrepo-com.svg",
  event_venue: "/icons/wedding-location-svgrepo-com.svg",
  banquet_hall: "/icons/wedding-location-svgrepo-com.svg",
  historical_landmark: "/icons/wedding-location-svgrepo-com.svg",
  hotel: "/icons/wedding-location-svgrepo-com.svg",
  caterer: "/icons/tray-plate-svgrepo-com.svg",
  florist: "/icons/bouquet-svgrepo-com.svg",
  photographer: "/icons/photo-camera-photograph-svgrepo-com.svg",
  dj_music: "/icons/music-svgrepo-com.svg",
  hair_makeup: "/icons/make-up-svgrepo-com.svg",
};

export function resolveCategoryIcon(
  category: string | null,
  primaryType?: string | null,
): string {
  if (category && CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  if (primaryType && CATEGORY_ICONS[primaryType]) return CATEGORY_ICONS[primaryType];
  return "/icons/wedding-location-svgrepo-com.svg";
}

export default function CategoryIcon({
  category,
  primaryType,
  size = 36,
  large = false,
  compact = false,
}: {
  category?: string | null;
  primaryType?: string | null;
  size?: number;
  large?: boolean;
  compact?: boolean;
}) {
  const src = resolveCategoryIcon(category ?? null, primaryType);
  const imgSize = large ? 48 : compact ? 18 : size;

  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-black/[0.08] bg-[#fdf8f5] ${
        large
          ? "w-[4.5rem] self-stretch rounded-2xl"
          : compact
            ? "h-7 w-7 rounded-lg"
            : "h-14 w-14 rounded-2xl"
      }`}
    >
      <Image src={src} alt="" width={imgSize} height={imgSize} className="object-contain" />
    </div>
  );
}
