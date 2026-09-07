# Human-confirmed candidates review — 69 Chicago-confirmed, reconciled candidates

**Status (2026-09-05): reviewed by hand, NOT yet approved for creation.** Of
the 69 candidates the pipeline marked "graph-eligible without further
review" (`chicago_status='CHICAGO_CONFIRMED'` + reconciled), a full-caption
hand read against `labeling_rubric.md` found **only 18 hold up as genuine,
specific, real weddings**. The other 51 are generic vendor/venue marketing,
portfolio, or styled/portrait content that happened to carry a rich
multi-role vendor credit stack — the same "credit-stack richness doesn't
track realness" pattern already documented for the classifier
(`docs/engineering/graph-strengthening/README.md`: "EXCLUDE posts are
almost as stack-rich as INCLUDE, 68.7% vs 71.2%").

**Root cause, not a labeling failure exactly**: this candidate pool was
selected specifically for having a full, parseable, 3+-distinct-role vendor
credit stack — and it turns out generic vendor/venue self-promotion posts
credit collaborators just as generously as documented real weddings do.
At the speed the labeling session ran (up to ~440/hour), a post with a
glossy multi-vendor credit list visually reads as "a wedding" even when the
caption itself never names a couple or describes a specific real event
(most of the 51 EXCLUDE cases below are literally a venue's own account,
or an affiliated planner/vendor, posting generic "book your dream wedding
here" copy). This is the same finding the original golden-set bootstrap
already made about own-profile content generally — just concentrated here
because "has a rich credit stack" and "is vendor marketing" correlate.

**Per this project's own stated principle, this is a finding for you to
decide on, not something I've resolved unilaterally** — "human labels are
the source of truth, not an LLM's opinion." Nothing below has been changed
in `golden_set`; this is a documented disagreement for your review.

## Recommendation

Only pursue candidate creation for the 18 marked **INCLUDE** below (pending
your own re-check) — same hand-verification bar as every prior batch in
this mission (D035, D036, D039). The 51 marked **EXCLUDE** should probably
be relabeled in `/label` if you agree with the read (or left as-is if you
disagree with any specific call — cite the caption, not the vendor stack).

## The 18 I'd proceed with

| candidate | venue | action | evidence |
|---|---|---|---|
| 2882 | The Canvas Venue | create | "Annette & Maxwell's Wedding" — named couple |
| 2887 | The Arbory | create | "Katherine & Spencer!" — named couple |
| 2890 | ULC Chicago | create | "Lena and Clark's wedding" — named couple |
| 2919 | Ivy Room Chicago | create | "Michelle and Jake had a wedding day..." — named couple |
| 2927 | Wildman BT | create | "Couple: @anniekoza and @ben_gnage" — named couple |
| 2929 | Chicago Illuminating Co. | create | featured in *Modern Luxury Weddings* Spring/Summer 2026, specific real magazine feature |
| 2954 | The Carter, Fulton Market | create | "Jek and Willis" — named couple, specific family-tradition narrative |
| 2959 | Fairlie Chicago | create | "@jordanpaigebaker and Quinn" — named couple |
| 2961 | Walden Chicago | create | "Leah and Brian" — named couple |
| 2964 | EE Event Co. | create | groom's own opera performance at his wedding — specific unique fact (matches a documented classifier adversarial-validation case) |
| 2967 | Holy Family CCI | create | "Alyssa and Dalton's timeless celebration" — named couple, extremely detailed stack |
| 2972 | The Drake Oakbrook | create | "Leo & Shelby" — named couple |
| 2978 | LSHIRE Marriott | attach → wedding 1009 | "Helen + Nirguna", a Sangeet — named couple, specific real event |
| 2981 | Venuti's Banquets | attach → wedding 1062 | "Mr & Mrs Gjerazi" — named couple |
| 2992 | Jen's Guesthouse | create | "M+S pulled off the best day! Grateful for them choosing me" — specific single-event personal narrative |
| 2995 | Venue Logic (unspecified) | create | detailed real narrative, Indian/Polish heritage couple "A. & A.", names redacted for a transparency post but unambiguously one specific real wedding |
| 2996 | The Canvas Venue | create | "Michelle 🤍 Emeka" — named couple |
| 3005 | Pella Signature | attach → wedding 1838 | "Bride: @_laurenwhelan" — named, credited individual |

## The 51 I'd exclude (generic vendor/venue marketing, portfolio, or non-wedding content — no couple named, no specific real event)

| candidate | venue | why excluded |
|---|---|---|
| 2874 | Charcoal Factory | explicit "editorial... Model - @callliefitz... #editorial" — a styled shoot |
| 2876 | The Geraghty | "Lost in a purple reverie... Embark on an enchanting journey when we plan your next event" — generic venue marketing |
| 2886 | The Fulton West | venue's own 1-year-anniversary post, not a wedding at all |
| 2889 | The Fulton West | "Pretty Dinner Parties are our thing" / "PERFECT for small weddings!" — generic venue marketing (2 posts) |
| 2891 | The Fulton West | venue's general intro post listing birthdays/proms/baby showers/fundraisers — not wedding-specific |
| 2893 | The Fulton West | generic credit-stack post, no couple |
| 2894 | The Fulton West | "Happy World Smile Day! ...tablescapes" — generic |
| 2895 | LM Studio Chi | generic vendor philosophy/marketing copy |
| 2899 | Chez Event Venue | hashtags include `#ChicagoBabyShower` — likely not even a wedding |
| 2901 | Colvin Events | generic "getting ready" HMUA portfolio post, no couple |
| 2903 | The Dalcy | "perfect place to say 'I do'! Start wedding planning today" — venue CTA |
| 2904 | Rockwell on the River | "Raising a toast to forever happiness" — no couple |
| 2905 | Rockwell on the River | tablescape-only post, no couple |
| 2906 | Celebrate at Bloom | explicit "content day" shoot, not a real wedding |
| 2907 | The Dalcy | "Start wedding planning today" — venue CTA |
| 2908 | The Dalcy | generic florist marketing, no couple |
| 2909 | The Gwen Chicago | "Hair or Makeup First?" — educational/tips post |
| 2910 | Revel Space | generic catering marketing |
| 2912 | Rockwell on the River | generic marketing, no couple |
| 2915 | Bridgeport Art Center | venue marketing, no couple |
| 2917 | Chicago Museum Events | "#weddingtablescape #weddingtrends2026" — styled tablescape/design portfolio |
| 2918 | Bridgeport Art Center | "Contact us today to schedule a tour" — venue CTA |
| 2920 | Bridgeport Art Center | "book now!" — generic makeup marketing |
| 2922 | Galleria Marchetti | cake vendor marketing (`#weddingcakewednesday`), no couple |
| 2923 | Bridgeport Art Center | generic marketing, no couple |
| 2928 | Rockwell on the River | generic descriptive marketing, no couple |
| 2934 | Builders BLDG | generic multi-event-type venue marketing |
| 2936 | Wildman BT | no couple named, no clear event evidence |
| 2938 | Brixon Fox | generic aspirational planner marketing |
| 2941 | Post 433 Events | generic venue-description marketing |
| 2943 | Wildman BT | "West Loop Wedding Walk" — an industry/vendor open house, not a wedding |
| 2946 | Chicago Museum Events | generic florist/venue aesthetic posts, no couple (2 posts) |
| 2950 | Rockwell on the River | generic marketing, no couple |
| 2953 | The Penthouse Hyde Park | "bridal portraits" session, not a wedding day, no couple named |
| 2956 | Venue Logic | educational/marketing copy, no couple |
| 2958 | Twenty Six Chicago | generic photographer appreciation post, no couple |
| 2963 | Bridgeport Art Center | generic "we love designing multicultural weddings" marketing copy |
| 2969 | Chicago Museum Events | generic aesthetic copy, no couple (duplicate vendor stack of 2917) |
| 2970 | Chicago Museum Events | generic, no couple (same recurring stack as 2946/2969) |
| 2973 | Wildman BT | "Reserve your date today!" — generic marketing |
| 2979 | Revel Space | "a few of my favorites from the archives" — portfolio recap, no couple |
| 2983 | Twenty Six Chicago | generic philosophy/marketing copy |
| 2987 | The Geraghty | generic decor-focused venue post, no couple |
| 2988 | Chicago Athletic Hotel | generic romantic-photographer portfolio copy, no couple |
| 2989 | The Dalcy | two different names (Sydney, Hannah) credited for hair/makeup — a multi-wedding compilation, not one event |
| 2990 | Revel Space | "It's called taste" — aesthetic-flex marketing, no couple |
| 2993 | Bridgeport Art Center | "Now booking weddings" — generic HMUA marketing |
| 2998 | Pella Signature | "Model:" credit present — styled/marketing shoot |
| 2999 | Chicago Botanic | flowery generic marketing copy, no couple |
| 3007 | River Roast Chi | generic seasonal marketing narrative, no specific couple |
| 3010 | Chicago Cultural Center | pure venue showcase, no couple |

## The funnel, precisely (742 → 69)

Corrected after finding and fixing two bugs during this review (see below):

```
742 human-confirmed WEDDING posts (staging corpus)
├── 280 already usable by the existing V3 pipeline (score≥12 AND V3 INCLUDE)
│     — already part of the original 2,872-candidate pool, untouched by this mission
└── 462 previously unused by any pipeline — this mission's addressable population
      ├── 168 already had a parsed stack from the original score≥12 baseline run,
      │     just blocked from being "evidence" by the V3-INCLUDE-only gate
      │     (scored ≥12 but V3 said EXCLUDE/REVIEW)
      └── 294 had never been touched by the stack parser at all (score<12) —
            freshly extracted this mission

Of all 742: 441 have a parseable credit stack at all; 418 clear the
3+-distinct-role clustering-eligibility bar. Most of those 418 overlap with
the 280 already-evidence posts (already absorbed into the existing
2,872-candidate pool long ago). The remaining ~144 posts were newly
clustered this mission into:
  → 140 brand-new wedding candidates
  → 4 posts attached onto candidates created earlier in this same run

Of the 140 new candidates:
  → 69 Chicago-confirmed + reconciled = "graph-eligible without further review"
        → 18 hold up on hand review (this doc) — recommended to proceed
        → 51 do not (this doc) — recommended to exclude, or relabel
  → 71 Chicago-ambiguous / not-confirmed / no-venue-resolved = held for review
```

The rest of the 742 (the majority) either already lived inside the existing
V3-based pipeline, or simply don't credit enough distinct vendor roles
(fewer than 3) to form a clustering-eligible credit stack under this
mechanism — a real wedding with thin vendor evidence (e.g. only a
photographer credited) is still valid ground truth for classifier
evaluation, just not actionable for *this specific* graph-integration path.

## Two bugs found and fixed while producing this review

1. **`reportHumanConfirmedGraphValue.ts` step 4 miscounted.** It counted
   `stack_extraction_runs` rows, not distinct posts — that table can hold
   multiple rows per post across parser versions (v1/v2/v3), so the
   originally-reported "1,284 already had a stack" was inflated. Not fixed
   in the script itself yet (flagging here; the corrected number above was
   computed with `count(distinct post_url)`).
2. **`runStackParserOnGoldenSet.ts` silently overwrote 60 posts' recorded
   V3 decision.** Its "already processed" check looked at
   `stack_extraction_entries` (empty for any post with zero parseable
   credit lines) instead of `stack_extraction_runs` — so a score≥12 post
   with `has_stack=false` got re-selected and its `stack_extraction_runs.decision`
   column overwritten from its real V3 decision to `'HUMAN_INCLUDE'`.
   **No vendor-evidence data was affected** (zero entries either way, so no
   candidate was built from these posts) — purely a provenance-column bug.
   Fixed (now checks `stack_extraction_runs`) and repaired live: all 60
   rows' original V3 decision recovered from `post_classification_runs`
   (untouched source of truth) and restored; verified zero remaining
   mismatches.
