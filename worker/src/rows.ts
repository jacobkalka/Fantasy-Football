/**
 * Turns the provider's data (lib/providers/types.ts) into database rows, one
 * plain object per row with the same column names as the tables in
 * supabase/migrations/20261022000000_init.sql.
 *
 * Pure: no database, no fetching. Fed with the real samples in test/rows.test.ts.
 */
import { createHash } from "node:crypto";
import { playTextName } from "@/lib/live/team";
import type { AttributedPlay, Game, GameDetail, Player, PlayerGameLine, Team } from "@/lib/providers/types";
import { addStatLines, scoreAllFormats } from "@/lib/scoring";
import type { StatLine } from "@/lib/stats";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface TeamRow {
  id: string;
  abbr: string;
  name: string;
  short_name: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  logo_url: string | null;
}

export interface GameRow {
  id: string;
  season: number;
  season_type: number | null;
  week: number | null;
  kickoff: string | null;
  state: "pre" | "in" | "post";
  status_text: string | null;
  period: number | null;
  clock: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  possession_team_id: string | null;
  down_distance: string | null;
  yard_line: number | null;
  is_red_zone: boolean;
  odds_json: Game["odds"] | null;
  weather_json: Game["weather"] | null;
  venue_json: Game["venue"] | null;
}

export interface PlayRow {
  id: string;
  game_id: string;
  sequence: number;
  period: number;
  clock: string;
  text: string;
  play_type: string;
  yards: number;
  team_id: string | null;
  scoring_play: boolean;
  score_value: number;
  away_score: number;
  home_score: number;
  participants_json: AttributedPlay["participants"];
  /** Details with no column of their own (see PlayExtras). */
  raw_json: PlayExtras;
}

/**
 * Stored in plays.raw_json: the provider's own fields that have no column.
 * Not ESPN's raw response: the worker only sees the provider's shapes.
 */
export interface PlayExtras {
  espnPlayId: string;
  wallclock: string | null;
  /** ESPN's "last changed" time: a new value means ESPN corrected the play. */
  modified: string | null;
  isPenalty: boolean;
  isTurnover: boolean;
}

export interface PlayPointsRow {
  play_id: string;
  player_id: string;
  stat_changes_json: StatLine;
  standard_pts: number;
  half_pts: number;
  ppr_pts: number;
}

export interface GameStatsRow {
  game_id: string;
  player_id: string;
  stats_json: StatLine;
  standard_pts: number;
  half_pts: number;
  ppr_pts: number;
}

export interface InjuryEventRow {
  /** Made from the play, player and status, so the same report is never stored twice. */
  id: string;
  player_id: string;
  game_id: string | null;
  status: string;
  note: string | null;
  source: string;
}

/** Minimal player rows, so every player in a box score has a name in the database. */
export interface BoxPlayerRow {
  id: string;
  full_name: string;
  team_id: string | null;
}

export interface PlayerRow {
  id: string;
  full_name: string;
  short_name: string | null;
  position: string;
  team_id: string | null;
  headshot_url: string | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * A UUID that is always the same for the same text (a "version 5 style" UUID).
 * injury_events has a random id by default; giving each event an id made from
 * what it describes lets the database refuse duplicates (`on conflict do nothing`).
 */
export function stableUuid(key: string): string {
  const bytes = createHash("sha1").update(`the-feed:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** "3rd & 7 at KC 35" → 35, "1st & 10 at 50" → 50. The side of the field stays in down_distance. */
export function yardLineFrom(downDistance: string | undefined): number | null {
  const match = downDistance?.match(/\bat (?:[A-Z]{2,4} )?(\d{1,2})\b/);
  return match ? Number(match[1]) : null;
}

/** Fantasy points in all three formats, named like the table columns. */
function points(stats: StatLine) {
  const all = scoreAllFormats(stats);
  return { standard_pts: all.standard, half_pts: all.half, ppr_pts: all.ppr };
}

/** Prefix for rows written by replay mode ("replay-401872996"), "" for real games. */
export const REPLAY_PREFIX = "replay-";

// ---------------------------------------------------------------------------
// Teams and games
// ---------------------------------------------------------------------------

/** null for placeholder teams ESPN sends before playoff matchups are known. */
export function teamRow(team: Team): TeamRow | null {
  if (!/^\d+$/.test(team.id) || !team.abbr || team.abbr === "?") return null;
  return {
    id: team.id,
    abbr: team.abbr,
    name: team.displayName || team.name,
    short_name: team.name || null,
    color_primary: team.color || null,
    color_secondary: team.altColor || null,
    logo_url: team.logo || null,
  };
}

/** Every distinct real team in these games. */
export function teamRows(games: readonly Game[]): TeamRow[] {
  const rows = new Map<string, TeamRow>();
  for (const game of games) {
    for (const team of [game.home.team, game.away.team]) {
      const row = teamRow(team);
      if (row) rows.set(row.id, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The scoreboard and a game's summary describe the same game slightly
 * differently (seen in samples/: a finished game's summary has no period or
 * clock and gets "indoor" wrong; the scoreboard drops the odds after the game).
 * Start from the summary (fresher situation, odds) and fill gaps from the scoreboard.
 */
export function mergeGame(fromSummary: Game, fromScoreboard: Game | undefined): Game {
  if (!fromScoreboard) return fromSummary;
  return {
    ...fromSummary,
    kickoff: fromSummary.kickoff || fromScoreboard.kickoff,
    statusText: fromSummary.statusText || fromScoreboard.statusText,
    period: fromSummary.period || fromScoreboard.period,
    clock: fromSummary.clock || fromScoreboard.clock,
    situation: fromSummary.situation ?? fromScoreboard.situation,
    odds: fromScoreboard.odds ?? fromSummary.odds,
    weather: fromScoreboard.weather ?? fromSummary.weather,
    venue: fromScoreboard.venue ?? fromSummary.venue,
  };
}

export function gameRow(game: Game, idPrefix = ""): GameRow {
  const live = game.state === "in";
  const situation = live ? game.situation : undefined;
  const teamId = (team: Team) => (/^\d+$/.test(team.id) ? team.id : null);
  return {
    id: idPrefix + game.id,
    season: game.season,
    season_type: game.seasonType || null,
    week: game.week || null,
    kickoff: game.kickoff || null,
    state: game.state,
    status_text: game.statusText || null,
    period: game.period || null,
    clock: game.clock || null,
    home_team_id: teamId(game.home.team),
    away_team_id: teamId(game.away.team),
    home_score: game.home.score,
    away_score: game.away.score,
    possession_team_id: situation?.possessionTeamId ?? null,
    down_distance: situation?.downDistance ?? null,
    yard_line: yardLineFrom(situation?.downDistance),
    is_red_zone: Boolean(situation?.isRedZone),
    odds_json: game.odds ?? null,
    weather_json: game.weather ?? null,
    venue_json: game.venue ?? null,
  };
}

// ---------------------------------------------------------------------------
// Plays and per-play points
// ---------------------------------------------------------------------------

export function playRow(play: AttributedPlay, dbGameId: string, idPrefix = ""): PlayRow {
  return {
    id: idPrefix + play.id,
    game_id: dbGameId,
    sequence: play.sequence,
    period: play.period,
    clock: play.clock,
    text: play.text,
    play_type: play.type,
    yards: Math.round(play.yards),
    team_id: play.teamId ?? null,
    scoring_play: play.scoring,
    score_value: play.scoreValue,
    away_score: play.awayScore,
    home_score: play.homeScore,
    participants_json: play.participants,
    raw_json: {
      espnPlayId: play.id,
      wallclock: play.wallclock ?? null,
      modified: play.modified ?? null,
      isPenalty: play.isPenalty,
      isTurnover: play.isTurnover,
    },
  };
}

/** One row per player per play that changed their stats, with points in all three formats. */
export function playPointsRows(plays: readonly AttributedPlay[], idPrefix = ""): PlayPointsRow[] {
  const rows: PlayPointsRow[] = [];
  for (const play of plays) {
    for (const delta of play.deltas) {
      rows.push({
        play_id: idPrefix + play.id,
        player_id: delta.playerId,
        stat_changes_json: delta.stats,
        ...points(delta.stats),
      });
    }
  }
  return rows;
}

const TWO_POINT_KEYS = ["pass2pt", "rush2pt", "rec2pt"] as const;

/**
 * Each player's game line: the official box score, plus two-point conversions
 * from the plays (box scores leave those out). A player who appears only in the
 * plays (box score not out yet, or replay mode) gets the play-by-play totals.
 * Same rule as lib/live/team.ts, so the app and the database agree.
 */
export function gameStatsRows(
  boxscore: Readonly<Record<string, PlayerGameLine>>,
  plays: readonly AttributedPlay[],
  dbGameId: string,
): GameStatsRow[] {
  const fromPlays = new Map<string, StatLine>();
  for (const play of plays) {
    for (const delta of play.deltas) {
      fromPlays.set(delta.playerId, addStatLines(fromPlays.get(delta.playerId) ?? {}, delta.stats));
    }
  }
  const playerIds = new Set([...Object.keys(boxscore), ...fromPlays.keys()]);
  const rows: GameStatsRow[] = [];
  for (const playerId of [...playerIds].sort()) {
    const box = boxscore[playerId]?.stats;
    const played = fromPlays.get(playerId) ?? {};
    let stats: StatLine = box ? { ...box } : played;
    if (box) {
      for (const key of TWO_POINT_KEYS) if (played[key]) stats = { ...stats, [key]: played[key] };
    }
    rows.push({ game_id: dbGameId, player_id: playerId, stats_json: stats, ...points(stats) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// In-game injuries ("JAX-A.Abdullah was injured during the play.")
// ---------------------------------------------------------------------------

/** Same wording lib/live/team.ts looks for; each phrase maps to a status we store. */
const INJURY_PHRASES: readonly [RegExp, string][] = [
  [/was injured/i, "INJURED"],
  [/is questionable to return/i, "QUESTIONABLE_TO_RETURN"],
  [/is doubtful to return/i, "DOUBTFUL_TO_RETURN"],
  [/will not return|is out for the game/i, "OUT_FOR_GAME"],
  [/has returned to the game/i, "RETURNED"],
];
const INJURY_PATTERN = new RegExp(INJURY_PHRASES.map(([re]) => re.source).join("|"), "i");

/** A player we can recognise in play text. */
export interface NamedPlayer {
  playerId: string;
  name: string;
  teamId: string | null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Play text uses the NFL's play-by-play team codes, which differ from ESPN's
 * abbreviations for a few teams (samples/ show "HST-A.Al-Shaair" for Houston).
 */
const PLAY_TEXT_CODES: Readonly<Record<string, string>> = {
  ARZ: "ARI",
  BLT: "BAL",
  CLV: "CLE",
  HST: "HOU",
  LA: "LAR",
  WAS: "WSH",
};

/**
 * Injury reports in the play text for any of `players` (the game's box score plus
 * tracked players). Text names players as "JAX-A.Abdullah". When a team code is
 * there, it must not be the OTHER team's, so two "A.Brown"s are never mixed up.
 */
export function inGameInjuryRows(
  plays: readonly AttributedPlay[],
  players: readonly NamedPlayer[],
  teamAbbr: ReadonlyMap<string, string>,
  dbGameId: string,
  idPrefix = "",
): InjuryEventRow[] {
  const candidates = players
    .filter((p) => p.name && !p.playerId.startsWith("-"))
    .map((p) => {
      const short = escapeRegExp(playTextName(p.name));
      const own = p.teamId ? teamAbbr.get(p.teamId) : undefined;
      return {
        ...p,
        own,
        others: [...teamAbbr.entries()].filter(([id]) => id !== p.teamId).map(([, abbr]) => abbr),
        // "A.Abdullah" not glued to another word, with or without "JAX-" in front.
        bare: new RegExp(`(?:^|[\\s(])${short}(?![A-Za-z'])`),
        prefixed: new RegExp(`\\b([A-Z]{2,4})-${short}(?![A-Za-z'])`, "g"),
      };
    });

  const rows = new Map<string, InjuryEventRow>();
  for (const play of plays) {
    if (!INJURY_PATTERN.test(play.text)) continue;
    // Same sentence split as lib/live/team.ts.
    const sentences = play.text.split(/(?<=[.!])\s+|\*\*\s*/);
    for (const sentence of sentences) {
      const phrase = INJURY_PHRASES.find(([re]) => re.test(sentence));
      if (!phrase) continue;
      for (const player of candidates) {
        const codes = [...sentence.matchAll(player.prefixed)].map((m) => PLAY_TEXT_CODES[m[1]] ?? m[1]);
        const named =
          codes.length > 0
            ? codes.some((code) => code === player.own || !player.others.includes(code))
            : player.bare.test(sentence);
        if (!named) continue;
        const status = phrase[1];
        const playId = idPrefix + play.id;
        const id = stableUuid(`injury:${playId}:${player.playerId}:${status}`);
        rows.set(id, {
          id,
          player_id: player.playerId,
          game_id: dbGameId,
          status,
          note: sentence.replace(/^Injury Update:\s*/i, "").trim(),
          source: "espn-play",
        });
      }
    }
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------------------
// Everything for one game
// ---------------------------------------------------------------------------

export interface GameRows {
  game: GameRow;
  teams: TeamRow[];
  plays: PlayRow[];
  points: PlayPointsRow[];
  stats: GameStatsRow[];
  injuries: InjuryEventRow[];
  boxPlayers: BoxPlayerRow[];
}

export interface BuildOptions {
  /** The same game from this tick's scoreboard, to fill gaps in the summary. */
  scoreboardGame?: Game;
  /** Tracked players (with names) so their injuries are noticed even with no stats yet. */
  trackedPlayers?: readonly NamedPlayer[];
  /** REPLAY_PREFIX in replay mode. */
  idPrefix?: string;
}

/** All rows for one game from its play-by-play detail. */
export function buildGameRows(detail: GameDetail, options: BuildOptions = {}): GameRows {
  const prefix = options.idPrefix ?? "";
  const game = mergeGame(detail.game, options.scoreboardGame);
  const row = gameRow(game, prefix);
  const teamAbbr = new Map([game.home.team, game.away.team].map((t) => [t.id, t.abbr]));
  const boxPlayers = Object.values(detail.boxscore).map((line) => ({
    playerId: line.playerId,
    name: line.name,
    teamId: line.teamId || null,
  }));
  const inGame = new Set([row.home_team_id, row.away_team_id]);
  const tracked = (options.trackedPlayers ?? []).filter((p) => p.teamId && inGame.has(p.teamId));
  const named = new Map<string, NamedPlayer>();
  for (const p of [...tracked, ...boxPlayers]) named.set(p.playerId, p);

  return {
    game: row,
    teams: teamRows([game]),
    plays: detail.plays.map((play) => playRow(play, row.id, prefix)),
    points: playPointsRows(detail.plays, prefix),
    stats: gameStatsRows(detail.boxscore, detail.plays, row.id),
    injuries: inGameInjuryRows(detail.plays, [...named.values()], teamAbbr, row.id, prefix),
    boxPlayers: boxPlayers
      .filter((p) => p.name)
      .map((p) => ({ id: p.playerId, full_name: p.name, team_id: p.teamId })),
  };
}

/** Rows for the players table from the provider's player list. */
export function playerRows(players: readonly Player[]): PlayerRow[] {
  const rows = new Map<string, PlayerRow>();
  for (const p of players) {
    if (!p.id || !p.name) continue;
    rows.set(p.id, {
      id: p.id,
      full_name: p.name,
      short_name: p.position === "DST" ? null : playTextName(p.name),
      position: p.position,
      team_id: p.teamId,
      headshot_url: p.headshot,
    });
  }
  return [...rows.values()];
}
