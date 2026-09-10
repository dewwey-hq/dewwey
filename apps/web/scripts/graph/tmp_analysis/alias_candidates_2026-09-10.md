# Venue alias candidates -- 2026-09-10

Universe: 1777 venue-ish accounts. Report-only -- verify before running applyAccountAliasesSchema.ts (or its own future round) to actually write account_aliases.

| Tier | Count |
|---|---|
| T1 (auto-safe) | 2 |
| T2 (verify) | 39 |
| T3 (list) | 52 |
| related, not the same venue | 31 |

## T1 -- auto-safe (2)

### @shoreby_club ~ @shorebyclub

- suggested: **canonical** = @shoreby_club, **alias** = @shorebyclub -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1, S1b
- weddings (venue-role, alias-resolved): @shoreby_club 0 / @shorebyclub 0
- candidates (structural): @shoreby_club 3 / @shorebyclub 2
- followers: @shoreby_club null / @shorebyclub null
- full_name: @shoreby_club "" / @shorebyclub ""
- evidence:
  - [S1] @shoreby_club ~ @shorebyclub (stem "shorebyclub")
  - [S1b] scrape/parse artifact ('.'/'_' variant)

### @pear_tree_estate ~ @peartreeestate

- suggested: **canonical** = @pear_tree_estate, **alias** = @peartreeestate -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1, S1b
- weddings (venue-role, alias-resolved): @pear_tree_estate 0 / @peartreeestate 0
- candidates (structural): @pear_tree_estate 2 / @peartreeestate 1
- followers: @pear_tree_estate null / @peartreeestate null
- full_name: @pear_tree_estate "" / @peartreeestate ""
- evidence:
  - [S1] @pear_tree_estate ~ @peartreeestate (stem "peartreeeste")
  - [S1b] scrape/parse artifact ('.'/'_' variant)

## T2 -- verify (39)

### @universityclubofchicago ~ @uclubashley

- suggested: **canonical** = @universityclubofchicago, **alias** = @uclubashley -- @universityclubofchicago has a scraped profile, @uclubashley does not
- signals: S5
- weddings (venue-role, alias-resolved): @universityclubofchicago 86 / @uclubashley 5
- candidates (structural): @universityclubofchicago 101 / @uclubashley 0
- followers: @universityclubofchicago 8332 / @uclubashley null
- full_name: @universityclubofchicago "University Club of Chicago" / @uclubashley ""
- evidence:
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DBM2IkePguO/)

### @uccweddings ~ @cacweddings

- suggested: **canonical** = @cacweddings, **alias** = @uccweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @uccweddings 86 / @cacweddings 0
- candidates (structural): @uccweddings 101 / @cacweddings 1
- followers: @uccweddings null / @cacweddings null
- full_name: @uccweddings "" / @cacweddings ""
- evidence:
  - [S6] Levenshtein distance 2: @cacweddings (never scraped) vs @uccweddings (real venue)

### @uccweddings ~ @tciweddings

- suggested: **canonical** = @tciweddings, **alias** = @uccweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @uccweddings 86 / @tciweddings 0
- candidates (structural): @uccweddings 101 / @tciweddings 1
- followers: @uccweddings null / @tciweddings null
- full_name: @uccweddings "" / @tciweddings ""
- evidence:
  - [S6] Levenshtein distance 2: @tciweddings (never scraped) vs @uccweddings (real venue)

### @cbgweddings ~ @cacweddings

- suggested: **canonical** = @cacweddings, **alias** = @cbgweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @cbgweddings 64 / @cacweddings 0
- candidates (structural): @cbgweddings 82 / @cacweddings 1
- followers: @cbgweddings null / @cacweddings null
- full_name: @cbgweddings "" / @cacweddings ""
- evidence:
  - [S6] Levenshtein distance 2: @cacweddings (never scraped) vs @cbgweddings (real venue)

### @interconchicago ~ @intercontinental

- suggested: **canonical** = @interconchicago, **alias** = @intercontinental -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5, S7
- weddings (venue-role, alias-resolved): @interconchicago 25 / @intercontinental 24
- candidates (structural): @interconchicago 31 / @intercontinental 39
- followers: @interconchicago null / @intercontinental null
- full_name: @interconchicago "" / @intercontinental ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DAtyA4RPKaK/)
  - [S7] reader disagreement: 2 posts THIS_VENUE>=0.8 at one venue but guessed the other's handle

### @ulcchicago ~ @lhchicago

- suggested: **canonical** = @ulcchicago, **alias** = @lhchicago -- @ulcchicago has a scraped profile, @lhchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @ulcchicago 35 / @lhchicago 16
- candidates (structural): @ulcchicago 44 / @lhchicago 18
- followers: @ulcchicago 6477 / @lhchicago null
- full_name: @ulcchicago "Union League Club of Chicago" / @lhchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @lhchicago (never scraped) vs @ulcchicago (real venue)

### @artinstituteweddingevents ~ @artinstituteweddingsevents

- suggested: **canonical** = @artinstituteweddingevents, **alias** = @artinstituteweddingsevents -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1, S6
- weddings (venue-role, alias-resolved): @artinstituteweddingevents 1 / @artinstituteweddingsevents 36
- candidates (structural): @artinstituteweddingevents 2 / @artinstituteweddingsevents 67
- followers: @artinstituteweddingevents null / @artinstituteweddingsevents null
- full_name: @artinstituteweddingevents "" / @artinstituteweddingsevents ""
- evidence:
  - [S1] @artinstituteweddingevents ~ @artinstituteweddingsevents (stem "artinstitute")
  - [S6] Levenshtein distance 1: @artinstituteweddingevents (never scraped) vs @artinstituteweddingsevents (real venue)

### @artinstitutespecialevents ~ @artinstituespecialevents

- suggested: **canonical** = @artinstitutespecialevents, **alias** = @artinstituespecialevents -- @artinstitutespecialevents has a scraped profile, @artinstituespecialevents does not
- signals: S6
- weddings (venue-role, alias-resolved): @artinstitutespecialevents 36 / @artinstituespecialevents 0
- candidates (structural): @artinstitutespecialevents 67 / @artinstituespecialevents 1
- followers: @artinstitutespecialevents 1626 / @artinstituespecialevents null
- full_name: @artinstitutespecialevents "Art Institute Weddings & Special Events" / @artinstituespecialevents ""
- evidence:
  - [S6] Levenshtein distance 1: @artinstituespecialevents (never scraped) vs @artinstitutespecialevents (real venue)

### @artinstitutechi ~ @artinsitutechi

- suggested: **canonical** = @artinstitutechi, **alias** = @artinsitutechi -- @artinstitutechi has a scraped profile, @artinsitutechi does not
- signals: S6
- weddings (venue-role, alias-resolved): @artinstitutechi 36 / @artinsitutechi 0
- candidates (structural): @artinstitutechi 67 / @artinsitutechi 1
- followers: @artinstitutechi 850234 / @artinsitutechi null
- full_name: @artinstitutechi "The Art Institute of Chicago" / @artinsitutechi ""
- evidence:
  - [S6] Levenshtein distance 1: @artinsitutechi (never scraped) vs @artinstitutechi (real venue)

### @totlspecialevents ~ @thompsonchicago

- suggested: **canonical** = @totlspecialevents, **alias** = @thompsonchicago -- @totlspecialevents has a scraped profile, @thompsonchicago does not
- signals: S5
- weddings (venue-role, alias-resolved): @totlspecialevents 46 / @thompsonchicago 8
- candidates (structural): @totlspecialevents 43 / @thompsonchicago 3
- followers: @totlspecialevents 2770 / @thompsonchicago null
- full_name: @totlspecialevents "Theater On The Lake Events" / @thompsonchicago ""
- evidence:
  - [S5] co-credited on the same venue credit line, 7 posts (e.g. https://www.instagram.com/p/DaBtG-ECMNC/)

### @ulcchicago ~ @wacchicago

- suggested: **canonical** = @ulcchicago, **alias** = @wacchicago -- @ulcchicago has a scraped profile, @wacchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @ulcchicago 35 / @wacchicago 3
- candidates (structural): @ulcchicago 44 / @wacchicago 17
- followers: @ulcchicago 6477 / @wacchicago null
- full_name: @ulcchicago "Union League Club of Chicago" / @wacchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @wacchicago (never scraped) vs @ulcchicago (real venue)

### @fschicago ~ @lhchicago

- suggested: **canonical** = @fschicago, **alias** = @lhchicago -- @fschicago has a scraped profile, @lhchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @fschicago 26 / @lhchicago 16
- candidates (structural): @fschicago 38 / @lhchicago 18
- followers: @fschicago 53006 / @lhchicago null
- full_name: @fschicago "Four Seasons Hotel Chicago" / @lhchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @lhchicago (never scraped) vs @fschicago (real venue)

### @totlspecialevents ~ @totlspeacialevents

- suggested: **canonical** = @totlspecialevents, **alias** = @totlspeacialevents -- @totlspecialevents has a scraped profile, @totlspeacialevents does not
- signals: S6
- weddings (venue-role, alias-resolved): @totlspecialevents 46 / @totlspeacialevents 1
- candidates (structural): @totlspecialevents 43 / @totlspeacialevents 1
- followers: @totlspecialevents 2770 / @totlspeacialevents null
- full_name: @totlspecialevents "Theater On The Lake Events" / @totlspeacialevents ""
- evidence:
  - [S6] Levenshtein distance 1: @totlspeacialevents (never scraped) vs @totlspecialevents (real venue)

### @ulcchicago ~ @olmchicago

- suggested: **canonical** = @ulcchicago, **alias** = @olmchicago -- @ulcchicago has a scraped profile, @olmchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @ulcchicago 35 / @olmchicago 1
- candidates (structural): @ulcchicago 44 / @olmchicago 0
- followers: @ulcchicago 6477 / @olmchicago null
- full_name: @ulcchicago "Union League Club of Chicago" / @olmchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @olmchicago (never scraped) vs @ulcchicago (real venue)

### @fschicago ~ @msichicago

- suggested: **canonical** = @fschicago, **alias** = @msichicago -- @fschicago has a scraped profile, @msichicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @fschicago 26 / @msichicago 0
- candidates (structural): @fschicago 38 / @msichicago 0
- followers: @fschicago 53006 / @msichicago null
- full_name: @fschicago "Four Seasons Hotel Chicago" / @msichicago ""
- evidence:
  - [S6] Levenshtein distance 2: @msichicago (never scraped) vs @fschicago (real venue)

### @wachicago ~ @lhchicago

- suggested: **canonical** = @wachicago, **alias** = @lhchicago -- @wachicago has a scraped profile, @lhchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @wachicago 11 / @lhchicago 16
- candidates (structural): @wachicago 12 / @lhchicago 18
- followers: @wachicago 32438 / @lhchicago null
- full_name: @wachicago "Waldorf Astoria Chicago" / @lhchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @lhchicago (never scraped) vs @wachicago (real venue)

### @wachicago ~ @wacchicago

- suggested: **canonical** = @wachicago, **alias** = @wacchicago -- @wachicago has a scraped profile, @wacchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @wachicago 11 / @wacchicago 3
- candidates (structural): @wachicago 12 / @wacchicago 17
- followers: @wachicago 32438 / @wacchicago null
- full_name: @wachicago "Waldorf Astoria Chicago" / @wacchicago ""
- evidence:
  - [S6] Levenshtein distance 1: @wacchicago (never scraped) vs @wachicago (real venue)

### @thefarmhouseplainfield ~ @thefarmhouseainfield

- suggested: **canonical** = @thefarmhouseainfield, **alias** = @thefarmhouseplainfield -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @thefarmhouseplainfield 14 / @thefarmhouseainfield 1
- candidates (structural): @thefarmhouseplainfield 23 / @thefarmhouseainfield 1
- followers: @thefarmhouseplainfield null / @thefarmhouseainfield null
- full_name: @thefarmhouseplainfield "" / @thefarmhouseainfield ""
- evidence:
  - [S6] Levenshtein distance 2: @thefarmhouseainfield (never scraped) vs @thefarmhouseplainfield (real venue)

### @uchicago ~ @lhchicago

- suggested: **canonical** = @uchicago, **alias** = @lhchicago -- @uchicago has a scraped profile, @lhchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @uchicago 1 / @lhchicago 16
- candidates (structural): @uchicago 1 / @lhchicago 18
- followers: @uchicago 271382 / @lhchicago null
- full_name: @uchicago "The University Of Chicago" / @lhchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @lhchicago (never scraped) vs @uchicago (real venue)

### @lhchicago ~ @olmchicago

- suggested: **canonical** = @lhchicago, **alias** = @olmchicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @lhchicago 16 / @olmchicago 1
- candidates (structural): @lhchicago 18 / @olmchicago 0
- followers: @lhchicago null / @olmchicago null
- full_name: @lhchicago "" / @olmchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @olmchicago (never scraped) vs @lhchicago (real venue)

### @wachicago ~ @mcachicago

- suggested: **canonical** = @wachicago, **alias** = @mcachicago -- @wachicago has a scraped profile, @mcachicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @wachicago 11 / @mcachicago 3
- candidates (structural): @wachicago 12 / @mcachicago 9
- followers: @wachicago 32438 / @mcachicago null
- full_name: @wachicago "Waldorf Astoria Chicago" / @mcachicago ""
- evidence:
  - [S6] Levenshtein distance 2: @mcachicago (never scraped) vs @wachicago (real venue)

### @wachicago ~ @wipachicago

- suggested: **canonical** = @wachicago, **alias** = @wipachicago -- @wachicago has a scraped profile, @wipachicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @wachicago 11 / @wipachicago 1
- candidates (structural): @wachicago 12 / @wipachicago 2
- followers: @wachicago 32438 / @wipachicago null
- full_name: @wachicago "Waldorf Astoria Chicago" / @wipachicago ""
- evidence:
  - [S6] Levenshtein distance 2: @wipachicago (never scraped) vs @wachicago (real venue)

### @wachicago ~ @taochicago

- suggested: **canonical** = @wachicago, **alias** = @taochicago -- @wachicago has a scraped profile, @taochicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @wachicago 11 / @taochicago 1
- candidates (structural): @wachicago 12 / @taochicago 0
- followers: @wachicago 32438 / @taochicago null
- full_name: @wachicago "Waldorf Astoria Chicago" / @taochicago ""
- evidence:
  - [S6] Levenshtein distance 2: @taochicago (never scraped) vs @wachicago (real venue)

### @chezeventvenue ~ @chezweddingvenue

- suggested: **canonical** = @chezeventvenue, **alias** = @chezweddingvenue -- @chezeventvenue has a scraped profile, @chezweddingvenue does not
- signals: S1, S4
- weddings (venue-role, alias-resolved): @chezeventvenue 7 / @chezweddingvenue 5
- candidates (structural): @chezeventvenue 6 / @chezweddingvenue 5
- followers: @chezeventvenue 1724 / @chezweddingvenue null
- full_name: @chezeventvenue "Chez Event Venue" / @chezweddingvenue ""
- evidence:
  - [S1] @chezeventvenue ~ @chezweddingvenue (stem "chez")
  - [S4] @chezeventvenue bio: "...riences! Also visit @chezweddingvenue for more photos!
+1..." (unclassified)

### @iahcchicago ~ @wacchicago

- suggested: **canonical** = @iahcchicago, **alias** = @wacchicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @iahcchicago 3 / @wacchicago 3
- candidates (structural): @iahcchicago 0 / @wacchicago 17
- followers: @iahcchicago null / @wacchicago null
- full_name: @iahcchicago "" / @wacchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @iahcchicago (never scraped) vs @wacchicago (real venue)
  - [S6] Levenshtein distance 2: @wacchicago (never scraped) vs @iahcchicago (real venue)

### @westinchicagons ~ @westinchicagonw

- suggested: **canonical** = @westinchicagons, **alias** = @westinchicagonw -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @westinchicagons 0 / @westinchicagonw 8
- candidates (structural): @westinchicagons 1 / @westinchicagonw 13
- followers: @westinchicagons null / @westinchicagonw null
- full_name: @westinchicagons "" / @westinchicagonw ""
- evidence:
  - [S6] Levenshtein distance 1: @westinchicagons (never scraped) vs @westinchicagonw (real venue)

### @taochicago ~ @wacchicago

- suggested: **canonical** = @taochicago, **alias** = @wacchicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @taochicago 1 / @wacchicago 3
- candidates (structural): @taochicago 0 / @wacchicago 17
- followers: @taochicago null / @wacchicago null
- full_name: @taochicago "" / @wacchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @taochicago (never scraped) vs @wacchicago (real venue)

### @radissonbluaquachicago ~ @radissonblueaquachicago

- suggested: **canonical** = @radissonbluaquachicago, **alias** = @radissonblueaquachicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @radissonbluaquachicago 8 / @radissonblueaquachicago 1
- candidates (structural): @radissonbluaquachicago 10 / @radissonblueaquachicago 1
- followers: @radissonbluaquachicago null / @radissonblueaquachicago null
- full_name: @radissonbluaquachicago "" / @radissonblueaquachicago ""
- evidence:
  - [S6] Levenshtein distance 1: @radissonblueaquachicago (never scraped) vs @radissonbluaquachicago (real venue)

### @salon61events ~ @salon6levents

- suggested: **canonical** = @salon61events, **alias** = @salon6levents -- @salon61events has a scraped profile, @salon6levents does not
- signals: S6
- weddings (venue-role, alias-resolved): @salon61events 10 / @salon6levents 1
- candidates (structural): @salon61events 6 / @salon6levents 1
- followers: @salon61events 1303 / @salon6levents null
- full_name: @salon61events "Salon 61" / @salon6levents ""
- evidence:
  - [S6] Levenshtein distance 1: @salon6levents (never scraped) vs @salon61events (real venue)

### @cafebauer ~ @cafebrauer

- suggested: **canonical** = @cafebauer, **alias** = @cafebrauer -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @cafebauer 1 / @cafebrauer 9
- candidates (structural): @cafebauer 1 / @cafebrauer 5
- followers: @cafebauer null / @cafebrauer null
- full_name: @cafebauer "" / @cafebrauer ""
- evidence:
  - [S6] Levenshtein distance 1: @cafebauer (never scraped) vs @cafebrauer (real venue)

### @msichicago ~ @mcachicago

- suggested: **canonical** = @mcachicago, **alias** = @msichicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @msichicago 0 / @mcachicago 3
- candidates (structural): @msichicago 0 / @mcachicago 9
- followers: @msichicago null / @mcachicago null
- full_name: @msichicago "" / @mcachicago ""
- evidence:
  - [S6] Levenshtein distance 2: @msichicago (never scraped) vs @mcachicago (real venue)

### @thegagechicago ~ @thewadechicago

- suggested: **canonical** = @thegagechicago, **alias** = @thewadechicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @thegagechicago 3 / @thewadechicago 4
- candidates (structural): @thegagechicago 0 / @thewadechicago 4
- followers: @thegagechicago null / @thewadechicago null
- full_name: @thegagechicago "" / @thewadechicago ""
- evidence:
  - [S6] Levenshtein distance 2: @thegagechicago (never scraped) vs @thewadechicago (real venue)
  - [S6] Levenshtein distance 2: @thewadechicago (never scraped) vs @thegagechicago (real venue)

### @celebrateatbloom ~ @celebratebloom

- suggested: **canonical** = @celebrateatbloom, **alias** = @celebratebloom -- @celebrateatbloom has a scraped profile, @celebratebloom does not
- signals: S1, S6
- weddings (venue-role, alias-resolved): @celebrateatbloom 6 / @celebratebloom 1
- candidates (structural): @celebrateatbloom 2 / @celebratebloom 0
- followers: @celebrateatbloom 2406 / @celebratebloom null
- full_name: @celebrateatbloom "Bloom Events" / @celebratebloom ""
- evidence:
  - [S1] @celebrateatbloom ~ @celebratebloom (stem "celebrebloom")
  - [S6] Levenshtein distance 2: @celebratebloom (never scraped) vs @celebrateatbloom (real venue)

### @destinationgn ~ @destinationgnweddings

- suggested: **canonical** = @destinationgn, **alias** = @destinationgnweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1, S5
- weddings (venue-role, alias-resolved): @destinationgn 0 / @destinationgnweddings 0
- candidates (structural): @destinationgn 6 / @destinationgnweddings 3
- followers: @destinationgn null / @destinationgnweddings null
- full_name: @destinationgn "" / @destinationgnweddings ""
- evidence:
  - [S1] @destinationgn ~ @destinationgnweddings (stem "destiniongn")
  - [S5] co-credited on the same venue credit line, 4 posts (e.g. https://www.instagram.com/p/DaL21dLgaua/)

### @thedisctric_il ~ @thedistrict_il

- suggested: **canonical** = @thedisctric_il, **alias** = @thedistrict_il -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @thedisctric_il 1 / @thedistrict_il 4
- candidates (structural): @thedisctric_il 0 / @thedistrict_il 4
- followers: @thedisctric_il null / @thedistrict_il null
- full_name: @thedisctric_il "" / @thedistrict_il ""
- evidence:
  - [S6] Levenshtein distance 2: @thedisctric_il (never scraped) vs @thedistrict_il (real venue)

### @warehouse109 ~ @warhouse109

- suggested: **canonical** = @warehouse109, **alias** = @warhouse109 -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S6
- weddings (venue-role, alias-resolved): @warehouse109 3 / @warhouse109 0
- candidates (structural): @warehouse109 4 / @warhouse109 1
- followers: @warehouse109 null / @warhouse109 null
- full_name: @warehouse109 "" / @warhouse109 ""
- evidence:
  - [S6] Levenshtein distance 1: @warhouse109 (never scraped) vs @warehouse109 (real venue)

### @lacunabycatalystsuites ~ @lacunacatalystsuites

- suggested: **canonical** = @lacunabycatalystsuites, **alias** = @lacunacatalystsuites -- @lacunabycatalystsuites has a scraped profile, @lacunacatalystsuites does not
- signals: S6
- weddings (venue-role, alias-resolved): @lacunabycatalystsuites 0 / @lacunacatalystsuites 4
- candidates (structural): @lacunabycatalystsuites 0 / @lacunacatalystsuites 0
- followers: @lacunabycatalystsuites 7630 / @lacunacatalystsuites null
- full_name: @lacunabycatalystsuites "Lacuna By Catalyst Suites" / @lacunacatalystsuites ""
- evidence:
  - [S6] Levenshtein distance 2: @lacunacatalystsuites (never scraped) vs @lacunabycatalystsuites (real venue)

### @rlm_chicago ~ @olmchicago

- suggested: **canonical** = @rlm_chicago, **alias** = @olmchicago -- @rlm_chicago has a scraped profile, @olmchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @rlm_chicago 3 / @olmchicago 1
- candidates (structural): @rlm_chicago 0 / @olmchicago 0
- followers: @rlm_chicago 3489 / @olmchicago null
- full_name: @rlm_chicago "RLM Events & Design" / @olmchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @olmchicago (never scraped) vs @rlm_chicago (real venue)

### @harrycarayscelebrations ~ @harraycaraycelebrations

- suggested: **canonical** = @harrycarayscelebrations, **alias** = @harraycaraycelebrations -- @harrycarayscelebrations has a scraped profile, @harraycaraycelebrations does not
- signals: S6
- weddings (venue-role, alias-resolved): @harrycarayscelebrations 2 / @harraycaraycelebrations 1
- candidates (structural): @harrycarayscelebrations 1 / @harraycaraycelebrations 0
- followers: @harrycarayscelebrations 246 / @harraycaraycelebrations null
- full_name: @harrycarayscelebrations "Harry Caray’s Events" / @harraycaraycelebrations ""
- evidence:
  - [S6] Levenshtein distance 2: @harraycaraycelebrations (never scraped) vs @harrycarayscelebrations (real venue)

## T3 -- list (52)

### @the.arbory ~ @ovationchicago

- suggested: **canonical** = @ovationchicago, **alias** = @the.arbory -- @ovationchicago has more followers (4370 vs 3003)
- signals: S5
- weddings (venue-role, alias-resolved): @the.arbory 121 / @ovationchicago 18
- candidates (structural): @the.arbory 167 / @ovationchicago 22
- followers: @the.arbory 3003 / @ovationchicago 4370
- full_name: @the.arbory "The Arbory" / @ovationchicago "OVATION"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Cn8LXOnrdUZ/)

### @loftlucia ~ @adlerplanet

- suggested: **canonical** = @adlerplanet, **alias** = @loftlucia -- @adlerplanet has more followers (79775 vs 43923)
- signals: S5
- weddings (venue-role, alias-resolved): @loftlucia 58 / @adlerplanet 87
- candidates (structural): @loftlucia 67 / @adlerplanet 106
- followers: @loftlucia 43923 / @adlerplanet 79775
- full_name: @loftlucia "ㅤㅤㅤㅤㅤㅤ" / @adlerplanet "Adler Planetarium"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DOWML2-DYLn/)

### @waldenchicago ~ @waldenweddings_

- suggested: **canonical** = @waldenchicago, **alias** = @waldenweddings_ -- @waldenchicago has a scraped profile, @waldenweddings_ does not
- signals: S1
- weddings (venue-role, alias-resolved): @waldenchicago 106 / @waldenweddings_ 0
- candidates (structural): @waldenchicago 142 / @waldenweddings_ 1
- followers: @waldenchicago 4701 / @waldenweddings_ null
- full_name: @waldenchicago "Walden Event Venue" / @waldenweddings_ ""
- evidence:
  - [S1] @waldenchicago ~ @waldenweddings_ (stem "walden")

### @thedalcy ~ @thedalcychicago

- suggested: **canonical** = @thedalcy, **alias** = @thedalcychicago -- @thedalcy has a scraped profile, @thedalcychicago does not
- signals: S1
- weddings (venue-role, alias-resolved): @thedalcy 91 / @thedalcychicago 1
- candidates (structural): @thedalcy 134 / @thedalcychicago 1
- followers: @thedalcy 5031 / @thedalcychicago null
- full_name: @thedalcy "The Dalcy" / @thedalcychicago ""
- evidence:
  - [S1] @thedalcy ~ @thedalcychicago (stem "dalcy")

### @langhamchicago ~ @post433chicago

- suggested: **canonical** = @langhamchicago, **alias** = @post433chicago -- @langhamchicago has more followers (70408 vs 4237)
- signals: S5
- weddings (venue-role, alias-resolved): @langhamchicago 38 / @post433chicago 49
- candidates (structural): @langhamchicago 45 / @post433chicago 73
- followers: @langhamchicago 70408 / @post433chicago 4237
- full_name: @langhamchicago "The Langham, Chicago" / @post433chicago "The Old Post Office"
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DTd_b4rke-a/)

### @artifacteventschicago ~ @artifactevents

- suggested: **canonical** = @artifacteventschicago, **alias** = @artifactevents -- @artifacteventschicago has a scraped profile, @artifactevents does not
- signals: S1
- weddings (venue-role, alias-resolved): @artifacteventschicago 60 / @artifactevents 1
- candidates (structural): @artifacteventschicago 103 / @artifactevents 0
- followers: @artifacteventschicago 12135 / @artifactevents null
- full_name: @artifacteventschicago "Artifact Events" / @artifactevents ""
- evidence:
  - [S1] @artifacteventschicago ~ @artifactevents (stem "artifact")

### @sohohouse ~ @tigerlilyevents

- suggested: **canonical** = @tigerlilyevents, **alias** = @sohohouse -- @tigerlilyevents has a scraped profile, @sohohouse does not
- signals: S5
- weddings (venue-role, alias-resolved): @sohohouse 2 / @tigerlilyevents 65
- candidates (structural): @sohohouse 3 / @tigerlilyevents 86
- followers: @sohohouse null / @tigerlilyevents 3394
- full_name: @sohohouse "" / @tigerlilyevents "Cafe Brauer & Lincoln Park Zoo"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DL43agKOm-3/)

### @cbgweddings ~ @stharalambosgoc

- suggested: **canonical** = @cbgweddings, **alias** = @stharalambosgoc -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @cbgweddings 64 / @stharalambosgoc 1
- candidates (structural): @cbgweddings 82 / @stharalambosgoc 0
- followers: @cbgweddings null / @stharalambosgoc null
- full_name: @cbgweddings "" / @stharalambosgoc ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Ct4OxYXLLzL/)

### @chicagobotanic ~ @stharalambosgoc

- suggested: **canonical** = @chicagobotanic, **alias** = @stharalambosgoc -- @chicagobotanic has a scraped profile, @stharalambosgoc does not
- signals: S5
- weddings (venue-role, alias-resolved): @chicagobotanic 64 / @stharalambosgoc 1
- candidates (structural): @chicagobotanic 82 / @stharalambosgoc 0
- followers: @chicagobotanic 141539 / @stharalambosgoc null
- full_name: @chicagobotanic "Chicago Botanic Garden" / @stharalambosgoc ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Ct4OxYXLLzL/)

### @fieldmuseum ~ @thefieldmuseum

- suggested: **canonical** = @fieldmuseum, **alias** = @thefieldmuseum -- @fieldmuseum has a scraped profile, @thefieldmuseum does not
- signals: S1
- weddings (venue-role, alias-resolved): @fieldmuseum 39 / @thefieldmuseum 1
- candidates (structural): @fieldmuseum 73 / @thefieldmuseum 1
- followers: @fieldmuseum 235445 / @thefieldmuseum null
- full_name: @fieldmuseum "Field Museum" / @thefieldmuseum ""
- evidence:
  - [S1] @fieldmuseum ~ @thefieldmuseum (stem "fieldmuseum")

### @artinstitutechi ~ @artinstituteweddingevents

- suggested: **canonical** = @artinstitutechi, **alias** = @artinstituteweddingevents -- @artinstitutechi has a scraped profile, @artinstituteweddingevents does not
- signals: S1
- weddings (venue-role, alias-resolved): @artinstitutechi 36 / @artinstituteweddingevents 1
- candidates (structural): @artinstitutechi 67 / @artinstituteweddingevents 2
- followers: @artinstitutechi 850234 / @artinstituteweddingevents null
- full_name: @artinstitutechi "The Art Institute of Chicago" / @artinstituteweddingevents ""
- evidence:
  - [S1] @artinstitutechi ~ @artinstituteweddingevents (stem "artinstitute")

### @artinstituteevents ~ @artinstituteweddingevents

- suggested: **canonical** = @artinstituteevents, **alias** = @artinstituteweddingevents -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @artinstituteevents 36 / @artinstituteweddingevents 1
- candidates (structural): @artinstituteevents 67 / @artinstituteweddingevents 2
- followers: @artinstituteevents null / @artinstituteweddingevents null
- full_name: @artinstituteevents "" / @artinstituteweddingevents ""
- evidence:
  - [S1] @artinstituteevents ~ @artinstituteweddingevents (stem "artinstitute")

### @cantignypark ~ @cantignygolf

- suggested: **canonical** = @cantignypark, **alias** = @cantignygolf -- @cantignypark has a scraped profile, @cantignygolf does not
- signals: S5
- weddings (venue-role, alias-resolved): @cantignypark 26 / @cantignygolf 3
- candidates (structural): @cantignypark 43 / @cantignygolf 2
- followers: @cantignypark 21625 / @cantignygolf null
- full_name: @cantignypark "Cantigny" / @cantignygolf ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DPjqjskkZ1B/)

### @thelytlehouse ~ @thelytleauditorium

- suggested: **canonical** = @thelytlehouse, **alias** = @thelytleauditorium -- @thelytlehouse has a scraped profile, @thelytleauditorium does not
- signals: S4
- weddings (venue-role, alias-resolved): @thelytlehouse 30 / @thelytleauditorium 2
- candidates (structural): @thelytlehouse 35 / @thelytleauditorium 1
- followers: @thelytlehouse 3965 / @thelytleauditorium null
- full_name: @thelytlehouse "The Lytle House" / @thelytleauditorium ""
- evidence:
  - [S4] @thelytlehouse bio: "...‍🤝‍👩🏻🏳️‍🌈
Also @thelytleauditorium..." (unclassified)

### @thepeninsulachi ~ @peninsulachi

- suggested: **canonical** = @peninsulachi, **alias** = @thepeninsulachi -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @thepeninsulachi 25 / @peninsulachi 0
- candidates (structural): @thepeninsulachi 37 / @peninsulachi 1
- followers: @thepeninsulachi null / @peninsulachi null
- full_name: @thepeninsulachi "" / @peninsulachi ""
- evidence:
  - [S1] @thepeninsulachi ~ @peninsulachi (stem "peninsula")

### @offshorerooftop ~ @navypierchicago

- suggested: **canonical** = @offshorerooftop, **alias** = @navypierchicago -- @offshorerooftop has a scraped profile, @navypierchicago does not
- signals: S4
- weddings (venue-role, alias-resolved): @offshorerooftop 21 / @navypierchicago 2
- candidates (structural): @offshorerooftop 24 / @navypierchicago 0
- followers: @offshorerooftop 22387 / @navypierchicago null
- full_name: @offshorerooftop "Offshore Rooftop" / @navypierchicago ""
- evidence:
  - [S4] @offshorerooftop bio: "...space
📍Located on @navypierchicago's East End
🌎 World..." (unclassified)

### @lshiremarriott ~ @lshireweddings

- suggested: **canonical** = @lshiremarriott, **alias** = @lshireweddings -- @lshiremarriott has a scraped profile, @lshireweddings does not
- signals: S5
- weddings (venue-role, alias-resolved): @lshiremarriott 13 / @lshireweddings 4
- candidates (structural): @lshiremarriott 23 / @lshireweddings 3
- followers: @lshiremarriott 5302 / @lshireweddings null
- full_name: @lshiremarriott "Marriott Lincolnshire Resort" / @lshireweddings ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DbW5gj4iSKZ/)

### @thecanvasvenue ~ @_bdarbs

- suggested: **canonical** = @thecanvasvenue, **alias** = @_bdarbs -- @thecanvasvenue has a scraped profile, @_bdarbs does not
- signals: S5
- weddings (venue-role, alias-resolved): @thecanvasvenue 16 / @_bdarbs 0
- candidates (structural): @thecanvasvenue 23 / @_bdarbs 1
- followers: @thecanvasvenue 8834 / @_bdarbs null
- full_name: @thecanvasvenue "CANVAS | Chicago Event Venue" / @_bdarbs ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DFEmmlFNRT0/)

### @thevillamke ~ @villaterracemuseum

- suggested: **canonical** = @thevillamke, **alias** = @villaterracemuseum -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @thevillamke 2 / @villaterracemuseum 0
- candidates (structural): @thevillamke 27 / @villaterracemuseum 2
- followers: @thevillamke null / @villaterracemuseum null
- full_name: @thevillamke "" / @villaterracemuseum ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/C2I_pm2ukAi/)

### @igniteglass ~ @igniteeventschi

- suggested: **canonical** = @igniteglass, **alias** = @igniteeventschi -- @igniteglass has more followers (33653 vs 1563)
- signals: S4
- weddings (venue-role, alias-resolved): @igniteglass 2 / @igniteeventschi 11
- candidates (structural): @igniteglass 4 / @igniteeventschi 11
- followers: @igniteglass 33653 / @igniteeventschi 1563
- full_name: @igniteglass "Ignite Glass Studios" / @igniteeventschi "Ignite Glass Studios (Events)"
- evidence:
  - [S4] @igniteglass bio: "...Weddings and Events @igniteeventschi..." (unclassified)
  - [S4] @igniteeventschi bio: "...celebration meet. 
@igniteglass 🔥 
#chicagovenue #..." (unclassified)

### @haleymansion ~ @thehaleymansion

- suggested: **canonical** = @haleymansion, **alias** = @thehaleymansion -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @haleymansion 6 / @thehaleymansion 0
- candidates (structural): @haleymansion 14 / @thehaleymansion 1
- followers: @haleymansion null / @thehaleymansion null
- full_name: @haleymansion "" / @thehaleymansion ""
- evidence:
  - [S1] @haleymansion ~ @thehaleymansion (stem "haleymansion")

### @thegraychi ~ @boleochicago

- suggested: **canonical** = @thegraychi, **alias** = @boleochicago -- @thegraychi has a scraped profile, @boleochicago does not
- signals: S4
- weddings (venue-role, alias-resolved): @thegraychi 10 / @boleochicago 0
- candidates (structural): @thegraychi 10 / @boleochicago 1
- followers: @thegraychi 8852 / @boleochicago null
- full_name: @thegraychi "The Kimpton Gray Hotel" / @boleochicago ""
- evidence:
  - [S4] @thegraychi bio: "...de experiences.
🍹: @boleochicago
🍸: @vol39chicago
�..." (unclassified)

### @theherringtoninnandspa ~ @herringtoninnandspa

- suggested: **canonical** = @herringtoninnandspa, **alias** = @theherringtoninnandspa -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @theherringtoninnandspa 4 / @herringtoninnandspa 1
- candidates (structural): @theherringtoninnandspa 10 / @herringtoninnandspa 1
- followers: @theherringtoninnandspa null / @herringtoninnandspa null
- full_name: @theherringtoninnandspa "" / @herringtoninnandspa ""
- evidence:
  - [S1] @theherringtoninnandspa ~ @herringtoninnandspa (stem "herringtoninnspa")

### @psbrewingco ~ @prairiestreetevents

- suggested: **canonical** = @prairiestreetevents, **alias** = @psbrewingco -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @psbrewingco 4 / @prairiestreetevents 2
- candidates (structural): @psbrewingco 1 / @prairiestreetevents 8
- followers: @psbrewingco null / @prairiestreetevents null
- full_name: @psbrewingco "" / @prairiestreetevents ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DT9GfCGAodk/)

### @eventswcofe ~ @thewcofe

- suggested: **canonical** = @eventswcofe, **alias** = @thewcofe -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @eventswcofe 6 / @thewcofe 0
- candidates (structural): @eventswcofe 7 / @thewcofe 1
- followers: @eventswcofe null / @thewcofe null
- full_name: @eventswcofe "" / @thewcofe ""
- evidence:
  - [S1] @eventswcofe ~ @thewcofe (stem "wcofe")

### @stregischicago ~ @treditarestaurant

- suggested: **canonical** = @stregischicago, **alias** = @treditarestaurant -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @stregischicago 4 / @treditarestaurant 0
- candidates (structural): @stregischicago 7 / @treditarestaurant 0
- followers: @stregischicago null / @treditarestaurant null
- full_name: @stregischicago "" / @treditarestaurant ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DaDqg0zDlEc/)

### @hotelbaker ~ @hotelbakerweddings

- suggested: **canonical** = @hotelbaker, **alias** = @hotelbakerweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @hotelbaker 3 / @hotelbakerweddings 0
- candidates (structural): @hotelbaker 5 / @hotelbakerweddings 1
- followers: @hotelbaker null / @hotelbakerweddings null
- full_name: @hotelbaker "" / @hotelbakerweddings ""
- evidence:
  - [S1] @hotelbaker ~ @hotelbakerweddings (stem "hotelbaker")

### @theempressbanquets ~ @empressbanquets

- suggested: **canonical** = @empressbanquets, **alias** = @theempressbanquets -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @theempressbanquets 1 / @empressbanquets 3
- candidates (structural): @theempressbanquets 1 / @empressbanquets 3
- followers: @theempressbanquets null / @empressbanquets null
- full_name: @theempressbanquets "" / @empressbanquets ""
- evidence:
  - [S1] @theempressbanquets ~ @empressbanquets (stem "empress")

### @experience_nd ~ @themorrisinn

- suggested: **canonical** = @experience_nd, **alias** = @themorrisinn -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @experience_nd 0 / @themorrisinn 0
- candidates (structural): @experience_nd 6 / @themorrisinn 1
- followers: @experience_nd null / @themorrisinn null
- full_name: @experience_nd "" / @themorrisinn ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dac6KzAlsTe/)

### @terrace16chicago ~ @trumptowerchicago

- suggested: **canonical** = @terrace16chicago, **alias** = @trumptowerchicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @terrace16chicago 2 / @trumptowerchicago 2
- candidates (structural): @terrace16chicago 2 / @trumptowerchicago 0
- followers: @terrace16chicago null / @trumptowerchicago null
- full_name: @terrace16chicago "" / @trumptowerchicago ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DO_0mokE0y7/)

### @oasisatdeathvalley ~ @oasisatdeathvalleyweddings

- suggested: **canonical** = @oasisatdeathvalley, **alias** = @oasisatdeathvalleyweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @oasisatdeathvalley 0 / @oasisatdeathvalleyweddings 0
- candidates (structural): @oasisatdeathvalley 1 / @oasisatdeathvalleyweddings 4
- followers: @oasisatdeathvalley null / @oasisatdeathvalleyweddings null
- full_name: @oasisatdeathvalley "" / @oasisatdeathvalleyweddings ""
- evidence:
  - [S1] @oasisatdeathvalley ~ @oasisatdeathvalleyweddings (stem "oasisdehvalley")

### @thaliahallchicago ~ @16occhicago

- suggested: **canonical** = @thaliahallchicago, **alias** = @16occhicago -- @thaliahallchicago has a scraped profile, @16occhicago does not
- signals: S4
- weddings (venue-role, alias-resolved): @thaliahallchicago 3 / @16occhicago 1
- candidates (structural): @thaliahallchicago 1 / @16occhicago 0
- followers: @thaliahallchicago 73795 / @16occhicago null
- full_name: @thaliahallchicago "Thalia Hall" / @16occhicago ""
- evidence:
  - [S4] @thaliahallchicago bio: "...1892
Re-Est. 2014
a @16occhicago project..." (unclassified)

### @raviniagreencountryclub ~ @rgccprivateevents

- suggested: **canonical** = @raviniagreencountryclub, **alias** = @rgccprivateevents -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @raviniagreencountryclub 2 / @rgccprivateevents 1
- candidates (structural): @raviniagreencountryclub 2 / @rgccprivateevents 0
- followers: @raviniagreencountryclub null / @rgccprivateevents null
- full_name: @raviniagreencountryclub "" / @rgccprivateevents ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DL1HBp-xO5u/)

### @dcestatewineryweddings ~ @dcestatewinery

- suggested: **canonical** = @dcestatewinery, **alias** = @dcestatewineryweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @dcestatewineryweddings 0 / @dcestatewinery 0
- candidates (structural): @dcestatewineryweddings 3 / @dcestatewinery 1
- followers: @dcestatewineryweddings null / @dcestatewinery null
- full_name: @dcestatewineryweddings "" / @dcestatewinery ""
- evidence:
  - [S1] @dcestatewineryweddings ~ @dcestatewinery (stem "dcestewinery")

### @chicityclerk ~ @cityhallofchicago

- suggested: **canonical** = @chicityclerk, **alias** = @cityhallofchicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @chicityclerk 2 / @cityhallofchicago 2
- candidates (structural): @chicityclerk 0 / @cityhallofchicago 0
- followers: @chicityclerk null / @cityhallofchicago null
- full_name: @chicityclerk "" / @cityhallofchicago ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Da6V846j-aE/)

### @floatingworldevents ~ @floatingworldgallery

- suggested: **canonical** = @floatingworldevents, **alias** = @floatingworldgallery -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @floatingworldevents 1 / @floatingworldgallery 0
- candidates (structural): @floatingworldevents 2 / @floatingworldgallery 1
- followers: @floatingworldevents null / @floatingworldgallery null
- full_name: @floatingworldevents "" / @floatingworldgallery ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DPWzZ77CbOv/)

### @thegrovecountryclub ~ @grovecountryclub

- suggested: **canonical** = @grovecountryclub, **alias** = @thegrovecountryclub -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @thegrovecountryclub 1 / @grovecountryclub 0
- candidates (structural): @thegrovecountryclub 1 / @grovecountryclub 1
- followers: @thegrovecountryclub null / @grovecountryclub null
- full_name: @thegrovecountryclub "" / @grovecountryclub ""
- evidence:
  - [S1] @thegrovecountryclub ~ @grovecountryclub (stem "grovecountryclub")

### @hoteljuliendubuque ~ @weddings.hoteljuliendubuque

- suggested: **canonical** = @hoteljuliendubuque, **alias** = @weddings.hoteljuliendubuque -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @hoteljuliendubuque 0 / @weddings.hoteljuliendubuque 0
- candidates (structural): @hoteljuliendubuque 2 / @weddings.hoteljuliendubuque 1
- followers: @hoteljuliendubuque null / @weddings.hoteljuliendubuque null
- full_name: @hoteljuliendubuque "" / @weddings.hoteljuliendubuque ""
- evidence:
  - [S1] @hoteljuliendubuque ~ @weddings.hoteljuliendubuque (stem "hoteljuliendubuque")

### @anthologyevents ~ @booktowerdetroit

- suggested: **canonical** = @anthologyevents, **alias** = @booktowerdetroit -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @anthologyevents 0 / @booktowerdetroit 0
- candidates (structural): @anthologyevents 2 / @booktowerdetroit 1
- followers: @anthologyevents null / @booktowerdetroit null
- full_name: @anthologyevents "" / @booktowerdetroit ""
- evidence:
  - [S5] co-credited on the same venue credit line, 4 posts (e.g. https://www.instagram.com/p/DEGpF34u8id/)

### @theheritagecollection ~ @chateau_de_villette

- suggested: **canonical** = @chateau_de_villette, **alias** = @theheritagecollection -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @theheritagecollection 1 / @chateau_de_villette 0
- candidates (structural): @theheritagecollection 1 / @chateau_de_villette 1
- followers: @theheritagecollection null / @chateau_de_villette null
- full_name: @theheritagecollection "" / @chateau_de_villette ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DGTIOjysk8K/)

### @officialwrigleyfield ~ @wrigleyfieldevents

- suggested: **canonical** = @officialwrigleyfield, **alias** = @wrigleyfieldevents -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @officialwrigleyfield 1 / @wrigleyfieldevents 1
- candidates (structural): @officialwrigleyfield 0 / @wrigleyfieldevents 0
- followers: @officialwrigleyfield null / @wrigleyfieldevents null
- full_name: @officialwrigleyfield "" / @wrigleyfieldevents ""
- evidence:
  - [S1] @officialwrigleyfield ~ @wrigleyfieldevents (stem "wrigleyfield")

### @hellenicmuseum ~ @hellenicmuseumevents

- suggested: **canonical** = @hellenicmuseum, **alias** = @hellenicmuseumevents -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @hellenicmuseum 0 / @hellenicmuseumevents 0
- candidates (structural): @hellenicmuseum 1 / @hellenicmuseumevents 1
- followers: @hellenicmuseum null / @hellenicmuseumevents null
- full_name: @hellenicmuseum "" / @hellenicmuseumevents ""
- evidence:
  - [S1] @hellenicmuseum ~ @hellenicmuseumevents (stem "hellenicmuseum")

### @royalmelbournecc ~ @royalmelbourneccevents

- suggested: **canonical** = @royalmelbournecc, **alias** = @royalmelbourneccevents -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @royalmelbournecc 1 / @royalmelbourneccevents 0
- candidates (structural): @royalmelbournecc 0 / @royalmelbourneccevents 1
- followers: @royalmelbournecc null / @royalmelbourneccevents null
- full_name: @royalmelbournecc "" / @royalmelbourneccevents ""
- evidence:
  - [S1] @royalmelbournecc ~ @royalmelbourneccevents (stem "royalmelbournecc")

### @ashtonplacebanquet ~ @ashtonplacebanquets

- suggested: **canonical** = @ashtonplacebanquet, **alias** = @ashtonplacebanquets -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @ashtonplacebanquet 0 / @ashtonplacebanquets 0
- candidates (structural): @ashtonplacebanquet 1 / @ashtonplacebanquets 1
- followers: @ashtonplacebanquet null / @ashtonplacebanquets null
- full_name: @ashtonplacebanquet "" / @ashtonplacebanquets ""
- evidence:
  - [S1] @ashtonplacebanquet ~ @ashtonplacebanquets (stem "ashtonplace")

### @delafieldhotel ~ @thedelafieldhotel

- suggested: **canonical** = @delafieldhotel, **alias** = @thedelafieldhotel -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @delafieldhotel 0 / @thedelafieldhotel 0
- candidates (structural): @delafieldhotel 1 / @thedelafieldhotel 1
- followers: @delafieldhotel null / @thedelafieldhotel null
- full_name: @delafieldhotel "" / @thedelafieldhotel ""
- evidence:
  - [S1] @delafieldhotel ~ @thedelafieldhotel (stem "delafieldhotel")

### @highpoint1333 ~ @highpointat1333

- suggested: **canonical** = @highpoint1333, **alias** = @highpointat1333 -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @highpoint1333 0 / @highpointat1333 0
- candidates (structural): @highpoint1333 1 / @highpointat1333 1
- followers: @highpoint1333 null / @highpointat1333 null
- full_name: @highpoint1333 "" / @highpointat1333 ""
- evidence:
  - [S1] @highpoint1333 ~ @highpointat1333 (stem "highpoint1333")

### @piazza_messina ~ @weddingsatpiazzamessina

- suggested: **canonical** = @piazza_messina, **alias** = @weddingsatpiazzamessina -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @piazza_messina 0 / @weddingsatpiazzamessina 0
- candidates (structural): @piazza_messina 1 / @weddingsatpiazzamessina 1
- followers: @piazza_messina null / @weddingsatpiazzamessina null
- full_name: @piazza_messina "" / @weddingsatpiazzamessina ""
- evidence:
  - [S1] @piazza_messina ~ @weddingsatpiazzamessina (stem "piazzamessina")

### @schlitzaudubon ~ @schlitzaudubonvenue

- suggested: **canonical** = @schlitzaudubon, **alias** = @schlitzaudubonvenue -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @schlitzaudubon 0 / @schlitzaudubonvenue 0
- candidates (structural): @schlitzaudubon 1 / @schlitzaudubonvenue 1
- followers: @schlitzaudubon null / @schlitzaudubonvenue null
- full_name: @schlitzaudubon "" / @schlitzaudubonvenue ""
- evidence:
  - [S1] @schlitzaudubon ~ @schlitzaudubonvenue (stem "schlitzaudubon")

### @thewarmemorial ~ @thewarmemorial_events

- suggested: **canonical** = @thewarmemorial, **alias** = @thewarmemorial_events -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @thewarmemorial 0 / @thewarmemorial_events 0
- candidates (structural): @thewarmemorial 1 / @thewarmemorial_events 1
- followers: @thewarmemorial null / @thewarmemorial_events null
- full_name: @thewarmemorial "" / @thewarmemorial_events ""
- evidence:
  - [S1] @thewarmemorial ~ @thewarmemorial_events (stem "warmemorial")

### @punchhousechicago ~ @16occhicago

- suggested: **canonical** = @punchhousechicago, **alias** = @16occhicago -- @punchhousechicago has a scraped profile, @16occhicago does not
- signals: S4
- weddings (venue-role, alias-resolved): @punchhousechicago 1 / @16occhicago 1
- candidates (structural): @punchhousechicago 0 / @16occhicago 0
- followers: @punchhousechicago 14055 / @16occhicago null
- full_name: @punchhousechicago "Punch House" / @16occhicago ""
- evidence:
  - [S4] @punchhousechicago bio: "...2am
Sun 5pm-12am 
a @16occhicago project..." (unclassified)

### @newhite_bridal ~ @harperandivorybridal

- suggested: **canonical** = @newhite_bridal, **alias** = @harperandivorybridal -- @newhite_bridal has a scraped profile, @harperandivorybridal does not
- signals: S5
- weddings (venue-role, alias-resolved): @newhite_bridal 0 / @harperandivorybridal 0
- candidates (structural): @newhite_bridal 1 / @harperandivorybridal 1
- followers: @newhite_bridal 67113 / @harperandivorybridal null
- full_name: @newhite_bridal "NEWHITE | MODERN BRIDAL" / @harperandivorybridal ""
- evidence:
  - [S5] co-credited on the same venue credit line, 4 posts (e.g. https://www.instagram.com/p/DBd9Tfmpnkl/)

### @hippodromebway ~ @pendrybaltimore

- suggested: **canonical** = @hippodromebway, **alias** = @pendrybaltimore -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @hippodromebway 0 / @pendrybaltimore 0
- candidates (structural): @hippodromebway 1 / @pendrybaltimore 1
- followers: @hippodromebway null / @pendrybaltimore null
- full_name: @hippodromebway "" / @pendrybaltimore ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dbjl4JrgCi7/)

## Related, not the same venue (31)

### @bridgeportartcenter ~ @venuelogic

- suggested: **canonical** = @bridgeportartcenter, **alias** = @venuelogic -- known round-3 false positive or deny-listed brand handle
- signals: S4, S5
- weddings (venue-role, alias-resolved): @bridgeportartcenter 191 / @venuelogic 188
- candidates (structural): @bridgeportartcenter 283 / @venuelogic 6
- followers: @bridgeportartcenter 16883 / @venuelogic 4889
- full_name: @bridgeportartcenter "Bridgeport Art Center" / @venuelogic "VenueLogic Chicago"
- evidence:
  - [S4] @venuelogic bio: "...rockwellontheriver, @bridgeportartcenter & @amazingspacechic..." (unclassified)
  - [S5] co-credited on the same venue credit line, 11 posts (e.g. https://www.instagram.com/p/DcB_z8WlOs8/)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @rockwellontheriver ~ @venuelogic

- suggested: **canonical** = @rockwellontheriver, **alias** = @venuelogic -- known round-3 false positive or deny-listed brand handle
- signals: S4, S5
- weddings (venue-role, alias-resolved): @rockwellontheriver 140 / @venuelogic 188
- candidates (structural): @rockwellontheriver 198 / @venuelogic 6
- followers: @rockwellontheriver 8923 / @venuelogic 4889
- full_name: @rockwellontheriver "Rockwell On The River" / @venuelogic "VenueLogic Chicago"
- evidence:
  - [S4] @venuelogic bio: "...enue Management for @rockwellontheriver, @bridgeportartcent..." (related_not_alias)
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DbUTpqHlAiw/)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @thedalcy ~ @lettuceentertainyou

- suggested: **canonical** = @thedalcy, **alias** = @lettuceentertainyou -- known round-3 false positive or deny-listed brand handle
- signals: S4, S5
- weddings (venue-role, alias-resolved): @thedalcy 91 / @lettuceentertainyou 2
- candidates (structural): @thedalcy 134 / @lettuceentertainyou 1
- followers: @thedalcy 5031 / @lettuceentertainyou null
- full_name: @thedalcy "The Dalcy" / @lettuceentertainyou ""
- evidence:
  - [S4] @thedalcy bio: "...ivate event hall by @lettuceentertainyou in the Fulton Marke..." (related_not_alias)
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DaLqck4RPHA/)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @venuelogic ~ @amazingspacechicago

- suggested: **canonical** = @venuelogic, **alias** = @amazingspacechicago -- known round-3 false positive or deny-listed brand handle
- signals: S4
- weddings (venue-role, alias-resolved): @venuelogic 188 / @amazingspacechicago 5
- candidates (structural): @venuelogic 6 / @amazingspacechicago 7
- followers: @venuelogic 4889 / @amazingspacechicago null
- full_name: @venuelogic "VenueLogic Chicago" / @amazingspacechicago ""
- evidence:
  - [S4] @venuelogic bio: "...idgeportartcenter & @amazingspacechicago 
• Purveyors of the..." (unclassified)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @fairliechicago ~ @thefairlie

- suggested: **canonical** = @fairliechicago, **alias** = @thefairlie -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S1
- weddings (venue-role, alias-resolved): @fairliechicago 79 / @thefairlie 1
- candidates (structural): @fairliechicago 103 / @thefairlie 1
- followers: @fairliechicago 5191 / @thefairlie null
- full_name: @fairliechicago "Fairlie" / @thefairlie ""
- evidence:
  - [S1] @fairliechicago ~ @thefairlie (stem "fairlie")
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @fairliechicago ~ @failiechicago

- suggested: **canonical** = @fairliechicago, **alias** = @failiechicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S6
- weddings (venue-role, alias-resolved): @fairliechicago 79 / @failiechicago 0
- candidates (structural): @fairliechicago 103 / @failiechicago 1
- followers: @fairliechicago 5191 / @failiechicago null
- full_name: @fairliechicago "Fairlie" / @failiechicago ""
- evidence:
  - [S6] Levenshtein distance 1: @failiechicago (never scraped) vs @fairliechicago (real venue)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @totlspecialevents ~ @saintclementparish

- suggested: **canonical** = @totlspecialevents, **alias** = @saintclementparish -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @totlspecialevents 46 / @saintclementparish 16
- candidates (structural): @totlspecialevents 43 / @saintclementparish 13
- followers: @totlspecialevents 2770 / @saintclementparish null
- full_name: @totlspecialevents "Theater On The Lake Events" / @saintclementparish ""
- evidence:
  - [S5] co-credited on the same venue credit line, 8 posts (e.g. https://www.instagram.com/p/DaBtG-ECMNC/)
  - EXCLUDED: church/parish/cathedral-type name

### @theateronthelakechicago ~ @saintclementparish

- suggested: **canonical** = @saintclementparish, **alias** = @theateronthelakechicago -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @theateronthelakechicago 46 / @saintclementparish 16
- candidates (structural): @theateronthelakechicago 43 / @saintclementparish 13
- followers: @theateronthelakechicago null / @saintclementparish null
- full_name: @theateronthelakechicago "" / @saintclementparish ""
- evidence:
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DU2A1dUDN_v/)
  - EXCLUDED: church/parish/cathedral-type name

### @lmstudiochi ~ @lmcateringchi

- suggested: **canonical** = @lmcateringchi, **alias** = @lmstudiochi -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @lmstudiochi 39 / @lmcateringchi 2
- candidates (structural): @lmstudiochi 65 / @lmcateringchi 1
- followers: @lmstudiochi 1161 / @lmcateringchi 1858
- full_name: @lmstudiochi "LM Studio" / @lmcateringchi "LM Catering & Events"
- evidence:
  - [S4] @lmcateringchi bio: "...@lacunaloftevents, @lmstudiochi, @skyonnine, and @t..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @lacunaloftevents ~ @lacuna2150

- suggested: **canonical** = @lacunaloftevents, **alias** = @lacuna2150 -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4, S5
- weddings (venue-role, alias-resolved): @lacunaloftevents 39 / @lacuna2150 3
- candidates (structural): @lacunaloftevents 45 / @lacuna2150 4
- followers: @lacunaloftevents 3707 / @lacuna2150 null
- full_name: @lacunaloftevents "Lacuna Loft Events By LM" / @lacuna2150 ""
- evidence:
  - [S4] @lacunaloftevents bio: "...cuna Lofts Building @lacuna2150..." (unclassified)
  - [S5] co-credited on the same venue credit line, 4 posts (e.g. https://www.instagram.com/p/C_RL1C1PrXZ/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @lacunaloftevents ~ @lacunacatalystsuites

- suggested: **canonical** = @lacunaloftevents, **alias** = @lacunacatalystsuites -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S5
- weddings (venue-role, alias-resolved): @lacunaloftevents 39 / @lacunacatalystsuites 4
- candidates (structural): @lacunaloftevents 45 / @lacunacatalystsuites 0
- followers: @lacunaloftevents 3707 / @lacunacatalystsuites null
- full_name: @lacunaloftevents "Lacuna Loft Events By LM" / @lacunacatalystsuites ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DTvspxuj8zS/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @lmcateringchi ~ @lacunaloftevents

- suggested: **canonical** = @lacunaloftevents, **alias** = @lmcateringchi -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4, S5
- weddings (venue-role, alias-resolved): @lmcateringchi 2 / @lacunaloftevents 39
- candidates (structural): @lmcateringchi 1 / @lacunaloftevents 45
- followers: @lmcateringchi 1858 / @lacunaloftevents 3707
- full_name: @lmcateringchi "LM Catering & Events" / @lacunaloftevents "Lacuna Loft Events By LM"
- evidence:
  - [S4] @lmcateringchi bio: "...In-house caterer at @lacunaloftevents, @lmstudiochi, @sky..." (related_not_alias)
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DbCJSyLxOyQ/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @theexchangechicago ~ @exchangechicago

- suggested: **canonical** = @theexchangechicago, **alias** = @exchangechicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S1
- weddings (venue-role, alias-resolved): @theexchangechicago 36 / @exchangechicago 1
- candidates (structural): @theexchangechicago 43 / @exchangechicago 0
- followers: @theexchangechicago 8259 / @exchangechicago null
- full_name: @theexchangechicago "The Exchange" / @exchangechicago ""
- evidence:
  - [S1] @theexchangechicago ~ @exchangechicago (stem "exchange")
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @theexchangechicago ~ @episcope.hospitality

- suggested: **canonical** = @theexchangechicago, **alias** = @episcope.hospitality -- known round-3 false positive or deny-listed brand handle
- signals: S4
- weddings (venue-role, alias-resolved): @theexchangechicago 36 / @episcope.hospitality 0
- candidates (structural): @theexchangechicago 43 / @episcope.hospitality 1
- followers: @theexchangechicago 8259 / @episcope.hospitality null
- full_name: @theexchangechicago "The Exchange" / @episcope.hospitality ""
- evidence:
  - [S4] @theexchangechicago bio: "...⠀⠀⠀⠀⠀⠀⠀⠀
Created by @episcope.hospitality..." (related_not_alias)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @theexchangechicago ~ @alyssabudayyeh

- suggested: **canonical** = @theexchangechicago, **alias** = @alyssabudayyeh -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S5
- weddings (venue-role, alias-resolved): @theexchangechicago 36 / @alyssabudayyeh 0
- candidates (structural): @theexchangechicago 43 / @alyssabudayyeh 1
- followers: @theexchangechicago 8259 / @alyssabudayyeh null
- full_name: @theexchangechicago "The Exchange" / @alyssabudayyeh ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DRFTFHNjTcb/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @rcchicago ~ @lhchicago

- suggested: **canonical** = @rcchicago, **alias** = @lhchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S6
- weddings (venue-role, alias-resolved): @rcchicago 19 / @lhchicago 16
- candidates (structural): @rcchicago 25 / @lhchicago 18
- followers: @rcchicago 13734 / @lhchicago null
- full_name: @rcchicago "The Ritz-Carlton, Chicago" / @lhchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @lhchicago (never scraped) vs @rcchicago (real venue)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @rcchicago ~ @wacchicago

- suggested: **canonical** = @rcchicago, **alias** = @wacchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S6
- weddings (venue-role, alias-resolved): @rcchicago 19 / @wacchicago 3
- candidates (structural): @rcchicago 25 / @wacchicago 17
- followers: @rcchicago 13734 / @wacchicago null
- full_name: @rcchicago "The Ritz-Carlton, Chicago" / @wacchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @wacchicago (never scraped) vs @rcchicago (real venue)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @twentysixchicago ~ @twenysixchicago

- suggested: **canonical** = @twentysixchicago, **alias** = @twenysixchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S6
- weddings (venue-role, alias-resolved): @twentysixchicago 18 / @twenysixchicago 2
- candidates (structural): @twentysixchicago 36 / @twenysixchicago 2
- followers: @twentysixchicago 982 / @twenysixchicago null
- full_name: @twentysixchicago "Twenty Six Chicago" / @twenysixchicago ""
- evidence:
  - [S6] Levenshtein distance 1: @twenysixchicago (never scraped) vs @twentysixchicago (real venue)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @twentysixchicago ~ @lmcateringchi

- suggested: **canonical** = @lmcateringchi, **alias** = @twentysixchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @twentysixchicago 18 / @lmcateringchi 2
- candidates (structural): @twentysixchicago 36 / @lmcateringchi 1
- followers: @twentysixchicago 982 / @lmcateringchi 1858
- full_name: @twentysixchicago "Twenty Six Chicago" / @lmcateringchi "LM Catering & Events"
- evidence:
  - [S4] @lmcateringchi bio: "...hi, @skyonnine, and @twentysixchicago..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @rcchicago ~ @mcachicago

- suggested: **canonical** = @rcchicago, **alias** = @mcachicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S6
- weddings (venue-role, alias-resolved): @rcchicago 19 / @mcachicago 3
- candidates (structural): @rcchicago 25 / @mcachicago 9
- followers: @rcchicago 13734 / @mcachicago null
- full_name: @rcchicago "The Ritz-Carlton, Chicago" / @mcachicago ""
- evidence:
  - [S6] Levenshtein distance 2: @mcachicago (never scraped) vs @rcchicago (real venue)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @thecrawfordvenue ~ @abbotthospitality

- suggested: **canonical** = @thecrawfordvenue, **alias** = @abbotthospitality -- only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
- signals: S4
- weddings (venue-role, alias-resolved): @thecrawfordvenue 17 / @abbotthospitality 0
- candidates (structural): @thecrawfordvenue 30 / @abbotthospitality 1
- followers: @thecrawfordvenue 2356 / @abbotthospitality null
- full_name: @thecrawfordvenue "The Crawford" / @abbotthospitality ""
- evidence:
  - [S4] @thecrawfordvenue bio: "...The Crawford by @abbotthospitality is filled with a vi..." (related_not_alias)
  - EXCLUDED: only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)

### @lmcateringchi ~ @skyonnine

- suggested: **canonical** = @lmcateringchi, **alias** = @skyonnine -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @lmcateringchi 2 / @skyonnine 16
- candidates (structural): @lmcateringchi 1 / @skyonnine 21
- followers: @lmcateringchi 1858 / @skyonnine null
- full_name: @lmcateringchi "LM Catering & Events" / @skyonnine ""
- evidence:
  - [S4] @lmcateringchi bio: "...ents, @lmstudiochi, @skyonnine, and @twentysixchic..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @thompsonchicago ~ @saintclementparish

- suggested: **canonical** = @saintclementparish, **alias** = @thompsonchicago -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @thompsonchicago 8 / @saintclementparish 16
- candidates (structural): @thompsonchicago 3 / @saintclementparish 13
- followers: @thompsonchicago null / @saintclementparish null
- full_name: @thompsonchicago "" / @saintclementparish ""
- evidence:
  - [S5] co-credited on the same venue credit line, 7 posts (e.g. https://www.instagram.com/p/DaBtG-ECMNC/)
  - EXCLUDED: church/parish/cathedral-type name

### @alliumchicago ~ @blueplatechicago

- suggested: **canonical** = @blueplatechicago, **alias** = @alliumchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @alliumchicago 11 / @blueplatechicago 2
- candidates (structural): @alliumchicago 1 / @blueplatechicago 1
- followers: @alliumchicago 680 / @blueplatechicago 8264
- full_name: @alliumchicago "Allium Events" / @blueplatechicago "Blue Plate"
- evidence:
  - [S4] @blueplatechicago bio: "...e Dining
🥂  Venue: @alliumchicago..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @experience_nd ~ @ndbasilica

- suggested: **canonical** = @experience_nd, **alias** = @ndbasilica -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @experience_nd 0 / @ndbasilica 2
- candidates (structural): @experience_nd 6 / @ndbasilica 2
- followers: @experience_nd null / @ndbasilica null
- full_name: @experience_nd "" / @ndbasilica ""
- evidence:
  - [S5] co-credited on the same venue credit line, 5 posts (e.g. https://www.instagram.com/p/Dac6KzAlsTe/)
  - EXCLUDED: church/parish/cathedral-type name

### @chicagohotelcollection ~ @ambassadorchicago

- suggested: **canonical** = @ambassadorchicago, **alias** = @chicagohotelcollection -- only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
- signals: S4
- weddings (venue-role, alias-resolved): @chicagohotelcollection 0 / @ambassadorchicago 3
- candidates (structural): @chicagohotelcollection 0 / @ambassadorchicago 6
- followers: @chicagohotelcollection 23659 / @ambassadorchicago 29829
- full_name: @chicagohotelcollection "The Chicago Hotel Collection" / @ambassadorchicago "Ambassador Gold Coast"
- evidence:
  - [S4] @ambassadorchicago bio: "...ade option)
Part of @chicagohotelcollection..." (related_not_alias)
  - EXCLUDED: only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)

### @gooseisland ~ @gooseislandchicago

- suggested: **canonical** = @gooseisland, **alias** = @gooseislandchicago -- known round-3 false positive or deny-listed brand handle
- signals: S1
- weddings (venue-role, alias-resolved): @gooseisland 1 / @gooseislandchicago 2
- candidates (structural): @gooseisland 2 / @gooseislandchicago 1
- followers: @gooseisland null / @gooseislandchicago null
- full_name: @gooseisland "Goose Island Beer Co." / @gooseislandchicago ""
- evidence:
  - [S1] @gooseisland ~ @gooseislandchicago (stem "gooseisl")
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @wsphotography.us ~ @aspenavenuestudios

- suggested: **canonical** = @wsphotography.us, **alias** = @aspenavenuestudios -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S2
- weddings (venue-role, alias-resolved): @wsphotography.us 1 / @aspenavenuestudios 1
- candidates (structural): @wsphotography.us 4 / @aspenavenuestudios 0
- followers: @wsphotography.us 12905 / @aspenavenuestudios 9029
- full_name: @wsphotography.us "Chicago Wedding Photographer" / @aspenavenuestudios "CHICAGO WEDDING PHOTOGRAPHER"
- evidence:
  - [S2] same full_name "Chicago Wedding Photographer"
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @eeeventco ~ @thursdaytherapychi

- suggested: **canonical** = @thursdaytherapychi, **alias** = @eeeventco -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @eeeventco 2 / @thursdaytherapychi 1
- candidates (structural): @eeeventco 2 / @thursdaytherapychi 0
- followers: @eeeventco 1592 / @thursdaytherapychi 2383
- full_name: @eeeventco "Emmanuelle × EE Event Co. (Escandar Group, LLC)" / @thursdaytherapychi "Thursday Therapy Chicago"
- evidence:
  - [S4] @thursdaytherapychi bio: "...orking event. Hosts @eeeventco, @modernlovedjs, @t..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @ndbasilica ~ @themorrisinn

- suggested: **canonical** = @ndbasilica, **alias** = @themorrisinn -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @ndbasilica 2 / @themorrisinn 0
- candidates (structural): @ndbasilica 2 / @themorrisinn 1
- followers: @ndbasilica null / @themorrisinn null
- full_name: @ndbasilica "" / @themorrisinn ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dac6KzAlsTe/)
  - EXCLUDED: church/parish/cathedral-type name

### @modluxweddingschi ~ @modernluxury

- suggested: **canonical** = @modluxweddingschi, **alias** = @modernluxury -- only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
- signals: S4
- weddings (venue-role, alias-resolved): @modluxweddingschi 1 / @modernluxury 0
- candidates (structural): @modluxweddingschi 0 / @modernluxury 3
- followers: @modluxweddingschi 20844 / @modernluxury null
- full_name: @modluxweddingschi "Modern Luxury Weddings Chicago" / @modernluxury ""
- evidence:
  - [S4] @modluxweddingschi bio: "...Shore | Beyond
✨ By @modernluxury @cschicagosocial @n..." (related_not_alias)
  - EXCLUDED: only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
