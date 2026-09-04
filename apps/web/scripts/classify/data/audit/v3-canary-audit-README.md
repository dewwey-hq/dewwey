# V3 canary human audit — sample & judgment sheet

**Purpose:** decide whether the frozen V3 classifier's actual output is good enough to justify
the remaining ~$440 to classify all 47,623 posts. This is NOT a re-check against existing
golden-set labels — it's a fresh human read of real output against the product bar:

> **"Would I actually be happy showing this post to a user researching weddings, wedding
> vendors, or wedding inspiration?"**

No new LLM calls were made to build this audit — every row here is metadata already recorded
from the already-classified 3,000-post canary (`post_classification_runs`, `classifier_version='v3'`).
V3 itself was not touched.

## 1. How the samples were selected

All four samples pull from the canary's **final decision** per post (deterministic if present,
else Sonnet if it escalated, else cheap-tier) — i.e. exactly what the product would have shown a
user. Selection was done via reproducible seeded SQL (`setseed()` then `random()`), scripts kept
in `/tmp` this session but the logic is simple enough to restate here if needed.

| File | n | Selection |
|---|---|---|
| `include_random_100.csv` | 100 | Uniform random sample of the 583 canary INCLUDEs (seed 0.4711) |
| `review_random_50.csv` | 50 | Uniform random sample of the 198 canary REVIEWs (seed 0.5822) |
| `exclude_boundary_50.csv` | 50 | The 50 EXCLUDEs with the **lowest confidence** (i.e. closest to flipping to INCLUDE) out of 2,219 — confidence range 0.620–0.750 |
| `include_lowconf_40.csv` | 40 | The 40 **lowest-confidence INCLUDEs** (confidence 0.600–0.750), drawn from the 483 INCLUDEs *not* already in the random-100 sample, so it's a genuinely separate set |

Total: **240 posts**, each with post URL + full classifier metadata (decision, confidence, tier,
model, exclusion_reason, is_wedding/is_real_wedding/is_chicago/is_credible_source flags,
event_date, account archetype, location_tag, caption excerpt, hashtags, likes, evidence array).

Note on tiers: every row in `include_random_100.csv` and `include_lowconf_40.csv` reached the
`expensive_model` (Sonnet) tier — this is structural, not a sampling artifact: under V3's routing,
the cheap tier can never itself produce a final INCLUDE (an INCLUDE or REVIEW from the cheap tier
always escalates to Sonnet for confirmation; only Sonnet's decision can become a final INCLUDE).

## 2. Files

All in `apps/web/scripts/classify/data/audit/`:
- `include_random_100.csv`
- `review_random_50.csv`
- `exclude_boundary_50.csv`
- `include_lowconf_40.csv`
- (this file)

## 3. Patterns already visible from metadata alone (not a substitute for reading captions/images)

**INCLUDE random-100** — archetype mix: wedding_photographer 38, wedding_videographer 13,
wedding_venue 12, wedding_other_vendor 11, wedding_planner 11, wedding_florist 4,
venue_non_wedding_primary 1, no-account-classification 10. Skews toward photographers, as expected
given photographers are the single largest archetype and highest-INCLUDE-rate category in the
corpus — worth deliberately checking whether photographer INCLUDEs are disproportionately
generic portfolio/editorial work mislabeled as "real wedding," since that's the failure mode
V3's is_real_wedding evidence hierarchy exists to prevent.

**REVIEW random-50** — flag pattern is telling: 44/50 have `is_wedding=true` and
`is_credible_source=true`, split between `is_real_wedding=true` (22 — REVIEW despite believing
it's real, likely on a different axis like Chicago-ness or usefulness) and `is_real_wedding` unset
with `is_chicago=true` (18). Archetype mix mirrors INCLUDE (photographer/venue/videographer
heavy). **Worth specifically checking**: do these read as legitimate ambiguous cases, or as cases
where V3 is being overly cautious about content that a human would clearly call real?

**EXCLUDE boundary-50** (lowest-confidence EXCLUDEs, i.e. the ones most likely to be misses) —
exclusion_reason breakdown: `not_useful_wedding_content` 14, `insufficient_evidence` 12,
`not_chicago` 11, `vendor_marketing_generic` 9, `not_wedding_related` 3, `styled_or_editorial` 1.
Notably 33/50 still have `is_wedding=true` (18 with is_chicago unset, 15 with is_chicago=true) —
these are the most important rows to check for **false negatives**: real Chicago wedding content
excluded on a secondary judgment call (usefulness, evidence strength, credibility) rather than a
clean "not a wedding" call.

**INCLUDE low-confidence-40** (confidence 0.600–0.750) — all 40 have `is_chicago=true`, so the
uncertainty in this batch is NOT about geography; it's concentrated in the real-wedding-evidence /
usefulness judgment. Archetype mix: wedding_other_vendor 10, wedding_photographer 9,
wedding_videographer 6, wedding_planner 5, wedding_florist 4, no-account 3, wedding_venue 2,
generic_lifestyle 1. This is the batch most likely to contain the false positives that matter
most to check first, since low confidence + still-INCLUDE is exactly the risk zone.

## 4. Manual judgment sheet

For each post, fill in:

| post_url | is_real_wedding? (Y/N/unsure) | useful_content? (Y/N) | genuinely_Chicago? (Y/N/unsure) | credible_source? (Y/N) | **would_show_user (Y/N)** | notes / failure-mode tag |
|---|---|---|---|---|---|---|
| | | | | | | |

Suggested workflow: open each CSV in a spreadsheet, add these 6 columns, and for each row open
the `post_url` to inspect the actual image/video + full caption (the `caption_excerpt` here is
truncated to 400 chars). The single column that matters most is **would_show_user** — that's the
actual product bar, independent of whether V3's own sub-flags (is_wedding, is_real_wedding, etc.)
line up with your read.

If you spot a **recurring** failure pattern (not a one-off), tag it with a short label in notes
(e.g. `photographer-portfolio-not-event`, `generic-engagement-shoot`, `usefulness-too-strict`,
`chicago-suburb-missed`) so Step 4 (failure-mode quantification) can search for it at scale
across the rest of the canary before any prompt change is considered.

## Explicitly out of scope for this round

V3's prompt, rubric, routing, thresholds, deterministic rules, and account logic are **frozen**
and were not touched to produce this audit. This audit's only purpose is to inform the GO/HOLD/
NO-GO decision on spending the remaining ~$440 for the full 47,623-post corpus.
