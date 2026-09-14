/**
 * `diffVersions` — field-level diff between two VenueDetailsV3 documents, matched by stable ids
 * (never array index) so a version's `changes[]` reads correctly even when unrelated items were
 * reordered. Pure, no DB.
 */

import type { AddOn, CapacityTuple, Faq, FixedFee, InclusionItem, PerGuestTier, PricingPath, Resource, Space, Tri, VenueDetailsV3 } from "./types";
import { SPINE_KEYS } from "./types";

export interface Change {
  field_path: string;
  kind: "added" | "changed" | "removed";
  from: unknown;
  to: unknown;
}

function triValue<T>(t: Tri<T>): unknown {
  if (t.status === "stated") return t.value;
  if (t.status === "conflicting") return t.candidates.map((c) => c.value);
  return null;
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function diffKeyedArray<T>(prevArr: T[], nextArr: T[], keyFn: (t: T) => string, basePath: string, out: Change[]): void {
  const prevMap = new Map(prevArr.map((x) => [keyFn(x), x]));
  const nextMap = new Map(nextArr.map((x) => [keyFn(x), x]));
  for (const [key, nextItem] of nextMap) {
    const prevItem = prevMap.get(key);
    if (prevItem === undefined) {
      out.push({ field_path: `${basePath}/${key}`, kind: "added", from: null, to: nextItem });
    } else if (stableStringify(prevItem) !== stableStringify(nextItem)) {
      out.push({ field_path: `${basePath}/${key}`, kind: "changed", from: prevItem, to: nextItem });
    }
  }
  for (const [key, prevItem] of prevMap) {
    if (!nextMap.has(key)) {
      out.push({ field_path: `${basePath}/${key}`, kind: "removed", from: prevItem, to: null });
    }
  }
}

function diffPaths(prevPaths: PricingPath[], nextPaths: PricingPath[], out: Change[]): void {
  const prevMap = new Map(prevPaths.map((p) => [p.id, p]));
  const nextMap = new Map(nextPaths.map((p) => [p.id, p]));
  for (const [id, nextPath] of nextMap) {
    const prevPath = prevMap.get(id);
    if (!prevPath) {
      out.push({ field_path: `/pricing/paths/${id}`, kind: "added", from: null, to: nextPath });
      continue;
    }
    diffKeyedArray<FixedFee>(prevPath.fixed_fees, nextPath.fixed_fees, (f) => f.key, `/pricing/paths/${id}/fixed_fees`, out);
    diffKeyedArray<PerGuestTier>(prevPath.per_guest_tiers, nextPath.per_guest_tiers, (t) => t.id, `/pricing/paths/${id}/per_guest_tiers`, out);
    diffKeyedArray(prevPath.minimums, nextPath.minimums, (m) => `${m.kind}:${m.day}:${m.season}`, `/pricing/paths/${id}/minimums`, out);
  }
  for (const [id, prevPath] of prevMap) {
    if (!nextMap.has(id)) out.push({ field_path: `/pricing/paths/${id}`, kind: "removed", from: prevPath, to: null });
  }
}

export function diffVersions(prev: VenueDetailsV3 | null, next: VenueDetailsV3): Change[] {
  const changes: Change[] = [];

  if (!prev) {
    changes.push({ field_path: "/", kind: "added", from: null, to: next });
    return changes;
  }

  for (const key of SPINE_KEYS) {
    const a = prev.spine[key];
    const b = next.spine[key];
    if (stableStringify(a) !== stableStringify(b)) {
      changes.push({
        field_path: `/spine/${key}`,
        kind: "changed",
        from: triValue(a as unknown as Tri<unknown>),
        to: triValue(b as unknown as Tri<unknown>),
      });
    }
  }

  diffKeyedArray<Space>(prev.spaces, next.spaces, (s) => s.id, "/spaces", changes);
  diffKeyedArray<CapacityTuple>(prev.capacities, next.capacities, (c) => `${c.space_id}:${c.layout}`, "/capacities", changes);
  diffKeyedArray<AddOn>(prev.pricing.add_ons, next.pricing.add_ons, (a) => a.id, "/pricing/add_ons", changes);
  diffPaths(prev.pricing.paths, next.pricing.paths, changes);
  diffKeyedArray<InclusionItem>(prev.inclusions, next.inclusions, (i) => `${i.label}:${i.category}`, "/inclusions", changes);
  diffKeyedArray<Faq>(prev.faqs, next.faqs, (f) => slugify(f.question), "/faqs", changes);
  diffKeyedArray<Resource>(prev.resources, next.resources, (r) => r.id, "/resources", changes);

  return changes;
}
