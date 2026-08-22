const SCHEMA_VERSION = 1;

function emptyEnrichment(input = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    enriched_at: new Date().toISOString(),
    crawled_at: null,
    input: {
      focus: "wedding",
      ...input,
    },
    pages_crawled: [],
    about: null,
    contact: {
      emails: [],
      phones: [],
      contact_page_url: null,
      sources: [],
    },
    social: {},
    amenities: {},
    policies: {},
    pricing: {
      display: null,
      capacity_max: null,
      capacity_min: null,
      capacity_context: null,
      capacity_configurations: [],
    },
    spaces: [],
    included_inventory: [],
    addons: [],
    assets: [],
    network_vendors: [],
    faqs: [],
    raw_lists: [],
    sources: [],
    status: "partial",
  };
}

const { extractVendorsFromPdfAssets } = require("./pdf-vendors");

async function mergeEnrichment(pages, startUrl, vendorMeta = null) {
  const result = emptyEnrichment({
    website: startUrl,
    vendor_id: vendorMeta?.id ?? null,
    vendor_name: vendorMeta?.name ?? null,
  });
  result.crawled_at = vendorMeta?.crawled_at || new Date().toISOString();

  const cheerio = require("cheerio");
  const {
    extractSocialFromHtml,
    extractContactFromHtml,
    extractAboutQuote,
    extractAssets,
    extractListSections,
    extractNetworkVendors,
    extractFaqs,
    scanTextSignals,
    pickWeddingCapacity,
    extractLabeledCapacitiesFromHtml,
  } = require("./extract");
  const {
    classifyPageContext,
    isVenueContactPage,
    useWeddingExtraction,
  } = require("./classify");

  const siteRoot = startUrl;
  const allEmails = new Set();
  const allPhones = new Set();
  const socialMerged = {};
  const networkMap = new Map();
  const faqMap = new Map();
  const assetSeen = new Set();
  const policyPriority = new Map();
  const amenityPriority = new Map();
  const capacityCandidates = [];
  const capacityConfigMap = new Map();
  let bestAbout = null;

  function signalPriority(pageUrl, pageContext) {
    if (pageContext === "wedding") return 3;
    try {
      const path = new URL(pageUrl).pathname.toLowerCase();
      if (/\/wedding|\/usage-polic|\/polic|\/guideline|\/preferred|\/vendor|\/cater/.test(path)) return 2;
    } catch {
      // ignore
    }
    return pageContext === "neutral" ? 1 : 0;
  }

  function mergeSignals(target, incoming, priorityMap, priority) {
    for (const [key, value] of Object.entries(incoming)) {
      const prev = priorityMap.get(key) ?? 0;
      if (priority >= prev) {
        target[key] = value;
        priorityMap.set(key, priority);
      }
    }
  }

  for (const { url, html, depth } of pages) {
    const $ = cheerio.load(html);
    const title = ($("h1").first().text().trim() || $("title").text().trim());
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const pageContext = classifyPageContext(url, title);

    result.pages_crawled.push({ url, depth, context: pageContext });

    if (isVenueContactPage(url)) {
      const contact = extractContactFromHtml(html, url);
      contact.emails.forEach((e) => allEmails.add(e));
      contact.phones.forEach((p) => allPhones.add(p));
      if (contact.contact_page_url && !result.contact.contact_page_url) {
        result.contact.contact_page_url = contact.contact_page_url;
      }
      result.contact.sources.push({ url, emails: contact.emails, phones: contact.phones });
    }

    const social = extractSocialFromHtml(html, url);
    for (const [platform, data] of Object.entries(social)) {
      if (!socialMerged[platform]) {
        socialMerged[platform] = { urls: new Set(), primary_url: null, instagram_handle: null };
      }
      for (const u of data.urls) socialMerged[platform].urls.add(u);
      if (!socialMerged[platform].instagram_handle && data.instagram_handle) {
        socialMerged[platform].instagram_handle = data.instagram_handle;
      }
    }

    const about = extractAboutQuote(html, url);
    if (about) {
      const sectionRank = { about_page: 3, weddings_page: 2, homepage: 1 };
      const currentRank = bestAbout ? sectionRank[bestAbout.source_section] ?? 0 : 0;
      const newRank = sectionRank[about.source_section] ?? 0;
      if (!bestAbout || newRank > currentRank || (newRank === currentRank && about.quote.length > bestAbout.quote.length)) {
        bestAbout = about;
      }
    }

    const weddingExtract = useWeddingExtraction(url, title, bodyText);

    if (weddingExtract) {
      for (const asset of extractAssets(html, url)) {
        if (!assetSeen.has(asset.url)) {
          assetSeen.add(asset.url);
          result.assets.push(asset);
        }
      }

      for (const list of extractListSections(html, url)) {
        result.raw_lists.push(list);
        if (/equipment|included|dinnerware|furniture|every event includes|china|flatware|tables|chairs|piano|microphone|lectern|podium|capacity|guidelines|clubhouse|amenities|wedding/i.test(list.heading || "")) {
          for (const item of list.items) {
            if (/^\d+\s/.test(item) || /table|chair|piano|microphone|plate|fork|projector|screen|lectern|podium|guest|wedding/i.test(item)) {
              result.included_inventory.push({
                item,
                source_url: url,
                heading: list.heading,
              });
            }
          }
        }
      }

      for (const vendor of extractNetworkVendors(html, url, siteRoot)) {
        const key = (vendor.url || vendor.name).toLowerCase();
        if (!networkMap.has(key)) {
          networkMap.set(key, vendor);
        } else {
          const existing = networkMap.get(key);
          existing.labels = [...new Set([...existing.labels, ...vendor.labels])];
          existing.categories = [...new Set([...existing.categories, ...vendor.categories])];
        }
      }

      const priority = signalPriority(url, pageContext);
      const signals = scanTextSignals(bodyText, url);
      mergeSignals(result.amenities, signals.amenities, amenityPriority, priority);
      mergeSignals(result.policies, signals.policies, policyPriority, priority);
      for (const candidate of signals.capacity_candidates || []) {
        capacityCandidates.push({ ...candidate, pageContext, pagePriority: priority });
      }
      for (const row of extractLabeledCapacitiesFromHtml(html, url)) {
        const key = `${(row.space || "").toLowerCase()}|${row.style}|${row.guests}|${row.guests_min || ""}`;
        if (!capacityConfigMap.has(key)) capacityConfigMap.set(key, row);
      }
      if (signals.price_display && !result.pricing.display) {
        result.pricing.display = signals.price_display;
      }
      result.sources.push(...signals.sources);
    }

    for (const faq of extractFaqs(html, url)) {
      const key = faq.question.toLowerCase().replace(/[^a-z0-9? ]/g, "").trim();
      if (!faqMap.has(key)) faqMap.set(key, faq);
    }
  }

  const capacityPick = pickWeddingCapacity(capacityCandidates);
  if (capacityPick) {
    result.pricing.capacity_max = capacityPick.capacity_max;
    result.pricing.capacity_context = capacityPick.capacity_context;
    if (!result.sources.some((s) => s.field === "pricing.capacity_max")) {
      result.sources.push(capacityPick.source);
    }
  }
  result.pricing.capacity_configurations = [...capacityConfigMap.values()];

  result.about = bestAbout;
  result.contact.emails = [...allEmails];
  result.contact.phones = [...allPhones];
  result.social = Object.fromEntries(
    Object.entries(socialMerged).map(([platform, data]) => [
      platform,
      {
        urls: [...data.urls],
        primary_url: [...data.urls][0] ?? null,
        instagram_handle: data.instagram_handle,
      },
    ]),
  );
  for (const vendor of await extractVendorsFromPdfAssets(result.assets)) {
    const key = (vendor.url || vendor.name).toLowerCase();
    if (!networkMap.has(key)) {
      networkMap.set(key, vendor);
    } else {
      const existing = networkMap.get(key);
      existing.labels = [...new Set([...existing.labels, ...vendor.labels])];
      existing.categories = [...new Set([...existing.categories, ...vendor.categories])];
    }
  }

  result.network_vendors = [...networkMap.values()];
  result.faqs = [...faqMap.values()];

  if (result.policies.outside_catering_allowed && result.policies.outside_catering_prohibited) {
    const allowedPri = policyPriority.get("outside_catering_allowed") ?? 0;
    const prohibitedPri = policyPriority.get("outside_catering_prohibited") ?? 0;
    if (prohibitedPri >= allowedPri) delete result.policies.outside_catering_allowed;
    else delete result.policies.outside_catering_prohibited;
  }

  const hasContent =
    result.about ||
    result.assets.length > 0 ||
    result.network_vendors.length > 0 ||
    result.faqs.length > 0 ||
    Object.keys(result.amenities).length > 0 ||
    result.contact.emails.length > 0;

  result.status = hasContent ? "success" : pages.length > 0 ? "partial" : "failed";

  return result;
}

module.exports = { SCHEMA_VERSION, emptyEnrichment, mergeEnrichment };
