/**
 * Tick 2 (final step) for the non-wedding-posts mission
 * (docs/engineering/graph-strengthening/non-wedding-posts.md).
 *
 * Pure data transform, no DB access. Takes the hand labels in
 * data/tick2_hand_labels_source.json (produced by reading full captions
 * against labeling_rubric.md) plus the 11 already-labeled seeds, assigns a
 * tune/heldout split (~1/3 heldout, stratified per group so the known-good
 * regression check isn't all in one bucket), and writes
 * data/non_wedding_labels.json in the seeds-file shape plus group/split.
 *
 * Split is assigned BEFORE any rule is designed (tick 3/4), per the mission's
 * eval rule 3 ("the 11 seeds are burned for tuning... a labeled sample split
 * before designing a rule").
 *
 * Usage (from apps/web): bun run scripts/graph/assignTick2Split.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const SEEDS = JSON.parse(
  readFileSync(new URL("./data/non_wedding_seeds.json", import.meta.url), "utf8")
) as { posts: { post_url: string; expected_decision: string; exclusion_reason: string; notes: string }[] };

const HAND = JSON.parse(
  readFileSync(new URL("./data/tick2_hand_labels_source.json", import.meta.url), "utf8")
) as {
  labels: {
    post_url: string;
    group: string;
    expected_decision: string;
    exclusion_reason: string | null;
    notes: string;
  }[];
};

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const seedEntries = SEEDS.posts.map((p) => ({
    post_url: p.post_url,
    group: "seed",
    split: "seed",
    expected_decision: p.expected_decision,
    exclusion_reason: p.exclusion_reason,
    notes: p.notes,
  }));

  const byGroup = new Map<string, typeof HAND.labels>();
  for (const l of HAND.labels) {
    if (!byGroup.has(l.group)) byGroup.set(l.group, []);
    byGroup.get(l.group)!.push(l);
  }

  const splitEntries: typeof seedEntries = [];
  for (const [group, items] of byGroup) {
    const shuffled = seededShuffle(items, group === "similar_pool" ? 101 : 202);
    const heldoutCount = Math.round(shuffled.length / 3);
    shuffled.forEach((item, i) => {
      splitEntries.push({
        post_url: item.post_url,
        group,
        split: i < heldoutCount ? "heldout" : "tune",
        expected_decision: item.expected_decision,
        exclusion_reason: item.exclusion_reason,
        notes: item.notes,
      });
    });
  }

  const all = [...seedEntries, ...splitEntries];

  const counts: Record<string, Record<string, number>> = {};
  for (const e of all) {
    counts[e.group] ??= {};
    counts[e.group][e.split] ??= 0;
    counts[e.group][e.split]++;
  }
  const decisionCounts: Record<string, number> = {};
  for (const e of all) decisionCounts[e.expected_decision] = (decisionCounts[e.expected_decision] ?? 0) + 1;

  console.log("[tick2-split] group x split counts:", counts);
  console.log("[tick2-split] decision counts (all groups):", decisionCounts);
  console.log(
    "[tick2-split] known_good confirmed INCLUDE (the regression slice):",
    all.filter((e) => e.group === "known_good" && e.expected_decision === "INCLUDE").length
  );

  const out = {
    source_note: "tick2_2026-09-05",
    labeled_by: "claude (hand-labeled against labeling_rubric.md, full captions read per post)",
    notes:
      "Tick 2 of non-wedding-posts.md. 'seed' = the 11 original user-flagged posts (burned for tuning, always EXCLUDE). 'similar_pool' = stratified sample from the tick-1 pool. 'known_good' = candidates for the real-Chicago-wedding regression slice; only the ones labeled INCLUDE here count as the known-good slice, REVIEW ones do not. split='tune' is for designing a rule (tick 3/4); split='heldout' must not be looked at while designing the rule, only scored once at the end.",
    posts: all,
  };
  writeFileSync(new URL("./data/non_wedding_labels.json", import.meta.url), JSON.stringify(out, null, 2));
  console.log("[tick2-split] wrote scripts/graph/data/non_wedding_labels.json");
}

main();
