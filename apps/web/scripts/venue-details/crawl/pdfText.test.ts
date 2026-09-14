import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { extractPdfText } from "./pdfText";

/** Builds a real, well-formed one-page PDF via pdf-lib (test-only devDependency — production
 * code uses `unpdf` exclusively) with the given text drawn on the page, or no text at all for
 * an "image-only" PDF fixture. */
async function buildPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  if (text) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(text, { x: 10, y: 300, size: 10, font, maxWidth: 380, lineHeight: 12 });
  }
  return doc.save();
}

describe("extractPdfText", () => {
  test("extracts text from a pdf with a real text layer", async () => {
    const longText = "Wedding pricing and capacity details for the venue. ".repeat(3);
    const pdf = await buildPdf(longText);
    const result = await extractPdfText(pdf);
    expect(result.pages).toBe(1);
    expect(result.text).toContain("Wedding pricing and capacity details");
    expect(result.hasTextLayer).toBe(true);
  });

  test("an image-only pdf (no text drawn) has no text layer", async () => {
    const pdf = await buildPdf("");
    const result = await extractPdfText(pdf);
    expect(result.pages).toBe(1);
    expect(result.text).toBe("");
    expect(result.hasTextLayer).toBe(false);
  });

  test("a pdf with only a short caption falls below the avg-chars/page threshold", async () => {
    const pdf = await buildPdf("Photo");
    const result = await extractPdfText(pdf);
    expect(result.hasTextLayer).toBe(false);
  });

  test("accepts an ArrayBuffer as well as a Uint8Array", async () => {
    const pdf = await buildPdf("Some real page text here for the test");
    const arrayBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    const result = await extractPdfText(arrayBuffer);
    expect(result.pages).toBe(1);
  });
});
