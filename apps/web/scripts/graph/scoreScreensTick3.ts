/**
 * Tick 3 of the non-wedding-posts mission
 * (docs/engineering/graph-strengthening/non-wedding-posts.md).
 *
 * Read-only. For every labeled post in data/non_wedding_labels.json, scores
 * three existing/candidate screens and prints a confusion table vs the hand
 * labels — on the tune split AND the known-good regression slice. Does not
 * label, delete, or write anything.
 *
 * Screens:
 *   1. prefilter (prefilter.ts v3) via a THIN ADAPTER over public.posts
 *      (source.ts only reads staging.instagram_posts — per the doc, do not
 *      pretend it already covers Ben's posts). "defer" (null) is scored as
 *      NOT-EXCLUDE, because in production a deferred post is never gated —
 *      it stays on the serving graph exactly like an INCLUDE would.
 *   2. caption heuristic (same regex as the sizer/pool builder) — NOT a rule,
 *      just measured for comparison.
 *   3. role-shape (wedding_vendors role set subset of {venue, band, musician})
 *
 * Usage (from apps/web): bun run scripts/graph/scoreScreensTick3.ts
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { classify, PREFILTER_VERSION } from "../classify/prefilter";
import type { PostContext, KnownVendorMention } from "../classify/source";

const LABELS = JSON.parse(
  readFileSync(new URL("./data/non_wedding_labels.json", import.meta.url), "utf8")
) as {
  posts: {
    post_url: string;
    group: string;
    split: string;
    expected_decision: string;
    exclusion_reason: string | null;
  }[];
};

const CAPTION_HEURISTIC =
  /(concert|live music|opening for|tour|gala|fundraiser|birthday|block party|raver|house music|doors [0-9]|tix in bio|#livemusic|#concert)/i;

function shortcode(url: string): string {
  return url.match(/\/p\/([^/]+)/)![1];
}

type Row = {
  shortcode: string;
  caption: string | null;
  location_name: string | null;
  hashtags: string[];
  mentions: string[];
  owner_username: string | null;
  venue_username: string | null;
  posted_at: string | null;
  roles: string | null;
};

async function main() {
  const pool = getPool();
  const shorts = LABELS.posts.map((p) => shortcode(p.post_url));

  const { rows } = await pool.query<Row>(
    `select p.shortcode, p.caption,
            p.raw->>'locationName' as location_name,
            coalesce(p.raw->'hashtags', '[]'::jsonb) as hashtags,
            coalesce(p.raw->'mentions', '[]'::jsonb) as mentions,
            a.username as owner_username, va.username as venue_username,
            p.posted_at,
            (select string_agg(distinct wv.role::text, ',')
               from wedding_vendors wv where wv.wedding_id = w.id) as roles
     from posts p
     left join accounts a on a.id = p.owner_id
     left join wedding_posts wp on wp.post_id = p.id
     left join weddings w on w.id = wp.wedding_id
     left join accounts va on va.id = w.venue_id
     where p.shortcode = any($1::text[])`,
    [shorts]
  );
  const byShort = new Map(rows.map((r) => [r.shortcode, r]));

  // Known-vendor role lookup for every mentioned username across the labeled
  // set, so the prefilter adapter's known_vendor_mentions signal is real,
  // not always-empty.
  const allMentions = [...new Set(rows.flatMap((r) => (r.mentions || []).map((m) => m.toLowerCase())))];
  const { rows: roleRows } = await pool.query(
    `select lower(a.username) as username, r.role::text as role
     from accounts a
     join v_account_role r on r.account_id = a.id
     where lower(a.username) = any($1::text[])`,
    [allMentions]
  );
  const roleByUsername = new Map(roleRows.map((r: any) => [r.username, r.role as string]));

  function toContext(r: Row): PostContext {
    const owner = (r.owner_username || "").toLowerCase();
    const venue = (r.venue_username || "").toLowerCase();
    const known_vendor_mentions: KnownVendorMention[] = (r.mentions || []).map((m) => ({
      username: m,
      role: roleByUsername.get(m.toLowerCase()) ?? null,
      in_metro: null,
    }));
    return {
      post_url: `https://www.instagram.com/p/${r.shortcode}/`,
      caption: r.caption,
      hashtags: r.hashtags || [],
      mentions: r.mentions || [],
      location_tag: r.location_name,
      post_timestamp: r.posted_at,
      likes_count: null,
      owner_username: r.owner_username,
      post_type: null,
      image_url: null,
      vendor_name: null,
      vendor_category: null,
      vendor_rating: null,
      vendor_review_count: null,
      vendor_ai_summary: null,
      vendor_city: null,
      vendor_neighborhood: null,
      vendor_instagram_handle: r.venue_username,
      is_own_profile_post: Boolean(owner && venue && owner === venue),
      known_vendor_mentions,
      account_archetype: null,
      account_archetype_confidence: null,
    };
  }

  function roleShapeExcludes(roles: string | null): boolean {
    if (!roles) return false;
    const set = roles.split(",");
    return set.length > 0 && set.every((r) => r === "venue" || r === "band" || r === "musician");
  }

  type Scored = {
    post_url: string;
    group: string;
    split: string;
    label: string;
    prefilter: "EXCLUDE" | "DEFER";
    caption_heuristic: "EXCLUDE" | "DEFER";
    role_shape: "EXCLUDE" | "DEFER";
  };

  const scored: Scored[] = [];
  for (const p of LABELS.posts) {
    const sc = shortcode(p.post_url);
    const r = byShort.get(sc);
    if (!r) {
      console.log(`[tick3] WARNING: ${p.post_url} not found in posts, skipping`);
      continue;
    }
    const ctx = toContext(r);
    const pf = classify(ctx);
    scored.push({
      post_url: p.post_url,
      group: p.group,
      split: p.split,
      label: p.expected_decision,
      prefilter: pf?.decision === "EXCLUDE" ? "EXCLUDE" : "DEFER",
      caption_heuristic: r.caption && CAPTION_HEURISTIC.test(r.caption) ? "EXCLUDE" : "DEFER",
      role_shape: roleShapeExcludes(r.roles) ? "EXCLUDE" : "DEFER",
    });
  }

  function confusion(pop: Scored[], screenKey: "prefilter" | "caption_heuristic" | "role_shape") {
    let excludeAndLabelExclude = 0;
    let excludeAndLabelInclude = 0;
    let excludeAndLabelReview = 0;
    let deferCount = 0;
    for (const s of pop) {
      const decision = s[screenKey];
      if (decision === "EXCLUDE") {
        if (s.label === "EXCLUDE") excludeAndLabelExclude++;
        else if (s.label === "INCLUDE") excludeAndLabelInclude++;
        else excludeAndLabelReview++;
      } else {
        deferCount++;
      }
    }
    const totalExcluded = excludeAndLabelExclude + excludeAndLabelInclude + excludeAndLabelReview;
    const precision = totalExcluded > 0 ? excludeAndLabelExclude / totalExcluded : null;
    return {
      n: pop.length,
      n_screen_excluded: totalExcluded,
      n_screen_deferred: deferCount,
      true_exclude: excludeAndLabelExclude,
      false_exclude_of_include: excludeAndLabelInclude,
      exclude_of_review: excludeAndLabelReview,
      exclude_precision: precision !== null ? Number(precision.toFixed(3)) : null,
    };
  }

  const tunePop = scored.filter((s) => s.split === "tune" && s.group !== "seed");
  const heldoutPop = scored.filter((s) => s.split === "heldout");
  const knownGoodTune = scored.filter(
    (s) => s.group === "known_good" && s.label === "INCLUDE" && s.split === "tune"
  );
  const knownGoodAll = scored.filter((s) => s.group === "known_good" && s.label === "INCLUDE");
  const seedPop = scored.filter((s) => s.group === "seed");

  for (const key of ["prefilter", "caption_heuristic", "role_shape"] as const) {
    console.log(`\n=== Screen: ${key} ===`);
    console.log("tune split (pool sample, excl. seeds):", confusion(tunePop, key));
    console.log("known-good TUNE slice (want 0 false_exclude_of_include):", confusion(knownGoodTune, key));
    console.log("known-good FULL slice (tune+heldout, informational):", confusion(knownGoodAll, key));
    console.log("the 11 seeds (all should be EXCLUDE):", confusion(seedPop, key));
    console.log("[heldout not scored yet on purpose — held out until a rule is chosen]");
  }

  console.log(`\nprefilter version under test: ${PREFILTER_VERSION}`);
  console.log(`(heldout pool size for later: ${heldoutPop.length})`);

  if (process.env.SCORE_HELDOUT === "1") {
    console.log("\n=== HELDOUT (scored once, rule frozen before this run) ===");
    for (const key of ["prefilter", "caption_heuristic", "role_shape"] as const) {
      console.log(`--- ${key} on heldout ---`, confusion(heldoutPop, key));
    }
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
