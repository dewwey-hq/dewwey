export type SiteNavItem = {
  label: string;
  href: string;
  iconSrc: string;
};

export const SITE_NAV_ITEMS: SiteNavItem[] = [
  { label: "Venues", href: "/venues", iconSrc: "/icons/wedding-location-svgrepo-com.svg" },
  { label: "Catering", href: "#", iconSrc: "/icons/tray-plate-svgrepo-com.svg" },
  { label: "Florals", href: "#", iconSrc: "/icons/bouquet-svgrepo-com.svg" },
  { label: "Photography", href: "#", iconSrc: "/icons/photo-camera-photograph-svgrepo-com.svg" },
];

/** Map browse keeps Venues highlighted but links to map view. */
export const SITE_NAV_ITEMS_MAP: SiteNavItem[] = SITE_NAV_ITEMS.map((item) =>
  item.label === "Venues" ? { ...item, href: "/venues?view=map" } : item,
);
