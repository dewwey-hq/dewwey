/**
 * D059 — attire split: targeted reclassification of already-parsed `stack_extraction_entries_v2`
 * rows currently role IN ('attire','accessories'), re-running the UPDATED classifyLabel() against
 * the already-stored label_raw and rewriting `role`/`rule_id` in place. Does NOT touch
 * post_mentions/wedding_vendors/wedding_vendor_credits/account_tags -- that reconciliation is
 * migrateVendorRolesV2.ts's job, run separately with a new --batch-id AFTER this has been applied
 * (it re-derives credits fresh from stack_extraction_entries_v2.role, so it picks up this
 * script's writes with no code change of its own).
 *
 * Why a new script instead of runStackParserV10.ts --refresh-matching: that flag deletes and
 * re-parses the WHOLE caption (handle extraction, compound splitting, emoji-line handling) --
 * unnecessary churn/risk for a pure re-bucketing of rows whose (label_raw, handle) split was
 * already correct and only needs a different role. This script only ever changes `role`/`rule_id`
 * on an existing row; it never inserts, deletes, or touches `label_raw`/`handle`/`line_no`.
 *
 * A label can (rarely) still resolve to >1 role after the split (e.g. a compound EXACT entry
 * like "bridal gown & accessories" -> [wedding_dress, veil_headpiece]). Per the plan's judgment
 * call, this script keeps only the FIRST role for that one stored row and counts/samples every
 * such case for manual review, rather than fanning one row into two -- a genuine multi-role
 * split for a previously-single-role row would be a sign the row needs a real re-parse
 * (runStackParserV10.ts --refresh-matching), not a fix this script should make silently.
 *
 * `--dry-run` (default) prints before/after counts per role, a stratified sample of
 * label_raw -> old_role -> new_role, and loudly flags: (a) any row that would resolve to
 * 'other' (a regression -- nothing should un-match, since every one of these rows matched
 * SOME role before), and (b) every multi-role case (see above). It writes nothing.
 *
 * `--apply` (human only, never this agent) first dumps a full before/after CSV to
 * scripts/graph/tmp_analysis/ (for a manual revert path -- this table has no
 * vendor_role_migrations-style provenance log), then runs the UPDATEs. Must run AFTER
 * applyAttireSplitSchema.ts --apply is NOT required for this step (role here is plain `text`,
 * not the vendor_role enum) but IS required before migrateVendorRolesV2.ts's --apply, which
 * casts role::vendor_role.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reclassifyAttireSplit.ts              # dry run (default)
 *   bun run scripts/graph/reclassifyAttireSplit.ts --dry-run    # same, explicit
 *   bun run scripts/graph/reclassifyAttireSplit.ts --apply      # real write, human only
 */
import { writeFileSync, mkdirSync } from "fs";
import { getPool, closePool } from "../classify/db";
import { classifyLabel } from "./vendorRoleRules";
import { STACK_PARSER_V2_VERSION, classifyEmojiRun } from "./stackParser";

const OLD_ROLES = ["attire", "accessories"];
const SAMPLE_PER_BUCKET = 6;

interface Row {
  post_url: string;
  parser_version: string;
  line_no: number;
  handle: string;
  label_raw: string;
  role: string;
  rule_id: string | null;
  source: string;
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  console.log(`[reclassify-attire-split] mode: ${apply ? "APPLY (real write)" : "DRY RUN (no write)"}`);
  console.log(`[reclassify-attire-split] parser_version: ${STACK_PARSER_V2_VERSION}`);

  const { rows } = await pool.query<Row>(
    `select post_url, parser_version, line_no, handle, label_raw, role, rule_id, source
     from stack_extraction_entries_v2
     where parser_version = $1 and role = any($2)
     order by post_url, line_no`,
    [STACK_PARSER_V2_VERSION, OLD_ROLES]
  );

  console.log(`[reclassify-attire-split] rows to reclassify: ${rows.length}`);

  const beforeCounts = new Map<string, number>();
  const afterCounts = new Map<string, number>();
  const samplesByBucket = new Map<string, Array<{ label_raw: string; old_role: string; new_role: string }>>();
  const csvLines = ["post_url,parser_version,line_no,handle,label_raw,old_role,new_role,old_rule_id,new_rule_id"];
  let otherCount = 0;
  let multiRoleCount = 0;
  const multiRoleSample: Array<{ label_raw: string; roles: string[] }> = [];

  const updates: Array<{ row: Row; newRole: string; newRuleId: string }> = [];

  for (const row of rows) {
    beforeCounts.set(row.role, (beforeCounts.get(row.role) ?? 0) + 1);

    // emoji_line credits store the raw emoji glyph as label_raw (e.g. "🤵🏻‍♂️") -- classifyLabel()
    // strips emoji entirely during normalization and would misfile every one of these as 'noise'.
    // The original parser roles them via classifyEmojiRun() (rule_id "emoji"), not classifyLabel();
    // reclassification must use the same function or it silently corrupts every emoji-sourced row.
    let newRole: string;
    let newRuleId: string;
    if (row.source === "emoji_line") {
      newRole = classifyEmojiRun(row.label_raw) ?? "other";
      newRuleId = "emoji";
    } else {
      const classified = classifyLabel(row.label_raw);
      const roles = classified.roles;
      if (roles.length > 1) {
        multiRoleCount++;
        if (multiRoleSample.length < 20) multiRoleSample.push({ label_raw: row.label_raw, roles });
      }
      newRole = roles[0] ?? "other";
      newRuleId = classified.ruleId;
    }
    if (newRole === "other") otherCount++;

    afterCounts.set(newRole, (afterCounts.get(newRole) ?? 0) + 1);

    const bucket = samplesByBucket.get(newRole) ?? [];
    if (bucket.length < SAMPLE_PER_BUCKET) {
      bucket.push({ label_raw: row.label_raw, old_role: row.role, new_role: newRole });
      samplesByBucket.set(newRole, bucket);
    }

    csvLines.push(
      [
        csvCell(row.post_url),
        csvCell(row.parser_version),
        String(row.line_no),
        csvCell(row.handle),
        csvCell(row.label_raw),
        csvCell(row.role),
        csvCell(newRole),
        csvCell(row.rule_id ?? ""),
        csvCell(newRuleId),
      ].join(",")
    );

    if (newRole !== row.role) {
      updates.push({ row, newRole, newRuleId });
    }
  }

  console.log(`\n[reclassify-attire-split] before counts (old roles):`);
  for (const [role, n] of beforeCounts) console.log(`  ${role}: ${n}`);

  console.log(`\n[reclassify-attire-split] after counts (new roles):`);
  for (const [role, n] of [...afterCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${role}: ${n}`);

  console.log(`\n[reclassify-attire-split] rows changing role: ${updates.length} / ${rows.length}`);

  if (otherCount > 0) {
    console.log(
      `\n[reclassify-attire-split] ⚠️  ${otherCount} row(s) resolved to 'other' -- REGRESSION, ` +
        `nothing should un-match since every row here matched a role before. Inspect before applying.`
    );
  }
  if (multiRoleCount > 0) {
    console.log(
      `\n[reclassify-attire-split] ⚠️  ${multiRoleCount} row(s) resolved to >1 role -- kept only the first ` +
        `(${multiRoleSample.length} sampled below). A genuinely multi-role label on a previously-single-role row ` +
        `may need a real re-parse (runStackParserV10.ts --refresh-matching) instead.`
    );
    for (const s of multiRoleSample) console.log(`    "${s.label_raw}" -> [${s.roles.join(", ")}]`);
  }

  console.log(`\n[reclassify-attire-split] sample (up to ${SAMPLE_PER_BUCKET} per new role):`);
  for (const [bucket, samples] of samplesByBucket) {
    console.log(`  -- ${bucket} --`);
    for (const s of samples) console.log(`    "${s.label_raw}"  (was ${s.old_role})`);
  }

  if (apply) {
    mkdirSync("scripts/graph/tmp_analysis", { recursive: true });
    const auditPath = `scripts/graph/tmp_analysis/reclassify_attire_split_${Date.now()}.csv`;
    writeFileSync(auditPath, csvLines.join("\n") + "\n");
    console.log(`\n[reclassify-attire-split] wrote full before/after audit CSV: ${auditPath}`);

    console.log(`\n[reclassify-attire-split] APPLYING ${updates.length} update(s)...`);
    let n = 0;
    for (const { row, newRole, newRuleId } of updates) {
      await pool.query(
        `update stack_extraction_entries_v2
         set role = $1, rule_id = $2
         where post_url = $3 and parser_version = $4 and line_no = $5 and handle = $6 and role = $7`,
        [newRole, newRuleId, row.post_url, row.parser_version, row.line_no, row.handle, row.role]
      );
      n++;
      if (n % 500 === 0) console.log(`  ... ${n}/${updates.length}`);
    }
    console.log(`[reclassify-attire-split] committed ${n} update(s).`);
  } else {
    console.log(`\n[reclassify-attire-split] DRY RUN -- no rows written. Re-run with --apply to write (human only).`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
