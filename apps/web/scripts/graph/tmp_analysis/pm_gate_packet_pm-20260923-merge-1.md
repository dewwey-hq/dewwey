# Post-table merge — P2 gate packet (pm-20260923-merge-1)
Generated 2026-09-23T05:26:55.329Z by `mergeStagingPosts.ts` --apply.

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
| anino.multimedia | 1 | aninomultimedia | existing |
| chicago_weddings | 2 | chicagoweddings | existing |
| diem_angie | 1 | diemangie | existing |
| kelly_k_photography_ | 2 | kelly_k_photography | existing |
| smilebooth_chicago | 1 | smileboothchicago | existing |

## Field conflicts (typed columns kept; staging row stored in staging_raw)
- DcOQaPtC6bk: owner posts=bwstudio_events staging=bwstudio_events; caption len posts=773 staging=767
- C__71R1P-1_: owner posts=juliannapressleyphoto staging=juliannapressleyphotography; caption len posts=588 staging=588

## Frozen outputs vs the P0 baseline
Funnel: baseline {"total":67874,"parsed":67177,"clustered":14520,"read_by_reader":7423,"in_a_wedding":9065} → now {"total":67864,"parsed":67177,"clustered":14520,"read_by_reader":7423,"in_a_wedding":9065}

### structural_post_vendor_evidence: -109 +109 (unexplained: 0)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C-G4YAEP16X/,8725,venue,venue,4,credit_line,t,t,t,2024-08-01,"madison + albert",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C2I_pm2ukAi/,35540,venue,Venue,2,credit_line,t,f,t,2024-01-16,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C2OIB_MuN_O/,35540,venue,Venue,3,credit_line,t,t,t,2024-01-18,"bride: @",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C3F1DoZif8h/,35108,venue,Venue,17,credit_line,t,t,t,2024-02-08,"phil & shakti",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C3a-SeUuBQ7/,35108,venue,Venue,18,credit_line,t,f,t,2024-02-16,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C4MkKTSrQC_/,28285,venue,Venue,13,credit_line,t,t,t,2024-03-07,"ashlee & frankie",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C4v3Q62vFQG/,33170,venue,Venue,4,credit_line,t,f,t,2024-03-20,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C51AHgKAGJX/,18451,venue,Venue,3,credit_line,t,t,t,2024-04-16,"betance & michael",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C7hiHKyu_Jn/,32868,venue,Venue,4,credit_line,t,t,t,2024-05-28,"coco & willie",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C7kZMLlP7uQ/,33203,venue,"Reception Venue & Bar",4,credit_line,t,t,t,2024-05-29,"katie and joe",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C7mNBfmOZUK/,34925,venue,Venue,5,credit_line,t,t,t,2024-05-30,"kelsey & andrew",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C8Xwzsohgcb/,33254,venue,Venue,7,credit_line,t,t,t,2024-06-18,"farmers & fenimore",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C8aICbFybMO/,32644,venue,Venue,6,credit_line,t,f,t,2024-06-19,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C9S6lf7yPXQ/,7689,venue,Venue,3,credit_line,t,t,f,2024-07-11,"cara & sean",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C_UKMOetWHO/,33203,venue,"Reception Venue & Bar",5,credit_line,t,t,t,2024-08-31,"digital and super",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C_gCzaBRxz-/,700,venue,Venue,6,credit_line,t,t,t,2024-09-04,"morgan & nimmy",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/CsL1O8OvhHn/,34593,venue,Venue,4,credit_line,t,f,t,2023-05-13,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/Cud77q0A56H/,18505,venue,Venue,3,credit_line,t,f,t,2023-07-09,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/Cvu69aqhMU4/,648,venue,Venue,1,credit_line,t,f,t,2023-08-09,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/Cyi2720LbP3/,31029,venue,Venue,19,credit_line,t,f,f,2023-10-18,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DAtyA4RPKaK/,19678,venue,venue,5,credit_line,t,f,t,2024-10-04,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DBd9Tfmpnkl/,11155,venue,VENUE,23,credit_line,t,f,t,2024-10-23,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DC8DiOtC1t6/,85989,venue,Venue,2,credit_line,t,t,f,2024-11-29,"lauren and scarlett",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCHJKGROYFV/,32562,venue,Venues,3,credit_line,t,t,f,2024-11-08,"kim and noah",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCkV--0vQjM/,281,venue,Venue,11,credit_line,t,f,t,2024-11-19,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCvS7k_OF0n/,32868,venue,Venue,4,credit_line,t,f,t,2024-11-24,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCwb_uppJaP/,30840,venue,VENUE,26,credit_line,t,t,t,2024-11-24,"katie and max",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DDGJtXepbNh/,34037,venue,VENUE,28,credit_line,t,f,t,2024-12-03,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DDssnNgMrPf/,33834,venue,reception,11,credit_line,t,f,t,2024-12-17,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DFIPMtKupaE/,178,venue,Venue,3,credit_line,t,f,f,2025-01-22,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DFQs-BkyKPw/,28613,venue,Venue,11,credit_line,t,f,t,2025-01-25,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DG5CVs4uzzT/,53645,venue,Venues,3,credit_line,t,f,f,2025-03-07,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DGTIOjysk8K/,29013,venue,Venue,3,credit_line,t,t,t,2025-02-20,"stylist & set",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DGlg6i5vHkH/,30511,venue,Venue,5,credit_line,t,f,t,2025-02-27,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DJAhb7pAPZ5/,30511,venue,Venue,4,credit_line,t,f,t,2025-04-28,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DJFy21GPa5E/,32925,venue,Venue,7,credit_line,t,t,t,2025-05-01,"rebekah & rudy",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DLmq4L_OqWH/,35532,venue,Venue,11,credit_line,t,f,f,2025-07-02,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DMGFxBnsfUG/,35773,venue,Venue,4,credit_line,t,t,f,2025-07-14,"mary and chris",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DMJ485tM-sG/,35526,venue,Venues,4,credit_line,t,f,t,2025-07-16,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DMne_b7u27d/,31739,venue,Venue,10,credit_line,t,f,f,2025-07-27,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C-G4YAEP16X/,194,venue,venue,4,credit_line,t,t,t,2024-08-01,"madison + albert",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C2I_pm2ukAi/,146,venue,Venue,2,credit_line,t,f,t,2024-01-16,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C2OIB_MuN_O/,146,venue,Venue,3,credit_line,t,t,t,2024-01-18,"bride: @",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C3F1DoZif8h/,34967,venue,Venue,17,credit_line,t,t,t,2024-02-08,"phil & shakti",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C3a-SeUuBQ7/,34967,venue,Venue,18,credit_line,t,f,t,2024-02-16,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C4MkKTSrQC_/,18553,venue,Venue,13,credit_line,t,t,t,2024-03-07,"ashlee & frankie",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C4v3Q62vFQG/,33169,venue,Venue,4,credit_line,t,f,t,2024-03-20,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C51AHgKAGJX/,4420,venue,Venue,3,credit_line,t,t,t,2024-04-16,"betance & michael",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C7hiHKyu_Jn/,32867,venue,Venue,4,credit_line,t,t,t,2024-05-28,"coco & willie",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C7kZMLlP7uQ/,33202,venue,"Reception Venue & Bar",4,credit_line,t,t,t,2024-05-29,"katie and joe",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C7mNBfmOZUK/,29828,venue,Venue,5,credit_line,t,t,t,2024-05-30,"kelsey & andrew",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C8Xwzsohgcb/,30220,venue,Venue,7,credit_line,t,t,t,2024-06-18,"farmers & fenimore",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C8aICbFybMO/,31291,venue,Venue,6,credit_line,t,f,t,2024-06-19,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C9S6lf7yPXQ/,525,venue,Venue,3,credit_line,t,t,f,2024-07-11,"cara & sean",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C_UKMOetWHO/,33202,venue,"Reception Venue & Bar",5,credit_line,t,t,t,2024-08-31,"digital and super",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/C_gCzaBRxz-/,482,venue,Venue,6,credit_line,t,t,t,2024-09-04,"morgan & nimmy",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/CsL1O8OvhHn/,34592,venue,Venue,4,credit_line,t,f,t,2023-05-13,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/Cud77q0A56H/,5272,venue,Venue,3,credit_line,t,f,t,2023-07-09,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/Cvu69aqhMU4/,646,venue,Venue,1,credit_line,t,f,t,2023-08-09,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/Cyi2720LbP3/,27397,venue,Venue,19,credit_line,t,f,f,2023-10-18,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DAtyA4RPKaK/,3389,venue,venue,5,credit_line,t,f,t,2024-10-04,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DBd9Tfmpnkl/,239,venue,VENUE,23,credit_line,t,f,t,2024-10-23,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DC8DiOtC1t6/,18242,venue,Venue,2,credit_line,t,t,f,2024-11-29,"lauren and scarlett",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCHJKGROYFV/,29238,venue,Venues,3,credit_line,t,t,f,2024-11-08,"kim and noah",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCkV--0vQjM/,280,venue,Venue,11,credit_line,t,f,t,2024-11-19,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCvS7k_OF0n/,32867,venue,Venue,4,credit_line,t,f,t,2024-11-24,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DCwb_uppJaP/,239,venue,VENUE,26,credit_line,t,t,t,2024-11-24,"katie and max",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DDGJtXepbNh/,239,venue,VENUE,28,credit_line,t,f,t,2024-12-03,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DDssnNgMrPf/,11,venue,reception,11,credit_line,t,f,t,2024-12-17,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DFIPMtKupaE/,128,venue,Venue,3,credit_line,t,f,f,2025-01-22,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DFQs-BkyKPw/,27995,venue,Venue,11,credit_line,t,f,t,2025-01-25,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DG5CVs4uzzT/,1212,venue,Venues,3,credit_line,t,f,f,2025-03-07,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DGTIOjysk8K/,4486,venue,Venue,3,credit_line,t,t,t,2025-02-20,"stylist & set",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DGlg6i5vHkH/,29850,venue,Venue,5,credit_line,t,f,t,2025-02-27,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DJAhb7pAPZ5/,29850,venue,Venue,4,credit_line,t,f,t,2025-04-28,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DJFy21GPa5E/,31852,venue,Venue,7,credit_line,t,t,t,2025-05-01,"rebekah & rudy",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DLmq4L_OqWH/,35531,venue,Venue,11,credit_line,t,f,f,2025-07-02,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DMGFxBnsfUG/,34313,venue,Venue,4,credit_line,t,t,f,2025-07-14,"mary and chris",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DMJ485tM-sG/,35296,venue,Venues,4,credit_line,t,f,t,2025-07-16,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DMne_b7u27d/,28961,venue,Venue,10,credit_line,t,f,f,2025-07-27,,f)

### structural_for_batch:acq-20260919-probesA: -5 +5 (unexplained: 0)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DG5CVs4uzzT/,34986,venue,Venues,3,credit_line,t,f,f,2025-03-07,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DOZIMidEoo-/,18865,venue,Venue,4,credit_line,t,t,t,2025-09-09,"tori and xander",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbBixNfllxC/,50602,venue,venue,8,credit_line,t,f,f,2026-07-20,,f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbTosuiM1vn/,28418,venue,Venues,14,credit_line,t,t,t,2026-07-27,"coordination + content",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbWw0lGu-13/,2626,venue,Venues,14,credit_line,t,t,t,2026-07-28,"coordination + content",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DG5CVs4uzzT/,1212,venue,Venues,3,credit_line,t,f,f,2025-03-07,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DOZIMidEoo-/,653,venue,Venue,4,credit_line,t,t,t,2025-09-09,"tori and xander",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbBixNfllxC/,21195,venue,venue,8,credit_line,t,f,f,2026-07-20,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbTosuiM1vn/,1643,venue,Venues,14,credit_line,t,t,t,2026-07-27,"coordination + content",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbWw0lGu-13/,1643,venue,Venues,14,credit_line,t,t,t,2026-07-28,"coordination + content",f)

### structural_for_batch:acq-20260920-probe6: -4 +4 (unexplained: 0)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbMWNRTjjzw/,27435,venue,"Reception Venue",10,credit_line,t,t,t,2026-07-24,"dress & veil",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DcWbbHFmyph/,60995,venue,Venue,6,credit_line,t,t,t,2026-08-22,"linnea & john",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DdG0eursMFJ/,32293,venue,Venues,33,credit_line,t,t,t,2026-09-10,"forrest and chris",f)
- `-` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DdcGtnzTR0I/,1479,venue,Venue,5,credit_line,t,f,t,2026-09-18,,f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DbMWNRTjjzw/,27432,venue,"Reception Venue",10,credit_line,t,t,t,2026-07-24,"dress & veil",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DcWbbHFmyph/,5049,venue,Venue,6,credit_line,t,t,t,2026-08-22,"linnea & john",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DdG0eursMFJ/,3299,venue,Venues,33,credit_line,t,t,t,2026-09-10,"forrest and chris",f)
- `+` [venue tie-break (conflicting credit line)] (https://www.instagram.com/p/DdcGtnzTR0I/,566,venue,Venue,5,credit_line,t,f,t,2026-09-18,,f)

### post_styled_shoot_signal: -5 +5 (unexplained: 0)
- `-` [twin owner (default: existing account)] (https://www.instagram.com/p/DVNHdCpjpv8/,diem_angie,f,f,f,f,t,POSSIBLE)
- `-` [twin owner (default: existing account)] (https://www.instagram.com/p/DZ99P3LHPmn/,smilebooth_chicago,f,f,f,f,f,NO_SIGNAL)
- `-` [twin owner (default: existing account)] (https://www.instagram.com/p/DZfrjblxhop/,chicago_weddings,f,f,f,f,f,NO_SIGNAL)
- `-` [twin owner (default: existing account)] (https://www.instagram.com/p/DabB7ajBElq/,chicago_weddings,f,f,f,f,f,NO_SIGNAL)
- `-` [twin owner (default: existing account)] (https://www.instagram.com/p/DbL7c5XmqiV/,anino.multimedia,f,f,f,f,f,NO_SIGNAL)
- `+` [twin owner (default: existing account)] (https://www.instagram.com/p/DVNHdCpjpv8/,diemangie,f,f,f,f,t,POSSIBLE)
- `+` [twin owner (default: existing account)] (https://www.instagram.com/p/DZ99P3LHPmn/,smileboothchicago,f,f,f,f,f,NO_SIGNAL)
- `+` [twin owner (default: existing account)] (https://www.instagram.com/p/DZfrjblxhop/,chicagoweddings,f,f,f,f,f,NO_SIGNAL)
- `+` [twin owner (default: existing account)] (https://www.instagram.com/p/DabB7ajBElq/,chicagoweddings,f,f,f,f,f,NO_SIGNAL)
- `+` [twin owner (default: existing account)] (https://www.instagram.com/p/DbL7c5XmqiV/,aninomultimedia,f,f,f,f,f,NO_SIGNAL)

### human_confirmed_post_vendor_association: -32 +32 (unexplained: 0)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Cx072u2Pcjw/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Cx6s-7YNZ-4/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DJUe50kJjfc/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DOrGXcDDmng/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DV9va9uEtsR/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DYYBLC0DPTA/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DZ8FM2Jmmz_/,,f,2,t,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DZp8mqbG-Kt/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DZrvBe6lvc0/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DZsBKcGBpBy/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DZv4ZhWHG_O/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Da8HaXToK6s/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DaDslHzkdch/,,f,2,t,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DaES_sskWdE/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DagbhA3kZz7/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Dav81E-EYu2/,,f,8,t,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DayjKgSmV9R/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DayrjxpmqqH/,,f,1,t,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Db0rm-LuCLB/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Db8XaPeFhky/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbOynrNFbN0/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbPe6XHFcLw/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbThiW4HOH3/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Db_n0HjIMam/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbbcjmLIGlL/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Dbd6S01kdg2/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbqWK0BERcM/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbuQa5HDD9X/,,f,4,t,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbvtHZqDmPB/,,f,1,t,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DcHAMKUjFTt/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DcHU1wmCTpH/,,f,0,f,NONE)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DcQbMZixjU5/,,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Cx072u2Pcjw/,93272,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Cx6s-7YNZ-4/,93272,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DJUe50kJjfc/,92715,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DOrGXcDDmng/,92335,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DV9va9uEtsR/,93280,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DYYBLC0DPTA/,92231,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZ8FM2Jmmz_/,93532,f,2,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DZp8mqbG-Kt/,92983,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZrvBe6lvc0/,93319,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZsBKcGBpBy/,92391,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DZv4ZhWHG_O/,93544,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Da8HaXToK6s/,93445,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DaDslHzkdch/,92716,f,2,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DaES_sskWdE/,93245,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DagbhA3kZz7/,93421,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Dav81E-EYu2/,92643,f,8,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DayjKgSmV9R/,92617,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DayrjxpmqqH/,93007,f,1,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/Db0rm-LuCLB/,93270,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Db8XaPeFhky/,92926,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbOynrNFbN0/,93120,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbPe6XHFcLw/,92428,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbThiW4HOH3/,93062,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Db_n0HjIMam/,92416,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbbcjmLIGlL/,92506,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/Dbd6S01kdg2/,93595,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbqWK0BERcM/,93448,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DbuQa5HDD9X/,93415,f,4,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DbvtHZqDmPB/,92260,f,1,t,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DcHAMKUjFTt/,92428,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DcHU1wmCTpH/,92428,f,0,f,NONE)
- `+` [minted account resolves] (https://www.instagram.com/p/DcQbMZixjU5/,92372,f,0,f,NONE)

### human_confirmed_vendor_page_content: -6 +6 (unexplained: 0)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DZ8FM2Jmmz_/,jeremy,"2026-09-05 21:33:03.291106+00",human_review_ui_v2_2026-09-05,,f,2,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DaDslHzkdch/,jeremy,"2026-09-08 02:20:29.673621+00",beyond_include_v1_sync_round2_2026-09-07,,f,2,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/Dav81E-EYu2/,jeremy,"2026-09-08 02:20:30.242568+00",beyond_include_v1_sync_round2_2026-09-07,,f,8,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DayrjxpmqqH/,jeremy,"2026-09-05 20:43:53.772083+00",human_review_ui_v2_2026-09-05,,f,1,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbuQa5HDD9X/,jeremy,"2026-09-05 20:43:55.422152+00",human_review_ui_v2_2026-09-05,,f,4,TAGGED_ONLY)
- `-` [minted account resolves (paired)] (https://www.instagram.com/p/DbvtHZqDmPB/,jeremy,"2026-09-05 20:43:55.557053+00",human_review_ui_v2_2026-09-05,,f,1,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DZ8FM2Jmmz_/,jeremy,"2026-09-05 21:33:03.291106+00",human_review_ui_v2_2026-09-05,93532,f,2,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DaDslHzkdch/,jeremy,"2026-09-08 02:20:29.673621+00",beyond_include_v1_sync_round2_2026-09-07,92716,f,2,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/Dav81E-EYu2/,jeremy,"2026-09-08 02:20:30.242568+00",beyond_include_v1_sync_round2_2026-09-07,92643,f,8,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DayrjxpmqqH/,jeremy,"2026-09-05 20:43:53.772083+00",human_review_ui_v2_2026-09-05,93007,f,1,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DbuQa5HDD9X/,jeremy,"2026-09-05 20:43:55.422152+00",human_review_ui_v2_2026-09-05,93415,f,4,TAGGED_ONLY)
- `+` [minted account resolves] (https://www.instagram.com/p/DbvtHZqDmPB/,jeremy,"2026-09-05 20:43:55.557053+00",human_review_ui_v2_2026-09-05,92260,f,1,TAGGED_ONLY)

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
    "post_classification_runs": 0,
    "post_extraction_runs": 0,
    "post_venue_verdicts": 0,
    "human_post_labels": 0,
    "extracted_venue_anchors": 0,
    "jeremy_wedding_candidate_posts": 0,
    "candidate_scores": 0,
    "golden_set": 0,
    "vendor_extraction_golden_set": 0,
    "label_queue": 0,
    "non_wedding_posts_retired": 0
  },
  "observations": {
    "unobserved": 0,
    "zero_is_first": 0,
    "multi_is_first": 0
  }
}
```
All post-conditions hold.

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
- unexplained frozen-output rows: **0**
- post-condition failures: **0**
- funnel moved: true (expected: total −10 for the profile urls, nothing else)
