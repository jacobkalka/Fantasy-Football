/**
 * Turns the provider's player universe (stat lines) into points for one scoring format,
 * using the app's own scoring engine (ESPN's appliedTotal is PPR-only, so it's never used).
 * The result is small enough to send to the phone (/api/universe), where the analysis runs.
 */
import type { InjuryStatus, PlayerUniverse, Position, UniversePlayer } from "@/lib/providers/types";
import { roundPoints, rulesForFormat, scoreStatLine, type ScoringFormat, type ScoringRules } from "@/lib/scoring";
import type { StatLine } from "@/lib/stats";

export interface AnalysisGame {
  week: number;
  points: number;
  /** Chances to touch the ball: targets + carries (QBs: passes + carries). Null for K and D/ST. */
  opportunities: number | null;
}

export interface RestOfSeason {
  /** Projected points from now to the end of the regular season. */
  points: number;
  /** Games ESPN expects him to play (fractional when it expects him to miss time). */
  games: number;
  /** Games his NFL team has left. */
  teamGames: number;
}

export interface AnalysisPlayer {
  id: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  injuryStatus: InjuryStatus;
  byeWeek: number | null;
  percentOwned: number | null;
  percentOwnedChange: number | null;
  percentStarted: number | null;
  /** ESPN's projection for this week in points; 0 on a bye; null when ESPN has none. */
  weekProjection: number | null;
  /** Games he played in finished weeks, oldest first. */
  games: AnalysisGame[];
  /** Points in finished weeks. */
  seasonPoints: number;
  /** Null when ESPN has no rest-of-season projection; `rosNote` then says why. */
  ros: RestOfSeason | null;
  rosNote: string | null;
}

export interface Universe {
  season: number;
  /** The fantasy week being played now (projections are for this week). */
  week: number;
  /** Last finished week: season stats and trends use weeks 1..throughWeek only. */
  throughWeek: number;
  format: ScoringFormat;
  fetchedAt: string | null;
  players: AnalysisPlayer[];
}

const OUT_FOR_WEEK: InjuryStatus[] = ["OUT", "INJURY_RESERVE", "SUSPENSION"];

/** True when he can't play this week (out, injured reserve, suspended). */
export function isOut(player: Pick<AnalysisPlayer, "injuryStatus">): boolean {
  return OUT_FOR_WEEK.includes(player.injuryStatus);
}

function opportunities(position: Position, stats: StatLine): number | null {
  if (position === "QB") return (stats.passAtt ?? 0) + (stats.rushAtt ?? 0);
  if (position === "RB" || position === "WR" || position === "TE") return (stats.targets ?? 0) + (stats.rushAtt ?? 0);
  return null;
}

/**
 * Scores one player. ESPN's rest-of-season projection starts with the current week. Once his
 * team's game this week has started (a real line for this week exists), that game is no longer
 * "rest of season", so this week's projection and one game are taken out.
 */
export function scorePlayer(
  raw: UniversePlayer,
  week: number,
  format: ScoringFormat,
  custom?: Readonly<ScoringRules> | null,
): AnalysisPlayer {
  const rules = custom ?? rulesForFormat(format);
  const score = (line: StatLine) => scoreStatLine(line, rules).total;

  const games: AnalysisGame[] = raw.weeks
    .filter((w) => w.week < week && w.played)
    .map((w) => ({ week: w.week, points: score(w.stats), opportunities: opportunities(raw.position, w.stats) }));
  const weekProjection = raw.weekProjection ? score(raw.weekProjection) : null;

  let ros: RestOfSeason | null = null;
  let rosNote: string | null = null;
  if (raw.restOfSeason) {
    let points = score(raw.restOfSeason.stats);
    let teamGames = raw.teamGamesLeft ?? raw.restOfSeason.games;
    let playerGames = Math.min(raw.restOfSeason.games, teamGames);
    const startedThisWeek = raw.weeks.some((w) => w.week === week);
    if (startedThisWeek && teamGames > 0) {
      const thisWeek = weekProjection ?? 0;
      points = Math.max(0, points - thisWeek);
      if (thisWeek > 0) playerGames = Math.max(0, playerGames - Math.min(1, playerGames / teamGames));
      teamGames -= 1;
    }
    ros = { points: roundPoints(points), games: roundPoints(playerGames), teamGames };
    if (playerGames === 0 || points === 0) {
      rosNote = `ESPN doesn't project him to score again this season${statusNote(raw.injuryStatus)}.`;
    }
  } else {
    rosNote = "ESPN has no rest-of-season projection for him.";
  }

  return {
    id: raw.id,
    name: raw.name,
    position: raw.position,
    teamId: raw.teamId,
    headshot: raw.headshot,
    injuryStatus: raw.injuryStatus,
    byeWeek: raw.byeWeek,
    percentOwned: raw.percentOwned,
    percentOwnedChange: raw.percentOwnedChange,
    percentStarted: raw.percentStarted,
    weekProjection,
    games,
    seasonPoints: roundPoints(games.reduce((sum, g) => sum + g.points, 0)),
    ros,
    rosNote,
  };
}

function statusNote(status: InjuryStatus): string {
  const words: Partial<Record<InjuryStatus, string>> = {
    INJURY_RESERVE: " (he's on injured reserve)",
    OUT: " (he's out)",
    SUSPENSION: " (he's suspended)",
    DOUBTFUL: " (he's doubtful)",
  };
  return words[status] ?? "";
}

/** `custom` = a league's own rules; `format` stays the nearest preset for preset-only tools. */
export function scoreUniverse(
  raw: PlayerUniverse & { fetchedAt?: string },
  format: ScoringFormat,
  custom?: Readonly<ScoringRules> | null,
): Universe {
  return {
    season: raw.season,
    week: raw.week,
    throughWeek: Math.max(0, raw.week - 1),
    format,
    fetchedAt: raw.fetchedAt ?? null,
    players: raw.players.map((p) => scorePlayer(p, raw.week, format, custom)),
  };
}

/** Which fantasy week the analysis is for: the regular-season week, week 1 in the preseason. */
export function analysisWeek(seasonType: number, week: number): number {
  if (seasonType === 2) return Math.min(Math.max(week, 1), 18);
  if (seasonType === 3) return 18;
  return 1;
}
