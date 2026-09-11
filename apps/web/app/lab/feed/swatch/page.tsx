import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/server/db";
import { listWeddingStacks } from "@/lib/server/graph";
import { Swatches } from "./Swatches";

export const metadata: Metadata = {
  title: "Feed panel-top swatch",
  robots: { index: false, follow: false },
};

/**
 * D058 follow-on: a noindex swatch page comparing three designs for the top of Card's
 * stack panel ("Hosted at {venue}" + the meta line's "↗ Open on Instagram"/"Show
 * caption" toggle, which the user called "clunky" 2026-09-11) — real tiles from one
 * hosted stack, three different panel-top treatments side by side. Read-only, additive;
 * doesn't touch `Card.tsx` or any other lab file. Same venue lookup as `../page.tsx`.
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

  const { stacks } = await listWeddingStacks({ accountId: venue.id, hostedOnly: true, limit: 1 });
  const stack = stacks[0];
  if (!stack) notFound();

  // Second section (D058 follow-on, 2026-09-11): "the experience for if there's multiple
  // posts isn't ideal ... need a better design than just the dots underneath" — wedding 881
  // (The Arbory, 3 posts) is the target demo stack; fall back to the first hosted stack with
  // more than one post if 881 isn't in this venue's list (or render a note in Swatches).
  const { stacks: hostedStacks } = await listWeddingStacks({ accountId: venue.id, hostedOnly: true, limit: 60 });
  const multiStack = hostedStacks.find((s) => s.id === 881) ?? hostedStacks.find((s) => s.n_posts > 1) ?? null;

  return <Swatches stack={stack} multiStack={multiStack} />;
}
