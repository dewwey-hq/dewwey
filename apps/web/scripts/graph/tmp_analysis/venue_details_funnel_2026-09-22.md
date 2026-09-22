# Venue details funnel

Generated 2026-09-22T03:55:39.389Z. prompt_version = venue-details-v3.5.

## Funnel

| stage | count | % of listed |
|---|---|---|
| listed | 442 | 100% |
| website verified | 250 | 56.6% |
| crawled (>=5 usable pages) | 37 | 8.4% |
| extracted | 36 | 8.1% |
| validated ok | 34 | 7.7% |
| repaired | 11 | 2.5% |
| served | 33 | 7.5% |
| **compare_ready** | **24** | 5.4% |
| **excellent** | **12** | 2.7% |
| human verified | 0 | 0.0% |

## Per-spine-field stated rate by tier (over served documents)

Tier averages: critical 59.5%, important 32.4%, secondary 37.1%

| field | tier | stated rate |
|---|---|---|
| venue_kind | critical | 90.9% |
| setting | critical | 87.9% |
| one_event_per_day | important | 15.2% |
| space_count_bookable | secondary | 66.7% |
| capacity_min_guests | important | 18.2% |
| capacity_max_guests | important | 87.9% |
| ceremony_on_site | critical | 72.7% |
| ceremony_fee | critical | 24.2% |
| rental_hours_included | important | 42.4% |
| weekday_events | secondary | 27.3% |
| catering | critical | 78.8% |
| bar | critical | 75.8% |
| rental_charge_type | critical | 97.0% |
| fb_minimum | critical | 24.2% |
| service_charge_pct | critical | 12.1% |
| parking | important | 69.7% |
| day_of_coordinator | important | 51.5% |
| payment_schedule | important | 30.3% |
| cancellation | important | 12.1% |
| event_insurance | important | 21.2% |
| security | important | 33.3% |
| vendor_access | secondary | 21.2% |
| noise_curfew | important | 21.2% |
| sales_tax_pct | important | 9.1% |
| cc_fee_pct | secondary | 6.1% |
| taxes_included_in_rental | important | 9.1% |
| vendor_list_policy | critical | 69.7% |
| pets_allowed | secondary | 24.2% |
| hvac | secondary | 33.3% |
| ada_accessible | secondary | 51.5% |
| bridal_suite | secondary | 63.6% |
| tables_chairs_included | secondary | 60.6% |
| linens_included | secondary | 27.3% |
| dance_floor_included | secondary | 27.3% |
| coat_check | secondary | 36.4% |
| pricing_archetype | critical | 100.0% |
| price_from_usd | critical | 39.4% |
| per_guest_from_usd | critical | 30.3% |
| per_guest_to_usd | critical | 30.3% |

## review_reasons histogram (needs_review rows only)

(none)

## Spend by prompt_version / stage

| prompt_version | stage | runs | total cost (USD) |
|---|---|---|---|
| venue-details-v3.0 | extract | 15 | $2.29 |
| venue-details-v3.0 | repair | 14 | $0.02 |
| venue-details-v3.1 | extract | 5 | $1.03 |
| venue-details-v3.2 | extract | 7 | $1.59 |
| venue-details-v3.2 | repair | 4 | $0.04 |
| venue-details-v3.3 | extract | 6 | $1.61 |
| venue-details-v3.4 | extract | 6 | $1.73 |
| venue-details-v3.5 | extract | 36 | $6.96 |
| venue-details-v3.5 | repair | 18 | $0.16 |
| **total** | | | **$15.45** |

## Crawl ceiling (listed universe's websites)

- Websites checked: **303**
- Shells (zero usable pages, no text-layer PDF): **263** (86.8%)
- Image-only-PDF-only (zero usable pages, only image-only PDFs): **0** (0.0%)
