[validate] runs selected: 6

[validate] run 60 account 1131 (Field Museum)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=10  critical_failures=0
  grounding: checked=45 passed=45 failed=0 min_coverage=1
  headline capacity: 1500 (seated_dinner)  compare_ready=true
  issues: 21  repairs: 1
  [validate] wrote validation to venue_details_runs.id=60

[validate] run 59 account 27389 (Diamond Garden Banquet)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=30  critical_failures=0
  grounding: checked=163 passed=163 failed=0 min_coverage=1
  headline capacity: 268 (seated_dinner)  compare_ready=true
  issues: 40  repairs: 0
  [validate] wrote validation to venue_details_runs.id=59

[validate] run 62 account 2785 (LondonHouse Chicago)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=27  critical_failures=0
  grounding: checked=172 passed=171 failed=1 min_coverage=0
  headline capacity: 190 (seated_dinner)  compare_ready=true
  issues: 83  repairs: 0
  [validate] wrote validation to venue_details_runs.id=62

[validate] run 58 account 31 (GALLERIA MARCHETTI)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=26  critical_failures=0
  grounding: checked=95 passed=95 failed=0 min_coverage=0.5
  headline capacity: 450 (seated_dinner)  compare_ready=true
  issues: 23  repairs: 0
  [validate] wrote validation to venue_details_runs.id=58

[validate] run 57 account 477 (GREENHOUSE LOFT)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=35  critical_failures=0
  grounding: checked=101 passed=101 failed=0 min_coverage=0.631578947368421
  headline capacity: 175 (seated_with_dance)  compare_ready=true
  issues: 18  repairs: 1
  [validate] wrote validation to venue_details_runs.id=57

[validate] run 61 account 507 (The Geraghty)
  ok=true  needs_review=false  review_reasons=[]
  spine_stated_count=19  critical_failures=0
  grounding: checked=61 passed=61 failed=0 min_coverage=1
  headline capacity: 300 (seated_dinner)  compare_ready=true
  issues: 34  repairs: 0
  [validate] wrote validation to venue_details_runs.id=61

=== --report: issue-code histogram across 6 run(s) ===
  amount_out_of_range            93
  resource_derived               37
  grounded_elsewhere             23
  unsupported_includes_item      22
  weak_quote                     14
  unsupported_term_text          10
  capacity_layout_relabeled      4
  capacity_gt_1000_named_room    3
  capacity_other_event_type      3
  enum_invalid                   2
  derived_inquire_only           2
  rental_charge_no_per_guest     1
  duplicate_space_merged         1
  fb_min_vs_guest_min            1
  ungrounded_item                1
  setting_no_outdoor_space       1
  resource_not_crawled           1
