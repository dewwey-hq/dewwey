/**
 * robots.txt fetch + parse, once per host, for the venue-details crawl. Longest-match
 * Allow/Disallow (the de-facto standard, matching Google's parser), `User-agent: *` and
 * `DewweyVenueBot` groups, `Crawl-delay` honored up to 10s. A missing/unfetchable
 * robots.txt allows everything. Pure parsing is unit tested against fixture text;
 * `fetchRobots` does the one network call per host and is not unit tested (network I/O).
 */

interface RobotsRule {
  prefix: string;
  allow: boolean;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  crawlDelayMs: number;
}

const MAX_CRAWL_DELAY_MS = 10_000;

/** Parse robots.txt text into a policy for one user-agent, preferring an exact
 * `User-agent: <botName>` group over `User-agent: *` when both exist (never merges the two —
 * a bot-specific group replaces the wildcard group entirely, per the spec). */
export function parseRobotsTxt(text: string, botName: string): RobotsPolicy {
  const lines = text.split(/\r?\n/);
  const botNameLower = botName.toLowerCase();

  // Group lines by contiguous User-agent block(s) followed by directives.
  type Group = { agents: string[]; rules: RobotsRule[]; crawlDelayMs: number | null };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === "user-agent") {
      // A new User-agent line right after directives starts a new group; consecutive
      // User-agent lines (no directives yet) extend the same group.
      if (!current || current.rules.length > 0 || current.crawlDelayMs !== null) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      if (!current) continue;
      current.rules.push({ prefix: value, allow: field === "allow" });
    } else if (field === "crawl-delay") {
      if (!current) continue;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) current.crawlDelayMs = seconds * 1000;
    }
  }

  const exact = groups.find((g) => g.agents.includes(botNameLower));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const chosen = exact ?? wildcard;

  if (!chosen) return { rules: [], crawlDelayMs: 0 };

  return {
    rules: chosen.rules,
    crawlDelayMs: Math.min(chosen.crawlDelayMs ?? 0, MAX_CRAWL_DELAY_MS),
  };
}

/** Longest-match Allow/Disallow against `path` (pathname + search). An empty rule set (no
 * matching group, or no robots.txt at all) allows everything. */
export function isPathAllowed(policy: RobotsPolicy, path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of policy.rules) {
    if (rule.prefix === "") {
      // An empty Disallow means "disallow nothing"; an empty Allow is a no-op either way.
      if (!rule.allow) continue;
    }
    if (path.startsWith(rule.prefix)) {
      if (!best || rule.prefix.length > best.prefix.length) best = rule;
    }
  }
  return best ? best.allow : true;
}

const ROBOTS_CACHE = new Map<string, RobotsPolicy>();

/** Fetch + parse robots.txt for `origin`'s host once, caching the result for the process
 * lifetime. Any fetch/parse failure (404, timeout, network error) is treated as "allow all". */
export async function fetchRobots(origin: string, botName: string, userAgent: string): Promise<RobotsPolicy> {
  const host = new URL(origin).origin;
  const cached = ROBOTS_CACHE.get(host);
  if (cached) return cached;

  let policy: RobotsPolicy = { rules: [], crawlDelayMs: 0 };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${host}/robots.txt`, {
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const text = await res.text();
      policy = parseRobotsTxt(text, botName);
    }
  } catch {
    // Missing/unfetchable robots.txt -> allow all (spec default).
  }
  ROBOTS_CACHE.set(host, policy);
  return policy;
}

export function clearRobotsCache(): void {
  ROBOTS_CACHE.clear();
}

export const VENUE_BOT_NAME = "DewweyVenueBot";
export const VENUE_BOT_USER_AGENT = "DewweyVenueBot/1.0 (+https://dewwey.com/bot; venue facts for couples)";

/** Convenience wrapper crawlVenue.ts calls per URL: fetches/caches robots.txt for the URL's
 * host (matching `DewweyVenueBot` or `*`) and returns whether that path is allowed. */
export async function isAllowed(url: string): Promise<boolean> {
  const policy = await fetchRobots(url, VENUE_BOT_NAME, VENUE_BOT_USER_AGENT);
  const u = new URL(url);
  return isPathAllowed(policy, `${u.pathname}${u.search}`);
}
