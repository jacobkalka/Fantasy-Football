/**
 * Every SQL statement the worker runs. Writes are "upserts": insert the row, or
 * update it if it exists, but ONLY if something actually changed. Unchanged rows
 * aren't touched at all, so a tick with no news writes nothing and Supabase
 * Realtime only announces real changes.
 *
 * Rows travel as one JSON parameter per statement and are unpacked in the
 * database with jsonb_to_recordset (one round trip for hundreds of plays).
 */
import type { Queryable } from "./db";
import type {
  BoxPlayerRow,
  GameRow,
  GameRows,
  GameStatsRow,
  InjuryEventRow,
  PlayerRow,
  PlayPointsRow,
  PlayRow,
  TeamRow,
} from "./rows";
import { REPLAY_PREFIX } from "./rows";

const json = (value: unknown) => JSON.stringify(value);

/** How many rows a statement inserted vs updated (unchanged rows aren't counted). */
export interface UpsertCount {
  inserted: number;
  updated: number;
}

function countUpserts(rows: { inserted: boolean }[]): UpsertCount {
  const inserted = rows.filter((r) => r.inserted).length;
  return { inserted, updated: rows.length - inserted };
}

const NONE: UpsertCount = { inserted: 0, updated: 0 };

// ---------------------------------------------------------------------------
// Teams and games
// ---------------------------------------------------------------------------

export async function upsertTeams(db: Queryable, rows: readonly TeamRow[]): Promise<UpsertCount> {
  if (rows.length === 0) return NONE;
  const result = await db.query<{ inserted: boolean }>(
    `insert into public.teams as t (id, abbr, name, short_name, color_primary, color_secondary, logo_url)
     select r.id, r.abbr, r.name, r.short_name, r.color_primary, r.color_secondary, r.logo_url
       from jsonb_to_recordset($1::text::jsonb) as r(id text, abbr text, name text, short_name text,
                                              color_primary text, color_secondary text, logo_url text)
     on conflict (id) do update set
       abbr = excluded.abbr, name = excluded.name, short_name = excluded.short_name,
       color_primary = excluded.color_primary, color_secondary = excluded.color_secondary,
       logo_url = excluded.logo_url
     where (t.abbr, t.name, t.short_name, t.color_primary, t.color_secondary, t.logo_url)
           is distinct from
           (excluded.abbr, excluded.name, excluded.short_name, excluded.color_primary,
            excluded.color_secondary, excluded.logo_url)
     returning (t.xmax = 0) as inserted`,
    [json(rows)],
  );
  return countUpserts(result);
}

/**
 * Odds, weather and venue are never wiped by a blank: ESPN's scoreboard drops the
 * odds once a game is over, and we'd rather keep the last line we saw.
 */
export async function upsertGames(db: Queryable, rows: readonly GameRow[]): Promise<UpsertCount> {
  if (rows.length === 0) return NONE;
  const result = await db.query<{ inserted: boolean }>(
    `with r as (
       select r.id, r.season, r.season_type, r.week, r.kickoff, r.state, r.status_text, r.period, r.clock,
              r.home_team_id, r.away_team_id, r.home_score, r.away_score, r.possession_team_id,
              r.down_distance, r.yard_line, r.is_red_zone,
              nullif(r.odds_json, 'null'::jsonb) as odds_json,
              nullif(r.weather_json, 'null'::jsonb) as weather_json,
              nullif(r.venue_json, 'null'::jsonb) as venue_json
         from jsonb_to_recordset($1::text::jsonb) as r(
              id text, season int, season_type int, week int, kickoff timestamptz, state text,
              status_text text, period int, clock text, home_team_id text, away_team_id text,
              home_score int, away_score int, possession_team_id text, down_distance text,
              yard_line int, is_red_zone boolean, odds_json jsonb, weather_json jsonb, venue_json jsonb)
     )
     insert into public.games as g (id, season, season_type, week, kickoff, state, status_text, period,
                                    clock, home_team_id, away_team_id, home_score, away_score,
                                    possession_team_id, down_distance, yard_line, is_red_zone,
                                    odds_json, weather_json, venue_json)
     select * from r
     on conflict (id) do update set
       season = excluded.season, season_type = excluded.season_type, week = excluded.week,
       kickoff = excluded.kickoff, state = excluded.state, status_text = excluded.status_text,
       period = excluded.period, clock = excluded.clock, home_team_id = excluded.home_team_id,
       away_team_id = excluded.away_team_id, home_score = excluded.home_score,
       away_score = excluded.away_score, possession_team_id = excluded.possession_team_id,
       down_distance = excluded.down_distance, yard_line = excluded.yard_line,
       is_red_zone = excluded.is_red_zone,
       odds_json = coalesce(excluded.odds_json, g.odds_json),
       weather_json = coalesce(excluded.weather_json, g.weather_json),
       venue_json = coalesce(excluded.venue_json, g.venue_json)
     where (g.season, g.season_type, g.week, g.kickoff, g.state, g.status_text, g.period, g.clock,
            g.home_team_id, g.away_team_id, g.home_score, g.away_score, g.possession_team_id,
            g.down_distance, g.yard_line, g.is_red_zone, g.odds_json, g.weather_json, g.venue_json)
           is distinct from
           (excluded.season, excluded.season_type, excluded.week, excluded.kickoff, excluded.state,
            excluded.status_text, excluded.period, excluded.clock, excluded.home_team_id,
            excluded.away_team_id, excluded.home_score, excluded.away_score,
            excluded.possession_team_id, excluded.down_distance, excluded.yard_line,
            excluded.is_red_zone, coalesce(excluded.odds_json, g.odds_json),
            coalesce(excluded.weather_json, g.weather_json), coalesce(excluded.venue_json, g.venue_json))
     returning (g.xmax = 0) as inserted`,
    [json(rows)],
  );
  return countUpserts(result);
}

// ---------------------------------------------------------------------------
// Plays, points, stats, injuries for one game
// ---------------------------------------------------------------------------

async function upsertPlays(db: Queryable, rows: readonly PlayRow[]): Promise<UpsertCount> {
  if (rows.length === 0) return NONE;
  const result = await db.query<{ inserted: boolean }>(
    `insert into public.plays as p (id, game_id, sequence, period, clock, text, play_type, yards, team_id,
                                    scoring_play, score_value, away_score, home_score,
                                    participants_json, raw_json, deleted)
     select r.id, r.game_id, r.sequence, r.period, r.clock, r.text, r.play_type, r.yards, r.team_id,
            r.scoring_play, r.score_value, r.away_score, r.home_score, r.participants_json, r.raw_json, false
       from jsonb_to_recordset($1::text::jsonb) as r(
            id text, game_id text, sequence numeric, period int, clock text, text text, play_type text,
            yards int, team_id text, scoring_play boolean, score_value int, away_score int, home_score int,
            participants_json jsonb, raw_json jsonb)
     on conflict (id) do update set
       game_id = excluded.game_id, sequence = excluded.sequence, period = excluded.period,
       clock = excluded.clock, text = excluded.text, play_type = excluded.play_type,
       yards = excluded.yards, team_id = excluded.team_id, scoring_play = excluded.scoring_play,
       score_value = excluded.score_value, away_score = excluded.away_score,
       home_score = excluded.home_score, participants_json = excluded.participants_json,
       raw_json = excluded.raw_json, deleted = false
     where (p.game_id, p.sequence, p.period, p.clock, p.text, p.play_type, p.yards, p.team_id,
            p.scoring_play, p.score_value, p.away_score, p.home_score, p.participants_json,
            p.raw_json, p.deleted)
           is distinct from
           (excluded.game_id, excluded.sequence, excluded.period, excluded.clock, excluded.text,
            excluded.play_type, excluded.yards, excluded.team_id, excluded.scoring_play,
            excluded.score_value, excluded.away_score, excluded.home_score,
            excluded.participants_json, excluded.raw_json, false)
     returning (p.xmax = 0) as inserted`,
    [json(rows)],
  );
  return countUpserts(result);
}

async function markPlaysDeleted(db: Queryable, playIds: readonly string[]): Promise<number> {
  if (playIds.length === 0) return 0;
  const result = await db.query(
    `update public.plays set deleted = true
      where id in (select jsonb_array_elements_text($1::text::jsonb)) and not deleted
     returning id`,
    [json(playIds)],
  );
  return result.length;
}

async function upsertPlayPoints(db: Queryable, rows: readonly PlayPointsRow[]): Promise<UpsertCount> {
  if (rows.length === 0) return NONE;
  const result = await db.query<{ inserted: boolean }>(
    `insert into public.player_play_points as x (play_id, player_id, stat_changes_json,
                                                 standard_pts, half_pts, ppr_pts)
     select r.play_id, r.player_id, r.stat_changes_json, r.standard_pts, r.half_pts, r.ppr_pts
       from jsonb_to_recordset($1::text::jsonb) as r(play_id text, player_id text, stat_changes_json jsonb,
                                              standard_pts numeric, half_pts numeric, ppr_pts numeric)
     on conflict (play_id, player_id) do update set
       stat_changes_json = excluded.stat_changes_json, standard_pts = excluded.standard_pts,
       half_pts = excluded.half_pts, ppr_pts = excluded.ppr_pts
     where (x.stat_changes_json, x.standard_pts, x.half_pts, x.ppr_pts)
           is distinct from
           (excluded.stat_changes_json, excluded.standard_pts, excluded.half_pts, excluded.ppr_pts)
     returning (x.xmax = 0) as inserted`,
    [json(rows)],
  );
  return countUpserts(result);
}

/** Removes points rows for this game that the latest play-by-play no longer has. */
async function deleteStalePlayPoints(db: Queryable, gameId: string, keep: readonly PlayPointsRow[]): Promise<number> {
  const result = await db.query(
    `delete from public.player_play_points x
      using public.plays p
      where x.play_id = p.id and p.game_id = $1
        and not exists (
          select 1 from jsonb_to_recordset($2::text::jsonb) as k(play_id text, player_id text)
           where k.play_id = x.play_id and k.player_id = x.player_id)
     returning x.play_id`,
    [gameId, json(keep.map((r) => ({ play_id: r.play_id, player_id: r.player_id })))],
  );
  return result.length;
}

async function upsertGameStats(db: Queryable, rows: readonly GameStatsRow[]): Promise<UpsertCount> {
  if (rows.length === 0) return NONE;
  const result = await db.query<{ inserted: boolean }>(
    `insert into public.player_game_stats as s (game_id, player_id, stats_json, standard_pts, half_pts, ppr_pts)
     select r.game_id, r.player_id, r.stats_json, r.standard_pts, r.half_pts, r.ppr_pts
       from jsonb_to_recordset($1::text::jsonb) as r(game_id text, player_id text, stats_json jsonb,
                                              standard_pts numeric, half_pts numeric, ppr_pts numeric)
     on conflict (game_id, player_id) do update set
       stats_json = excluded.stats_json, standard_pts = excluded.standard_pts,
       half_pts = excluded.half_pts, ppr_pts = excluded.ppr_pts
     where (s.stats_json, s.standard_pts, s.half_pts, s.ppr_pts)
           is distinct from
           (excluded.stats_json, excluded.standard_pts, excluded.half_pts, excluded.ppr_pts)
     returning (s.xmax = 0) as inserted`,
    [json(rows)],
  );
  return countUpserts(result);
}

async function deleteStaleGameStats(db: Queryable, gameId: string, keep: readonly GameStatsRow[]): Promise<number> {
  const result = await db.query(
    `delete from public.player_game_stats
      where game_id = $1 and player_id not in (select jsonb_array_elements_text($2::text::jsonb))
     returning player_id`,
    [gameId, json(keep.map((r) => r.player_id))],
  );
  return result.length;
}

export async function insertInjuryEvents(db: Queryable, rows: readonly InjuryEventRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await db.query(
    `insert into public.injury_events (id, player_id, game_id, status, note, source)
     select r.id, r.player_id, r.game_id, r.status, r.note, r.source
       from jsonb_to_recordset($1::text::jsonb) as r(id uuid, player_id text, game_id text, status text,
                                              note text, source text)
     on conflict (id) do nothing
     returning id`,
    [json(rows)],
  );
  return result.length;
}

/** Gives every box-score player a name in `players` if the player list hasn't added them yet. */
async function insertMissingPlayers(db: Queryable, rows: readonly BoxPlayerRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await db.query(
    `insert into public.players (id, full_name, team_id)
     select r.id, r.full_name, r.team_id
       from jsonb_to_recordset($1::text::jsonb) as r(id text, full_name text, team_id text)
     on conflict (id) do nothing
     returning id`,
    [json(rows)],
  );
  return result.length;
}

/**
 * When ESPN's play list suddenly shrinks a lot, it's far more likely a glitchy
 * response than a mass correction, so we don't mark anything deleted that tick.
 * Returns the plays to mark deleted, or null to skip deletions.
 */
export function playsToDelete(stored: readonly string[], latest: readonly string[]): string[] | null {
  if (latest.length === 0) return stored.length === 0 ? [] : null;
  const keep = new Set(latest);
  const missing = stored.filter((id) => !keep.has(id));
  const limit = Math.max(10, Math.ceil(stored.length * 0.2));
  return missing.length > limit ? null : missing;
}

export interface GameWriteResult {
  game: UpsertCount;
  plays: UpsertCount & { deleted: number };
  points: UpsertCount & { deleted: number };
  stats: UpsertCount & { deleted: number };
  injuries: number;
  /** False when a suspicious play list made us skip deletions this time. */
  deletionsApplied: boolean;
}

/** Writes one game's rows. Call it inside a transaction (db.transaction). */
export async function writeGameRows(db: Queryable, rows: GameRows): Promise<GameWriteResult> {
  await upsertTeams(db, rows.teams);
  const game = await upsertGames(db, [rows.game]);
  const gameId = rows.game.id;

  const stored = await db.query<{ id: string }>(
    "select id from public.plays where game_id = $1 and not deleted",
    [gameId],
  );
  const toDelete = playsToDelete(
    stored.map((r) => r.id),
    rows.plays.map((p) => p.id),
  );
  const deletionsApplied = toDelete !== null;

  const plays = { ...(await upsertPlays(db, rows.plays)), deleted: await markPlaysDeleted(db, toDelete ?? []) };
  const points = {
    ...(await upsertPlayPoints(db, rows.points)),
    deleted: deletionsApplied ? await deleteStalePlayPoints(db, gameId, rows.points) : 0,
  };
  await insertMissingPlayers(db, rows.boxPlayers);
  const stats = {
    ...(await upsertGameStats(db, rows.stats)),
    deleted: deletionsApplied && rows.stats.length > 0 ? await deleteStaleGameStats(db, gameId, rows.stats) : 0,
  };
  const injuries = await insertInjuryEvents(db, rows.injuries);
  return { game, plays, points, stats, injuries, deletionsApplied };
}

/** True if a write changed anything at all. */
export function changedAnything(result: GameWriteResult): boolean {
  const n = (c: UpsertCount & { deleted?: number }) => c.inserted + c.updated + (c.deleted ?? 0);
  return n(result.game) + n(result.plays) + n(result.points) + n(result.stats) + result.injuries > 0;
}

// ---------------------------------------------------------------------------
// Players, rosters and injury status
// ---------------------------------------------------------------------------

export interface TrackedPlayer {
  playerId: string;
  /** From the players table; null until the player list has been loaded. */
  teamId: string | null;
  name: string | null;
}

/** Everyone on anyone's roster (each player once), with their team if we know it. */
export async function readTrackedPlayers(db: Queryable): Promise<TrackedPlayer[]> {
  const rows = await db.query<{ player_id: string; team_id: string | null; full_name: string | null }>(
    `select rp.player_id, p.team_id, p.full_name
       from (select distinct player_id from public.roster_players) rp
       left join public.players p on p.id = rp.player_id
      order by rp.player_id`,
  );
  return rows.map((r) => ({ playerId: r.player_id, teamId: r.team_id, name: r.full_name }));
}

/** The provider's player list → players table (names, positions, teams, headshots). */
export async function upsertPlayers(db: Queryable, rows: readonly PlayerRow[]): Promise<UpsertCount> {
  if (rows.length === 0) return NONE;
  const result = await db.query<{ inserted: boolean }>(
    `insert into public.players as p (id, full_name, short_name, position, team_id, headshot_url)
     select r.id, r.full_name, r.short_name, r.position, r.team_id, r.headshot_url
       from jsonb_to_recordset($1::text::jsonb) as r(id text, full_name text, short_name text, position text,
                                              team_id text, headshot_url text)
     on conflict (id) do update set
       full_name = excluded.full_name, short_name = excluded.short_name, position = excluded.position,
       team_id = excluded.team_id, headshot_url = excluded.headshot_url
     where (p.full_name, p.short_name, p.position, p.team_id, p.headshot_url)
           is distinct from
           (excluded.full_name, excluded.short_name, excluded.position, excluded.team_id, excluded.headshot_url)
     returning (p.xmax = 0) as inserted`,
    [json(rows)],
  );
  return countUpserts(result);
}

/**
 * Saves each player's fantasy injury status and records an injury event when it
 * CHANGED ("QUESTIONABLE" → "OUT"). The first status we ever see for a player is
 * just saved, not reported as a change. Players not in the players table yet are
 * skipped (the next check catches them). "for update" makes two workers running at
 * once (e.g. during a redeploy) unable to record the same change twice.
 */
export async function applyInjuryStatuses(
  db: Queryable,
  statuses: readonly { player_id: string; status: string }[],
): Promise<{ player_id: string; status: string; note: string }[]> {
  if (statuses.length === 0) return [];
  return db.query(
    `with input as (
       select distinct on (i.player_id) i.player_id, i.status
         from jsonb_to_recordset($1::text::jsonb) as i(player_id text, status text)
     ),
     old as (
       select p.id, p.injury_status from public.players p join input i on i.player_id = p.id
          for update of p
     ),
     changed as (
       update public.players p set injury_status = i.status
         from input i join old o on o.id = i.player_id
        where p.id = i.player_id and o.injury_status is distinct from i.status
       returning p.id, o.injury_status as previous, i.status
     )
     insert into public.injury_events (player_id, status, note, source)
     select c.id, c.status, 'Was ' || c.previous, 'espn-fantasy'
       from changed c
      where c.previous is not null
     returning player_id, status, note`,
    [json(statuses)],
  );
}

// ---------------------------------------------------------------------------
// Replays
// ---------------------------------------------------------------------------

/**
 * Deletes replay data: one replay (`replay-<gameId>`) or all of them. Plays, points
 * and stats go with the game (the tables cascade); injury events are deleted here.
 * Can only ever touch rows whose game id starts with "replay-".
 */
export async function deleteReplays(db: Queryable, espnGameId?: string): Promise<number> {
  const only = espnGameId ? `${REPLAY_PREFIX}${espnGameId}` : null;
  await db.query(
    `delete from public.injury_events
      where game_id like 'replay-%' and ($1::text is null or game_id = $1::text)`,
    [only],
  );
  const games = await db.query(
    `delete from public.games
      where id like 'replay-%' and ($1::text is null or id = $1::text)
     returning id`,
    [only],
  );
  return games.length;
}
