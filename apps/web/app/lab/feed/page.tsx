import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/server/db";
import { listWeddingStacks } from "@/lib/server/graph";
import { FeedLab } from "./FeedLab";
import {
  isVariant,
  parseEmbedSize,
  parseLayout,
  parseLimit,
  parseSplit,
  parseTileCols,
  type Variant,
} from "./variant";

export const metadata: Metadata = {
  title: "Feed design lab",
  robots: { index: false, follow: false },
};

/**
 * D058 candidate: a noindex lab comparing four feed designs over one venue's real,
 * hosted-only wedding stacks — see the plan section "Feed design lab — D058 candidate"
 * for the design principles. Read-only, additive; doesn't touch `WeddingFeedCard`,
 * `/weddings`, or the vendor page.
 */
export default async function FeedLabPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const venueUsername = typeof sp.venue === "string" && sp.venue.length > 0 ? sp.venue : "the.arbory";
  const rawVariant = typeof sp.variant === "string" ? sp.variant.toLowerCase() : "a";
  const variant: Variant = isVariant(rawVariant) ? rawVariant : "a";
  const embedSize = parseEmbedSize(typeof sp.size === "string" ? sp.size : undefined);
  const layout = parseLayout(typeof sp.layout === "string" ? sp.layout : undefined);
  const limit = parseLimit(typeof sp.n === "string" ? sp.n : undefined, variant);
  const split = parseSplit(typeof sp.split === "string" ? sp.split : undefined);
  const tileCols = parseTileCols(typeof sp.tiles === "string" ? sp.tiles : undefined);

  const { rows } = await getPool().query<{ id: number; username: string; name: string }>(
    `SELECT id::int, username::text, COALESCE(full_name, username::text) AS name
       FROM accounts WHERE username = $1::citext`,
    [venueUsername],
  );
  if (rows.length === 0) notFound();
  const venue = rows[0];

  // Fresh variants F-I default to 12 (`parseLimit`); the note below is about the classic 60.
  // Plan text says "24 weddings"; the plan's own Verification section names wedding 4599
  // ("Shay & Marc", 3 posts) and 11229 (the two-couples data problem) as expected to be
  // visible by default -- checked against the real DB (read-only), The Arbory's 144 hosted
  // weddings sorted by event_date_est desc put those two at rank 52-53, not the top 24. 60
  // is the smallest round number that covers both while staying well short of "all 144".
  const { stacks } = await listWeddingStacks({
    accountId: venue.id,
    hostedOnly: true,
    limit,
  });

  return (
    <FeedLab
      venue={venue}
      stacks={stacks}
      initialVariant={variant}
      initialEmbedSize={embedSize}
      initialLayout={layout}
      initialSplit={split}
      initialTileCols={tileCols}
    />
  );
}
