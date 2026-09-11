"use client";

import { useEffect, useRef, useState } from "react";
import { coverOrFirstPost, titleFromCaption, seasonLabel } from "@/lib/feedDesign";
import { EmbedFrame } from "../components/EmbedFrame";
import { MeasuredCard } from "../components/MeasuredCard";
import { Avatar } from "@/app/components/Avatar";
import {
  WeddingPostLightbox,
  type RealWeddingPost,
} from "@/app/concept/_shared/wedding-posts";
import type { StackPostInfo, WeddingStack } from "@/lib/server/graph";

function toRealWeddingPost(p: StackPostInfo): RealWeddingPost {
  return {
    post_url: p.url,
    post_timestamp: p.postedAt,
    mentions: null,
    likes_count: null,
    image_url: null,
    images: null,
    caption: p.caption,
    post_type: p.postType,
    media_width: p.mediaWidth,
    media_height: p.mediaHeight,
  };
}

/** The cover embed's own column measures its width (the grid controls it, not a fixed
 * px value — plan: "the embed width caps at 470 on A/C/D and the column width on B"). */
function GridEmbed({ post }: { post: StackPostInfo | null }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={measureRef} className="w-full">
      <EmbedFrame post={post} width={width} />
    </div>
  );
}

/** B. Grid — scanning 100+ weddings fast, closest to Instagram's profile. 3 cols desktop,
 * 2 mobile, of square cover embeds; hover/tap overlay = title + 3 vendor avatars; click
 * opens the existing wedding-post lightbox with every embeddable post on the wedding. */
export function Grid({ stacks }: { stacks: WeddingStack[] }) {
  const [lightbox, setLightbox] = useState<{ posts: RealWeddingPost[] } | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {stacks.map((stack) => {
          const cover = coverOrFirstPost(stack.post_infos);
          const title = titleFromCaption(stack.caption) ?? seasonLabel(stack.event_date_est) ?? "Real wedding";
          const topVendors = stack.vendors.slice(0, 3);
          const openablePosts = stack.post_infos.filter((p) => p.ok);

          const media = <GridEmbed post={cover} />;
          const overlay = (
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <p className="truncate text-sm font-medium text-white">{title}</p>
              {topVendors.length > 0 && (
                <div className="mt-1 flex -space-x-1.5">
                  {topVendors.map((v) => (
                    <Avatar
                      key={v.username}
                      src={v.avatar_url}
                      name={v.name}
                      size={22}
                      className="text-[10px] ring-2 ring-black/40"
                    />
                  ))}
                </div>
              )}
            </div>
          );

          return (
            <MeasuredCard key={stack.id} id={stack.id}>
              {openablePosts.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setLightbox({ posts: openablePosts.map(toRealWeddingPost) })}
                  className="group relative block w-full overflow-hidden rounded-xl text-left"
                >
                  {media}
                  {overlay}
                </button>
              ) : (
                <div className="relative w-full overflow-hidden rounded-xl">{media}</div>
              )}
            </MeasuredCard>
          );
        })}
      </div>
      {lightbox && (
        <WeddingPostLightbox
          posts={lightbox.posts}
          startIndex={0}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
