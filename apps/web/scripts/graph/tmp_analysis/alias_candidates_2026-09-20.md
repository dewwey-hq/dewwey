# Venue alias candidates -- 2026-09-20

Universe: 1936 venue-ish accounts. Report-only -- verify before running applyAccountAliasesSchema.ts (or its own future round) to actually write account_aliases.

| Tier | Count |
|---|---|
| T1 (auto-safe) | 3 |
| T2 (verify) | 11 |
| T3 (list) | 95 |
| related, not the same venue | 45 |

## T1 -- auto-safe (3)

### @lshiremarriott ~ @lshireweddings

- suggested: **canonical** = @lshiremarriott, **alias** = @lshireweddings -- @lshiremarriott has more followers (5302 vs 173)
- signals: S2, S5
- weddings (venue-role, alias-resolved): @lshiremarriott 26 / @lshireweddings 7
- candidates (structural): @lshiremarriott 35 / @lshireweddings 5
- followers: @lshiremarriott 5302 / @lshireweddings 173
- full_name: @lshiremarriott "Marriott Lincolnshire Resort" / @lshireweddings "Marriott Lincolnshire Resort"
- evidence:
  - [S2] same full_name "Marriott Lincolnshire Resort"
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DagdE0bJutR/)

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

## T2 -- verify (11)

### @universityclubofchicago ~ @uclubashley

- suggested: **canonical** = @universityclubofchicago, **alias** = @uclubashley -- @universityclubofchicago has a scraped profile, @uclubashley does not
- signals: S5
- weddings (venue-role, alias-resolved): @universityclubofchicago 111 / @uclubashley 6
- candidates (structural): @universityclubofchicago 124 / @uclubashley 0
- followers: @universityclubofchicago 8332 / @uclubashley null
- full_name: @universityclubofchicago "University Club of Chicago" / @uclubashley ""
- evidence:
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DBM2IkePguO/)

### @totlspecialevents ~ @thompsonchicago

- suggested: **canonical** = @thompsonchicago, **alias** = @totlspecialevents -- @thompsonchicago has more followers (8273 vs 2770)
- signals: S5
- weddings (venue-role, alias-resolved): @totlspecialevents 64 / @thompsonchicago 9
- candidates (structural): @totlspecialevents 62 / @thompsonchicago 3
- followers: @totlspecialevents 2770 / @thompsonchicago 8273
- full_name: @totlspecialevents "Theater On The Lake Events" / @thompsonchicago "Thompson Chicago"
- evidence:
  - [S5] co-credited on the same venue credit line, 7 posts (e.g. https://www.instagram.com/p/DaBtG-ECMNC/)

### @interconchicago ~ @intercontinental

- suggested: **canonical** = @intercontinental, **alias** = @interconchicago -- @intercontinental has more followers (243693 vs 13094)
- signals: S5, S7
- weddings (venue-role, alias-resolved): @interconchicago 30 / @intercontinental 26
- candidates (structural): @interconchicago 34 / @intercontinental 39
- followers: @interconchicago 13094 / @intercontinental 243693
- full_name: @interconchicago "InterContinental Chicago Hotel" / @intercontinental "InterContinental® by IHG"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DAtyA4RPKaK/)
  - [S7] reader disagreement: 2 posts THIS_VENUE>=0.8 at one venue but guessed the other's handle

### @tigerlilyevents ~ @tigerlillyevents

- suggested: **canonical** = @tigerlilyevents, **alias** = @tigerlillyevents -- @tigerlilyevents has a scraped profile, @tigerlillyevents does not
- signals: S6
- weddings (venue-role, alias-resolved): @tigerlilyevents 4 / @tigerlillyevents 1
- candidates (structural): @tigerlilyevents 91 / @tigerlillyevents 1
- followers: @tigerlilyevents 3394 / @tigerlillyevents null
- full_name: @tigerlilyevents "Cafe Brauer & Lincoln Park Zoo" / @tigerlillyevents ""
- evidence:
  - [S6] Levenshtein distance 1: @tigerlillyevents (never scraped) vs @tigerlilyevents (real venue)

### @riverroastchi ~ @rreventschicago

- suggested: **canonical** = @riverroastchi, **alias** = @rreventschicago -- @riverroastchi has more followers (13458 vs 330)
- signals: S4, S5
- weddings (venue-role, alias-resolved): @riverroastchi 28 / @rreventschicago 2
- candidates (structural): @riverroastchi 36 / @rreventschicago 3
- followers: @riverroastchi 13458 / @rreventschicago 330
- full_name: @riverroastchi "River Roast Chicago" / @rreventschicago "RR Events Chicago"
- evidence:
  - [S4] @riverroastchi bio: "...n fare🍽️
🥂Home to @rreventschicago 
☕️Home to Corner R..." (unclassified)
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DYKObfIFeL2/)

### @chicagosymphony ~ @chicagoforte

- suggested: **canonical** = @chicagosymphony, **alias** = @chicagoforte -- @chicagosymphony has more followers (208839 vs 415)
- signals: S5
- weddings (venue-role, alias-resolved): @chicagosymphony 9 / @chicagoforte 3
- candidates (structural): @chicagosymphony 12 / @chicagoforte 7
- followers: @chicagosymphony 208839 / @chicagoforte 415
- full_name: @chicagosymphony "Chicago Symphony Orchestra" / @chicagoforte "Forte Events at Symphony Center"
- evidence:
  - [S5] co-credited on the same venue credit line, 5 posts (e.g. https://www.instagram.com/p/DN3JgyoXH7K/)

### @chezeventvenue ~ @chezweddingvenue

- suggested: **canonical** = @chezweddingvenue, **alias** = @chezeventvenue -- @chezweddingvenue has more followers (5786 vs 1724)
- signals: S1, S4
- weddings (venue-role, alias-resolved): @chezeventvenue 9 / @chezweddingvenue 6
- candidates (structural): @chezeventvenue 7 / @chezweddingvenue 8
- followers: @chezeventvenue 1724 / @chezweddingvenue 5786
- full_name: @chezeventvenue "Chez Event Venue" / @chezweddingvenue "Chez Wedding & Event Venue"
- evidence:
  - [S1] @chezeventvenue ~ @chezweddingvenue (stem "chez")
  - [S4] @chezeventvenue bio: "...riences! Also visit @chezweddingvenue for more photos!
+1..." (unclassified)

### @floatingworldevents ~ @floatingworldgallery

- suggested: **canonical** = @floatingworldgallery, **alias** = @floatingworldevents -- @floatingworldgallery has more followers (2553 vs 259)
- signals: S5
- weddings (venue-role, alias-resolved): @floatingworldevents 6 / @floatingworldgallery 4
- candidates (structural): @floatingworldevents 10 / @floatingworldgallery 3
- followers: @floatingworldevents 259 / @floatingworldgallery 2553
- full_name: @floatingworldevents "FloatingWorldEvents" / @floatingworldgallery "Floating World Gallery"
- evidence:
  - [S5] co-credited on the same venue credit line, 5 posts (e.g. https://www.instagram.com/p/CzMlTNgPVYA/)

### @stregischicago ~ @treditarestaurant

- suggested: **canonical** = @stregischicago, **alias** = @treditarestaurant -- @stregischicago has a scraped profile, @treditarestaurant does not
- signals: S4, S5
- weddings (venue-role, alias-resolved): @stregischicago 6 / @treditarestaurant 0
- candidates (structural): @stregischicago 8 / @treditarestaurant 1
- followers: @stregischicago 21667 / @treditarestaurant null
- full_name: @stregischicago "The St. Regis Chicago" / @treditarestaurant ""
- evidence:
  - [S4] @stregischicago bio: "...age
@mirurestaurant @treditarestaurant..." (unclassified)
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DaDqg0zDlEc/)

### @lshirewedding ~ @lshireweddings

- suggested: **canonical** = @lshireweddings, **alias** = @lshirewedding -- @lshireweddings has a scraped profile, @lshirewedding does not
- signals: S1, S6
- weddings (venue-role, alias-resolved): @lshirewedding 1 / @lshireweddings 7
- candidates (structural): @lshirewedding 0 / @lshireweddings 5
- followers: @lshirewedding null / @lshireweddings 173
- full_name: @lshirewedding "" / @lshireweddings "Marriott Lincolnshire Resort"
- evidence:
  - [S1] @lshirewedding ~ @lshireweddings (stem "lshire")
  - [S6] Levenshtein distance 1: @lshirewedding (never scraped) vs @lshireweddings (real venue)

### @officialwrigleyfield ~ @wrigleyfieldevents

- suggested: **canonical** = @officialwrigleyfield, **alias** = @wrigleyfieldevents -- @officialwrigleyfield has more followers (87375 vs 594)
- signals: S1, S5
- weddings (venue-role, alias-resolved): @officialwrigleyfield 1 / @wrigleyfieldevents 1
- candidates (structural): @officialwrigleyfield 1 / @wrigleyfieldevents 1
- followers: @officialwrigleyfield 87375 / @wrigleyfieldevents 594
- full_name: @officialwrigleyfield "Wrigley Field" / @wrigleyfieldevents "Wrigley Field Events"
- evidence:
  - [S1] @officialwrigleyfield ~ @wrigleyfieldevents (stem "wrigleyfield")
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DceHsaFiBne/)

## T3 -- list (95)

### @the.arbory ~ @ovationchicago

- suggested: **canonical** = @ovationchicago, **alias** = @the.arbory -- @ovationchicago has more followers (4371 vs 3003)
- signals: S5
- weddings (venue-role, alias-resolved): @the.arbory 161 / @ovationchicago 23
- candidates (structural): @the.arbory 195 / @ovationchicago 26
- followers: @the.arbory 3003 / @ovationchicago 4371
- full_name: @the.arbory "The Arbory" / @ovationchicago "OVATION"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Cn8LXOnrdUZ/)

### @loftlucia ~ @adlerplanet

- suggested: **canonical** = @adlerplanet, **alias** = @loftlucia -- @adlerplanet has more followers (79775 vs 43923)
- signals: S5
- weddings (venue-role, alias-resolved): @loftlucia 63 / @adlerplanet 99
- candidates (structural): @loftlucia 69 / @adlerplanet 114
- followers: @loftlucia 43923 / @adlerplanet 79775
- full_name: @loftlucia "ㅤㅤㅤㅤㅤㅤ" / @adlerplanet "Adler Planetarium"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DOWML2-DYLn/)

### @waldenchicago ~ @waldenweddings_

- suggested: **canonical** = @waldenchicago, **alias** = @waldenweddings_ -- @waldenchicago has a scraped profile, @waldenweddings_ does not
- signals: S1
- weddings (venue-role, alias-resolved): @waldenchicago 111 / @waldenweddings_ 0
- candidates (structural): @waldenchicago 146 / @waldenweddings_ 1
- followers: @waldenchicago 4701 / @waldenweddings_ null
- full_name: @waldenchicago "Walden Event Venue" / @waldenweddings_ ""
- evidence:
  - [S1] @waldenchicago ~ @waldenweddings_ (stem "walden")

### @langhamchicago ~ @post433chicago

- suggested: **canonical** = @langhamchicago, **alias** = @post433chicago -- @langhamchicago has more followers (70408 vs 4237)
- signals: S5
- weddings (venue-role, alias-resolved): @langhamchicago 56 / @post433chicago 55
- candidates (structural): @langhamchicago 47 / @post433chicago 83
- followers: @langhamchicago 70408 / @post433chicago 4237
- full_name: @langhamchicago "The Langham, Chicago" / @post433chicago "The Old Post Office"
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DTd_b4rke-a/)

### @thedalcy ~ @thedalcychicago

- suggested: **canonical** = @thedalcy, **alias** = @thedalcychicago -- @thedalcy has a full_name on record, @thedalcychicago does not
- signals: S1
- weddings (venue-role, alias-resolved): @thedalcy 99 / @thedalcychicago 2
- candidates (structural): @thedalcy 135 / @thedalcychicago 1
- followers: @thedalcy 5031 / @thedalcychicago null
- full_name: @thedalcy "The Dalcy" / @thedalcychicago ""
- evidence:
  - [S1] @thedalcy ~ @thedalcychicago (stem "dalcy")

### @uccweddings ~ @cacweddings

- suggested: **canonical** = @uccweddings, **alias** = @cacweddings -- @uccweddings has a scraped profile, @cacweddings does not
- signals: S6
- weddings (venue-role, alias-resolved): @uccweddings 111 / @cacweddings 0
- candidates (structural): @uccweddings 124 / @cacweddings 1
- followers: @uccweddings 441 / @cacweddings null
- full_name: @uccweddings "UCC Weddings" / @cacweddings ""
- evidence:
  - [S6] Levenshtein distance 2: @cacweddings (never scraped) vs @uccweddings (real venue)

### @uccweddings ~ @tciweddings

- suggested: **canonical** = @uccweddings, **alias** = @tciweddings -- @uccweddings has a scraped profile, @tciweddings does not
- signals: S6
- weddings (venue-role, alias-resolved): @uccweddings 111 / @tciweddings 0
- candidates (structural): @uccweddings 124 / @tciweddings 1
- followers: @uccweddings 441 / @tciweddings null
- full_name: @uccweddings "UCC Weddings" / @tciweddings ""
- evidence:
  - [S6] Levenshtein distance 2: @tciweddings (never scraped) vs @uccweddings (real venue)

### @alterbeer ~ @eventsatmortonarboretum

- suggested: **canonical** = @eventsatmortonarboretum, **alias** = @alterbeer -- @eventsatmortonarboretum has a scraped profile, @alterbeer does not
- signals: S5
- weddings (venue-role, alias-resolved): @alterbeer 1 / @eventsatmortonarboretum 102
- candidates (structural): @alterbeer 1 / @eventsatmortonarboretum 127
- followers: @alterbeer null / @eventsatmortonarboretum 273
- full_name: @alterbeer "" / @eventsatmortonarboretum "Signature Events"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dbe-Rg9FmP3/)

### @mortonarb ~ @alterbeer

- suggested: **canonical** = @mortonarb, **alias** = @alterbeer -- @mortonarb has a scraped profile, @alterbeer does not
- signals: S5
- weddings (venue-role, alias-resolved): @mortonarb 102 / @alterbeer 1
- candidates (structural): @mortonarb 127 / @alterbeer 1
- followers: @mortonarb 92090 / @alterbeer null
- full_name: @mortonarb "The Morton Arboretum" / @alterbeer ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dbe-Rg9FmP3/)

### @fairliechicago ~ @thefairlie

- suggested: **canonical** = @fairliechicago, **alias** = @thefairlie -- @fairliechicago has a full_name on record, @thefairlie does not
- signals: S1
- weddings (venue-role, alias-resolved): @fairliechicago 85 / @thefairlie 1
- candidates (structural): @fairliechicago 108 / @thefairlie 1
- followers: @fairliechicago 5191 / @thefairlie 1
- full_name: @fairliechicago "Fairlie" / @thefairlie ""
- evidence:
  - [S1] @fairliechicago ~ @thefairlie (stem "fairlie")

### @fairliechicago ~ @failiechicago

- suggested: **canonical** = @fairliechicago, **alias** = @failiechicago -- @fairliechicago has a scraped profile, @failiechicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @fairliechicago 85 / @failiechicago 0
- candidates (structural): @fairliechicago 108 / @failiechicago 1
- followers: @fairliechicago 5191 / @failiechicago null
- full_name: @fairliechicago "Fairlie" / @failiechicago ""
- evidence:
  - [S6] Levenshtein distance 1: @failiechicago (never scraped) vs @fairliechicago (real venue)

### @artifacteventschicago ~ @artifactevents

- suggested: **canonical** = @artifacteventschicago, **alias** = @artifactevents -- @artifacteventschicago has a scraped profile, @artifactevents does not
- signals: S1
- weddings (venue-role, alias-resolved): @artifacteventschicago 75 / @artifactevents 3
- candidates (structural): @artifacteventschicago 107 / @artifactevents 0
- followers: @artifacteventschicago 12135 / @artifactevents null
- full_name: @artifacteventschicago "Artifact Events" / @artifactevents ""
- evidence:
  - [S1] @artifacteventschicago ~ @artifactevents (stem "artifact")

### @fieldmuseum ~ @thefieldmuseum

- suggested: **canonical** = @fieldmuseum, **alias** = @thefieldmuseum -- @fieldmuseum has a full_name on record, @thefieldmuseum does not
- signals: S1
- weddings (venue-role, alias-resolved): @fieldmuseum 75 / @thefieldmuseum 1
- candidates (structural): @fieldmuseum 107 / @thefieldmuseum 1
- followers: @fieldmuseum 235445 / @thefieldmuseum null
- full_name: @fieldmuseum "Field Museum" / @thefieldmuseum ""
- evidence:
  - [S1] @fieldmuseum ~ @thefieldmuseum (stem "fieldmuseum")

### @cbgweddings ~ @stharalambosgoc

- suggested: **canonical** = @cbgweddings, **alias** = @stharalambosgoc -- @cbgweddings has a scraped profile, @stharalambosgoc does not
- signals: S5
- weddings (venue-role, alias-resolved): @cbgweddings 76 / @stharalambosgoc 1
- candidates (structural): @cbgweddings 92 / @stharalambosgoc 0
- followers: @cbgweddings null / @stharalambosgoc null
- full_name: @cbgweddings "" / @stharalambosgoc ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Ct4OxYXLLzL/)

### @chicagobotanic ~ @stharalambosgoc

- suggested: **canonical** = @chicagobotanic, **alias** = @stharalambosgoc -- @chicagobotanic has a scraped profile, @stharalambosgoc does not
- signals: S5
- weddings (venue-role, alias-resolved): @chicagobotanic 76 / @stharalambosgoc 1
- candidates (structural): @chicagobotanic 92 / @stharalambosgoc 0
- followers: @chicagobotanic 141539 / @stharalambosgoc null
- full_name: @chicagobotanic "Chicago Botanic Garden" / @stharalambosgoc ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Ct4OxYXLLzL/)

### @artinstitutechicago ~ @artinstituteweddingevents

- suggested: **canonical** = @artinstituteweddingevents, **alias** = @artinstitutechicago -- @artinstituteweddingevents has a scraped profile, @artinstitutechicago does not
- signals: S1
- weddings (venue-role, alias-resolved): @artinstitutechicago 1 / @artinstituteweddingevents 52
- candidates (structural): @artinstitutechicago 0 / @artinstituteweddingevents 89
- followers: @artinstitutechicago null / @artinstituteweddingevents null
- full_name: @artinstitutechicago "" / @artinstituteweddingevents ""
- evidence:
  - [S1] @artinstitutechicago ~ @artinstituteweddingevents (stem "artinstitute")

### @artinstitutechicago ~ @artinstituteweddingsevents

- suggested: **canonical** = @artinstituteweddingsevents, **alias** = @artinstitutechicago -- @artinstituteweddingsevents has a scraped profile, @artinstitutechicago does not
- signals: S1
- weddings (venue-role, alias-resolved): @artinstitutechicago 1 / @artinstituteweddingsevents 52
- candidates (structural): @artinstitutechicago 0 / @artinstituteweddingsevents 89
- followers: @artinstitutechicago null / @artinstituteweddingsevents null
- full_name: @artinstitutechicago "" / @artinstituteweddingsevents ""
- evidence:
  - [S1] @artinstitutechicago ~ @artinstituteweddingsevents (stem "artinstitute")

### @sarabandechicago ~ @wildermansion

- suggested: **canonical** = @sarabandechicago, **alias** = @wildermansion -- @sarabandechicago has a scraped profile, @wildermansion does not
- signals: S5
- weddings (venue-role, alias-resolved): @sarabandechicago 68 / @wildermansion 2
- candidates (structural): @sarabandechicago 71 / @wildermansion 0
- followers: @sarabandechicago 2663 / @wildermansion null
- full_name: @sarabandechicago "SARABANDE" / @wildermansion ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dchn31-kdsd/)

### @chicagoathletichotel ~ @cindysrooftop

- suggested: **canonical** = @cindysrooftop, **alias** = @chicagoathletichotel -- @cindysrooftop has more followers (49167 vs 48694)
- signals: S4
- weddings (venue-role, alias-resolved): @chicagoathletichotel 52 / @cindysrooftop 6
- candidates (structural): @chicagoathletichotel 61 / @cindysrooftop 10
- followers: @chicagoathletichotel 48694 / @cindysrooftop 49167
- full_name: @chicagoathletichotel "Chicago Athletic Association" / @cindysrooftop "Cindy's"
- evidence:
  - [S4] @cindysrooftop bio: "...n the 13th floor of @chicagoathletichotel in a glass atrium...." (unclassified)

### @langhamchicago ~ @vasso1938

- suggested: **canonical** = @langhamchicago, **alias** = @vasso1938 -- @langhamchicago has a scraped profile, @vasso1938 does not
- signals: S5
- weddings (venue-role, alias-resolved): @langhamchicago 56 / @vasso1938 0
- candidates (structural): @langhamchicago 47 / @vasso1938 1
- followers: @langhamchicago 70408 / @vasso1938 null
- full_name: @langhamchicago "The Langham, Chicago" / @vasso1938 ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dbv0La3HKyF/)

### @sohohouse ~ @tigerlilyevents

- suggested: **canonical** = @sohohouse, **alias** = @tigerlilyevents -- @sohohouse has more followers (1733860 vs 3394)
- signals: S5
- weddings (venue-role, alias-resolved): @sohohouse 4 / @tigerlilyevents 4
- candidates (structural): @sohohouse 4 / @tigerlilyevents 91
- followers: @sohohouse 1733860 / @tigerlilyevents 3394
- full_name: @sohohouse "Soho House" / @tigerlilyevents "Cafe Brauer & Lincoln Park Zoo"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DL43agKOm-3/)

### @theexchangechicago ~ @exchangechicago

- suggested: **canonical** = @theexchangechicago, **alias** = @exchangechicago -- @theexchangechicago has a scraped profile, @exchangechicago does not
- signals: S1
- weddings (venue-role, alias-resolved): @theexchangechicago 48 / @exchangechicago 1
- candidates (structural): @theexchangechicago 51 / @exchangechicago 0
- followers: @theexchangechicago 8259 / @exchangechicago null
- full_name: @theexchangechicago "The Exchange" / @exchangechicago ""
- evidence:
  - [S1] @theexchangechicago ~ @exchangechicago (stem "exchange")

### @theexchangechicago ~ @alyssabudayyeh

- suggested: **canonical** = @theexchangechicago, **alias** = @alyssabudayyeh -- @theexchangechicago has a scraped profile, @alyssabudayyeh does not
- signals: S5
- weddings (venue-role, alias-resolved): @theexchangechicago 48 / @alyssabudayyeh 0
- candidates (structural): @theexchangechicago 51 / @alyssabudayyeh 1
- followers: @theexchangechicago 8259 / @alyssabudayyeh null
- full_name: @theexchangechicago "The Exchange" / @alyssabudayyeh ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DRFTFHNjTcb/)

### @cantignypark ~ @cantignygolf

- suggested: **canonical** = @cantignypark, **alias** = @cantignygolf -- @cantignypark has more followers (21625 vs 3062)
- signals: S5
- weddings (venue-role, alias-resolved): @cantignypark 36 / @cantignygolf 4
- candidates (structural): @cantignypark 55 / @cantignygolf 3
- followers: @cantignypark 21625 / @cantignygolf 3062
- full_name: @cantignypark "Cantigny" / @cantignygolf "Cantigny Golf"
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DdG9F3iRECY/)

### @ulcchicago ~ @olmchicago

- suggested: **canonical** = @ulcchicago, **alias** = @olmchicago -- @ulcchicago has a scraped profile, @olmchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @ulcchicago 42 / @olmchicago 1
- candidates (structural): @ulcchicago 47 / @olmchicago 0
- followers: @ulcchicago 6477 / @olmchicago null
- full_name: @ulcchicago "Union League Club of Chicago" / @olmchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @olmchicago (never scraped) vs @ulcchicago (real venue)

### @thelytlehouse ~ @thelytleauditorium

- suggested: **canonical** = @thelytlehouse, **alias** = @thelytleauditorium -- @thelytlehouse has more followers (3965 vs 1376)
- signals: S4
- weddings (venue-role, alias-resolved): @thelytlehouse 34 / @thelytleauditorium 7
- candidates (structural): @thelytlehouse 37 / @thelytleauditorium 8
- followers: @thelytlehouse 3965 / @thelytleauditorium 1376
- full_name: @thelytlehouse "The Lytle House" / @thelytleauditorium "The Lytle Auditorium"
- evidence:
  - [S4] @thelytlehouse bio: "...‍🤝‍👩🏻🏳️‍🌈
Also @thelytleauditorium..." (unclassified)
  - [S4] @thelytleauditorium bio: "...sses | Performances
@thelytlehouse..." (unclassified)

### @fschicago ~ @ihchicago

- suggested: **canonical** = @fschicago, **alias** = @ihchicago -- @fschicago has a scraped profile, @ihchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @fschicago 34 / @ihchicago 0
- candidates (structural): @fschicago 41 / @ihchicago 2
- followers: @fschicago 53006 / @ihchicago null
- full_name: @fschicago "Four Seasons Hotel Chicago" / @ihchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @ihchicago (never scraped) vs @fschicago (real venue)

### @fschicago ~ @msichicago

- suggested: **canonical** = @fschicago, **alias** = @msichicago -- @fschicago has a scraped profile, @msichicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @fschicago 34 / @msichicago 1
- candidates (structural): @fschicago 41 / @msichicago 0
- followers: @fschicago 53006 / @msichicago null
- full_name: @fschicago "Four Seasons Hotel Chicago" / @msichicago ""
- evidence:
  - [S6] Levenshtein distance 2: @msichicago (never scraped) vs @fschicago (real venue)

### @loewschicagohotel ~ @streetervillesocial

- suggested: **canonical** = @streetervillesocial, **alias** = @loewschicagohotel -- @streetervillesocial has more followers (3921 vs 3682)
- signals: S4
- weddings (venue-role, alias-resolved): @loewschicagohotel 28 / @streetervillesocial 0
- candidates (structural): @loewschicagohotel 28 / @streetervillesocial 0
- followers: @loewschicagohotel 3682 / @streetervillesocial 3921
- full_name: @loewschicagohotel "Loews Chicago Hotel (Official)" / @streetervillesocial "Streeterville Social"
- evidence:
  - [S4] @streetervillesocial bio: "...ce in Streeterville @loewschicagohotel..." (unclassified)

### @thecanvasvenue ~ @_bdarbs

- suggested: **canonical** = @thecanvasvenue, **alias** = @_bdarbs -- @thecanvasvenue has a scraped profile, @_bdarbs does not
- signals: S5
- weddings (venue-role, alias-resolved): @thecanvasvenue 26 / @_bdarbs 0
- candidates (structural): @thecanvasvenue 29 / @_bdarbs 1
- followers: @thecanvasvenue 8834 / @_bdarbs null
- full_name: @thecanvasvenue "CANVAS | Chicago Event Venue" / @_bdarbs ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DFEmmlFNRT0/)

### @offshorerooftop ~ @navypierchicago

- suggested: **canonical** = @navypierchicago, **alias** = @offshorerooftop -- @navypierchicago has more followers (119271 vs 22387)
- signals: S4
- weddings (venue-role, alias-resolved): @offshorerooftop 24 / @navypierchicago 2
- candidates (structural): @offshorerooftop 26 / @navypierchicago 0
- followers: @offshorerooftop 22387 / @navypierchicago 119271
- full_name: @offshorerooftop "Offshore Rooftop" / @navypierchicago "Navy Pier"
- evidence:
  - [S4] @offshorerooftop bio: "...space
📍Located on @navypierchicago's East End
🌎 World..." (unclassified)

### @kitchen_chicago ~ @cityviewloft

- suggested: **canonical** = @cityviewloft, **alias** = @kitchen_chicago -- @cityviewloft has more followers (2919 vs 1205)
- signals: S5
- weddings (venue-role, alias-resolved): @kitchen_chicago 2 / @cityviewloft 23
- candidates (structural): @kitchen_chicago 0 / @cityviewloft 27
- followers: @kitchen_chicago 1205 / @cityviewloft 2919
- full_name: @kitchen_chicago "Kitchen Chicago" / @cityviewloft "City View Loft Chicago"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/C2XssXarupw/)

### @haleymansion ~ @thehaleymansion

- suggested: **canonical** = @haleymansion, **alias** = @thehaleymansion -- @haleymansion has a scraped profile, @thehaleymansion does not
- signals: S1
- weddings (venue-role, alias-resolved): @haleymansion 21 / @thehaleymansion 0
- candidates (structural): @haleymansion 28 / @thehaleymansion 1
- followers: @haleymansion 2256 / @thehaleymansion null
- full_name: @haleymansion "The Haley Mansion" / @thehaleymansion ""
- evidence:
  - [S1] @haleymansion ~ @thehaleymansion (stem "haleymansion")

### @luc_conferences ~ @loyola_cuneomansion

- suggested: **canonical** = @loyola_cuneomansion, **alias** = @luc_conferences -- @loyola_cuneomansion has more followers (1182 vs 553)
- signals: S3b
- weddings (venue-role, alias-resolved): @luc_conferences 0 / @loyola_cuneomansion 24
- candidates (structural): @luc_conferences 0 / @loyola_cuneomansion 26
- followers: @luc_conferences 553 / @loyola_cuneomansion 1182
- full_name: @luc_conferences "LUC Conference Services" / @loyola_cuneomansion "Cuneo Mansion & Gardens"
- evidence:
  - [S3b] same website host "luc.edu"

### @lhchicago ~ @ihchicago

- suggested: **canonical** = @lhchicago, **alias** = @ihchicago -- @lhchicago has a scraped profile, @ihchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @lhchicago 18 / @ihchicago 0
- candidates (structural): @lhchicago 20 / @ihchicago 2
- followers: @lhchicago 105688 / @ihchicago null
- full_name: @lhchicago "LondonHouse Chicago" / @ihchicago ""
- evidence:
  - [S6] Levenshtein distance 1: @ihchicago (never scraped) vs @lhchicago (real venue)

### @igniteglass ~ @igniteeventschi

- suggested: **canonical** = @igniteglass, **alias** = @igniteeventschi -- @igniteglass has more followers (33653 vs 1563)
- signals: S4
- weddings (venue-role, alias-resolved): @igniteglass 6 / @igniteeventschi 12
- candidates (structural): @igniteglass 8 / @igniteeventschi 13
- followers: @igniteglass 33653 / @igniteeventschi 1563
- full_name: @igniteglass "Ignite Glass Studios" / @igniteeventschi "Ignite Glass Studios (Events)"
- evidence:
  - [S4] @igniteglass bio: "...Weddings and Events @igniteeventschi..." (unclassified)
  - [S4] @igniteeventschi bio: "...celebration meet. 
@igniteglass 🔥 
#chicagovenue #..." (unclassified)

### @lhchicago ~ @olmchicago

- suggested: **canonical** = @lhchicago, **alias** = @olmchicago -- @lhchicago has a scraped profile, @olmchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @lhchicago 18 / @olmchicago 1
- candidates (structural): @lhchicago 20 / @olmchicago 0
- followers: @lhchicago 105688 / @olmchicago null
- full_name: @lhchicago "LondonHouse Chicago" / @olmchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @olmchicago (never scraped) vs @lhchicago (real venue)

### @lhchicago ~ @lhrooftop

- suggested: **canonical** = @lhchicago, **alias** = @lhrooftop -- @lhchicago has more followers (105688 vs 5893)
- signals: S4
- weddings (venue-role, alias-resolved): @lhchicago 18 / @lhrooftop 0
- candidates (structural): @lhchicago 20 / @lhrooftop 0
- followers: @lhchicago 105688 / @lhrooftop 5893
- full_name: @lhchicago "LondonHouse Chicago" / @lhrooftop "LondonHouse Rooftop"
- evidence:
  - [S4] @lhrooftop bio: "...fficial IG account: @lhchicago 
[This account is n..." (unclassified)

### @victoriainthepark ~ @victoriavenues

- suggested: **canonical** = @victoriainthepark, **alias** = @victoriavenues -- @victoriainthepark has more followers (2016 vs 216)
- signals: S4
- weddings (venue-role, alias-resolved): @victoriainthepark 15 / @victoriavenues 2
- candidates (structural): @victoriainthepark 16 / @victoriavenues 3
- followers: @victoriainthepark 2016 / @victoriavenues 216
- full_name: @victoriainthepark "Wedding & Event Venue near Chicago, Illinois" / @victoriavenues "Victoria Venues"
- evidence:
  - [S4] @victoriainthepark bio: "...bar) for any event! @victoriavenues 
@theknot @stylemep..." (unclassified)
  - [S4] @victoriavenues bio: "...other celebrations!
@victoriainthepark 
@missionhillsclub..." (unclassified)

### @thevillamke ~ @villaterracemuseum

- suggested: **canonical** = @thevillamke, **alias** = @villaterracemuseum -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @thevillamke 2 / @villaterracemuseum 0
- candidates (structural): @thevillamke 27 / @villaterracemuseum 2
- followers: @thevillamke null / @villaterracemuseum null
- full_name: @thevillamke "" / @villaterracemuseum ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/C2I_pm2ukAi/)

### @wachicago ~ @wipachicago

- suggested: **canonical** = @wachicago, **alias** = @wipachicago -- @wachicago has a scraped profile, @wipachicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @wachicago 14 / @wipachicago 1
- candidates (structural): @wachicago 13 / @wipachicago 3
- followers: @wachicago 32438 / @wipachicago null
- full_name: @wachicago "Waldorf Astoria Chicago" / @wipachicago ""
- evidence:
  - [S6] Levenshtein distance 2: @wipachicago (never scraped) vs @wachicago (real venue)

### @theherringtoninnandspa ~ @herringtoninnandspa

- suggested: **canonical** = @theherringtoninnandspa, **alias** = @herringtoninnandspa -- @theherringtoninnandspa has a full_name on record, @herringtoninnandspa does not
- signals: S1
- weddings (venue-role, alias-resolved): @theherringtoninnandspa 12 / @herringtoninnandspa 1
- candidates (structural): @theherringtoninnandspa 15 / @herringtoninnandspa 1
- followers: @theherringtoninnandspa 3672 / @herringtoninnandspa null
- full_name: @theherringtoninnandspa "The Herrington Inn & Spa" / @herringtoninnandspa ""
- evidence:
  - [S1] @theherringtoninnandspa ~ @herringtoninnandspa (stem "herringtoninnspa")

### @wachicago ~ @ihchicago

- suggested: **canonical** = @wachicago, **alias** = @ihchicago -- @wachicago has a scraped profile, @ihchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @wachicago 14 / @ihchicago 0
- candidates (structural): @wachicago 13 / @ihchicago 2
- followers: @wachicago 32438 / @ihchicago null
- full_name: @wachicago "Waldorf Astoria Chicago" / @ihchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @ihchicago (never scraped) vs @wachicago (real venue)

### @thegraychi ~ @boleochicago

- suggested: **canonical** = @thegraychi, **alias** = @boleochicago -- @thegraychi has more followers (8852 vs 5122)
- signals: S4
- weddings (venue-role, alias-resolved): @thegraychi 14 / @boleochicago 0
- candidates (structural): @thegraychi 12 / @boleochicago 1
- followers: @thegraychi 8852 / @boleochicago 5122
- full_name: @thegraychi "The Kimpton Gray Hotel" / @boleochicago "Boleo"
- evidence:
  - [S4] @thegraychi bio: "...de experiences.
🍹: @boleochicago
🍸: @vol39chicago
�..." (unclassified)

### @theempressbanquets ~ @empressbanquets

- suggested: **canonical** = @empressbanquets, **alias** = @theempressbanquets -- @empressbanquets has more followers (2558 vs 653)
- signals: S1
- weddings (venue-role, alias-resolved): @theempressbanquets 5 / @empressbanquets 7
- candidates (structural): @theempressbanquets 5 / @empressbanquets 9
- followers: @theempressbanquets 653 / @empressbanquets 2558
- full_name: @theempressbanquets "The Empress Banquets" / @empressbanquets "Empress Banquets"
- evidence:
  - [S1] @theempressbanquets ~ @empressbanquets (stem "empress")

### @jolietballroom ~ @mistwoodgolf

- suggested: **canonical** = @mistwoodgolf, **alias** = @jolietballroom -- @mistwoodgolf has more followers (5873 vs 938)
- signals: S4
- weddings (venue-role, alias-resolved): @jolietballroom 9 / @mistwoodgolf 3
- candidates (structural): @jolietballroom 10 / @mistwoodgolf 4
- followers: @jolietballroom 938 / @mistwoodgolf 5873
- full_name: @jolietballroom "The Grand Ballroom - Joliet" / @mistwoodgolf "Mistwood Golf Club"
- evidence:
  - [S4] @jolietballroom bio: "...Mistwood Golf Club (@MistwoodGolf)..." (unclassified)

### @eventswcofe ~ @thewcofe

- suggested: **canonical** = @eventswcofe, **alias** = @thewcofe -- @eventswcofe has a scraped profile, @thewcofe does not
- signals: S1
- weddings (venue-role, alias-resolved): @eventswcofe 10 / @thewcofe 0
- candidates (structural): @eventswcofe 12 / @thewcofe 1
- followers: @eventswcofe 895 / @thewcofe null
- full_name: @eventswcofe "The Woman's Club of Evanston" / @thewcofe ""
- evidence:
  - [S1] @eventswcofe ~ @thewcofe (stem "wcofe")

### @communityhouse_celebrate ~ @lonetreemanor

- suggested: **canonical** = @communityhouse_celebrate, **alias** = @lonetreemanor -- @communityhouse_celebrate has a scraped profile, @lonetreemanor does not
- signals: S5
- weddings (venue-role, alias-resolved): @communityhouse_celebrate 11 / @lonetreemanor 1
- candidates (structural): @communityhouse_celebrate 9 / @lonetreemanor 1
- followers: @communityhouse_celebrate 374 / @lonetreemanor null
- full_name: @communityhouse_celebrate "Community House in Winnetka" / @lonetreemanor ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DbTosuiM1vn/)

### @bolingbrookgolfclub ~ @eventsatbolingbrookgolfclub

- suggested: **canonical** = @bolingbrookgolfclub, **alias** = @eventsatbolingbrookgolfclub -- @bolingbrookgolfclub has a scraped profile, @eventsatbolingbrookgolfclub does not
- signals: S1
- weddings (venue-role, alias-resolved): @bolingbrookgolfclub 9 / @eventsatbolingbrookgolfclub 1
- candidates (structural): @bolingbrookgolfclub 9 / @eventsatbolingbrookgolfclub 0
- followers: @bolingbrookgolfclub 3459 / @eventsatbolingbrookgolfclub null
- full_name: @bolingbrookgolfclub "Bolingbrook Golf Club" / @eventsatbolingbrookgolfclub ""
- evidence:
  - [S1] @bolingbrookgolfclub ~ @eventsatbolingbrookgolfclub (stem "bolingbrookgolfclub")

### @trumpchicago ~ @terrace16chicago

- suggested: **canonical** = @trumpchicago, **alias** = @terrace16chicago -- @trumpchicago has more followers (88170 vs 27045)
- signals: S4
- weddings (venue-role, alias-resolved): @trumpchicago 7 / @terrace16chicago 2
- candidates (structural): @trumpchicago 8 / @terrace16chicago 2
- followers: @trumpchicago 88170 / @terrace16chicago 27045
- full_name: @trumpchicago "Trump Hotel Chicago" / @terrace16chicago "Terrace 16"
- evidence:
  - [S4] @trumpchicago bio: "...Five Star property. @terrace16chicago @rebar_chicago @tru..." (unclassified)

### @mirurestaurant ~ @stregischicago

- suggested: **canonical** = @stregischicago, **alias** = @mirurestaurant -- @stregischicago has more followers (21667 vs 21046)
- signals: S4
- weddings (venue-role, alias-resolved): @mirurestaurant 3 / @stregischicago 6
- candidates (structural): @mirurestaurant 2 / @stregischicago 8
- followers: @mirurestaurant 21046 / @stregischicago 21667
- full_name: @mirurestaurant "Miru" / @stregischicago "The St. Regis Chicago"
- evidence:
  - [S4] @mirurestaurant bio: "...y restaurant in the @stregischicago with spectacular vi..." (unclassified)
  - [S4] @stregischicago bio: "...f Champagne Sabrage
@mirurestaurant @treditarestaurant..." (unclassified)

### @zhoubevents ~ @zhoubartcenter

- suggested: **canonical** = @zhoubartcenter, **alias** = @zhoubevents -- @zhoubartcenter has more followers (49835 vs 1341)
- signals: S5
- weddings (venue-role, alias-resolved): @zhoubevents 3 / @zhoubartcenter 6
- candidates (structural): @zhoubevents 2 / @zhoubartcenter 7
- followers: @zhoubevents 1341 / @zhoubartcenter 49835
- full_name: @zhoubevents "Zhou B Art Center Events" / @zhoubartcenter "Zhou B Art Center"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Cvu69aqhMU4/)

### @msichicago ~ @mcachicago

- suggested: **canonical** = @mcachicago, **alias** = @msichicago -- @mcachicago has a scraped profile, @msichicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @msichicago 1 / @mcachicago 7
- candidates (structural): @msichicago 0 / @mcachicago 9
- followers: @msichicago null / @mcachicago 183996
- full_name: @msichicago "" / @mcachicago "Museum of Contemporary Art Chicago"
- evidence:
  - [S6] Levenshtein distance 2: @msichicago (never scraped) vs @mcachicago (real venue)

### @hiltonorrington ~ @hiltonhotels

- suggested: **canonical** = @hiltonorrington, **alias** = @hiltonhotels -- @hiltonorrington has a scraped profile, @hiltonhotels does not
- signals: S5
- weddings (venue-role, alias-resolved): @hiltonorrington 5 / @hiltonhotels 2
- candidates (structural): @hiltonorrington 7 / @hiltonhotels 1
- followers: @hiltonorrington 533 / @hiltonhotels null
- full_name: @hiltonorrington "Hilton Orrington/Evanston" / @hiltonhotels ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DN8_-kkEupc/)

### @psbrewingco ~ @prairiestreetevents

- suggested: **canonical** = @prairiestreetevents, **alias** = @psbrewingco -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @psbrewingco 4 / @prairiestreetevents 2
- candidates (structural): @psbrewingco 1 / @prairiestreetevents 8
- followers: @psbrewingco null / @prairiestreetevents null
- full_name: @psbrewingco "" / @prairiestreetevents ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DT9GfCGAodk/)

### @renchicagodowntown ~ @raisedbarchicago

- suggested: **canonical** = @raisedbarchicago, **alias** = @renchicagodowntown -- @raisedbarchicago has more followers (18571 vs 5177)
- signals: S4
- weddings (venue-role, alias-resolved): @renchicagodowntown 8 / @raisedbarchicago 0
- candidates (structural): @renchicagodowntown 6 / @raisedbarchicago 0
- followers: @renchicagodowntown 5177 / @raisedbarchicago 18571
- full_name: @renchicagodowntown "Renaissance Chicago Downtown Hotel" / @raisedbarchicago "Raised Bar Chicago"
- evidence:
  - [S4] @raisedbarchicago bio: "...views of Chicago.
📍@renchicagodowntown..." (unclassified)

### @hotelarista ~ @golfthebridge

- suggested: **canonical** = @hotelarista, **alias** = @golfthebridge -- @hotelarista has more followers (2378 vs 1439)
- signals: S5
- weddings (venue-role, alias-resolved): @hotelarista 1 / @golfthebridge 5
- candidates (structural): @hotelarista 3 / @golfthebridge 5
- followers: @hotelarista 2378 / @golfthebridge 1439
- full_name: @hotelarista "Hotel Arista" / @golfthebridge "Stonebridge Country Club"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DM8xVCSP7WR/)

### @thegagechicago ~ @thewadechicago

- suggested: **canonical** = @thewadechicago, **alias** = @thegagechicago -- @thewadechicago has a scraped profile, @thegagechicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @thegagechicago 4 / @thewadechicago 5
- candidates (structural): @thegagechicago 0 / @thewadechicago 5
- followers: @thegagechicago null / @thewadechicago 18328
- full_name: @thegagechicago "" / @thewadechicago "The Wade Hotel, Chicago"
- evidence:
  - [S6] Levenshtein distance 2: @thegagechicago (never scraped) vs @thewadechicago (real venue)

### @cbgweddingsandevents ~ @cogweddingsandevents

- suggested: **canonical** = @cbgweddingsandevents, **alias** = @cogweddingsandevents -- @cbgweddingsandevents has a scraped profile, @cogweddingsandevents does not
- signals: S6
- weddings (venue-role, alias-resolved): @cbgweddingsandevents 3 / @cogweddingsandevents 0
- candidates (structural): @cbgweddingsandevents 7 / @cogweddingsandevents 1
- followers: @cbgweddingsandevents 817 / @cogweddingsandevents null
- full_name: @cbgweddingsandevents "Columbus Botanical Garden 💍" / @cogweddingsandevents ""
- evidence:
  - [S6] Levenshtein distance 1: @cogweddingsandevents (never scraped) vs @cbgweddingsandevents (real venue)

### @thehoxtonhotel ~ @cabrachicago

- suggested: **canonical** = @cabrachicago, **alias** = @thehoxtonhotel -- @cabrachicago has a scraped profile, @thehoxtonhotel does not
- signals: S4
- weddings (venue-role, alias-resolved): @thehoxtonhotel 4 / @cabrachicago 3
- candidates (structural): @thehoxtonhotel 0 / @cabrachicago 3
- followers: @thehoxtonhotel null / @cabrachicago 35499
- full_name: @thehoxtonhotel "" / @cabrachicago "Cabra by Stephanie Izard"
- evidence:
  - [S4] @cabrachicago bio: "...Skyline views from @thehoxtonhotel..." (unclassified)

### @uchicago ~ @thestudyatuniversityofchicago

- suggested: **canonical** = @uchicago, **alias** = @thestudyatuniversityofchicago -- @uchicago has more followers (271382 vs 1124)
- signals: S4
- weddings (venue-role, alias-resolved): @uchicago 3 / @thestudyatuniversityofchicago 2
- candidates (structural): @uchicago 1 / @thestudyatuniversityofchicago 4
- followers: @uchicago 271382 / @thestudyatuniversityofchicago 1124
- full_name: @uchicago "The University Of Chicago" / @thestudyatuniversityofchicago "The Study at Univ of Chicago"
- evidence:
  - [S4] @thestudyatuniversityofchicago bio: "...ng hotel located on @uchicago's South Campus..." (unclassified)

### @thegrovecountryclub ~ @grovecountryclub

- suggested: **canonical** = @thegrovecountryclub, **alias** = @grovecountryclub -- @thegrovecountryclub has a scraped profile, @grovecountryclub does not
- signals: S1
- weddings (venue-role, alias-resolved): @thegrovecountryclub 4 / @grovecountryclub 0
- candidates (structural): @thegrovecountryclub 4 / @grovecountryclub 1
- followers: @thegrovecountryclub 326 / @grovecountryclub null
- full_name: @thegrovecountryclub "The Grove Country Club" / @grovecountryclub ""
- evidence:
  - [S1] @thegrovecountryclub ~ @grovecountryclub (stem "grovecountryclub")

### @hotelbaker ~ @hotelbakerweddings

- suggested: **canonical** = @hotelbaker, **alias** = @hotelbakerweddings -- @hotelbaker has a scraped profile, @hotelbakerweddings does not
- signals: S1
- weddings (venue-role, alias-resolved): @hotelbaker 3 / @hotelbakerweddings 0
- candidates (structural): @hotelbaker 5 / @hotelbakerweddings 1
- followers: @hotelbaker 4417 / @hotelbakerweddings null
- full_name: @hotelbaker "HOTEL BAKER" / @hotelbakerweddings ""
- evidence:
  - [S1] @hotelbaker ~ @hotelbakerweddings (stem "hotelbaker")

### @ritzcarlton ~ @ritzcarltonchicago

- suggested: **canonical** = @ritzcarlton, **alias** = @ritzcarltonchicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @ritzcarlton 4 / @ritzcarltonchicago 4
- candidates (structural): @ritzcarlton 0 / @ritzcarltonchicago 0
- followers: @ritzcarlton null / @ritzcarltonchicago null
- full_name: @ritzcarlton "" / @ritzcarltonchicago ""
- evidence:
  - [S1] @ritzcarlton ~ @ritzcarltonchicago (stem "ritzcarlton")

### @cabrachicago ~ @girl.and.the.goat

- suggested: **canonical** = @girl.and.the.goat, **alias** = @cabrachicago -- @girl.and.the.goat has more followers (53292 vs 35499)
- signals: S4
- weddings (venue-role, alias-resolved): @cabrachicago 3 / @girl.and.the.goat 1
- candidates (structural): @cabrachicago 3 / @girl.and.the.goat 1
- followers: @cabrachicago 35499 / @girl.and.the.goat 53292
- full_name: @cabrachicago "Cabra by Stephanie Izard" / @girl.and.the.goat "Girl & The Goat Chicago"
- evidence:
  - [S4] @cabrachicago bio: "...@stephanieizard of @girl.and.the.goat
🦐🍹 Shareable, Per..." (unclassified)

### @thaliahallchicago ~ @16occhicago

- suggested: **canonical** = @thaliahallchicago, **alias** = @16occhicago -- @thaliahallchicago has more followers (73795 vs 13056)
- signals: S4
- weddings (venue-role, alias-resolved): @thaliahallchicago 4 / @16occhicago 1
- candidates (structural): @thaliahallchicago 2 / @16occhicago 0
- followers: @thaliahallchicago 73795 / @16occhicago 13056
- full_name: @thaliahallchicago "Thalia Hall" / @16occhicago "16 On Center Chicago"
- evidence:
  - [S4] @thaliahallchicago bio: "...1892
Re-Est. 2014
a @16occhicago project..." (unclassified)

### @shedd_aquarium ~ @azureatshedd

- suggested: **canonical** = @shedd_aquarium, **alias** = @azureatshedd -- @shedd_aquarium has more followers (361178 vs 493)
- signals: S4
- weddings (venue-role, alias-resolved): @shedd_aquarium 3 / @azureatshedd 0
- candidates (structural): @shedd_aquarium 3 / @azureatshedd 1
- followers: @shedd_aquarium 361178 / @azureatshedd 493
- full_name: @shedd_aquarium "Shedd Aquarium" / @azureatshedd "Azure at Shedd Aquarium"
- evidence:
  - [S4] @azureatshedd bio: "...Azure at @shedd_aquarium offers stunning vie..." (unclassified)

### @experience_nd ~ @themorrisinn

- suggested: **canonical** = @experience_nd, **alias** = @themorrisinn -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @experience_nd 0 / @themorrisinn 0
- candidates (structural): @experience_nd 6 / @themorrisinn 1
- followers: @experience_nd null / @themorrisinn null
- full_name: @experience_nd "" / @themorrisinn ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dac6KzAlsTe/)

### @fiorettasteak ~ @thepenthousechicago

- suggested: **canonical** = @fiorettasteak, **alias** = @thepenthousechicago -- @fiorettasteak has a scraped profile, @thepenthousechicago does not
- signals: S5
- weddings (venue-role, alias-resolved): @fiorettasteak 3 / @thepenthousechicago 1
- candidates (structural): @fiorettasteak 2 / @thepenthousechicago 1
- followers: @fiorettasteak 21765 / @thepenthousechicago null
- full_name: @fiorettasteak "Fioretta" / @thepenthousechicago ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/Dc5xzKwjSvj/)

### @hannahschweissphotography ~ @thestudiochicago

- suggested: **canonical** = @thestudiochicago, **alias** = @hannahschweissphotography -- @thestudiochicago has more followers (13944 vs 11012)
- signals: S3b
- weddings (venue-role, alias-resolved): @hannahschweissphotography 0 / @thestudiochicago 3
- candidates (structural): @hannahschweissphotography 0 / @thestudiochicago 3
- followers: @hannahschweissphotography 11012 / @thestudiochicago 13944
- full_name: @hannahschweissphotography "Hannah Schweiss" / @thestudiochicago "The Studio Chicago"
- evidence:
  - [S3b] same website host "thestudiochi.com"

### @navypierchicago ~ @sableatnavypier

- suggested: **canonical** = @navypierchicago, **alias** = @sableatnavypier -- @navypierchicago has more followers (119271 vs 4756)
- signals: S4
- weddings (venue-role, alias-resolved): @navypierchicago 2 / @sableatnavypier 2
- candidates (structural): @navypierchicago 0 / @sableatnavypier 2
- followers: @navypierchicago 119271 / @sableatnavypier 4756
- full_name: @navypierchicago "Navy Pier" / @sableatnavypier "Sable at Navy Pier"
- evidence:
  - [S4] @sableatnavypier bio: "...higan
📍 Located on @navypierchicago's East End..." (unclassified)

### @chicityclerk ~ @cityhallofchicago

- suggested: **canonical** = @chicityclerk, **alias** = @cityhallofchicago -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @chicityclerk 3 / @cityhallofchicago 3
- candidates (structural): @chicityclerk 0 / @cityhallofchicago 0
- followers: @chicityclerk null / @cityhallofchicago null
- full_name: @chicityclerk "" / @cityhallofchicago ""
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/Da6V846j-aE/)

### @terrace16chicago ~ @trumptowerchicago

- suggested: **canonical** = @terrace16chicago, **alias** = @trumptowerchicago -- @terrace16chicago has a scraped profile, @trumptowerchicago does not
- signals: S5
- weddings (venue-role, alias-resolved): @terrace16chicago 2 / @trumptowerchicago 2
- candidates (structural): @terrace16chicago 2 / @trumptowerchicago 0
- followers: @terrace16chicago 27045 / @trumptowerchicago null
- full_name: @terrace16chicago "Terrace 16" / @trumptowerchicago ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DO_0mokE0y7/)

### @uchicago ~ @ihchicago

- suggested: **canonical** = @uchicago, **alias** = @ihchicago -- @uchicago has a scraped profile, @ihchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @uchicago 3 / @ihchicago 0
- candidates (structural): @uchicago 1 / @ihchicago 2
- followers: @uchicago 271382 / @ihchicago null
- full_name: @uchicago "The University Of Chicago" / @ihchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @ihchicago (never scraped) vs @uchicago (real venue)

### @oasisatdeathvalley ~ @oasisatdeathvalleyweddings

- suggested: **canonical** = @oasisatdeathvalley, **alias** = @oasisatdeathvalleyweddings -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @oasisatdeathvalley 0 / @oasisatdeathvalleyweddings 0
- candidates (structural): @oasisatdeathvalley 1 / @oasisatdeathvalleyweddings 4
- followers: @oasisatdeathvalley null / @oasisatdeathvalleyweddings null
- full_name: @oasisatdeathvalley "" / @oasisatdeathvalleyweddings ""
- evidence:
  - [S1] @oasisatdeathvalley ~ @oasisatdeathvalleyweddings (stem "oasisdehvalley")

### @raviniagreencountryclub ~ @rgccprivateevents

- suggested: **canonical** = @raviniagreencountryclub, **alias** = @rgccprivateevents -- @raviniagreencountryclub has a scraped profile, @rgccprivateevents does not
- signals: S5
- weddings (venue-role, alias-resolved): @raviniagreencountryclub 2 / @rgccprivateevents 1
- candidates (structural): @raviniagreencountryclub 2 / @rgccprivateevents 0
- followers: @raviniagreencountryclub 2028 / @rgccprivateevents null
- full_name: @raviniagreencountryclub "Ravinia Green Country Club" / @rgccprivateevents ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DL1HBp-xO5u/)

### @rlm_chicago ~ @olmchicago

- suggested: **canonical** = @rlm_chicago, **alias** = @olmchicago -- @rlm_chicago has a scraped profile, @olmchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @rlm_chicago 4 / @olmchicago 1
- candidates (structural): @rlm_chicago 0 / @olmchicago 0
- followers: @rlm_chicago 3489 / @olmchicago null
- full_name: @rlm_chicago "RLM Events & Design" / @olmchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @olmchicago (never scraped) vs @rlm_chicago (real venue)

### @iahcchicago ~ @ihchicago

- suggested: **canonical** = @iahcchicago, **alias** = @ihchicago -- @iahcchicago has a scraped profile, @ihchicago does not
- signals: S6
- weddings (venue-role, alias-resolved): @iahcchicago 3 / @ihchicago 0
- candidates (structural): @iahcchicago 0 / @ihchicago 2
- followers: @iahcchicago 7282 / @ihchicago null
- full_name: @iahcchicago "Irish American Heritage Center☘️" / @ihchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @ihchicago (never scraped) vs @iahcchicago (real venue)

### @dcestatewineryweddings ~ @dcestatewinery

- suggested: **canonical** = @dcestatewineryweddings, **alias** = @dcestatewinery -- @dcestatewineryweddings has a scraped profile, @dcestatewinery does not
- signals: S1
- weddings (venue-role, alias-resolved): @dcestatewineryweddings 0 / @dcestatewinery 0
- candidates (structural): @dcestatewineryweddings 3 / @dcestatewinery 1
- followers: @dcestatewineryweddings 1224 / @dcestatewinery null
- full_name: @dcestatewineryweddings "DC Estate Winery" / @dcestatewinery ""
- evidence:
  - [S1] @dcestatewineryweddings ~ @dcestatewinery (stem "dcestewinery")

### @royalmelbournecc ~ @royalmelbourneccevents

- suggested: **canonical** = @royalmelbournecc, **alias** = @royalmelbourneccevents -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @royalmelbournecc 1 / @royalmelbourneccevents 0
- candidates (structural): @royalmelbournecc 1 / @royalmelbourneccevents 1
- followers: @royalmelbournecc null / @royalmelbourneccevents null
- full_name: @royalmelbournecc "" / @royalmelbourneccevents ""
- evidence:
  - [S1] @royalmelbournecc ~ @royalmelbourneccevents (stem "royalmelbournecc")

### @hoteljuliendubuque ~ @weddings.hoteljuliendubuque

- suggested: **canonical** = @hoteljuliendubuque, **alias** = @weddings.hoteljuliendubuque -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @hoteljuliendubuque 0 / @weddings.hoteljuliendubuque 0
- candidates (structural): @hoteljuliendubuque 2 / @weddings.hoteljuliendubuque 1
- followers: @hoteljuliendubuque null / @weddings.hoteljuliendubuque null
- full_name: @hoteljuliendubuque "" / @weddings.hoteljuliendubuque ""
- evidence:
  - [S1] @hoteljuliendubuque ~ @weddings.hoteljuliendubuque (stem "hoteljuliendubuque")

### @piazza_messina ~ @weddingsatpiazzamessina

- suggested: **canonical** = @piazza_messina, **alias** = @weddingsatpiazzamessina -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S1
- weddings (venue-role, alias-resolved): @piazza_messina 0 / @weddingsatpiazzamessina 0
- candidates (structural): @piazza_messina 2 / @weddingsatpiazzamessina 1
- followers: @piazza_messina null / @weddingsatpiazzamessina null
- full_name: @piazza_messina "" / @weddingsatpiazzamessina ""
- evidence:
  - [S1] @piazza_messina ~ @weddingsatpiazzamessina (stem "piazzamessina")

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

### @hellenicmuseum ~ @hellenicmuseumevents

- suggested: **canonical** = @hellenicmuseum, **alias** = @hellenicmuseumevents -- @hellenicmuseum has a scraped profile, @hellenicmuseumevents does not
- signals: S1
- weddings (venue-role, alias-resolved): @hellenicmuseum 0 / @hellenicmuseumevents 0
- candidates (structural): @hellenicmuseum 1 / @hellenicmuseumevents 1
- followers: @hellenicmuseum 5838 / @hellenicmuseumevents null
- full_name: @hellenicmuseum "National Hellenic Museum" / @hellenicmuseumevents ""
- evidence:
  - [S1] @hellenicmuseum ~ @hellenicmuseumevents (stem "hellenicmuseum")

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

- suggested: **canonical** = @punchhousechicago, **alias** = @16occhicago -- @punchhousechicago has more followers (14055 vs 13056)
- signals: S4
- weddings (venue-role, alias-resolved): @punchhousechicago 1 / @16occhicago 1
- candidates (structural): @punchhousechicago 0 / @16occhicago 0
- followers: @punchhousechicago 14055 / @16occhicago 13056
- full_name: @punchhousechicago "Punch House" / @16occhicago "16 On Center Chicago"
- evidence:
  - [S4] @punchhousechicago bio: "...2am
Sun 5pm-12am 
a @16occhicago project..." (unclassified)

### @eventsatjourneyman ~ @journeymandistillery

- suggested: **canonical** = @eventsatjourneyman, **alias** = @journeymandistillery -- tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand
- signals: S5
- weddings (venue-role, alias-resolved): @eventsatjourneyman 0 / @journeymandistillery 0
- candidates (structural): @eventsatjourneyman 1 / @journeymandistillery 1
- followers: @eventsatjourneyman null / @journeymandistillery null
- full_name: @eventsatjourneyman "" / @journeymandistillery ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DbCEg2ljbeZ/)

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

### @skyterracechicago ~ @ivyhotelchicago

- suggested: **canonical** = @skyterracechicago, **alias** = @ivyhotelchicago -- @skyterracechicago has more followers (3350 vs 1689)
- signals: S4
- weddings (venue-role, alias-resolved): @skyterracechicago 1 / @ivyhotelchicago 0
- candidates (structural): @skyterracechicago 0 / @ivyhotelchicago 0
- followers: @skyterracechicago 3350 / @ivyhotelchicago 1689
- full_name: @skyterracechicago "Sky Terrace | Chicago Event Venue" / @ivyhotelchicago "Ivy Hotel - Chicago"
- evidence:
  - [S4] @ivyhotelchicago bio: "...ago // Rooftop Bar: @skyterracechicago..." (unclassified)

## Related, not the same venue (45)

### @bridgeportartcenter ~ @venuelogic

- suggested: **canonical** = @bridgeportartcenter, **alias** = @venuelogic -- known round-3 false positive or deny-listed brand handle
- signals: S4, S5
- weddings (venue-role, alias-resolved): @bridgeportartcenter 205 / @venuelogic 20
- candidates (structural): @bridgeportartcenter 286 / @venuelogic 6
- followers: @bridgeportartcenter 16883 / @venuelogic 4889
- full_name: @bridgeportartcenter "Bridgeport Art Center" / @venuelogic "VenueLogic Chicago"
- evidence:
  - [S4] @venuelogic bio: "...rockwellontheriver, @bridgeportartcenter & @amazingspacechic..." (unclassified)
  - [S5] co-credited on the same venue credit line, 11 posts (e.g. https://www.instagram.com/p/DcB_z8WlOs8/)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @rockwellontheriver ~ @venuelogic

- suggested: **canonical** = @rockwellontheriver, **alias** = @venuelogic -- known round-3 false positive or deny-listed brand handle
- signals: S4, S5
- weddings (venue-role, alias-resolved): @rockwellontheriver 144 / @venuelogic 20
- candidates (structural): @rockwellontheriver 200 / @venuelogic 6
- followers: @rockwellontheriver 8923 / @venuelogic 4889
- full_name: @rockwellontheriver "Rockwell On The River" / @venuelogic "VenueLogic Chicago"
- evidence:
  - [S4] @venuelogic bio: "...enue Management for @rockwellontheriver, @bridgeportartcent..." (related_not_alias)
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DbUTpqHlAiw/)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @thedalcy ~ @lettuceentertainyou

- suggested: **canonical** = @thedalcy, **alias** = @lettuceentertainyou -- known round-3 false positive or deny-listed brand handle
- signals: S4, S5
- weddings (venue-role, alias-resolved): @thedalcy 99 / @lettuceentertainyou 4
- candidates (structural): @thedalcy 135 / @lettuceentertainyou 1
- followers: @thedalcy 5031 / @lettuceentertainyou null
- full_name: @thedalcy "The Dalcy" / @lettuceentertainyou ""
- evidence:
  - [S4] @thedalcy bio: "...ivate event hall by @lettuceentertainyou in the Fulton Marke..." (related_not_alias)
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DaLqck4RPHA/)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @chicagomuseumevents ~ @pattymcguirehmuartists

- suggested: **canonical** = @chicagomuseumevents, **alias** = @pattymcguirehmuartists -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S5
- weddings (venue-role, alias-resolved): @chicagomuseumevents 80 / @pattymcguirehmuartists 1
- candidates (structural): @chicagomuseumevents 103 / @pattymcguirehmuartists 0
- followers: @chicagomuseumevents 4410 / @pattymcguirehmuartists null
- full_name: @chicagomuseumevents "Chicago History Museum Events" / @pattymcguirehmuartists ""
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DcPnnNMjd6s/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @totlspecialevents ~ @saintclementparish

- suggested: **canonical** = @saintclementparish, **alias** = @totlspecialevents -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @totlspecialevents 64 / @saintclementparish 20
- candidates (structural): @totlspecialevents 62 / @saintclementparish 13
- followers: @totlspecialevents 2770 / @saintclementparish 38238
- full_name: @totlspecialevents "Theater On The Lake Events" / @saintclementparish "Saint Clement Parish"
- evidence:
  - [S5] co-credited on the same venue credit line, 8 posts (e.g. https://www.instagram.com/p/DaBtG-ECMNC/)
  - EXCLUDED: church/parish/cathedral-type name

### @theateronthelakechicago ~ @saintclementparish

- suggested: **canonical** = @saintclementparish, **alias** = @theateronthelakechicago -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @theateronthelakechicago 64 / @saintclementparish 20
- candidates (structural): @theateronthelakechicago 62 / @saintclementparish 13
- followers: @theateronthelakechicago 2029 / @saintclementparish 38238
- full_name: @theateronthelakechicago "Theater on the Lake" / @saintclementparish "Saint Clement Parish"
- evidence:
  - [S5] co-credited on the same venue credit line, 6 posts (e.g. https://www.instagram.com/p/DU2A1dUDN_v/)
  - EXCLUDED: church/parish/cathedral-type name

### @artinstitutechi ~ @artinstitutechicago

- suggested: **canonical** = @artinstitutechi, **alias** = @artinstitutechicago -- known round-3 false positive or deny-listed brand handle
- signals: S1
- weddings (venue-role, alias-resolved): @artinstitutechi 52 / @artinstitutechicago 1
- candidates (structural): @artinstitutechi 89 / @artinstitutechicago 0
- followers: @artinstitutechi 850234 / @artinstitutechicago null
- full_name: @artinstitutechi "The Art Institute of Chicago" / @artinstitutechicago ""
- evidence:
  - [S1] @artinstitutechi ~ @artinstitutechicago (stem "artinstitute")
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @lacunaloftevents ~ @lacuna2150

- suggested: **canonical** = @lacunaloftevents, **alias** = @lacuna2150 -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4, S5
- weddings (venue-role, alias-resolved): @lacunaloftevents 60 / @lacuna2150 3
- candidates (structural): @lacunaloftevents 57 / @lacuna2150 4
- followers: @lacunaloftevents 3707 / @lacuna2150 null
- full_name: @lacunaloftevents "Lacuna Loft Events By LM" / @lacuna2150 ""
- evidence:
  - [S4] @lacunaloftevents bio: "...cuna Lofts Building @lacuna2150..." (unclassified)
  - [S5] co-credited on the same venue credit line, 5 posts (e.g. https://www.instagram.com/p/C_RL1C1PrXZ/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @lacunabycatalystsuites ~ @lacunaloftevents

- suggested: **canonical** = @lacunabycatalystsuites, **alias** = @lacunaloftevents -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S5
- weddings (venue-role, alias-resolved): @lacunabycatalystsuites 5 / @lacunaloftevents 60
- candidates (structural): @lacunabycatalystsuites 0 / @lacunaloftevents 57
- followers: @lacunabycatalystsuites 7630 / @lacunaloftevents 3707
- full_name: @lacunabycatalystsuites "Lacuna By Catalyst Suites" / @lacunaloftevents "Lacuna Loft Events By LM"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DccATsFhe9a/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @lmcateringchi ~ @lacunaloftevents

- suggested: **canonical** = @lacunaloftevents, **alias** = @lmcateringchi -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4, S5
- weddings (venue-role, alias-resolved): @lmcateringchi 3 / @lacunaloftevents 60
- candidates (structural): @lmcateringchi 1 / @lacunaloftevents 57
- followers: @lmcateringchi 1858 / @lacunaloftevents 3707
- full_name: @lmcateringchi "LM Catering & Events" / @lacunaloftevents "Lacuna Loft Events By LM"
- evidence:
  - [S4] @lmcateringchi bio: "...In-house caterer at @lacunaloftevents, @lmstudiochi, @sky..." (related_not_alias)
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DbCJSyLxOyQ/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @lmstudiochi ~ @lmcateringchi

- suggested: **canonical** = @lmcateringchi, **alias** = @lmstudiochi -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @lmstudiochi 44 / @lmcateringchi 3
- candidates (structural): @lmstudiochi 66 / @lmcateringchi 1
- followers: @lmstudiochi 1161 / @lmcateringchi 1858
- full_name: @lmstudiochi "LM Studio" / @lmcateringchi "LM Catering & Events"
- evidence:
  - [S4] @lmcateringchi bio: "...@lacunaloftevents, @lmstudiochi, @skyonnine, and @t..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @theexchangechicago ~ @episcope.hospitality

- suggested: **canonical** = @theexchangechicago, **alias** = @episcope.hospitality -- known round-3 false positive or deny-listed brand handle
- signals: S4
- weddings (venue-role, alias-resolved): @theexchangechicago 48 / @episcope.hospitality 0
- candidates (structural): @theexchangechicago 51 / @episcope.hospitality 1
- followers: @theexchangechicago 8259 / @episcope.hospitality null
- full_name: @theexchangechicago "The Exchange" / @episcope.hospitality ""
- evidence:
  - [S4] @theexchangechicago bio: "...⠀⠀⠀⠀⠀⠀⠀⠀
Created by @episcope.hospitality..." (related_not_alias)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @thecrawfordvenue ~ @abbotthospitality

- suggested: **canonical** = @thecrawfordvenue, **alias** = @abbotthospitality -- only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
- signals: S4
- weddings (venue-role, alias-resolved): @thecrawfordvenue 32 / @abbotthospitality 0
- candidates (structural): @thecrawfordvenue 50 / @abbotthospitality 1
- followers: @thecrawfordvenue 2356 / @abbotthospitality null
- full_name: @thecrawfordvenue "The Crawford" / @abbotthospitality ""
- evidence:
  - [S4] @thecrawfordvenue bio: "...The Crawford by @abbotthospitality is filled with a vi..." (related_not_alias)
  - EXCLUDED: only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)

### @thepeninsulachi ~ @peninsulachi

- suggested: **canonical** = @thepeninsulachi, **alias** = @peninsulachi -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S1
- weddings (venue-role, alias-resolved): @thepeninsulachi 36 / @peninsulachi 0
- candidates (structural): @thepeninsulachi 41 / @peninsulachi 1
- followers: @thepeninsulachi 44851 / @peninsulachi null
- full_name: @thepeninsulachi "The Peninsula Chicago" / @peninsulachi ""
- evidence:
  - [S1] @thepeninsulachi ~ @peninsulachi (stem "peninsula")
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @thelytlehouse ~ @chicagoweddingphotography

- suggested: **canonical** = @thelytlehouse, **alias** = @chicagoweddingphotography -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S3b
- weddings (venue-role, alias-resolved): @thelytlehouse 34 / @chicagoweddingphotography 0
- candidates (structural): @thelytlehouse 37 / @chicagoweddingphotography 0
- followers: @thelytlehouse 3965 / @chicagoweddingphotography 1352
- full_name: @thelytlehouse "The Lytle House" / @chicagoweddingphotography ""
- evidence:
  - [S3b] same website host "thelytlehouse.com"
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @lmcateringchi ~ @skyonnine

- suggested: **canonical** = @lmcateringchi, **alias** = @skyonnine -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @lmcateringchi 3 / @skyonnine 27
- candidates (structural): @lmcateringchi 1 / @skyonnine 30
- followers: @lmcateringchi 1858 / @skyonnine 1219
- full_name: @lmcateringchi "LM Catering & Events" / @skyonnine "Sky on Nine"
- evidence:
  - [S4] @lmcateringchi bio: "...ents, @lmstudiochi, @skyonnine, and @twentysixchic..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @twentysixchicago ~ @lmcateringchi

- suggested: **canonical** = @lmcateringchi, **alias** = @twentysixchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @twentysixchicago 19 / @lmcateringchi 3
- candidates (structural): @twentysixchicago 36 / @lmcateringchi 1
- followers: @twentysixchicago 982 / @lmcateringchi 1858
- full_name: @twentysixchicago "Twenty Six Chicago" / @lmcateringchi "LM Catering & Events"
- evidence:
  - [S4] @lmcateringchi bio: "...hi, @skyonnine, and @twentysixchicago..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @rcchicago ~ @ihchicago

- suggested: **canonical** = @rcchicago, **alias** = @ihchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S6
- weddings (venue-role, alias-resolved): @rcchicago 22 / @ihchicago 0
- candidates (structural): @rcchicago 28 / @ihchicago 2
- followers: @rcchicago 13826 / @ihchicago null
- full_name: @rcchicago "The Ritz-Carlton, Chicago" / @ihchicago ""
- evidence:
  - [S6] Levenshtein distance 2: @ihchicago (never scraped) vs @rcchicago (real venue)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @venuelogic ~ @amazingspacechicago

- suggested: **canonical** = @venuelogic, **alias** = @amazingspacechicago -- known round-3 false positive or deny-listed brand handle
- signals: S3b, S4
- weddings (venue-role, alias-resolved): @venuelogic 20 / @amazingspacechicago 9
- candidates (structural): @venuelogic 6 / @amazingspacechicago 13
- followers: @venuelogic 4889 / @amazingspacechicago 408
- full_name: @venuelogic "VenueLogic Chicago" / @amazingspacechicago "Amazing Space"
- evidence:
  - [S3b] same website host "venuelogicchicago.com"
  - [S4] @venuelogic bio: "...idgeportartcenter & @amazingspacechicago 
• Purveyors of the..." (unclassified)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @thompsonchicago ~ @saintclementparish

- suggested: **canonical** = @saintclementparish, **alias** = @thompsonchicago -- church/parish/cathedral-type name
- signals: S5
- weddings (venue-role, alias-resolved): @thompsonchicago 9 / @saintclementparish 20
- candidates (structural): @thompsonchicago 3 / @saintclementparish 13
- followers: @thompsonchicago 8273 / @saintclementparish 38238
- full_name: @thompsonchicago "Thompson Chicago" / @saintclementparish "Saint Clement Parish"
- evidence:
  - [S5] co-credited on the same venue credit line, 7 posts (e.g. https://www.instagram.com/p/DaBtG-ECMNC/)
  - EXCLUDED: church/parish/cathedral-type name

### @communityhouse_celebrate ~ @belvedereeventsandcatering

- suggested: **canonical** = @belvedereeventsandcatering, **alias** = @communityhouse_celebrate -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S5
- weddings (venue-role, alias-resolved): @communityhouse_celebrate 11 / @belvedereeventsandcatering 7
- candidates (structural): @communityhouse_celebrate 9 / @belvedereeventsandcatering 8
- followers: @communityhouse_celebrate 374 / @belvedereeventsandcatering 2332
- full_name: @communityhouse_celebrate "Community House in Winnetka" / @belvedereeventsandcatering "Belvedere Events"
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DbTosuiM1vn/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @chicagostyleweddings ~ @victoriainthepark

- suggested: **canonical** = @chicagostyleweddings, **alias** = @victoriainthepark -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @chicagostyleweddings 0 / @victoriainthepark 15
- candidates (structural): @chicagostyleweddings 1 / @victoriainthepark 16
- followers: @chicagostyleweddings 10154 / @victoriainthepark 2016
- full_name: @chicagostyleweddings "Chicago Style Weddings" / @victoriainthepark "Wedding & Event Venue near Chicago, Illinois"
- evidence:
  - [S4] @victoriainthepark bio: "...knot @stylemepretty @chicagostyleweddings Vendor ✨🎀
🥳 Book..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @modluxweddingschi ~ @modernluxury

- suggested: **canonical** = @modluxweddingschi, **alias** = @modernluxury -- only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
- signals: S4
- weddings (venue-role, alias-resolved): @modluxweddingschi 1 / @modernluxury 12
- candidates (structural): @modluxweddingschi 0 / @modernluxury 5
- followers: @modluxweddingschi 20844 / @modernluxury null
- full_name: @modluxweddingschi "Modern Luxury Weddings Chicago" / @modernluxury ""
- evidence:
  - [S4] @modluxweddingschi bio: "...Shore | Beyond
✨ By @modernluxury @cschicagosocial @n..." (related_not_alias)
  - EXCLUDED: only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)

### @lonetreemanor ~ @belvedereeventsandcatering

- suggested: **canonical** = @belvedereeventsandcatering, **alias** = @lonetreemanor -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S5
- weddings (venue-role, alias-resolved): @lonetreemanor 1 / @belvedereeventsandcatering 7
- candidates (structural): @lonetreemanor 1 / @belvedereeventsandcatering 8
- followers: @lonetreemanor null / @belvedereeventsandcatering 2332
- full_name: @lonetreemanor "" / @belvedereeventsandcatering "Belvedere Events"
- evidence:
  - [S5] co-credited on the same venue credit line, 3 posts (e.g. https://www.instagram.com/p/DbTosuiM1vn/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

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

### @fairmontchicago ~ @fairmonthotels

- suggested: **canonical** = @fairmonthotels, **alias** = @fairmontchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @fairmontchicago 3 / @fairmonthotels 0
- candidates (structural): @fairmontchicago 4 / @fairmonthotels 5
- followers: @fairmontchicago 17267 / @fairmonthotels 316098
- full_name: @fairmontchicago "Fairmont Chicago" / @fairmonthotels "Fairmont Hotels & Resorts"
- evidence:
  - [S4] @fairmontchicago bio: "...and entertainment.
@fairmonthotels
@torochicago 
@leaf..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @chicagohotelcollection ~ @ambassadorchicago

- suggested: **canonical** = @ambassadorchicago, **alias** = @chicagohotelcollection -- only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
- signals: S4
- weddings (venue-role, alias-resolved): @chicagohotelcollection 0 / @ambassadorchicago 4
- candidates (structural): @chicagohotelcollection 0 / @ambassadorchicago 6
- followers: @chicagohotelcollection 23659 / @ambassadorchicago 29829
- full_name: @chicagohotelcollection "The Chicago Hotel Collection" / @ambassadorchicago "Ambassador Gold Coast"
- evidence:
  - [S4] @ambassadorchicago bio: "...ade option)
Part of @chicagohotelcollection..." (related_not_alias)
  - EXCLUDED: only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)

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

### @celebrateatbloom ~ @cjjanda

- suggested: **canonical** = @cjjanda, **alias** = @celebrateatbloom -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S5
- weddings (venue-role, alias-resolved): @celebrateatbloom 7 / @cjjanda 1
- candidates (structural): @celebrateatbloom 2 / @cjjanda 0
- followers: @celebrateatbloom 2406 / @cjjanda 7375
- full_name: @celebrateatbloom "Bloom Events" / @cjjanda "Christine Janda Design & Events"
- evidence:
  - [S5] co-credited on the same venue credit line, 2 posts (e.g. https://www.instagram.com/p/DJh6wJHKVwP/)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @marshallslanding ~ @episcope.hospitality

- suggested: **canonical** = @marshallslanding, **alias** = @episcope.hospitality -- known round-3 false positive or deny-listed brand handle
- signals: S4
- weddings (venue-role, alias-resolved): @marshallslanding 3 / @episcope.hospitality 0
- candidates (structural): @marshallslanding 3 / @episcope.hospitality 1
- followers: @marshallslanding 7608 / @episcope.hospitality null
- full_name: @marshallslanding "Marshall’s Landing" / @episcope.hospitality ""
- evidence:
  - [S4] @marshallslanding bio: "...d events 
⠀⠀⠀⠀⠀⠀⠀⠀⠀
@episcope.hospitality..." (related_not_alias)
  - EXCLUDED: known round-3 false positive or deny-listed brand handle

### @gooseisland ~ @gooseislandchicago

- suggested: **canonical** = @gooseisland, **alias** = @gooseislandchicago -- known round-3 false positive or deny-listed brand handle
- signals: S1
- weddings (venue-role, alias-resolved): @gooseisland 1 / @gooseislandchicago 2
- candidates (structural): @gooseisland 2 / @gooseislandchicago 1
- followers: @gooseisland null / @gooseislandchicago null
- full_name: @gooseisland "Goose Island Beer Co." / @gooseislandchicago "Goose Island"
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
- weddings (venue-role, alias-resolved): @eeeventco 2 / @thursdaytherapychi 2
- candidates (structural): @eeeventco 2 / @thursdaytherapychi 0
- followers: @eeeventco 1592 / @thursdaytherapychi 2383
- full_name: @eeeventco "Emmanuelle × EE Event Co. (Escandar Group, LLC)" / @thursdaytherapychi "Thursday Therapy Chicago"
- evidence:
  - [S4] @thursdaytherapychi bio: "...orking event. Hosts @eeeventco, @modernlovedjs, @t..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @westloopweddingwalk ~ @urbanallureevents

- suggested: **canonical** = @westloopweddingwalk, **alias** = @urbanallureevents -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @westloopweddingwalk 3 / @urbanallureevents 1
- candidates (structural): @westloopweddingwalk 1 / @urbanallureevents 0
- followers: @westloopweddingwalk 1871 / @urbanallureevents null
- full_name: @westloopweddingwalk "West Loop Wedding Walk™️" / @urbanallureevents ""
- evidence:
  - [S4] @westloopweddingwalk bio: "...condBestDayEver
c/o @urbanallureevents..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @sableatnavypier ~ @hilton

- suggested: **canonical** = @hilton, **alias** = @sableatnavypier -- only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)
- signals: S4
- weddings (venue-role, alias-resolved): @sableatnavypier 2 / @hilton 0
- candidates (structural): @sableatnavypier 2 / @hilton 1
- followers: @sableatnavypier 4756 / @hilton 822994
- full_name: @sableatnavypier "Sable at Navy Pier" / @hilton "Hilton"
- evidence:
  - [S4] @sableatnavypier bio: "...@curiocollection by @hilton
✨ Bringing you eleg..." (related_not_alias)
  - EXCLUDED: only evidence is an S4 related_not_alias phrase (managed-by / sister / part-of, not the same venue)

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

### @stjameschapel ~ @stjameschapelchicago

- suggested: **canonical** = @stjameschapelchicago, **alias** = @stjameschapel -- church/parish/cathedral-type name
- signals: S1
- weddings (venue-role, alias-resolved): @stjameschapel 1 / @stjameschapelchicago 2
- candidates (structural): @stjameschapel 0 / @stjameschapelchicago 1
- followers: @stjameschapel null / @stjameschapelchicago null
- full_name: @stjameschapel "" / @stjameschapelchicago ""
- evidence:
  - [S1] @stjameschapel ~ @stjameschapelchicago (stem "stjameschapel")
  - EXCLUDED: church/parish/cathedral-type name

### @clementinechicago ~ @suzysparacio

- suggested: **canonical** = @clementinechicago, **alias** = @suzysparacio -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S3b
- weddings (venue-role, alias-resolved): @clementinechicago 2 / @suzysparacio 0
- candidates (structural): @clementinechicago 1 / @suzysparacio 0
- followers: @clementinechicago 8895 / @suzysparacio 1067
- full_name: @clementinechicago "Clementine Custom Events" / @suzysparacio "Suzy Sparacio"
- evidence:
  - [S3b] same website host "clementinecustomevents.com"
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @smowparish ~ @mswparish

- suggested: **canonical** = @smowparish, **alias** = @mswparish -- church/parish/cathedral-type name
- signals: S6
- weddings (venue-role, alias-resolved): @smowparish 1 / @mswparish 1
- candidates (structural): @smowparish 0 / @mswparish 1
- followers: @smowparish 640 / @mswparish null
- full_name: @smowparish "St. Mary of the Woods Parish" / @mswparish ""
- evidence:
  - [S6] Levenshtein distance 2: @mswparish (never scraped) vs @smowparish (real venue)
  - EXCLUDED: church/parish/cathedral-type name

### @svf_parish ~ @svfparish

- suggested: **canonical** = @svf_parish, **alias** = @svfparish -- church/parish/cathedral-type name
- signals: S1, S1b
- weddings (venue-role, alias-resolved): @svf_parish 0 / @svfparish 1
- candidates (structural): @svf_parish 1 / @svfparish 0
- followers: @svf_parish null / @svfparish null
- full_name: @svf_parish "" / @svfparish ""
- evidence:
  - [S1] @svf_parish ~ @svfparish (stem "svfparish")
  - [S1b] scrape/parse artifact ('.'/'_' variant)
  - EXCLUDED: church/parish/cathedral-type name

### @hmrdesigns ~ @brittanieahrens

- suggested: **canonical** = @hmrdesigns, **alias** = @brittanieahrens -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S3b
- weddings (venue-role, alias-resolved): @hmrdesigns 1 / @brittanieahrens 0
- candidates (structural): @hmrdesigns 1 / @brittanieahrens 0
- followers: @hmrdesigns 71262 / @brittanieahrens 810
- full_name: @hmrdesigns "HMR Designs" / @brittanieahrens "Brittanie Ahrens | HMR Designs"
- evidence:
  - [S3b] same website host "hmrdesigns.com"
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @hmrdesigns ~ @twbaker.events

- suggested: **canonical** = @hmrdesigns, **alias** = @twbaker.events -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S3b
- weddings (venue-role, alias-resolved): @hmrdesigns 1 / @twbaker.events 0
- candidates (structural): @hmrdesigns 1 / @twbaker.events 0
- followers: @hmrdesigns 71262 / @twbaker.events 635
- full_name: @hmrdesigns "HMR Designs" / @twbaker.events "Chicago Wedding & Event Designer TW Baker"
- evidence:
  - [S3b] same website host "hmrdesigns.com"
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @arlenmusicproductions ~ @entouragebandchicago

- suggested: **canonical** = @arlenmusicproductions, **alias** = @entouragebandchicago -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S4
- weddings (venue-role, alias-resolved): @arlenmusicproductions 1 / @entouragebandchicago 1
- candidates (structural): @arlenmusicproductions 0 / @entouragebandchicago 0
- followers: @arlenmusicproductions 1632 / @entouragebandchicago null
- full_name: @arlenmusicproductions "Arlen Music Productions" / @entouragebandchicago ""
- evidence:
  - [S4] @arlenmusicproductions bio: "...@frontofhouseband | @entouragebandchicago | @velocitybandchic..." (unclassified)
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio

### @stmarkchicago ~ @stmarychicago

- suggested: **canonical** = @stmarkchicago, **alias** = @stmarychicago -- church/parish/cathedral-type name
- signals: S6
- weddings (venue-role, alias-resolved): @stmarkchicago 1 / @stmarychicago 1
- candidates (structural): @stmarkchicago 0 / @stmarychicago 0
- followers: @stmarkchicago 10713 / @stmarychicago null
- full_name: @stmarkchicago "St Mark Coptic Orthodox Church" / @stmarychicago ""
- evidence:
  - [S6] Levenshtein distance 1: @stmarychicago (never scraped) vs @stmarkchicago (real venue)
  - EXCLUDED: church/parish/cathedral-type name

### @lolaeventpros ~ @lolamichellev

- suggested: **canonical** = @lolaeventpros, **alias** = @lolamichellev -- non-venue vendors.category or catering/management/hospitality-type bio
- signals: S3b
- weddings (venue-role, alias-resolved): @lolaeventpros 1 / @lolamichellev 0
- candidates (structural): @lolaeventpros 0 / @lolamichellev 0
- followers: @lolaeventpros 9316 / @lolamichellev 2112
- full_name: @lolaeventpros "LOLA Event Productions: Chicago wedding planner" / @lolamichellev "Michelle Vining (Kurinec) - Chicago Wedding Planner"
- evidence:
  - [S3b] same website host "lolaeventproductions.com"
  - EXCLUDED: non-venue vendors.category or catering/management/hospitality-type bio
