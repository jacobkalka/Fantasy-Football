/**
 * The worker against a real (throwaway, local) PostgreSQL with the real migration
 * applied, fed with saved ESPN samples instead of the network.
 *
 * Needs PostgreSQL 16 server programs and the worker's packages (npm install in
 * worker/). Without them these tests are skipped; see worker/README.md.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseCorePlays } from "@/lib/providers/espn/stats";
import { DEFAULTS, type WorkerConfig } from "../src/config";
import { connect, type Db } from "../src/db";
import { runReplay } from "../src/replay";
import { deleteReplays } from "../src/store";
import { LiveWorker, type TickReport } from "../src/worker";
import { startLocalPostgres, whyNoPostgres, type LocalPostgres } from "./helpers/local-postgres";
import { clone, FakeProvider, rawPlays, sampleDetail } from "./helpers/samples";

const HOU_JAX = "401872996"; // Tuten (JAX) plays here
const CHI_ATL = "401872999"; // D'Andre Swift (CHI) plays here
const TUTEN = "4882093";
const SWIFT = "4259545";

const skip = whyNoPostgres();
if (skip) console.warn(`[worker db tests] skipped: ${skip}`);

describe.skipIf(skip !== null)("worker writing to PostgreSQL", () => {
  let pg: LocalPostgres;
  let db: Db;
  let provider: FakeProvider;
  let clock = Date.parse("2026-10-20T12:00:00Z");
  const logs: string[] = [];

  const config: WorkerConfig = { ...DEFAULTS, databaseUrl: "unused" };
  const newWorker = (overrides: Partial<WorkerConfig> = {}) =>
    new LiveWorker({
      provider,
      db,
      config: { ...config, ...overrides },
      now: () => clock,
      random: () => 0.5,
      log: (line) => logs.push(line),
    });

  const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params))[0];
  const count = async (sql: string, params: unknown[] = []) =>
    Number((await one<{ n: string }>(`select count(*) as n from (${sql}) q`, params)).n);

  /** Row versions (xmin) of everything the worker writes: unchanged xmin = row not rewritten. */
  const snapshot = async () => {
    const tables = ["teams", "games", "plays", "player_play_points", "player_game_stats", "injury_events", "players"];
    const parts = await Promise.all(
      tables.map(async (t) => {
        const rows = await db.query<{ k: string }>(`select xmin::text || ':' || md5(t::text) as k from public.${t} t order by 1`);
        return `${t}=${rows.map((r) => r.k).join(",")}`;
      }),
    );
    return parts.join("\n");
  };

  const expectClean = (report: TickReport) => expect(report.error, logs.slice(-5).join("\n")).toBeUndefined();

  beforeAll(async () => {
    pg = await startLocalPostgres();
    db = connect(pg.url);
    // A signed-up user with Bhayshul Tuten on their roster.
    await db.query(`insert into auth.users (id, email) values ('a11ce000-0000-4000-8000-000000000001', 'alice@example.com')`);
    await db.query(
      `insert into public.rosters (id, user_id, name) values ('00000000-0000-4000-8000-0000000000a1', 'a11ce000-0000-4000-8000-000000000001', 'Alice FC')`,
    );
    await db.query(`insert into public.roster_players (roster_id, player_id, slot) values ('00000000-0000-4000-8000-0000000000a1', $1, 'RB')`, [TUTEN]);
  }, 120_000);

  afterAll(async () => {
    await db?.close();
    pg?.stop();
  });

  beforeEach(() => {
    provider ??= new FakeProvider();
    provider.details.set(HOU_JAX, sampleDetail(HOU_JAX));
    provider.details.set(CHI_ATL, sampleDetail(CHI_ATL));
    clock += 10 * 60_000;
  });

  it("one tick: scoreboard, teams, players, and the tracked player's finished game", async () => {
    const report = await newWorker().tick();
    expectClean(report);
    expect(report.phase).toBe("idle"); // every week-6 game is final
    expect(report.detailIds).toEqual([HOU_JAX]); // only the game with a tracked player
    expect(provider.calls).toContain("players");

    expect(await count("select 1 from public.games")).toBe(14);
    expect(await count("select 1 from public.teams")).toBe(32);
    expect(await one("select state, period, clock, home_score, away_score, odds_json->>'details' as odds from public.games where id = $1", [HOU_JAX])).toEqual({
      state: "post",
      period: 4,
      clock: "0:00",
      home_score: 31,
      away_score: 34,
      odds: "JAX -2.5",
    });

    const detail = sampleDetail(HOU_JAX);
    expect(await count("select 1 from public.plays where game_id = $1 and not deleted", [HOU_JAX])).toBe(187);
    expect(await count("select 1 from public.player_play_points x join public.plays p on p.id = x.play_id where p.game_id = $1", [HOU_JAX])).toBe(
      detail.plays.reduce((n, p) => n + p.deltas.length, 0),
    );
    expect(await one("select ppr_pts::float as ppr, half_pts::float as half from public.player_play_points where play_id = '4018729961338' and player_id = $1", [TUTEN])).toEqual({ ppr: 9.7, half: 9.2 });
    expect(await one("select ppr_pts::float as ppr from public.player_game_stats where game_id = $1 and player_id = '4360310'", [HOU_JAX])).toEqual({ ppr: 27.34 });
    expect(await one("select ppr_pts::float as ppr, standard_pts::float as std from public.player_game_stats where game_id = $1 and player_id = $2", [HOU_JAX, TUTEN])).toEqual({ ppr: 24.7, std: 20.7 });

    // In-game injury reports (Ameer Abdullah, a box-score player).
    expect(await db.query("select player_id, status, source from public.injury_events where game_id = $1 order by status", [HOU_JAX])).toEqual([
      { player_id: "2576336", status: "INJURED", source: "espn-play" },
      { player_id: "2576336", status: "RETURNED", source: "espn-play" },
    ]);
    // Fantasy injury status is saved; the first one seen isn't an event.
    expect(await one("select injury_status from public.players where id = $1", [TUTEN])).toEqual({ injury_status: "ACTIVE" });
    expect(await count("select 1 from public.injury_events where source = 'espn-fantasy'")).toBe(0);
    // Box-score players missing from the player list still get a name.
    expect(await one("select full_name from public.players where id = '4360310'")).toEqual({ full_name: "Trevor Lawrence" });
  });

  it("is idempotent: the same data again rewrites nothing", async () => {
    const before = await snapshot();
    const worker = newWorker(); // fresh memory, so it fetches and writes the game again
    const report = await worker.tick();
    expectClean(report);
    expect(report.detailIds).toEqual([HOU_JAX]);
    expect(report.writes[HOU_JAX]).toEqual({
      game: { inserted: 0, updated: 0 },
      plays: { inserted: 0, updated: 0, deleted: 0 },
      points: { inserted: 0, updated: 0, deleted: 0 },
      stats: { inserted: 0, updated: 0, deleted: 0 },
      injuries: 0,
      deletionsApplied: true,
    });
    expect(await snapshot()).toBe(before);

    // And a finished game isn't fetched again by the same worker.
    clock += 10 * 60_000;
    const again = await worker.tick();
    expect(again.detailIds).toEqual([]);
  });

  it("records a fantasy injury status change once", async () => {
    provider.outlooks = provider.outlooks.map((o) => (o.playerId === TUTEN ? { ...o, injuryStatus: "QUESTIONABLE" } : o));
    expectClean(await newWorker().tick());
    expectClean(await newWorker().tick());
    expect(await db.query("select player_id, status, note from public.injury_events where source = 'espn-fantasy'")).toEqual([
      { player_id: TUTEN, status: "QUESTIONABLE", note: "Was ACTIVE" },
    ]);
  });

  it("follows a live game: new plays, corrections (by 'modified'), and plays ESPN removes", async () => {
    await db.query(`insert into public.roster_players (roster_id, player_id) values ('00000000-0000-4000-8000-0000000000a1', $1)`, [SWIFT]);
    const raw = rawPlays(CHI_ATL);
    const live = (plays: unknown[]) => {
      const detail = sampleDetail(CHI_ATL, { items: plays });
      detail.game = { ...detail.game, state: "in", period: 2, clock: "7:19", statusText: "7:19 - 2nd" };
      detail.game.situation = { possessionTeamId: "1", downDistance: "1st & 10 at CHI 15", isRedZone: true };
      return detail;
    };
    provider.board.games = provider.board.games.map((g) => (g.id === CHI_ATL ? { ...g, state: "in" } : g));
    provider.details.set(CHI_ATL, live(raw.items.slice(0, 60)));

    const worker = newWorker();
    const first = await worker.tick();
    expectClean(first);
    expect(first.phase).toBe("live");
    expect(first.detailIds[0]).toBe(CHI_ATL); // live first (then this fresh worker's catch-up of HOU@JAX)
    expect(first.writes[CHI_ATL].plays).toEqual({ inserted: 60, updated: 0, deleted: 0 });
    expect(await one("select state, possession_team_id, down_distance, yard_line, is_red_zone from public.games where id = $1", [CHI_ATL])).toEqual({
      state: "in",
      possession_team_id: "1",
      down_distance: "1st & 10 at CHI 15",
      yard_line: 15,
      is_red_zone: true,
    });

    // Next poll: 20 more plays; ESPN corrected play 55 (9 → 12 yards) and removed play 54.
    const corrected = clone(raw.items.slice(0, 80));
    const fixedPlay = corrected[55] as { id: string; text: string; modified: string };
    const removedPlay = corrected[54] as { id: string };
    expect(fixedPlay.text).toContain("for 9 yards");
    fixedPlay.text = fixedPlay.text.replace("for 9 yards", "for 12 yards");
    fixedPlay.modified = "2026-10-19T06:00Z";
    corrected.splice(54, 1);
    provider.details.set(CHI_ATL, live(corrected));

    clock += 8_000;
    const second = await worker.tick();
    expectClean(second);
    expect(second.writes[CHI_ATL].plays).toEqual({ inserted: 20, updated: 1, deleted: 1 });
    expect(await one("select text, raw_json->>'modified' as modified from public.plays where id = $1", [fixedPlay.id])).toEqual({
      text: fixedPlay.text,
      modified: "2026-10-19T06:00Z",
    });
    // The corrected play's points follow the correction (receiver R.Johnson: 12 yards now).
    const fixedDeltas = parseCorePlays({ items: [fixedPlay] }, CHI_ATL)[0].deltas;
    const receiver = fixedDeltas.find((d) => d.stats.rec)!;
    expect(await one("select stat_changes_json->>'recYds' as yds from public.player_play_points where play_id = $1 and player_id = $2", [fixedPlay.id, receiver.playerId])).toEqual({ yds: "12" });
    // The removed play is kept but marked deleted, and its points are gone.
    expect(await one("select deleted from public.plays where id = $1", [removedPlay.id])).toEqual({ deleted: true });
    expect(await count("select 1 from public.player_play_points where play_id = $1", [removedPlay.id])).toBe(0);

    // A glitchy response with no plays never wipes the game.
    provider.details.set(CHI_ATL, live([]));
    clock += 8_000;
    const glitch = await worker.tick();
    expectClean(glitch);
    expect(glitch.writes[CHI_ATL].deletionsApplied).toBe(false);
    expect(await count("select 1 from public.plays where game_id = $1 and not deleted", [CHI_ATL])).toBe(79);

    // ESPN failing for a game backs that game off without stopping the others.
    provider.failDetails.add(CHI_ATL);
    clock += 8_000;
    const failed = await worker.tick();
    expect(failed.detailsFailed).toEqual([CHI_ATL]);
    expect(failed.error).toBeUndefined();
    clock += 8_000;
    expect((await worker.tick()).detailIds).toEqual([]); // waiting out its backoff
    provider.failDetails.clear();
    provider.board.games = provider.board.games.map((g) => (g.id === CHI_ATL ? { ...g, state: "post" } : g));
  });

  it("replays a finished game under replay- ids without touching real rows", async () => {
    const before = await snapshot();
    let now = Date.parse("2026-10-22T18:00:00Z");
    let midGame: Record<string, unknown> | undefined;
    let steps = 0;
    const result = await runReplay({
      provider,
      db,
      espnGameId: HOU_JAX,
      speed: 600, // 10 minutes of football per second
      now: () => now,
      sleep: async (ms) => {
        now += ms;
        steps += 1;
        if (steps === 6) {
          midGame = await one(
            `select g.state, g.period, g.clock, g.status_text, (select count(*)::int from public.plays p where p.game_id = g.id) as plays
               from public.games g where g.id = 'replay-401872996'`,
          );
        }
      },
      log: () => {},
    });
    expect(result).toMatchObject({ dbGameId: "replay-401872996", plays: 187, stopped: false });
    expect(midGame).toMatchObject({ state: "in", status_text: expect.stringContaining("Replay") });
    expect(Number(midGame?.plays)).toBeGreaterThan(10);
    expect(Number(midGame?.plays)).toBeLessThan(187);

    expect(await one("select state, home_score, away_score, status_text from public.games where id = 'replay-401872996'")).toEqual({
      state: "post",
      home_score: 31,
      away_score: 34,
      status_text: "Final · Replay",
    });
    expect(await count("select 1 from public.plays where game_id = 'replay-401872996' and id like 'replay-%'")).toBe(187);
    expect(await one("select ppr_pts::float as ppr from public.player_game_stats where game_id = 'replay-401872996' and player_id = '4360310'")).toEqual({ ppr: 27.34 });
    expect(await count("select 1 from public.injury_events where game_id = 'replay-401872996'")).toBe(2);

    expect(await count("select 1 from public.plays where game_id = $1", [HOU_JAX])).toBe(187);

    // Clean-up removes every trace, and real rows were never rewritten (same row versions).
    expect(await deleteReplays(db)).toBe(1);
    expect(await count("select 1 from public.plays where id like 'replay-%'")).toBe(0);
    expect(await count("select 1 from public.player_play_points where play_id like 'replay-%'")).toBe(0);
    expect(await count("select 1 from public.injury_events where game_id like 'replay-%'")).toBe(0);
    expect(await snapshot()).toBe(before);
  });
});
