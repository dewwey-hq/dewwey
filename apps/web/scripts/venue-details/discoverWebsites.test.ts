import { describe, it, expect } from "vitest";
import { isLinkAggregatorUrl } from "./discoverWebsites";

// f1 (2026-09-20): a link-in-bio aggregator answers 200 with real HTML, so reachability alone
// verified it as a venue website. @thewellsley was then crawled from `lnk.bio/thewellsley` +
// `lnk.bio/weddings` and served with every spine field null.
describe("isLinkAggregatorUrl", () => {
  it("rejects the aggregators found among verified venue websites", () => {
    expect(isLinkAggregatorUrl("https://lnk.bio/thewellsley")).toBe(true);
    expect(isLinkAggregatorUrl("http://lnk.bio/cabrachicago")).toBe(true);
    expect(isLinkAggregatorUrl("http://campsite.bio/drurylane")).toBe(true);
    expect(isLinkAggregatorUrl("https://linktr.ee/terrace16chicago?utm_source=linktree_profile_share")).toBe(true);
  });

  it("matches on www and on subdomains of an aggregator, not on a lookalike domain", () => {
    expect(isLinkAggregatorUrl("https://www.linktr.ee/somevenue")).toBe(true);
    expect(isLinkAggregatorUrl("https://foo.bio.link/somevenue")).toBe(true);
    expect(isLinkAggregatorUrl("https://mylnk.biography.com/")).toBe(false);
  });

  it("passes a venue's own website", () => {
    expect(isLinkAggregatorUrl("https://www.chiwinery.com/")).toBe(false);
    expect(isLinkAggregatorUrl("https://thearborychicago.com/")).toBe(false);
  });

  it("returns false for an unparseable url rather than throwing", () => {
    expect(isLinkAggregatorUrl("not a url")).toBe(false);
    expect(isLinkAggregatorUrl("")).toBe(false);
  });
});
