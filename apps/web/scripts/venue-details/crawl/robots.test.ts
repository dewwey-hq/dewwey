import { describe, expect, test } from "vitest";
import { isPathAllowed, parseRobotsTxt } from "./robots";

describe("parseRobotsTxt + isPathAllowed", () => {
  test("missing/empty robots.txt allows everything", () => {
    const policy = parseRobotsTxt("", "DewweyVenueBot");
    expect(isPathAllowed(policy, "/anything")).toBe(true);
    expect(isPathAllowed(policy, "/wp-admin")).toBe(true);
  });

  test("longest match wins between Allow and Disallow", () => {
    const text = `
      User-agent: *
      Disallow: /private
      Allow: /private/public-brochure
    `;
    const policy = parseRobotsTxt(text, "DewweyVenueBot");
    expect(isPathAllowed(policy, "/private/secret")).toBe(false);
    expect(isPathAllowed(policy, "/private/public-brochure")).toBe(true);
    expect(isPathAllowed(policy, "/private/public-brochure/extra")).toBe(true);
  });

  test("a bot-specific group replaces the wildcard group entirely", () => {
    const text = `
      User-agent: *
      Disallow: /

      User-agent: DewweyVenueBot
      Disallow: /admin
    `;
    const policy = parseRobotsTxt(text, "DewweyVenueBot");
    // Wildcard disallows everything, but the bot-specific group only disallows /admin.
    expect(isPathAllowed(policy, "/weddings")).toBe(true);
    expect(isPathAllowed(policy, "/admin")).toBe(false);
  });

  test("falls back to wildcard group when no bot-specific group exists", () => {
    const text = `
      User-agent: *
      Disallow: /wp-admin
    `;
    const policy = parseRobotsTxt(text, "DewweyVenueBot");
    expect(isPathAllowed(policy, "/wp-admin/x")).toBe(false);
    expect(isPathAllowed(policy, "/weddings")).toBe(true);
  });

  test("crawl-delay is parsed in milliseconds and capped at 10s", () => {
    const short = parseRobotsTxt("User-agent: *\nCrawl-delay: 2", "DewweyVenueBot");
    expect(short.crawlDelayMs).toBe(2000);

    const long = parseRobotsTxt("User-agent: *\nCrawl-delay: 60", "DewweyVenueBot");
    expect(long.crawlDelayMs).toBe(10_000);
  });

  test("an empty Disallow value means disallow nothing", () => {
    const policy = parseRobotsTxt("User-agent: *\nDisallow:", "DewweyVenueBot");
    expect(isPathAllowed(policy, "/anything")).toBe(true);
  });

  test("comments and blank lines are ignored", () => {
    const text = `
      # comment
      User-agent: *
      # another comment
      Disallow: /secret
    `;
    const policy = parseRobotsTxt(text, "DewweyVenueBot");
    expect(isPathAllowed(policy, "/secret")).toBe(false);
    expect(isPathAllowed(policy, "/open")).toBe(true);
  });
});
