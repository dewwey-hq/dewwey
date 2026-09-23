# Post-table merge — P2 gate packet (pm-20260923-merge-1)
Generated 2026-09-23T04:18:39.260Z by `mergeStagingPosts.ts` (dry-run, rolled back).

## Ops
| op | rows |
|---|---|
| exclusions (profile urls) | 10 |
| accounts minted | 1409 |
| twin handles (not auto-minted) | 5 |
| posts inserted (origin jeremy_beta) | 40946 |
| jeremy_evidence copies relabeled | 5349 |
| crawled posts linked to staging | 1318 |
| field conflicts logged | 2 |
| sightings: legacy-jeremy-beta-import (run 94) | 47613 |
| sightings: legacy-ben-pipeline (run 93) | 4829 |
| is_first set (posts that had none) | run 93: 4534 · run 94: 46590 |

## posts after the merge
| origin | source | raw_format | rows |
|---|---|---|---|
| acquisition_loop | own_profile | apify_v1 | 145 |
| acquisition_loop | venue_tagged | apify_v1 | 15054 |
| ben_pipeline | venue_tagged | apify_v1 | 6370 |
| jeremy_beta | own_profile | jeremy_staging_v1 | 42276 |
| jeremy_beta | unknown | jeremy_staging_v1 | 4019 |

## Decisions for the user: twin handles (default = existing account)
| staging owner handle | posts | existing account | decision |
|---|---|---|---|
| anino.multimedia | 1 | aninomultimedia | UNDECIDED (default: existing) |
| chicago_weddings | 2 | chicagoweddings | UNDECIDED (default: existing) |
| diem_angie | 1 | diemangie | UNDECIDED (default: existing) |
| kelly_k_photography_ | 2 | kelly_k_photography | UNDECIDED (default: existing) |
| smilebooth_chicago | 1 | smileboothchicago | UNDECIDED (default: existing) |

## Field conflicts (typed columns kept; staging row stored in staging_raw)
- DcOQaPtC6bk: owner posts=bwstudio_events staging=bwstudio_events; caption len posts=773 staging=767
- C__71R1P-1_: owner posts=juliannapressleyphoto staging=juliannapressleyphotography; caption len posts=588 staging=588

## Frozen outputs vs the P0 baseline
Funnel: baseline {"total":67874,"parsed":67177,"clustered":14520,"read_by_reader":7423,"in_a_wedding":9065} → now {"total":67864,"parsed":67177,"clustered":14520,"read_by_reader":7423,"in_a_wedding":9065}

### structural_post_vendor_evidence: -15 +15 (unexplained: 30)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/CsL1O8OvhHn/,34593,venue,Venue,4,credit_line,t,f,t,2023-05-13,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Cud77q0A56H/,18505,venue,Venue,3,credit_line,t,f,t,2023-07-09,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Cyi2720LbP3/,31029,venue,Venue,19,credit_line,t,f,f,2023-10-18,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DBXeMyfpNjl/,239,venue,VENUE,23,credit_line,t,f,t,2024-10-21,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DCwb_uppJaP/,30840,venue,VENUE,26,credit_line,t,t,t,2024-11-24,"katie and max",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DGcMzezxHix/,8770,venue,Venue,10,credit_line,t,t,t,2025-02-24,"nicole & andrew",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DYA6im_GVKX/,19904,venue,Venue,4,credit_line,t,f,t,2026-05-06,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DYdRC41FSIX/,18869,venue,Venue,6,credit_line,t,t,t,2026-05-17,"sarah & adam",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DYpdhnjHEaS/,2379,venue,Venue,2,credit_line,t,t,f,2026-05-22,"michael and olive",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbBixNfllxC/,21195,venue,venue,8,credit_line,t,f,f,2026-07-20,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbWw0lGu-13/,2626,venue,Venues,14,credit_line,t,t,t,2026-07-28,"coordination + content",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbZG-2bAZU3/,34965,venue,Venue,12,credit_line,t,t,t,2026-07-29,"savera & farhan",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Dbe-Rg9FmP3/,18370,venue,venues,3,credit_line,t,f,t,2026-08-01,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Dbv0La3HKyF/,6463,venue,Venue,3,credit_line,t,f,t,2026-08-07,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DcWbbHFmyph/,5049,venue,Venue,6,credit_line,t,t,t,2026-08-22,"linnea & john",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/CsL1O8OvhHn/,34592,venue,Venue,4,credit_line,t,f,t,2023-05-13,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/Cud77q0A56H/,5272,venue,Venue,3,credit_line,t,f,t,2023-07-09,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/Cyi2720LbP3/,27397,venue,Venue,19,credit_line,t,f,f,2023-10-18,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DBXeMyfpNjl/,34037,venue,VENUE,23,credit_line,t,f,t,2024-10-21,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DCwb_uppJaP/,239,venue,VENUE,26,credit_line,t,t,t,2024-11-24,"katie and max",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DGcMzezxHix/,27501,venue,Venue,10,credit_line,t,t,t,2025-02-24,"nicole & andrew",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DYA6im_GVKX/,19477,venue,Venue,4,credit_line,t,f,t,2026-05-06,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DYdRC41FSIX/,19446,venue,Venue,6,credit_line,t,t,t,2026-05-17,"sarah & adam",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DYpdhnjHEaS/,20954,venue,Venue,2,credit_line,t,t,f,2026-05-22,"michael and olive",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DbBixNfllxC/,50602,venue,venue,8,credit_line,t,f,f,2026-07-20,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DbWw0lGu-13/,1643,venue,Venues,14,credit_line,t,t,t,2026-07-28,"coordination + content",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DbZG-2bAZU3/,35610,venue,Venue,12,credit_line,t,t,t,2026-07-29,"savera & farhan",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/Dbe-Rg9FmP3/,3970,venue,venues,3,credit_line,t,f,t,2026-08-01,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/Dbv0La3HKyF/,97,venue,Venue,3,credit_line,t,f,t,2026-08-07,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DcWbbHFmyph/,60995,venue,Venue,6,credit_line,t,t,t,2026-08-22,"linnea & john",f)

### structural_for_batch:acq-20260919-probesA: -4 +4 (unexplained: 8)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DG5CVs4uzzT/,34986,venue,Venues,3,credit_line,t,f,f,2025-03-07,,f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DOZIMidEoo-/,18865,venue,Venue,4,credit_line,t,t,t,2025-09-09,"tori and xander",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DQNRpJoEtLT/,1329,venue,"Venue and Catering",4,credit_line,t,t,f,2025-10-24,"tori + will",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbWw0lGu-13/,2626,venue,Venues,14,credit_line,t,t,t,2026-07-28,"coordination + content",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DG5CVs4uzzT/,33384,venue,Venues,3,credit_line,t,f,f,2025-03-07,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DOZIMidEoo-/,653,venue,Venue,4,credit_line,t,t,t,2025-09-09,"tori and xander",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DQNRpJoEtLT/,53358,venue,"Venue and Catering",4,credit_line,t,t,f,2025-10-24,"tori + will",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DbWw0lGu-13/,28418,venue,Venues,14,credit_line,t,t,t,2026-07-28,"coordination + content",f)

### structural_for_batch:acq-20260920-probe6: -2 +2 (unexplained: 4)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DcWbbHFmyph/,60995,venue,Venue,6,credit_line,t,t,t,2026-08-22,"linnea & john",f)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DdcGtnzTR0I/,1479,venue,Venue,5,credit_line,t,f,t,2026-09-18,,f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DcWbbHFmyph/,5049,venue,Venue,6,credit_line,t,t,t,2026-08-22,"linnea & john",f)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DdcGtnzTR0I/,566,venue,Venue,5,credit_line,t,f,t,2026-09-18,,f)

### post_styled_shoot_signal: -5 +5 (unexplained: 10)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DVNHdCpjpv8/,diem_angie,f,f,f,f,t,POSSIBLE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZ99P3LHPmn/,smilebooth_chicago,f,f,f,f,f,NO_SIGNAL)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZfrjblxhop/,chicago_weddings,f,f,f,f,f,NO_SIGNAL)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DabB7ajBElq/,chicago_weddings,f,f,f,f,f,NO_SIGNAL)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbL7c5XmqiV/,anino.multimedia,f,f,f,f,f,NO_SIGNAL)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DVNHdCpjpv8/,diemangie,f,f,f,f,t,POSSIBLE)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DZ99P3LHPmn/,smileboothchicago,f,f,f,f,f,NO_SIGNAL)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DZfrjblxhop/,chicagoweddings,f,f,f,f,f,NO_SIGNAL)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DabB7ajBElq/,chicagoweddings,f,f,f,f,f,NO_SIGNAL)
- `+` [UNEXPLAINED] (https://www.instagram.com/p/DbL7c5XmqiV/,aninomultimedia,f,f,f,f,f,NO_SIGNAL)

### human_confirmed_post_vendor_association: -32 +32 (unexplained: 32)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Cx072u2Pcjw/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Cx6s-7YNZ-4/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DJUe50kJjfc/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DOrGXcDDmng/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DV9va9uEtsR/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DYYBLC0DPTA/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZ8FM2Jmmz_/,,f,2,t,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZp8mqbG-Kt/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZrvBe6lvc0/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZsBKcGBpBy/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZv4ZhWHG_O/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Da8HaXToK6s/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DaDslHzkdch/,,f,2,t,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DaES_sskWdE/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DagbhA3kZz7/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Dav81E-EYu2/,,f,8,t,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DayjKgSmV9R/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DayrjxpmqqH/,,f,1,t,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Db0rm-LuCLB/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Db8XaPeFhky/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbOynrNFbN0/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbPe6XHFcLw/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbThiW4HOH3/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Db_n0HjIMam/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbbcjmLIGlL/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Dbd6S01kdg2/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbqWK0BERcM/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbuQa5HDD9X/,,f,4,t,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbvtHZqDmPB/,,f,1,t,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DcHAMKUjFTt/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DcHU1wmCTpH/,,f,0,f,NONE)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DcQbMZixjU5/,,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Cx072u2Pcjw/,90454,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Cx6s-7YNZ-4/,90454,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DJUe50kJjfc/,89897,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DOrGXcDDmng/,89517,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DV9va9uEtsR/,90462,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DYYBLC0DPTA/,89413,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZ8FM2Jmmz_/,90714,f,2,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DZp8mqbG-Kt/,90165,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZrvBe6lvc0/,90501,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZsBKcGBpBy/,89573,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZv4ZhWHG_O/,90726,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Da8HaXToK6s/,90627,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DaDslHzkdch/,89898,f,2,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DaES_sskWdE/,90427,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DagbhA3kZz7/,90603,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Dav81E-EYu2/,89825,f,8,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DayjKgSmV9R/,89799,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DayrjxpmqqH/,90189,f,1,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/Db0rm-LuCLB/,90452,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Db8XaPeFhky/,90108,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbOynrNFbN0/,90302,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbPe6XHFcLw/,89610,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbThiW4HOH3/,90244,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Db_n0HjIMam/,89598,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbbcjmLIGlL/,89688,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Dbd6S01kdg2/,90777,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbqWK0BERcM/,90630,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbuQa5HDD9X/,90597,f,4,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DbvtHZqDmPB/,89442,f,1,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DcHAMKUjFTt/,89610,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DcHU1wmCTpH/,89610,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DcQbMZixjU5/,89554,f,0,f,NONE)

### human_confirmed_vendor_page_content: -6 +6 (unexplained: 6)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DZ8FM2Jmmz_/,jeremy,"2026-09-05 21:33:03.291106+00",human_review_ui_v2_2026-09-05,,f,2,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DaDslHzkdch/,jeremy,"2026-09-08 02:20:29.673621+00",beyond_include_v1_sync_round2_2026-09-07,,f,2,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/Dav81E-EYu2/,jeremy,"2026-09-08 02:20:30.242568+00",beyond_include_v1_sync_round2_2026-09-07,,f,8,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DayrjxpmqqH/,jeremy,"2026-09-05 20:43:53.772083+00",human_review_ui_v2_2026-09-05,,f,1,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbuQa5HDD9X/,jeremy,"2026-09-05 20:43:55.422152+00",human_review_ui_v2_2026-09-05,,f,4,TAGGED_ONLY)
- `-` [UNEXPLAINED] (https://www.instagram.com/p/DbvtHZqDmPB/,jeremy,"2026-09-05 20:43:55.557053+00",human_review_ui_v2_2026-09-05,,f,1,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DZ8FM2Jmmz_/,jeremy,"2026-09-05 21:33:03.291106+00",human_review_ui_v2_2026-09-05,90714,f,2,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DaDslHzkdch/,jeremy,"2026-09-08 02:20:29.673621+00",beyond_include_v1_sync_round2_2026-09-07,89898,f,2,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/Dav81E-EYu2/,jeremy,"2026-09-08 02:20:30.242568+00",beyond_include_v1_sync_round2_2026-09-07,89825,f,8,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DayrjxpmqqH/,jeremy,"2026-09-05 20:43:53.772083+00",human_review_ui_v2_2026-09-05,90189,f,1,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DbuQa5HDD9X/,jeremy,"2026-09-05 20:43:55.422152+00",human_review_ui_v2_2026-09-05,90597,f,4,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DbvtHZqDmPB/,jeremy,"2026-09-05 20:43:55.557053+00",human_review_ui_v2_2026-09-05,89442,f,1,TAGGED_ONLY)

## Post-conditions (asserted)
```json
{
  "posts_count_eq_distinct": {
    "n": 67864,
    "sc": 67864,
    "url": 67864
  },
  "evidence_orphan_urls": {
    "stack_extraction_runs": 0,
    "stack_extraction_entries": 0,
    "stack_extraction_runs_v2": 0,
    "stack_extraction_entries_v2": 0,
    "post_classification_runs": 10,
    "post_extraction_runs": 0,
    "post_venue_verdicts": 0,
    "human_post_labels": 1,
    "extracted_venue_anchors": 0,
    "jeremy_wedding_candidate_posts": 0,
    "candidate_scores": 10,
    "golden_set": 1,
    "vendor_extraction_golden_set": 0,
    "label_queue": 1,
    "non_wedding_posts_retired": 0
  },
  "observations": {
    "unobserved": 0,
    "zero_is_first": 0,
    "multi_is_first": 0
  }
}
```
- FAIL post_classification_runs: 10 evidence urls not in posts
- FAIL human_post_labels: 1 evidence urls not in posts
- FAIL candidate_scores: 10 evidence urls not in posts
- FAIL golden_set: 1 evidence urls not in posts
- FAIL label_queue: 1 evidence urls not in posts

## Reported, not rewritten: posts the loop counted as NEW that Jeremy's staging already held
- acq-20260921-d065scale: 306
- acq-20260920-d065C: 67
- acq-20260920-d065D: 64
- acq-20260919-probesA: 63
- acq-20260920-deepen: 46
- acq-20260920-vendor: 36
- acq-20260920-probe6: 35
- acq-20260919-probesA-lowtypes: 13
- acq-20260919-canary: 12
- acq-20260920-d063s2: 12
- acq-20260919-canary-vendor: 10
- acq-20260920-discovered: 9
- acq-20260920-probesB: 9
- legacy-ben-crawl1-zero-venues: 9
- acq-20260920-d065A: 6
- acq-20260919-pilot: 1

## Revert (valid until the first write that references a merged row -- the P4-W3 lock release)
```sql
begin;
-- views: re-apply the pre-merge definitions (git show fcd2445:pipeline/schema.sql + the live defs saved in tmp_analysis/pm_predefs_pm-20260923-merge-1.sql)
delete from ops.post_observations where run_id in (94, 93);
update ops.post_observations o set is_first = false from ops.post_merge_log l where l.batch_id = 'pm-20260923-merge-1' and l.action = 'is_first_set' and o.post_id = l.post_id and o.run_id = (l.after->>'run_id')::bigint;
update posts p set source = l.before->>'source', raw = l.before->'raw', raw_format = l.before->>'raw_format', staging_post_id = null, merge_batch_id = null from ops.post_merge_log l where l.batch_id = 'pm-20260923-merge-1' and l.action = 'relabel' and p.id = l.post_id;
update posts p set staging_post_id = null, staging_raw = null, merge_batch_id = null from ops.post_merge_log l where l.batch_id = 'pm-20260923-merge-1' and l.action = 'link' and p.id = l.post_id;
delete from posts p using ops.post_merge_log l where l.batch_id = 'pm-20260923-merge-1' and l.action = 'insert' and p.id = l.post_id;  -- the one sanctioned post delete: undoing this batch's own inserts
delete from accounts a using ops.post_merge_log l where l.batch_id = 'pm-20260923-merge-1' and l.action = 'mint_account' and a.id = (l.after->>'account_id')::bigint;
delete from ops.post_merge_exclusions where batch_id = 'pm-20260923-merge-1';
commit;
```

## Verdict
- unexplained frozen-output rows: **90**
- post-condition failures: **5**
- funnel moved: true (expected: total −10 for the profile urls, nothing else)
