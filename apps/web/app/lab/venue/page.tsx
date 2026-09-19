import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GOLDEN_SLUGS, getGolden, type GoldenSlug } from "@/lib/venueDetails/golden";
import { getVenueDetailsByUsername } from "@/lib/server/venueDetails";
import { VenueDetailsView } from "@/app/components/venue/VenueDetailsView";

export const metadata: Metadata = {
  title: "Venue details lab",
  robots: { index: false, follow: false },
};

/**
 * D060 Phase 1b lab page — noindex, like `/lab/feed`. `?golden=<slug>` renders one of the six
 * golden fixtures through the generic renderer (404 until `importGoldenSet.ts` lands and
 * `getGolden` stops returning null); `?u=<username>` renders a live served row (nothing exists
 * there yet, so it always shows the honest "No served details yet" state for now); `?compare=1`
 * adds a second column linking to the hand-built `/concept/...` reference page for the same
 * venue, at xl width.
 */

// The golden slug -> hand-built concept page this fixture was converted from (not a 1:1 dir-name
// match: Marchetti and LondonHouse have superseded v1-v3 concept dirs, so the newest is named
// explicitly here rather than assumed).
const CONCEPT_PATH: Record<GoldenSlug, string> = {
  "galleria-marchetti": "galleria-marchetti-v4",
  "greenhouse-loft": "greenhouse-loft",
  "diamond-garden-banquet-hall": "diamond-garden-banquet-hall",
  "londonhouse-chicago": "londonhouse-chicago-v2",
  "field-museum": "field-museum",
  geraghty: "geraghty",
};

function GoldenStrip() {
  return (
    <div className="mx-auto mb-4 max-w-5xl px-4 text-center text-xs text-gray-500">
      Golden set:{" "}
      {GOLDEN_SLUGS.map((slug, i) => (
        <span key={slug}>
          {i > 0 ? " · " : ""}
          <Link href={`/lab/venue?golden=${slug}`} className="underline hover:text-gray-800">
            {slug}
          </Link>
        </span>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <GoldenStrip />
      {children}
    </div>
  );
}

export default async function VenueDetailsLabPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const golden = typeof sp.golden === "string" ? sp.golden : undefined;
  const username = typeof sp.u === "string" ? sp.u : undefined;
  const compare = sp.compare === "1";

  if (golden) {
    const venue = getGolden(golden);
    if (!venue) notFound();

    if (compare) {
      const conceptPath = CONCEPT_PATH[golden as GoldenSlug];
      return (
        <Shell>
          <div className="mx-auto grid max-w-[1600px] gap-6 px-4 xl:grid-cols-2">
            <div className="rounded-3xl bg-white shadow-xl">
              <div className="px-5 py-6 sm:px-8">
                <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">Generic renderer (this build)</p>
                <VenueDetailsView venue={venue} />
              </div>
            </div>
            <div className="rounded-3xl bg-white shadow-xl">
              <div className="px-5 py-6 sm:px-8">
                <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">Hand-built reference</p>
                <p className="text-sm text-gray-600">Compare against the hand-built concept page this fixture was converted from:</p>
                <a
                  href={`/concept/${conceptPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
                >
                  Open /concept/{conceptPath} →
                </a>
              </div>
            </div>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <div className="mx-auto max-w-5xl rounded-3xl bg-white shadow-xl">
          <div className="px-5 py-6 sm:px-8">
            <VenueDetailsView venue={venue} />
          </div>
        </div>
      </Shell>
    );
  }

  if (username) {
    const venue = await getVenueDetailsByUsername(username);
    return (
      <Shell>
        <div className="mx-auto max-w-5xl rounded-3xl bg-white shadow-xl">
          <div className="px-5 py-6 sm:px-8">{venue ? <VenueDetailsView venue={venue} /> : <p className="text-sm text-gray-500">No served details yet.</p>}</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="mx-auto max-w-5xl px-4 text-sm text-gray-500">
        Pass <code className="rounded bg-gray-200 px-1 py-0.5">?golden=&lt;slug&gt;</code>,{" "}
        <code className="rounded bg-gray-200 px-1 py-0.5">?u=&lt;username&gt;</code>, or{" "}
        <code className="rounded bg-gray-200 px-1 py-0.5">?compare=1&amp;golden=&lt;slug&gt;</code>.
      </p>
    </Shell>
  );
}
