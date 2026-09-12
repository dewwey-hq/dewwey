import type { Icon } from "@phosphor-icons/react";
import { Storefront } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/app/components/Avatar";
import { slotForRole } from "@/lib/team";
import { SLOT_ICONS } from "@/lib/slots";

/** Untyped-index view of `SLOT_ICONS` (`Record<Slot, Icon>`) — `slotForRole` returns a
 * plain `string` (including `"Other"`, which isn't a `Slot` at all), so lookups here go
 * through a loose map with a `Storefront` fallback rather than a `Slot` cast. */
const ICON_BY_SLOT: Record<string, Icon> = SLOT_ICONS;

/**
 * A stack vendor's avatar: the real photo (`Avatar`) when there is one, else a neutral
 * rounded tile carrying the Phosphor icon for the vendor's slot (`slotForRole`, same
 * mapping `/vendors` filtering uses) — 45% of live credits have no avatar and render as a
 * bare grey-letter `Avatar`, which reads as broken rather than "no photo yet". Unknown/
 * unmapped roles (`"Other"`) fall back to `Storefront`.
 */
export function VendorAvatar({
  src,
  name,
  role,
  size = 40,
}: {
  src: string | null;
  name: string;
  role: string;
  size?: number;
}) {
  if (src) {
    return <Avatar src={src} name={name} size={size} />;
  }
  const SlotIcon = ICON_BY_SLOT[slotForRole(role)] ?? Storefront;
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-lg bg-black/[0.05]"
      aria-hidden
    >
      <SlotIcon size={Math.round(size * 0.55)} className="text-black/[0.45]" />
    </div>
  );
}
