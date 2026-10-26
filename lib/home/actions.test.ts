import { describe, expect, it } from "vitest";
import type { RankedPlayer } from "@/lib/players/rankings";
import { recommendedActions } from "./actions";

const row = (over: Partial<RankedPlayer>): RankedPlayer => ({
  id: "1",
  name: "Test Player",
  position: "WR",
  teamId: "1",
  headshot: null,
  injuryStatus: "ACTIVE",
  byeWeek: null,
  percentOwned: 90,
  percentOwnedChange: 0,
  games: 6,
  total: 60,
  ppg: 10,
  recent: 10,
  overallRank: 10,
  positionRank: 5,
  ppgPositionRank: 5,
  projection: 10,
  projectedPositionRank: 5,
  restOfSeason: 100,
  volatility: 0.4,
  floor: 6,
  ceiling: 14,
  best: 20,
  weekly: [],
  trend: 0,
  ...over,
});

describe("recommended actions", () => {
  it("puts urgent lineup problems first and links each to its tool", () => {
    const actions = recommendedActions({
      decisions: [
        { id: "bye-1", urgency: "high", title: "J. Doe is on bye this week", detail: "He'll score 0.", compare: ["1", "2"] },
      ],
      weaknesses: [],
      pickups: [],
      ranked: [row({ id: "9", name: "Hot Hand", trend: 6, recent: 16 })],
      rosterIds: new Set(["9"]),
      taken: new Set(),
      isLeague: true,
    });
    expect(actions[0].kind).toBe("lineup");
    expect(actions[0].href).toBe("/start-sit?ids=1,2");
    expect(actions[0].detail).toMatch(/on ESPN/);
    expect(actions.some((a) => a.kind === "trend" && a.title.includes("trending up"))).toBe(true);
  });

  it("suggests a rising player only when he's not yours or taken", () => {
    const base = { decisions: [], weaknesses: [], pickups: [], isLeague: false };
    const riser = row({ id: "5", name: "Waiver Guy", percentOwned: 30, percentOwnedChange: 12 });
    expect(recommendedActions({ ...base, ranked: [riser], rosterIds: new Set(), taken: new Set() })[0].kind).toBe("waiver");
    expect(recommendedActions({ ...base, ranked: [riser], rosterIds: new Set(), taken: new Set(["5"]) })).toHaveLength(0);
  });
});
