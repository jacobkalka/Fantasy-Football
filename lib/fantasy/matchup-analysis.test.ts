import { describe, expect, it } from "vitest";
import type { FeedItem, PlayerLive } from "@/lib/live/types";
import type { LeagueRosterEntry, LeagueSlot } from "@/lib/providers/types";
import { readMatchup, scoreProgression, slotPairs } from "./matchup-analysis";

function entry(id: string, slot: LeagueSlot): LeagueRosterEntry {
  return { playerId: id, name: id, position: "WR", teamId: "1", slot, injuryStatus: "ACTIVE", points: null, projected: 10 };
}
function live(id: string, points: number, projection: number, state: "pre" | "in" | "post", period = 0): PlayerLive {
  return {
    playerId: id,
    name: id,
    position: "WR",
    teamId: "1",
    game: {
      id: "g",
      state,
      statusText: "",
      period,
      clock: "0:00",
      kickoff: "",
      isHome: true,
      teamId: "1",
      opponentId: "2",
      teamScore: 0,
      opponentScore: 0,
      hasBall: false,
      possession: null,
      downDistance: null,
      isRedZone: false,
    },
    onBye: false,
    stats: {},
    points,
    playPoints: points,
    correction: 0,
    projection,
    liveProjection: projection,
    scoringSupported: true,
  };
}

describe("matchup reading", () => {
  const me = {
    starters: [
      { entry: entry("a", "QB"), live: live("a", 25.5, 18, "post") },
      { entry: entry("b", "WR"), live: live("b", 2.1, 15, "post") },
      { entry: entry("c", "WR"), live: live("c", 0, 12, "pre") },
    ],
  };
  const them = {
    starters: [
      { entry: entry("x", "QB"), live: live("x", 12.04, 20, "post") },
      { entry: entry("y", "WR"), live: live("y", 9.9, 9, "post") },
    ],
  };

  it("pairs starters by slot and measures the projected edge", () => {
    const pairs = slotPairs(me, them);
    expect(pairs.map((p) => p.slot)).toEqual(["QB", "WR", "WR"]);
    expect(pairs[0].edge).toBeCloseTo(13.46);
    expect(pairs[2].theirs).toBeNull();
  });

  it("finds advantages, drivers, players under projection and who's left", () => {
    const r = readMatchup(me, them);
    expect(r.advantages[0].slot).toBe("QB");
    expect(r.disadvantages[0].slot).toBe("WR");
    expect(r.drivers[0].live.playerId).toBe("a");
    expect(r.under.map((u) => u.live.playerId)).toContain("b");
    expect(r.toPlay.map((t) => t.live.playerId)).toEqual(["c"]);
  });
});

describe("score progression", () => {
  it("rebuilds both teams' running totals from real plays in time order", () => {
    const item = (id: string, playerId: string, points: number, at: string): FeedItem => ({
      id,
      kind: "points",
      playId: id,
      gameId: "g",
      playerId,
      playerName: playerId,
      teamId: "1",
      period: 1,
      clock: "",
      sequence: 1,
      wallclock: at,
      text: "",
      playType: "",
      isTouchdown: false,
      points,
      parts: [],
    });
    const feed = [
      item("2", "x", 6, "2026-10-26T17:10:00Z"),
      item("1", "a", 4.04, "2026-10-26T17:05:00Z"),
      item("3", "a", 1.1, "2026-10-26T17:20:00Z"),
    ];
    const curve = scoreProgression(feed, new Set(["a"]), new Set(["x"]));
    expect(curve.map((p) => [p.me, p.them])).toEqual([
      [4.04, 0],
      [4.04, 6],
      [5.14, 6],
    ]);
  });
});
