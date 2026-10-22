import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseScoreboard } from "@/lib/providers/espn/scoreboard";
import { parseBoxscore, parseCorePlays } from "@/lib/providers/espn/stats";
import { parseDrives, parseSummaryGame, parseTeamStats, parseWinProbability } from "@/lib/providers/espn/summary";
import type { GameDetail } from "@/lib/providers/types";
import { buildTeamLive, playTextName, remainingShare, type RosterInput } from "./team";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));

function detail(gameId: string): GameDetail {
  const summary = sample(`summary-${gameId}-final.json`);
  return {
    game: parseSummaryGame(summary),
    drives: parseDrives(summary),
    plays: parseCorePlays(sample(`core-plays-${gameId}.json`), gameId),
    boxscore: parseBoxscore(summary),
    teamStats: parseTeamStats(summary),
    winProbability: parseWinProbability(summary),
  };
}

// Week 6 players whose official ESPN PPR totals we saved from ESPN's fantasy feed
// (samples/fantasy-kona-player-info*.json, `appliedTotal`).
const ROSTER: (RosterInput & { espnPpr: number })[] = [
  { playerId: "4432577", name: "C.J. Stroud", position: "QB", teamId: "34", espnPpr: 22.98 },
  { playerId: "4360310", name: "Trevor Lawrence", position: "QB", teamId: "30", espnPpr: 27.34 },
  { playerId: "4882093", name: "Bhayshul Tuten", position: "RB", teamId: "30", espnPpr: 24.7 },
  { playerId: "3843945", name: "Foster Moreau", position: "TE", teamId: "34", espnPpr: 14.7 },
  { playerId: "4430539", name: "Brenton Strange", position: "TE", teamId: "30", espnPpr: 9.4 },
  { playerId: "4429939", name: "Jawhar Jordan", position: "RB", teamId: "34", espnPpr: 12.0 },
  { playerId: "4360423", name: "Michael Penix Jr.", position: "QB", teamId: "1", espnPpr: 23.1 },
  { playerId: "4870612", name: "Zachariah Branch", position: "WR", teamId: "1", espnPpr: 0.9 },
  { playerId: "4426386", name: "Roschon Johnson", position: "RB", teamId: "3", espnPpr: 14.5 },
  { playerId: "4431611", name: "Caleb Williams", position: "QB", teamId: "3", espnPpr: 16.5 },
];

const scoreboard = parseScoreboard(sample("scoreboard-week6-final.json"));
const details = { "401872996": detail("401872996"), "401872999": detail("401872999") };

function build(format: "standard" | "half" | "ppr" = "ppr") {
  return buildTeamLive({
    roster: ROSTER,
    format,
    scoreboard,
    details,
    outlooks: [],
    byeWeeks: {},
    teams: [],
    fetchedAt: "2026-10-22T16:00:00Z",
  });
}

describe("live team engine on real Week 6 games", () => {
  it("matches ESPN's official PPR total for every player", () => {
    const live = build("ppr");
    for (const player of ROSTER) {
      const p = live.players.find((x) => x.playerId === player.playerId)!;
      expect(p.points, player.name).toBeCloseTo(player.espnPpr, 2);
    }
  });

  it("finds each player's game and marks it final", () => {
    const live = build();
    const stroud = live.players.find((p) => p.playerId === "4432577")!;
    expect(stroud.game).toMatchObject({ id: "401872996", state: "post", isHome: false, teamScore: 34, opponentScore: 31 });
    expect(stroud.liveProjection).toBeNull();
    expect(live.anyLive).toBe(false);
  });

  it("builds a feed of point-moving plays, newest first, that adds up", () => {
    const live = build();
    expect(live.feed.length).toBeGreaterThan(20);
    for (let i = 1; i < live.feed.length; i++) {
      const a = live.feed[i - 1].wallclock ?? "";
      const b = live.feed[i].wallclock ?? "";
      expect(a >= b).toBe(true);
    }
    // Per-play points should add up to the headline unless a correction is shown.
    for (const p of live.players) {
      expect(p.points - p.playPoints - p.correction).toBeCloseTo(0, 1);
    }
    const tds = live.feed.filter((f) => f.isTouchdown && f.playerId === "4882093");
    expect(tds).toHaveLength(2); // Tuten's two receiving TDs
  });

  it("scores the same stats differently by format", () => {
    const tutenStd = build("standard").players.find((p) => p.playerId === "4882093")!;
    const tutenHalf = build("half").players.find((p) => p.playerId === "4882093")!;
    expect(tutenStd.points).toBeCloseTo(20.7, 2); // 24.7 PPR − 4 receptions
    expect(tutenHalf.points).toBeCloseTo(22.7, 2);
  });
});

describe("helpers", () => {
  it("names players the way ESPN play text does", () => {
    expect(playTextName("Ja'Marr Chase")).toBe("J.Chase");
    expect(playTextName("Michael Penix Jr.")).toBe("M.Penix");
    expect(playTextName("Amon-Ra St. Brown")).toBe("A.St. Brown");
  });

  it("estimates how much of a game is left", () => {
    expect(remainingShare({ state: "pre", period: 0, clock: "0:00" })).toBe(1);
    expect(remainingShare({ state: "post", period: 4, clock: "0:00" })).toBe(0);
    expect(remainingShare({ state: "in", period: 3, clock: "7:30" })).toBeCloseTo(22.5 / 60, 5);
    expect(remainingShare({ state: "in", period: 5, clock: "8:00" })).toBe(0);
  });
});
