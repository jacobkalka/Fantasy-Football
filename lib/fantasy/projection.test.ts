import { describe, expect, it } from "vitest";
import type { PlayerLive } from "@/lib/live/types";
import { normalCdf, projectPlayer, projectTeam, winProbability } from "./projection";

function player(over: Partial<PlayerLive> & { state?: "pre" | "in" | "post"; period?: number; clock?: string }): PlayerLive {
  const { state = "pre", period = 0, clock = "15:00", ...rest } = over;
  return {
    playerId: "1",
    name: "P",
    position: "WR",
    teamId: "1",
    game: {
      id: "g",
      state,
      statusText: "",
      period,
      clock,
      kickoff: "2026-10-26T17:00:00Z",
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
    points: 0,
    playPoints: 0,
    correction: 0,
    projection: 10,
    liveProjection: 10,
    scoringSupported: true,
    ...rest,
  };
}

describe("live projection", () => {
  it("equals the projection before kickoff and the points after the game", () => {
    expect(projectPlayer(player({})).projected).toBe(10);
    expect(projectPlayer(player({ state: "post", points: 14.37 })).projected).toBe(14.37);
  });

  it("adds the projection for the time left at halftime", () => {
    const p = projectPlayer(player({ state: "in", period: 3, clock: "15:00", points: 6.2 }));
    expect(p.remaining).toBeCloseTo(0.5);
    expect(p.projected).toBeCloseTo(11.2);
  });

  it("adds nothing for a player who's out or on bye", () => {
    expect(projectPlayer(player({ injuryStatus: "OUT" })).projected).toBe(0);
    expect(projectPlayer(player({ onBye: true, game: null })).projected).toBe(0);
  });

  it("keeps two decimals in team totals", () => {
    const t = projectTeam([player({ state: "post", points: 12.47 }), player({ state: "post", points: 3.04 })]);
    expect(t.points).toBe(15.51);
  });
});

describe("win probability", () => {
  it("is 50% for equal projections and certain once nothing is left to play", () => {
    expect(winProbability({ projected: 100, sd: 10 }, { projected: 100, sd: 10 })).toBeCloseTo(0.5);
    expect(winProbability({ projected: 101, sd: 0 }, { projected: 100, sd: 0 })).toBe(1);
  });

  it("grows with the projected margin", () => {
    const close = winProbability({ projected: 105, sd: 10 }, { projected: 100, sd: 10 });
    const far = winProbability({ projected: 120, sd: 10 }, { projected: 100, sd: 10 });
    expect(close).toBeGreaterThan(0.5);
    expect(far).toBeGreaterThan(close);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });
});
