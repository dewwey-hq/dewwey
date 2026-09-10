/**
 * D056 stage 0 — run the taxonomy rules (vendorRoleRules.ts) over the v9 label export and
 * report coverage: share of credits reaching a real role, `other` share, participants and
 * non-credit labels separated, the top unmatched labels, and a per-rule hit count. Also
 * writes the full label → (roles, context, rule) map as CSV for review, and — with
 * --golden N — a stratified sample (top-100 by count + N-100 random from the tail, seeded)
 * for the human golden set.
 *
 * Read-only: reads tmp_analysis/d056_labels_v9.csv (exported 2026-09-10 from
 * stack_extraction_entries, v9), writes tmp_analysis/d056_label_map.csv and
 * tmp_analysis/d056_golden_sample.csv. No DB access.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reportLabelCoverage.ts [--golden 300] [--top 60]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { classifyLabel, ROLE_BY_SLUG, V9_TO_D056 } from "./vendorRoleRules";

const DIR = new URL("./tmp_analysis/", import.meta.url).pathname;

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.length);
  const header = lines[0].split(",");
  const out: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cells: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { cells.push(cur); cur = ""; } else cur += c;
    }
    cells.push(cur);
    const row: Record<string, string> = {}; header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    out.push(row);
  }
  return out;
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function argNum(flag: string, dflt: number): number {
  const i = process.argv.indexOf(flag); return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

function main() {
  const golden = argNum("--golden", 0);
  const topN = argNum("--top", 60);
  const rows = parseCsv(readFileSync(DIR + "d056_labels_v9.csv", "utf8"));
  // aggregate by label (the export is label × v9 role)
  const byLabel = new Map<string, { n: number; v9: Set<string> }>();
  for (const r of rows) {
    const e = byLabel.get(r.label_raw) ?? { n: 0, v9: new Set<string>() };
    e.n += Number(r.n); e.v9.add(r.current_role); byLabel.set(r.label_raw, e);
  }
  const total = [...byLabel.values()].reduce((s, e) => s + e.n, 0);
  const buckets = { role: 0, other: 0, participant: 0, press: 0, noise: 0, multi: 0 };
  const perRole = new Map<string, number>(); const perRule = new Map<string, number>();
  const unmatched: Array<[string, number]> = [];
  const changed: Array<[string, number, string, string]> = [];
  const mapLines = ["label_raw,n,v9_roles,d056_roles,event_context,participant,rule_id"];
  for (const [label, e] of byLabel) {
    const c = classifyLabel(label);
    perRule.set(c.ruleId.replace(/\(.*\)/, "(…)"), (perRule.get(c.ruleId.replace(/\(.*\)/, "(…)")) ?? 0) + e.n);
    if (c.participant) buckets.participant += e.n;
    else if (c.roles[0] === "press_feature") buckets.press += e.n;
    else if (c.roles[0] === "noise") buckets.noise += e.n;
    else if (c.roles[0] === "other") { buckets.other += e.n; unmatched.push([label, e.n]); }
    else { buckets.role += e.n; if (c.roles.length > 1) buckets.multi += e.n; }
    for (const r of c.roles) perRole.set(r, (perRole.get(r) ?? 0) + e.n);
    const v9 = [...e.v9].map((x) => V9_TO_D056[x] ?? x).sort().join("|");
    const d = [...c.roles].sort().join("|");
    if (!c.participant && d !== v9 && !d.startsWith("other") && !d.startsWith("noise") && !d.startsWith("press")) changed.push([label, e.n, v9, d]);
    mapLines.push([label, String(e.n), [...e.v9].join("|"), c.roles.join("|"), c.eventContext, c.participant ?? "", c.ruleId].map(csvCell).join(","));
  }
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  console.log(`[label-coverage] labels=${byLabel.size} credits=${total}`);
  console.log(`[label-coverage] real role ${buckets.role} (${pct(buckets.role)}) · multi-role ${buckets.multi} (${pct(buckets.multi)}) · other ${buckets.other} (${pct(buckets.other)}) · participants ${buckets.participant} (${pct(buckets.participant)}) · press ${buckets.press} · noise ${buckets.noise} (${pct(buckets.noise)})`);
  console.log(`[label-coverage] credits by D056 role:`);
  for (const [r, n] of [...perRole.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(22)} ${String(n).padStart(6)}  ${ROLE_BY_SLUG.get(r)?.category ?? "?"}`);
  console.log(`[label-coverage] top ${topN} unmatched labels (→ other):`);
  unmatched.sort((a, b) => b[1] - a[1]);
  for (const [l, n] of unmatched.slice(0, topN)) console.log(`  ${String(n).padStart(5)}  ${l}`);
  console.log(`[label-coverage] hits by rule kind:`);
  for (const [r, n] of [...perRule.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(28)} ${n}`);
  changed.sort((a, b) => b[1] - a[1]);
  console.log(`[label-coverage] labels whose role CHANGES vs v9 (top 40 by credits, ${changed.length} total):`);
  for (const [l, n, v9, d] of changed.slice(0, 40)) console.log(`  ${String(n).padStart(5)}  ${l}  :  ${v9} -> ${d}`);
  writeFileSync(DIR + "d056_label_map.csv", mapLines.join("\n") + "\n");
  console.log(`[label-coverage] wrote ${DIR}d056_label_map.csv`);

  if (golden > 0) {
    const sorted = [...byLabel.entries()].sort((a, b) => b[1].n - a[1].n);
    const head = sorted.slice(0, 100);
    const tail = sorted.slice(100);
    let seed = 20260910; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const picked = new Set<number>();
    while (picked.size < Math.min(golden - 100, tail.length)) picked.add(Math.floor(rnd() * tail.length));
    const sample = [...head, ...[...picked].sort((a, b) => a - b).map((i) => tail[i])];
    const lines = ["label_raw,n,rules_roles,rules_context,rules_participant,rule_id,expected_roles,expected_context,expected_participant,note"];
    for (const [label, e] of sample) {
      const c = classifyLabel(label);
      lines.push([label, String(e.n), c.roles.join("|"), c.eventContext, c.participant ?? "", c.ruleId, "", "", "", ""].map(csvCell).join(","));
    }
    writeFileSync(DIR + "d056_golden_sample.csv", lines.join("\n") + "\n");
    console.log(`[label-coverage] wrote ${DIR}d056_golden_sample.csv (${sample.length} labels: top 100 + ${sample.length - 100} random from the tail)`);
  }
}
main();
