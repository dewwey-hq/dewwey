"use client";

import { SITE_NAV_ITEMS, type SiteNavItem } from "@/lib/site-nav";

function desktopLinkClassName(active: boolean, showIcons: boolean) {
  return `inline-flex h-full items-center border-b-2 px-5 text-[15px] font-medium transition-all duration-300 md:px-6 ${
    showIcons ? "gap-2" : "gap-0"
  } ${
    active
      ? "border-rose-400 text-gray-900"
      : "border-transparent text-gray-600 hover:text-gray-900"
  }`;
}

function mobileLinkClassName(active: boolean) {
  return `flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${
    active
      ? "font-medium text-gray-900 bg-black/[0.05]"
      : "text-gray-700 hover:bg-black/[0.04]"
  }`;
}

export function SiteNavLinks({
  activeLabel,
  items = SITE_NAV_ITEMS,
  showIcons = true,
  className = "hidden h-full items-stretch justify-center gap-3 md:gap-4 md:flex",
}: {
  activeLabel?: string;
  items?: SiteNavItem[];
  showIcons?: boolean;
  className?: string;
}) {
  return (
    <nav className={className}>
      {items.map((item) => {
        const active = item.label === activeLabel;
        return (
          <a key={item.label} href={item.href} className={desktopLinkClassName(active, showIcons)}>
            <span
              className={`inline-flex shrink-0 items-center overflow-hidden transition-all duration-300 ease-out ${
                showIcons ? "w-[18px] opacity-100" : "w-0 opacity-0"
              }`}
              aria-hidden={!showIcons}
            >
              <item.icon size={18} />
            </span>
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export function SiteNavMobileLinks({
  activeLabel,
  items = SITE_NAV_ITEMS,
  className = "flex flex-col gap-1",
}: {
  activeLabel?: string;
  items?: SiteNavItem[];
  className?: string;
}) {
  return (
    <div className={className}>
      {items.map((item) => {
        const active = item.label === activeLabel;
        return (
          <a key={item.label} href={item.href} className={mobileLinkClassName(active)}>
            <item.icon size={20} />
            {item.label}
          </a>
        );
      })}
    </div>
  );
}
