import { describe, expect, it } from "vitest";
import { totalsFromPlays } from "@/lib/providers/espn/stats";
import {
  buildGameRows,
  gameRow,
  inGameInjuryRows,
  mergeGame,
  playerRows,
  REPLAY_PREFIX,
  stableUuid,
  teamRow,
  yardLineFrom,
} from "../src/rows";
import { playsToDelete } from "../src/store";
import { FakeProvider, sampleBoard, sampleDetail } from "./helpers/samples";

// Real week 6 games saved in samples/: HOU 34 @ JAX 31 (London) and CHI 31 @ ATL 23.
const HOU_JAX = "401872996";
const CHI_ATL = "401872999";
const board = sampleBoard();
const boardGame = (id: string) => board.games.find((g) => g.id === id);

describe("game rows", () => {
  const rows = buildGameRows(sampleDetail(HOU_JAX), { scoreboardGame: boardGame(HOU_JAX) });

  it("describes the game, filling the summary's gaps from the scoreboard", () => {
    expect(rows.game).toMatchObject({
      id: HOU_JAX,
      season: 2026,
      season_type: 2,
      week: 6,
      state: "post",
      status_text: "Final",
      // The finished game's summary has no period/clock; the scoreboard does.
      period: 4,
      clock: "0:00",
      home_team_id: "30",
      away_team_id: "34",
      home_score: 31,
      away_score: 34,
      possession_team_id: null,
      is_red_zone: false,
      // The scoreboard drops odds after the game; the summary still has them.
      odds_json: { details: "JAX -2.5", spread: -2.5, overUnder: 42.5 },
      venue_json: { name: "Wembley Stadium", city: "London", indoor: false },
    });
  });

  it("prefers the scoreboard's venue (the summary says the Atlanta dome isn't indoor)", () => {
    const summaryOnly = sampleDetail(CHI_ATL).game;
    expect(summaryOnly.venue?.indoor).toBe(false);
    expect(mergeGame(summaryOnly, boardGame(CHI_ATL)).venue?.indoor).toBe(true);
  });

  it("stores the situation only while the game is live", () => {
    const live = { ...boardGame(CHI_ATL)!, state: "in" as const };
    live.situation = { possessionTeamId: "3", downDistance: "3rd & 7 at ATL 35", isRedZone: false };
    expect(gameRow(live)).toMatchObject({ state: "in", possession_team_id: "3", down_distance: "3rd & 7 at ATL 35", yard_line: 35 });
    expect(gameRow({ ...live, state: "post" })).toMatchObject({ possession_team_id: null, down_distance: null, yard_line: null });
    expect(gameRow(live, REPLAY_PREFIX).id).toBe("replay-401872999");
  });

  it("makes team rows and skips placeholder teams", () => {
    expect(rows.teams.map((t) => t.abbr)).toEqual(["JAX", "HOU"]);
    expect(rows.teams[0]).toEqual({
      id: "30",
      abbr: "JAX",
      name: "Jacksonville Jaguars",
      short_name: "Jaguars",
      color_primary: "#007487",
      color_secondary: "#d7a22a",
      logo_url: "https://a.espncdn.com/i/teamlogos/nfl/500-dark/jax.png",
    });
    expect(teamRow({ ...boardGame(HOU_JAX)!.home.team, id: "-1", abbr: "TBD" })).toBeNull();
    expect(teamRow({ ...boardGame(HOU_JAX)!.home.team, abbr: "?" })).toBeNull();
  });

  it("reads the yard line out of down & distance", () => {
    expect(yardLineFrom("3rd & 7 at KC 35")).toBe(35);
    expect(yardLineFrom("1st & 10 at 50")).toBe(50);
    expect(yardLineFrom("1st & Goal at NE 4")).toBe(4);
    expect(yardLineFrom(undefined)).toBeNull();
  });
});

describe("plays and per-play points", () => {
  const detail = sampleDetail(HOU_JAX);
  const rows = buildGameRows(detail, { scoreboardGame: boardGame(HOU_JAX) });
  const td = "4018729961338"; // T.Lawrence 27-yard TD pass to B.Tuten

  it("keeps every play, de-duplicated by ESPN play id", () => {
    expect(rows.plays).toHaveLength(187);
    expect(new Set(rows.plays.map((p) => p.id)).size).toBe(187);
    expect(rows.plays.find((p) => p.id === td)).toMatchObject({
      game_id: HOU_JAX,
      period: 2,
      clock: "6:47",
      play_type: "Passing Touchdown",
      yards: 27,
      team_id: "30",
      scoring_play: true,
      score_value: 6,
      raw_json: { espnPlayId: td, wallclock: "2026-10-18T14:31:05Z", modified: "2026-10-19T04:52Z" },
    });
  });

  it("scores each player's share of a play in all three formats", () => {
    const points = rows.points.filter((p) => p.play_id === td);
    expect(points.find((p) => p.player_id === "4882093")).toEqual({
      play_id: td,
      player_id: "4882093",
      stat_changes_json: { targets: 1, rec: 1, recYds: 27, recTd: 1 },
      standard_pts: 8.7,
      half_pts: 9.2,
      ppr_pts: 9.7,
    });
    expect(points.find((p) => p.player_id === "4360310")).toMatchObject({
      stat_changes_json: { passAtt: 1, passCmp: 1, passYds: 27, passTd: 1 },
      ppr_pts: 5.08,
    });
    // One row per (play, player) with a stat change.
    expect(rows.points).toHaveLength(detail.plays.reduce((n, p) => n + p.deltas.length, 0));
  });
});

describe("player game stats", () => {
  it("uses the official box score; points match ESPN's own fantasy totals", () => {
    const rows = buildGameRows(sampleDetail(HOU_JAX), { scoreboardGame: boardGame(HOU_JAX) });
    const ppr = (id: string) => rows.stats.find((s) => s.player_id === id)?.ppr_pts;
    // ESPN's PPR numbers for these players (samples/fantasy-kona-player-info.json).
    expect(ppr("4360310")).toBe(27.34); // Trevor Lawrence
    expect(ppr("4432577")).toBe(22.98); // C.J. Stroud
    expect(ppr("4882093")).toBe(24.7); // Bhayshul Tuten
    expect(rows.stats.find((s) => s.player_id === "4882093")).toMatchObject({ standard_pts: 20.7, half_pts: 22.7 });
  });

  it("adds two-point conversions from the plays (box scores leave them out)", () => {
    const rows = buildGameRows(sampleDetail(CHI_ATL), { scoreboardGame: boardGame(CHI_ATL) });
    const penix = rows.stats.find((s) => s.player_id === "4360423")!;
    expect(penix.stats_json).toMatchObject({ passYds: 225, passTd: 3, pass2pt: 2 });
    expect(penix.ppr_pts).toBe(23.1);
    expect(rows.stats.find((s) => s.player_id === "4870612")!.stats_json.rec2pt).toBe(1); // Zachariah Branch
  });

  it("falls back to play-by-play totals when there's no box score (replays, early in a game)", () => {
    const detail = sampleDetail(HOU_JAX);
    const rows = buildGameRows({ ...detail, boxscore: {} });
    const totals = totalsFromPlays(detail.plays);
    expect(rows.stats.find((s) => s.player_id === "4882093")!.stats_json).toEqual(totals["4882093"]);
  });
});

describe("in-game injuries", () => {
  const detail = sampleDetail(HOU_JAX);
  const teamAbbr = new Map([["30", "JAX"], ["34", "HOU"]]);

  it("finds injury reports for box-score players and turns them into events", () => {
    const rows = buildGameRows(detail, { scoreboardGame: boardGame(HOU_JAX) });
    expect(rows.injuries.map(({ player_id, status, note, source }) => ({ player_id, status, note, source }))).toEqual([
      { player_id: "2576336", status: "INJURED", note: "JAX-A.Abdullah was injured during the play.", source: "espn-play" },
      { player_id: "2576336", status: "RETURNED", note: "JAX-A.Abdullah has returned to the game.", source: "espn-play" },
    ]);
  });

  it("also watches tracked players who have no stats yet", () => {
    const tracked = [{ playerId: "3122840", name: "Azeez Al-Shaair", teamId: "34" }];
    const rows = buildGameRows(detail, { trackedPlayers: tracked });
    expect(rows.injuries.filter((i) => i.player_id === "3122840").map((i) => i.status)).toEqual(["INJURED", "RETURNED"]);
  });

  it("never mixes up two players with the same short name on different teams", () => {
    const wrongTeam = [{ playerId: "1", name: "Ameer Abdullah", teamId: "34" }];
    expect(inGameInjuryRows(detail.plays, wrongTeam, teamAbbr, HOU_JAX)).toEqual([]);
  });

  it("gives each event a stable id, so writing it twice stores it once", () => {
    const a = inGameInjuryRows(detail.plays, [{ playerId: "2576336", name: "Ameer Abdullah", teamId: "30" }], teamAbbr, HOU_JAX);
    const b = inGameInjuryRows(detail.plays, [{ playerId: "2576336", name: "Ameer Abdullah", teamId: "30" }], teamAbbr, HOU_JAX);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    expect(a[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Replays get different ids, so they never collide with real events.
    const replay = inGameInjuryRows(detail.plays, [{ playerId: "2576336", name: "Ameer Abdullah", teamId: "30" }], teamAbbr, "replay-x", REPLAY_PREFIX);
    expect(replay[0].id).not.toBe(a[0].id);
  });
});

describe("playsToDelete", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

  it("marks plays ESPN no longer lists", () => {
    expect(playsToDelete(ids(100), ids(100).filter((id) => id !== "p7"))).toEqual(["p7"]);
    expect(playsToDelete([], ids(5))).toEqual([]);
  });

  it("refuses to delete when the list looks broken (empty, or a big drop)", () => {
    expect(playsToDelete(ids(100), [])).toBeNull();
    expect(playsToDelete(ids(100), ids(70))).toBeNull(); // 30 missing > 20%
    expect(playsToDelete(ids(100), ids(80))).toHaveLength(20); // 20% is still believable
    expect(playsToDelete(ids(20), ids(10))).toHaveLength(10); // small games: up to 10
  });
});

describe("misc", () => {
  it("stableUuid is deterministic", () => {
    expect(stableUuid("x")).toBe(stableUuid("x"));
    expect(stableUuid("x")).not.toBe(stableUuid("y"));
  });

  it("builds player rows from the provider's player list", async () => {
    const rows = playerRows(await new FakeProvider().getPlayers());
    expect(rows.find((p) => p.id === "4882093")).toEqual({
      id: "4882093",
      full_name: "Bhayshul Tuten",
      short_name: "B.Tuten",
      position: "RB",
      team_id: "30",
      headshot_url: "https://a.espncdn.com/i/headshots/nfl/players/full/4882093.png",
    });
  });
});
