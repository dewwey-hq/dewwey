/**
 * `applyCorrections` — merges append-only human corrections onto a served document. Latest row
 * per `field_path` wins (no status column, no superseded_by — see the plan's spec resolutions);
 * `retire` and `unset` both clear the field. `field_path` uses the same stable-id grammar as
 * diff.ts: `/spine/<key>`, `/spaces/<id>/<prop>`, `/capacities/<space_id>:<layout>/<prop>`,
 * `/pricing/add_ons/<id>/<prop>`, `/pricing/paths/<path_id>/fixed_fees/<key>/<prop>`,
 * `/faqs/<question-slug>`. Omitting the trailing `<prop>` segment sets/removes the whole object.
 */

import type { AddOn, CapacityTuple, Faq, FixedFee, Space, VenueDetailsV3, VenueSpine } from "./types";
import { NOT_STATED } from "./types";

export interface Correction {
  id: number;
  field_path: string;
  action: "set" | "unset" | "retire";
  value: unknown;
  created_at: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isClearing(action: Correction["action"]): boolean {
  return action === "unset" || action === "retire";
}

function applyOne(d: VenueDetailsV3, c: Correction): boolean {
  const parts = c.field_path.split("/").filter(Boolean);
  const [root, id, propOrSub, ...rest] = parts;

  if (root === "spine") {
    const key = id as keyof VenueSpine;
    if (!(key in d.spine)) return false;
    if (isClearing(c.action)) {
      (d.spine as unknown as Record<string, unknown>)[key] = NOT_STATED;
    } else {
      (d.spine as unknown as Record<string, unknown>)[key] = { status: "stated", value: c.value, quote: "Corrected value", source_url: "correction", snapshot_id: null };
    }
    return true;
  }

  if (root === "spaces") {
    const idx = d.spaces.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    if (isClearing(c.action)) {
      if (!propOrSub) {
        d.spaces.splice(idx, 1);
        return true;
      }
      (d.spaces[idx] as unknown as Record<string, unknown>)[propOrSub] = null;
      return true;
    }
    if (!propOrSub) {
      d.spaces[idx] = c.value as Space;
      return true;
    }
    (d.spaces[idx] as unknown as Record<string, unknown>)[propOrSub] = c.value;
    return true;
  }

  if (root === "capacities") {
    const idx = d.capacities.findIndex((cap) => `${cap.space_id}:${cap.layout}` === id);
    if (idx === -1) return false;
    if (isClearing(c.action)) {
      if (!propOrSub) {
        d.capacities.splice(idx, 1);
        return true;
      }
      (d.capacities[idx] as unknown as Record<string, unknown>)[propOrSub] = null;
      return true;
    }
    if (!propOrSub) {
      d.capacities[idx] = c.value as CapacityTuple;
      return true;
    }
    (d.capacities[idx] as unknown as Record<string, unknown>)[propOrSub] = c.value;
    return true;
  }

  if (root === "pricing" && id === "add_ons") {
    const addOnId = propOrSub;
    const prop = rest[0];
    const idx = d.pricing.add_ons.findIndex((a) => a.id === addOnId);
    if (idx === -1) return false;
    if (isClearing(c.action)) {
      if (!prop) {
        d.pricing.add_ons.splice(idx, 1);
        return true;
      }
      (d.pricing.add_ons[idx] as unknown as Record<string, unknown>)[prop] = null;
      return true;
    }
    if (!prop) {
      d.pricing.add_ons[idx] = c.value as AddOn;
      return true;
    }
    (d.pricing.add_ons[idx] as unknown as Record<string, unknown>)[prop] = c.value;
    return true;
  }

  if (root === "pricing" && id === "paths") {
    const pathId = propOrSub;
    const path = d.pricing.paths.find((p) => p.id === pathId);
    if (!path) return false;
    if (rest[0] === "fixed_fees") {
      const feeKey = rest[1];
      const prop = rest[2];
      const idx = path.fixed_fees.findIndex((f) => f.key === feeKey);
      if (idx === -1) return false;
      if (isClearing(c.action)) {
        if (!prop) {
          path.fixed_fees.splice(idx, 1);
          return true;
        }
        (path.fixed_fees[idx] as unknown as Record<string, unknown>)[prop] = null;
        return true;
      }
      if (!prop) {
        path.fixed_fees[idx] = c.value as FixedFee;
        return true;
      }
      (path.fixed_fees[idx] as unknown as Record<string, unknown>)[prop] = c.value;
      return true;
    }
    return false;
  }

  if (root === "faqs") {
    const idx = d.faqs.findIndex((f) => slugify(f.question) === id);
    if (idx === -1) return false;
    if (isClearing(c.action)) {
      d.faqs.splice(idx, 1);
      return true;
    }
    d.faqs[idx] = c.value as Faq;
    return true;
  }

  return false;
}

export function applyCorrections(details: VenueDetailsV3, corrections: Correction[]): { details: VenueDetailsV3; applied: number[] } {
  const latestByPath = new Map<string, Correction>();
  for (const c of corrections) {
    const existing = latestByPath.get(c.field_path);
    if (!existing || c.created_at > existing.created_at) latestByPath.set(c.field_path, c);
  }

  const out: VenueDetailsV3 = structuredClone(details);
  const applied: number[] = [];
  for (const c of latestByPath.values()) {
    if (applyOne(out, c)) applied.push(c.id);
  }
  return { details: out, applied };
}
