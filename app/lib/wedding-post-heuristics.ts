/** Caption/mention signals for "real wedding" vs generic venue marketing. */

export type WeddingPostSignals = {
  caption?: string | null;
  mentions?: string[] | null;
};

const STRONG_POSITIVE =
  /\b(wedding\s*day|got\s+married|just\s+married|newlywed|newlyweds|real\s+wedding|wedding\s+season|wedding\s+reception|wedding\s+ceremony)\b/i;

const POSITIVE =
  /\b(wedding|weddings|bride|groom|bridal|groomsmen|bridesmaid|matron|nuptial|matrimony|reception|ceremony|vows|aisle|first\s+dance|husband|wife|elopement|elope)\b|#(?:wedding|bride|groom|weddingday|realwedding|weddinginspo|weddingphotography|weddingphoto|bridetobe|groomtobe)\b/i;

const VENDOR_MENTION =
  /\b(photographer|photography|videographer|florist|floral|planner|planning|dj|band|caterer|catering|makeup|hair|stylist|officiant|cake|baker|boutique|dress|tux|rentals?)\b/i;

const NEGATIVE =
  /\b(workshop|giveaway|contest|promo(?:tion| code)?|happy\s+hour|brunch\s+special|lunch\s+special|dinner\s+special|menu\s+update|now\s+hiring|job\s+opening|corporate\s+event|fundraiser|ticket\s+sale|discount|%\s*off|book\s+your\s+event|venue\s+tour|open\s+house)\b|#(?:giveaway|contest|promo|happyhour)\b/i;

export function weddingPostScore(post: WeddingPostSignals): number {
  const text = post.caption?.trim() ?? "";
  if (!text && (!post.mentions || post.mentions.length === 0)) return 0;

  let score = 0;

  if (STRONG_POSITIVE.test(text)) score += 4;
  if (POSITIVE.test(text)) score += 2;
  if (VENDOR_MENTION.test(text)) score += 1;

  const mentionCount = post.mentions?.length ?? 0;
  if (mentionCount >= 3) score += 2;
  else if (mentionCount >= 1) score += 1;

  if (NEGATIVE.test(text)) score -= 4;

  return score;
}

export function isLikelyWeddingPost(post: WeddingPostSignals): boolean {
  return weddingPostScore(post) >= 2;
}

export function partitionWeddingPosts<T extends WeddingPostSignals>(
  posts: T[],
): { weddingLikely: T[]; other: T[] } {
  const weddingLikely: T[] = [];
  const other: T[] = [];

  for (const post of posts) {
    if (isLikelyWeddingPost(post)) weddingLikely.push(post);
    else other.push(post);
  }

  return { weddingLikely, other };
}

/** Prefer wedding-likely posts; fall back to full list if none match. */
export function postsForWeddingGallery<T extends WeddingPostSignals>(
  posts: T[],
  includeNonWedding = false,
): T[] {
  if (includeNonWedding || posts.length === 0) return posts;
  const { weddingLikely } = partitionWeddingPosts(posts);
  return weddingLikely.length > 0 ? weddingLikely : posts;
}
