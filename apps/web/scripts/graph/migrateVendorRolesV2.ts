/**
 * D056 stage 2b: the data half of the vendor-taxonomy migration -- ONE transaction, dry-run
 * rolls back and prints everything. Derives `wedding_vendor_credits` from the v10 parser
 * (`stack_extraction_entries_v2`, parser_version = STACK_PARSER_V2_VERSION = "stack-parser-ts-
 * v10"), moves participants out of the vendor graph, re-roles `wedding_vendors` to match, applies
 * the hotel rule, and re-anchors the rare ceremony+reception split. See docs/decisions.md D056
 * and the plan file's "Vendor-stack nomenclature" section (Design D/E, "Execution -- Stage 2",
 * "Stage 2b", "Verification -- and what must NOT change", "Protecting venues that are already
 * right").
 *
 * ## Why --dry-run never touches the new D056 schema objects
 *
 * `applyVendorTaxonomySchema.ts --apply` (the schema half) has not been run for real anywhere --
 * this script is developed and its dry-run verified BEFORE that happens (same "run by an agent
 * that is only ever allowed --dry-run" situation refreshAccountRoleTagsFromWeddings.ts's header
 * names explicitly). So `--dry-run` here is designed to need NONE of the new tables/enum values
 * to exist: every read is against tables that already exist today (`stack_extraction_entries_v2`,
 * `wedding_posts`, `posts`, `wedding_vendors`, `weddings`, `accounts`, `account_aliases`,
 * `account_locations`, `account_tags`, `staging.instagram_posts`, `post_venue_verdicts_current`,
 * `human_post_labels`, `jeremy_wedding_candidates`, `jeremy_wedding_candidate_posts`,
 * `extracted_venue_anchors`), and the entire diff (credits derived, participants moved, re-role,
 * hotel rule, ceremony/reception split, hard stops, before/after coverage) is computed in
 * application code and reused verbatim by the `--apply` write path below (same computed
 * `wvOps`/`weddingOps` lists drive both the report and the actual writes, so they can never
 * drift apart). `--apply` (this agent still never runs it -- dry-run only, per standing
 * instruction) is the only path that writes into `wedding_vendor_credits`/`wedding_participants`/
 * `vendor_role_migrations`/`wedding_vendors`/`weddings.ceremony_venue_id`/`weddings.venue_id` --
 * it assumes `applyVendorTaxonomySchema.ts --apply` has already run, and it refuses (rolls back,
 * writes nothing) if `hardStopViolations` is non-empty.
 *
 * ## Follow-up (same day): four changes from the coordinator, applied on top of the above
 *
 *   1. `--apply` is now wired up for real (see "APPLY: write everything" below) -- still never
 *      executed by this agent.
 *   2. The ceremony/reception rule no longer REFUSES on a protected (human-verdict) wedding: it
 *      always sets `ceremony_venue_id`; only an UNPROTECTED wedding also moves `venue_id`. A
 *      protected wedding gets a `weddings` provenance row with `old_venue_id = new_venue_id` and
 *      note `'ceremony_venue_id only (protected)'` -- `venue_id` itself is untouched, so the
 *      "protecting venues that are already right" invariant still holds.
 *   3. Universe A's listing predicate now matches `lib/server/vendors.ts` / `reportVenueCoverage.ts`
 *      post-parent-edit: `role = 'venue' OR (role IN ('hotel','accommodations') AND
 *      anchored_weddings > 0)` -- `accommodations` (what most former `hotel` rows become) lists
 *      exactly like `hotel` used to, so the hotel rule no longer needs a coverage-floor excuse.
 *   4. The simulated `wedding_credit` votes now mirror `refreshAccountRoleTagsFromWeddings.ts`'s
 *      own anchor bonus: for role `'venue'` only, evidence_count = distinct weddings with a venue
 *      credit PLUS distinct weddings whose (simulated) `venue_id` is that account. An account that
 *      IS a wedding's real venue keeps `venue` on top even when a stray mis-parsed credit (e.g. a
 *      "Vanue:" typo landing in `other`) would otherwise tie or beat it.
 *
 * ## Judgment calls worth naming up front (the spec left these implicit)
 *
 *   - "Rows for weddings with no v10 credits at all: leave untouched" is read at the POST level,
 *     literally: a wedding counts as having v10 coverage the moment ANY of its posts has ANY row
 *     in stack_extraction_entries_v2 (vendor, participant, or non-vendor `other`/`noise`/
 *     `press_feature`) -- not "has ≥1 vendor credit". A wedding with participant rows but zero
 *     vendor credits still gets its participant accounts moved out; it is NOT "no v10 coverage".
 *     This gate applies ONLY to the non-venue-category reconciliation (diffRoleSets against v10
 *     credits): the venue rule (never touch) and the hotel rule (always apply) are unconditional
 *     on every wedding regardless of v10 coverage -- they depend only on `wedding_vendors` +
 *     `weddings.venue_id`, not on the parser, and the hotel rule's whole point is to retire
 *     `hotel` from use everywhere in this one batch (D056 decision E: "338 rows / 116 accounts
 *     migrate by that rule" -- not just the v10-covered subset). An earlier draft of this script
 *     gated the hotel rule behind v10 coverage too and it silently never fired (0 rows) against
 *     the live 339-row `hotel` population -- fixed before the dry-run below was captured.
 *   - An existing non-venue `wedding_vendors` row whose account has v10 vendor credits SOMEWHERE
 *     on the wedding is reconciled against "the credits FOR THAT ACCOUNT" (diffRoleSets). An
 *     existing non-venue row whose account has ZERO v10 credits (vendor or participant) on this
 *     wedding at all -- even though the wedding overall has v10 coverage from OTHER accounts --
 *     is left untouched, not deleted. Deleting it would read as "v10 didn't re-find this
 *     credit" which is a recall gap, not a re-label; the plan's own "nothing lost, only
 *     relabeled" invariant (only participants-moved and compound-merges account for row-count
 *     changes) backs this reading.
 *   - "zero labeled credits in v2 for that post" (stage 2b gate) is read as zero
 *     stack_extraction_entries_v2 rows AT ALL for that post_url under v10 (no stack parsed),
 *     matching the plan's own example ("no labels → only the venue was credited").
 *   - Order: credits are derived (2b) and stage-2b mention inference (2c) is layered on top of
 *     those SAME credits BEFORE the re-role reconciliation (2d) runs, so mention-inferred
 *     credits flow through the identical diff logic as label-derived ones. The ceremony/
 *     reception rule (2e) reads the wedding's ORIGINAL `venue_id` for the hotel rule (2d) --
 *     rule (e) only ever adjusts `venue_id` afterward, for the narrow case it defines.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/migrateVendorRolesV2.ts --batch-id d056-migration-1                # dry run (default)
 *   bun run scripts/graph/migrateVendorRolesV2.ts --batch-id d056-migration-1 --dry-run       # same, explicit
 *   bun run scripts/graph/migrateVendorRolesV2.ts --batch-id d056-migration-1 --rehearsal     # dry run against the local Docker DB (localhost:5442); skips if it's not up
 *   bun run scripts/graph/migrateVendorRolesV2.ts --batch-id d056-migration-1 --apply         # real write, human only, AFTER applyVendorTaxonomySchema.ts --apply
 *
 * After a real --apply (documented here, not run by this script): `refreshAccountRoleTagsFromWeddings.ts --apply`
 * then `refresh materialized view edges`.
 */
import { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { ROLE_BY_SLUG, V9_TO_D056 } from "./vendorRoleRules";
import { STACK_PARSER_V2_VERSION } from "./stackParser";
import { weddingCreditConfidence, pickTopRoles, type RoleVote } from "./accountRoleTags";
import {
  isProtectedWedding,
  isProtectedByHumanVerdict,
  applyHotelRule,
  detectCeremonyReceptionSplit,
  decideCeremonyVenueIdMove,
  diffRoleSets,
  venueRoleEvidenceCount,
  type ProtectedWeddingFacts,
  type CreditRoleRow,
} from "./vendorRoleMigration";

const LOCAL_CONNECTION_STRING = "postgres://dewwey:dewwey@localhost:5442/dewwey";
// Legacy (pre-rename) venue-category roles in wedding_vendors today. Checked against the RAW
// stored role, never `translate()`'d -- V9_TO_D056 maps 'hotel' -> 'accommodations' (a sensible
// default for callers who just want a display name), which would make `translate(r.role) ===
// "hotel"` never match anything and silently let hotel rows fall through into the generic
// non-venue reconciliation path instead of the explicit hotel rule below.
const VENUE_CATEGORY_ROLES = new Set(["venue", "hotel"]);
const MENTION_INFERENCE_EXCLUDED_ROLES = new Set(["venue", "hotel", "accommodations", "venue_management", "other"]);
const TOP_N = 25;

function parseArgs() {
  const argv = process.argv.slice(2);
  const batchIdx = argv.indexOf("--batch-id");
  const batchId = batchIdx !== -1 ? argv[batchIdx + 1] : undefined;
  const apply = argv.includes("--apply");
  const rehearsal = argv.includes("--rehearsal");
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[migrate-vendor-roles-v2] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/graph/migrateVendorRolesV2.ts --batch-id <id> [--apply] [--rehearsal]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  return { batchId, apply, rehearsal };
}

async function localDbReachable(): Promise<boolean> {
  const probe = new Pool({ connectionString: LOCAL_CONNECTION_STRING, max: 1, connectionTimeoutMillis: 1500 });
  try {
    await probe.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

function topN(m: Map<string, number>, n: number): Array<[string, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function bump(m: Map<string, number>, key: string, by = 1) {
  m.set(key, (m.get(key) ?? 0) + by);
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface RawV10Row {
  wedding_id: string;
  post_id: string;
  post_url: string;
  line_no: number;
  label_raw: string;
  handle: string;
  role: string; // a VENDOR_ROLES slug, or 'participant:<role>'
  event_context: string;
  source: string;
  rule_id: string | null;
  account_id: string | null; // null = handle didn't resolve to a known account
}

interface DerivedCredit {
  weddingId: string;
  postId: string;
  accountId: string;
  role: string; // D056 vendor slug
  eventContext: string;
  labelRaw: string | null;
  source: string;
  parserVersion: string;
}

interface DerivedParticipant {
  weddingId: string;
  accountId: string;
  participantRole: string;
  source: string;
}

interface ExistingVendorRow {
  weddingId: string;
  accountId: string;
  role: string; // legacy (pre-rename) vendor_role string
  nConfirmations: number;
}

// A single `wedding_vendors` change, computed once in step 2d and reused verbatim by both the
// dry-run report and the --apply write path -- see the file header. `keep` is informational only
// (a protected wedding's role kept despite no v10 support) and is never written or logged.
type WvOp =
  | { op: "hotel_rule"; weddingId: string; accountId: string; newRole: "venue" | "accommodations"; nConfirmations: number }
  | { op: "insert"; weddingId: string; accountId: string; role: string; nConfirmations: number }
  | { op: "delete"; weddingId: string; accountId: string; role: string; note: string }
  | { op: "keep"; weddingId: string; accountId: string; role: string; note: string };

function wvOpLine(o: WvOp): string {
  switch (o.op) {
    case "hotel_rule": return `wedding=${o.weddingId} account=${o.accountId} hotel -> ${o.newRole} (hotel rule)`;
    case "insert": return `wedding=${o.weddingId} account=${o.accountId} INSERT ${o.role}`;
    case "delete": return `wedding=${o.weddingId} account=${o.accountId} DELETE ${o.role} (${o.note})`;
    case "keep": return `wedding=${o.weddingId} account=${o.accountId} KEEP ${o.role} (${o.note})`;
  }
}

// A single `weddings` change (ceremony_venue_id, and venue_id when unprotected) from step 2e.
interface WeddingOp {
  weddingId: string;
  ceremonyAccountId: number;
  receptionAccountId: number;
  venueIdMoved: boolean; // true only for an unprotected wedding whose venue_id === the ceremony account
  oldVenueId: string | null;
  newVenueId: string | null; // equals oldVenueId when venue_id isn't moving (protected, or already correct)
  note: string;
}

async function main() {
  const { batchId, apply, rehearsal } = parseArgs();

  if (rehearsal) {
    const reachable = await localDbReachable();
    if (!reachable) {
      console.log(
        "[migrate-vendor-roles-v2] --rehearsal requested but the local Docker DB (localhost:5442) " +
          "is unreachable -- skipping this run entirely. Start it with `docker compose up -d` in " +
          "pipeline/ and re-run."
      );
      return;
    }
    process.env.LOCAL_PG = "1";
    console.log("[migrate-vendor-roles-v2] --rehearsal: using the local Docker rehearsal DB (localhost:5442)");
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`[migrate-vendor-roles-v2] mode: ${apply ? "APPLY (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[migrate-vendor-roles-v2] batch_id: ${batchId}  parser_version: ${STACK_PARSER_V2_VERSION}`);

    // =========================================================================================
    // Step 2a: protected set.
    // =========================================================================================
    const [thisVenueRows, humanLabelRows, structuralRows, extractedRows, aliasRows, websearchLocRows, weddingRows] =
      await Promise.all([
        client.query<{ wedding_id: string }>(
          `select distinct wp.wedding_id::text
           from wedding_posts wp join posts p on p.id = wp.post_id
           join post_venue_verdicts_current v on v.post_url = p.url
           where v.verdict = 'THIS_VENUE' and v.reviewed_by in ('jeremy','fable-structured')`
        ),
        client.query<{ wedding_id: string }>(
          `select distinct wp.wedding_id::text
           from wedding_posts wp join posts p on p.id = wp.post_id
           join human_post_labels hpl on hpl.post_url = p.url`
        ),
        client.query<{ wedding_id: string }>(
          `select distinct wp.wedding_id::text
           from wedding_posts wp join posts p on p.id = wp.post_id
           join jeremy_wedding_candidate_posts cp on cp.source_post_url = p.url
           join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
           where jwc.venue_anchor_source in ('location_tag','author','extracted')`
        ),
        client.query<{ wedding_id: string }>(
          `select distinct wp.wedding_id::text
           from wedding_posts wp join posts p on p.id = wp.post_id
           join extracted_venue_anchors eva on eva.post_url = p.url`
        ),
        client.query<{ alias_account_id: string; canonical_account_id: string }>(
          `select alias_account_id::text, canonical_account_id::text from account_aliases`
        ),
        client.query<{ account_id: string }>(
          `select account_id::text from account_locations where source in ('websearch','google_maps')`
        ),
        client.query<{ id: string; venue_id: string | null }>(`select id::text, venue_id::text from weddings`),
      ]);

    const thisVenueSet = new Set(thisVenueRows.rows.map((r) => r.wedding_id));
    const humanLabelSet = new Set(humanLabelRows.rows.map((r) => r.wedding_id));
    const structuralSet = new Set(structuralRows.rows.map((r) => r.wedding_id));
    const extractedSet = new Set(extractedRows.rows.map((r) => r.wedding_id));
    const aliasAccountIdSet = new Set([
      ...aliasRows.rows.map((r) => r.alias_account_id),
      ...aliasRows.rows.map((r) => r.canonical_account_id),
    ]);
    const websearchAccountIdSet = new Set(websearchLocRows.rows.map((r) => r.account_id));

    const weddingVenueId = new Map<string, string | null>();
    const weddingFacts = new Map<string, ProtectedWeddingFacts>();
    for (const w of weddingRows.rows) {
      weddingVenueId.set(w.id, w.venue_id);
      weddingFacts.set(w.id, {
        hasHumanThisVenueVerdict: thisVenueSet.has(w.id),
        hasHumanPostLabel: humanLabelSet.has(w.id),
        hasStructuralVenueAnchor: structuralSet.has(w.id),
        hasExtractedVenueAnchor: extractedSet.has(w.id),
        venueIsAliasAccount: w.venue_id != null && aliasAccountIdSet.has(w.venue_id),
        venueHasWebVerifiedLocation: w.venue_id != null && websearchAccountIdSet.has(w.venue_id),
      });
    }
    const protectedWeddingIds = new Set(
      [...weddingFacts.entries()].filter(([, f]) => isProtectedWedding(f)).map(([id]) => id)
    );
    console.log(`\n[migrate-vendor-roles-v2] protected set: ${protectedWeddingIds.size} of ${weddingRows.rows.length} documented weddings`);

    // =========================================================================================
    // Step 2b: derive credits from stack_extraction_entries_v2.
    // =========================================================================================
    const { rows: rawV10 } = await client.query<RawV10Row>(
      `select
         wp.wedding_id::text as wedding_id,
         wp.post_id::text as post_id,
         se.post_url,
         se.line_no,
         se.label_raw,
         se.handle,
         se.role,
         se.event_context,
         se.source,
         se.rule_id,
         coalesce(al.canonical_account_id, a.id)::text as account_id
       from wedding_posts wp
       join posts p on p.id = wp.post_id
       join stack_extraction_entries_v2 se on se.post_url = p.url and se.parser_version = $1
       left join accounts a on lower(a.username::text) = se.handle
       left join account_aliases al on al.alias_account_id = a.id`,
      [STACK_PARSER_V2_VERSION]
    );

    const weddingsWithAnyV10Row = new Set(rawV10.map((r) => r.wedding_id));

    const credits: DerivedCredit[] = [];
    const participants: DerivedParticipant[] = [];
    let unresolvedHandleRows = 0;
    let nonVendorRoleRows = 0; // role slug exists but is_vendor=false (press_feature/noise), or an unrecognized role string
    const creditsBySource = new Map<string, number>();
    const creditsByRole = new Map<string, number>();
    const creditsByEventContext = new Map<string, number>();

    for (const r of rawV10) {
      if (r.role.startsWith("participant:")) {
        if (!r.account_id) { unresolvedHandleRows++; continue; }
        participants.push({
          weddingId: r.wedding_id,
          accountId: r.account_id,
          participantRole: r.role.slice("participant:".length),
          source: r.source,
        });
        continue;
      }
      const def = ROLE_BY_SLUG.get(r.role);
      if (!def || !def.isVendor) { nonVendorRoleRows++; continue; }
      if (!r.account_id) { unresolvedHandleRows++; continue; }
      credits.push({
        weddingId: r.wedding_id,
        postId: r.post_id,
        accountId: r.account_id,
        role: r.role,
        eventContext: r.event_context,
        labelRaw: r.label_raw,
        source: r.source,
        parserVersion: STACK_PARSER_V2_VERSION,
      });
      bump(creditsBySource, r.source);
      bump(creditsByRole, r.role);
      bump(creditsByEventContext, r.event_context);
    }

    console.log(
      `\n[migrate-vendor-roles-v2] v10 raw rows: ${rawV10.length} (weddings touched: ${weddingsWithAnyV10Row.size})`
    );
    console.log(`[migrate-vendor-roles-v2] vendor credits derived: ${credits.length}  participant rows: ${participants.length}`);
    console.log(`[migrate-vendor-roles-v2] unresolved handle (no matching account): ${unresolvedHandleRows}`);
    console.log(`[migrate-vendor-roles-v2] non-vendor rows skipped (press_feature/noise/unrecognized): ${nonVendorRoleRows}`);

    // =========================================================================================
    // Step 2c: stage-2b mention inference.
    // =========================================================================================
    const { rows: mentionCandidatePosts } = await client.query<{
      wedding_id: string;
      post_id: string;
      post_url: string;
      mentions: string[];
    }>(
      `select wp.wedding_id::text, wp.post_id::text, sp.post_url, sp.mentions
       from wedding_posts wp
       join posts p on p.id = wp.post_id
       join staging.instagram_posts sp on sp.post_url = p.url
       where jsonb_typeof(sp.mentions) = 'array' and jsonb_array_length(sp.mentions) >= 3
         and not exists (
           select 1 from stack_extraction_entries_v2 se
           where se.post_url = sp.post_url and se.parser_version = $1
         )`,
      [STACK_PARSER_V2_VERSION]
    );

    // Pre-index what step 2b already found, so mention inference never overwrites or duplicates it.
    const creditsByWeddingAccount = new Map<string, Set<string>>(); // "wedding|account" -> roles
    const creditsByWedding = new Map<string, CreditRoleRow[]>(); // for detectCeremonyReceptionSplit
    const participantAccountsByWedding = new Map<string, Set<string>>();
    // "wedding|account|role" -> number of credit rows supporting it, used as the new
    // wedding_vendors row's n_confirmations when the --apply path inserts one.
    const creditCountByWAR = new Map<string, number>();
    function indexCredit(c: DerivedCredit) {
      const key = `${c.weddingId}|${c.accountId}`;
      let s = creditsByWeddingAccount.get(key);
      if (!s) { s = new Set(); creditsByWeddingAccount.set(key, s); }
      s.add(c.role);
      let list = creditsByWedding.get(c.weddingId);
      if (!list) { list = []; creditsByWedding.set(c.weddingId, list); }
      list.push({ accountId: Number(c.accountId), role: c.role, eventContext: c.eventContext });
      bump(creditCountByWAR, `${c.weddingId}|${c.accountId}|${c.role}`);
    }
    for (const c of credits) indexCredit(c);
    for (const p of participants) {
      let s = participantAccountsByWedding.get(p.weddingId);
      if (!s) { s = new Set(); participantAccountsByWedding.set(p.weddingId, s); }
      s.add(p.accountId);
    }

    let mentionPostsQualifying = 0;
    let mentionHandlesTotal = 0;
    const mentionExcludedReasons = new Map<string, number>();
    const mentionInferredByRole = new Map<string, number>();
    const mentionInferredCredits: DerivedCredit[] = [];

    if (mentionCandidatePosts.length > 0) {
      mentionPostsQualifying = mentionCandidatePosts.length;
      const allHandles = new Set<string>();
      for (const p of mentionCandidatePosts) {
        for (const raw of p.mentions ?? []) {
          const h = String(raw).replace(/^@/, "").trim().toLowerCase();
          if (h) allHandles.add(h);
        }
      }
      mentionHandlesTotal = allHandles.size;

      const { rows: resolvedHandles } = await client.query<{ handle: string; account_id: string }>(
        `select lower(a.username::text) as handle, coalesce(al.canonical_account_id, a.id)::text as account_id
         from accounts a
         left join account_aliases al on al.alias_account_id = a.id
         where lower(a.username::text) = any($1::text[])`,
        [[...allHandles]]
      );
      const accountIdByHandle = new Map(resolvedHandles.map((r) => [r.handle, r.account_id]));

      const touchedAccountIds = new Set(accountIdByHandle.values());
      let topTagRows: Array<{ account_id: string; role: string; source: string; evidence_count: number }> = [];
      if (touchedAccountIds.size > 0) {
        const { rows } = await client.query<{ account_id: string; role: string; source: string; evidence_count: number }>(
          `select distinct on (account_id) account_id::text, role::text, source::text, evidence_count
           from account_tags
           where account_id = any($1::bigint[])
           order by account_id, evidence_count desc, confidence desc`,
          [[...touchedAccountIds]]
        );
        topTagRows = rows;
      }
      const topTagByAccount = new Map(topTagRows.map((r) => [r.account_id, r]));

      for (const post of mentionCandidatePosts) {
        for (const raw of post.mentions ?? []) {
          const handle = String(raw).replace(/^@/, "").trim().toLowerCase();
          if (!handle) continue;
          const accountId = accountIdByHandle.get(handle);
          if (!accountId) { bump(mentionExcludedReasons, "unresolved_handle"); continue; }
          const top = topTagByAccount.get(accountId);
          if (!top || top.source !== "wedding_credit" || top.evidence_count < 3) {
            bump(mentionExcludedReasons, "not_eligible_role_evidence"); continue;
          }
          if (MENTION_INFERENCE_EXCLUDED_ROLES.has(top.role)) { bump(mentionExcludedReasons, "excluded_role"); continue; }
          if (participantAccountsByWedding.get(post.wedding_id)?.has(accountId)) { bump(mentionExcludedReasons, "is_participant"); continue; }
          if (creditsByWeddingAccount.get(`${post.wedding_id}|${accountId}`)?.size) { bump(mentionExcludedReasons, "already_credited"); continue; }

          const inferred: DerivedCredit = {
            weddingId: post.wedding_id,
            postId: post.post_id,
            accountId,
            role: top.role,
            eventContext: "wedding_day",
            labelRaw: null,
            source: "mention_inferred",
            parserVersion: STACK_PARSER_V2_VERSION,
          };
          mentionInferredCredits.push(inferred);
          indexCredit(inferred);
          bump(mentionInferredByRole, top.role);
        }
      }
    }
    console.log(
      `\n[migrate-vendor-roles-v2] stage 2b: ${mentionPostsQualifying} qualifying post(s) (>=3 mentions, zero v10 rows), ` +
        `${mentionHandlesTotal} distinct handle(s) mentioned`
    );
    console.log(`[migrate-vendor-roles-v2] mention-inferred credits: ${mentionInferredCredits.length}`);
    for (const [role, n] of topN(mentionInferredByRole, TOP_N)) console.log(`    ${role}: ${n}`);
    console.log(`[migrate-vendor-roles-v2] mention exclusions:`);
    for (const [reason, n] of [...mentionExcludedReasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${reason}: ${n}`);

    // =========================================================================================
    // Step 2d: re-role wedding_vendors.
    // =========================================================================================
    const { rows: existingRows } = await client.query<{
      wedding_id: string; account_id: string; role: string; n_confirmations: number;
    }>(`select wedding_id::text, account_id::text, role::text, n_confirmations from wedding_vendors`);

    const existingByWedding = new Map<string, ExistingVendorRow[]>();
    for (const r of existingRows) {
      const row: ExistingVendorRow = { weddingId: r.wedding_id, accountId: r.account_id, role: r.role, nConfirmations: r.n_confirmations };
      let list = existingByWedding.get(r.wedding_id);
      if (!list) { list = []; existingByWedding.set(r.wedding_id, list); }
      list.push(row);
    }

    let noV10CoverageWeddings = 0;
    let noV10CreditForAccountRows = 0;
    let rowsInserted = 0;
    let rowsDeleted = 0;
    let rowsProtectedKept = 0;
    let hotelToVenue = 0;
    let hotelToAccommodations = 0;
    let participantAccountsMoved = 0;
    let participantVendorRowsDeleted = 0;
    let participantOnProtectedWedding = 0;
    // Every real wedding_vendors change, unlimited -- drives BOTH the printed sample (first 40,
    // via wvOpLine) and the --apply write path. "keep" entries are informational only (never
    // written, never logged to vendor_role_migrations).
    const wvOps: WvOp[] = [];
    const hotelRuleAffectedAccountIds = new Set<string>();
    // Post-migration role set per "wedding|account", used both for reporting and for the
    // Universe A "after" simulation below. Weddings with NO v10 row at all carry their existing
    // rows through verbatim (translated to the post-rename slug) -- untouched by this script,
    // but still part of the honest "after" picture.
    const finalRoleSet = new Map<string, Set<string>>();

    function translate(oldRole: string): string {
      return V9_TO_D056[oldRole] ?? oldRole;
    }

    for (const [weddingId, rows] of existingByWedding) {
      const venueId = weddingVenueId.get(weddingId) ?? null;
      const protectedW = protectedWeddingIds.has(weddingId);
      // "No v10 coverage" is a per-WEDDING fact (zero stack_extraction_entries_v2 rows on any of
      // its posts) that gates ONLY the non-venue-category reconciliation below. The venue rule
      // (never touch) and the hotel rule (always apply) do NOT depend on v10 at all -- they only
      // need wedding_vendors + weddings.venue_id, both of which exist regardless of parsing, and
      // the hotel rule's whole point is to retire `hotel` from use everywhere in this one batch
      // (D056 decision E names "338 rows / 116 accounts migrate by that rule" -- not "the v10-
      // covered subset of them").
      const hasV10 = weddingsWithAnyV10Row.has(weddingId);
      if (!hasV10) noV10CoverageWeddings++;

      // Group this wedding's existing rows by account.
      const byAccount = new Map<string, ExistingVendorRow[]>();
      for (const r of rows) {
        let list = byAccount.get(r.accountId);
        if (!list) { list = []; byAccount.set(r.accountId, list); }
        list.push(r);
      }
      // Every account that has a v10 vendor credit on this wedding (possibly with no existing
      // row at all) must also be visited, so brand-new credits get inserted. Empty when the
      // wedding has no v10 coverage at all.
      const creditedAccountIds = new Set(
        [...creditsByWeddingAccount.keys()].filter((k) => k.startsWith(`${weddingId}|`)).map((k) => k.split("|")[1])
      );
      const allAccountIds = new Set([...byAccount.keys(), ...creditedAccountIds]);

      for (const accountId of allAccountIds) {
        const existing = byAccount.get(accountId) ?? [];
        const key = `${weddingId}|${accountId}`;
        const finalRoles = new Set<string>();

        const venueRow = existing.find((r) => r.role === "venue");
        const hotelRow = existing.find((r) => r.role === "hotel");
        const nonVenueExisting = existing.filter((r) => !VENUE_CATEGORY_ROLES.has(r.role));

        if (venueRow) finalRoles.add("venue"); // NEVER changed, NEVER deleted, anywhere.

        if (hotelRow) {
          const outcome = applyHotelRule(Number(accountId), venueId != null ? Number(venueId) : null);
          finalRoles.add(outcome);
          hotelRuleAffectedAccountIds.add(accountId);
          if (outcome === "venue") hotelToVenue++; else hotelToAccommodations++;
          wvOps.push({ op: "hotel_rule", weddingId, accountId, newRole: outcome, nConfirmations: hotelRow.nConfirmations });
        }

        const isParticipantOnly =
          participantAccountsByWedding.get(weddingId)?.has(accountId) &&
          !creditedAccountIds.has(accountId);

        if (isParticipantOnly) {
          // Participants are never vendors -- delete every non-venue-category row (any wedding,
          // protected included -- explicit exception; venue/hotel rows above are untouched by
          // this branch since they're handled separately and "never delete a venue row anywhere"
          // applies unconditionally).
          participantAccountsMoved++;
          if (protectedW) participantOnProtectedWedding++;
          for (const r of nonVenueExisting) {
            participantVendorRowsDeleted++;
            rowsDeleted++;
            wvOps.push({
              op: "delete",
              weddingId,
              accountId,
              role: translate(r.role),
              note: `participant-only${protectedW ? ", PROTECTED wedding -- still deleted (participants are never vendors)" : ""}`,
            });
          }
          // finalRoles gets nothing from nonVenueExisting -- they're gone.
        } else if (!hasV10) {
          // Wedding has zero v10 coverage at all -- leave every non-venue-category row exactly
          // as it is (venue/hotel above are already handled unconditionally).
          for (const r of nonVenueExisting) finalRoles.add(translate(r.role));
        } else {
          const targetRoles = [...(creditsByWeddingAccount.get(key) ?? new Set<string>())];
          if (targetRoles.length === 0) {
            // No v10 vendor credit for THIS account on THIS wedding (even though the wedding as
            // a whole has v10 coverage) -- leave its existing non-venue rows exactly as they are.
            noV10CreditForAccountRows += nonVenueExisting.length;
            for (const r of nonVenueExisting) finalRoles.add(translate(r.role));
          } else {
            const diff = diffRoleSets(nonVenueExisting.map((r) => translate(r.role)), targetRoles);
            for (const r of diff.unchanged) finalRoles.add(r);
            for (const r of diff.toInsert) {
              finalRoles.add(r);
              rowsInserted++;
              const nConfirmations = creditCountByWAR.get(`${weddingId}|${accountId}|${r}`) ?? 1;
              wvOps.push({ op: "insert", weddingId, accountId, role: r, nConfirmations });
            }
            for (const r of diff.toDelete) {
              if (protectedW) {
                rowsProtectedKept++;
                finalRoles.add(r); // kept despite no supporting v10 credit
                wvOps.push({ op: "keep", weddingId, accountId, role: r, note: "protected, no v10 support" });
              } else {
                rowsDeleted++;
                wvOps.push({ op: "delete", weddingId, accountId, role: r, note: "no v10 support" });
              }
            }
          }
        }
        finalRoleSet.set(key, finalRoles);
      }
    }

    console.log(`\n[migrate-vendor-roles-v2] weddings with NO v10 coverage at all (untouched): ${noV10CoverageWeddings}`);
    console.log(`[migrate-vendor-roles-v2] existing non-venue rows with no v10 credit for that account (untouched): ${noV10CreditForAccountRows}`);
    console.log(`[migrate-vendor-roles-v2] wedding_vendors rows: insert=${rowsInserted} delete=${rowsDeleted} protected-kept=${rowsProtectedKept}`);
    console.log(`[migrate-vendor-roles-v2] hotel rule: -> venue=${hotelToVenue}  -> accommodations=${hotelToAccommodations}`);
    console.log(`[migrate-vendor-roles-v2] participant accounts moved: ${participantAccountsMoved} (vendor rows deleted for them: ${participantVendorRowsDeleted}, on a protected wedding: ${participantOnProtectedWedding})`);
    console.log(`[migrate-vendor-roles-v2] sample changes (up to 40 of ${wvOps.length} total):`);
    for (const o of wvOps.slice(0, 40)) console.log(`    ${wvOpLine(o)}`);

    // =========================================================================================
    // Step 2e: ceremony/reception split. Follow-up (coordinator, same day): a protected
    // (human-verdict) wedding no longer REFUSES the whole run -- it always gets
    // `ceremony_venue_id` set (purely additive metadata), and only an UNPROTECTED wedding whose
    // `venue_id` currently equals the ceremony account also moves `venue_id` to the reception
    // account. `weddings.venue_id` itself is untouched on a protected wedding, so "protecting
    // venues that are already right" still holds -- the wedding just also remembers its ceremony
    // site. Every split always produces exactly one WeddingOp (ceremony_venue_id, and venue_id
    // when it moves); `venueIdMoved` distinguishes the two counts the coordinator asked to see
    // reported separately.
    // =========================================================================================
    let ceremonyReceptionSplitsFound = 0;
    let venueIdMoves = 0;
    let protectedCeremonyOnlyCount = 0;
    const weddingOps: WeddingOp[] = [];
    for (const [weddingId, weddingCredits] of creditsByWedding) {
      const split = detectCeremonyReceptionSplit(weddingCredits);
      if (!split) continue;
      ceremonyReceptionSplitsFound++;
      const venueIdStr = weddingVenueId.get(weddingId) ?? null;
      const venueIdNum = venueIdStr != null ? Number(venueIdStr) : null;
      const facts = weddingFacts.get(weddingId);
      const decision = decideCeremonyVenueIdMove(venueIdNum, split, !!facts && isProtectedByHumanVerdict(facts));

      if (decision === "no_move_needed") {
        // ceremony_venue_id is still worth recording -- venue_id was never the ceremony account
        // here (already the reception account, or a third account entirely), so there's nothing
        // to move.
        weddingOps.push({
          weddingId,
          ceremonyAccountId: split.ceremonyAccountId,
          receptionAccountId: split.receptionAccountId,
          venueIdMoved: false,
          oldVenueId: venueIdStr,
          newVenueId: venueIdStr,
          note: "ceremony_venue_id only (venue_id already not the ceremony account)",
        });
      } else if (decision === "protected_ceremony_only") {
        protectedCeremonyOnlyCount++;
        weddingOps.push({
          weddingId,
          ceremonyAccountId: split.ceremonyAccountId,
          receptionAccountId: split.receptionAccountId,
          venueIdMoved: false,
          oldVenueId: venueIdStr,
          newVenueId: venueIdStr,
          note: "ceremony_venue_id only (protected)",
        });
      } else {
        venueIdMoves++;
        weddingOps.push({
          weddingId,
          ceremonyAccountId: split.ceremonyAccountId,
          receptionAccountId: split.receptionAccountId,
          venueIdMoved: true,
          oldVenueId: venueIdStr,
          newVenueId: String(split.receptionAccountId),
          note: "ceremony_reception_split",
        });
      }
    }
    console.log(
      `\n[migrate-vendor-roles-v2] ceremony+reception splits found: ${ceremonyReceptionSplitsFound}  ` +
        `venue_id moves (unprotected): ${venueIdMoves}  ceremony_venue_id only, venue_id untouched (protected): ${protectedCeremonyOnlyCount}`
    );
    for (const o of weddingOps.filter((o) => o.venueIdMoved).slice(0, 20)) {
      console.log(`    wedding=${o.weddingId} venue_id ${o.oldVenueId} (ceremony) -> ${o.newVenueId} (reception)`);
    }
    for (const o of weddingOps.filter((o) => o.note === "ceremony_venue_id only (protected)").slice(0, 20)) {
      console.log(`    wedding=${o.weddingId} ceremony_venue_id=${o.ceremonyAccountId} set, venue_id=${o.oldVenueId} UNCHANGED (protected)`);
    }

    // =========================================================================================
    // Report: credits derived.
    // =========================================================================================
    console.log(`\n[migrate-vendor-roles-v2] credits derived by source:`);
    for (const [k, n] of topN(creditsBySource, TOP_N)) console.log(`    ${k}: ${n}`);
    console.log(`[migrate-vendor-roles-v2] credits derived by role (top ${TOP_N}):`);
    for (const [k, n] of topN(creditsByRole, TOP_N)) console.log(`    ${k}: ${n}`);
    console.log(`[migrate-vendor-roles-v2] credits derived by event_context:`);
    for (const [k, n] of topN(creditsByEventContext, TOP_N)) console.log(`    ${k}: ${n}`);

    // =========================================================================================
    // Step 2f: hard stops + Universe A coverage before/after.
    // =========================================================================================
    // hardStopViolations accumulates every reason --apply would refuse to write. Structurally,
    // rowsDeleted/rowsInserted above can never include a venue-category role (venue/hotel never
    // enter diffRoleSets, and the hotel rule only ever converts, never deletes), venue_id can only
    // ever change inside the ceremony/reception branch above, and (follow-up, same day) a
    // protected wedding no longer refuses the run at all -- it just keeps venue_id untouched. So
    // the only invariant left to check here is the one that genuinely depends on runtime data:
    // Universe A coverage.
    const hardStopViolations: string[] = [];

    // Universe A ("listed on /venues"), BEFORE -- identical predicate to reportVenueCoverage.ts /
    // lib/server/vendors.ts post-parent-edit: 'venue' always lists; 'hotel' or 'accommodations'
    // list only when the account anchors >=1 documented wedding (weddings.venue_id = the account).
    const { rows: beforeListed } = await client.query<{ id: string; weddings: number }>(
      `select a.id::text, coalesce(wc.n_weddings, 0)::int as weddings
       from accounts a
       join v_account_role var on var.account_id = a.id
       left join account_locations al on al.account_id = a.id
       left join (
         select venue_id, count(*) as n_weddings from weddings where venue_id is not null group by venue_id
       ) wc on wc.venue_id = a.id
       where al.in_metro
         -- var.role::text (not a bare enum-literal comparison): on the live, not-yet-migrated
         -- DB, 'accommodations' isn't a valid vendor_role label yet -- alter type ... rename
         -- value hasn't run -- so comparing the RAW enum column against that literal would fail
         -- to even parse ("invalid input value for enum vendor_role"). Casting to text sidesteps
         -- that entirely and is correct both before and after the real schema migration runs.
         and (var.role::text = 'venue' or (var.role::text in ('hotel', 'accommodations') and coalesce(wc.n_weddings, 0) > 0))
         and not exists (select 1 from account_aliases x where x.alias_account_id = a.id)`
    );
    const beforeListedIds = new Set(beforeListed.map((r) => r.id));
    const beforeCountableWeddings = beforeListed.reduce((a, r) => a + r.weddings, 0);

    // Simulated venue_id per wedding -- built BEFORE the votes below, because the venue-role
    // evidence bonus (next block) needs it. Original venue_id, except the ceremony/reception
    // moves computed in step 2e (weddingOps with venueIdMoved=true); a protected wedding's
    // venue_id is never in that set, matching the real write path.
    const simulatedVenueIdByWedding = new Map(weddingVenueId);
    for (const o of weddingOps) {
      if (o.venueIdMoved) simulatedVenueIdByWedding.set(o.weddingId, o.newVenueId);
    }
    const simulatedWeddingCountByVenue = new Map<string, number>();
    for (const venueId of simulatedVenueIdByWedding.values()) {
      if (venueId == null) continue;
      bump(simulatedWeddingCountByVenue, venueId);
    }

    // Universe A AFTER -- simulated. Rebuild account_tags' 'wedding_credit' source wholesale from
    // finalRoleSet (the complete post-migration wedding_vendors picture assembled above -- both
    // touched and untouched weddings are represented in it), then run pickTopRoles the same way
    // v_account_role does. account_locations / account_aliases are untouched by this migration,
    // so they carry over unchanged. Follow-up (coordinator, same day): mirrors
    // refreshAccountRoleTagsFromWeddings.ts's anchor bonus -- for role 'venue' ONLY, evidence_count
    // also counts every wedding whose (simulated) venue_id is this account, so an account that
    // really is a wedding's venue can't be knocked off top-role by an unrelated stray credit.
    const { rows: allTagRows } = await client.query<{ account_id: string; role: string; source: string; confidence: number; evidence_count: number }>(
      `select account_id::text, role::text, source::text, confidence, evidence_count from account_tags`
    );
    const simulatedVotes: RoleVote[] = [];
    for (const r of allTagRows) {
      if (r.source === "wedding_credit") continue; // replaced wholesale below
      simulatedVotes.push({ accountId: Number(r.account_id), role: r.role, source: r.source, confidence: r.confidence, evidenceCount: r.evidence_count });
    }
    const weddingCountByAccountRole = new Map<string, Set<string>>(); // "account|role" -> distinct wedding ids
    for (const [key, roles] of finalRoleSet) {
      const [weddingId, accountId] = key.split("|");
      for (const role of roles) {
        const k = `${accountId}|${role}`;
        let s = weddingCountByAccountRole.get(k);
        if (!s) { s = new Set(); weddingCountByAccountRole.set(k, s); }
        s.add(weddingId);
      }
    }
    for (const [k, weddingIds] of weddingCountByAccountRole) {
      const [accountId, role] = k.split("|");
      const evidenceCount = venueRoleEvidenceCount(role, weddingIds.size, simulatedWeddingCountByVenue.get(accountId) ?? 0);
      simulatedVotes.push({
        accountId: Number(accountId),
        role,
        source: "wedding_credit",
        confidence: weddingCreditConfidence(evidenceCount),
        evidenceCount,
      });
    }
    const simulatedTopRoles = pickTopRoles(simulatedVotes);

    const { rows: locRows } = await client.query<{ account_id: string; in_metro: boolean | null }>(
      `select account_id::text, in_metro from account_locations`
    );
    const inMetroByAccount = new Map(locRows.map((r) => [r.account_id, r.in_metro === true]));

    const afterListedIds = new Set<string>();
    let afterCountableWeddings = 0;
    for (const [accountId, top] of simulatedTopRoles) {
      const idStr = String(accountId);
      if (!inMetroByAccount.get(idStr)) continue;
      if (aliasAccountIdSet.has(idStr) && aliasRows.rows.some((r) => r.alias_account_id === idStr)) continue; // is an alias account
      const weddings = simulatedWeddingCountByVenue.get(idStr) ?? 0;
      if (top.role === "venue" || ((top.role === "hotel" || top.role === "accommodations") && weddings > 0)) {
        afterListedIds.add(idStr);
        afterCountableWeddings += weddings;
      }
    }

    // hotelRuleAffectedAccountIds (collected during step 2d) still names every account whose top
    // role could plausibly shift purely because ITS OWN hotel-rule outcome changed its evidence
    // mix -- kept as a belt-and-suspenders excuse category, though with the 'accommodations'
    // listing predicate and the venue anchor bonus above, a hotel-rule account is not expected to
    // drop at all anymore. A lost/gained venue NOT explained this way is a genuine violation.
    const lostVenues = [...beforeListedIds].filter((id) => !afterListedIds.has(id));
    const gainedVenues = [...afterListedIds].filter((id) => !beforeListedIds.has(id));
    const { rows: lostRows } = lostVenues.length
      ? await client.query<{ id: string; username: string }>(`select id::text, username::text from accounts where id = any($1::bigint[])`, [lostVenues])
      : { rows: [] as { id: string; username: string }[] };
    const nameOf = new Map(lostRows.map((r) => [r.id, r.username]));
    // --accept-venue-loss a,b,c: venues the user has judged correct to drop (e.g. a dance studio
    // that only ever carried a stale manual venue tag). Printed as accepted, not counted as a violation.
    const acceptArg = process.argv.indexOf("--accept-venue-loss");
    const acceptedLossNames = new Set(acceptArg >= 0 ? process.argv[acceptArg + 1].split(",").map((x) => x.trim().toLowerCase()) : []);
    const acceptedLossIds = new Set([...lostVenues].filter((id) => acceptedLossNames.has((nameOf.get(id) ?? "").toLowerCase())));
    if (acceptedLossIds.size) console.log(`[migrate-vendor-roles-v2] venue losses ACCEPTED by the user (--accept-venue-loss): ${[...acceptedLossIds].map((id) => nameOf.get(id)).join(", ")}`);
    const lostVenuesUnexplained = lostVenues.filter((id) => !hotelRuleAffectedAccountIds.has(id) && !acceptedLossIds.has(id));
    const lostVenuesHotelRule = lostVenues.filter((id) => hotelRuleAffectedAccountIds.has(id));
    const weddingsDelta = afterCountableWeddings - beforeCountableWeddings;

    const beforeWeddingsById = new Map(beforeListed.map((r) => [r.id, r.weddings]));
    const explainedWeddingsLoss = lostVenuesHotelRule.reduce((a, id) => a + (beforeWeddingsById.get(id) ?? 0), 0);
    const unexplainedWeddingsDelta = weddingsDelta + explainedWeddingsLoss;

    console.log(`\n[migrate-vendor-roles-v2] Universe A (listed on /venues) BEFORE: ${beforeListedIds.size} venues, ${beforeCountableWeddings} weddings`);
    console.log(`[migrate-vendor-roles-v2] Universe A (simulated) AFTER:  ${afterListedIds.size} venues, ${afterCountableWeddings} weddings`);
    console.log(`[migrate-vendor-roles-v2] delta: venues ${afterListedIds.size - beforeListedIds.size >= 0 ? "+" : ""}${afterListedIds.size - beforeListedIds.size}, weddings ${weddingsDelta >= 0 ? "+" : ""}${weddingsDelta}`);
    if (lostVenues.length > 0) {
      if (lostVenuesHotelRule.length > 0) {
        console.log(`[migrate-vendor-roles-v2] venues dropping off /venues, EXPLAINED by the hotel rule (${lostVenuesHotelRule.length}) -- excused, not a violation:`);
        for (const id of lostVenuesHotelRule) console.log(`    ${nameOf.get(id) ?? `account_id=${id}`}`);
      }
      if (lostVenuesUnexplained.length > 0) {
        console.log(`[migrate-vendor-roles-v2] venues dropping off /venues, UNEXPLAINED (${lostVenuesUnexplained.length}) -- with their simulated vote counts, for the parent to judge:`);
        for (const id of lostVenuesUnexplained) {
          const votes = simulatedVotes
            .filter((v) => String(v.accountId) === id)
            .sort((a, b) => b.evidenceCount - a.evidenceCount || b.confidence - a.confidence);
          const votesStr = votes.map((v) => `${v.role}(${v.source})=${v.evidenceCount}/${v.confidence.toFixed(2)}`).join(", ");
          console.log(`    ${nameOf.get(id) ?? `account_id=${id}`}: ${votesStr || "(no votes)"}`);
        }
      }
    }
    if (gainedVenues.length > 0) console.log(`[migrate-vendor-roles-v2] venues newly listed after the migration: ${gainedVenues.length}`);

    if (lostVenuesUnexplained.length > 0 || unexplainedWeddingsDelta < 0) {
      hardStopViolations.push(
        `Universe A coverage would ${lostVenuesUnexplained.length > 0 ? `lose ${lostVenuesUnexplained.length} listed venue(s) NOT explained by the hotel rule` : ""}${lostVenuesUnexplained.length > 0 && unexplainedWeddingsDelta < 0 ? " and " : ""}${unexplainedWeddingsDelta < 0 ? `drop ${-unexplainedWeddingsDelta} countable wedding(s) beyond what the hotel rule accounts for` : ""} -- see the lists above.`
      );
    }

    console.log(`\n[migrate-vendor-roles-v2] hard-stop check: ${hardStopViolations.length === 0 ? "CLEAR -- would proceed under --apply" : "VIOLATIONS FOUND -- --apply would refuse"}`);
    for (const v of hardStopViolations) console.log(`    - ${v}`);

    // =========================================================================================
    // Printed revert SQL (human-run-by-hand only, mirrors recreditManagementCompany.ts's shape).
    // =========================================================================================
    console.log(
      `\n[migrate-vendor-roles-v2] to revert this batch by hand after a real --apply (human only):\n` +
        `  begin;\n` +
        `  -- restore re-roled/deleted wedding_vendors rows from provenance\n` +
        `  update wedding_vendors wv set role = r.old_role::vendor_role\n` +
        `    from vendor_role_migrations r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'wedding_vendors' and r.old_role is not null\n` +
        `      and wv.wedding_id = r.wedding_id and wv.account_id = r.account_id and wv.role = r.new_role::vendor_role;\n` +
        `  insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)\n` +
        `  select r.wedding_id, r.account_id, r.old_role::vendor_role, 1\n` +
        `    from vendor_role_migrations r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'wedding_vendors' and r.old_role is not null and r.new_role is null\n` +
        `  on conflict (wedding_id, account_id, role) do nothing;\n` +
        `  delete from wedding_vendors wv\n` +
        `    using vendor_role_migrations r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'wedding_vendors' and r.old_role is null and r.new_role is not null\n` +
        `      and wv.wedding_id = r.wedding_id and wv.account_id = r.account_id and wv.role = r.new_role::vendor_role;\n` +
        `  -- restore weddings.venue_id (ceremony/reception moves only -- protected/already-correct\n` +
        `  -- rows have old_venue_id = new_venue_id, so this is a no-op for them)\n` +
        `  update weddings w set venue_id = r.old_venue_id\n` +
        `    from vendor_role_migrations r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'weddings' and w.id = r.wedding_id and r.old_venue_id is distinct from r.new_venue_id;\n` +
        `  -- clear ceremony_venue_id for every wedding this batch set it on (it was null before,\n` +
        `  -- every batch row for 'weddings' set it, whether or not venue_id also moved)\n` +
        `  update weddings w set ceremony_venue_id = null\n` +
        `    from vendor_role_migrations r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'weddings' and w.id = r.wedding_id;\n` +
        `  -- remove moved participants' wedding_participants rows and NOTE (not automatic) that\n` +
        `  -- their deleted wedding_vendors rows would need re-inserting from a backup if truly needed\n` +
        `  delete from wedding_participants wp\n` +
        `    using vendor_role_migrations r\n` +
        `    where r.batch_id = '${batchId}' and r.table_name = 'wedding_participants'\n` +
        `      and wp.wedding_id = r.wedding_id and wp.account_id = r.account_id;\n` +
        `  delete from wedding_vendor_credits where parser_version = '${STACK_PARSER_V2_VERSION}';\n` +
        `  delete from vendor_role_migrations where batch_id = '${batchId}';\n` +
        `  commit;`
    );

    // =========================================================================================
    // APPLY: write everything, mirroring the diff computed above exactly (never executed by this
    // agent -- dry-run only, per standing instruction). Requires applyVendorTaxonomySchema.ts
    // --apply to have already run (wedding_vendor_credits / wedding_participants /
    // vendor_role_migrations / weddings.ceremony_venue_id must already exist).
    // =========================================================================================
    if (apply) {
      if (hardStopViolations.length > 0) {
        console.error(`\n[migrate-vendor-roles-v2] REFUSING to apply -- ${hardStopViolations.length} hard-stop violation(s) above. Nothing written.`);
        await client.query("rollback");
        process.exitCode = 1;
        return;
      }

      console.log(`\n[migrate-vendor-roles-v2] APPLYING batch_id=${batchId} ...`);
      const CHUNK = 1000;

      // 1. wedding_vendor_credits -- additive, on conflict do nothing (re-derivable, safe to
      //    re-run under the same parser_version).
      const allCredits = [...credits, ...mentionInferredCredits];
      for (let i = 0; i < allCredits.length; i += CHUNK) {
        const chunk = allCredits.slice(i, i + CHUNK);
        await client.query(
          `insert into wedding_vendor_credits (wedding_id, post_id, account_id, role, event_context, label_raw, source, parser_version)
           select u.wedding_id, u.post_id, u.account_id, u.role::vendor_role, u.event_context::wedding_event, u.label_raw, u.source, u.parser_version
           from unnest($1::bigint[], $2::bigint[], $3::bigint[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
             as u(wedding_id, post_id, account_id, role, event_context, label_raw, source, parser_version)
           on conflict (wedding_id, post_id, account_id, role, event_context) do nothing`,
          [
            chunk.map((c) => c.weddingId), chunk.map((c) => c.postId), chunk.map((c) => c.accountId),
            chunk.map((c) => c.role), chunk.map((c) => c.eventContext), chunk.map((c) => c.labelRaw),
            chunk.map((c) => c.source), chunk.map((c) => c.parserVersion),
          ]
        );
      }
      console.log(`[migrate-vendor-roles-v2] wedding_vendor_credits: upserted (on conflict do nothing) ${allCredits.length} row(s)`);

      // 2. wedding_participants -- additive, on conflict do nothing.
      for (let i = 0; i < participants.length; i += CHUNK) {
        const chunk = participants.slice(i, i + CHUNK);
        await client.query(
          `insert into wedding_participants (wedding_id, account_id, participant_role, source)
           select u.wedding_id, u.account_id, u.participant_role, u.source
           from unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[]) as u(wedding_id, account_id, participant_role, source)
           on conflict (wedding_id, account_id, participant_role) do nothing`,
          [chunk.map((p) => p.weddingId), chunk.map((p) => p.accountId), chunk.map((p) => p.participantRole), chunk.map((p) => p.source)]
        );
      }
      console.log(`[migrate-vendor-roles-v2] wedding_participants: upserted (on conflict do nothing) ${participants.length} row(s)`);

      // 3. wedding_vendors -- deletes, hotel-rule swaps, plain inserts. "keep" ops are
      //    informational only and are never written.
      const deleteOps = wvOps.filter((o): o is Extract<WvOp, { op: "delete" }> => o.op === "delete");
      const insertOps = wvOps.filter((o): o is Extract<WvOp, { op: "insert" }> => o.op === "insert");
      const hotelOps = wvOps.filter((o): o is Extract<WvOp, { op: "hotel_rule" }> => o.op === "hotel_rule");

      for (let i = 0; i < deleteOps.length; i += CHUNK) {
        const chunk = deleteOps.slice(i, i + CHUNK);
        await client.query(
          `delete from wedding_vendors wv
           using unnest($1::bigint[], $2::bigint[], $3::text[]) as u(wedding_id, account_id, role)
           where wv.wedding_id = u.wedding_id and wv.account_id = u.account_id and wv.role = u.role::vendor_role`,
          [chunk.map((o) => o.weddingId), chunk.map((o) => o.accountId), chunk.map((o) => o.role)]
        );
      }
      for (let i = 0; i < hotelOps.length; i += CHUNK) {
        const chunk = hotelOps.slice(i, i + CHUNK);
        // Delete the old 'hotel' row first, then upsert the new role -- a plain UPDATE could
        // violate the (wedding_id, account_id, role) PK if the account already independently
        // holds a row under the target role (delete-then-upsert-with-greatest merges instead,
        // same pattern as recreditManagementCompany.ts's venue->other recredit).
        await client.query(
          `delete from wedding_vendors wv
           using unnest($1::bigint[], $2::bigint[]) as u(wedding_id, account_id)
           where wv.wedding_id = u.wedding_id and wv.account_id = u.account_id and wv.role = 'hotel'`,
          [chunk.map((o) => o.weddingId), chunk.map((o) => o.accountId)]
        );
        await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           select u.wedding_id, u.account_id, u.new_role::vendor_role, u.n
           from unnest($1::bigint[], $2::bigint[], $3::text[], $4::int[]) as u(wedding_id, account_id, new_role, n)
           on conflict (wedding_id, account_id, role)
           do update set n_confirmations = greatest(wedding_vendors.n_confirmations, excluded.n_confirmations)`,
          [chunk.map((o) => o.weddingId), chunk.map((o) => o.accountId), chunk.map((o) => o.newRole), chunk.map((o) => o.nConfirmations)]
        );
      }
      for (let i = 0; i < insertOps.length; i += CHUNK) {
        const chunk = insertOps.slice(i, i + CHUNK);
        await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           select u.wedding_id, u.account_id, u.role::vendor_role, u.n
           from unnest($1::bigint[], $2::bigint[], $3::text[], $4::int[]) as u(wedding_id, account_id, role, n)
           on conflict (wedding_id, account_id, role)
           do update set n_confirmations = greatest(wedding_vendors.n_confirmations, excluded.n_confirmations)`,
          [chunk.map((o) => o.weddingId), chunk.map((o) => o.accountId), chunk.map((o) => o.role), chunk.map((o) => o.nConfirmations)]
        );
      }
      console.log(
        `[migrate-vendor-roles-v2] wedding_vendors: deleted=${deleteOps.length} hotel_rule=${hotelOps.length} inserted=${insertOps.length}`
      );

      // 4. weddings -- ceremony_venue_id always, venue_id only when it actually moves.
      for (const o of weddingOps) {
        await client.query(`update weddings set ceremony_venue_id = $1 where id = $2`, [o.ceremonyAccountId, o.weddingId]);
        if (o.venueIdMoved) {
          await client.query(`update weddings set venue_id = $1 where id = $2`, [o.newVenueId, o.weddingId]);
        }
      }
      console.log(`[migrate-vendor-roles-v2] weddings: ceremony_venue_id set on ${weddingOps.length} (venue_id moved on ${venueIdMoves})`);

      // 5. vendor_role_migrations provenance -- one row per wedding_vendors change (skip "keep"),
      //    one per weddings change (ceremony_venue_id / venue_id), one per participant moved.
      interface ProvRow {
        table_name: string; wedding_id: string; account_id: string | null;
        old_role: string | null; new_role: string | null;
        old_venue_id: string | null; new_venue_id: string | null; note: string;
      }
      const provRows: ProvRow[] = [];
      for (const o of hotelOps) {
        provRows.push({ table_name: "wedding_vendors", wedding_id: o.weddingId, account_id: o.accountId, old_role: "hotel", new_role: o.newRole, old_venue_id: null, new_venue_id: null, note: "hotel_rule" });
      }
      for (const o of insertOps) {
        provRows.push({ table_name: "wedding_vendors", wedding_id: o.weddingId, account_id: o.accountId, old_role: null, new_role: o.role, old_venue_id: null, new_venue_id: null, note: "re_role_insert" });
      }
      for (const o of deleteOps) {
        provRows.push({ table_name: "wedding_vendors", wedding_id: o.weddingId, account_id: o.accountId, old_role: o.role, new_role: null, old_venue_id: null, new_venue_id: null, note: o.note });
      }
      for (const o of weddingOps) {
        provRows.push({
          table_name: "weddings", wedding_id: o.weddingId, account_id: String(o.ceremonyAccountId),
          old_role: null, new_role: null, old_venue_id: o.oldVenueId, new_venue_id: o.newVenueId, note: o.note,
        });
      }
      for (const p of participants) {
        provRows.push({ table_name: "wedding_participants", wedding_id: p.weddingId, account_id: p.accountId, old_role: null, new_role: p.participantRole, old_venue_id: null, new_venue_id: null, note: "participant_moved" });
      }

      for (let i = 0; i < provRows.length; i += CHUNK) {
        const chunk = provRows.slice(i, i + CHUNK);
        await client.query(
          `insert into vendor_role_migrations (batch_id, table_name, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id, note)
           select $1, u.table_name, u.wedding_id, u.account_id, u.old_role, u.new_role, u.old_venue_id, u.new_venue_id, u.note
           from unnest($2::text[], $3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::bigint[], $8::bigint[], $9::text[])
             as u(table_name, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id, note)`,
          [
            batchId,
            chunk.map((r) => r.table_name), chunk.map((r) => r.wedding_id), chunk.map((r) => r.account_id),
            chunk.map((r) => r.old_role), chunk.map((r) => r.new_role),
            chunk.map((r) => r.old_venue_id), chunk.map((r) => r.new_venue_id), chunk.map((r) => r.note),
          ]
        );
      }
      console.log(`[migrate-vendor-roles-v2] vendor_role_migrations: logged ${provRows.length} row(s), batch_id=${batchId}`);

      await client.query("commit");
      console.log("\n[migrate-vendor-roles-v2] APPLIED -- COMMITTED");
      process.exitCode = 0;
      return;
    }

    await client.query("rollback");
    console.log("\n[migrate-vendor-roles-v2] DRY RUN -- rolled back, no changes committed");
    process.exitCode = hardStopViolations.length > 0 ? 1 : 0;
  } catch (e) {
    await client.query("rollback").catch(() => {});
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
