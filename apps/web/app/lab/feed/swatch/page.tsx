import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/server/db";
import { listWeddingStacks } from "@/lib/server/graph";
import { Swatches } from "./Swatches";

export const metadata: Metadata = {
  title: "Feed stacked-posts swatch",
  robots: { index: false, follow: false },
};

/**
 * D058 follow-on: a noindex swatch page for "Stacked posts" — flipping between a
 * wedding's multiple posts feels better as a card deck (the concept page's `CardDeck`
 * idea, user 2026-09-11: "if there's three posts then show another one behind it and we
 * can let the user flip through") than the plain dots pager under one embed. Replaces the
 * earlier panel-top and dots/counter/chips swatch rounds (both decided) with one
 * comparison, over the SAME real hosted, multi-post stack — wedding 881 (The Arbory, 3
 * posts) is the target demo stack; falls back to the first hosted stack with more than one
 * post if 881 isn't in this venue's list (or Swatches renders a note).
 */
export default async function FeedSwatchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const venueUsername = typeof sp.venue === "string" && sp.venue.length > 0 ? sp.venue : "the.arbory";

  const { rows } = await getPool().query<{ id: number; username: string; name: string }>(
    `SELECT id::int, username::text, COALESCE(full_name, username::text) AS name
       FROM accounts WHERE username = $1::citext`,
    [venueUsername],
  );
  if (rows.length === 0) notFound();
  const venue = rows[0];

  const { stacks: hostedStacks } = await listWeddingStacks({ accountId: venue.id, hostedOnly: true, limit: 60 });
  const multiStack = hostedStacks.find((s) => s.id === 881) ?? hostedStacks.find((s) => s.n_posts > 1) ?? null;

  return <Swatches multiStack={multiStack} />;
}
