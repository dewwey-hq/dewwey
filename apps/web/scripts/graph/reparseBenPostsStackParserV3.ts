/**
 * Case A backfill (docs/engineering/vendor-feed-gap/README.md): applies the
 * already-validated stack-parser-ts-v3 fix (stackParser.ts's NOCOLON_LINE,
 * from the graph-strengthening workstream, D016-D025) to Ben's own
 * already-ingested posts — recovering vendor credits the old Python `LINE`
 * regex silently dropped (e.g. "Venue @ulcchicago", no punctuation
 * separator) on posts that already belong to a wedding (have a
 * wedding_posts row). Deliberately Case A only: posts with NO wedding yet
 * were Case B; that attach was sized and declined (D031) — this
 * script never creates a wedding, only adds credits to existing ones.
 *
 * D027 (2026-09-04): live write already committed (56 wedding_vendors rows).
 * Re-running is idempotent (on conflict do nothing) but unnecessary.
 *
 * v3 has only ever run against Jeremy's staging corpus
 * (runStackParserBaseline.ts). All of Ben's `posts` rows are
 * `source='venue_tagged'` (confirmed live, 2026-09-04) — Jeremy's captions
 * live in a separate `staging` schema, never merged into `posts` — so no
 * source filter is needed here, every row in `posts` is Ben's own corpus.
 *
 * Safety properties (same bar as D023 / applyJeremyEvidenceToGraph.ts):
 * - Additive only. `post_mentions` insert is skipped in application code
 *   before it's even attempted, for any (post, handle) pair that already
 *   has an in_stack=true, role-bearing row — never touches or duplicates an
 *   existing credit. `wedding_vendors` insert is `on conflict (wedding_id,
 *   account_id, role) do nothing`. The only UPDATE is `weddings.venue_id`/
 *   `is_chicago`, and only when venue_id was NULL (this session's exact
 *   finding for wedding 1352).
 * - Provenance: every row actually inserted into `wedding_vendors` here is
 *   also logged into `stack_reparse_v3_ingested` (new table, mirrors
 *   `jeremy_wedding_vendors_ingested`'s shape — wedding_id deliberately NOT
 *   a foreign key, same reasoning: Ben's weddings.id is not stable across a
 *   future phase_dedup() truncate-rebuild, which this script's own mission
 *   doc says must never be re-run anyway).
 * - Whole-run transaction; --dry-run rolls back at the end, same code path.
 * - Batched reads: existing credits for every candidate post are fetched in
 *   one query up front (not one round trip per post) — only genuinely new
 *   entries touch the database with per-row writes.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reparseBenPostsStackParserV3.ts --dry-run
 *   bun run scripts/graph/reparseBenPostsStackParserV3.ts
 */
import { getPool, closePool } from "../classify/db";
import { parseCaption, STACK_PARSER_VERSION } from "./stackParser";

// stackParser.ts is deliberately permissive by design (see its own header:
// "every 'Label: @handle' line is extracted regardless of what the label
// says") — it extracts structurally, not semantically, and normalizes any
// unrecognized label to role='other' rather than dropping it. That's
// correct for measuring recall against ground truth, but this script
// writes to production `wedding_vendors`, where an unambiguous
// person-at-the-event label (not a paid service) becoming a role='other'
// "vendor" credit is a real quality regression on this venue-browsing
// product. Spot-checking this script's own dry-run output (2026-09-04)
// found exactly this: "Stunning Bride @handle", "Model @handle", "Couple
// @handle". Deliberately narrow and conservative — only clearly
// unambiguous person-not-vendor labels, matching the same caution the
// graph-strengthening README already applied to genuinely ambiguous cases
// (e.g. "Bridesmaids" was left untouched there because it's sometimes a
// real attire-vendor credit). Word-boundary matched so "Bridal Boutique"
// or "Groomsmen's attire by X" are unaffected.
const NON_VENDOR_LABEL = /\b(bride|groom|couple|newlyweds?|models?|guests?)\b/i;

// Spot-checking the full dry-run output (2026-09-04) additionally found:
// wedding 592's two posts are a fashion runway show ("The Walking Body •
// Runway"), not a wedding — a pre-existing misclassification already in
// Ben's graph (has_stack's >=3-role clustering has no "is this actually a
// wedding" check; same known gap the graph-strengthening README flags for
// destination/styled-editorial posts, just never hit for Ben's own corpus
// before). Its ~11 new entries (Creative Director, Backstage Lead, Project
// Manager, etc.) all fell to role='other' since none matched a real
// ROLE_MAP keyword — same bucket where celebrity-mention and
// brand-sponsorship false positives concentrated in the sample (e.g. an
// "after party video by" line whose @handle resolved to a globally-famous
// DJ, almost certainly a song/artist mention, not an actual wedding
// videographer credit). role='other' is *by design* stackParser.ts's
// catch-all for anything that didn't match a recognized role — appropriate
// for measuring recall against ground truth, too imprecise to write to
// production unreviewed. This backfill therefore only commits entries that
// matched a real, named vendor role; role='other' entries are logged but
// skipped, deferred to manual review (see the mission doc's Case A
// results).

// Wedding 592 (posts 5727/5728) is confirmed-by-reading-the-caption a
// fashion runway show ("The Walking Body • Runway"), not a wedding — a
// pre-existing misclassification in Ben's graph, out of scope to fix here.
// Its "Project Coordinator" entry slipped past the role='other' filter
// above (matches the 'coordinat' -> planner keyword) — excluded explicitly
// by wedding_id rather than trying to generalize a rule from one case.
const KNOWN_MISCLASSIFIED_WEDDING_IDS = new Set<number>([592]);

// @martingarrix, found on post 259 (wedding 1207): the caption reads
// "Scroll to the end to see who crashed the after party" / "After party
// video by @martingarrix & @teddysphotos" — a celebrity-appearance anecdote,
// not a vendor credit (the real videographer on that line is
// @teddysphotos). Excluded by handle, cited here rather than guessed.
const KNOWN_NON_VENDOR_HANDLES = new Set<string>(["martingarrix"]);

// The shared HANDLE regex (`@([A-Za-z0-9._]{2,30})`, identical in
// stackParser.ts and pipeline.py) includes "." in the handle character
// class, so a caption ending a sentence right after a mention with no space
// ("...at @charcoalfactoryloft. This was...") captures the trailing period
// into the handle. Found live in this dry-run: both "charcoalfactoryloft."
// and "trivolitavern." would otherwise create new, duplicate, incorrect
// accounts — clean accounts (534, 1526) already exist for both. Instagram
// usernames can never end in a period, so trimming trailing dots is a safe,
// general normalization, not a two-case patch — applied here rather than to
// the shared regex, which needs the graph-strengthening workstream's full
// eval-set rigor before changing (see its README's "deliberately not
// touched" convention).
function normalizeHandle(handle: string): string {
  return handle.replace(/\.+$/, "");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(`
      create table if not exists stack_reparse_v3_ingested (
        wedding_id      bigint not null,
        account_id      bigint not null references accounts(id),
        role            vendor_role not null,
        post_id         bigint not null references posts(id),
        line_no         integer,
        parser_version  text not null,
        ingested_at     timestamptz not null default now(),
        primary key (wedding_id, account_id, role)
      )
    `);

    // ::int casts: node-postgres returns bigint columns as strings (to avoid
    // JS precision loss on very large values) — without this cast,
    // post.wedding_id would be "592" (string) and never strictly-equal or
    // Set.has()-match the number 592 used in KNOWN_MISCLASSIFIED_WEDDING_IDS
    // below. weddings.id/posts.id are bigint but never remotely near int4's
    // ~2.1B range, so the cast is safe.
    const { rows: posts } = await client.query<{ id: number; caption: string; wedding_id: number }>(
      `select p.id::int, p.caption, wp.wedding_id::int
       from posts p
       join wedding_posts wp on wp.post_id = p.id
       where p.caption is not null`
    );

    const { rows: existingRows } = await client.query<{ post_id: number; username: string }>(
      `select pm.post_id::int, a.username::text as username
       from post_mentions pm
       join accounts a on a.id = pm.account_id
       where pm.in_stack and pm.role is not null
         and pm.post_id = any($1::bigint[])`,
      [posts.map((p) => p.id)]
    );
    const existingByPost = new Map<number, Set<string>>();
    for (const r of existingRows) {
      const set = existingByPost.get(r.post_id) ?? new Set();
      set.add(r.username.toLowerCase());
      existingByPost.set(r.post_id, set);
    }

    console.log(
      `[reparse-v3] ${dryRun ? "DRY RUN — " : ""}${posts.length} candidate posts (already in a wedding), ${existingRows.length} existing credited mentions loaded`
    );

    let postsScanned = 0;
    let entriesFound = 0;
    let entriesNew = 0;
    let entriesSkippedNonVendor = 0;
    let entriesSkippedOtherRole = 0;
    let mentionsInserted = 0;
    let vendorsAttempted = 0;
    let vendorsInserted = 0;
    let venueBackfilled = 0;

    for (const post of posts) {
      postsScanned++;
      const { stack } = parseCaption(post.caption);
      if (stack.length === 0) continue;
      entriesFound += stack.length;

      if (KNOWN_MISCLASSIFIED_WEDDING_IDS.has(post.wedding_id)) continue;

      const already = existingByPost.get(post.id) ?? new Set();
      for (const rawEntry of stack) {
        const handle = normalizeHandle(rawEntry.handle);
        const entry = { ...rawEntry, handle };
        if (already.has(entry.handle)) continue;
        if (KNOWN_NON_VENDOR_HANDLES.has(entry.handle)) continue;
        if (NON_VENDOR_LABEL.test(entry.role_raw)) {
          entriesSkippedNonVendor++;
          continue;
        }
        if (entry.role === "other") {
          entriesSkippedOtherRole++;
          continue;
        }
        entriesNew++;

        const { rows: acctRows } = await client.query<{ id: number }>(
          `insert into accounts (username) values ($1)
           on conflict (username) do update set username = excluded.username
           returning id`,
          [entry.handle]
        );
        const accountId = acctRows[0].id;

        const { rows: mentionRows } = await client.query(
          `insert into post_mentions (post_id, account_id, role_raw, role, in_stack, line_no)
           values ($1, $2, $3, $4, true, $5)
           on conflict (post_id, account_id, (coalesce(role_raw, ''))) do nothing
           returning post_id`,
          [post.id, accountId, entry.role_raw, entry.role, entry.line_no]
        );
        if (mentionRows.length === 0) continue;
        mentionsInserted++;

        vendorsAttempted++;
        const { rows: wvRows } = await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           values ($1, $2, $3::vendor_role, 1)
           on conflict (wedding_id, account_id, role) do nothing
           returning wedding_id`,
          [post.wedding_id, accountId, entry.role]
        );
        if (wvRows.length === 0) continue;
        vendorsInserted++;
        if (process.argv.includes("--verbose")) {
          console.log(`[reparse-v3]   + wedding=${post.wedding_id} post=${post.id} @${entry.handle} role_raw="${entry.role_raw}" role=${entry.role}`);
        }

        await client.query(
          `insert into stack_reparse_v3_ingested (wedding_id, account_id, role, post_id, line_no, parser_version)
           values ($1, $2, $3::vendor_role, $4, $5, $6)
           on conflict (wedding_id, account_id, role) do nothing`,
          [post.wedding_id, accountId, entry.role, post.id, entry.line_no, STACK_PARSER_VERSION]
        );

        if (entry.role === "venue") {
          const { rows: wRows } = await client.query<{ venue_id: number | null }>(
            `select venue_id from weddings where id = $1`,
            [post.wedding_id]
          );
          if (wRows.length > 0 && wRows[0].venue_id === null) {
            const { rows: locRows } = await client.query<{ in_metro: boolean | null }>(
              `select coalesce(bool_or(l.in_metro), false) as in_metro
               from account_locations l where l.account_id = $1`,
              [accountId]
            );
            const isChicago = locRows[0]?.in_metro ?? false;
            await client.query(
              `update weddings set venue_id = $1, is_chicago = $2 where id = $3 and venue_id is null`,
              [accountId, isChicago, post.wedding_id]
            );
            venueBackfilled++;
          }
        }
      }
    }

    console.log(`[reparse-v3] posts_scanned=${postsScanned} stack_entries_found=${entriesFound} entries_new=${entriesNew} skipped_non_vendor_label=${entriesSkippedNonVendor} skipped_other_role=${entriesSkippedOtherRole}`);
    console.log(`[reparse-v3] post_mentions inserted=${mentionsInserted}`);
    console.log(`[reparse-v3] wedding_vendors attempted=${vendorsAttempted} inserted=${vendorsInserted}`);
    console.log(`[reparse-v3] venue_id/is_chicago backfilled=${venueBackfilled}`);

    if (!dryRun) {
      await client.query("refresh materialized view edges");
      console.log("[reparse-v3] refreshed materialized view edges");
    }

    if (dryRun) {
      await client.query("rollback");
      console.log("[reparse-v3] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[reparse-v3] COMMITTED");
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
