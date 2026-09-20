# Universal must-not floor (6 assertions, prompt_version=venue-details-v3.5)

| account_id | run | result |
|---|---|---|
| 280 | 98 | PASS |
| 515 | -- | SKIP (no servable run yet) |
| 236 | -- | SKIP (no servable run yet) |
| 194 | 71 | PASS |
| 551 | 70 | PASS |
| 525 | 72 | FAIL (1) |
| 687 | 73 | PASS |
| 3970 | 100 | FAIL (1) |
| 529 | 105 | PASS |
| 1329 | 76 | PASS |
| 8023 | 77 | PASS |
| 482 | 79 | PASS |
| 560 | 78 | PASS |
| 592 | 82 | FAIL (1) |
| 4420 | 80 | PASS |
| 524 | 81 | PASS |
| 577 | 84 | PASS |
| 520 | 104 | PASS |
| 595 | 85 | PASS |
| 263 | 86 | PASS |
| 591 | 87 | PASS |
| 521 | 88 | PASS |
| 484 | 101 | PASS |
| 519 | 103 | FAIL (3) |
| 1461 | 92 | FAIL (1) |
| 3300 | 99 | PASS |
| 129 | 93 | PASS |
| 509 | 102 | PASS |
| 540 | 95 | PASS |
| 1660 | 96 | FAIL (2) |

## Failures

### account 525 (run 72)
  - [no_junk_vendor_names] vendor "Bittersweet" in list "Wedding Cake" looks like a URL slug, not a real business name
### account 3970 (run 100)
  - [no_junk_vendor_names] vendor "Marryment" in list "Event Coordinators" looks like a URL slug, not a real business name
### account 592 (run 82)
  - [no_junk_vendor_names] vendor "Limelight" in list "Preferred Caterers" looks like a URL slug, not a real business name
### account 519 (run 103)
  - [no_junk_vendor_names] vendor "Photographers" in list "Recommended Vendors" looks like a URL slug, not a real business name
  - [no_junk_vendor_names] vendor "Transportation" in list "Recommended Vendors" looks like a URL slug, not a real business name
  - [no_junk_vendor_names] vendor "Officiants" in list "Recommended Vendors" looks like a URL slug, not a real business name
### account 1461 (run 92)
  - [no_junk_vendor_names] vendor "Shutterbooth" in list "Photobooths" looks like a URL slug, not a real business name
### account 1660 (run 96)
  - [no_junk_vendor_names] vendor "Limelight" in list "Preferred Catering Vendors" looks like a URL slug, not a real business name
  - [no_junk_vendor_names] vendor "Tablescapes" in list "Preferred Rental Vendors" looks like a URL slug, not a real business name

# Totals: 22/28 pass (2 venue(s) have no servable run yet).
