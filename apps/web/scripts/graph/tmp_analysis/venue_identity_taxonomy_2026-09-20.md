# Venue identity taxonomy -- why a venue is not listed (D062)

Generated 2026-09-20T23:47:39.447Z. Read-only.
Bar: a venue is covered at >= 1 documented wedding (user's call, 2026-09-20), which is also
`/venues`' own listing predicate.

| bucket | accounts | weddings held | remedy |
|---|---|---|---|
| `geo_blocked` | 116 | 143 | backfill account_locations (Places / Jeremy staging address), then it lists |
| `mis_anchored` | 18 | 28 | re-anchor the wedding to the real venue |
| `never_crawled` | 265 | 0 | crawl the tagged feed |
| `dead_feed` | 80 | 0 | website or a credited vendor's own feed -- NOT more tagged crawling |
| `no_identity` | 33 | 0 | profile-scrape / website first, then re-classify |
| `chain_brand` | 9 | 0 | never list, never merge -- the local property needs its own account |
| `not_a_venue` | 4 | 0 | delist: strip the venue role |
| `merged_away` | 506 | 6537 | none -- same venue, counted once (or already listed) |

## geo_blocked (116) -- backfill account_locations (Places / Jeremy staging address), then it lists

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @harrycarays | 9811 | 4 | unknown | y |
| @trumpturnberryscotland | 81874 | 3 | unknown | y |
| @bokachicago | 55536 | 3 | - | y |
| @kohlerwi | 38028 | 3 | unknown | y |
| @grand_geneva | 35948 | 3 | unknown | y |
| @stjames1868 | 12168 | 3 | unknown | y |
| @marriottbonvoy | 2462280 | 2 | unknown | y |
| @bevhillshotel | 351311 | 2 | unknown | y |
| @stregiskanairesort | 40686 | 2 | unknown | y |
| @castello_di_petrata | 40672 | 2 | unknown | y |
| @psbrewingco | 9832 | 2 | unknown | y |
| @renplanowest | 9130 | 2 | unknown | y |
| @ndbasilica | 7745 | 2 | unknown | y |
| @venue3two | 6744 | 2 | unknown | y |
| @allegrochicago | 4371 | 2 | unknown | y |
| @thevillamke | 3710 | 2 | unknown | y |
| @the_odyssey_events | 2124 | 2 | unknown | y |
| @prairiestreetevents | 2065 | 2 | unknown | y |
| @villagesuitesbayharbor | 1254 | 2 | unknown | y |
| @thelasallechicago | - | 2 | - | - |
| @hoophall | 530638 | 1 | unknown | y |
| @stregishotels | 525774 | 1 | unknown | y |
| @carnegiehall | 435054 | 1 | unknown | y |
| @pepesoffice | 386593 | 1 | unknown | y |
| @castelfalfi | 313469 | 1 | unknown | y |
| @sugarbeachviceroy | 271777 | 1 | unknown | y |
| @mo_emiratespalace | 229551 | 1 | unknown | y |
| @brooklynbotanic | 217657 | 1 | unknown | y |
| @nizucresort | 200733 | 1 | unknown | y |
| @villa_balbiano | 146153 | 1 | unknown | y |
| @saltshedchicago | 136175 | 1 | unknown | y |
| @fspuntamita | 133156 | 1 | unknown | y |
| @sandvalleygolf | 66317 | 1 | unknown | y |
| @carnerosresort | 64783 | 1 | - | y |
| @shoreclubchi | 47223 | 1 | unknown | y |
| @avecchicago | 44166 | 1 | unknown | y |
| @sofarchicago | 43989 | 1 | unknown | y |
| @contidisanbonifacio | 38340 | 1 | unknown | y |
| @aftermidnight.la | 36754 | 1 | unknown | y |
| @elgrancaribe | 36094 | 1 | unknown | y |
| _… 76 more, see the JSON_ | | | | |

## mis_anchored (18) -- re-anchor the wedding to the real venue

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @ashyanabanquets | 1945 | 4 | - | y |
| @ambassadorchicago | 29829 | 3 | - | y |
| @venuelogic | 4889 | 3 | - | y |
| @westinchicagorivernorth | 5050 | 2 | - | y |
| @tigerlilyevents | 3394 | 2 | - | y |
| @eeeventco | 1592 | 2 | - | y |
| @vendadorchicago | 97449 | 1 | - | y |
| @parkhyattchicago | 20235 | 1 | - | y |
| @wsphotography.us | 12905 | 1 | - | y |
| @frostchicago | 10222 | 1 | - | y |
| @lolaeventpros | 9316 | 1 | - | y |
| @clementinechicago | 8895 | 1 | - | y |
| @blueplatechicago | 8264 | 1 | - | y |
| @_bcollective | 5229 | 1 | - | y |
| @art_imagination | 4268 | 1 | - | y |
| @cageandaquarium | 2893 | 1 | - | y |
| @averyhouse | 2887 | 1 | - | y |
| @revelglobalevents | 2003 | 1 | - | y |

## never_crawled (265) -- crawl the tagged feed

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @disneyland | 8906847 | 0 | unknown | y |
| @teenvogue | 4446783 | 0 | unknown | y |
| @fourseasons | 1655838 | 0 | unknown | y |
| @ritzcarlton | 946048 | 0 | unknown | y |
| @disneyweddings | 840958 | 0 | unknown | y |
| @choosechicago | 578339 | 0 | - | y |
| @zhu | 458715 | 0 | unknown | y |
| @thehoxtonhotel | 443462 | 0 | unknown | y |
| @theryman | 360499 | 0 | unknown | y |
| @theplazahotel | 325918 | 0 | unknown | y |
| @uchicago | 271382 | 0 | - | y |
| @halfevilco | 195917 | 0 | unknown | y |
| @badruttspalace | 188021 | 0 | unknown | y |
| @doubletree | 128766 | 0 | unknown | y |
| @kulmhotel | 126757 | 0 | unknown | y |
| @paradisostmoritz | 115342 | 0 | unknown | y |
| @trumpdoral | 115107 | 0 | unknown | y |
| @abarestaurant | 97729 | 0 | unknown | y |
| @trumpgolfpalmbeach | 90414 | 0 | unknown | y |
| @thefindlab | 89455 | 0 | unknown | y |
| @portlandjapanesegarden | 88700 | 0 | unknown | y |
| @staypineapple | 82345 | 0 | - | y |
| @thebasementeast | 81746 | 0 | unknown | y |
| @citywinerynyc | 81717 | 0 | unknown | y |
| @themaralagoclub | 78850 | 0 | unknown | y |
| @crowneplaza | 76269 | 0 | unknown | y |
| @stonehavenweddings | 67946 | 0 | unknown | y |
| @citywinerynsh | 64229 | 0 | unknown | y |
| @theritzybor | 57348 | 0 | unknown | y |
| @chspourhouse | 56739 | 0 | unknown | y |
| @hobcleveland | 55050 | 0 | unknown | y |
| @themagmile | 52201 | 0 | unknown | y |
| @grandhotelkronenhof | 47264 | 0 | unknown | y |
| @kpopclubnight | 46360 | 0 | unknown | y |
| @mclemoreresort | 45525 | 0 | unknown | y |
| @catscradlenc | 43980 | 0 | unknown | y |
| @citywineryphil | 42812 | 0 | unknown | y |
| @sanmontanoresort | 42786 | 0 | unknown | y |
| @wisconsinunion | 41975 | 0 | unknown | y |
| @theburlky | 39942 | 0 | unknown | y |
| _… 225 more, see the JSON_ | | | | |

## dead_feed (80) -- website or a credited vendor's own feed -- NOT more tagged crawling

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @halfacrebeer | 88142 | 0 | dead | y |
| @metrochicago | 77480 | 0 | dead | y |
| @loyolachicago | 70850 | 0 | dead | y |
| @depaulu | 53908 | 0 | dead | y |
| @lh_schubas | 53524 | 0 | dead | y |
| @raviniafestival | 52393 | 0 | dead | y |
| @marzbrewing | 50185 | 0 | dead | y |
| @sofivesoccer | 46225 | 0 | dead | y |
| @roofonthewit | 45345 | 0 | dead | y |
| @wearespin | 44816 | 0 | dead | y |
| @chicagoboatco | 38786 | 0 | dead | y |
| @vfwhq | 37536 | 0 | dead | y |
| @naiaontheriver | 35950 | 0 | dead | y |
| @reggieslive | 33825 | 0 | dead | y |
| @ramovachicago | 32483 | 0 | dead | y |
| @easydoesitchicago | 31045 | 0 | dead | y |
| @murphysbleachers | 25330 | 0 | dead | y |
| @cobralounge | 24362 | 0 | dead | y |
| @womanmadegallery | 23315 | 0 | dead | y |
| @garcias_chicago | 21617 | 0 | dead | y |
| @dearlybelovedchicago | 21059 | 0 | dead | y |
| @pilotprojectbrewing | 20564 | 0 | dead | y |
| @115bourbonstreet | 20084 | 0 | dead | y |
| @raisedbarchicago | 18571 | 0 | dead | y |
| @pollyannabrewingcompany | 18355 | 0 | dead | y |
| @pilsenyards | 18014 | 0 | dead | y |
| @convene | 16240 | 0 | dead | y |
| @huntingtonbankpavilion | 13183 | 0 | dead | y |
| @alhambrachicago | 12425 | 0 | dead | y |
| @uiclife | 12335 | 0 | dead | - |
| @illuminatedbrewworks | 11713 | 0 | dead | y |
| @fpdcc | 10750 | 0 | dead | y |
| @stmarkchicago | 10713 | 0 | dead | y |
| @thetonkchicago | 10267 | 0 | dead | y |
| @extraholidays | 10013 | 0 | dead | y |
| @qodeinteractive | 9226 | 0 | dead | y |
| @airechicago | 8724 | 0 | dead | y |
| @momshousechicago | 7231 | 0 | dead | y |
| @monochromebrew | 6978 | 0 | dead | y |
| @ancora_themes | 6307 | 0 | dead | y |
| _… 40 more, see the JSON_ | | | | |

## no_identity (33) -- profile-scrape / website first, then re-classify

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @bonvivantcakes | 57580 | 0 | promising | y |
| @jparkerchicago | 15308 | 0 | promising | y |
| @punchhousechicago | 14055 | 0 | promising | y |
| @buddy.chicago | 12649 | 0 | promising | y |
| @alterbeer | 10804 | 0 | unknown | y |
| @thefultonstreetcollective | 7919 | 0 | promising | y |
| @lacunabycatalystsuites | 7630 | 0 | promising | y |
| @napersettlement | 6649 | 0 | ambiguous | y |
| @forurevents | 6392 | 0 | ambiguous | y |
| @boleochicago | 5122 | 0 | promising | y |
| @rivendelltheatre | 3973 | 0 | promising | y |
| @zinsflowershop | 2200 | 0 | promising | y |
| @jewishmuseumchicago | 1946 | 0 | promising | y |
| @navypiereventcenter | 1580 | 0 | promising | y |
| @kitchen_chicago | 1205 | 0 | promising | y |
| @theatriachicago | 993 | 0 | promising | y |
| @venue4343 | 874 | 0 | ambiguous | y |
| @geraghtynorth_ | 454 | 0 | ambiguous | y |
| @room85venue | 434 | 0 | ambiguous | y |
| @citypointloft_ | 424 | 0 | promising | y |
| @casadetreschicago | 351 | 0 | ambiguous | y |
| @thefultontable | 287 | 0 | ambiguous | y |
| @yvettesdecorservices | 235 | 0 | ambiguous | y |
| @grandterracebanquets | 227 | 0 | ambiguous | y |
| @3700ironlab | 217 | 0 | ambiguous | y |
| @luxyevents | 195 | 0 | promising | y |
| @irvinghallbanquets | 161 | 0 | ambiguous | y |
| @pavisluxuryevents | 148 | 0 | ambiguous | y |
| @swaydancebrookfield | 118 | 0 | ambiguous | y |
| @815weedst | 102 | 0 | ambiguous | y |
| @fwe_experience | 60 | 0 | promising | y |
| @projectsimeon2k | 9 | 0 | ambiguous | - |
| @challenge | - | 0 | unknown | - |

## chain_brand (9) -- never list, never merge -- the local property needs its own account

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @hiltonhotels | 467708 | 0 | unknown | y |
| @baccarathotels | 148484 | 0 | unknown | y |
| @renhotels | 113649 | 0 | unknown | y |
| @langhamhotels | 52567 | 0 | unknown | y |
| @sonestahotels | 26418 | 0 | - | y |
| @theheritagecollection | 25013 | 0 | unknown | y |
| @chicagohotelcollection | 23659 | 0 | dead | y |
| @luc_conferences | 553 | 0 | ambiguous | y |
| @janko.hospitality | 290 | 0 | unknown | y |

## not_a_venue (4) -- delist: strip the venue role

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @wix | 882810 | 0 | dead | y |
| @squarespace | 446381 | 0 | dead | y |
| @modernluxury | 125047 | 0 | unknown | y |
| @theamericanlegion | 56119 | 0 | dead | y |

## merged_away (506) -- none -- same venue, counted once (or already listed)

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @bridgeportartcenter | 16883 | 202 | - | y |
| @the.arbory | 3003 | 159 | promising | y |
| @rockwellontheriver | 8923 | 143 | - | y |
| @chicagoilluminatingcompany | 7480 | 128 | - | y |
| @waldenchicago | 4701 | 111 | - | y |
| @chicagowinery | 8826 | 106 | promising | y |
| @universityclubofchicago | 8332 | 102 | - | y |
| @adlerplanet | 79775 | 98 | - | y |
| @thedalcy | 5031 | 97 | - | y |
| @mortonarb | 92090 | 95 | unknown | y |
| @galleriamarchetti | 5167 | 92 | - | y |
| @chicagoculturalcenter | 23378 | 89 | - | y |
| @fairliechicago | 5191 | 84 | - | y |
| @chicagobotanic | 141539 | 75 | ambiguous | y |
| @chicagomuseum | 58261 | 75 | unknown | y |
| @wildmanbt | 3638 | 75 | - | y |
| @lincolnparkzoo | 140782 | 74 | - | y |
| @artifacteventschicago | 12135 | 74 | - | y |
| @fieldmuseum | 235445 | 71 | dead | y |
| @thedrakechicago | 17381 | 71 | dead | y |
| @thelibraryat190 | 6657 | 69 | promising | y |
| @salvageone | 15316 | 68 | - | y |
| @ivyroomchicago | 4453 | 66 | promising | y |
| @sarabandechicago | 2663 | 65 | promising | y |
| @loftlucia | 43923 | 62 | - | - |
| @riverroomchicago | 2831 | 60 | - | y |
| @thearmourhousemansion | 220 | 60 | - | - |
| @morgansonfulton | 13510 | 58 | promising | y |
| @thejoinerychicago | 7259 | 57 | - | y |
| @lacunaloftevents | 3707 | 54 | promising | y |
| @salvatoreschicago | 2381 | 54 | - | y |
| @theateronthelakechicago | 2029 | 53 | promising | y |
| @brixonfox | 7360 | 52 | promising | y |
| @chicagoathletichotel | 48694 | 50 | - | y |
| @thewellsley | 13644 | 49 | promising | y |
| @revelspace | 3813 | 49 | - | y |
| @post433chicago | 4237 | 48 | promising | y |
| @thegeraghty | 6677 | 46 | - | y |
| @the_carter_fultonmarket | 1642 | 46 | promising | y |
| @artinstitutechi | 850234 | 45 | dead | y |
| _… 466 more, see the JSON_ | | | | |
