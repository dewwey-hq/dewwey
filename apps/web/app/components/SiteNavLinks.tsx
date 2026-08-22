"use client";

import Image from "next/image";
import { SITE_NAV_ITEMS, type SiteNavItem } from "@/app/lib/site-nav";

const NAV_ICON_SIZE = 28;
const NAV_ICON_SIZE_MOBILE = 26;

function NavIcon({ src, size = NAV_ICON_SIZE }: { src: string; size?: number }) {
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  );
}

function desktopLinkClassName(active: boolean, showIcons: boolean) {
  return `inline-flex h-full items-center border-b-2 px-5 text-[15px] font-medium transition-all duration-300 md:px-6 ${
    showIcons ? "gap-3" : "gap-0"
  } ${
    active
      ? "border-rose-400 text-rose-600"
      : "border-transparent text-gray-600 hover:border-rose-200/80 hover:text-gray-900"
  }`;
}

function mobileLinkClassName(active: boolean) {
  return `flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${
    active
      ? "font-medium text-rose-600 ring-1 ring-inset ring-rose-200 bg-rose-50/50"
      : "text-gray-700 hover:bg-gray-50"
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
              className={`inline-flex shrink-0 overflow-hidden transition-all duration-300 ease-out ${
                showIcons ? "w-7 opacity-100" : "w-0 opacity-0"
              }`}
              aria-hidden={!showIcons}
            >
              <NavIcon src={item.iconSrc} />
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
            <NavIcon src={item.iconSrc} size={NAV_ICON_SIZE_MOBILE} />
            {item.label}
          </a>
        );
      })}
    </div>
  );
}
