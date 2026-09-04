# Candidate-generation pivot: zero-LLM-cost analysis

**Question:** instead of classifying all 47,623 posts with V3 (~$470), can a deterministic
vendor-stack signal identify a small, high-precision candidate pool for V1, with LLM
classification reserved for a much smaller subset (or skipped entirely for the top slice)?

**Method:** pure SQL over already-loaded data. Zero new LLM/API calls. V3 untouched — every
number below reuses the already-classified 3,000-post canary, the golden/adversarial/dev/heldout
sets, and Ben's existing account-role graph (`accounts`, `account_tags`, `v_account_role`,
`account_locations`). Nothing here changes production behavior.

## Part 1 — Available signals inventory

**Reusable without any new LLM call:**

| Signal | Source | Coverage on the 47,623 corpus |
|---|---|---|
| Known-vendor mention + role | `accounts` + `v_account_role` (Ben's graph, 22-role enum, built from his own separate 6,370-post crawl) joined against `staging.instagram_posts.mentions` by lowercased handle | 124,229 raw mentions in the corpus; 66,796 (53.8%) resolve to a known account with a confirmed role; 15,230 posts (32.0%) have ≥1 resolved vendor role |
| Owner's own vendor category | `staging.vendors.category` (Places-seeded) | 41,817 posts (87.8%) — present for nearly every post, since almost every posting account is a seeded vendor; **not discriminating on its own** (see Part 4) |
| Account archetype (LLM-derived, already paid for) | `account_classification_runs` | Only 869/3,826 distinct owner accounts (22.7%) — thin outside the canary/golden-set owners it was built for |
| `in_metro` (Chicago) flag | `account_locations` | Only 428 accounts — too sparse to be a primary geography signal |
| Wedding keyword in caption/hashtags | New regex, reused verbatim from `prefilter.ts`'s `WEDDING_KEYWORDS` | 28,836 posts (60.6%) |
| Chicago hint in caption/hashtags/location_tag | New regex, reused verbatim from `prefilter.ts`'s `CHICAGO_HINT` | 31,681 posts (66.5%) |
| Credit-stack line pattern ("Role: @handle") | New regex, same shape as `prefilter.ts`'s `CREDIT_LINE`/`WEDDING_ROLE_WORD` | not separately reported below (subsumed by vendor-role-mention signal, which is more reliable since it requires the mentioned account to be independently confirmed in the graph, not just text pattern-matching) |
| Deterministic prefilter output (`det-only-v3`) | Already computed for the **full corpus** (this is how the canary's stratification shares were derived) | 15,929 posts EXCLUDE (not_wedding_related 15,501 / destination_wedding 421 / not_chicago 7); the other 31,694 deferred |

**Newly constructed for this analysis (not previously validated, built from already-stored caption text, zero LLM cost):**
- Named-couple honorific regex (`Mr. & Mrs.`, `future Mrs.`) — **only 209/47,623 posts (0.4%)**. Too rare and, per Part 4, shows no real precision lift (1/5 in golden set). Not a usable signal at this coverage; a proper couple-name extractor would need real NER work, which is out of scope here.
- "Now booking"/promotional language regex — 2,750 posts (5.8%)
- Styled/editorial-shoot language regex — 598 posts (1.3%)
- Engagement/proposal language regex — 289 posts (0.6%)

**Explicitly unavailable, not invented:** no structured "named couple" field, no per-post NER, no existing "is this a vendor roundup/repost" flag. Flagged rather than faked (see Part 8).

## Part 2 — Corpus counts (full 47,623 posts, deterministic only)

**A. Vendor depth (cumulative, via resolved role mentions):**
| Depth | Posts |
|---|---|
| ≥1 credible vendor | 15,230 |
| ≥2 | 9,512 |
| ≥3 | 7,512 |
| ≥4 | 6,069 |
| ≥5 | 4,946 |

**B. Specific combinations:**
| Combo | Posts |
|---|---|
| photographer + venue | 3,528 |
| planner + photographer | 3,149 |
| photographer + florist | 3,394 |
| photographer + planner + venue | 2,162 |
| photographer + venue + another vendor | 3,331 |
| 3+ distinct vendor categories | 7,512 |

**C. Wedding-context signals:**
| Signal | Posts |
|---|---|
| Explicit wedding language | 28,836 |
| Named-couple heuristic | 209 |
| Chicago hint | 31,681 |
| 2+ vendor mention | 9,512 |
| Owner is a seeded vendor account | 41,817 |
| Promo language | 2,750 |
| Styled/editorial language | 598 |
| Engagement language | 289 |

## Part 3 — Intersections

| Candidate rule | Posts (full corpus) |
|---|---|
| 3+ credible vendors | 7,512 |
| 3+ vendors + wedding language | 6,662 |
| photographer + venue | 3,528 |
| photographer + venue + wedding language | 3,195 |
| planner + photographer | 3,149 |
| planner + photographer + wedding language | 2,814 |
| named couple + 2+ vendors | 73 |
| named couple + photographer + venue | 29 |
| **Union of (3+vendors+wedlang) ∪ (photog+venue+wedlang) ∪ (planner+photog+wedlang)** | **6,910 unique posts** |

The couple-honorific intersections (73, 29) confirm that signal is too sparse to matter at any
useful scale — dropped from further consideration.

## Part 4 — Evaluation against real ground truth (golden set, n=551)

**This is the load-bearing section — V3 decisions are explicitly NOT used as truth here, only `golden_set.expected_decision` (human-labeled).**

First pass — raw vendor-stack rules (base INCLUDE rate in golden set = 126/551 = 22.9%):

| Rule | Captured | Precision | Recall |
|---|---|---|---|
| planner + photographer + wedding language | 40 | 72.5% | 23.0% |
| photographer + venue + wedding language | 44 | 65.9% | 23.0% |
| photographer + venue only | 45 | 64.4% | 23.0% |
| 3+ vendors only | 104 | 63.5% | 52.4% |
| 3+ vendors + wedding language | 97 | 62.9% | 48.4% |

**None of these reach V3's 94.1% precision.** They're a real, 2.7–3.2x lift over the 22.9% base
rate, but not a substitute for LLM judgment on their own.

Adding the negative signals found in Part 1 (styled/editorial, promo language) as exclusion
filters closes much of the gap:

| Rule | Captured | Precision | Recall | Full-corpus pool |
|---|---|---|---|---|
| **4+ vendors + wedding language, minus styled/promo** | 54 | **83.3%** | 35.7% | 5,065 |
| photographer + venue + wedding language, minus styled/promo | 33 | 81.8% | 21.4% | 2,965 |
| 3+ vendors + wedding language, minus styled/promo | 74 | 75.7% | 44.4% | 6,222 |
| 5+ vendors only | 63 | 69.8% | 34.9% | 4,946 |

Single-signal precision checks (why these particular filters, not others):
| Signal alone | Golden n | Precision |
|---|---|---|
| Styled/editorial language present | 25 | **4.0%** (near-total exclusion) |
| Promo language present | 61 | **9.8%** |
| Engagement language present | 10 | 10.0% (small n) |
| Zero vendor-role mentions | 338 | 10.7% (well below base rate) |
| Wedding keyword alone | 413 | 26.6% (barely above base rate — weak alone) |
| Owner is a seeded vendor account | 461 | 22.8% (no lift — nearly universal, not discriminating) |
| Chicago hint alone | 352 | 29.0% |

**Canary (V3 proxy labels, n=3,000 — explicitly a proxy, not truth):** of the 3,000-post canary,
V3's final decisions were INCLUDE 583 / REVIEW 198 / EXCLUDE 2,219 (already reported in the Step 2
canary readout). Used below only as a large-N corroboration of the golden-set precision numbers,
never as ground truth.

## Part 5 — Scoring model

Score (data-informed, not the user's example weights taken blindly — see below for what changed
and why):

```
score = 2 × min(vendor_role_count, 5)
      + 3 × (photographer AND venue)
      + 2 × (planner AND photographer)
      + 1 × wedding_keyword_present
      + 2 × chicago_hint
      − 4 × styled_editorial_language
      − 3 × promo_language
      − 2 × engagement_language
```

**Deviations from the example weights, and why:** wedding-keyword-alone dropped from a proposed
+4 to +1 (Part 4 showed it's barely above base rate on its own — most posts that already have
*any* wedding signal already passed the deterministic zero-signal gate, so within that population
the keyword stops being very discriminating). Named-couple dropped entirely (no coverage, no
measured lift). Owner-is-a-vendor-account dropped entirely (87.8% prevalence, no lift). Negative
weights for styled/promo were increased, not decreased — they're the strongest single levers in
the whole model (4% and 9.8% precision respectively when present).

**Score distribution is coarse** (integer-valued, heavy ties near the top: 1,535 posts tied at
the max score of 18) — so "top 500" and "top 1,000" collapse into the same threshold. Reported
using the natural tiers the data actually produces:

| Threshold | Full-corpus pool | Golden-set precision | Golden-set recall | Canary V3-INCLUDE rate (proxy, n) |
|---|---|---|---|---|
| score ≥ 18 | 1,535 | **93.3%** (14/15) | 11.1% | 87.2% (n=94) |
| score ≥ 15 | 3,029 | **96.7%** (29/30) | 23.0% | 80.8% (n=193) |
| score ≥ 12 | 5,208 | 75.9% (44/58) | 34.9% | 77.5% (n=351) |
| score ≥ 10 | 6,289 | 74.0% (57/77) | 45.2% | 74.9% (n=407) |
| score ≥ 8 | 7,351 | 68.1% (64/94) | 50.8% | 73.1% (n=464) |
| score ≥ 5 | 12,004 | 55.0% (82/149) | 65.1% | 55.3% (n=765) |
| score ≥ 3 | 25,417 | 35.1% (111/316) | 88.1% | 34.6% (n=1,594) |

**Headline finding:** at the top of the distribution (score ≥15–18, ~1,500–3,000 posts), the
deterministic score's measured precision (93–97%) is in the same range as V3 itself (94.1%) —
though on small golden-set n (15 and 30), so treat as suggestive, not proven at that confidence
level. The large-N canary corroborates the *direction* (precision falls monotonically as the
threshold relaxes) even though its absolute rate (V3-agrees-with-itself, not ground truth) sits a
bit lower at score≥15 (80.8% vs. golden's 96.7%) — the honest read is "somewhere in the 80s–90s
at the very top, degrading smoothly from there," not a precise point estimate.

## Part 6 — Cost implications

Real measured $/post from the canary, **broken out by score band** (not the blended $9.87/1k
average — high-score candidates skip the free deterministic-EXCLUDE tier almost entirely, since
they're selected for already having wedding signal, so their true LLM cost is roughly 2x the
corpus-wide blended average):

| Score band | Full-corpus pool | $/1k (measured, this band) | Cost to LLM-verify the whole band |
|---|---|---|---|
| ≥18 | 1,535 | $24.56 | **$37.70** |
| ≥15 | 3,029 | $23.11 | **$70.00** |
| ≥12 | 5,208 | $22.58 | **$117.60** |
| ≥8 | 7,351 | $22.04 | **$162.05** |
| ≥5 | 12,004 | $19.65 | **$235.88** |
| full corpus (existing V3 estimate) | 47,623 | $9.87 (blended) | $470 |

**Can V1 ship with zero LLM cost?** Only for the narrowest, highest-score slice: at score≥15–18
(~1,500–3,000 posts), the deterministic score's own measured precision (93–97% on a small golden
sample) is close enough to V3's that a zero-LLM ship is *plausible* for that slice specifically —
but the n=15/n=30 golden-set sample at that threshold is too small to be fully confident, and the
larger-N canary proxy runs a bit lower (81–87%). Below that (5,000+ posts), precision drops into
the 68–76% range raw — not safe to ship without LLM confirmation given the precision-first
mandate. In that range, LLM-verifying the candidate pool (**$118–$236** for 5,000–12,000 posts)
is dramatically cheaper than the full $470 corpus run while still getting V3-level precision on
whatever ships.

## Part 7 — What the best-case posts actually look like

Sampled directly from the score≥18 pool (not assumed): these are posts where the owner account
is itself a wedding vendor (photographer/venue/planner/caterer/florist/etc.), the caption has
explicit wedding language, a Chicago hint is present, **and** the post's mentions resolve to
7–15 *distinct* confirmed vendor roles from Ben's graph (venue, photographer, planner, florist,
DJ, hair, makeup, catering, cake, rentals, stationery, transportation, videographer, photobooth,
attire, hotel, jeweler — a real end-of-wedding "full team credit" caption). This is exactly the
shape the vendor-stack hypothesis predicted, and it's real in the data — but see Part 8 for the
important caveat about *how many* distinct roles is too many.

## Part 8 — Failure modes

**False positives (from the score≥15 golden-set check, n=1 example, plus a structural pattern
found separately):** the one golden-set false positive at score≥15 is labeled
`vendor_marketing_generic` with **12** distinct vendor roles attached — and inspecting the
highest vendor-role-count posts corpus-wide (15–18 distinct roles) surfaced a clear, repeatable
pattern: several of these are near-identical, templated "our preferred vendor team" captions
reused across multiple posts by the same account (e.g. `diamondpeakfilms` posts three separate
times with the *exact same* 17-role vendor list). **This is a real failure mode the raw vendor-
count signal doesn't defend against**: a vendor round-up/directory/"dream team" post looks
identical, structurally, to a genuine full-team wedding credit caption. The `min(vendor_role_count, 5)`
cap in the score partially blunts this (it stops rewarding depth past 5), but doesn't eliminate
it — a dedicated repost/template-detection signal (e.g. flagging near-duplicate captions from the
same account) would be needed to fully close this gap, and doesn't exist yet.

Other predictable false-positive shapes not directly measured here (too rare in the golden set to
quantify precisely, but consistent with the single confirmed FP and with V3's own error-analysis
history): styled/editorial shoots that still tag a full vendor team, and preferred-vendor-list
posts from planners/venues. Both are already partially suppressed by the negative-language filter.

**False negatives:** every true-INCLUDE golden-set post with score<3 has **zero** resolved
vendor-role mentions (`vendor_role_count = 0`) — these are real weddings whose tagged accounts
either aren't in Ben's graph yet (built from a separate, smaller crawl) or don't have a role
Ben's graph has confirmed. **This is the real recall cost of the vendor-stack approach**: it can
only ever see vendors it already knows about. A real wedding photographed by a photographer
outside Ben's crawled network is invisible to this signal no matter how good the caption is.

## Part 9 — Recommendation

1. **Is the hypothesis supported?** Partially, and specifically at the extremes. Vendor-stack
   depth alone gives a real, measured 2.7–3.2x precision lift over base rate but tops out around
   80–83% precision even with negative-signal filtering — not a substitute for LLM classification
   in general. At the very top of a combined deterministic score, however, precision (93–97% on a
   small sample) is genuinely competitive with V3's own 94.1%. The hypothesis is right in spirit
   ("vendor stacks are a strong proxy") but wrong in its strong form ("vendor stacks alone are
   enough") — it's a strong *prioritization* signal, not a strong *final* gate, except at the very
   top of the distribution.

2. **How many posts to start with?** The data supports a two-speed approach: a ~1,500–3,000-post
   top tier (score≥15–18) that's plausibly ship-ready with minimal or no further LLM cost, plus a
   ~5,000-post second tier (score≥12) that should go through V3 for confirmation before shipping.
   I'd start the product with the **~5,000-post LLM-confirmed pool** rather than trying to skip
   LLM classification even for the top tier — the top tier's precision estimate rests on an n=15–30
   golden sample, too small to bet the "no false positives" product requirement on outright.

3. **What deterministic rules define the pool?** The score above (vendor depth capped at 5, +
   photographer/venue and planner/photographer bonuses, + wedding-keyword and Chicago-hint bonuses,
   − styled/editorial/promo/engagement penalties), thresholded at score≥12 for a ~5,000-post
   candidate pool, or score≥18 for the ~1,500-post highest-confidence tier.

4. **Run V3 on the pool, or skip LLM entirely?** Run V3 on it. Given the precision-first mandate
   and the small-n uncertainty on the top-tier's raw precision, LLM-confirming the ~5,000–7,500
   candidate pool (**$118–$162**, vs. $470 for the full corpus) is the right trade — it keeps the
   precision guarantee V3 already earned while cutting cost by 65–75%. A future iteration could
   revisit true zero-LLM shipping for the top tier once there's a larger validated sample there.

5. **Should the 240-post manual audit continue?** Given this pivot, I'd deprioritize it rather
   than cancel it outright — it was scoped to validate whether the *full-corpus* V3 output is
   good enough to spend $470, which is no longer the immediate question. Its samples remain valid
   and reusable (nothing was discarded), and a smaller version of the same audit question applies
   directly to whichever candidate pool gets chosen next, so the existing samples can likely be
   filtered/reused rather than rebuilt when that time comes.

6. **Fastest path to something useful in the product?** Score the full corpus (cheap, deterministic,
   already demonstrated above) → take the score≥12 pool (~5,208 posts) → run it through the
   already-frozen, already-validated V3 pipeline (~$118, using existing infrastructure unchanged)
   → ship whatever V3 marks INCLUDE from that pool. This reuses 100% of the existing classifier
   investment, costs a fraction of the full-corpus run, and gets a first useful product slice fast.

7. **What's lost by pivoting, and how to preserve it for V2?** Recall on real weddings whose
   vendors aren't yet in Ben's account-role graph (Part 8's false-negative pattern) — that content
   exists in the corpus and V3 could find it, but a candidate-generator built on the graph can't
   see it. Nothing is destroyed: the frozen V3 classifier, the full golden/adversarial/canary
   evaluation infrastructure, and the routing-economics analysis all stay exactly as they are and
   remain the path to full-corpus recall later. The natural V2 move is running V3 (or a future
   version) over the *remainder* of the corpus once there's real product/user feedback to justify
   the spend — this analysis doesn't foreclose that, it just sequences it after shipping something
   real first.

## Explicitly out of scope for this analysis

No new LLM/API calls were made. V3's prompt, rubric, routing, thresholds, deterministic rules,
and account logic are untouched. No existing evaluation/audit artifact was modified or deleted —
this is a new, additive analysis document.
