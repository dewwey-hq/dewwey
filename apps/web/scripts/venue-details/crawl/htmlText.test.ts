import { describe, expect, test } from "vitest";
import { extractHtml } from "./htmlText";

const BASE = "https://venue.com/weddings";

describe("extractHtml", () => {
  test("drops script/style content from the flowing text", async () => {
    const html = `<html><head><title>T</title><style>.a{color:red}</style></head><body>
      <script>var x = 1; document.write("bad");</script>
      <p>Real content</p>
    </body></html>`;
    const { text } = await extractHtml(html, BASE);
    expect(text).toContain("Real content");
    expect(text).not.toContain("document.write");
    expect(text).not.toContain("color:red");
  });

  test("captures the title separately from body text", async () => {
    const html = `<html><head><title>Galleria Marchetti</title></head><body><p>Hello</p></body></html>`;
    const { title, text } = await extractHtml(html, BASE);
    expect(title).toBe("Galleria Marchetti");
    expect(text).not.toContain("Galleria Marchetti");
  });

  test("joins table cells with ' | '", async () => {
    const html = `<table><tr><td>Seated</td><td>150</td></tr></table>`;
    const { text } = await extractHtml(html, BASE);
    expect(text).toContain("Seated | 150 |");
  });

  test("resolves relative links against baseUrl and separates pdf asset candidates", async () => {
    const html = `<a href="/private-events">Private Events</a><a href="/docs/brochure.pdf">Brochure</a>`;
    const { links, assetCandidates } = await extractHtml(html, BASE);
    expect(links).toEqual([{ href: "https://venue.com/private-events", text: "Private Events", fromNav: false }]);
    expect(assetCandidates).toEqual([{ href: "https://venue.com/docs/brochure.pdf", text: "Brochure" }]);
  });

  test("detects nav/header/footer ancestry", async () => {
    const html = `
      <nav><a href="/weddings">Weddings</a></nav>
      <header><a href="/about">About</a></header>
      <main><a href="/random">Random</a></main>
      <footer><a href="/contact">Contact</a></footer>
    `;
    const { links } = await extractHtml(html, BASE);
    const byHref = Object.fromEntries(links.map((l) => [l.href, l.fromNav]));
    expect(byHref["https://venue.com/weddings"]).toBe(true);
    expect(byHref["https://venue.com/about"]).toBe(true);
    expect(byHref["https://venue.com/contact"]).toBe(true);
    expect(byHref["https://venue.com/random"]).toBe(false);
  });

  test("skips mailto/tel/hash-only links", async () => {
    const html = `<a href="mailto:a@venue.com">Email</a><a href="tel:+13125551234">Call</a><a href="#top">Top</a>`;
    const { links, assetCandidates } = await extractHtml(html, BASE);
    expect(links).toHaveLength(0);
    expect(assetCandidates).toHaveLength(0);
  });

  test("collapses whitespace and caps consecutive newlines at 3", async () => {
    const html = `<p>One</p>\n\n\n\n\n\n<p>Two</p>`;
    const { text } = await extractHtml(html, BASE);
    expect(text).not.toMatch(/\n{4,}/);
  });

  test("isJsShell is true for very short text (JS-rendered app shell)", async () => {
    const html = `<html><body><div id="root"></div></body></html>`;
    const { isJsShell, text } = await extractHtml(html, BASE);
    expect(text.length).toBeLessThan(400);
    expect(isJsShell).toBe(true);
  });

  test("isJsShell is false once there is real page content", async () => {
    const html = `<body><p>${"Real venue content. ".repeat(30)}</p></body>`;
    const { isJsShell } = await extractHtml(html, BASE);
    expect(isJsShell).toBe(false);
  });
});
