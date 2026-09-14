/**
 * Grounding: does a quote actually appear (well enough) on the page it's cited from? Pure, no
 * DB/network -- `assemble.ts` supplies the crawled page texts. See the plan's grounding rules
 * (D060 Phase 2): token-coverage >= 0.80 AND every numeric token present AND >= 3 tokens is a
 * clean pass; short of that (but still on the stated page) is a `weak_quote` warning, still
 * grounded; the quote found verbatim on a DIFFERENT crawled page is `grounded_elsewhere` (the
 * field's source_url/snapshot_id gets rewritten); the stated source_url not being a crawled page
 * at all, with the quote nowhere else either, is `source_not_crawled`; anything else is a hard
 * `fail`.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "at", "by",
  "as", "from", "this", "that", "it", "be", "will", "your", "you", "we", "our", "their", "was",
  "were", "has", "have", "had", "not", "but", "into", "than", "then", "so", "if", "can", "may",
]);

/** "$6,000" -> "6000"; "6k" -> "6000"; "11.75%" -> "11.75". Pure numeric normalization used by
 * `tokens()` before punctuation is stripped, so a formatting difference between the quote and
 * the page text (currency sign, thousands comma, a "6k" shorthand) never fails a real match. */
export function normalizeNumberToken(raw: string): string {
  let s = raw.replace(/[$,]/g, "");
  const kMatch = /^(\d+(?:\.\d+)?)k$/i.exec(s);
  if (kMatch) return String(Number(kMatch[1]) * 1000);
  s = s.replace(/%$/, "");
  return s;
}

function isNumericToken(tok: string): boolean {
  return /^\d/.test(tok);
}

/** Lowercase; normalize number-shaped chunks; strip punctuation; drop stopwords and non-numeric
 * tokens shorter than 3 chars (numeric tokens are kept at any length -- "$5" matters). */
export function tokens(text: string): string[] {
  const raw = text.toLowerCase();
  const chunks = raw.match(/[a-z0-9$.,%]+/g) ?? [];
  const out: string[] = [];
  for (const chunk of chunks) {
    const numeric = /\d/.test(chunk);
    let tok = numeric ? normalizeNumberToken(chunk) : chunk;
    tok = tok.replace(/[^a-z0-9.]/g, "");
    tok = tok.replace(/\.+$/, "");
    if (!tok) continue;
    if (!numeric) {
      if (STOPWORDS.has(tok)) continue;
      if (tok.length < 3) continue;
    }
    out.push(tok);
  }
  return out;
}

/** Fraction of the quote's tokens that appear somewhere in the page's token set. 0 for an empty
 * quote (nothing to ground). */
export function coverage(quote: string, pageText: string): number {
  const quoteTokens = tokens(quote);
  if (quoteTokens.length === 0) return 0;
  const pageTokens = new Set(tokens(pageText));
  const present = quoteTokens.filter((t) => pageTokens.has(t)).length;
  return present / quoteTokens.length;
}

function allNumericTokensPresent(quote: string, pageText: string): boolean {
  const numeric = tokens(quote).filter(isNumericToken);
  if (numeric.length === 0) return true;
  const pageTokens = new Set(tokens(pageText));
  return numeric.every((t) => pageTokens.has(t));
}

/** Scheme/`www.`/trailing-slash/hash-insensitive URL key so a quote's `source_url` matches the
 * crawled page regardless of http vs https or a redirect's exact form (same discipline as
 * `crawlVenue.ts`'s `normalizeUrlKey`). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
    return `${host}${pathname}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export interface GroundingPage {
  text: string;
  snapshotId: number | null;
}

export type GroundingStatus = "pass" | "weak_quote" | "grounded_elsewhere" | "source_not_crawled" | "fail";

export interface GroundingOutcome {
  status: GroundingStatus;
  coverage: number;
  /** Normalized URL of the page the quote actually grounds against -- the stated source_url for
   * pass/weak_quote/fail, a different page for grounded_elsewhere, absent for source_not_crawled. */
  matchedUrl?: string;
  snapshotId?: number | null;
}

const CLEAN_PASS_COVERAGE = 0.8;
const WEAK_PASS_COVERAGE = 0.5;
const MIN_TOKENS_FOR_STRICT_CHECK = 3;

function bestMatch(quote: string, pages: Map<string, GroundingPage>): { url: string; page: GroundingPage; coverage: number } | null {
  let best: { url: string; page: GroundingPage; coverage: number } | null = null;
  for (const [url, page] of pages) {
    const cov = coverage(quote, page.text);
    if (!best || cov > best.coverage) best = { url, page, coverage: cov };
  }
  return best;
}

function isCleanPass(quote: string, page: GroundingPage, cov: number, quoteTokenCount: number): boolean {
  return cov >= CLEAN_PASS_COVERAGE && allNumericTokensPresent(quote, page.text) && quoteTokenCount >= MIN_TOKENS_FOR_STRICT_CHECK;
}

/** The single grounding check every stated Fact goes through. `pages` is keyed by
 * `normalizeUrl(url)`. Searches the WHOLE crawl for the best-matching page first (not just the
 * stated one) so a wrong-but-real citation (the quote actually lives on a different crawled
 * page) is caught as `grounded_elsewhere` even when the stated `source_url` itself was crawled --
 * only when the stated page was never crawled at all, and nothing else grounds the quote either,
 * does this fall through to `source_not_crawled`. */
export function checkGrounding(quote: string, sourceUrl: string, pages: Map<string, GroundingPage>): GroundingOutcome {
  const normSource = normalizeUrl(sourceUrl);
  const statedPage = pages.get(normSource);
  const quoteTokenCount = tokens(quote).length;

  const best = bestMatch(quote, pages);
  if (best && isCleanPass(quote, best.page, best.coverage, quoteTokenCount)) {
    if (best.url === normSource) {
      return { status: "pass", coverage: best.coverage, matchedUrl: normSource, snapshotId: best.page.snapshotId };
    }
    return { status: "grounded_elsewhere", coverage: best.coverage, matchedUrl: best.url, snapshotId: best.page.snapshotId };
  }

  if (!statedPage) {
    return { status: "source_not_crawled", coverage: 0 };
  }

  const cov = coverage(quote, statedPage.text);
  const weakOk = quoteTokenCount < MIN_TOKENS_FOR_STRICT_CHECK ? cov > 0 : cov >= WEAK_PASS_COVERAGE;
  if (weakOk) {
    return { status: "weak_quote", coverage: cov, matchedUrl: normSource, snapshotId: statedPage.snapshotId };
  }
  return { status: "fail", coverage: cov };
}
