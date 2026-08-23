import {
  Buildings,
  ForkKnife,
  Flower,
  Camera,
  MusicNotes,
  HairDryer,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

const CATEGORY_GLYPHS: Record<string, Icon> = {
  // vendor_role values
  venue: Buildings,
  hotel: Buildings,
  florist: Flower,
  photographer: Camera,
  dj: MusicNotes,
  band: MusicNotes,
  musician: MusicNotes,
  hair: HairDryer,
  makeup: HairDryer,
  catering: ForkKnife,
  cake: ForkKnife,
  // Places primary types
  wedding_venue: Buildings,
  event_venue: Buildings,
  banquet_hall: Buildings,
  historical_landmark: Buildings,
  caterer: ForkKnife,
};

/** Phosphor glyph for a vendor category; falls back to the venue glyph. */
export function categoryGlyph(
  category: string | null,
  primaryType?: string | null,
): Icon {
  if (category && CATEGORY_GLYPHS[category]) return CATEGORY_GLYPHS[category];
  if (primaryType && CATEGORY_GLYPHS[primaryType]) return CATEGORY_GLYPHS[primaryType];
  return Buildings;
}

export default function CategoryIcon({
  category,
  primaryType,
  large = false,
  compact = false,
}: {
  category?: string | null;
  primaryType?: string | null;
  large?: boolean;
  compact?: boolean;
}) {
  const Glyph =
    CATEGORY_GLYPHS[category ?? ""] ?? CATEGORY_GLYPHS[primaryType ?? ""] ?? Buildings;
  const glyphSize = large ? 28 : compact ? 15 : 24;

  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-black/[0.08] bg-black/[0.03] text-gray-600 ${
        large
          ? "w-[4.5rem] self-stretch rounded-2xl"
          : compact
            ? "h-7 w-7 rounded-lg"
            : "h-14 w-14 rounded-2xl"
      }`}
    >
      <Glyph size={glyphSize} />
    </div>
  );
}
