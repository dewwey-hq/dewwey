# v2 manual audit — 25 posts

Prepared 2026-09-02 at the user's request, before spending further OpenRouter credit on a v3 run. All 25 posts are drawn from `dev_v1` only (never `heldout_v1` — that set stays untouched as a regression check, per instruction) under `classifier_version='v2'`. Each entry pairs the classifier's actual output with the raw post data and the existing `dev_v1` hand-label (shown for context only — this audit is asking you to independently judge whether the model's behavior matches the real product standard, not to confirm the existing label).

**Do not treat the existing hand-label as ground truth to defer to** — it was one earlier labeling pass (a fork or myself), not a settled verdict. Your judgment here is what becomes the permanent record.

---

## 1. https://www.instagram.com/p/DanshWKGTzq/

**Audit bucket:** Known residual false-positive / thin-evidence pattern  
**Why selected:** This exact post is a confirmed v2 false positive (or shares its category/confidence profile): ground truth says it should not be a confident INCLUDE, but the model included it. This is the residual failure mode v2 reduced but did not eliminate.

**Classifier decision:** `INCLUDE`  confidence **0.72**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): caption 'Pre-wedding goals...' tags planner, venue, and photographer
- **is_real_wedding** (mentions): multi-role vendor credit stack: planner @simplyelegantxo, venue @galleriamarchetti, photographer @ian.rempel - consistent with a booked real event
- **is_chicago** (cross_reference): venue @galleriamarchetti confirmed in_metro true in known_vendor_mentions
- **is_credible_source** (account_category): posting account is photographer's own profile, vendor_category photographer, account_archetype_prior wedding_photographer confidence 0.98
- **is_credible_source** (cross_reference): planner and venue both confirmed real Chicago vendors in known_vendor_mentions

**Account classification** (@ian.rempel): archetype=`wedding_photographer` (confidence=0.98, is_wedding_industry=true)
- **Account exclusively posts wedding photography content** (caption): All 6 sample captions reference weddings, wedding days, or wedding-related events (Katie & Jack's wedding, Rachael and Michael's wedding, Maddie + Sachin wedding, pre-wedding content)
- **Account explicitly identifies as a photographer in wedding context** (caption): Captions consistently credit 'Photo @ian.rempel' and 'Photographer | @ian.rempel' in wedding event posts
- **Google Places category aligns with observed behavior** (account_category): Places category is 'photographer' which matches the wedding photography archetype
- **Primary business is wedding services** (caption): 100% of sampled posts are wedding-related; no non-wedding content observed; account collaborates with other wedding vendors (planners, venues, florists, DJs, hair/makeup) indicating professional wedding industry participation

**Raw post data (independent evidence for your own judgment):**
- caption: 'Pre-wedding goals...\u2060\n\u2060\n@simplyelegantxo\u2060\n@galleriamarchetti\u2060\n@ian.rempel'
- hashtags: (none)
- mentions: simplyelegantxo, galleriamarchetti, ian.rempel
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _'Pre-wedding goals' mentions @galleriamarchetti, a confirmed real Chicago venue, but phrasing is ambiguous between an engagement shoot and the actual wedding_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 2. https://www.instagram.com/p/DaBE6RxGmtz/

**Audit bucket:** Known residual false-positive / thin-evidence pattern  
**Why selected:** This exact post is a confirmed v2 false positive (or shares its category/confidence profile): ground truth says it should not be a confident INCLUDE, but the model included it. This is the residual failure mode v2 reduced but did not eliminate.

**Classifier decision:** `INCLUDE`  confidence **0.75**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Beneath the glow of our Crystal Ballroom chandelier, two hearts became one in a celebration filled with love, laughter, and timeless elegance.
- **is_real_wedding** (caption): two hearts became one in a celebration... Thank you for letting us be part of such a beautiful beginning.
- **is_chicago** (hashtags): #StanMansion #ChicagoWeddingVenue #logansquare
- **is_credible_source** (account_category): Posting account is the venue's own verified profile, Stan Mansion, rating 4.8 (1004 reviews), venue category
- **vendor_credit** (mentions): Photos by @juanchoscphotography - confirmed Chicago wedding vendor in known_vendor_mentions

**Account classification** (@stanmansion): archetype=`wedding_venue` (confidence=0.99, is_wedding_industry=true)
- **Stan Mansion's primary business is hosting weddings** (caption): All 6 recent captions are exclusively about weddings—featuring specific couples, wedding celebrations, and venue features for wedding events
- **Account explicitly markets itself as a wedding venue** (caption): Captions use consistent wedding-specific language: 'Best Wedding Venue in Chicago', 'wedding venue', 'couples', 'forever', 'bridal suite', 'wedding day'
- **Google Places category aligns with actual business model** (account_category): Places category 'venue' is confirmed by caption content showing exclusive wedding hosting
- **High engagement and recognition in wedding industry** (account_rating): Account highlights 'Best Wedding Venue in Chicago for 2026' award from BusinessRate based on Google Reviews; 4.8 rating with 1004 reviews indicates established wedding venue reputation
- **Consistent wedding-focused content strategy** (caption): Posts feature individual couple celebrations, wedding photography collaborations, and venue-specific wedding amenities (bridal suite, reception spaces)

**Raw post data (independent evidence for your own judgment):**
- caption: 'Some moments are simply meant to shine. ✨\n Beneath the glow of our Crystal Ballroom chandelier, two hearts became one in a celebration filled with love, laughter, and timeless elegance.\n\nThank you for letting us be part of such a beautiful beginning. 🤍\n\nPhotos by @juanchoscphotography \n\n#StanMansion #CrystalBallroom #ChicagoWeddingVenue #chicagowedding #weddingday #thankyou #VersatileVenue #logansquare #historicvenue #mansionwedding #love #DreamVenue #CaptureTheLove #ElegantCelebrations #vintagewedding #weddingphotos'
- hashtags: stanmansion, crystalballroom, chicagoweddingvenue, chicagowedding, weddingday, thankyou, versatilevenue, logansquare, historicvenue, mansionwedding, love, dreamvenue, capturethelove, elegantcelebrations, vintagewedding, weddingphotos
- mentions: juanchoscphotography
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _describes a real ceremony at Stan Mansion's Crystal Ballroom with a photo credit, but no couple named — marketing tone, can't confirm vs venue self-promotion_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 3. https://www.instagram.com/p/Cvnck0pPL6R/

**Audit bucket:** Known residual false-positive / thin-evidence pattern  
**Why selected:** This exact post is a confirmed v2 false positive (or shares its category/confidence profile): ground truth says it should not be a confident INCLUDE, but the model included it. This is the residual failure mode v2 reduced but did not eliminate.

**Classifier decision:** `INCLUDE`  confidence **0.78**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (hashtags): newyearsevewedding, chicagowedding hashtags
- **is_real_wedding** (mentions): 4 distinct wedding vendor roles tagged: photographer, florist, catering, dj
- **is_chicago** (location_tag): location_tag: The Joinery Chicago
- **is_credible_source** (account_category): posting account is the venue itself, The Joinery, category venue, 4.7 rating
- **is_credible_source_corroboration** (cross_reference): cageandaquarium confirmed in_metro true wedding vendor

**Account classification** (@thejoinerychicago): archetype=`wedding_venue` (confidence=0.92, is_wedding_industry=true)
- **Primary business is wedding hosting and venue rental** (caption): 5 out of 6 recent captions feature wedding couples, wedding dates, and wedding photographer credits (Leah + Aaron, Sam + Sarah, Emilie + Larry, etc.)
- **Venue-specific wedding amenities and customization** (caption): Caption [2] discusses chair upgrade options (blue vs. black) as a wedding venue feature choice
- **Wedding-focused content strategy** (caption): Captions [1], [3], [4], [5] all follow wedding announcement format with couple names, dates, and photographer credits—standard wedding venue social media practice
- **Google Places category aligns with primary business** (account_category): Categorized as 'venue' with high rating (4.7/173 reviews), consistent with established wedding venue
- **Secondary non-wedding use does not diminish primary classification** (caption): Caption [6] mentions Sunday Yoga Series, but this is clearly a secondary/ancillary use of the space; wedding content dominates the feed

**Raw post data (independent evidence for your own judgment):**
- caption: 'New Year’s Eve 2022 ✨'
- hashtags: chicagonye, newyearsevewedding, chicagowedding, chicagovenues
- mentions: sallyodonnellphotography, elenasgardenevents, lulacafeevents, cageandaquarium
- location_tag: The Joinery Chicago

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _'New Year's Eve 2022' only; real venue (The Joinery) and vendor mentions but no couple name or confirmation of a wedding vs NYE party._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 4. https://www.instagram.com/p/DZUzmXjkVw3/

**Audit bucket:** Known residual false-positive / thin-evidence pattern  
**Why selected:** This exact post is a confirmed v2 false positive (or shares its category/confidence profile): ground truth says it should not be a confident INCLUDE, but the model included it. This is the residual failure mode v2 reduced but did not eliminate.

**Classifier decision:** `INCLUDE`  confidence **0.85**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): When a groom from Mexico and a bride from China come together, a wedding becomes more than a celebration
- **is_real_wedding** (caption): Multi-role vendor credit stack: Coordination, Catering, Photo, Florals, Venue all credited for this specific couple's wedding
- **is_chicago** (mentions): Venue tagged as @bridgeportartcenter, a known Chicago venue
- **is_chicago** (cross_reference): venue confirmed in_metro true via known_vendor_mentions
- **is_credible_source** (account_bio): Posting account is the vendor's own profile, a wedding planner (BWEDDINGS), account_archetype_prior wedding_planner confidence 0.95
- **is_credible_source** (cross_reference): Catering and venue mentions cross-referenced as confirmed real vendors in metro

**Account classification** (@bweddingschicago): archetype=`wedding_planner` (confidence=0.95, is_wedding_industry=true)
- **Account is a wedding planning business with a team** (caption): Multiple captions reference 'our team,' 'our journey in the wedding planning world,' and coordinating multiple weddings
- **Primary business is wedding planning services** (caption): All 6 sample captions are wedding-focused: planning tips, case studies of specific weddings (T. & N., E. and M.), team reflections, and vendor collaboration for styled shoots
- **Handles full-service wedding coordination** (caption): Caption [3] describes managing weather emergencies during ceremonies; caption [1] describes design collaboration and logistics; caption [2] discusses RSVP management and behind-the-scenes logistics
- **Google Places category aligns with business model** (account_category): Google Places category is 'planner'
- **Chicago-based wedding planning business** (caption): Username and Google Places name both @bweddingschicago; caption [4] explicitly states 'wedding planning world here in Chicago'; caption [6] mentions Toronto origins but now operating in Chicago market

**Raw post data (independent evidence for your own judgment):**
- caption: 'Two cultures, one beautiful love story. 🤍\n\nWhen a groom from Mexico and a bride from China come together, a wedding becomes more than a celebration, it becomes a meaningful blend of traditions, families, and heritage. From honoring cultural customs to creating new memories together, every detail reflected their unique journey and the life they are building as one.\n\nAt BWEDDINGS, we love designing multicultural weddings that celebrate what makes each couple unique while creating a seamless and unforgettable guest experience.\n\nCoordination: @bweddingschicago\nCatering: @cocinafusioncatering\nPhoto: @geneyoon\nFlorals: @juliettanfloraldesign \nVenue: @bridgeportartcenter\n\n*\n*\n*\n*\n*\n#ChicagoLuxuryWeddingPlanner #LuxuryWeddingPlannerChicago #ChicagoWeddingPlanner #BWEDDINGS #ChicagoWeddingDesign'
- hashtags: chicagoluxuryweddingplanner, luxuryweddingplannerchicago, chicagoweddingplanner, bweddings, chicagoweddingdesign
- mentions: bweddingschicago, cocinafusioncatering, geneyoon, juliettanfloraldesign, bridgeportartcenter
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `EXCLUDE` (`vendor_marketing_generic`) — _'At BWEDDINGS we love designing multicultural weddings' — brand/portfolio voice, no couple named or dated event._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 5. https://www.instagram.com/p/DbqWK0BERcM/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.75**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): "Megan & Sir Marcus Wedding" / capturing your "I do"
- **is_real_wedding** (caption): Named couple Megan & Sir Marcus with explicit statement 'capturing your I do' and 'such a special milestone'
- **is_chicago** (caption): 'in the heart of Chicago!'
- **is_credible_source** (account_category): Posting account is the photographer's own profile, account_archetype_prior wedding_photographer confidence 0.98

**Account classification** (@takeamomentphotography): archetype=`wedding_photographer` (confidence=0.98, is_wedding_industry=true)
- **Account is a wedding photographer with primary business in wedding photography services** (caption): Multiple captions explicitly reference wedding photography work: 'Megan & Sir Marcus Wedding', 'As a wedding photographer, I love capturing', engagement shoots, and multicultural wedding traditions
- **Consistent focus on wedding and engagement content across recent posts** (caption): 6 of 6 sample captions are about weddings, engagements, or wedding-related events (Haldi & Mehndi, Greek wedding traditions)
- **Explicit self-identification as wedding photographer** (caption): Direct quote: 'As a wedding photographer, I love capturing not only the unforg...'
- **Specialization in multicultural wedding photography** (caption): Captions discuss photographing Haldi & Mehndi celebrations, Greek wedding traditions, and other cultural ceremonies
- **Chicago-based wedding photography business** (caption): Multiple references to Chicago locations (Chicago Cultural Center, Michigan Avenue, Adler Planetarium, #chicagowedding hashtag)

**Raw post data (independent evidence for your own judgment):**
- caption: 'Megan & Sir Marcus Wedding 💍🤍\n\nSuch a wonderful day capturing your "I do" in the heart of Chicago! It was truly an honor to be part of such a special milestone and to document all of the love, laughter, and unforgettable moments you shared.\n\nThank you for trusting Take A Moment Photography to tell your story. Wishing you both a lifetime filled with love, happiness, and many beautiful milestones ahead. Congratulations again!! ✨📸\n\n#chicagoweddingphotographer \n#chicagophotographer'
- hashtags: chicagoweddingphotographer, chicagophotographer
- mentions: (none)
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Megan & Sir Marcus Wedding... capturing your I do in the heart of Chicago' — explicit real wedding + explicit Chicago event location_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 6. https://www.instagram.com/p/DN7SvYFjlhW/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.75**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): "This wedding was 🔥🦈🎶💍" and bridal party entrance details
- **is_real_wedding** (caption): Describes specific real event details (Bad Bunny song, sharks on dance floor) plus multi-role vendor credit stack: Venue @meridianbanquets and DJ @djpersist tied to this specific event
- **is_chicago** (location_tag): Location tag: Meridian Banquets
- **is_chicago** (cross_reference): Venue @meridianbanquets confirmed as venue vendor
- **is_credible_source** (mentions): Posting account is a wedding planner (@planner_luisr) crediting confirmed venue and DJ vendors
- **is_credible_source** (account_rating): DJ Persist vendor rating 4.9 (127 reviews), dj_music category

**Account classification** (@planner_luisr): archetype=`unclassified` (confidence=n/a, is_wedding_industry=null)

**Raw post data (independent evidence for your own judgment):**
- caption: 'Bad Bunny in the background, sharks on the dance floor! This wedding was 🔥🦈🎶💍\n\nWedding Tip: When planning your bridal party entrance, make it fun! Choose a song that truly hypes up the crowd and sets the tone for the night. Energy matters—start strong and unforgettable!\n\nVendor Love: \n\nVenue: @meridianbanquets\nDj: @djpersist \n\n#bridalpartyentrance #badbunnyboda #weddingvibes #bodalatina #weddingdj #wedding #weddingplanner #latinowedding #bodas \n#weddingtips #futurebride #futuregroom'
- hashtags: bridalpartyentrance, badbunnyboda, weddingvibes, bodalatina, weddingdj, wedding, weddingplanner, latinowedding, bodas, weddingtips, futurebride, futuregroom
- mentions: meridianbanquets, djpersist
- location_tag: Meridian Banquets

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _real specific event detail ('Bad Bunny... sharks on the dance floor'), named venue Meridian Banquets, despite generic tip framing — weak Chicago confirmation_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 7. https://www.instagram.com/p/C1-sqv4LCx6/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.82**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Caption references 'Shaina & Joshua Part 2' with portraits, consistent with wedding photography series
- **is_real_wedding** (caption): Named couple Shaina & Joshua with personal narrative tied to photographer's own history at the location, implying a real booked event
- **is_chicago** (caption): Caption explicitly states 'Oak Park' as the location of the portraits
- **is_credible_source** (account_category): Posting account is the photographer's own profile, account_archetype_prior is wedding_photographer with 0.99 confidence
- **is_credible_source** (account_bio): This is the vendor's own profile posting, not a repost

**Account classification** (@samschultzphotography): archetype=`wedding_photographer` (confidence=0.99, is_wedding_industry=true)
- **Account exclusively documents weddings as primary business** (caption): All 6 sample captions describe wedding photography work with couple names and wedding-specific details
- **Self-identifies as wedding photographer** (caption): Every caption includes #chicagoweddingphotographer hashtag
- **Consistent wedding photography portfolio** (caption): Captions reference multiple couples (Caroline & Izzy, Addi & Courtney, Molly & Jon, Justin & Ben, Morgan & Shaan, Abra & Len) with personal reflections on their wedding days
- **Google Places category aligns with actual business** (account_category): Places category 'photographer' matches the wedding photography specialization evident in posts

**Raw post data (independent evidence for your own judgment):**
- caption: 'Shaina & Joshua Part 2: Oak Park. These portraits were taken about 100 ft from the building where my parent’s restaurant La Bella Pasteria used to be. La Bella was my first job and I spent countless hours there serving some of the best food I’ve ever tasted. It closed down in 2020, so getting to go back to such an meaningful place with a new purpose was truly something else. 💜\n#chicagoweddingphotographer'
- hashtags: chicagoweddingphotographer
- mentions: (none)
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Shaina & Joshua' explicit Oak Park, IL (Chicago suburb) + personal real narrative_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 8. https://www.instagram.com/p/DZsBKcGBpBy/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.82**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Emily & Aaron 🩵 coming soon…. with vendor tags for events, videography, planning, band, and venue
- **is_real_wedding** (mentions): Named couple Emily & Aaron plus multi-role vendor credit stack: @thebashevents (planning), @visiproductions (video), @inesandmarieevents (events), @rendezvousbands (band), @knollwoodcc1925 (venue) - 5 distinct wedding roles
- **is_chicago** (location_tag): Location tag: Knollwood Country Club
- **is_credible_source** (cross_reference): Posting account is videography/production company (Blue Racer Productions) crediting multiple vendors including confirmed vendor @rendezvousbands

**Account classification** (@blueracerproductions): archetype=`unclassified` (confidence=n/a, is_wedding_industry=null)

**Raw post data (independent evidence for your own judgment):**
- caption: 'Emily & Aaron 🩵\ncoming soon….\n\n@thebashevents \n@visiproductions \n@inesandmarieevents \n@rendezvousbands \n@knollwoodcc1925'
- hashtags: (none)
- mentions: thebashevents, visiproductions, inesandmarieevents, rendezvousbands, knollwoodcc1925
- location_tag: Knollwood Country Club

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Emily & Aaron coming soon', real vendor stack, Knollwood Country Club (likely Lake Forest, IL North Shore club) — moderate confidence on Chicago_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 9. https://www.instagram.com/p/DWRAAC_DnTN/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.83**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Photos of loved ones reserved the back row and one front-row seat for the wedding ceremony
- **is_real_wedding** (caption): Congratulations to Nicholle & Michael
- **is_chicago** (location_tag): location_tag: Loft on Lake (Chicago venue)
- **is_credible_source** (account_category): Posting account is the venue's own verified profile, vendor_category venue, 4.7 rating with 170 reviews

**Account classification** (@loftonlake): archetype=`wedding_venue` (confidence=0.92, is_wedding_industry=true)
- **Primary business is wedding hosting and event venue rental** (caption): Multiple captions explicitly reference weddings as a core offering: 'planning a wedding', 'dog wedding fashion show', 'wedding ceremony to reception', 'wedding design', 'chicagowedding'
- **Venue-specific amenities and infrastructure described for wedding use** (caption): Detailed descriptions of wedding-specific features: sheer drape room divider for ceremony-to-reception transitions, 60ft skylight, greenery included in rentals, pet-friendly policies for wedding guests
- **Active engagement with wedding industry ecosystem** (caption): Hosts Wedding Recyclery event, partners with @sustainableeventscollective, references catering and event vendors, demonstrates wedding-industry awareness
- **Consistent wedding-focused messaging across recent posts** (caption): Of 6 recent captions, 4 explicitly mention weddings or wedding-specific use cases; hashtags include #chicagoweddings, #weddingdesign, #weddingschicago
- **Google Places category aligns with behavioral evidence** (account_category): Categorized as 'venue' and captions confirm primary business is event/wedding venue rental

**Raw post data (independent evidence for your own judgment):**
- caption: 'In loving memory seating 💒 Photos of loved ones reserved the back row and one front-row seat for the wedding ceremony 💕Congratulations to Nicholle & Michael 💕 #WeddingDesign #WeddingInspo #venueinspo #weddingideas #VenueGoals'
- hashtags: WeddingDesign, WeddingInspo, venueinspo, weddingideas, VenueGoals
- mentions: (none)
- location_tag: Loft on Lake

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Congratulations to Nicholle & Michael', specific real ceremony detail (memorial seating), venue is the account itself_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 10. https://www.instagram.com/p/C9vrKIqvivh/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.85**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Just married 💕
- **is_real_wedding** (caption): Thank you Tim & Jenn for allowing us to be part of your beautiful day!
- **is_chicago** (location_tag): location_tag: Chicago, Illinois
- **is_credible_source** (account_rating): Vendor's own profile, catering business with 4.8 rating (105 reviews)

**Account classification** (@heartyboys): archetype=`wedding_other_vendor` (confidence=0.92, is_wedding_industry=true)
- **Account explicitly discusses wedding catering services and wedding-specific food planning** (caption): Multiple captions directly reference weddings: 'Service can make or break your wedding' (caption 3), 'Wedding dessert' and 'dessert table' for weddings (caption 4), 'grazing table' design for events (caption 2)
- **Google Places category confirms catering business** (account_category): google_places_category: caterer
- **High engagement and positive reputation in wedding industry** (account_rating): 4.8 rating with 105 reviews indicates established, well-regarded vendor
- **Content strategy centers on wedding event planning and execution** (caption): Captions discuss wedding-specific elements (service quality, dessert tables, grazing tables, guest experience) rather than general cooking or restaurant content
- **Primary business is wedding services, not general catering or hospitality** (caption): Wedding references appear in 3 of 6 sample captions; content focuses on event design and guest experience rather than restaurant operations or general food service

**Raw post data (independent evidence for your own judgment):**
- caption: 'Just married 💕\n\nThank you Tim & Jenn for allowing us to be part of your beautiful day! \n\n📸 @weddingpoppins \n\n#HeartyBoys'
- hashtags: HeartyBoys
- mentions: weddingpoppins
- location_tag: Chicago, Illinois

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Just married... Thank you Tim & Jenn' real named couple, Chicago location_tag._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 11. https://www.instagram.com/p/Cu7HpSpu9T9/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.85**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (hashtags): hashtag #cafebrauerwedding and #chicagowedding combined with named couple caption
- **is_real_wedding** (caption): Caption names a specific couple: 'Haroula & Oliver'
- **is_chicago** (location_tag): Location tag: Cafe Brauer (Chicago venue)
- **is_credible_source** (account_rating): Posting account is the photographer's own profile, 5-star rated with 47 reviews, category photographer

**Account classification** (@angelareneephotography): archetype=`wedding_photographer` (confidence=0.95, is_wedding_industry=true)
- **Account explicitly identifies as a Chicago wedding photographer** (caption): #chicagoweddingphotographer hashtag in caption
- **Account regularly posts engagement session content** (caption): #engagementsession hashtag with seasonal reference
- **Account collaborates with wedding industry vendors** (caption): Tagged collaborators include @afresheventco (event planner), @chicagoculturalcenter (venue), @joannabartistry (makeup), @eleganteventlighting (lighting), @jandlcatering (catering), @bou_k_designco (design)
- **Google Places category aligns with account behavior** (account_category): Photographer category matches wedding photography focus
- **High rating with substantial review volume** (account_rating): 5.0 rating with 47 reviews indicates established wedding photography business

**Raw post data (independent evidence for your own judgment):**
- caption: 'Haroula & Oliver'
- hashtags: chicagoweddingphotographer, chicago, chicagowedding, angelareneephotography, cafebrauerwedding
- mentions: (none)
- location_tag: Cafe Brauer

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Haroula & Oliver' real named couple, Cafe Brauer (real Chicago venue) location_tag, wedding-branded hashtag._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 12. https://www.instagram.com/p/DT_gF_miTJz/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.85**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): dj + photo / artists for every moment... w + t \ 10.4.24 with vendor credit stack
- **is_real_wedding** (caption): Multi-role vendor credit stack: DJ (@djdemchuk), photographers (thais fry, @takenbytarin), planner (@tempriselaine with @glowingmomentsevents), venue (@thejoinerychicago) all tied to specific couple initials 'w + t' and date '10.4.24'
- **is_chicago** (cross_reference): Venue credited as @thejoinerychicago, confirmed Chicago venue 'The Joinery' in metro
- **is_credible_source** (cross_reference): Posting account @cageandaquarium is confirmed in-metro DJ vendor per known_vendor_mentions; venue and planner also confirmed vendors
- **event_date** (caption): w + t \ 10.4.24

**Account classification** (@cageandaquarium): archetype=`unclassified` (confidence=n/a, is_wedding_industry=null)

**Raw post data (independent evidence for your own judgment):**
- caption: 'dj + photo \\ artists for every moment.✌️🧡🧡\n\n🪩 djs who mix by ear to pack your dance floor.\n📷 photographers who capture every raw, beautiful detail.\n🎬 filmmakers who craft the way it felt.\n🤳 creators who understand the soul of a celebration.\n\ncage + aquarium\nartists for every moment.\n\nw + t \\ 10.4.24\n\n🎧: @djdemchuk with @cageandaquarium \n📸: thais fry and @takenbytarin with @cageandaquarium \n📋: @tempriselaine with @glowingmomentsevents\n🏠: @thejoinerychicago \n\n📲 DM us about our double when you book dj + photography.💥'
- hashtags: (none)
- mentions: djdemchuk, cageandaquarium, takenbytarin, tempriselaine, glowingmomentsevents, thejoinerychicago
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _Dated real event ('w + t \ 10.4.24'), full DJ/photo/planner vendor stack, The Joinery Chicago venue._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 13. https://www.instagram.com/p/C_vmC5BxxXF/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.87**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Jenna and Andy's wedding did not fall short with romance and glam!
- **is_real_wedding** (caption): Named couple Jenna and Andy explicitly tied to 'wedding'; multi-role vendor credit stack (florist, photographer, lighting, cake, stationery = 5 roles)
- **is_chicago** (location_tag): Location tag: The Armour House
- **is_credible_source** (account_category): Posted by @flourishcakedesign, cake vendor, repost credit from @christinacurrieevents (planner)
- **is_credible_source_corroboration** (cross_reference): flourishcakedesign and steraclepress confirmed in_metro true in known_vendor_mentions

**Account classification** (@flourishcakedesign): archetype=`wedding_other_vendor` (confidence=0.95, is_wedding_industry=true)
- **Account specializes in custom wedding cakes with elaborate sugar flower designs** (caption): All 6 captions explicitly reference wedding cakes, wedding events, and cake design for weddings. Captions mention 'wedding last weekend', 'anniversary', 'cake cutting moment', 'chicagowedding #chicagoweddingcake', and 'spring & summer stunners' (wedding season planning).
- **Primary business is wedding cake design and creation** (caption): Consistent pattern across all posts: detailed descriptions of custom cake designs for specific weddings, collaboration with wedding planners (@renny.events), and references to wedding-specific design consultations. Posts showcase finished cakes at weddings with congratulations to couples.
- **Google Places category is 'baker' but account is wedding-focused** (account_category): While the Places category is generic 'baker', the account's own content demonstrates that the primary business is wedding cakes, not general baking. This is a case where Places category is too broad.
- **Located in Chicago area and serves Chicago wedding market** (caption): Explicit hashtag #chicagowedding and #chicagoweddingcake in caption [4], references to 'north shore of Lake Michigan' and 'Palmer House Hotel' (Chicago landmark).

**Raw post data (independent evidence for your own judgment):**
- caption: 'Posted @withregram • @christinacurrieevents Oh how the details make the wedding! Gorgeous stationery, flowers, cake, lighting, etc. Jenna and Andy’s wedding did not fall short with romance and glam!\n\n@anthonygowderdesigns \n@annkamphoto \n@eleganteventlighting \n@flourishcakedesign \n@steraclepress'
- hashtags: (none)
- mentions: withregram, christinacurrieevents, anthonygowderdesigns, annkamphoto, eleganteventlighting, flourishcakedesign, steraclepress
- location_tag: The Armour House

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Jenna and Andy's wedding', full vendor stack, The Armour House (Lake Bluff, IL — Chicago North Shore)_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 14. https://www.instagram.com/p/DV8_5OdmgE0/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.88**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Real Weddings | Kayla’s Effortlessly Glamorous Bridal Look - From ceremony to reception
- **is_real_wedding** (caption): Named bride 'Kayla' with full multi-role vendor credit stack: Photographer, Decor, Flowers, Band, Venue, Hair/Makeup (6 distinct roles)
- **is_chicago** (location_tag): location_tag: Chicago, Illinois; venue @butterfieldcc_grounds (Butterfield Country Club, Chicago area)
- **is_credible_source** (account_rating): Posting account is vendor's own profile, Google rating 4.9 (198 reviews), category hair_makeup
- **is_credible_source_corroboration** (cross_reference): known_vendor_mentions includes confirmed vendors: windycityglam (hair), phillips_flowers (florist), bluewaterkingsband (musician), butterfieldcc_grounds (venue)

**Account classification** (@windycityglam): archetype=`wedding_other_vendor` (confidence=0.95, is_wedding_industry=true)
- **Account specializes in bridal hair and makeup services** (account_category): Google Places name explicitly states 'Bridal Wedding Hair & Makeup Artists'
- **All recent captions focus on bridal/wedding-specific services and styling** (caption): Every caption discusses bridal makeup looks, bridal hairstyles, bride booking, or bridal trial consultations
- **Account actively markets to brides and wedding planning** (caption): Repeated CTAs: 'Booking 2027 brides', 'Booking 2026 brides', 'Want flawless bridal hair and makeup', 'bridal trial'
- **High engagement and trust signals** (account_rating): 4.9 rating with 198 reviews indicates strong reputation in wedding services
- **Primary business is wedding-focused** (caption): No captions mention non-wedding services; all content is bridal-specific styling advice and booking

**Raw post data (independent evidence for your own judgment):**
- caption: 'Real Weddings | Kayla’s Effortlessly Glamorous Bridal Look✨\n\nKayla’s bridal style struck the perfect balance — natural yet iconic. Her glowing skin and soft winged liner enhanced her features with subtle definition, while classic Hollywood waves added volume, movement, and that timeless touch of glam.\n\nFrom ceremony to reception, her look stayed polished and camera-ready, proving that effortless beauty is all about thoughtful detail.\n\n💍  Booking 2027 brides!\xa0 Check if your date is still available - click link in bio @WindyCityGlam 🫶🏼 \n\nPhotographer: @stephanie_lang_photography_ \nDecor: @elev8events & @studiocynth \nFlowers: @phillips_flowers \nBand: @bluewaterkingsband\nVenue: @butterfieldcc_grounds \nhair makeup: @WindyCityGlam \n\n #chicagomakeupartists #chicagoweddinghairstylist #BridalInspo #NaturalMakeup #realweddings'
- hashtags: chicagomakeupartists, chicagoweddinghairstylist, BridalInspo, NaturalMakeup, realweddings
- mentions: WindyCityGlam, stephanie_lang_photography_, elev8events, studiocynth, phillips_flowers, bluewaterkingsband, butterfieldcc_grounds
- location_tag: Chicago, Illinois

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Real Weddings | Kayla's Effortlessly Glamorous Bridal Look' — real named bride, full vendor stack, Butterfield Country Club venue (Chicago-area)_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 15. https://www.instagram.com/p/DXZ2Sw6Dxc3/

**Audit bucket:** Low-confidence INCLUDE  
**Why selected:** INCLUDE decision, but confidence is on the low end for this run — worth checking whether the model is being appropriately cautious or is still over-crediting thin evidence.

**Classifier decision:** `INCLUDE`  confidence **0.88**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**is_wedding=true  is_real_wedding=true  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Truly the most joyful day! with full vendor credit stack for a wedding event
- **is_real_wedding** (caption): Multi-role vendor credit stack: venue, venue management/bar, photographer, design, catering, florals, ceremony music, entertainment (8 distinct roles) consistent with a booked real event
- **is_chicago** (location_tag): location_tag: Bridgeport Art Center; hashtags #chicagovenue #chicagowedding #chicagoweddingvenue
- **is_credible_source** (cross_reference): Posting account is the venue's own verified profile @bridgeportartcenter, confirmed in known_vendor_mentions as in_metro venue

**Account classification** (@bridgeportartcenter): archetype=`venue_non_wedding_primary` (confidence=0.85, is_wedding_industry=false)
- **Primary business is art center and gallery space, not wedding services** (caption): Majority of captions (4 of 6) focus on Open Studios events, art exhibitions, and juried art competitions with no wedding mention
- **Wedding hosting is secondary/occasional use case** (caption): Only 2 of 6 captions mention weddings; both are wedding showcase posts featuring the venue as one vendor among many, not promotional content from the venue itself
- **Google Places category 'venue' is overly broad** (account_category): Account self-identifies as art center with galleries, studios, and sculpture garden—a multi-purpose event space that CAN host weddings but is primarily an arts organization
- **High rating reflects general venue quality, not wedding-specific expertise** (account_rating): 4.8 rating (73 reviews) is strong but does not indicate primary wedding business focus

**Raw post data (independent evidence for your own judgment):**
- caption: 'Truly the most joyful day! ✨\n\n•\n\nVenue: @bridgeportartcenter - Sculpture Garden Gallery \nVenue Management & Bar: @venuelogic \nPhotographer: @colettemariephoto \nDesign: @art_imagination \nCatering: @paramountevents \nFlorals: @f4dweddings @flowersfordreams \nCeremony Music: @cloudgatequartet \nEntertainment: @bashbeats_music \n\n•\n\n#bridgeportartcenter #chicagovenue #chicagowedding #chicagoweddingvenue #chicagoweddings'
- hashtags: bridgeportartcenter, chicagovenue, chicagowedding, chicagoweddingvenue, chicagoweddings
- mentions: bridgeportartcenter, venuelogic, colettemariephoto, art_imagination, paramountevents, f4dweddings, flowersfordreams, cloudgatequartet, bashbeats_music
- location_tag: Bridgeport Art Center

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Truly the most joyful day' — full 8-category real vendor stack at Bridgeport Art Center, a confirmed real Chicago venue_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 16. https://www.instagram.com/p/C2u_p5OuhS3/

**Audit bucket:** REVIEW case  
**Why selected:** Model itself said REVIEW — sampled across the confidence range to show the full spread of what "genuinely uncertain" looks like today, from the model's worst all the way to its most-confident-REVIEW cases.

**Classifier decision:** `REVIEW`  confidence **0.3**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=true  is_real_wedding=null  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (hashtags): weddingday, dalcywedding hashtags
- **is_chicago** (hashtags): chicago hashtag and thedalcy (Chicago venue) reference
- **is_credible_source** (account_category): account_archetype_prior wedding_photographer 0.95, 5-star rated photographer
- **is_real_wedding_insufficient** (caption): caption is just 'touch up 💄' with venue hashtag #thedalcy/#dalcywedding - no named couple or explicit wedding statement, just venue-branded hashtag and generic phrase

**Account classification** (@angelareneephotography): archetype=`wedding_photographer` (confidence=0.95, is_wedding_industry=true)
- **Account explicitly identifies as a Chicago wedding photographer** (caption): #chicagoweddingphotographer hashtag in caption
- **Account regularly posts engagement session content** (caption): #engagementsession hashtag with seasonal reference
- **Account collaborates with wedding industry vendors** (caption): Tagged collaborators include @afresheventco (event planner), @chicagoculturalcenter (venue), @joannabartistry (makeup), @eleganteventlighting (lighting), @jandlcatering (catering), @bou_k_designco (design)
- **Google Places category aligns with account behavior** (account_category): Photographer category matches wedding photography focus
- **High rating with substantial review volume** (account_rating): 5.0 rating with 47 reviews indicates established wedding photography business

**Raw post data (independent evidence for your own judgment):**
- caption: 'touch up 💄'
- hashtags: dalcywedding, chicago, thedalcy, chicagomakeupartist, weddingday
- mentions: (none)
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _'touch up' only; #dalcywedding hashtag names a real Chicago venue but no couple or real-event narrative._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 17. https://www.instagram.com/p/C6fMOPyrQHc/

**Audit bucket:** REVIEW case  
**Why selected:** Model itself said REVIEW — sampled across the confidence range to show the full spread of what "genuinely uncertain" looks like today, from the model's worst all the way to its most-confident-REVIEW cases.

**Classifier decision:** `REVIEW`  confidence **0.4**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=true  is_real_wedding=null  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (hashtags): #brideandgroom #weddingportraits #chicagowedding
- **is_chicago** (location_tag): The Langham, Chicago
- **is_credible_source** (account_bio): vendor_category photographer, rating 4.9 (49 reviews), account_archetype_prior wedding_photographer 0.98
- **is_real_wedding_insufficient** (caption): Caption only says 'Photo by Milan' with generic hashtags including #realwedding but no named couple or explicit statement this is a real booked wedding vs styled/editorial shoot

**Account classification** (@wsphotography.us): archetype=`wedding_photographer` (confidence=0.98, is_wedding_industry=true)
- **Account is a wedding photographer business** (caption): All 6 sample captions are exclusively about wedding photography work, featuring specific couple names and wedding details
- **Primary business is wedding services** (caption): Consistent use of wedding-specific hashtags (#chicagoweddingphotographer, #weddingchicago, #documentarywedding, #weddingportraits) across multiple posts
- **Specializes in Chicago wedding photography** (caption): Repeated references to Chicago weddings, Chicago brides, and Chicago-specific wedding photography in captions and hashtags
- **Google Places category aligns with actual business** (account_category): Google Places category 'photographer' matches the wedding_photographer archetype
- **High professional credibility** (account_rating): 4.9 rating with 49 reviews indicates established, well-regarded wedding photography business

**Raw post data (independent evidence for your own judgment):**
- caption: 'Photo by Milan\n#chicagoweddingphotographer #mywedd  #artweddingphotography #documentarywedding #chicagowedding #theknot #weddingwire # #beautifulbride #artportrait #weddingportraits #silhuette #brideandgroom #elegantwedding  #realwedding #fearlessphoto #weddingphoto #chicagonightphotography #artportrait #weddingwire #theknot #wsphotography #chicagobrides #chicagoweddings #nightweddingphotography #chicagonightphotography #boardoftradewedding #chicagoweddingphotographers  #chicagoweddingphotography'
- hashtags: chicagoweddingphotographer, mywedd, artweddingphotography, documentarywedding, chicagowedding, theknot, weddingwire, beautifulbride, artportrait, weddingportraits, silhuette, brideandgroom, elegantwedding, realwedding, fearlessphoto, weddingphoto, chicagonightphotography, wsphotography, chicagobrides, chicagoweddings, nightweddingphotography, boardoftradewedding, chicagoweddingphotographers, chicagoweddingphotography
- mentions: (none)
- location_tag: The Langham, Chicago

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _'Photo by Milan' plus hashtag spam; location_tag names a real venue (The Langham, Chicago) but no couple or real-event narrative._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 18. https://www.instagram.com/p/DOR4hmqkY5X/

**Audit bucket:** REVIEW case  
**Why selected:** Model itself said REVIEW — sampled across the confidence range to show the full spread of what "genuinely uncertain" looks like today, from the model's worst all the way to its most-confident-REVIEW cases.

**Classifier decision:** `REVIEW`  confidence **0.4**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=true  is_real_wedding=null  is_chicago=null  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): We are so ready to get this wedding celebration started tonight!
- **is_real_wedding** (caption): Caption references an actual event happening 'tonight' but gives no couple names or explicit statement it's their wedding, and no multi-role vendor stack
- **is_chicago** (location_tag): Location tag is 'Blumen Gardens', not confirmed to be in Chicago metro; vendor_city Chicago is the vendor's home base, not the event location
- **is_credible_source** (account_category): Posting account is a wedding videographer/entertainment vendor posting from own profile

**Account classification** (@premier.entertainment): archetype=`wedding_videographer` (confidence=0.85, is_wedding_industry=true)
- **Account provides entertainment/DJ services at weddings** (caption): Multiple captions reference 'rock your reception', 'Dance Floor', and 'celebrate' at wedding venues, indicating music/entertainment provision
- **Account operates a photobooth service called 'Roamer Photobooth'** (caption): Captions explicitly mention 'Roamer Photobooth capturing the moments' at weddings
- **Primary business is wedding entertainment/services** (caption): All 6 sample captions are exclusively about wedding celebrations at various venues; no non-wedding content
- **Recurring vendor at established wedding venues** (caption): References to returning to venues like Lincoln Farmstead and Cantigny suggest established wedding vendor relationships

**Raw post data (independent evidence for your own judgment):**
- caption: "We are so ready to get this wedding celebration started tonight!  Let's Go!"
- hashtags: (none)
- mentions: (none)
- location_tag: Blumen Gardens

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _'ready to get this wedding celebration started' but no couple named; Blumen Gardens location_tag is geographically ambiguous (Sycamore IL, outer Chicago exurbs)_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 19. https://www.instagram.com/p/DGlZblkTCl1/

**Audit bucket:** REVIEW case  
**Why selected:** Model itself said REVIEW — sampled across the confidence range to show the full spread of what "genuinely uncertain" looks like today, from the model's worst all the way to its most-confident-REVIEW cases.

**Classifier decision:** `REVIEW`  confidence **0.5**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=true  is_real_wedding=true  is_chicago=null  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): His and hers cakes... groom's cake is a fun way to showcase personality and a little extra flavor on the big day
- **is_real_wedding** (caption): Bride: @lizagfreeman, Planner: @an.gle_events, Cakes: @laloubakery - named bride plus multi-role vendor credit stack (photographer, planner, bakery)
- **is_credible_source** (account_category): posting account is the photographer's own profile, vendor_category photographer, archetype prior wedding_photographer 0.98
- **is_chicago** (location_tag): no location tag or city mention for the wedding itself; vendor_city Chicago is only the vendor's home base, not proof of event location

**Account classification** (@paulmorseweddings): archetype=`wedding_photographer` (confidence=0.98, is_wedding_industry=true)
- **Account exclusively posts wedding photography content** (caption): All 6 sample captions describe wedding events, ceremonies, and celebrations with explicit wedding context (e.g., 'this wedding had it all', 'their wedding day', 'send-off', 'Portraits that stand the test of time')
- **Primary business is wedding photography services** (caption): Consistent pattern of crediting self as photographer (@paulmorseweddings) across multiple wedding posts, collaborating with wedding planners, venues, and other wedding vendors
- **Google Places category aligns with actual business** (account_category): Places category 'photographer' matches the wedding_photographer archetype
- **Established wedding photography portfolio** (caption): Posts feature multiple different couples, venues (St. Louis Cathedral, Old Ursuline Convent, Old Fort Bay Club), and professional collaborations with named planners and vendors, indicating active wedding photography business

**Raw post data (independent evidence for your own judgment):**
- caption: 'His and hers cakes. \u2060A tradition with a sweet twist— the groom’s cake is a fun way to showcase personality and a little extra flavor on the big day.\u2060\n\u2060\nBride: @lizagfreeman\u2060\nPlanner: @an.gle_events\u2060\nCakes: @laloubakery'
- hashtags: (none)
- mentions: lizagfreeman, an.gle_events, laloubakery
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _real vendor stack (bride, planner, cakes named) but no location_tag, no Chicago signal in caption_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 20. https://www.instagram.com/p/DYFIs49jso_/

**Audit bucket:** REVIEW case  
**Why selected:** Model itself said REVIEW — sampled across the confidence range to show the full spread of what "genuinely uncertain" looks like today, from the model's worst all the way to its most-confident-REVIEW cases.

**Classifier decision:** `REVIEW`  confidence **0.55**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=true  is_real_wedding=true  is_chicago=null  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Nicole & Patrick trusted us with one of the biggest days of their lives... their wedding day
- **is_real_wedding** (caption): Named couple Nicole & Patrick explicitly tied to their wedding day, DJ vendor booked for the event
- **is_chicago_conflicting** (hashtags): Hashtags include #chicagowedding, #chicagolandwedding but also #wisconsinwedding and #indianawedding, no location tag on post
- **is_credible_source** (account_category): Posting account is vendor's own profile, @impulsedjs, DJ category business

**Account classification** (@impulsedjs): archetype=`wedding_videographer` (confidence=0.95, is_wedding_industry=true)
- **Account is a wedding DJ service** (caption): All 6 captions explicitly reference weddings, wedding receptions, dance floors, and couples' celebrations
- **Primary business is wedding services** (caption): Captions consistently use hashtags #weddingdj, #chicagoweddingdj, #chicagowedding and reference 'Impulse Entertainment' as the DJ service
- **Content focuses on wedding-specific moments and services** (caption): Posts describe packed dance floors, confetti moments, couple celebrations, and explicitly state 'This is exactly how wedding receptions should feel' and 'creating a night filled with unforgettable moments'
- **Account actively markets wedding services** (caption): Captions include calls-to-action like 'Ready to pack the dance floor at your next celebration? Let's make it unforgettable!' and 'Ready to make your event unforgettable? DM us today!'
- **Google Places category is accurate** (account_category): dj_music category aligns with the account being a DJ service

**Raw post data (independent evidence for your own judgment):**
- caption: 'There’s truly nothing better than hearing that a couple felt supported, celebrated, and able to fully enjoy their wedding day. 🤍\n\nNicole & Patrick trusted us with one of the biggest days of their lives, and being able to create a night filled with unforgettable moments, a packed dance floor, and memories they’ll carry forever means everything to our team!\n.\n.\n.\n#weddingdetails #chicagoweddingdj #chicagowedding #chicagoweddingreception #chicagodj #impulsedjs #chicago #weddingday #wedding #weddingdj #chicagobride #chicagogroom #chicagolanddj #chicagolandwedding #bride #groom #wisconsinwedding #indianawedding #weddingvendor #2027bride #2026bride'
- hashtags: weddingdetails, chicagoweddingdj, chicagowedding, chicagoweddingreception, chicagodj, impulsedjs, chicago, weddingday, wedding, weddingdj, chicagobride, chicagogroom, chicagolanddj, chicagolandwedding, bride, groom, wisconsinwedding, indianawedding, weddingvendor, 2027bride, 2026bride
- mentions: (none)
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Nicole & Patrick trusted us', real specific narrative, heavy Chicago-market hashtags, no location_tag_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 21. https://www.instagram.com/p/CTLiATdj0fV/

**Audit bucket:** Borderline EXCLUDE (near decision boundary)  
**Why selected:** EXCLUDE decision with confidence closest to the 0.5 midpoint — the cases where a small policy nudge could most plausibly flip the outcome.

**Classifier decision:** `EXCLUDE`  confidence **0.68**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=null  is_real_wedding=false  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_credible_source** (account_category): vendor_category photographer, rating 4.9 (49 reviews), vendor's own profile posting
- **is_chicago** (location_tag): location_tag: Milton Lee Olive Park Beach (Chicago)
- **is_wedding_ambiguous** (hashtags): hashtags include both chicagoweddingphotographer and chicagoengagementphotography/engagementshooting, suggesting this could be an engagement shoot not a wedding
- **no_real_wedding_evidence** (caption): caption is only 'Photo By Milan' with no couple name or statement that a wedding occurred

**Account classification** (@wsphotography.us): archetype=`wedding_photographer` (confidence=0.98, is_wedding_industry=true)
- **Account is a wedding photographer business** (caption): All 6 sample captions are exclusively about wedding photography work, featuring specific couple names and wedding details
- **Primary business is wedding services** (caption): Consistent use of wedding-specific hashtags (#chicagoweddingphotographer, #weddingchicago, #documentarywedding, #weddingportraits) across multiple posts
- **Specializes in Chicago wedding photography** (caption): Repeated references to Chicago weddings, Chicago brides, and Chicago-specific wedding photography in captions and hashtags
- **Google Places category aligns with actual business** (account_category): Google Places category 'photographer' matches the wedding_photographer archetype
- **High professional credibility** (account_rating): 4.9 rating with 49 reviews indicates established, well-regarded wedding photography business

**Raw post data (independent evidence for your own judgment):**
- caption: 'Photo By Milan'
- hashtags: chicagoweddingphotographer, chicagoengagementphotography, mywedd, wsphotography, artweddingphotography, documentarywedding, chicagowedding, theknot, weddingwire, beautifulbride, artportrait, engagementchicago, chicagoengagement, engagementshooting, luxorywedding, thecordinatedbride, realwedding, fearlessphoto, weddingphoto, chicagonightphotography
- mentions: (none)
- location_tag: Milton Lee Olive Park Beach

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _'Photo By Milan' only; hashtags contradict (mix engagement-session tags with 'realwedding'), real park location_tag but no confirmable real event._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 22. https://www.instagram.com/p/DSyotRiEbm-/

**Audit bucket:** Borderline EXCLUDE (near decision boundary)  
**Why selected:** EXCLUDE decision with confidence closest to the 0.5 midpoint — the cases where a small policy nudge could most plausibly flip the outcome.

**Classifier decision:** `EXCLUDE`  confidence **0.68**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=true  is_real_wedding=true  is_chicago=false  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): photos from some of our earliest weddings back in 2017 and 2018
- **is_real_wedding** (caption): references actual past weddings hosted at the venue, not styled content
- **is_credible_source** (account_bio): posting account is the venue itself, The Lytle House, vendor_category venue with 4.8 rating
- **is_chicago uncertain/likely false** (location_tag): vendor_city listed as Chicago is the business's Google Places address, but 'The Lytle House' is a known venue name not typically located in Chicago proper; no location_tag confirms wedding city beyond venue name

**Account classification** (@thelytlehouse): archetype=`wedding_venue` (confidence=0.98, is_wedding_industry=true)
- **Account exclusively posts wedding events hosted at their venue** (caption): All 6 sample captions feature specific wedding ceremonies/receptions with couple names, guest counts, timelines, and vendor credits
- **Primary business is wedding hosting, not general event space** (caption): Posts emphasize elopement packages, intimate/micro-wedding positioning, and detailed ceremony-to-reception timelines specific to wedding events
- **Consistent wedding-focused hashtags and messaging** (caption): Hashtags include #chicagoweddingvenue, #intimatewedding, #microwedding, #chicagoelopement, #weddingbudget, #weddingplanning
- **Google Places category aligns with actual business** (account_category): Category 'venue' is accurate; account demonstrates this is a wedding-primary venue, not a multi-purpose event space
- **High engagement and credibility in wedding space** (account_rating): 4.8 rating with 110 reviews; posts feature collaborations with Chicago wedding photographers, caterers, and other wedding vendors

**Raw post data (independent evidence for your own judgment):**
- caption: 'As 2025 comes to a close, we have spent some time looking back at photos from some of our earliest weddings back in 2017 and 2018…and this photo has always been a favorite ❤️'
- hashtags: (none)
- mentions: (none)
- location_tag: The Lytle House

**Existing dev_v1 hand-label (context, not authoritative):** `EXCLUDE` (`vendor_marketing_generic`) — _Retrospective portfolio recap of 'some of our earliest weddings back in 2017 and 2018', not one specific wedding._

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 23. https://www.instagram.com/p/C6HHo3AAH7x/

**Audit bucket:** Borderline EXCLUDE (near decision boundary)  
**Why selected:** EXCLUDE decision with confidence closest to the 0.5 midpoint — the cases where a small policy nudge could most plausibly flip the outcome.

**Classifier decision:** `EXCLUDE`  confidence **0.72**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `insufficient_evidence`
**is_wedding=null  is_real_wedding=false  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_credible_source** (account_bio): Posting account is Mark Trela Photography, a Chicago-based photographer with 5 stars/50 reviews, posting its own work
- **is_chicago** (hashtags): #chicagoengagement, #chicagomicrowedding, #chicagoweddingphotographer
- **not_real_wedding_evidence** (hashtags): #chicagoengagement hashtag suggests this may depict an engagement session rather than a wedding
- **insufficient_evidence_for_real_wedding** (caption): Only names 'Shayna and Naethan' with no explicit statement that a wedding occurred; conflicting hashtags (#chicagoengagement vs #chicagomicrowedding) make it unclear if this is an engagement shoot or a micro wedding

**Account classification** (@marktrelaphotography): archetype=`wedding_photographer` (confidence=0.99, is_wedding_industry=true)
- **Account is a wedding photographer whose primary business is wedding photography** (caption): All 6 recent captions are exclusively about wedding photography work, featuring specific couples, wedding days, and elopements
- **Consistent wedding photography focus across posts** (caption): Hashtags in every caption include #weddingphotographer, #chicagowedding, #chicagoweddingphotographer, #weddingphotography, #elopement
- **Professional wedding photographer with strong reputation** (account_rating): 5-star rating with 50 reviews indicates established, well-regarded wedding photography business
- **Google Places category aligns with actual business** (account_category): Google Places category 'photographer' is accurate and supported by all caption evidence
- **Reflective, professional voice about wedding photography craft** (caption): Captions discuss photography philosophy, location scouting, and client relationships (e.g., 'I stopped overthinking about the locations')

**Raw post data (independent evidence for your own judgment):**
- caption: 'Shayna and Naethan\n. \n#chicagoengagement #chicagomicrowedding #chicagoweddingphotographer'
- hashtags: chicagoengagement, chicagomicrowedding, chicagoweddingphotographer
- mentions: (none)
- location_tag: (none)

**Existing dev_v1 hand-label (context, not authoritative):** `REVIEW` (`insufficient_evidence`) — _'Shayna and Naethan' named couple but hashtags mix 'chicagoengagement' and 'chicagomicrowedding' — can't tell if this is engagement or wedding content_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 24. https://www.instagram.com/p/DWFGiZ6FXgD/

**Audit bucket:** Borderline EXCLUDE (near decision boundary)  
**Why selected:** EXCLUDE decision with confidence closest to the 0.5 midpoint — the cases where a small policy nudge could most plausibly flip the outcome.

**Classifier decision:** `EXCLUDE`  confidence **0.72**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `vendor_marketing_generic`
**is_wedding=true  is_real_wedding=false  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): Still obsessing over this fall wedding!
- **is_chicago** (location_tag): location_tag: Galleria Marchetti (Chicago venue)
- **is_credible_source** (account_category): posted by venue's own verified account @galleriamarchetti, vendor_category=venue, rating 4.5/379
- **is_real_wedding negative** (caption): caption pivots to marketing: 'perfect place to host year round events... still time to book your perfect fall event!' with no couple named, functioning as venue promo rather than a documented real couple's wedding
- **vendor credit stack insufficient** (mentions): only one vendor credited (photographer @brookeanddavid), not 3+ distinct roles

**Account classification** (@galleriamarchetti): archetype=`wedding_venue` (confidence=0.98, is_wedding_industry=true)
- **Account consistently posts wedding-specific content and uses wedding venue hashtags** (caption): All 6 captions feature #chicagoweddingvenue, #chicagowedding, or #weddingvenue; captions reference wedding moments like 'saying I do', cake cuts, and bride-focused celebrations
- **Account explicitly identifies as a wedding venue in hashtags and messaging** (caption): #chicagoweddingvenue appears in 5 of 6 posts; captions reference 'wedding venue' and 'weddingvenue' directly
- **Venue features are described in wedding context** (caption): Captions highlight 'La Pergola' as backdrop for 'special moments', 'fireplace patio' for celebration, and 'courtyard' for wedding guests
- **Google Places category aligns with behavioral evidence** (account_category): Categorized as 'venue' and all caption evidence confirms primary business is wedding hosting
- **High engagement and review count suggest established wedding venue business** (account_rating): 4.5 rating with 379 reviews indicates substantial wedding industry presence

**Raw post data (independent evidence for your own judgment):**
- caption: 'Still obsessing over this fall wedding! 😍 \n\nGalleria Marchetti is the perfect place to host year round events, 📩 still time to book your perfect fall event! \n\nPHOTOGRAPHER: @brookeanddavid \n\n#chicago #chicagowedding #photographer #fallwedding #2026bride #bride #chicagophotograper #galleriamarchetti #chicagoweddingvenue #weddingvenue #chicagoevents #chicagoeventvenue #eventvenue'
- hashtags: chicago, chicagowedding, photographer, fallwedding, 2026bride, bride, chicagophotograper, galleriamarchetti, chicagoweddingvenue, weddingvenue, chicagoevents, chicagoeventvenue, eventvenue
- mentions: brookeanddavid
- location_tag: Galleria Marchetti

**Existing dev_v1 hand-label (context, not authoritative):** `INCLUDE` — _'Still obsessing over this fall wedding!' Galleria Marchetti (extensively confirmed real Chicago venue), photographer credit, specific singular real-event reference_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---

## 25. https://www.instagram.com/p/CyUWMHfLwiF/

**Audit bucket:** Borderline EXCLUDE (near decision boundary)  
**Why selected:** EXCLUDE decision with confidence closest to the 0.5 midpoint — the cases where a small policy nudge could most plausibly flip the outcome.

**Classifier decision:** `EXCLUDE`  confidence **0.75**  (tier=expensive_model, model=anthropic/claude-sonnet-5)
**exclusion_reason:** `vendor_marketing_generic`
**is_wedding=true  is_real_wedding=false  is_chicago=true  is_credible_source=true**

**Classifier's evidence:**
- **is_wedding** (caption): 'Inquire about weddings, rehearsals, showers and more'
- **is_credible_source** (account_category): Posting account is venue's own verified profile, vendor_category venue, rating 4.7
- **is_chicago** (location_tag): location_tag: The Dalcy (Chicago venue), hashtags chicagoevent/chicagobride
- **is_real_wedding negative** (caption): Caption is generic promotional copy ('Inquire about weddings, rehearsals, showers and more') with vendor credit stack but no named couple or explicit statement this depicts an actual wedding event
- **vendor credits present but generic** (mentions): Planning: @clementinechicago Floral & design: @lifeinbloom Photo: @nicodemcreative

**Account classification** (@thedalcy): archetype=`wedding_venue` (confidence=0.95, is_wedding_industry=true)
- **Primary business is wedding hosting and planning** (caption): Multiple captions explicitly promote wedding services: 'Get married, have dinner then throw the best party', 'Host your ceremony, cocktail hour and reception all at @thedalcy', 'Start planning your 2027 wedding with us'
- **Consistent wedding-focused content strategy** (caption): 5 out of 6 recent posts are explicitly about weddings; posts feature wedding vendor collaborations (planners, photographers, florists, cake designers, etc.) and wedding-specific messaging
- **Venue category aligns with actual business model** (account_category): Google Places category 'venue' is accurate; account describes full wedding hosting capabilities (ceremony, cocktail hour, reception, dining)
- **Strong wedding industry positioning** (caption): Post [6] features vendor spotlights and collaboration with design partners, indicating The Dalcy positions itself as a primary wedding venue partner
- **High engagement and credibility** (account_rating): 4.7 rating with 76 reviews suggests established, well-regarded venue

**Raw post data (independent evidence for your own judgment):**
- caption: 'Timeless elegance with a touch of natures embrace🌿 Inquire about weddings, rehearsals, showers and more at @thedalcy via link in bio. // #thedalcy\n\nPhoto: @nicodemcreative \nPlanning: @clementinechicago \nFloral & design: @lifeinbloom'
- hashtags: events, eventspace, event, wedding, weddings, chicagoevent, chicagoeventspace, weddinginspo, bridetobe, weddinginspiration, weddingdecor, 2025bride, chicagobride, weddingideas, thedalcy
- mentions: thedalcy, nicodemcreative, clementinechicago, lifeinbloom
- location_tag: The Dalcy

**Existing dev_v1 hand-label (context, not authoritative):** `EXCLUDE` (`vendor_marketing_generic`) — _generic venue marketing with a vendor stack but no couple named, 'Inquire about weddings, rehearsals, showers' CTA framing_

**Your judgment:** _(fill in — real wedding? credible? Chicago? overall verdict?)_

---
