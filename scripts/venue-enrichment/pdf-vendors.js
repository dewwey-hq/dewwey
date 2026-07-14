const { PDFParse } = require("pdf-parse");
const { FETCH_UA, JUNK_VENDOR_NAME, JUNK_VENDOR_URL } = require("./constants");
const { guessCategory, guessSpecialty, guessRelationship } = require("./classify");

const DOMAIN_RE = /\b([a-z0-9][a-z0-9-]*\.(?:com|org|net|co|io|us|biz))\b/gi;

function isVendorListPdf(asset) {
  if (!asset?.url || !/\.pdf(\?|$)/i.test(asset.url)) return false;
  if (asset.type === "vendor_list_pdf") return true;
  const hay = `${asset.url} ${asset.title || ""}`.toLowerCase();
  return /vendor|preferred|exclusive|partner|cater|resource|approved/.test(hay);
}

function vendorNameFromDomain(domain) {
  const base = domain.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseVendorsFromPdfText(text, pdfUrl, pageSourceUrl, listTitle = null) {
  const vendors = [];
  const seen = new Set();
  let sectionLabel = listTitle || "Preferred Vendors";
  let sectionCategory = guessCategory(sectionLabel);

  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0 && !/^--\s*\d+ of \d+\s*--$/i.test(l));

  for (const line of lines) {
    const lettersOnly = line.replace(/[^a-zA-Z]/g, "");
    const isSectionHeader =
      line.length <= 120 &&
      (/exclusive|preferred|approved|partner/i.test(line) ||
        (lettersOnly.length >= 8 && lettersOnly === lettersOnly.toUpperCase() && /partner|vendor|cater|decor|flor|photo|music|av/i.test(line)));

    if (isSectionHeader && !DOMAIN_RE.test(line)) {
      sectionLabel = line.replace(/\s+/g, " ");
      sectionCategory = guessCategory(sectionLabel);
      continue;
    }

    for (const match of line.matchAll(DOMAIN_RE)) {
      const domain = match[1].toLowerCase();
      if (seen.has(domain)) continue;
      seen.add(domain);

      const url = `https://${domain}`;
      if (JUNK_VENDOR_URL.test(url)) continue;

      const name = vendorNameFromDomain(domain);
      if (JUNK_VENDOR_NAME.test(name)) continue;

      const categories = new Set();
      const nameCat = guessCategory(name);
      if (nameCat !== "other") categories.add(nameCat);
      else if (sectionCategory !== "other") categories.add(sectionCategory);
      else categories.add("other");

      vendors.push({
        name,
        url,
        relationship: guessRelationship(pdfUrl, sectionLabel),
        categories: [...categories].filter(Boolean),
        labels: [sectionLabel],
        specialty: categories.has("other") ? guessSpecialty(`${name} ${sectionLabel}`) : null,
        instagram_handle: null,
        source_url: pageSourceUrl || pdfUrl,
        raw_context: `pdf:${pdfUrl}`,
      });
    }
  }

  return vendors;
}

async function fetchPdfText(pdfUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(pdfUrl, {
      signal: controller.signal,
      headers: { "User-Agent": FETCH_UA, Accept: "application/pdf,*/*" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text || "";
  } finally {
    clearTimeout(timer);
  }
}

async function extractVendorsFromPdfAssets(assets) {
  const vendorPdfs = assets.filter(isVendorListPdf);
  const all = [];

  for (const asset of vendorPdfs) {
    try {
      const text = await fetchPdfText(asset.url);
      if (!text || text.trim().length < 10) continue;
      const listTitle = asset.title || "Preferred Vendors";
      const parsed = parseVendorsFromPdfText(text, asset.url, asset.source_url, listTitle);
      all.push(...parsed);
    } catch (err) {
      process.stderr.write(`  pdf vendor skip ${asset.url}: ${err.message}\n`);
    }
  }

  return all;
}

module.exports = {
  isVendorListPdf,
  parseVendorsFromPdfText,
  extractVendorsFromPdfAssets,
};
