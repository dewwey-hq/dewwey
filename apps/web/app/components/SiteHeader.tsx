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
          <SiteBrand href="/" className="self-center" />
          <SiteNavLinks activeLabel={activeLabel} />
          <div className="hidden items-center self-center md:flex">
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  );
}
