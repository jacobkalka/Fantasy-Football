import { describe, expect, it } from "vitest";
import { DEFAULTS, readConfig, ConfigError } from "../src/config";
import {
  backoffMs,
  chooseDetailGames,
  MAX_CATCH_UPS_PER_TICK,
  nextDelayMs,
  phaseFor,
  RequestBudget,
  withJitter,
  type DetailChoiceInput,
  type ScheduleGame,
} from "../src/schedule";
import { sampleBoard, upcomingBoard } from "./helpers/samples";

const MIN = 60_000;
const config = { ...DEFAULTS, databaseUrl: "" };

const game = (id: string, state: ScheduleGame["state"], kickoff: string, home = `h${id}`, away = `a${id}`): ScheduleGame => ({
  id,
  state,
  kickoff,
  homeTeamId: home,
  awayTeamId: away,
});

const toSchedule = (g: { id: string; state: ScheduleGame["state"]; kickoff: string; home: { team: { id: string } }; away: { team: { id: string } } }) =>
  game(g.id, g.state, g.kickoff, g.home.team.id, g.away.team.id);

describe("phaseFor (plan §4.4)", () => {
  // Thursday of week 7: NE@CHI kicks off 2026-10-23T00:15Z.
  const week7 = upcomingBoard().games.map(toSchedule);
  const kickoff = Date.parse("2026-10-23T00:15Z");

  it("is idle on a Thursday afternoon with nothing on", () => {
    expect(phaseFor(week7, Date.parse("2026-10-22T16:00Z"), config.kickoffWindowMs)).toBe("idle");
  });

  it("speeds up within 30 minutes of a kickoff", () => {
    expect(phaseFor(week7, kickoff - 31 * MIN, config.kickoffWindowMs)).toBe("idle");
    expect(phaseFor(week7, kickoff - 30 * MIN, config.kickoffWindowMs)).toBe("soon");
    expect(phaseFor(week7, kickoff - 1 * MIN, config.kickoffWindowMs)).toBe("soon");
  });

  it("keeps watching a kickoff that runs late (ESPN still says 'pre')", () => {
    expect(phaseFor(week7, kickoff + 5 * MIN, config.kickoffWindowMs)).toBe("soon");
    // ...but not one that's hours overdue (postponed).
    expect(phaseFor(week7, kickoff + 7 * 60 * MIN, config.kickoffWindowMs)).toBe("idle");
  });

  it("is live while any game is in progress", () => {
    const games = [...week7];
    games[0] = { ...games[0], state: "in" };
    expect(phaseFor(games, kickoff + 60 * MIN, config.kickoffWindowMs)).toBe("live");
  });

  it("is idle once every game is final", () => {
    const final = sampleBoard().games.map(toSchedule);
    expect(final.every((g) => g.state === "post")).toBe(true);
    expect(phaseFor(final, Date.parse("2026-10-20T12:00Z"), config.kickoffWindowMs)).toBe("idle");
  });
});

describe("delays", () => {
  it("uses 8 s live, 30 s before kickoff, 5 min otherwise, ±10% jitter", () => {
    expect(nextDelayMs("live", 0, config, () => 0.5)).toBe(8_000);
    expect(nextDelayMs("soon", 0, config, () => 0.5)).toBe(30_000);
    expect(nextDelayMs("idle", 0, config, () => 0.5)).toBe(300_000);
    expect(nextDelayMs("live", 0, config, () => 0)).toBe(7_200);
    expect(nextDelayMs("live", 0, config, () => 1)).toBe(8_800);
    expect(withJitter(1000, () => 0.25)).toBe(950);
  });

  it("backs off exponentially after errors, capped at 5 minutes", () => {
    const live = config.liveIntervalMs;
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => backoffMs(n, live, config))).toEqual([
      16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000,
    ]);
    // Never faster than the normal pace.
    expect(backoffMs(1, config.idleIntervalMs, config)).toBe(300_000);
    expect(backoffMs(0, 30_000, config)).toBe(30_000);
  });
});

describe("chooseDetailGames", () => {
  const base = (overrides: Partial<DetailChoiceInput>): DetailChoiceInput => ({
    games: [],
    trackedTeamIds: new Set(),
    pollAllLiveGames: false,
    finalized: new Set(),
    lastFetchedAt: new Map(),
    retryAfter: new Map(),
    budget: 100,
    now: 1_000_000,
    ...overrides,
  });
  const games = [
    game("1", "in", "2026-10-25T17:00Z", "10", "11"),
    game("2", "in", "2026-10-25T17:00Z", "12", "13"),
    game("3", "pre", "2026-10-25T20:05Z", "14", "15"),
    game("4", "post", "2026-10-25T13:30Z", "16", "17"),
  ];

  it("only fetches live games with a tracked player", () => {
    const choice = chooseDetailGames(base({ games, trackedTeamIds: new Set(["13"]), finalized: new Set(["4"]) }));
    expect(choice).toEqual({ gameIds: ["2"], wanted: 1, liveIds: ["2"], fallbackToAll: false });
  });

  it("fetches every live game when POLL_ALL_LIVE_GAMES is on", () => {
    const choice = chooseDetailGames(base({ games, trackedTeamIds: new Set(["13"]), pollAllLiveGames: true, finalized: new Set(["4"]) }));
    expect(choice.gameIds).toEqual(["1", "2"]);
  });

  it("falls back to every live game when nobody tracks anyone", () => {
    const choice = chooseDetailGames(base({ games, finalized: new Set(["4"]) }));
    expect(choice).toMatchObject({ gameIds: ["1", "2"], fallbackToAll: true });
  });

  it("catches up a finished game once (final plays + official box score), after live games", () => {
    const tracked = new Set(["10", "17"]);
    expect(chooseDetailGames(base({ games, trackedTeamIds: tracked })).gameIds).toEqual(["1", "4"]);
    expect(chooseDetailGames(base({ games, trackedTeamIds: tracked, finalized: new Set(["4"]) })).gameIds).toEqual(["1"]);
    // Finished games nobody cares about are left alone.
    expect(chooseDetailGames(base({ games, trackedTeamIds: new Set(["10"]) })).gameIds).toEqual(["1"]);
  });

  it("catches up at most a few finished games per tick", () => {
    const finals = Array.from({ length: 10 }, (_, i) => game(`f${i}`, "post", `2026-10-25T1${i}:00Z`));
    const choice = chooseDetailGames(base({ games: finals }));
    expect(choice.gameIds).toHaveLength(MAX_CATCH_UPS_PER_TICK);
    expect(choice.gameIds[0]).toBe("f9"); // newest first
  });

  it("stays inside the request budget, least recently fetched first", () => {
    const lastFetchedAt = new Map([["1", 900_000], ["2", 800_000]]);
    const choice = chooseDetailGames(base({ games, lastFetchedAt, budget: 3, finalized: new Set(["4"]) }));
    expect(choice).toMatchObject({ gameIds: ["2"], wanted: 2 });
    expect(chooseDetailGames(base({ games, budget: 1 })).gameIds).toEqual([]);
  });

  it("skips a game that failed recently until its retry time", () => {
    const retryAfter = new Map([["1", 1_000_001]]);
    expect(chooseDetailGames(base({ games, retryAfter, finalized: new Set(["4"]) })).gameIds).toEqual(["2"]);
    expect(chooseDetailGames(base({ games, retryAfter, now: 1_000_001, finalized: new Set(["4"]) })).gameIds).toEqual(["1", "2"]);
  });
});

describe("RequestBudget", () => {
  it("caps requests in any rolling minute", () => {
    const budget = new RequestBudget(5);
    expect(budget.spend(3, 0)).toBe(true);
    expect(budget.spend(2, 10_000)).toBe(true);
    expect(budget.spend(1, 20_000)).toBe(false); // would be 6 in the last minute
    expect(budget.remaining(20_000)).toBe(0);
    expect(budget.waitFor(1, 20_000)).toBe(40_000); // the first 3 expire at 60 s
    expect(budget.remaining(60_000)).toBe(3);
    expect(budget.spend(3, 60_000)).toBe(true);
    expect(budget.used(70_000)).toBe(3);
  });
});

describe("readConfig", () => {
  it("needs DATABASE_URL and never repeats its value in errors", () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    try {
      readConfig({ DATABASE_URL: "mysql://user:secret@host/db" });
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("reads the optional settings", () => {
    const c = readConfig({
      DATABASE_URL: "postgresql://u:p@h:5432/postgres",
      POLL_ALL_LIVE_GAMES: "true",
      ESPN_MAX_REQUESTS_PER_MINUTE: "90",
      LIVE_POLL_SECONDS: "10",
      PORT: "3001",
    });
    expect(c).toMatchObject({ pollAllLiveGames: true, maxRequestsPerMinute: 90, liveIntervalMs: 10_000, port: 3001 });
    expect(() => readConfig({ DATABASE_URL: "postgresql://x", LIVE_POLL_SECONDS: "1" })).toThrow(/LIVE_POLL_SECONDS/);
    expect(() => readConfig({ DATABASE_URL: "postgresql://x", POLL_ALL_LIVE_GAMES: "maybe" })).toThrow(ConfigError);
  });
});
