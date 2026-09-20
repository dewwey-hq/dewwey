[validate] runs selected: 6

[validate] run 43 account 1131 (Field Museum)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=10  critical_failures=0
  grounding: checked=48 passed=48 failed=0 min_coverage=1
  headline capacity: 1500 (seated_dinner)  compare_ready=true
  issues: 13  repairs: 0
  [validate] wrote validation to venue_details_runs.id=43

[validate] run 41 account 27389 (Diamond Garden Banquet)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=30  critical_failures=0
  grounding: checked=177 passed=177 failed=0 min_coverage=1
  headline capacity: 268 (seated_dinner)  compare_ready=true
  issues: 44  repairs: 0
  [validate] wrote validation to venue_details_runs.id=41

[validate] run 42 account 2785 (LondonHouse Chicago)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=26  critical_failures=0
  grounding: checked=121 passed=121 failed=0 min_coverage=0.5
  headline capacity: 275 (seated_dinner)  compare_ready=true
  issues: 24  repairs: 0
  [validate] wrote validation to venue_details_runs.id=42

[validate] run 40 account 31 (GALLERIA MARCHETTI)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=27  critical_failures=0
  grounding: checked=94 passed=94 failed=0 min_coverage=0.9047619047619048
  headline capacity: 450 (seated_dinner)  compare_ready=true
  issues: 10  repairs: 0
  [validate] wrote validation to venue_details_runs.id=40

[validate] run 39 account 477 (GREENHOUSE LOFT)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=35  critical_failures=0
  grounding: checked=62 passed=62 failed=0 min_coverage=0.631578947368421
  headline capacity: 175 (seated_dinner)  compare_ready=true
  issues: 3  repairs: 0
  [validate] wrote validation to venue_details_runs.id=39

[validate] run 44 account 507 (The Geraghty)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=19  critical_failures=0
  grounding: checked=61 passed=61 failed=0 min_coverage=1
  headline capacity: 300 (seated_with_dance)  compare_ready=true
  issues: 10  repairs: 0
  [validate] wrote validation to venue_details_runs.id=44

=== --report: issue-code histogram across 6 run(s) ===
  amount_out_of_range            48
  weak_quote                     11
  unsupported_includes_item      10
  grounded_elsewhere             9
  unsupported_term_text          7
  capacity_other_event_type      6
  enum_invalid                   4
  capacity_gt_1000_named_room    3
  derived_inquire_only           2
  duplicate_space_merged         1
  fb_min_vs_guest_min            1
  malformed_array                1
  resource_not_crawled           1
