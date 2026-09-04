/**
 * Golden record v2 for Galleria Marchetti (vendor_id 7) — revised per 2026-08-12 feedback
 * on the v1 concept page, then again after a full pass reviewing v2 itself. Frozen/
 * self-contained on purpose (does not import v1's data.ts) so the two pages stay honestly
 * comparable side by side, not drifting together.
 *
 * Second-round additions:
 * - Real "Wedding Experiences" add-on menu (Garden Aperitivo Hour, Chef Experiences, Late
 *   Night Experiences, Reception Enhancements) — found on a page the crawler never visited,
 *   same crawl-coverage gap as the floor plans. Condensed to example items per category
 *   rather than the full exhaustive list (user feedback: too much to dump raw).
 * - Floor plan images grouped per space for an in-site lightbox instead of linking out.
 * - Policies restructured from pill chips to a plain checklist (label/value/stated).
 */

const capacityLabels = {
  seatedDining: "Seated",
  seatedWithDance: "Seated (w/ dance floor)",
  standingReception: "Cocktail (standing)",
};

export const marchetti = {
  vendorId: 7,
  placeId: "ChIJudKeYtIsDogRfWhiR7GzovE",
  photoNames: [
    "places/ChIJudKeYtIsDogRfWhiR7GzovE/photos/AWCwydjlzyMpRuNtfCp9VC3VFmuRig5DiIRe0_828W8vItEjA_pf8dxUeUfQjL5YUuS2vGuGzv3ZezbM4CAuLRqRAPrCPxcIRp8cJWYUVqf_vq-bKSqXkA9M1M8-fOYpFKqCsrf0BsVxZ8qqttS_KTE1TXeZJQFQu62nlWaXsuAuSXnW72sHYunvaASggfusPfeIkZKNgDmf11MxiKq4Ju7HiyKUWsf5Kepm5fYG8i5d7V9myGeNGpImf_CHG4XW_S9zMqjZ520Qofhu3wUdbIsO9JWQtlvgRB-oVEgJhCUB56bBJSQYrtXhxl4rkRs74ArwCXaGpc8HDxvZExSz6GiaCpIpvtOQNuYSHtAgCHzOOhq0IDO2xcm3uZAv156fcTwVP-A8EEl_odLe_ZDH9DG5DmvW9ETanic0ojZdHckq7yJweN08JsKYAf85y-KCgS8s",
  ],
  name: "Galleria Marchetti",
  categoryLabel: "Event Space",
  address: "825 W Erie St, Chicago",
  neighborhood: "River West",
  phone: "(312) 563-0495",
  website: "https://www.galleriamarchetti.com/",
  instagramHandle: "galleriamarchetti",
  instagramUrl: "https://www.instagram.com/galleriamarchetti",
  rating: 4.5,
  reviewCount: 379,
  about: "Galleria Marchetti is a garden oasis in the heart of Chicago, offering a timeless setting for weddings of every size. With two distinct event spaces, this enchanting urban oasis features elegant indoor spaces and romantic courtyards that adapt seamlessly to your vision.",
  photos: [
    "https://lh3.googleusercontent.com/place-photos/AJRVUZOIQUSzUtRwcoKwkNC3H58BCtvHkBfVU2IJUeKrZ-u8q5mJl_5W7-tqKNYNN6h3Sd_m_DDI70z1-y8v07nzvU1QhCp6CveBG9yoZfGNCjGP02QYIEVbiPzoksv7WHqGeVPq3aDtJQW5uWcrUHZ8RrgkKw=s4800-w1200",
    "https://lh3.googleusercontent.com/place-photos/AJRVUZO7R5qvBCPYgxrPOL20pNbIxBn9LBUR6krb4CgCt6hkB3hKeQ-LcGWarhqVvzGb1_qfracDCgMU_NUeXzvrnbaKtKjrk_HYfehhHqe7XfZcuQxV1dX0zX4fbp531PFOSvmPPlmDm2mtZhCg=s4800-w1200",
    "https://lh3.googleusercontent.com/place-photos/AJRVUZMdg1u2tPOQrX-fpKliwLqOncttYXU1U7nrixKuPVecz60qEGGhILYRxHdc36CPkFiIPF6fylif3SsH9c3jzTrx9uqGI6ev5lkH6l5V4ISrzjybh6c-IpnQdZCVK8zcimIxGgjghchv2Qisbpo=s4800-w1200",
  ],
  // Parking deliberately dropped: it's only in the Google Places listing, not stated anywhere
  // on galleriamarchetti.com — per feedback, if it's not on the venue's own site, don't show
  // it as a fact here (Places/reviews aren't trusted as a source for this).
  // `icon` is a lookup key resolved to a lucide icon in page.tsx (data files shouldn't import JSX).
  quickFacts: [
    { icon: "guests", label: "180–450 guests", note: "Across two bookable spaces; more if you book the entire venue." },
    { icon: "indoorOutdoor", label: "Indoor & outdoor", note: "Both spaces combine a tented/glass-enclosed room with an open-air courtyard or retractable roof." },
    { icon: "catering", label: "Catering & bar in-house", note: "No outside caterer option. Food & bar come from the venue's own kitchen." },
    { icon: "climate", label: "Heating & A/C", note: "Climate-controlled year-round in both spaces." },
  ],
  capacityLabels,
  entireVenueFees: [
    { day: "Friday", amount: 6000 },
    { day: "Saturday", amount: 9000 },
    { day: "Sunday", amount: 3000 },
  ],
  spaces: [
    {
      name: "The Pavilion",
      sqFt: 6000,
      // Verbatim from the venue's own site (galleriamarchetti.com/thepavilion) — the comma is theirs.
      description:
        "The larger of our two venues, is our three-space option featuring a lush courtyard, a beautiful old-world anteroom, and a state-of-the-art 6,000 sq ft tented ballroom with lighting, heating, and air conditioning.",
      includesSummary: "Il Cortile (courtyard), the tented ballroom, and the Montecatini Room (3,000 sq ft).",
      capacity: { seatedDining: 450, seatedWithDance: 375, standingReception: 900 },
      fees: [
        { day: "Friday", amount: 4000 },
        { day: "Saturday", amount: 6000 },
        { day: "Sunday", amount: 2000 },
      ],
      floorPlans: [
        { label: "East Courtyard: Ceremony & Cocktail Hour", imageUrl: "https://framerusercontent.com/images/IaDlK3og22dGjetrJJ2mYXMl7zA.jpg?width=792&height=612" },
        { label: "Dance Floor with Stage", imageUrl: "https://framerusercontent.com/images/NLtiiAwoPXzUn41RZttyAmSSLe0.jpg?width=792&height=612" },
        { label: "Banquet, With Stage", imageUrl: "https://framerusercontent.com/images/2pDBev1QBf1fmdQo2FJkvtkVeM.jpg?width=792&height=612" },
      ],
      sourceUrl: "https://www.galleriamarchetti.com/thepavilion",
    },
    {
      name: "La Pergola",
      sqFt: 3000,
      description:
        "Our intimate venue features a 3,000 sq ft glass-enclosed ballroom with Moroccan brass sconces, travertine flooring, heating, air conditioning, and a motorized retractable roof, creating a warm and elegant setting for unforgettable events.",
      includesSummary: "The Lucca Room (1,500 sq ft) and The Wedding Salon getting-ready space.",
      capacity: { seatedDining: 180, seatedWithDance: 150, standingReception: 250 },
      fees: [
        { day: "Friday", amount: 2000 },
        { day: "Saturday", amount: 3000 },
        { day: "Sunday", amount: 1000 },
      ],
      floorPlans: [
        { label: "Banquet Setup", imageUrl: "https://framerusercontent.com/images/EG7ddnTJ3taJz3T2B6s8KJE3Ws.jpg?width=792&height=612" },
        { label: "Cocktail Setup", imageUrl: "https://framerusercontent.com/images/yNcIWBw9Ef6t6w56lPqRmqwRa9E.jpg?width=792&height=612" },
        { label: "Reception with Dance Floor", imageUrl: "https://framerusercontent.com/images/inbGCvAhjXJgHr4HIdFLUCivSws.jpg?width=792&height=612" },
        { label: "Ceremony", imageUrl: "https://framerusercontent.com/images/dXRjrbrzVeZlH3vmo56egUhlvtQ.jpg?width=792&height=612" },
      ],
      sourceUrl: "https://www.galleriamarchetti.com/thepavilion",
    },
  ],
  // v1-style cards restored — comparison table was rejected as confusing.
  packages: [
    {
      key: "argento",
      name: "Argento",
      perGuest: 190,
      bar: "Villa Bar (5 hr)",
      inclusions: ["Four passed hors d'oeuvres", "Passed white wine & sparkling wine", "Tableside wine service & sparkling toast", "Three-course dinner", "Floor-length linens"],
    },
    {
      key: "oro",
      name: "Oro",
      perGuest: 235,
      bar: "Tenuta Bar (5 hr)",
      inclusions: ["Everything in Argento", "One signature cocktail", "One signature moment", "One chef experience", "Stage & Chiavari chairs"],
    },
    {
      key: "platino",
      name: "Platino",
      perGuest: 280,
      bar: "Riserva Bar (5 hr)",
      inclusions: ["Everything in Oro", "Two signature cocktails", "Two signature moments", "Two chef experiences", "Late-night Neapolitan pizza station", "Dance floor"],
    },
  ],
  additionalCosts: {
    productionFeePercent: 25,
  },
  // Real "Wedding Experiences" add-on menu — condensed with example items per category so a
  // price isn't just an abstract number, without dumping the full published list.
  experiences: [
    {
      category: "Garden Aperitivo Hour",
      blurb: "Elevate cocktail hour with the warmth of an Italian aperitivo.",
      tiers: [
        { name: "Signature Moments", price: "$12/guest", examples: ["Aperol Spritz Bar", "Limoncello Spritz Bar"] },
        { name: "Signature Experiences", price: "$20/guest", examples: ["Antipasti Station", "Live Fire Skewer Station"] },
      ],
    },
    {
      category: "Chef Experiences",
      blurb: "Interactive, chef-attended culinary moments during cocktail hour.",
      tiers: [{ name: "Chef Experiences", price: "$40/guest", examples: ["Coastal Crudo & Sushi Experience", "Wood-Fired Beef Tagliata Station"] }],
    },
    {
      category: "Late Night Experiences",
      blurb: "Keep the celebration going after dinner.",
      tiers: [
        { name: "Signature Moments", price: "$12/guest", examples: ["Italian Gelato Cart", "S'mores Station"] },
        { name: "Signature Experiences", price: "$20/guest", examples: ["Neapolitan Pizza Station", "Chicago Station"] },
      ],
    },
  ],
  // Rentals/enhancements — real per-space pricing, kept as a compact table rather than prose.
  enhancements: [
    { name: "Dance floor", pergola: "$625–$1,000", pavilion: "$1,725–$2,500" },
    { name: "Bistro lights", pergola: "$1,250–$2,250", pavilion: "$1,400–$4,400" },
    { name: "Chiavari chairs", pergola: "$10 each", pavilion: "$10 each" },
    { name: "Stage (per 4'×8' section)", pergola: "$175", pavilion: "$175" },
  ],
  // Standardized checklist, not pill chips — spell out what's known vs. not.
  policies: [
    { label: "Catering", value: "In-house only", stated: true },
    { label: "Bar", value: "In-house only", stated: true },
    { label: "Event insurance", value: "Not stated (please confirm)", stated: false },
    { label: "Music / noise curfew", value: "Not stated (please confirm)", stated: false },
    { label: "Deposit / payment schedule", value: "Not stated (please confirm)", stated: false },
  ],
  // Same shape/format for standard + venue FAQs so they render identically (per feedback).
  standardFaqs: [
    { question: "Is catering in-house, or can we bring our own caterer?", answer: "Exclusive in-house. Galleria Marchetti's own kitchen produces all food as part of the wedding packages, with no outside-caterer option." },
    { question: "Is event insurance required?", answer: "Not stated on their site. Confirm directly with the venue." },
    { question: "What's the deposit / payment schedule?", answer: "Not stated on their site. Confirm directly with the venue." },
    { question: "Is there a noise or music curfew?", answer: "Not stated on their site. Confirm directly with the venue." },
  ],
  faqs: [
    { question: "What size events can Galleria Marchetti accommodate?", answer: "Our venues are designed to host a wide range of events, from intimate gatherings to large-scale celebrations. Flexible indoor and outdoor spaces allow us to adapt layouts based on your guest count and event style." },
    { question: "Can we host both the ceremony and reception on-site?", answer: "Yes. Many couples choose to host their entire wedding experience at Galleria Marchetti, including ceremony, cocktail hour, and reception, creating a seamless flow for guests." },
    { question: "What happens if the weather doesn't cooperate?", answer: "Our venue offers indoor and outdoor options that allow for smooth transitions in the event of inclement weather, ensuring your celebration remains beautiful and uninterrupted." },
    { question: "Do you host weekday or evening events?", answer: "Yes. Galleria Marchetti welcomes weekday events and often offers seasonal incentives or special pricing for weekday bookings." },
    { question: "Is the venue suitable for corporate meetings and presentations?", answer: "Absolutely. Our spaces can be configured for meetings, presentations, and networking events, with layouts that support AV needs, guest flow, and professional gatherings." },
    { question: "Do you provide event planning or coordination support?", answer: "Our experienced team works closely with clients throughout the planning process, offering guidance on space selection, layout options, and event logistics to ensure a smooth experience." },
    { question: "Can we work with our own vendors?", answer: "To ensure a high level of quality and a seamless event experience, Galleria Marchetti works with a curated list of trusted vendors. Our team is happy to share approved options and guide you through selections that align with your vision while ensuring smooth execution on event day." },
    { question: "How do we get started?", answer: "The best first step is to reach out and tell us about your event. Our team will provide availability, capacity details, and next steps to help bring your vision to life." },
  ],
  photographers: [
    { name: "Brooke and David", url: "http://brookeanddavid.com" },
    { name: "Danielle Heinson Photography", url: "http://danielleheinson.com" },
    { name: "Fox + Ivory", url: "http://foxandivory.com" },
    { name: "Gerber + Scarpelli Photography", url: "http://gerberscarpelliweddings.com" },
    { name: "Ian Rempel Photography", url: "http://rempelphotography.com" },
  ],
  // Full RealWeddingPost shape — reused directly by the app's real RealWeddingsSection
  // component (imported from VenuesClient), not a custom-built grid.
  realWeddings: [
    {
      post_url: "https://www.instagram.com/p/DZsy-Lalc2t/",
      post_timestamp: "2026-06-18T01:11:32.000Z",
      mentions: ["kayleennyshellphotography"],
      likes_count: 14,
      image_url:
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/726432470_18552570166069058_1322375997990265924_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGVhE0geC4cS7a_Zl9mQ9FChomo04UGDz9t2NJyoQ4Ms91P3ctJqRd-a7tsZKUt2Kw&_nc_ohc=CHWjnltRffsQ7kNvwH72fdq&_nc_gid=g8fT-bXod8fsTE5mEQNc5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af__pc28ovDZdTBPrjJaBBJ7M82lkBzn-LT6iHQ4sEXM7Q&oe=6A38F5A0&_nc_sid=10d13b",
      images: [
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/726432470_18552570166069058_1322375997990265924_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGVhE0geC4cS7a_Zl9mQ9FChomo04UGDz9t2NJyoQ4Ms91P3ctJqRd-a7tsZKUt2Kw&_nc_ohc=CHWjnltRffsQ7kNvwH72fdq&_nc_gid=g8fT-bXod8fsTE5mEQNc5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af__pc28ovDZdTBPrjJaBBJ7M82lkBzn-LT6iHQ4sEXM7Q&oe=6A38F5A0&_nc_sid=10d13b",
        "https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/726432486_18552570178069058_5809524762842866304_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGVhE0geC4cS7a_Zl9mQ9FChomo04UGDz9t2NJyoQ4Ms91P3ctJqRd-a7tsZKUt2Kw&_nc_ohc=4RS3Zf3QdrUQ7kNvwE7UBs6&_nc_gid=g8fT-bXod8fsTE5mEQNc5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8tqvLT4szhJMGc1pEszunu4lLm6m4APx2RFiwLh0RKeQ&oe=6A38EB65&_nc_sid=10d13b",
      ],
      caption: "There is no better feeling than saying ‘I do’ surrounded by the people you love most 🤍",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DZIQMpfFT7i/",
      post_timestamp: "2026-06-03T20:35:01.000Z",
      mentions: ["sallyodonnellphotography"],
      likes_count: 28,
      image_url:
        "https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/716610256_18549232579069058_8406895133058604792_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-lga3-3.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gE4DTgU6xKo6t6O5zwbPnF-q9RjGOcSY_qcOwnf49tC-4OJwVws7jTj5QfTfj1YKRw&_nc_ohc=T4ndHt__PIMQ7kNvwFBiCN9&_nc_gid=WS0zfHn73x_5HNvSdepMQg&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_tb80JIsJRdVEFqZELBvMxo8ilMoKIoAuoerMRWo26Ag&oe=6A38F0E9&_nc_sid=10d13b",
      images: [
        "https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/716610256_18549232579069058_8406895133058604792_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-lga3-3.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gE4DTgU6xKo6t6O5zwbPnF-q9RjGOcSY_qcOwnf49tC-4OJwVws7jTj5QfTfj1YKRw&_nc_ohc=T4ndHt__PIMQ7kNvwFBiCN9&_nc_gid=WS0zfHn73x_5HNvSdepMQg&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_tb80JIsJRdVEFqZELBvMxo8ilMoKIoAuoerMRWo26Ag&oe=6A38F0E9&_nc_sid=10d13b",
        "https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/714303819_18549232588069058_811166229684264846_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-lga3-3.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gE4DTgU6xKo6t6O5zwbPnF-q9RjGOcSY_qcOwnf49tC-4OJwVws7jTj5QfTfj1YKRw&_nc_ohc=82AmlSIHOvgQ7kNvwHG-wjR&_nc_gid=WS0zfHn73x_5HNvSdepMQg&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af9JZD-MpPo5_4bOBS1JTNNX7YFr1Mvu9yoxsNp80qssGQ&oe=6A38E762&_nc_sid=10d13b",
      ],
      caption: "Walking into the Pavilion never gets old 🥰✨",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DZDYZX4lTgG/",
      post_timestamp: "2026-06-01T23:10:27.000Z",
      mentions: ["lindseykay_photography"],
      likes_count: 34,
      image_url:
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/711531321_18548774245069058_2770383815083348542_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=2lvKeQKB56QQ7kNvwFAlDl4&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_rbU-UgVILOekLq3L3WvgrDoVDQN7Mae4a7ON7opaVtg&oe=6A38EBE7&_nc_sid=10d13b",
      images: [
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/711531321_18548774245069058_2770383815083348542_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=2lvKeQKB56QQ7kNvwFAlDl4&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_rbU-UgVILOekLq3L3WvgrDoVDQN7Mae4a7ON7opaVtg&oe=6A38EBE7&_nc_sid=10d13b",
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/714823139_18548774254069058_2676811098927646795_n.jpg?stp=dst-jpg_s1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=XYieCSrjhN8Q7kNvwEioM3t&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_J2ohPKZ2i77y9M7xB-B_lBawZ30LF2YyNKEhS__p1sA&oe=6A38E3B8&_nc_sid=10d13b",
        "https://instagram.fhio2-1.fna.fbcdn.net/v/t51.82787-15/712504470_18548774263069058_4199382269554720602_n.jpg?stp=dst-jpg_p1080x1080_sh2.08_tt6&_nc_ht=instagram.fhio2-1.fna.fbcdn.net&_nc_cat=102&_nc_oc=Q6cZ2gFW09jsW8f70GoUDcrZU2xV1-PkucUhRyxD56rJM6_k2T8S9UD53odulgblT7ekk2I&_nc_ohc=8lqXNxpTqWMQ7kNvwFtC1hH&_nc_gid=iYwQvniLdjw17i7L4xIBiQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_6Xmf9-empfB-zstoeowBhR7k-mXAJAy2MeFz9dagwAw&oe=6A390066&_nc_sid=10d13b",
      ],
      caption: "Obsessed with this bright colored reception 💐",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DY7ihg3FWJo/",
      post_timestamp: "2026-05-29T22:05:01.000Z",
      mentions: ["emileemeador"],
      likes_count: 19,
      image_url:
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/709708878_18547983364069058_5765095130752624234_n.jpg?stp=dst-jpg_e35_s1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGm58FTDddE-PmYggiCJPN6aiEq8GNcyWJ3IMLqNwNIOpQJDpPyM9tk82Qe-vYEgEo&_nc_ohc=2TnFdGejlqkQ7kNvwGoflv4&_nc_gid=T3swg5MKCngyis5ZfwsesQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_wgHrHrhqNabwOKDlMFkcuivwcE99nuMtOKOd59Ixbjg&oe=6A38D1BC&_nc_sid=10d13b",
      images: [
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/709708878_18547983364069058_5765095130752624234_n.jpg?stp=dst-jpg_e35_s1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGm58FTDddE-PmYggiCJPN6aiEq8GNcyWJ3IMLqNwNIOpQJDpPyM9tk82Qe-vYEgEo&_nc_ohc=2TnFdGejlqkQ7kNvwGoflv4&_nc_gid=T3swg5MKCngyis5ZfwsesQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_wgHrHrhqNabwOKDlMFkcuivwcE99nuMtOKOd59Ixbjg&oe=6A38D1BC&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/709014479_18547983376069058_6827378750259830799_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gGm58FTDddE-PmYggiCJPN6aiEq8GNcyWJ3IMLqNwNIOpQJDpPyM9tk82Qe-vYEgEo&_nc_ohc=OeMiNco8FLgQ7kNvwFt6IkA&_nc_gid=T3swg5MKCngyis5ZfwsesQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_nmfmJXi0XRr7Gn0tTVT7y16lXlrx6QhMv5vhgeDp69Q&oe=6A38D23C&_nc_sid=10d13b",
      ],
      caption: "La Pergola is the perfect space to celebrate under the starry night sky ✨",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DY2VhvQlXq2/",
      post_timestamp: "2026-05-27T21:35:15.000Z",
      mentions: ["catycanon"],
      likes_count: 20,
      image_url:
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/708451069_18547479712069058_6556353182371314386_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=sYOyswsOD3wQ7kNvwGF9yVZ&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8o7dfQwH43OIQL-obNDO_zJmWZV1HXOUu-jjjGdFRK2Q&oe=6A38D392&_nc_sid=10d13b",
      images: [
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/708451069_18547479712069058_6556353182371314386_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=sYOyswsOD3wQ7kNvwGF9yVZ&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8o7dfQwH43OIQL-obNDO_zJmWZV1HXOUu-jjjGdFRK2Q&oe=6A38D392&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/710157659_18547479721069058_7093406707186093195_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=WfUIisdjc7EQ7kNvwHWza_c&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af9IbXJ2SkPRsgcZuwz2DoMvAVIPQrSvh9y1vP07IzkSRg&oe=6A38E5A0&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/708979733_18547479733069058_5844118200576021493_n.jpg?stp=dst-jpg_s1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFXGGwRmZMRmkmEzPmH_cmMoJGHxbvY8cfTwKmb5XAbr6o-yKaP8iCx-8xyY0uh_mQ&_nc_ohc=jYb4Fk9i1xAQ7kNvwEVAs9z&_nc_gid=U5YtiUxckO_CCYESrTh7oQ&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_RJSm17sZmi4hUeTcazamBBICQ8YOtXzX19L4eix_7fg&oe=6A38E514&_nc_sid=10d13b",
      ],
      caption: "Every step you take in Galleria Marchetti has a touch of our rich history!",
      post_type: "Sidecar",
    },
    {
      post_url: "https://www.instagram.com/p/DYzgn0JANJJ/",
      post_timestamp: "2026-05-26T19:14:29.000Z",
      mentions: [
        "mayahleephotography",
        "clementinechicago",
        "kyriecopelandfilms",
        "galleriamarchetti",
        "elizabethscottcompany",
        "flowerchild_floraldesign",
        "greenlinetalent",
        "highhatsecondline",
        "weddings826",
        "generationtux",
        "some.thingbluestudio",
      ],
      likes_count: 328,
      image_url:
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707781285_18054944306726607_3594396248535157128_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=Qux9ldGMRKoQ7kNvwFJjYUx&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_aBsvUDpsqLdT-aPX9ucZxtE68wGOG0hsDA4nom26ryg&oe=6A390152&_nc_sid=10d13b",
      images: [
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707781285_18054944306726607_3594396248535157128_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=Qux9ldGMRKoQ7kNvwFJjYUx&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af_aBsvUDpsqLdT-aPX9ucZxtE68wGOG0hsDA4nom26ryg&oe=6A390152&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707763835_18054944312726607_7067221347974530269_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=CivDlHQLhW8Q7kNvwEwFQnl&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af8FMkNhlphUYfL9ddSSeq-PDingmO1yjYF8rUuWdVHYoA&oe=6A38EBA4&_nc_sid=10d13b",
        "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/707617904_18054944324726607_4902927331398516576_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gHZ4dR8-_fAUvW1gPLgz203ioRCIRXSyEddFIS-WI7xDQ6Bk0qGrl4XhyBnogIHjz8&_nc_ohc=ASp-BvXEzSIQ7kNvwGqxDuR&_nc_gid=hJGUQe8DdbwlzLk_bLbSCw&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af-Xy-5R6nmA7rBi6YB8KytMskpeyocCG_hdAuH3cOfILg&oe=6A38EEFA&_nc_sid=10d13b",
      ],
      caption: "it’s always a great time with Carrie + Mike ❤️ the absolute best day with the best vibes!",
      post_type: "Sidecar",
    },
  ],
  sourcePages: [
    "https://www.galleriamarchetti.com/",
    "https://www.galleriamarchetti.com/weddings",
    "https://www.galleriamarchetti.com/contact",
    "https://www.galleriamarchetti.com/thepavilion",
    "https://www.galleriamarchetti.com/lapergola",
  ],
  lastVerified: "2026-08-12",
};

export type Marchetti = typeof marchetti;
