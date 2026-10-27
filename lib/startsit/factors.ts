/**
 * Turns the app's football data (players, projections, schedule, odds, defense
 * stats) into the model's inputs. Pure: the API route fetches, this assembles.
 * Anything missing becomes null, and the model treats null as "unknown".
 */
import type {
  DefenseVsPosition,
  Game,
  InjuryStatus,
  OffensePosition,
  Player,
  PlayerOutlook,
  Scoreboard,
  Team,
} from "@/lib/providers/types";
import { roundPoints, rulesForFormat, scoreStatLine, type ScoringFormat, type ScoringRules } from "@/lib/scoring";
import { MODEL } from "./model";
import type { MatchupInput, PlayerFactors, VegasInput, WeatherInput } from "./types";

export const OFFENSE_POSITIONS: readonly OffensePosition[] = ["QB", "RB", "WR", "TE"];

export function isOffense(position: string): position is OffensePosition {
  return (OFFENSE_POSITIONS as readonly string[]).includes(position);
}

/** Last finished week for "defense vs. position": all of last week and before. */
export function throughWeekFor(seasonType: number, week: number): number {
  if (seasonType === 2) return Math.max(0, week - 1);
  if (seasonType === 3) return 18; // playoffs: the whole regular season
  return 0; // preseason
}

/** Statuses that mean the player won't play this week. */
const WONT_PLAY: InjuryStatus[] = ["OUT", "INJURY_RESERVE", "SUSPENSION"];

export interface DefenseRow {
  teamId: string;
  games: number;
  allowedPerGame: number;
  /** 1 = allows the fewest points (toughest). */
  rank: number;
}

export interface PositionTable {
  leagueAverage: number;
  teams: number;
  byTeam: Record<string, DefenseRow>;
}

export type DefenseTable = Record<OffensePosition, PositionTable>;

/** Points allowed per game to each position, in this format, ranked 1 (toughest) to 32 (easiest). */
export function rankDefenses(dvp: DefenseVsPosition, format: ScoringFormat, custom?: Readonly<ScoringRules> | null): DefenseTable {
  const rules = custom ?? rulesForFormat(format);
  const table = {} as DefenseTable;
  for (const position of OFFENSE_POSITIONS) {
    const rows = Object.entries(dvp.teams)
      .map(([teamId, positions]) => {
        const allowed = positions[position];
        if (!allowed || allowed.games <= 0) return null;
        return { teamId, games: allowed.games, allowedPerGame: scoreStatLine(allowed.stats, rules).total / allowed.games, rank: 0 };
      })
      .filter((row): row is DefenseRow => row !== null)
      .sort((a, b) => a.allowedPerGame - b.allowedPerGame || a.teamId.localeCompare(b.teamId));
    rows.forEach((row, i) => (row.rank = i + 1));
    const leagueAverage = rows.length ? rows.reduce((sum, r) => sum + r.allowedPerGame, 0) / rows.length : 0;
    table[position] = {
      leagueAverage,
      teams: rows.length,
      byTeam: Object.fromEntries(rows.map((r) => [r.teamId, r])),
    };
  }
  return table;
}

/** Average implied team total this week (each game's over/under split in two). */
export function weekImpliedAverage(games: Game[]): number {
  const totals = games.map((g) => g.odds?.overUnder).filter((t): t is number => typeof t === "number" && t > 0);
  return totals.length ? totals.reduce((sum, t) => sum + t, 0) / totals.length / 2 : MODEL.vegas.fallbackAverage;
}

/**
 * The points the betting market expects one team to score.
 * ESPN's `spread` is from the HOME team's side (−3 = home favored by 3; checked
 * against homeTeamOdds.favorite in samples/scoreboard.json), so flip it for the away team.
 *   implied = overUnder / 2 − teamSpread / 2
 */
export function vegasFor(game: Game, teamId: string, leagueAverage: number): VegasInput | null {
  const overUnder = game.odds?.overUnder;
  const homeSpread = game.odds?.spread;
  if (typeof overUnder !== "number" || overUnder <= 0 || typeof homeSpread !== "number") return null;
  const isHome = game.home.team.id === teamId;
  const spread = isHome ? homeSpread : -homeSpread;
  const side = isHome ? game.home : game.away;
  return {
    teamAbbr: side.team.abbr,
    impliedTotal: roundPoints(overUnder / 2 - spread / 2),
    leagueAverage: roundPoints(leagueAverage),
    overUnder,
    spread: spread === 0 ? 0 : spread,
  };
}

function weatherFor(game: Game): WeatherInput | null {
  if (game.venue?.indoor) return { indoor: true };
  if (!game.weather) return null;
  return { indoor: false, text: game.weather.text || undefined, temperature: game.weather.temperature };
}

export interface AssembleInput {
  format: ScoringFormat;
  /** A league's own scoring (from an ESPN league), instead of the format's preset. */
  rules?: Readonly<ScoringRules> | null;
  /** The week being decided. Only earlier weeks count as "recent form". */
  week: number;
  players: Player[];
  /** Null when projections couldn't be loaded. */
  outlooks: PlayerOutlook[] | null;
  scoreboard: Scoreboard;
  byeWeeks: Record<string, number> | null;
  defense: DefenseVsPosition | null;
  teams: Team[];
  /** Back-tests pass false: today's injury report says nothing about a past week. */
  useInjuries?: boolean;
}

/** One PlayerFactors per player, in the same order. Kickers and D/ST should be filtered out first. */
export function assemblePlayerFactors(input: AssembleInput): PlayerFactors[] {
  const rules = input.rules ?? rulesForFormat(input.format);
  const table = input.defense && input.defense.throughWeek > 0 ? rankDefenses(input.defense, input.format, input.rules) : null;
  const impliedAverage = weekImpliedAverage(input.scoreboard.games);
  const abbrById = new Map(input.teams.map((t) => [t.id, t.abbr]));
  const useInjuries = input.useInjuries ?? true;

  return input.players.filter((p) => isOffense(p.position)).map((player) => {
    const position = player.position as OffensePosition;
    const outlook = input.outlooks?.find((o) => o.playerId === player.id);
    const teamId = player.teamId;
    const game = teamId
      ? input.scoreboard.games.find((g) => g.home.team.id === teamId || g.away.team.id === teamId)
      : undefined;
    const isHome = game ? game.home.team.id === teamId : false;
    const opponent = game ? (isHome ? game.away.team : game.home.team) : null;

    const injuryStatus: InjuryStatus | null = !useInjuries || !input.outlooks ? null : (outlook?.injuryStatus ?? null);
    let unavailable: PlayerFactors["unavailable"] = null;
    if (!game) unavailable = teamId && input.byeWeeks?.[teamId] === input.week ? "bye" : "no-game";
    else if (injuryStatus && WONT_PLAY.includes(injuryStatus)) unavailable = "out";

    let matchup: MatchupInput | null = null;
    const row = opponent && table ? table[position].byTeam[opponent.id] : undefined;
    if (opponent && row && table) {
      matchup = {
        opponentId: opponent.id,
        opponentAbbr: opponent.abbr,
        rank: row.rank,
        teams: table[position].teams,
        allowedPerGame: roundPoints(row.allowedPerGame),
        leagueAverage: roundPoints(table[position].leagueAverage),
        games: row.games,
      };
    }

    return {
      playerId: player.id,
      name: player.name,
      position,
      teamId,
      teamAbbr: (teamId && abbrById.get(teamId)) || (game ? (isHome ? game.home.team.abbr : game.away.team.abbr) : null),
      headshot: player.headshot,
      unavailable,
      injuryStatus,
      projection: outlook?.projection ? scoreStatLine(outlook.projection, rules).total : null,
      recent: (outlook?.weeks ?? [])
        .filter((w) => w.week >= 1 && w.week < input.week)
        .map((w) => ({ week: w.week, points: scoreStatLine(w.stats, rules).total })),
      matchup,
      vegas: game && teamId ? vegasFor(game, teamId, impliedAverage) : null,
      weather: game ? weatherFor(game) : null,
      game:
        game && opponent
          ? { id: game.id, kickoff: game.kickoff, state: game.state, isHome, opponentAbbr: opponent.abbr }
          : null,
    };
  });
}
