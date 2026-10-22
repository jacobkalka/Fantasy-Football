import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseByeWeeks, parseOutlooks, parsePlayersList } from "./fantasy";
import { parseInjuries, parseNews, parsePlayerNews } from "./news";
import { parseScoreboard } from "./scoreboard";
import { parseDrives, parseSummaryGame, parseTeamStats, parseWinProbability } from "./summary";
import { parseTeams } from "./teams";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));

describe("scoreboard", () => {
  it("reads an upcoming week (Week 7, all games scheduled)", () => {
    const board = parseScoreboard(sample("scoreboard.json"));
    expect(board).toMatchObject({ season: 2026, seasonType: 2, week: 7 });
    expect(board.games).toHaveLength(14);
    const tnf = board.games[0];
    // Sorted by kickoff: Thursday night first.
    expect(tnf).toMatchObject({
      id: "401873010",
      state: "pre",
      completed: false,
      home: { team: { abbr: "CHI", color: "#0b1c3a" }, score: 0, record: "4-2" },
      away: { team: { abbr: "NE" } },
      broadcast: "Prime Video",
      venue: { name: "Soldier Field", indoor: false },
    });
    expect(tnf.odds).toMatchObject({ details: "CHI -3", overUnder: 50.5 });
    expect(tnf.home.team.logo).toBe("https://a.espncdn.com/i/teamlogos/nfl/500-dark/chi.png");
    expect(tnf.situation).toBeUndefined();
  });

  it("reads finished games, including overtime", () => {
    const board = parseScoreboard(sample("scoreboard-week6-final.json"));
    expect(board.week).toBe(6);
    const ot = board.games.find((g) => g.id === "401872995")!;
    expect(ot).toMatchObject({ state: "post", completed: true, statusText: "Final/OT", period: 5 });
    expect(ot.home).toMatchObject({ team: { abbr: "DEN" }, score: 17, linescores: [0, 14, 0, 0, 3] });
  });
});

describe("summary", () => {
  const summary = sample("summary-401872996-final.json");

  it("reads the game header with venue and odds", () => {
    const game = parseSummaryGame(summary);
    expect(game).toMatchObject({
      id: "401872996",
      state: "post",
      week: 6,
      home: { team: { abbr: "JAX" }, score: 31, linescores: [0, 14, 7, 10] },
      away: { team: { abbr: "HOU" }, score: 34 },
      venue: { name: "Wembley Stadium", city: "London" },
      odds: { details: "JAX -2.5", overUnder: 42.5 },
    });
  });

  it("reads drives in order with their plays", () => {
    const drives = parseDrives(summary);
    expect(drives).toHaveLength(20);
    expect(drives[3]).toMatchObject({
      teamId: "34",
      description: "5 plays, 62 yards, 3:01",
      result: "Touchdown",
      isScore: true,
      startPeriod: 1,
      startClock: "8:14",
    });
    expect(drives[0].playIds.length).toBeGreaterThan(0);
  });

  it("pairs team stats home vs away without duplicates", () => {
    const stats = parseTeamStats(summary);
    const total = stats.find((s) => s.name === "totalYards")!;
    expect(total.home).toMatch(/^\d+$/);
    expect(total.away).toMatch(/^\d+$/);
    expect(new Set(stats.map((s) => s.name + s.label)).size).toBe(stats.length);
  });

  it("reads win probability per play", () => {
    const wp = parseWinProbability(summary);
    expect(wp.length).toBe(187);
    expect(wp[0]).toEqual({ playId: "4018729961", homeWinPct: 0.5919 });
  });
});

describe("teams", () => {
  it("reads all 32 teams with colors and dark logos", () => {
    const teams = parseTeams(sample("teams.json"));
    expect(teams).toHaveLength(32);
    expect(teams.find((t) => t.abbr === "ARI")).toMatchObject({
      id: "22",
      displayName: "Arizona Cardinals",
      color: "#a40227",
      logo: "https://a.espncdn.com/i/teamlogos/nfl/500-dark/ari.png",
    });
  });
});

describe("fantasy feed", () => {
  it("keeps only fantasy positions, with D/ST mapped to its team", () => {
    const players = parsePlayersList(sample("fantasy-players-wl-trimmed.json"));
    expect(players.length).toBeGreaterThan(0);
    for (const p of players) expect(["QB", "RB", "WR", "TE", "K", "DST"]).toContain(p.position);
    const dst = parsePlayersList([
      { id: -16012, fullName: "Chiefs D/ST", defaultPositionId: 16, proTeamId: 12, ownership: { percentOwned: 40 } },
    ])[0];
    expect(dst).toMatchObject({ id: "-16012", position: "DST", teamId: "12", headshot: null });
  });

  it("reads projections and week-by-week results for the current season only", () => {
    const outlooks = parseOutlooks(sample("fantasy-kona-player-info.json"), 2026, 7);
    const stroud = outlooks.find((o) => o.playerId === "4432577")!;
    expect(stroud.injuryStatus).toBe("ACTIVE");
    expect(stroud.projection).not.toBeNull();
    const week6 = stroud.weeks.find((w) => w.week === 6)!;
    expect(week6).toMatchObject({ gameId: "401872996", stats: { passYds: 312, passTd: 3, passInt: 1 } });
    // Last season's weeks 17/18 are filtered out.
    expect(stroud.weeks.every((w) => w.week <= 7)).toBe(true);
  });

  it("reads bye weeks", () => {
    const byes = parseByeWeeks(sample("fantasy-pro-team-schedules.json"));
    expect(byes["12"]).toBe(5); // Kansas City
    expect(Object.keys(byes)).toHaveLength(32);
  });
});

describe("news and injuries", () => {
  it("reads league news and the athletes each article mentions", () => {
    const news = parseNews(sample("news-league.json"));
    expect(news.length).toBeGreaterThan(0);
    expect(news.every((n) => n.headline && n.published)).toBe(true);
    expect(news.some((n) => n.playerIds.length > 0)).toBe(true);
  });

  it("reads a player's fantasy news, using the story text for short player updates", () => {
    const news = parsePlayerNews(sample("fantasy-news-player-3139477.json"), "3139477");
    expect(news.length).toBe(10);
    const update = news.find((n) => n.headline.startsWith("Mahomes completed 23 of 30"))!;
    expect(update.description).toMatch(/^The Chiefs offense continues/);
    expect(update.description).not.toMatch(/<[a-z]/);
    expect(news.every((n) => n.playerIds[0] === "3139477")).toBe(true);
  });

  it("pulls athlete ids out of injury report links", () => {
    const injuries = parseInjuries(sample("injuries-trimmed.json"));
    expect(injuries.length).toBeGreaterThan(0);
    expect(injuries[0].playerId).toMatch(/^\d+$/);
    expect(injuries.find((i) => i.playerId === "4870808")).toMatchObject({ teamId: "22" });
  });
});
