import { SiteBrand } from "./SiteBrand";
import { SiteNavLinks } from "./SiteNavLinks";
import { AuthButton } from "./team/AuthButton";
import { siteContainerClass, SITE_HEADER_HEIGHT_CLASS } from "@/lib/site-layout";

/** Sticky site header for server-rendered pages (vendors, weddings). */
export function SiteHeader({ activeLabel }: { activeLabel?: string }) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-black/[0.08]">
      <div className={siteContainerClass}>
        <div className={`flex ${SITE_HEADER_HEIGHT_CLASS} items-stretch justify-between`}>
          <div className="flex flex-1 items-center justify-start">
            <SiteBrand href="/" />
          </div>
          <SiteNavLinks activeLabel={activeLabel} />
          <div className="hidden flex-1 items-center justify-end md:flex">
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  );
}
