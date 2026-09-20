# Venue identity taxonomy -- why a venue is not listed (D062)

Generated 2026-09-20T23:16:34.538Z. Read-only.
Bar: a venue is covered at >= 1 documented wedding (user's call, 2026-09-20), which is also
`/venues`' own listing predicate.

| bucket | accounts | weddings held | remedy |
|---|---|---|---|
| `geo_blocked` | 117 | 144 | backfill account_locations (Places / Jeremy staging address), then it lists |
| `mis_anchored` | 18 | 28 | re-anchor the wedding to the real venue |
| `never_crawled` | 41 | 0 | crawl the tagged feed |
| `dead_feed` | 80 | 0 | website or a credited vendor's own feed -- NOT more tagged crawling |
| `no_identity` | 260 | 0 | profile-scrape / website first, then re-classify |
| `chain_brand` | 9 | 0 | never list, never merge -- the local property needs its own account |
| `not_a_venue` | 4 | 0 | delist: strip the venue role |
| `merged_away` | 502 | 6536 | none -- same venue, counted once (or already listed) |

## geo_blocked (117) -- backfill account_locations (Places / Jeremy staging address), then it lists

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @harrycarays | - | 4 | - | - |
| @bokachicago | 55536 | 3 | - | y |
| @kohlerwi | - | 3 | - | - |
| @grand_geneva | - | 3 | - | - |
| @trumpturnberryscotland | - | 3 | - | - |
| @stjames1868 | - | 3 | - | - |
| @thevillamke | - | 2 | - | - |
| @venue3two | - | 2 | - | - |
| @thelasallechicago | - | 2 | - | - |
| @allegrochicago | - | 2 | - | - |
| @castello_di_petrata | - | 2 | - | - |
| @bevhillshotel | - | 2 | - | - |
| @the_odyssey_events | - | 2 | - | - |
| @villagesuitesbayharbor | - | 2 | - | - |
| @marriottbonvoy | - | 2 | - | - |
| @stregiskanairesort | - | 2 | - | - |
| @renplanowest | - | 2 | - | - |
| @psbrewingco | - | 2 | - | - |
| @ndbasilica | - | 2 | - | - |
| @prairiestreetevents | - | 2 | - | - |
| @carnerosresort | 64783 | 1 | - | y |
| @lazyshacienda | 13597 | 1 | - | y |
| @boweryandbash | 10047 | 1 | - | y |
| @subtle.haus | 6729 | 1 | - | y |
| @thursdaytherapychi | 2383 | 1 | - | y |
| @loft21events | 1838 | 1 | unknown | y |
| @ssabrookfieldteam | 234 | 1 | - | y |
| @avecchicago | - | 1 | - | - |
| @dream_creeks | - | 1 | - | - |
| @xocohousegallery | - | 1 | - | - |
| @eventswcoe | - | 1 | - | - |
| @humbledhospitality | - | 1 | - | - |
| @elgrancaribe | - | 1 | - | - |
| @pepesoffice | - | 1 | - | - |
| @sofarchicago | - | 1 | - | - |
| @churchclubchicago | - | 1 | - | - |
| @whitehawkcc | - | 1 | - | - |
| @carnegiehall | - | 1 | - | - |
| @stregishotels | - | 1 | - | - |
| @kohlerw | - | 1 | - | - |
| _… 77 more, see the JSON_ | | | | |

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

## never_crawled (41) -- crawl the tagged feed

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @choosechicago | 578339 | 0 | - | y |
| @uchicago | 271382 | 0 | - | y |
| @staypineapple | 82345 | 0 | - | y |
| @beatkitchenbar | 27452 | 0 | unknown | y |
| @pennywhistletavern | 18530 | 0 | unknown | y |
| @villagamberaia | 18026 | 0 | - | y |
| @logansquareimprov | 15365 | 0 | - | y |
| @electricfuneralbar | 11383 | 0 | unknown | - |
| @manoir_de_kerhuel | 4593 | 0 | - | y |
| @westinchicagons | 3095 | 0 | unknown | y |
| @l.a_aguilar_ | 2259 | 0 | - | y |
| @botanicochicago | 1536 | 0 | - | y |
| @hotelchicagodowntown | 1175 | 0 | - | y |
| @villadcitta | 1041 | 0 | - | y |
| @universal_entertainment_ | 850 | 0 | - | y |
| @matthewjamesorchestra | 693 | 0 | - | y |
| @smowparish | 640 | 0 | - | y |
| @stgeorgesocscher | 558 | 0 | - | y |
| @bettertogethertravelstg | 495 | 0 | - | y |
| @st.johnbrebeufniles | 430 | 0 | - | y |
| @stpaulofthecrosschurch | 235 | 0 | - | y |
| @sydney_kehoedesigns | 214 | 0 | - | y |
| @cielodulceeventvenue | 120 | 0 | - | y |
| @360eventcenter | 19 | 0 | - | - |
| @jseventdecor7 | 6 | 0 | - | - |
| @wedicity | - | 0 | ambiguous | - |
| @chezeventspace | - | 0 | - | - |
| @thesinclairchicago | - | 0 | - | - |
| @lillianroseevents | - | 0 | - | - |
| @oldnorthfilmcompany | - | 0 | - | - |
| @lespacechicago | - | 0 | - | - |
| @stapledevents_venue | - | 0 | - | - |
| @theparkwayatmichigan.com | - | 0 | - | - |
| @artroomevents | - | 0 | - | - |
| @keeping_tradition_fresh | - | 0 | - | - |
| @justinebursoniphoto | - | 0 | - | - |
| @catalystranchchicago | - | 0 | ambiguous | - |
| @slipperysloped | - | 0 | ambiguous | y |
| @madegallery | - | 0 | ambiguous | - |
| @the.neighborhood.hotel | - | 0 | unknown | y |
| _… 1 more, see the JSON_ | | | | |

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

## no_identity (260) -- profile-scrape / website first, then re-classify

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @bonvivantcakes | 57580 | 0 | promising | y |
| @jparkerchicago | 15308 | 0 | promising | y |
| @punchhousechicago | 14055 | 0 | promising | y |
| @buddy.chicago | 12649 | 0 | promising | y |
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
| @asianfashionshowchi | - | 0 | - | - |
| @crowneplaza | - | 0 | - | - |
| @ashkenazberkeley | - | 0 | - | - |
| @thecedar | - | 0 | - | - |
| @wisconsinunion | - | 0 | - | - |
| @cspshall | - | 0 | - | - |
| @moesalley | - | 0 | - | - |
| @lonetreemanor | - | 0 | - | - |
| _… 220 more, see the JSON_ | | | | |

## chain_brand (9) -- never list, never merge -- the local property needs its own account

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @sonestahotels | 26418 | 0 | - | y |
| @chicagohotelcollection | 23659 | 0 | dead | y |
| @luc_conferences | 553 | 0 | ambiguous | y |
| @theheritagecollection | - | 0 | - | - |
| @baccarathotels | - | 0 | - | - |
| @langhamhotels | - | 0 | - | - |
| @renhotels | - | 0 | - | - |
| @hiltonhotels | - | 0 | - | - |
| @janko.hospitality | - | 0 | - | - |

## not_a_venue (4) -- delist: strip the venue role

| handle | followers | weddings | crawl | website |
|---|---|---|---|---|
| @wix | 882810 | 0 | dead | y |
| @squarespace | 446381 | 0 | dead | y |
| @theamericanlegion | 56119 | 0 | dead | y |
| @modernluxury | - | 0 | - | - |

## merged_away (502) -- none -- same venue, counted once (or already listed)

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
| _… 462 more, see the JSON_ | | | | |
