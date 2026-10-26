import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreUniverse } from "@/lib/analysis/universe";
import { parsePlayerUniverse } from "@/lib/providers/espn/universe";
import { consistencyLabel, rankUniverse, sortRanked } from "./rankings";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));
const raw = parsePlayerUniverse(sample("fantasy-universe-week7.json"), sample("fantasy-pro-team-schedules.json"), 2026, 7);

describe("season rankings (real week-7 universe)", () => {
  const rows = rankUniverse(scoreUniverse(raw, "ppr"));

  it("ranks overall and by position from season totals", () => {
    expect(rows[0].overallRank).toBe(1);
    expect(rows[0].total).toBeGreaterThanOrEqual(rows[1].total);
    const qbs = rows.filter((r) => r.position === "QB").sort((a, b) => a.positionRank - b.positionRank);
    expect(qbs[0].positionRank).toBe(1);
    expect(qbs[0].total).toBeGreaterThanOrEqual(qbs[1].total);
  });

  it("computes per-game, recent, floor and ceiling from real weeks", () => {
    const r = rows.find((p) => p.games >= 5)!;
    expect(r.ppg).toBeCloseTo(r.total / r.games, 1);
    expect(r.floor!).toBeLessThanOrEqual(r.ceiling!);
    expect(r.weekly.length).toBe(r.games);
    expect(r.weekly.every((w) => w.positionRank >= 1)).toBe(true);
  });

  it("sorts by projection and keeps players without one last", () => {
    const sorted = sortRanked(rows, "projection");
    expect(sorted[0].projection).not.toBeNull();
    const firstNull = sorted.findIndex((r) => r.projection === null);
    if (firstNull >= 0) expect(sorted.slice(firstNull).every((r) => r.projection === null)).toBe(true);
  });

  it("labels consistency", () => {
    expect(consistencyLabel(0.3)).toBe("Steady");
    expect(consistencyLabel(0.9)).toBe("Boom or bust");
    expect(consistencyLabel(null)).toBeNull();
  });
});
