"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import CategoryIcon from "@/app/components/CategoryIcon";
import { uiHeadingClassName } from "@/lib/typography";
import { useOpenInquiry } from "./InquirySystem";

/**
 * Back button only, until the H1 venue-name heading scrolls out of view — then the name
 * (with a tiny category icon) follows along on the left, and the primary CTA sits on the
 * right. Same pattern as Diamond Garden/LondonHouse.
 */
export function StickyActionBar({ name }: { name: string }) {
  const [showFollow, setShowFollow] = useState(false);
  const openInquiry = useOpenInquiry();

  useEffect(() => {
    const heading = document.getElementById("venue-name-heading");
    if (!heading) return;
    const observer = new IntersectionObserver(([entry]) => setShowFollow(!entry.isIntersecting), { threshold: 0 });
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-t-3xl border-b border-black/[0.06] bg-white/95 px-4 py-2.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/venues" className="shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Back to venues">
          <ChevronLeft size={20} />
        </Link>
        {showFollow && (
          <>
            <CategoryIcon category="venue" primaryType="event_venue" compact />
            <p className={`min-w-0 truncate text-sm text-gray-800 ${uiHeadingClassName}`}>{name}</p>
          </>
        )}
      </div>
      {showFollow && (
        <button
          type="button"
          onClick={() => openInquiry("tour")}
          className="shrink-0 rounded-full bg-rose-400 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-500"
        >
          Request tour
        </button>
      )}
    </div>
  );
}
