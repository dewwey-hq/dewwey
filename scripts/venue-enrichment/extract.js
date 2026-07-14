const cheerio = require("cheerio");
const {
  SOCIAL_PLATFORMS,
  IG_SKIP_PATHS,
  JUNK_EMAIL,
  JUNK_LINK_NAMES,
  JUNK_VENDOR_NAME,
  JUNK_VENDOR_URL,
  isValidEmail,
  isValidPhone,
  NETWORK_PAGE_KEYWORDS,
} = require("./constants");
const { guessCategory, guessSpecialty, guessRelationship, isVenueContactPage, useWeddingExtraction, classifyPageContext, pageHasWeddingFocus } = require("./classify");
const { normalizeUrl, sameSite } = require("./crawl");

function extractInstagramHandle(url) {
  try {
    const pathname = new URL(url).pathname.replace(/^\/|\/$/g, "");
    const handle = pathname.split("/")[0];
    if (!handle || IG_SKIP_PATHS.has(handle) || handle.startsWith("?")) return null;
    return handle.replace(/^@/, "");
  } catch {
    return null;
  }
}

function extractSocialFromHtml(html, pageUrl) {
  const found = new Map();
  const hrefRe = /href=["']([^"']{8,500})["']/gi;
  let match;
  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1];
    if (!href.startsWith("http")) continue;
    let platform = null;
    try {
      const hostname = new URL(href).hostname.replace(/^www\./, "");
      for (const p of SOCIAL_PLATFORMS) {
        if (p.domains.some((d) => hostname === d || hostname.endsWith("." + d))) {
          platform = p.name;
          break;
        }
      }
    } catch {
      continue;
    }
    if (!platform) continue;
    try {
      const u = new URL(href);
      const clean = `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/$/, "");
      if (!found.has(platform)) found.set(platform, new Set());
      found.get(platform).add(clean);
    } catch {
      // ignore
    }
  }

  const social = {};
  for (const [platform, urls] of found) {
    const list = [...urls];
    social[platform] = {
      urls: list,
      primary_url: list[0] ?? null,
      instagram_handle:
        platform === "instagram" && list[0] ? extractInstagramHandle(list[0]) : null,
    };
  }
  return social;
}

function extractContactFromHtml(html, pageUrl, options = {}) {
  const $ = cheerio.load(html);
  const emails = new Set();
  const phones = new Set();
  let contactPageUrl = null;
  const skipBodyEmails = options.skipBodyEmails ?? isNetworkVendorPage(pageUrl, pageTitle($));
  const isVendorListPage = skipBodyEmails;

  if (/\/contact/i.test(pageUrl)) {
    contactPageUrl = pageUrl;
  }

  if (!isVendorListPage) {
    $('a[href^="mailto:"]').each((_, el) => {
      const raw = ($(el).attr("href") || "").replace(/^mailto:/i, "").split("?")[0].trim();
      if (isValidEmail(raw)) emails.add(raw.toLowerCase());
    });
  }

  $('a[href^="tel:"]').each((_, el) => {
    const raw = ($(el).attr("href") || "").replace(/^tel:/i, "").trim();
    if (isValidPhone(raw)) phones.add(raw);
  });

  if (!skipBodyEmails) {
    const bodyText = $("body").text();
    for (const match of bodyText.matchAll(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,12}\b/gi)) {
      const email = match[0].toLowerCase();
      if (isValidEmail(email)) emails.add(email);
    }
  }

  for (const match of $("body").text().matchAll(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g)) {
    const phone = match[0].trim();
    if (isValidPhone(phone)) phones.add(phone);
  }

  $('a[href*="contact"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href && !contactPageUrl) {
      contactPageUrl = normalizeUrl(href, pageUrl);
    }
  });

  return {
    emails: [...emails],
    phones: [...phones],
    contact_page_url: contactPageUrl,
    source_url: pageUrl,
  };
}

function pageTitle($) {
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;
  return $("title").text().trim();
}

function mainContent($) {
  const sel = $("main, article, [role='main'], .entry-content, .page-content, #content, .content");
  if (sel.length) return sel.first();
  return $("body");
}

function countExternalLinks($, root, pageUrl, siteOrigin) {
  let count = 0;
  root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const abs = normalizeUrl(href, pageUrl);
    if (!abs) return;
    if (sameSite(abs, siteOrigin) && !/instagram|facebook|tiktok|twitter|x\.com/.test(abs)) return;
    count += 1;
  });
  return count;
}

/** Vendor lists often live outside narrow #content wrappers (e.g. Elementor). */
function vendorListRoot($, pageUrl, siteOrigin) {
  const main = mainContent($);
  if (countExternalLinks($, main, pageUrl, siteOrigin) > 0) return main;
  if (countExternalLinks($, $("body"), pageUrl, siteOrigin) > countExternalLinks($, main, pageUrl, siteOrigin)) {
    return $("body");
  }
  return main;
}

function vendorDisplayName(name, url) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const looksLikeUrl =
    /^https?:\/\//i.test(cleanName) ||
    /^[\w.-]+\.(com|org|net|co|io|us|biz)$/i.test(cleanName) ||
    (cleanName.split(/\s+/).length === 1 && cleanName.includes("."));
  if (!looksLikeUrl || !url) return cleanName;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0].replace(/[-_]+/g, " ");
    return base.replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return cleanName;
  }
}

function extractAboutQuote(html, pageUrl) {
  const $ = cheerio.load(html);
  const path = new URL(pageUrl).pathname.toLowerCase();
  const title = pageTitle($);
  if (/testimonial|review|zola|theknot|weddingwire/i.test(path)) return null;
  if (classifyPageContext(pageUrl, title) === "non_wedding") return null;

  const isAbout =
    /about|story|history|who-we|about-the/.test(path) ||
    /wedding|bridal|ceremony|reception/.test(path);

  if (!isAbout && !pageHasWeddingFocus($("body").text())) return null;

  const root = mainContent($);
  const paragraphs = [];
  root.find("p").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= 80 && !/^["“]/.test(text)) paragraphs.push(text);
  });

  if (paragraphs.length === 0) return null;

  paragraphs.sort((a, b) => b.length - a.length);
  const quote = paragraphs[0].slice(0, 1200);
  const quoteShort = quote.length > 320 ? `${quote.slice(0, 317)}…` : quote;

  let section = "homepage";
  if (/about|story|history|about-the/.test(path)) section = "about_page";
  else if (/wedding|event/.test(path)) section = "weddings_page";

  return {
    quote,
    quote_short: quoteShort,
    source_url: pageUrl,
    source_section: section,
  };
}

function extractAssets(html, pageUrl) {
  const $ = cheerio.load(html);
  const assets = [];
  const seen = new Set();

  const add = (type, url, title) => {
    const norm = normalizeUrl(url, pageUrl);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    assets.push({ type, url: norm, title: title || null, source_url: pageUrl });
  };

  $('a[href$=".pdf"], a[href*=".pdf?"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim().toLowerCase();
    let type = "pdf";
    if (/brochure/.test(text) || /brochure/.test(href)) type = "brochure_pdf";
    else if (/package|planning|pricing/.test(text)) type = "package_pdf";
    else if (/floor|layout|plan/.test(text)) type = "floor_plan";
    else if (/vendor|preferred|exclusive|partner|cater|resource|approved/.test(`${text} ${href}`)) {
      type = "vendor_list_pdf";
    }
    add(type, href, $(el).text().trim());
  });

  $("iframe[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (/google\.com\/maps|maps\.google/.test(src)) add("virtual_tour", src, "Google Maps");
    else if (/matterport|kuula|roundme|youtube|vimeo/.test(src)) add("video", src, null);
  });

  $('a[href*="matterport"], a[href*="kuula"], a[href*="youtube.com"], a[href*="vimeo.com"]').each(
    (_, el) => {
      add("video", $(el).attr("href"), $(el).text().trim());
    },
  );

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    const alt = ($(el).attr("alt") || "").toLowerCase();
    if (/floor|layout|plan|seating/.test(`${src} ${alt}`)) {
      add("floor_plan_image", src, $(el).attr("alt") || null);
    }
  });

  if (/\/weddings?\//i.test(pageUrl)) {
    add("weddings_page", pageUrl, pageTitle($));
  }

  return assets;
}

function extractListSections(html, pageUrl) {
  const $ = cheerio.load(html);
  const lists = [];
  const root = mainContent($);

  root.find("ul, ol").each((_, listEl) => {
    const items = [];
    $(listEl)
      .find("> li")
      .each((__, li) => {
        const text = $(li).text().replace(/\s+/g, " ").trim();
        if (text.length >= 3 && text.length <= 500) items.push(text);
      });
    if (items.length >= 3) {
      let heading = "";
      const prev = $(listEl).prevAll("h2, h3, h4").first();
      if (prev.length) heading = prev.text().trim();
      lists.push({
        heading: heading || null,
        items,
        source_url: pageUrl,
      });
    }
  });

  return lists;
}

function isNetworkVendorPage(pageUrl, title) {
  const hay = `${pageUrl} ${title}`;
  if (NETWORK_PAGE_KEYWORDS.test(hay)) return true;
  if (/\/wedding-vendors\/|\/resources\//i.test(pageUrl)) return true;
  return false;
}

function extractNetworkVendors(html, pageUrl, siteOrigin) {
  const $ = cheerio.load(html);
  const title = pageTitle($);
  const bodyText = $("body").text().replace(/\s+/g, " ");
  if (!useWeddingExtraction(pageUrl, title, bodyText)) return [];
  if (!isNetworkVendorPage(pageUrl, title)) return [];

  const listTitle = title;
  const relationship = guessRelationship(pageUrl, title);
  const categoryHint = guessCategory(`${pageUrl} ${title}`);
  const vendors = [];
  const seen = new Set();
  const root = vendorListRoot($, pageUrl, siteOrigin);

  const addVendor = (name, url, context) => {
    if (url && JUNK_VENDOR_URL.test(url)) return;
    const cleanName = vendorDisplayName(name, url);
    if (cleanName.length < 2 || cleanName.length > 120) return;
    if (JUNK_LINK_NAMES.test(cleanName)) return;
    if (JUNK_VENDOR_NAME.test(cleanName)) return;
    if (/^(home|back|read more|click here|contact|email|phone)$/i.test(cleanName)) return;

    const key = url ? url.toLowerCase() : cleanName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const nameCat = guessCategory(cleanName);
    const contextCat = guessCategory(`${context || ""} ${title}`);
    const categories = new Set();
    if (nameCat !== "other") categories.add(nameCat);
    else if (contextCat !== "other") categories.add(contextCat);
    else categories.add(categoryHint);

    const specialty = guessSpecialty(`${cleanName} ${context || ""} ${title}`);

    vendors.push({
      name: cleanName,
      url: url || null,
      relationship,
      categories: [...categories].filter(Boolean),
      labels: listTitle ? [listTitle] : [],
      specialty: categories.has("other") || categories.size === 0 ? specialty : null,
      instagram_handle: url && /instagram\.com/.test(url) ? extractInstagramHandle(url) : null,
      source_url: pageUrl,
      raw_context: context || null,
    });
  };

  root.find("a[href]").each((_, el) => {
    const name = $(el).text().replace(/\s+/g, " ").trim();
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    const abs = normalizeUrl(href, pageUrl);
    if (!abs) return;
    if (sameSite(abs, siteOrigin) && !/instagram|facebook|tiktok|twitter|x\.com/.test(abs)) {
      return;
    }
    if (name.length >= 2) addVendor(name, abs, null);
  });

  root.find("li").each((_, el) => {
    const $li = $(el);
    const link = $li.find("a[href]").first();
    if (link.length) return;
    const text = $li.text().replace(/\s+/g, " ").trim();
    if (text.length >= 3 && text.length <= 100) addVendor(text, null, text);
  });

  return vendors;
}

const AMENITY_PATTERNS = {
  bridal_suite: /bridal suite|bride'?s suite|dressing room|bridal room/i,
  grooms_suite: /groom'?s suite|groom suite/i,
  wheelchair_accessible: /wheelchair|ada accessible|accessible venue|mobility/i,
  wifi: /\bwi-?fi\b|wireless internet/i,
  outdoor_ceremony: /outdoor ceremony|garden ceremony|outdoor wedding/i,
  outdoor_reception: /outdoor reception|tent reception|outdoor event/i,
  indoor_ceremony: /indoor ceremony|chapel|ballroom ceremony/i,
  indoor_reception: /indoor reception|ballroom|reception hall/i,
  on_site_catering: /in-?house cater|on-site cater|exclusive cater|kitchen on site|full service kitchen/i,
  coordination_included: /wedding planning|coordination included|event coordination|planning & coordination/i,
  tent_included: /tent included|peaked tent|white tent/i,
  parking: /parking|valet|parking lot/i,
  av_included: /microphone|speakers|sound system|integrated speakers|projector|podium|lectern/i,
  piano: /grand piano|baby grand|piano/i,
};

const POLICY_PATTERNS = {
  outside_catering_allowed: /outside cater|external cater|vendor of your choice|preferred cater/i,
  outside_catering_prohibited: /exclusive cater|in-house cater only|approved cater only|cannot bring.*cater/i,
  byo_alcohol: /byob|bring your own alcohol|bring your own beverage/i,
  alcohol_provided: /licensed bartender|bar service|alcohol may be purchased|must be served by licensed/i,
  no_cash_bar: /no cash bar|no self-service/i,
  amplified_music: /amplified music|dj|live music|band/i,
  music_end_time: /last song.*(\d{1,2}(?::\d{2})?\s*(?:am|pm))|must end at|noise ordinance|(\d{1,2}(?::\d{2})?\s*(?:am|pm)).*end/i,
  deposit_required: /deposit|non-refundable.*\d+%|\d+%.*deposit/i,
  security_required: /security officer|security must be hired|approved security/i,
  event_insurance_required: /event insurance is required|insurance is required|liability insurance|certificate of insurance|must.*(?:provide|carry|submit).*insurance/i,
  year_round: /year-?round|available year round|all seasons/i,
  seasonal: /seasonal|may through|april through|weather permitting/i,
};

function isFaqPage(pageUrl, title) {
  return /\/faq|frequently-asked|questions-and-answers/i.test(pageUrl) ||
    /\bfaq\b|frequently asked/i.test(title);
}

function normalizeFaqQuestion(q) {
  return q.toLowerCase().replace(/[^a-z0-9? ]/g, "").replace(/\s+/g, " ").trim();
}

/** Framer/homepage sections often omit the trailing "?". */
function ensureFaqQuestionMark(q) {
  const t = q.replace(/\s+/g, " ").trim();
  if (!t || t.endsWith("?")) return t;
  if (
    /^(what|when|where|who|why|how|can|could|do|does|did|is|are|will|would|should|may|have|has|is there|are there)\b/i.test(
      t,
    )
  ) {
    return `${t}?`;
  }
  return t;
}

function faqSourceUrl(pageUrl, fromSection) {
  if (!fromSection) return pageUrl;
  try {
    const u = new URL(pageUrl);
    u.hash = "faqs";
    return u.toString();
  } catch {
    return `${pageUrl.replace(/#.*$/, "")}#faqs`;
  }
}

function findFaqSectionRoots($) {
  const roots = [];
  const seen = new Set();
  const add = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    roots.push(el);
  };

  $("#faqs, #faq").each((_, el) => add(el));
  $('[id*="faq" i]').each((_, el) => add(el));
  $('[data-framer-name="FAQs"], [data-framer-name="FAQ"]').each((_, el) => add(el));

  $("section, div, article").each((_, el) => {
    const $el = $(el);
    const heading = $el
      .children("h1,h2,h3,[data-framer-name='Badge'],[data-framer-name='Header']")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (/^faqs?$/i.test(heading) || /^frequently asked/i.test(heading)) add(el);
  });

  return roots;
}

/**
 * Framer accordion: Open/Closed items with Title + Content children.
 * Also works when Title/Content sit under a shared parent without Open/Closed.
 */
function extractFramerSectionFaqs($, root, pageUrl) {
  const faqs = [];
  const seen = new Set();
  const source = faqSourceUrl(pageUrl, true);
  const $root = $(root);

  const addPair = (question, answer) => {
    const q = ensureFaqQuestionMark(question);
    const a = (answer || "").replace(/\s+/g, " ").trim();
    if (!q || q.length < 10 || q.length > 300) return;
    if (!q.endsWith("?")) return;
    if (a.length < 15 || a.length > 2000 || JUNK_FAQ_ANSWER.test(a)) return;
    const key = normalizeFaqQuestion(q);
    if (seen.has(key)) return;
    seen.add(key);
    faqs.push({ question: q, answer: a, source_url: source });
  };

  const items = $root.find(
    '[data-framer-name="Open"], [data-framer-name="Closed"], [data-framer-name="FAQ Item"], [data-framer-name="Accordion Item"]',
  );
  if (items.length) {
    items.each((_, el) => {
      const $item = $(el);
      const q = $item.find('[data-framer-name="Title"]').first().text();
      const a = $item.find('[data-framer-name="Content"]').first().text();
      addPair(q, a);
    });
  }

  if (faqs.length === 0) {
    $root.find('[data-framer-name="Title"]').each((_, el) => {
      const $title = $(el);
      const q = $title.text();
      const $parent = $title.parent();
      let a = $parent.find('[data-framer-name="Content"]').first().text();
      if (!a) {
        a = $title.nextAll('[data-framer-name="Content"]').first().text();
      }
      addPair(q, a);
    });
  }

  return faqs;
}

const JUNK_FAQ_ANSWER = /copyright|all rights reserved|^\d{3,5}\s+\w+\s+(street|st|avenue|ave|blvd)|info@/i;

const FAQ_MATCH_RULES = [
  [/ship personal|deliver.*items|delivery ahead/i, /cannot accept any deliveries|fedex|ups pick-up/i],
  [/candles/i, /votive|hurricane|open flames|candle/i],
  [/coordinate|oversee the details/i, /coordination|arbory team|oversee/i],
  [/confetti|sparklers/i, /confetti|sparklers/i],
  [/ada compliant/i, /ada accessible|fully ada/i],
  [/vendor recommendations/i, /favorite event professionals|list of our favorite/i],
  [/bring our dog|dog to the/i, /\bdog\b|\bpet\b/i],
  [/rehearsal/i, /rehearsal/i],
  [/hotels nearby/i, /hotels|west loop|wicker park|emily hotel/i],
  [/tech package/i, /sound system|microphone|projector|wifi|embedded/i],
  [/byob/i, /byob|bartender/i],
  [/parking/i, /parking|street parking|school parking/i],
  [/insurance/i, /insurance|liability/i],
];

function faqMatchScore(question, answer) {
  const q = question.toLowerCase();
  const a = answer.toLowerCase();
  for (const [qRe, aRe] of FAQ_MATCH_RULES) {
    if (qRe.test(q) && aRe.test(a)) return 10;
  }
  const qWords = q.replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3);
  return qWords.filter((w) => a.includes(w)).length;
}

function pairFaqsByKeywords(questions, answers, pageUrl) {
  const faqs = [];
  const used = new Set();
  for (const question of questions) {
    let bestAnswer = null;
    let bestScore = 0;
    for (const answer of answers) {
      if (used.has(answer)) continue;
      const score = faqMatchScore(question, answer);
      if (score > bestScore) {
        bestScore = score;
        bestAnswer = answer;
      }
    }
    if (bestAnswer && bestScore > 0) {
      used.add(bestAnswer);
      faqs.push({ question, answer: bestAnswer, source_url: pageUrl });
    }
  }
  return faqs;
}

function extractSquarespaceFaqs($, pageUrl) {
  const questions = [];
  $('[data-sid^="questions_view-1_"]').each((_, el) => {
    const h1 = $(el).find("h1").first().text().replace(/\s+/g, " ").trim();
    if (h1.endsWith("?") && h1.length >= 10) questions.push(h1);
  });
  if (questions.length < 2) return [];

  const seenQ = new Set();
  const uniqueQuestions = questions.filter((q) => {
    const key = normalizeFaqQuestion(q);
    if (seenQ.has(key)) return false;
    seenQ.add(key);
    return true;
  });

  const answers = [];
  for (let v = 2; v <= 30; v++) {
    $(`[data-sid^="questions_view-${v}_"]`).each((_, el) => {
      const p = $(el).find("p").first().text().replace(/\s+/g, " ").trim();
      if (p.length > 30 && !p.includes("?") && !JUNK_FAQ_ANSWER.test(p)) answers.push(p);
    });
  }
  const uniqueAnswers = [...new Set(answers)];
  return pairFaqsByKeywords(uniqueQuestions, uniqueAnswers, pageUrl);
}

function extractFaqs(html, pageUrl) {
  const $ = cheerio.load(html);
  const title = pageTitle($);

  const faqs = [];
  const seen = new Set();

  const add = (question, answer, sourceUrl = pageUrl) => {
    const q = ensureFaqQuestionMark(question);
    const a = (answer || "").replace(/\s+/g, " ").trim();
    if (!q.endsWith("?") || q.length < 10 || q.length > 300) return;
    if (a.length < 15 || a.length > 2000 || JUNK_FAQ_ANSWER.test(a)) return;
    const key = normalizeFaqQuestion(q);
    if (seen.has(key)) return;
    seen.add(key);
    faqs.push({ question: q, answer: a, source_url: sourceUrl });
  };

  // Homepage / SPA hash sections (#faqs) — e.g. Framer Galleria Marchetti
  for (const root of findFaqSectionRoots($)) {
    for (const faq of extractFramerSectionFaqs($, root, pageUrl)) {
      add(faq.question, faq.answer, faq.source_url);
    }

    if (faqs.length === 0) {
      const $root = $(root);
      $root.find("details").each((_, el) => {
        const $el = $(el);
        add(
          $el.find("summary").first().text(),
          $el.find("p").first().text(),
          faqSourceUrl(pageUrl, true),
        );
      });
    }
  }

  if (faqs.length > 0) return faqs;

  // Full-page FAQ URLs / titles only — avoid false positives on every page
  if (!isFaqPage(pageUrl, title)) return [];

  $("details").each((_, el) => {
    const $el = $(el);
    const q = $el.find("summary").first().text().replace(/\s+/g, " ").trim();
    const a = $el.find("p").first().text().replace(/\s+/g, " ").trim();
    if (q && a) add(q, a);
  });

  $("dl").each((_, dl) => {
    $(dl)
      .find("dt")
      .each((__, dt) => {
        const q = $(dt).text().replace(/\s+/g, " ").trim();
        const a = $(dt).next("dd").text().replace(/\s+/g, " ").trim();
        if (q && a) add(q, a);
      });
  });

  // Geraghty-style: <p><strong>Question?</strong></p><p>Answer</p>
  if (faqs.length === 0) {
    $("p").each((_, el) => {
      const $p = $(el);
      const $q = $p.children("strong, b").first();
      if (!$q.length) return;
      const q = $q.text().replace(/\s+/g, " ").trim();
      if (!q.endsWith("?") && !/^(what|can|do|is|are|how)\b/i.test(q)) return;
      // Prefer following sibling paragraphs as the answer
      let a = "";
      let $next = $p.next();
      while ($next.length && $next.is("p")) {
        const nextStrong = $next.children("strong, b").first().text().replace(/\s+/g, " ").trim();
        if (nextStrong.endsWith("?") || /^(what|can|do|is|are|how)\b/i.test(nextStrong)) break;
        const chunk = $next.text().replace(/\s+/g, " ").trim();
        if (chunk) a = a ? `${a} ${chunk}` : chunk;
        if (a.length > 40) break;
        $next = $next.next();
      }
      if (!a) {
        const rest = $p.clone().children("strong, b").remove().end().text().replace(/\s+/g, " ").trim();
        if (rest.length >= 15) a = rest;
      }
      if (q && a) add(q, a);
    });
  }

  if (faqs.length === 0 && $('[data-sid^="questions_view-"]').length > 0) {
    return extractSquarespaceFaqs($, pageUrl);
  }

  if (faqs.length === 0) {
    const questionOrder = [];
    const seenQ = new Set();
    $("h1,h2,h3,h4,h5,strong,b").each((_, el) => {
      const q = ensureFaqQuestionMark($(el).text());
      const key = normalizeFaqQuestion(q);
      if (!q.endsWith("?") || q.length < 10 || q.length > 300 || seenQ.has(key)) return;
      seenQ.add(key);
      questionOrder.push(q);
    });

    const answers = [];
    const seenA = new Set();
    $("p").each((_, el) => {
      const a = $(el).text().replace(/\s+/g, " ").trim();
      if (a.length < 20 || a.length > 2000) return;
      // Skip paragraphs that are only a question (strong/bold Q)
      if (/^\s*.{10,300}\?\s*$/.test(a) && $(el).children("strong, b").length) return;
      if (JUNK_FAQ_ANSWER.test(a)) return;
      if (seenA.has(a)) return;
      seenA.add(a);
      answers.push(a);
    });

    return pairFaqsByKeywords(questionOrder, answers, pageUrl);
  }

  return faqs;
}

function classifyCapacityContext(allText, index, matchLen) {
  const before = allText.slice(Math.max(0, index - 90), index);

  const floorPlan = before.match(/\b(wedding|gala|corporate)\s*[-–][\s\S]{0,75}$/i);
  if (floorPlan) {
    const label = floorPlan[1].toLowerCase();
    if (label === "wedding") return "wedding";
    if (label === "gala") return "gala";
    return "corporate";
  }

  const beforeLower = before.toLowerCase();
  if (/gala|fundraising|award dinner|in the round/i.test(beforeLower)) return "gala";
  if (
    /corporate|conference|meeting|town hall|general session|networking|trade show|summit|breakout|annual meeting|celebration zone/i.test(
      beforeLower,
    )
  ) {
    return "corporate";
  }
  if (/wedding|ceremony|reception|bridal|afterparty|marry/i.test(beforeLower)) return "wedding";

  const wide = allText.slice(Math.max(0, index - 180), index).toLowerCase();
  if (/wedding|ceremony|bridal|marry/i.test(wide) && !/gala|corporate/i.test(beforeLower.slice(-50))) {
    return "wedding";
  }

  return "neutral";
}

function extractCapacityCandidates(allText, pageUrl) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (value, quote, index, matchLen) => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 10 || n > 5000) return;
    const context = classifyCapacityContext(allText, index, matchLen);
    const key = `${context}:${n}:${quote.slice(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      value: n,
      context,
      quote: quote.replace(/\s+/g, " ").trim(),
      url: pageUrl,
    });
  };

  const explicitPatterns = [
    /(?:up to|maximum|max\.?|accommodate|holds?)\s*(?:of\s*)?(\d{2,4})\s*(?:guests|people|seated)/gi,
    /for up to (\d{2,4}) guests/gi,
    /(\d{2,4})\s*(?:guests|people)\s*(?:including|capacity)/gi,
    /(?:seated|standing|capacity)\s*(?:of\s*)?(\d{2,4})\s*(?:guests|people)/gi,
  ];

  for (const re of explicitPatterns) {
    for (const m of allText.matchAll(re)) {
      const idx = m.index ?? 0;
      addCandidate(m[1], m[0], idx, m[0].length);
    }
  }

  for (const m of allText.matchAll(/(\d{2,4})\s+Guests?\b/g)) {
    const idx = m.index ?? 0;
    addCandidate(m[1], m[0], idx, m[0].length);
  }

  return candidates;
}

function pickWeddingCapacity(candidates) {
  if (!candidates.length) return null;

  const scored = candidates.map((c) => ({
    ...c,
    score:
      (c.pagePriority ?? 1) * 100 +
      (c.context === "wedding" ? 50 : c.context === "neutral" ? 20 : -100) +
      (c.pageContext === "wedding" ? 10 : 0),
  }));

  const weddingPool = scored.filter((c) => c.context === "wedding");
  const neutralPool = scored.filter((c) => c.context === "neutral");
  const pool = weddingPool.length ? weddingPool : neutralPool.length ? neutralPool : [];

  if (!pool.length) return null;

  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.value - a.value;
  });

  const pick = pool[0];
  return {
    capacity_max: pick.value,
    capacity_context: pick.context,
    source: {
      field: "pricing.capacity_max",
      url: pick.url,
      quote: pick.quote,
      context: pick.context,
    },
  };
}

function scanTextSignals(allText, pageUrl) {
  const amenities = {};
  const policies = {};
  const sources = [];

  for (const [key, pattern] of Object.entries(AMENITY_PATTERNS)) {
    const m = allText.match(pattern);
    if (m) {
      amenities[key] = true;
      sources.push({ field: `amenities.${key}`, url: pageUrl, quote: m[0] });
    }
  }

  for (const [key, pattern] of Object.entries(POLICY_PATTERNS)) {
    const m = allText.match(pattern);
    if (m) {
      policies[key] = true;
      sources.push({ field: `policies.${key}`, url: pageUrl, quote: m[0] });
    }
  }

  const capacityCandidates = extractCapacityCandidates(allText, pageUrl);
  const pricingMatch = allText.match(/(?:from|starting at)\s*\$[\d,]+(?:\.\d{2})?/i);

  return {
    amenities,
    policies,
    capacity_candidates: capacityCandidates,
    price_display: pricingMatch ? pricingMatch[0] : null,
    sources,
  };
}

module.exports = {
  extractSocialFromHtml,
  extractContactFromHtml,
  extractAboutQuote,
  extractAssets,
  extractListSections,
  extractNetworkVendors,
  extractFaqs,
  scanTextSignals,
  extractCapacityCandidates,
  pickWeddingCapacity,
  extractInstagramHandle,
};
