import { describe, expect, test } from "vitest";
import { buildSeedQueueItems, parseSeedsCsv, SEED_SCORE, type Seed } from "./crawlVenue";

describe("parseSeedsCsv", () => {
  test("parses account_id,url,note rows", () => {
    const csv = `account_id,url,note\n31,https://framerusercontent.com/assets/x.pdf,"wedding brochure, client-rendered"\n`;
    const seeds = parseSeedsCsv(csv);
    expect(seeds).toEqual([{ accountId: 31, url: "https://framerusercontent.com/assets/x.pdf", note: "wedding brochure, client-rendered" }]);
  });

  test("note is optional and defaults to an empty string", () => {
    const csv = `account_id,url\n1131,https://www.datocms-assets.com/44232/wine-list.pdf\n`;
    const seeds = parseSeedsCsv(csv);
    expect(seeds).toEqual([{ accountId: 1131, url: "https://www.datocms-assets.com/44232/wine-list.pdf", note: "" }]);
  });

  test("skips rows with a non-numeric account_id or an empty url", () => {
    const csv = `account_id,url,note\nnot-a-number,https://x.com/a.pdf,bad row\n31,,also bad\n477,https://greenhouseloft.com/s/x.pdf,good row\n`;
    const seeds = parseSeedsCsv(csv);
    expect(seeds).toEqual([{ accountId: 477, url: "https://greenhouseloft.com/s/x.pdf", note: "good row" }]);
  });

  test("groups multiple rows for the same account and different accounts independently", () => {
    const csv = `account_id,url,note\n31,https://a.com/1.pdf,first\n31,https://a.com/2.pdf,second\n1131,https://b.com/3.pdf,third\n`;
    const seeds = parseSeedsCsv(csv);
    expect(seeds.filter((s) => s.accountId === 31)).toHaveLength(2);
    expect(seeds.filter((s) => s.accountId === 1131)).toHaveLength(1);
  });

  test("throws when the required columns are missing", () => {
    expect(() => parseSeedsCsv(`account_id,note\n31,x\n`)).toThrow(/url/);
  });

  test("handles the real golden-seeds.csv fixture (escaped quotes inside a quoted note)", () => {
    const csv = `account_id,url,note\n1131,https://example.com/wine-list.pdf,"wine list; ""Wine List"" is a sibling heading, not anchor text"\n`;
    const seeds = parseSeedsCsv(csv);
    expect(seeds[0].note).toBe('wine list; "Wine List" is a sibling heading, not anchor text');
  });
});

describe("buildSeedQueueItems", () => {
  const seeds: Seed[] = [
    { accountId: 31, url: "https://framerusercontent.com/assets/brochure.pdf", note: "brochure" },
    { accountId: 31, url: "https://venue.com/some-page", note: "html seed" },
  ];

  test("enqueues every seed at depth 0 with SEED_SCORE, tagged isSeed", () => {
    const items = buildSeedQueueItems(seeds);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.depth).toBe(0);
      expect(item.score).toBe(SEED_SCORE);
      expect(item.isSeed).toBe(true);
    }
  });

  test("carries the seed note through as seedNote", () => {
    const [pdfItem, htmlItem] = buildSeedQueueItems(seeds);
    expect(pdfItem.seedNote).toBe("brochure");
    expect(htmlItem.seedNote).toBe("html seed");
  });

  test("classifies pdf vs html seeds correctly", () => {
    const [pdfItem, htmlItem] = buildSeedQueueItems(seeds);
    expect(pdfItem.isPdf).toBe(true);
    expect(htmlItem.isPdf).toBe(false);
  });

  test("enqueue ordering: seeds (score 10) sort ahead of normal negative/low-score discoveries but behind a higher-scoring page and the homepage", () => {
    const queue = [
      { url: "https://venue.com/", depth: 0, score: Number.POSITIVE_INFINITY, isPdf: false, anchorText: "" },
      { url: "https://venue.com/blog/post", depth: 1, score: -10, isPdf: false, anchorText: "" },
      { url: "https://venue.com/faq", depth: 1, score: 6, isPdf: false, anchorText: "" },
      ...buildSeedQueueItems(seeds),
      { url: "https://venue.com/weddings-brochure.pdf", depth: 1, score: 15, isPdf: true, anchorText: "" },
    ];
    queue.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.depth - b.depth));
    const order = queue.map((i) => i.url);
    expect(order).toEqual([
      "https://venue.com/", // Infinity
      "https://venue.com/weddings-brochure.pdf", // 15
      "https://framerusercontent.com/assets/brochure.pdf", // SEED_SCORE 10
      "https://venue.com/some-page", // SEED_SCORE 10
      "https://venue.com/faq", // 6
      "https://venue.com/blog/post", // -10
    ]);
  });
});
