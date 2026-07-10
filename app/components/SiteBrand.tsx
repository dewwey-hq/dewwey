import Link from "next/link";
import { BRAND_NAME } from "@/app/lib/brand";
import { uiHeadingClassName } from "@/app/lib/typography";

export function SiteBrand({
  hideNameOnMobile = false,
  href,
  className = "",
}: {
  hideNameOnMobile?: boolean;
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <span className="text-3xl leading-none text-rose-400">✦</span>
      <span
        className={`text-xl tracking-tight text-gray-900 ${uiHeadingClassName} ${
          hideNameOnMobile ? "hidden sm:inline" : ""
        }`}
      >
        {BRAND_NAME}
      </span>
    </>
  );

  const layoutClass = `flex shrink-0 items-center gap-2.5 ${className}`;

  if (href) {
    return (
      <Link href={href} className={layoutClass}>
        {content}
      </Link>
    );
  }

  return <span className={layoutClass}>{content}</span>;
}
