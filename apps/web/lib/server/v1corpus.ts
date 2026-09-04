import { getPool } from "./db";

// The V1 content corpus: candidate-generation score (>=12) -> frozen V3
// classifier -> INCLUDE. See docs/engineering/post-classification/
// candidate-generation-analysis.md and pipeline/schema.sql's
// v1_content_corpus view (the actual filter/join logic lives there, not
// here — this just queries it).

export interface V1Post {
  post_url: string;
  caption: string | null;
  owner_username: string | null;
  vendor_name: string | null;
  vendor_category: string | null;
  candidate_score: number;
  vendor_roles: string[];
  v3_confidence: number;
  posted_at: string | null;
  likes_count: number | null;
  event_date: string | null;
  location_tag: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toV1Post(row: any): V1Post {
  return {
    post_url: row.post_url,
    caption: row.caption_raw,
    owner_username: row.owner_username,
    vendor_name: row.vendor_name,
    vendor_category: row.vendor_category,
    candidate_score: row.candidate_score,
    vendor_roles: row.vendor_roles ?? [],
    v3_confidence: row.v3_confidence !== null ? Number(row.v3_confidence) : 0,
    posted_at: row.posted_at,
    likes_count: row.likes_count,
    event_date: row.event_date,
    location_tag: row.location_tag,
  };
}

export async function listV1ContentCorpus(
  opts: { limit?: number; offset?: number } = {}
): Promise<{ posts: V1Post[]; total: number }> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;
  const { rows } = await getPool().query(
    `select *, count(*) over() as total_count
     from v1_content_corpus
     order by candidate_score desc, v3_confidence desc, classified_at desc
     limit $1 offset $2`,
    [limit, offset]
  );
  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  return { posts: rows.map(toV1Post), total };
}
