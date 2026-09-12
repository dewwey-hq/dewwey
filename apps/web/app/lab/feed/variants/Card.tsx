import { MeasuredCard } from "../components/MeasuredCard";
import { WeddingCard } from "@/app/components/feed/WeddingCard";
import type { EmbedSize, Side, Split, TileCols } from "../variant";
import type { WeddingStack } from "@/lib/server/graph";

/**
 * C. Card — promoted to production as `app/components/feed/WeddingCard.tsx` (D058, the
 * lab card the user signed off on: "i love this"). This wrapper just maps the lab's
 * stacks + knobs onto that component inside `MeasuredCard` (still lab-only, feeds the
 * measurement strip in `FeedLab.tsx`), so the lab keeps comparing the SAME component
 * production renders rather than a forked copy. See `WeddingCard.tsx`'s own doc comment
 * for the full design history.
 */
export function Card({
  stacks,
  embedWidth,
  twoUp,
  split,
  tileCols,
  mediaSide,
}: {
  stacks: WeddingStack[];
  embedWidth: EmbedSize;
  twoUp: boolean;
  split: Split;
  tileCols: TileCols;
  mediaSide: Side;
}) {
  return (
    <div
      className={
        twoUp
          ? "grid grid-cols-1 gap-4 xl:grid-cols-2"
          : "mx-auto flex max-w-6xl flex-col gap-6"
      }
    >
      {stacks.map((stack, i) => (
        <MeasuredCard key={stack.id} id={stack.id}>
          <WeddingCard
            stack={stack}
            eager={i < 2}
            embedWidth={embedWidth}
            twoUp={twoUp}
            split={split}
            tileCols={tileCols}
            mediaSide={mediaSide}
          />
        </MeasuredCard>
      ))}
    </div>
  );
}
