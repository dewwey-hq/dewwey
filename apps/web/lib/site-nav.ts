export type SiteNavItem = {
  label: string;
  href: string;
  iconSrc: string;
};

export const SITE_NAV_ITEMS: SiteNavItem[] = [
  { label: "Weddings", href: "/weddings", iconSrc: "/icons/newlyweds-wedding-svgrepo-com.svg" },
  { label: "Venues", href: "/venues", iconSrc: "/icons/wedding-location-svgrepo-com.svg" },
  { label: "Vendors", href: "/vendors", iconSrc: "/icons/bouquet-svgrepo-com.svg" },
];

/** Map browse keeps Venues highlighted but links to map view. */
export const SITE_NAV_ITEMS_MAP: SiteNavItem[] = SITE_NAV_ITEMS.map((item) =>
  item.label === "Venues" ? { ...item, href: "/venues?view=map" } : item,
);
