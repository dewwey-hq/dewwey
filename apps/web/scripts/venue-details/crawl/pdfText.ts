/**
 * PDF text extraction for the venue-details crawl, via `unpdf` (bun add -d unpdf) — confirmed
 * working natively under Bun 1.4 (no Playwright/native deps; see the pdfText.test.ts fixture).
 * No pdf-parse fallback was needed.
 *
 * `hasTextLayer` uses the plan's threshold: average chars/page >= 50. Capped at 40 pages —
 * pages beyond the cap are dropped from both the text and the page count denominator, so a
 * very long PDF's text-layer verdict is based only on what was actually read.
 */
import { extractText, getDocumentProxy } from "unpdf";

export interface PdfTextResult {
  text: string;
  pages: number;
  hasTextLayer: boolean;
}

const MAX_PAGES = 40;
const MIN_AVG_CHARS_PER_PAGE = 50;

export async function extractPdfText(buffer: Uint8Array | ArrayBuffer): Promise<PdfTextResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const pdf = await getDocumentProxy(bytes);
  const totalPages = pdf.numPages ?? 0;
  const pages = Math.min(totalPages, MAX_PAGES);

  if (pages === 0) return { text: "", pages: 0, hasTextLayer: false };

  const { text: pageTexts } = await extractText(pdf, { mergePages: false });
  const usedTexts = pageTexts.slice(0, pages);
  const text = usedTexts.join("\n\n").trim();
  const avgCharsPerPage = text.length / pages;

  return {
    text,
    pages,
    hasTextLayer: avgCharsPerPage >= MIN_AVG_CHARS_PER_PAGE,
  };
}
