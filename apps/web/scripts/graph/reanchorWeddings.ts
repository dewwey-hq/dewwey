/**
 * D056 coverage-audit follow-up: two buckets of weddings are anchored (`weddings.venue_id`) on
 * an account that plainly isn't the venue.
 *
 *   (i)  `weddings.venue_id` points at an account whose `v_account_role.role` is NOT
 *        venue/hotel/accommodations (currently 27 weddings / 20 accounts -- the spec that
 *        commissioned this script quoted 41/26, computed before same-day role-tag work in
 *        c89cdb1 landed; this script always re-derives the live count rather than trusting a
 *        stale number, and the dry-run report below prints the live count itself).
 *   (ii) `weddings.venue_id` points at an account with NO `wedding_vendors` row at all on that
 *        wedding (currently 105 -- old-pipeline anchors from before `wedding_vendors` rows were
 *        required to back a venue_id).
 *
 * ## D056 follow-up 1 (coordinator, 2026-09-10, reviewing the first dry-run)
 *
 * The first version of this script treated both buckets identically: find another candidate
 * venue and move `venue_id` onto it. That's backwards for MOST of bucket (ii) -- e.g. wedding
 * 2135 (chicagoparks anchor, theblackstonehotel carrying the wedding's sole OTHER role='venue'
 * credit) got "moved" onto theblackstonehotel, when chicagoparks is actually a perfectly real
 * venue (12 venue credits elsewhere) that simply never got its OWN credit row on THIS wedding,
 * while theblackstonehotel's credit here looks like a stray mis-tag. The same shape repeats for
 * adlerplanet (191 credits elsewhere), chicagowinery (163), artifacteventschicago (137),
 * cityhallchicagoevents (49), rpmprivateevents (44) -- all real venues, all anchoring weddings
 * where a decor/catering/lighting vendor (eleganteventlighting, orsosrestaurant, rojogusano)
 * happened to also pick up a mis-tagged 'venue' credit.
 *
 * Fixed decision order (see weddingMaintenance.ts's `chooseReanchorTarget` for the pure logic,
 * unit-tested there):
 *   0. Protected (see below) -> untouched, reported separately.
 *   1. The CURRENT venue_id account's `v_account_role` top role is already venue-category
 *      (venue/accommodations/venue_management) -> `insert_credit`: venue_id is NOT touched,
 *      this script only backfills the missing `wedding_vendors` ('venue') row for the anchor
 *      that's already there. This is checked BEFORE rule (a)/(b) get a look, and wins outright
 *      even if there IS a competing other-venue-credit candidate (the 2135 shape) -- an
 *      already-legitimate anchor is never second-guessed by one stray credit elsewhere on the
 *      same wedding.
 *   2. Only when the current anchor is NOT venue-category (the actual bucket-(i) bug shape --
 *      lmcateringchi, entertaining_co, revel_decor, lettuceentertainyou anchoring a wedding they
 *      catered/decorated, not hosted) does a move get considered:
 *      (a) exactly one OTHER account has a role='venue' `wedding_vendors` row on that wedding,
 *          AND that account's own top role is ALSO venue-category -> `venue_id := it`.
 *      (b) else the wedding's posts' Instagram `location_tag` resolves through
 *          `location_tag_venue_map` to exactly one venue account != the current venue_id, AND
 *          that account is ALSO venue-category -> that.
 *      A rule-(a)/(b) candidate that fails the venue-category check (rojogusano,
 *      eleganteventlighting -- vendor companies, not venues) is refused outright: human queue,
 *      not silently anchored onto another wrong account.
 *   3. Else: human queue, reason names which of (a)/(b) was tried and why it didn't resolve.
 *
 * Protected set: any wedding with a `post_venue_verdicts_current` row where verdict=
 * 'THIS_VENUE' AND reviewed_by IN ('jeremy','fable-structured') on ANY of its posts is NEVER
 * touched by this script (not moved, not insert_credit'd), regardless of which bucket it's in --
 * a human already looked at this wedding's venue and confirmed it. Protected weddings are
 * reported separately, not silently skipped.
 *
 * On move: ensure a `wedding_vendors` (wedding, new venue account, 'venue', n_confirmations=1)
 * row exists (rule (b) moves can land on an account with no venue credit yet -- rule (a) moves
 * are already backed by one, `on conflict do nothing` makes the insert a no-op there). On
 * insert_credit: same insert, but for the CURRENT (unchanged) venue_id account. Log one
 * `vendor_role_migrations` row per write:
 *   - move: table_name='weddings', wedding_id, old_venue_id, new_venue_id, note='reanchor: rule
 *     (a)|(b) ...'.
 *   - insert_credit: table_name='wedding_vendors', wedding_id, account_id=the (unchanged)
 *     venue_id, new_role='venue', note='reanchor: missing venue credit for anchored venue'.
 *
 * Same dry-run-by-default, transaction-wrapped shape as the rest of scripts/graph
 * (recreditManagementCompany.ts, migrateVendorRolesV2.ts). Idempotent: re-running with --apply
 * after a prior --apply finds bucket (i)/(ii) empty for every wedding this batch already fixed
 * (its venue_id -- moved or not -- now has both a valid role AND a wedding_vendors row), so a
 * second run is a no-op for those weddings.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reanchorWeddings.ts --batch-id d056-reanchor-1              # dry run (default)
 *   bun run scripts/graph/reanchorWeddings.ts --batch-id d056-reanchor-1 --dry-run    # same, explicit
 *   bun run scripts/graph/reanchorWeddings.ts --batch-id d056-reanchor-1 --apply      # real write, human only
 */
import { getPool, closePool } from "../classify/db";
import { chooseReanchorTarget, type ReanchorInputs, type ReanchorOutcome, type ReanchorRule } from "./weddingMaintenance";

function parseArgs() {
  const argv = process.argv.slice(2);
  const batchIdx = argv.indexOf("--batch-id");
  const batchId = batchIdx !== -1 ? argv[batchIdx + 1] : undefined;
  const apply = argv.includes("--apply");
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[reanchor-weddings] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/graph/reanchorWeddings.ts --batch-id <id> [--apply]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  return { batchId, apply };
}

interface CandidateWedding {
  id: string;
  venue_id: string;
  bucket: "wrong_role" | "no_credit";
}

async function main() {
  const { batchId, apply } = parseArgs();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`[reanchor-weddings] mode: ${apply ? "APPLY (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[reanchor-weddings] batch_id: ${batchId}`);

    // ------------------------------------------------------------
    // Bucket (i): venue_id account's top role isn't venue/hotel/accommodations (or has none).
    // ------------------------------------------------------------
    const { rows: wrongRoleRows } = await client.query<{ id: string; venue_id: string }>(
      `select w.id::text, w.venue_id::text
       from weddings w
       left join v_account_role r on r.account_id = w.venue_id
       where w.venue_id is not null
         and (r.role is null or r.role not in ('venue', 'hotel', 'accommodations'))`
    );

    // ------------------------------------------------------------
    // Bucket (ii): venue_id account has zero wedding_vendors rows at all on that wedding.
    // ------------------------------------------------------------
    const { rows: noCreditRows } = await client.query<{ id: string; venue_id: string }>(
      `select w.id::text, w.venue_id::text
       from weddings w
       where w.venue_id is not null
         and not exists (
           select 1 from wedding_vendors wv where wv.wedding_id = w.id and wv.account_id = w.venue_id
         )`
    );

    const byId = new Map<string, CandidateWedding>();
    for (const r of wrongRoleRows) byId.set(r.id, { id: r.id, venue_id: r.venue_id, bucket: "wrong_role" });
    for (const r of noCreditRows) {
      if (!byId.has(r.id)) byId.set(r.id, { id: r.id, venue_id: r.venue_id, bucket: "no_credit" });
    }
    const candidates = [...byId.values()];
    const wrongRoleAccounts = new Set(wrongRoleRows.map((r) => r.venue_id)).size;

    console.log(
      `[reanchor-weddings] bucket (i) wrong-role: ${wrongRoleRows.length} weddings / ${wrongRoleAccounts} accounts` +
        ` (spec's original count: 41/26 -- see header for why the live number differs)`
    );
    console.log(`[reanchor-weddings] bucket (ii) no-credit: ${noCreditRows.length} weddings`);
    console.log(`[reanchor-weddings] union (a wedding can be in both): ${candidates.length} weddings`);

    if (candidates.length === 0) {
      console.log("[reanchor-weddings] nothing to do.");
      await client.query("rollback");
      return;
    }

    // ------------------------------------------------------------
    // Protected set: any candidate wedding with a post carrying a human THIS_VENUE verdict.
    // ------------------------------------------------------------
    const candidateIds = candidates.map((c) => c.id);
    const { rows: protectedRows } = await client.query<{ wedding_id: string }>(
      `select distinct wp.wedding_id::text
       from wedding_posts wp
       join posts p on p.id = wp.post_id
       join post_venue_verdicts_current v on v.post_url = p.url
       where wp.wedding_id = any($1::bigint[])
         and v.verdict = 'THIS_VENUE'
         and v.reviewed_by in ('jeremy', 'fable-structured')`,
      [candidateIds]
    );
    const protectedIds = new Set(protectedRows.map((r) => r.wedding_id));

    // ------------------------------------------------------------
    // Per-wedding: other venue-role wedding_vendors credits, and location-tag resolution.
    // ------------------------------------------------------------
    const { rows: otherCreditRows } = await client.query<{ wedding_id: string; account_id: string }>(
      `select wedding_id::text, account_id::text
       from wedding_vendors
       where wedding_id = any($1::bigint[]) and role = 'venue'`,
      [candidateIds]
    );
    const otherCreditsByWedding = new Map<string, string[]>();
    for (const r of otherCreditRows) {
      const list = otherCreditsByWedding.get(r.wedding_id) ?? [];
      list.push(r.account_id);
      otherCreditsByWedding.set(r.wedding_id, list);
    }

    const { rows: tagRows } = await client.query<{ wedding_id: string; venue_account_id: string }>(
      `select distinct wp.wedding_id::text, ltm.venue_account_id::text
       from wedding_posts wp
       join posts p on p.id = wp.post_id
       join staging.instagram_posts ip on ip.post_url = p.url
       join location_tag_venue_map ltm on ltm.location_tag = ip.location_tag
       where wp.wedding_id = any($1::bigint[])`,
      [candidateIds]
    );
    const tagResolvedByWedding = new Map<string, string[]>();
    for (const r of tagRows) {
      const list = tagResolvedByWedding.get(r.wedding_id) ?? [];
      list.push(r.venue_account_id);
      tagResolvedByWedding.set(r.wedding_id, list);
    }

    const accountIdsToLookUp = new Set<string>();
    for (const c of candidates) accountIdsToLookUp.add(c.venue_id);
    for (const list of otherCreditsByWedding.values()) for (const id of list) accountIdsToLookUp.add(id);
    for (const list of tagResolvedByWedding.values()) for (const id of list) accountIdsToLookUp.add(id);
    const { rows: usernameRows } = await client.query<{ id: string; username: string }>(
      `select id::text, username::text from accounts where id = any($1::bigint[])`,
      [[...accountIdsToLookUp]]
    );
    const usernameById = new Map(usernameRows.map((r) => [r.id, r.username]));

    // ------------------------------------------------------------
    // Venue-category top roles (D056 follow-up 1) for every account in play -- current anchors,
    // rule-(a) credit candidates, and rule-(b) tag-resolved candidates alike. Deliberately
    // venue/accommodations/venue_management, NOT the venue/hotel/accommodations set the bucket
    // (i) query above uses -- see the header for why (hotel retired from live use; venue_management
    // included per the coordinator's explicit direction).
    // ------------------------------------------------------------
    const { rows: venueCategoryRows } = await client.query<{ account_id: string }>(
      `select account_id::text
       from v_account_role
       where account_id = any($1::bigint[]) and role in ('venue', 'accommodations', 'venue_management')`,
      [[...accountIdsToLookUp]]
    );
    const venueCategoryAccountIds = new Set(venueCategoryRows.map((r) => Number(r.account_id)));

    // ------------------------------------------------------------
    // Decide + (if --apply) write.
    // ------------------------------------------------------------
    const moved: Array<{ wedding: CandidateWedding; outcome: Extract<ReanchorOutcome, { kind: "moved" }> }> = [];
    const insertCredit: CandidateWedding[] = [];
    const humanQueue: Array<{ wedding: CandidateWedding; reason: string }> = [];
    const protectedList: CandidateWedding[] = [];
    const ruleCounts: Record<ReanchorRule, number> = { other_venue_credit: 0, location_tag: 0 };

    for (const wedding of candidates) {
      if (protectedIds.has(wedding.id)) {
        protectedList.push(wedding);
        continue;
      }
      const input: ReanchorInputs = {
        isProtected: false,
        currentVenueAccountId: Number(wedding.venue_id),
        currentAnchorIsVenueCategory: venueCategoryAccountIds.has(Number(wedding.venue_id)),
        otherVenueCreditAccountIds: (otherCreditsByWedding.get(wedding.id) ?? []).map(Number),
        locationTagVenueAccountIds: (tagResolvedByWedding.get(wedding.id) ?? []).map(Number),
        venueCategoryAccountIds,
      };
      const outcome = chooseReanchorTarget(input);
      if (outcome.kind === "moved") {
        moved.push({ wedding, outcome });
        ruleCounts[outcome.rule]++;
        if (apply) {
          await client.query(`update weddings set venue_id = $1 where id = $2`, [outcome.newVenueAccountId, wedding.id]);
          await client.query(
            `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
             values ($1, $2, 'venue', 1)
             on conflict (wedding_id, account_id, role) do nothing`,
            [wedding.id, outcome.newVenueAccountId]
          );
          await client.query(
            `insert into vendor_role_migrations
               (batch_id, table_name, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id, note)
             values ($1, 'weddings', $2, null, null, null, $3, $4, $5)`,
            [
              batchId,
              wedding.id,
              wedding.venue_id,
              outcome.newVenueAccountId,
              `reanchor: rule ${outcome.rule === "other_venue_credit" ? "(a)" : "(b)"} (bucket ${wedding.bucket})`,
            ]
          );
        }
      } else if (outcome.kind === "insert_credit") {
        insertCredit.push(wedding);
        if (apply) {
          await client.query(
            `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
             values ($1, $2, 'venue', 1)
             on conflict (wedding_id, account_id, role) do nothing`,
            [wedding.id, wedding.venue_id]
          );
          await client.query(
            `insert into vendor_role_migrations
               (batch_id, table_name, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id, note)
             values ($1, 'wedding_vendors', $2, $3, null, 'venue', null, null, $4)`,
            [batchId, wedding.id, wedding.venue_id, `reanchor: missing venue credit for anchored venue (bucket ${wedding.bucket})`]
          );
        }
      } else if (outcome.kind === "human_queue") {
        humanQueue.push({ wedding, reason: outcome.reason });
      } else {
        // Unreachable: isProtected is always passed as `false` above (the protected check
        // already ran before chooseReanchorTarget was called), so "protected" never comes back.
        throw new Error(`[reanchor-weddings] unexpected "protected" outcome for wedding ${wedding.id}`);
      }
    }

    // ------------------------------------------------------------
    // Report.
    // ------------------------------------------------------------
    console.log(`\n[reanchor-weddings] protected (human THIS_VENUE verdict, never moved): ${protectedList.length}`);
    for (const w of protectedList) {
      console.log(`  wedding ${w.id}: venue_id=@${usernameById.get(w.venue_id) ?? w.venue_id} (bucket=${w.bucket})`);
    }

    console.log(
      `\n[reanchor-weddings] moved: ${moved.length} (rule a / other_venue_credit=${ruleCounts.other_venue_credit}, ` +
        `rule b / location_tag=${ruleCounts.location_tag})`
    );
    for (const { wedding, outcome } of moved) {
      const oldName = usernameById.get(wedding.venue_id) ?? wedding.venue_id;
      const newName = usernameById.get(String(outcome.newVenueAccountId)) ?? outcome.newVenueAccountId;
      const ruleLabel = outcome.rule === "other_venue_credit" ? "(a) other venue credit" : "(b) location tag";
      console.log(`  wedding ${wedding.id}: @${oldName} -> @${newName}  [rule ${ruleLabel}, bucket=${wedding.bucket}]`);
    }

    console.log(
      `\n[reanchor-weddings] insert_credit (anchor already venue-category, venue_id unchanged, ` +
        `backfilling its own wedding_vendors row): ${insertCredit.length}`
    );
    for (const wedding of insertCredit) {
      const name = usernameById.get(wedding.venue_id) ?? wedding.venue_id;
      console.log(`  wedding ${wedding.id}: @${name} (venue_id unchanged, bucket=${wedding.bucket})`);
    }

    console.log(`\n[reanchor-weddings] human queue: ${humanQueue.length}`);
    for (const { wedding, reason } of humanQueue) {
      const oldName = usernameById.get(wedding.venue_id) ?? wedding.venue_id;
      console.log(`  wedding ${wedding.id}: venue_id=@${oldName} (bucket=${wedding.bucket}) -- ${reason}`);
    }

    if (apply) {
      console.log(
        `\n[reanchor-weddings] to revert this batch by hand (human only):\n` +
          `  begin;\n` +
          `  update weddings w set venue_id = r.old_venue_id\n` +
          `    from vendor_role_migrations r\n` +
          `    where r.batch_id = '${batchId}' and r.table_name = 'weddings' and w.id = r.wedding_id;\n` +
          `  delete from wedding_vendors wv\n` +
          `    using vendor_role_migrations r\n` +
          `    where r.batch_id = '${batchId}' and r.table_name = 'wedding_vendors' and r.new_role = 'venue'\n` +
          `    and wv.wedding_id = r.wedding_id and wv.account_id = r.account_id and wv.role = 'venue'\n` +
          `    and wv.n_confirmations = 1; -- only the exact row this batch inserted (skip if bumped since)\n` +
          `  delete from vendor_role_migrations\n` +
          `    where batch_id = '${batchId}' and table_name in ('weddings', 'wedding_vendors');\n` +
          `  commit;\n` +
          `  -- NOTE: this does not remove any wedding_vendors ('venue', n_confirmations=1) row this\n` +
          `  -- batch INSERTED for a rule-(b) MOVE -- check those by hand if the credit itself also\n` +
          `  -- needs undoing, not just the venue_id pointer. The insert_credit deletes above ARE\n` +
          `  -- covered (n_confirmations=1 guard), but only when nothing else bumped that same row since.`
      );
      await client.query("commit");
      console.log("\n[reanchor-weddings] COMMITTED");
    } else {
      await client.query("rollback");
      console.log("\n[reanchor-weddings] DRY RUN -- rolled back, no changes committed");
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
