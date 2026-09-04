/**
 * Account-level archetype classifier (mission requirement 7). Investigates
 * whether an account-level prior improves post classification — e.g.
 * distinguishing a Chicago wedding venue from a restaurant that occasionally
 * hosts receptions (Google Places categorized both "venue"; verified live:
 * "Fioretta Steak" is a steakhouse, not a wedding venue, despite the label).
 *
 * Feeds post classification as a PRIOR (attached to PostContext by
 * runClassify.ts), never a shortcut — the post-level prompt is explicitly
 * told an absent/low-confidence archetype is not evidence against a post.
 *
 * Uses a handful of the account's own real captions as behavioral evidence,
 * not just the Places category label, since the category alone is exactly
 * the signal that misclassifies Fioretta Steak.
 */
import { callTool } from "./openrouter";
import type { AccountArchetype, Evidence } from "./contract";

export const ACCOUNT_PROMPT_VERSION = "account-classify-v1";
export const ACCOUNT_MODEL = "anthropic/claude-haiku-4.5";

const TOOL_NAME = "submit_account_classification";

const PARAMETERS = {
  type: "object",
  properties: {
    archetype: {
      type: "string",
      description:
        "Suggested vocabulary (use a new short snake_case label if none fit): wedding_venue, " +
        "wedding_photographer, wedding_videographer, wedding_planner, wedding_florist, " +
        "wedding_other_vendor, wedding_inspiration_publication, bridal_fashion, " +
        "venue_non_wedding_primary, generic_lifestyle, couple_personal, other.",
    },
    confidence: { type: "number", description: "0.0-1.0" },
    is_wedding_industry: { type: "boolean" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          signal: { type: "string" },
          source_field: { type: "string", enum: ["account_bio", "account_category", "account_rating", "caption"] },
        },
        required: ["claim", "signal", "source_field"],
      },
    },
  },
  required: ["archetype", "confidence", "is_wedding_industry", "evidence"],
} as const;

const SYSTEM_PROMPT = `You classify an Instagram account's ARCHETYPE for a Chicago wedding-vendor product.

The account was seeded from a Google Places search for Chicago wedding venues/vendors —
that search is noisy: it sweeps in businesses (restaurants, hotels, event spaces) that
CAN host a wedding but aren't primarily wedding businesses, and Places' own category label
is not reliable (a steakhouse can be categorized "venue"). Use the account's own recent post
captions as real behavioral evidence, not just the category label — if none of the sample
captions are about weddings, that is strong evidence against a wedding-industry archetype
even if the Places category says otherwise.

is_wedding_industry should be true only for accounts whose PRIMARY business is wedding
services (a hotel that occasionally hosts a wedding among many other events is
venue_non_wedding_primary, not wedding_venue).

This is a PRIOR for post-level classification, not a verdict on any single post — be honest
about uncertainty (lower confidence) rather than forcing a guess.`;

export interface AccountInput {
  username: string;
  vendorName: string | null;
  vendorCategory: string | null;
  vendorAiSummary: string | null;
  vendorRating: number | null;
  vendorReviewCount: number | null;
  sampleCaptions: string[];
}

interface ToolArgs {
  archetype: AccountArchetype;
  confidence: number;
  is_wedding_industry: boolean;
  evidence: Evidence[];
}

export interface AccountClassificationResult {
  username: string;
  archetype: AccountArchetype;
  confidence: number;
  is_wedding_industry: boolean;
  evidence: Evidence[];
  classifier_version: string;
  prompt_version: string;
  model: string;
}

function buildUserPrompt(a: AccountInput): string {
  const lines: string[] = [];
  lines.push(`username: @${a.username}`);
  lines.push(`google_places_name: ${a.vendorName ?? "unknown"}`);
  lines.push(`google_places_category: ${a.vendorCategory ?? "unknown"}`);
  if (a.vendorAiSummary) lines.push(`google_places_summary: ${a.vendorAiSummary}`);
  lines.push(`rating: ${a.vendorRating ?? "unknown"} (${a.vendorReviewCount ?? 0} reviews)`);
  lines.push("");
  lines.push(`sample of ${a.sampleCaptions.length} recent captions from this account's own posts:`);
  a.sampleCaptions.forEach((c, i) => lines.push(`[${i + 1}] ${JSON.stringify(c.slice(0, 400))}`));
  return lines.join("\n");
}

export async function classifyAccount(
  input: AccountInput,
  classifierVersion: string
): Promise<AccountClassificationResult> {
  const { args, model } = await callTool<ToolArgs>({
    model: ACCOUNT_MODEL,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input),
    toolName: TOOL_NAME,
    toolDescription: "Submit the account archetype classification.",
    parameters: PARAMETERS,
  });
  return {
    username: input.username,
    archetype: args.archetype,
    confidence: args.confidence,
    is_wedding_industry: args.is_wedding_industry,
    evidence: args.evidence,
    classifier_version: classifierVersion,
    prompt_version: ACCOUNT_PROMPT_VERSION,
    model,
  };
}
