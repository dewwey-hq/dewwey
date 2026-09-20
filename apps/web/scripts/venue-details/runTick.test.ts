import { describe, expect, it } from "vitest";
import {
  buildCoverageCommand,
  buildCrawlCommand,
  buildExtractCommand,
  buildFunnelCommand,
  buildRepairCommand,
  buildScoreCommands,
  buildServeCommand,
  buildValidateCommand,
  computeRemainingBudget,
  defaultReportsDir,
  formatTickDate,
  formatTickRow,
  goldenSlugsInPopulation,
  inferTickKind,
  parseIdsFileText,
  type TickRow,
} from "./runTick";
import { GOLDEN_ACCOUNT_IDS, GOLDEN_SLUGS } from "../../lib/venueDetails/golden";

describe("inferTickKind", () => {
  it("infers calibration from a leading 'c'", () => {
    expect(inferTickKind("c0")).toBe("calibration");
    expect(inferTickKind("c17")).toBe("calibration");
  });

  it("infers fill from a leading 'f'", () => {
    expect(inferTickKind("f1")).toBe("fill");
    expect(inferTickKind("f23")).toBe("fill");
  });

  it("throws on anything else", () => {
    expect(() => inferTickKind("x1")).toThrow();
    expect(() => inferTickKind("")).toThrow();
  });
});

describe("parseIdsFileText", () => {
  it("parses one id per non-blank line", () => {
    expect(parseIdsFileText("31\n477\n\n507\n")).toEqual([31, 477, 507]);
  });
});

describe("defaultReportsDir", () => {
  it("joins to <appsWebDir>/../../docs/engineering/venue-enrichment/loop/reports/<tick>", () => {
    expect(defaultReportsDir("/home/jhoffen/dewwey/apps/web", "f1")).toBe(
      "/home/jhoffen/dewwey/docs/engineering/venue-enrichment/loop/reports/f1"
    );
  });
});

describe("goldenSlugsInPopulation", () => {
  it("returns all six when every golden account id is present", () => {
    const allIds = Object.values(GOLDEN_ACCOUNT_IDS);
    expect(goldenSlugsInPopulation(allIds).sort()).toEqual([...GOLDEN_SLUGS].sort());
  });

  it("narrows to a subset when only some golden accounts are present", () => {
    expect(goldenSlugsInPopulation([GOLDEN_ACCOUNT_IDS["galleria-marchetti"], 999999])).toEqual(["galleria-marchetti"]);
  });

  it("returns empty for a fill population with no golden accounts", () => {
    expect(goldenSlugsInPopulation([1, 2, 3])).toEqual([]);
  });
});

describe("computeRemainingBudget", () => {
  it("subtracts spend from the cap", () => {
    expect(computeRemainingBudget(10, 3.2)).toBe(6.8);
  });

  it("floors at 0 when spend already exceeds the cap", () => {
    expect(computeRemainingBudget(10, 15)).toBe(0);
  });

  it("returns the full cap when nothing has been spent", () => {
    expect(computeRemainingBudget(10, 0)).toBe(10);
  });
});

describe("command assembly: calibration tick (--golden, dry-run shape)", () => {
  const ids = Object.values(GOLDEN_ACCOUNT_IDS);
  const tick = "c1";

  it("builds the crawl command with the golden population and the tick's crawl batch", () => {
    expect(buildCrawlCommand(ids, tick)).toEqual([
      "scripts/venue-details/crawlVenue.ts",
      "--account-ids",
      ids.join(","),
      "--crawl-batch",
      "vd-crawl-c1",
      "--seed-urls",
      "scripts/venue-details/seeds/golden-seeds.csv",
    ]);
  });

  it("builds the coverage command with --out under the reports dir", () => {
    expect(buildCoverageCommand(ids, "/reports/c1")).toEqual([
      "scripts/venue-details/reportCrawlCoverage.ts",
      "--account-ids",
      ids.join(","),
      "--out",
      "/reports/c1/coverage.md",
    ]);
  });

  it("passes --golden through on extract, never --prompt-version", () => {
    const cmd = buildExtractCommand(ids, 10, true);
    expect(cmd).toContain("--golden");
    expect(cmd).not.toContain("--prompt-version");
    expect(cmd).toEqual(["scripts/venue-details/extractVenueDetails.ts", "--account-ids", ids.join(","), "--max-cost-usd", "10", "--golden"]);
  });

  it("builds validate with --write --report", () => {
    expect(buildValidateCommand(ids, null)).toEqual(["scripts/venue-details/validateVenueDetails.ts", "--account-ids", ids.join(","), "--write", "--report"]);
  });

  it("builds repair with --max-rounds 1 and the remaining budget", () => {
    expect(buildRepairCommand(ids, 6.8)).toEqual(["scripts/venue-details/repairVenueDetails.ts", "--account-ids", ids.join(","), "--max-rounds", "1", "--max-cost-usd", "6.8"]);
  });

  it("scores one scoreAgainstGolden --mustnot call per golden slug in the population", () => {
    const commands = buildScoreCommands("calibration", ids, null);
    expect(commands).toHaveLength(GOLDEN_SLUGS.length);
    for (const [i, slug] of GOLDEN_SLUGS.entries()) {
      expect(commands[i]).toEqual([
        "scripts/venue-details/scoreAgainstGolden.ts",
        "--slug",
        slug,
        "--source",
        "runs",
        "--mustnot",
        "--account-map",
        "scripts/venue-details/mustnot/account-map.csv",
      ]);
    }
  });

  it("builds the serve command as a dry run by default, --apply only when asked", () => {
    expect(buildServeCommand(ids, tick, false, null)).toEqual(["scripts/venue-details/serveVenueDetails.ts", "--batch-id", "vd-serve-c1", "--account-ids", ids.join(",")]);
    expect(buildServeCommand(ids, tick, true, null)).toEqual([
      "scripts/venue-details/serveVenueDetails.ts",
      "--batch-id",
      "vd-serve-c1",
      "--account-ids",
      ids.join(","),
      "--apply",
    ]);
  });

  it("builds the funnel command with --out and --json under the reports dir", () => {
    expect(buildFunnelCommand("/reports/c1", null)).toEqual(["scripts/venue-details/reportVenueDetailsFunnel.ts", "--out", "/reports/c1/funnel.md", "--json"]);
  });

  it("passes through --prompt-version to the steps that accept it", () => {
    expect(buildValidateCommand(ids, "venue-details-v3.1")).toContain("--prompt-version");
    expect(buildServeCommand(ids, tick, false, "venue-details-v3.1")).toEqual([
      "scripts/venue-details/serveVenueDetails.ts",
      "--batch-id",
      "vd-serve-c1",
      "--account-ids",
      ids.join(","),
      "--prompt-version",
      "venue-details-v3.1",
    ]);
  });
});

describe("command assembly: fill tick (--ids-file, dry-run shape)", () => {
  const ids = [31, 477, 507];
  const tick = "f1";

  it("does not pass --golden on extract", () => {
    const cmd = buildExtractCommand(ids, 10, false);
    expect(cmd).not.toContain("--golden");
  });

  it("scores with a single checkUniversal.ts call over the whole population", () => {
    const commands = buildScoreCommands("fill", ids, null);
    expect(commands).toEqual([["scripts/venue-details/mustnot/checkUniversal.ts", "--account-ids", "31,477,507"]]);
  });

  it("names the crawl/serve batches after the fill tick id", () => {
    expect(buildCrawlCommand(ids, tick)).toContain("vd-crawl-f1");
    expect(buildServeCommand(ids, tick, false, null)).toContain("vd-serve-f1");
  });
});

describe("formatTickRow", () => {
  it("renders the ticks.md columns in order with gate/commit left blank", () => {
    const row: TickRow = {
      tick: "f1",
      date: "2026-09-19",
      venues: 30,
      pagesTotal: 210,
      pagesUsable: 180,
      extracted: 28,
      skipped: 2,
      validatedOk: 25,
      needsReview: 3,
      repaired: 5,
      served: 25,
      compareReady: 40,
      excellent: 12,
      costTickUsd: 4.5,
      costCumulativeUsd: 9.75,
      notes: "first fill tick",
    };
    expect(formatTickRow(row)).toBe(
      "| f1 | 2026-09-19 | 30 | 210/180 | 28/2 | 25/3 | 5 | 25 | 40 | 12 | $4.50 | $9.75 |  |  | first fill tick |"
    );
  });
});

describe("formatTickDate", () => {
  it("formats a known instant as America/Chicago YYYY-MM-DD", () => {
    // 2026-09-20T04:30:00Z is 2026-09-19 23:30 in America/Chicago (CDT, UTC-5).
    expect(formatTickDate(new Date("2026-09-20T04:30:00Z"))).toBe("2026-09-19");
  });
});
