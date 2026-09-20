/**
 * Enum-validity gate over a raw tool-call reply -- reuses `venueDetailsPrompt.ts`'s
 * `validateShape` (the same check that drives the extractor's enum-retry) but turns each
 * violation into a hard-fail `Issue` (`enum_invalid`) for `assemble.ts`/`validateVenueDetails.ts`
 * to aggregate. By the time extraction has finished (including its one retry), a value surviving
 * here as invalid is deliberately a hard failure, not another retry.
 */
import { SPINE_TIERS, type SpineTier } from "../../../lib/venueDetails/types";
import { validateShape } from "../venueDetailsPrompt";
import type { Issue, RawPricingResult, RawSpineResult } from "../contract";

function spineTierFor(path: string): SpineTier | null {
  const match = /^spine\.([a-zA-Z_]+)/.exec(path);
  if (!match) return null;
  const key = match[1] as keyof typeof SPINE_TIERS;
  return key in SPINE_TIERS ? SPINE_TIERS[key] : null;
}

function toIssue(violation: string, scope: "spine" | "pricing"): Issue {
  const path = violation.split(":")[0]?.trim() ?? violation;
  return {
    code: "enum_invalid",
    // `/spine/<key>` (the raw path arrives as "spine.<key>.value"), so repairs and demotion can find it.
    path: `/${scope}/${path.replace(/^spine\./, "").replace(/\.value$/, "")}`,
    severity: "error",
    tier: scope === "spine" ? spineTierFor(path) : null,
    message: violation,
  };
}

/** Every enum-invalid value in either raw tool-call reply, as hard-fail `Issue`s. */
export function checkEnums(spineResult: RawSpineResult, pricingResult: RawPricingResult | null): Issue[] {
  const issues: Issue[] = [];
  for (const v of validateShape(spineResult)) issues.push(toIssue(v, "spine"));
  if (pricingResult) {
    for (const v of validateShape(pricingResult)) issues.push(toIssue(v, "pricing"));
  }
  return issues;
}
