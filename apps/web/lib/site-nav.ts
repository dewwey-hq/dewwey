import { Confetti, Buildings, Storefront, Image } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { slotHref } from "./slots";

export type SiteNavItem = {
  label: string;
  href: string;
  icon: Icon;
};

export const SITE_NAV_ITEMS: SiteNavItem[] = [
  { label: "Weddings", href: "/weddings", icon: Confetti },
  { label: "Venues", href: slotHref("Venue"), icon: Buildings },
  { label: "Vendors", href: "/vendors", icon: Storefront },
  { label: "Feed", href: "/feed", icon: Image },
];

/** Map browse keeps Venues highlighted but links to map view. */
export const SITE_NAV_ITEMS_MAP: SiteNavItem[] = SITE_NAV_ITEMS.map((item) =>
  item.label === "Venues" ? { ...item, href: "/venues?view=map" } : item,
);
