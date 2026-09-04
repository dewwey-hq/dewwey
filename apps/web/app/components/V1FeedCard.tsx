"use client";

import InstagramEmbed from "./InstagramEmbed";
import type { V1Post } from "@/lib/server/v1corpus";

/**
 * V1 content corpus feed card. Deliberately simple — this is the first cut
 * proving the pipeline end-to-end (candidate score -> V3 -> product), not a
 * polished feed. Unlike WeddingFeedCard, these posts aren't tied to Ben's
 * account graph (no confirmed avatar/role stack), so there's no
 * embeds_disabled opt-out check here yet — an account that has opted out of
 * embedding will just show a blank/broken embed. Known limitation, not
 * silently hidden.
 */
export function V1FeedCard({ post }: { post: V1Post }) {
  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-black/[0.07] bg-white">
      <div className="flex items-center gap-2 border-b border-black/[0.05] px-4 py-2.5 text-xs">
        <span className="font-medium text-gray-900">@{post.owner_username ?? "unknown"}</span>
        {post.vendor_category && (
          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-gray-600">
            {post.vendor_category}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-black/[0.45]">
          <span title="Candidate-generation score">score {post.candidate_score}</span>
          <span title="V3 classifier confidence">
            {Math.round(post.v3_confidence * 100)}% conf
          </span>
        </span>
      </div>
      <InstagramEmbed postUrl={post.post_url} caption={post.caption} maxWidth={400} />
    </article>
  );
}
