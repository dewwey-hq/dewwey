import { getQueueBatch, getQueueProgress } from "@/lib/server/labeling";
import { LabelingClient } from "@/app/components/LabelingClient";

// Internal tool for Jeremy to rapidly hand-label staging.instagram_posts.
// Not linked from SiteHeader/SiteNavLinks -- this is a review workflow, not
// a product surface. No auth: nothing else in this app gates routes today
// (see CLAUDE.md -- the old password gate was deliberately deleted).
export const dynamic = "force-dynamic";

export default async function LabelPage() {
  const [items, progress] = await Promise.all([getQueueBatch(5), getQueueProgress()]);

  return <LabelingClient initialItems={items} initialProgress={progress} />;
}
