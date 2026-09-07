/**
 * Reports the vendor-association breakdown (D046): author-is-vendor vs.
 * tagged/credited vendor vs. both vs. neither, across the full golden_set
 * INCLUDE corpus and within the Layer-1 (human_confirmed_chicago_wedding_
 * content) subset. Read-only. Run after applyVendorAssociationSchema.ts.
 *
 * Usage (from apps/web): bun run scripts/graph/reportVendorAssociation.ts
 */
import type { QueryResultRow } from "pg";
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();
  const q = async <T extends QueryResultRow = Record<string, string>>(sql: string, params: unknown[] = []) =>
    (await pool.query<T>(sql, params)).rows;

  console.log("=== Vendor association (D046) ===\n");

  const [{ n: goldenIncludeTotal }] = await q<{ n: string }>(
    `select count(*)::int as n from golden_set where expected_decision = 'INCLUDE'`
  );
  const [{ n: assocTotal }] = await q<{ n: string }>(
    `select count(*)::int as n from human_confirmed_post_vendor_association`
  );
  console.log(`golden_set INCLUDE total: ${goldenIncludeTotal}`);
  console.log(`human_confirmed_post_vendor_association rows: ${assocTotal} (should match)\n`);

  console.log("-- Full corpus (all golden_set INCLUDE, not gated on Chicago) --");
  const fullBreakdown = await q<{ vendor_association_type: string; n: string }>(
    `select vendor_association_type, count(*)::int as n
     from human_confirmed_post_vendor_association
     group by vendor_association_type order by vendor_association_type`
  );
  for (const r of fullBreakdown) console.log(`  ${r.vendor_association_type}: ${r.n}`);

  console.log("\n-- Layer 1 (human_confirmed_chicago_wedding_content) subset --");
  const [{ n: layer1Total }] = await q<{ n: string }>(
    `select count(*)::int as n from human_confirmed_chicago_wedding_content`
  );
  console.log(`Layer-1 total: ${layer1Total}`);
  const layer1Breakdown = await q<{ vendor_association_type: string; n: string }>(
    `select va.vendor_association_type, count(*)::int as n
     from human_confirmed_chicago_wedding_content c
     join human_confirmed_post_vendor_association va on va.post_url = c.post_url
     group by va.vendor_association_type order by va.vendor_association_type`
  );
  for (const r of layer1Breakdown) console.log(`  ${r.vendor_association_type}: ${r.n}`);

  const [{ n: vendorPageEligible }] = await q<{ n: string }>(
    `select count(*)::int as n from human_confirmed_vendor_page_content`
  );
  console.log(`\nVendor-page-eligible (Layer 1 AND has_vendor_association): ${vendorPageEligible}`);

  // Edge case flagged in D046, not fixed here: human_confirmed_post_geography
  // (and therefore Layer 1) only resolves posts present in
  // staging.instagram_posts -- golden_set INCLUDE rows sourced only from
  // public.posts are invisible to it entirely.
  const [{ n: publicOnly }] = await q<{ n: string }>(
    `select count(*)::int as n from golden_set gs
     left join staging.instagram_posts sp on sp.post_url = gs.post_url
     join posts p on p.url = gs.post_url
     where gs.expected_decision = 'INCLUDE' and sp.post_url is null`
  );
  console.log(
    `\nEdge case (flagged, not fixed): golden_set INCLUDE rows only in public.posts (invisible to Layer 1's geography view): ${publicOnly}`
  );

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
