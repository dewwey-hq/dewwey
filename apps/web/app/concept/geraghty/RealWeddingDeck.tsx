"use client";

/**
 * Top-of-page "real weddings" showcase — same component shape as Marchetti's RealWeddingDeck,
 * reusing the exact same StackCard/weddingStacks data as the Vendors section further down.
 */

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { WeddingPostLightbox, type RealWeddingPost } from "@/app/concept/_shared/wedding-posts";
import { CardDeck } from "./CardDeck";
import { StackCard, CARD_HEIGHT, type Stack } from "./VendorStackDeck";
import { geraghty } from "./data";

function stackToLightboxPost(stack: Stack): RealWeddingPost {
  return {
    post_url: stack.postUrl,
    post_timestamp: stack.postTimestamp,
    mentions: stack.vendors.map((v) => v.name),
    likes_count: null,
    image_url: stack.postImageUrl,
    images: [stack.postImageUrl],
    caption: stack.postCaption,
    post_type: null,
  };
}

const MAX_WIDTH = 740;
const PEEK_ABOVE = 14;

export function RealWeddingDeck() {
  const stacks = geraghty.weddingStacks;
  const [front, setFront] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (stacks.length === 0) return null;

  return (
    <div>
      <div className="relative mx-auto" style={{ maxWidth: MAX_WIDTH }}>
        <CardDeck
          items={stacks}
          keyFor={(stack) => stack.postUrl}
          renderCard={(stack) => <StackCard stack={stack} />}
          cardHeight={CARD_HEIGHT}
          front={front}
          onFrontChange={setFront}
          maxWidth={MAX_WIDTH}
          peekAbove={PEEK_ABOVE}
        />
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="View fullscreen"
          className="absolute z-40 flex h-6 w-6 items-center justify-center rounded-full border border-black/[0.08] bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-rose-500"
          style={{ top: PEEK_ABOVE + 10, right: 10 }}
        >
          <Maximize2 size={12} />
        </button>
      </div>
      {lightboxOpen ? <WeddingPostLightbox posts={stacks.map(stackToLightboxPost)} startIndex={front} onClose={() => setLightboxOpen(false)} /> : null}
    </div>
  );
}
