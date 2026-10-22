import { describe, expect, it } from "vitest";
import { buildNotes, decide, MODEL, normalCdf, scorePlayer, shortName, toughnessLabel } from "./model";
import type { PlayerFactors } from "./types";

/** A healthy WR with a projection and nothing else known. Override what a test needs. */
function wr(overrides: Partial<PlayerFactors> = {}): PlayerFactors {
  return {
    playerId: "1",
    name: "Alpha Receiver",
    position: "WR",
    teamId: "10",
    teamAbbr: "AAA",
    headshot: null,
    unavailable: null,
    injuryStatus: "ACTIVE",
    projection: 15,
    recent: [],
    matchup: null,
    vegas: null,
    weather: null,
    game: { id: "g1", kickoff: "2026-10-25T17:00Z", state: "pre", isHome: true, opponentAbbr: "ZZZ" },
    ...overrides,
  };
}

const matchup = (allowedPerGame: number, rank = 16, games = 6) => ({
  opponentId: "20",
  opponentAbbr: "ZZZ",
  rank,
  teams: 32,
  allowedPerGame,
  leagueAverage: 30,
  games,
});

const vegas = (impliedTotal: number) => ({ teamAbbr: "AAA", impliedTotal, leagueAverage: 22.5, overUnder: 45, spread: -3 });

const pct = (player: PlayerFactors, key: string) => scorePlayer(player).factors.find((f) => f.key === key)!.pct;

describe("scorePlayer", () => {
  it("starts from ESPN's projection when nothing else is known", () => {
    const v = scorePlayer(wr({ injuryStatus: null, game: null }));
    expect(v.base).toBe(15);
    expect(v.score).toBe(15);
    expect(v.playing).toBe(true);
    // Only the projection is real data.
    expect(v.dataQuality).toBe(MODEL.quality.projection);
    expect(v.factors.filter((f) => !f.available).map((f) => f.key)).toEqual(["matchup", "form", "vegas", "weather", "injury"]);
  });

  it("nudges up for an easy matchup and down for a tough one, capped at ±8%", () => {
    // Allows 30% more than average: 0.30 × 0.25 = +7.5%.
    expect(pct(wr({ matchup: matchup(39) }), "matchup")).toBeCloseTo(0.075);
    expect(pct(wr({ matchup: matchup(21) }), "matchup")).toBeCloseTo(-0.075);
    // Allows double the average: capped.
    expect(pct(wr({ matchup: matchup(60) }), "matchup")).toBeCloseTo(0.08);
    // Only 2 games of data: trusted half as much.
    expect(pct(wr({ matchup: matchup(39, 30, 2) }), "matchup")).toBeCloseTo(0.0375);
  });

  it("explains the matchup in words with the numbers", () => {
    const detail = scorePlayer(wr({ matchup: matchup(39, 30) })).factors.find((f) => f.key === "matchup")!.detail;
    expect(detail).toBe("vs ZZZ: the 3rd-easiest defense vs WRs, allowing 39.0 pts a game (average 30.0).");
  });

  it("gives recent form a light touch, only with 3+ games", () => {
    const hot = [10, 10, 10, 20, 20, 20].map((points, i) => ({ week: i + 1, points }));
    // Last 3 average 20 vs season 15: +33% × 0.15 = +5%.
    expect(pct(wr({ recent: hot }), "form")).toBeCloseTo(0.05);
    expect(scorePlayer(wr({ recent: hot.slice(0, 2) })).factors.find((f) => f.key === "form")!.available).toBe(false);
  });

  it("uses the Vegas implied team total, capped at ±6%", () => {
    // 25 vs 22.5 average: +11.1% × 0.3 = +3.3%.
    expect(pct(wr({ vegas: vegas(25) }), "vegas")).toBeCloseTo(0.0333, 3);
    expect(pct(wr({ vegas: vegas(35) }), "vegas")).toBeCloseTo(0.06);
  });

  it("only lets bad weather hurt the passing game, and never indoors", () => {
    const rain = { indoor: false, text: "Rain showers", temperature: 50 };
    expect(pct(wr({ weather: rain }), "weather")).toBeCloseTo(-0.04);
    expect(pct(wr({ position: "RB", weather: rain }), "weather")).toBe(0);
    expect(pct(wr({ weather: { indoor: true } }), "weather")).toBe(0);
    expect(pct(wr({ weather: { indoor: false, text: "Snow, windy", temperature: 20 } }), "weather")).toBeCloseTo(-0.11);
  });

  it("caps all non-injury nudges together at ±18%", () => {
    const hot = [5, 5, 5, 30, 30, 30].map((points, i) => ({ week: i + 1, points }));
    const v = scorePlayer(wr({ matchup: matchup(60), vegas: vegas(40), recent: hot }));
    const total = v.factors.filter((f) => f.key !== "projection").reduce((sum, f) => sum + f.pct, 0);
    expect(total).toBeCloseTo(MODEL.totalCap);
    // The points shown for each factor add up to the final score.
    const sum = v.factors.reduce((s, f) => s + f.points, 0);
    expect(sum).toBeCloseTo(v.score, 1);
  });

  it("takes an injury designation into account and widens the range", () => {
    const healthy = scorePlayer(wr());
    const questionable = scorePlayer(wr({ injuryStatus: "QUESTIONABLE" }));
    expect(questionable.score).toBe(13.5); // 15 − 10%
    expect(questionable.ceiling - questionable.floor).toBeGreaterThan(healthy.ceiling - healthy.floor);
    expect(scorePlayer(wr({ injuryStatus: "DOUBTFUL" })).score).toBe(6);
  });

  it("scores 0 and sits a player who is on bye or out", () => {
    const bye = scorePlayer(wr({ unavailable: "bye" }));
    expect(bye).toMatchObject({ playing: false, score: 0, floor: 0, ceiling: 0 });
    expect(bye.factors[0].detail).toBe("Alpha Receiver is on bye this week, so scores 0. Automatic sit.");
    expect(scorePlayer(wr({ unavailable: "out", injuryStatus: "OUT" })).factors[0].detail).toContain("is Out");
  });

  it("falls back to 90% of the recent average when ESPN has no projection", () => {
    const recent = [8, 12, 10, 14, 16].map((points, i) => ({ week: i + 1, points }));
    const v = scorePlayer(wr({ projection: null, recent }));
    expect(v.base).toBe(11.7); // last 4: (12+10+14+16)/4 = 13 × 0.9
    expect(v.factors[0].available).toBe(false);
  });

  it("puts floor and ceiling around the score using how much the player swings", () => {
    const steady = scorePlayer(wr({ recent: [15, 15, 15, 15, 15, 15].map((points, i) => ({ week: i + 1, points })) }));
    const boomBust = scorePlayer(wr({ recent: [2, 30, 3, 28, 4, 25].map((points, i) => ({ week: i + 1, points })) }));
    expect(steady.floor).toBeLessThan(steady.score);
    expect(steady.ceiling).toBeGreaterThan(steady.score);
    expect(boomBust.ceiling - boomBust.floor).toBeGreaterThan(steady.ceiling - steady.floor);
    expect(steady.floor).toBeGreaterThanOrEqual(0);
  });
});

describe("decide", () => {
  const a = (o: Partial<PlayerFactors> = {}) => wr({ playerId: "a", name: "Ace Alpha", ...o });
  const b = (o: Partial<PlayerFactors> = {}) => wr({ playerId: "b", name: "Bo Beta", ...o });

  it("needs two players and someone who is playing", () => {
    expect(decide([a()], "ppr").recommendation).toBeNull();
    const none = decide([a({ unavailable: "bye" }), b({ unavailable: "out" })], "ppr");
    expect(none.recommendation).toBeNull();
    expect(none.noRecommendation).toBe("None of these players has a game this week.");
  });

  it("is Strong when the gap is big compared with the uncertainty", () => {
    const { recommendation, players } = decide([b({ projection: 8 }), a({ projection: 20 })], "ppr");
    expect(players.map((p) => p.playerId)).toEqual(["a", "b"]);
    expect(recommendation).toMatchObject({ startId: "a", overId: "b", confidence: "Strong" });
  });

  it("is only a Lean when the players are close", () => {
    const { recommendation } = decide([a({ projection: 15.4 }), b({ projection: 15 })], "ppr");
    expect(recommendation?.confidence).toBe("Lean");
    expect(recommendation!.chance).toBeLessThan(0.6);
  });

  it("gets less sure when data is missing, and never above Lean without a projection", () => {
    const full = { matchup: matchup(30), vegas: vegas(22.5), recent: [15, 15, 15].map((points, i) => ({ week: i + 1, points })) };
    const withData = decide([a({ projection: 18, ...full }), b({ projection: 13, ...full })], "ppr").recommendation!;
    const without = decide([a({ projection: 18, injuryStatus: null }), b({ projection: 13, injuryStatus: null })], "ppr").recommendation!;
    expect(without.chance).toBeLessThan(withData.chance);

    const recent = [20, 20, 20].map((points, i) => ({ week: i + 1, points }));
    const noProjection = decide([a({ projection: null, recent }), b({ projection: 5 })], "ppr").recommendation!;
    expect(noProjection.startId).toBe("a");
    expect(noProjection.confidence).toBe("Lean");
  });

  it("always sits a player on bye, with that as the top reason", () => {
    const { recommendation } = decide([a({ projection: 25, unavailable: "bye" }), b({ projection: 6 })], "half");
    expect(recommendation).toMatchObject({ startId: "b", confidence: "Strong" });
    expect(recommendation!.reasons[0]).toMatchObject({ key: "availability", favors: "b" });
    expect(recommendation!.reasons[0].text).toBe("Ace Alpha is on bye this week and can't score for you.");
  });

  it("ranks 3-5 reasons by how many points they're worth, with the numbers", () => {
    const { recommendation } = decide(
      [
        a({ projection: 16, matchup: matchup(39, 30), injuryStatus: "ACTIVE" }),
        b({ projection: 15, matchup: matchup(21, 2), injuryStatus: "QUESTIONABLE" }),
      ],
      "ppr",
    );
    const reasons = recommendation!.reasons;
    expect(reasons.length).toBeGreaterThanOrEqual(3);
    expect(reasons.length).toBeLessThanOrEqual(5);
    expect(reasons.map((r) => r.impact)).toEqual([...reasons.map((r) => r.impact)].sort((x, y) => y - x));
    expect(reasons.map((r) => r.key)).toEqual(["matchup", "injury", "projection"]);
    expect(reasons.every((r) => r.favors === "a")).toBe(true);
    expect(reasons.find((r) => r.key === "projection")!.text).toBe("ESPN projects A. Alpha for 16.0 pts and B. Beta for 15.0 (PPR).");
    expect(reasons.find((r) => r.key === "injury")!.text).toBe("B. Beta is listed Questionable (−1.5 pts).");
  });

  it("breaks a tie in favor of the safer floor", () => {
    const steady = [12, 12, 12, 12].map((points, i) => ({ week: i + 1, points }));
    const wild = [12, 0, 24, 12].map((points, i) => ({ week: i + 1, points }));
    const { recommendation } = decide([a({ projection: 12, recent: wild }), b({ projection: 12, recent: steady })], "ppr");
    expect(recommendation!.startId).toBe("b");
  });
});

describe("buildNotes", () => {
  const early = { id: "g1", kickoff: "2026-10-25T17:00Z", state: "pre" as const, isHome: true, opponentAbbr: "ZZZ" };
  const late = { id: "g2", kickoff: "2026-10-27T00:15Z", state: "pre" as const, isHome: false, opponentAbbr: "YYY" };

  it("points out the later kickoff (the flexible late option)", () => {
    const notes = buildNotes(scorePlayer(wr({ name: "Ace Alpha", game: early })), scorePlayer(wr({ playerId: "2", name: "Bo Beta", game: late })));
    expect(notes[0]).toBe(
      "B. Beta plays later (Mon 8:15 PM ET). If you start B. Beta, a FLEX spot keeps the option to swap in a bench player whose game hasn't started.",
    );
  });

  it("skips the FLEX tip for quarterbacks (they can't play FLEX)", () => {
    const notes = buildNotes(
      scorePlayer(wr({ name: "Ace Alpha", position: "QB", game: early })),
      scorePlayer(wr({ playerId: "2", name: "Bo Beta", position: "QB", game: late })),
    );
    expect(notes[0]).toBe("B. Beta plays later (Mon 8:15 PM ET); A. Alpha's game kicks off first.");
  });

  it("warns when the injured player is the later one", () => {
    const notes = buildNotes(
      scorePlayer(wr({ name: "Ace Alpha", game: early })),
      scorePlayer(wr({ playerId: "2", name: "Bo Beta", game: late, injuryStatus: "QUESTIONABLE" })),
    );
    expect(notes[0]).toContain("can't switch back");
  });

  it("says when a game has already started", () => {
    const notes = buildNotes(scorePlayer(wr({ name: "Ace Alpha", game: { ...early, state: "in" } })), scorePlayer(wr({ playerId: "2", name: "Bo Beta" })));
    expect(notes).toContain("A. Alpha's game has already started, so that lineup spot is locked.");
  });
});

describe("helpers", () => {
  it("normalCdf", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 4);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 4);
  });

  it("toughnessLabel", () => {
    expect(toughnessLabel(1, 32)).toBe("the 1st-toughest");
    expect(toughnessLabel(16, 32)).toBe("the 16th-toughest");
    expect(toughnessLabel(17, 32)).toBe("the 16th-easiest");
    expect(toughnessLabel(32, 32)).toBe("the 1st-easiest");
  });

  it("shortName", () => {
    expect(shortName("Ja'Marr Chase")).toBe("J. Chase");
    expect(shortName("Marvin Harrison Jr.")).toBe("M. Harrison Jr.");
    expect(shortName("Cher")).toBe("Cher");
  });
});
