/**
 * Game Center: everything the game page shows, worked out on the server from a
 * game's raw detail. Pure (no fetching), so it's tested against real games.
 */
import { headshotUrl, isAdministrativePlay } from "@/lib/providers";
import type { Drive, Game, GameDetail, Position, TeamStat } from "@/lib/providers/types";
import { roundPoints, rulesForFormat, scoreDelta, scoreStatLine, type ScoringFormat, type ScoringRules } from "@/lib/scoring";
import type { StatLine } from "@/lib/stats";
import { cleanPlayText } from "./play-text";
import { statLineSummary } from "./statline";

export interface PlayView {
  id: string;
  sequence: number;
  period: number;
  clock: string;
  text: string;
  type: string;
  teamId?: string;
  yards: number;
  scoring: boolean;
  isTouchdown: boolean;
  scoreValue: number;
  awayScore: number;
  homeScore: number;
  isTurnover: boolean;
  driveId?: string;
  wallclock?: string;
  /** Home team's chance of winning right after this play (0–1), when ESPN has it. */
  homeWinPct?: number;
  /** Fantasy points this play gave each player involved, in the chosen format. */
  fantasy: { playerId: string; points: number }[];
}

export interface GamePlayer {
  name: string;
  teamId: string;
  headshot: string;
}

export interface LeaderView {
  playerId: string;
  points: number;
  summary: string;
}

export interface FieldPosition {
  /** 0 = the away team's goal line ... 100 = the home team's goal line. */
  ballOn: number;
  possessionTeamId?: string;
}

export interface GameView {
  game: Game;
  format: ScoringFormat;
  fetchedAt: string;
  /** Oldest first. */
  plays: PlayView[];
  drives: Drive[];
  teamStats: TeamStat[];
  homeWinPct: number | null;
  players: Record<string, GamePlayer>;
  /** Top fantasy performers in this game. */
  leaders: LeaderView[];
  field: FieldPosition | null;
}

function isTouchdown(text: string, scoreValue: number) {
  return scoreValue >= 6 || /\bTOUCHDOWN\b/.test(text);
}

/** A box-score line's likely position, just for choosing how to summarize it. */
function guessPosition(stats: StatLine): Position {
  if ((stats.passAtt ?? 0) >= 5) return "QB";
  if ((stats.rushAtt ?? 0) > (stats.targets ?? 0)) return "RB";
  return "WR";
}

/** Older team codes that still show up in ESPN's play-by-play text. */
const CODE_ALIASES: Record<string, string> = { HST: "HOU", ARZ: "ARI", CLV: "CLE", BLT: "BAL", JAC: "JAX", WAS: "WSH" };

/**
 * "1st & 10 at HOU 38" → where the ball is on a 0–100 line from the away goal to the home goal.
 * Each team's own half is named after it ("HOU 38" = 38 yards from Houston's goal line).
 */
export function fieldPositionFrom(game: Game): FieldPosition | null {
  if (game.state !== "in" || !game.situation?.downDistance) return null;
  const spot = game.situation.downDistance.match(/at\s+([A-Z]{2,3})\s+(\d{1,2})\b/);
  const midfield = /at\s+50\b/.test(game.situation.downDistance);
  if (!spot && !midfield) return null;
  let ballOn = 50;
  if (spot) {
    const side = CODE_ALIASES[spot[1]] ?? spot[1];
    const yards = Number(spot[2]);
    if (side === game.home.team.abbr) ballOn = 100 - yards;
    else if (side === game.away.team.abbr) ballOn = yards;
    else return null;
  }
  return { ballOn, possessionTeamId: game.situation.possessionTeamId };
}

export function buildGameView(
  detail: GameDetail & { fetchedAt?: string },
  format: ScoringFormat,
  /** A league's own rules (lib/scoring/spec.ts); the format's preset otherwise. */
  custom?: Readonly<ScoringRules> | null,
): GameView {
  const rules = custom ?? rulesForFormat(format);
  const driveOf = new Map<string, string>();
  for (const drive of detail.drives) for (const id of drive.playIds) driveOf.set(id, drive.id);
  const winPct = new Map(detail.winProbability.map((w) => [w.playId, w.homeWinPct]));

  const plays: PlayView[] = detail.plays
    .filter((play) => !isAdministrativePlay(play))
    .map((play) => ({
      id: play.id,
      sequence: play.sequence,
      period: play.period,
      clock: play.clock,
      text: cleanPlayText(play.text),
      type: play.type,
      teamId: play.teamId,
      yards: play.yards,
      scoring: play.scoring,
      isTouchdown: play.scoring && isTouchdown(play.text, play.scoreValue),
      scoreValue: play.scoreValue,
      awayScore: play.awayScore,
      homeScore: play.homeScore,
      isTurnover: play.isTurnover,
      driveId: driveOf.get(play.id),
      wallclock: play.wallclock,
      homeWinPct: winPct.get(play.id),
      fantasy: play.deltas
        .map((d) => ({ playerId: d.playerId, points: scoreDelta(d.stats, rules).points }))
        .filter((f) => f.points !== 0)
        .sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    }));

  // Two-point conversions aren't in the box score; add them from the plays.
  const twoPoint: Record<string, StatLine> = {};
  for (const play of detail.plays) {
    for (const d of play.deltas) {
      for (const key of ["pass2pt", "rush2pt", "rec2pt"] as const) {
        if (d.stats[key]) {
          twoPoint[d.playerId] = { ...twoPoint[d.playerId], [key]: (twoPoint[d.playerId]?.[key] ?? 0) + d.stats[key]! };
        }
      }
    }
  }

  const players: Record<string, GamePlayer> = {};
  const leaders: LeaderView[] = [];
  for (const line of Object.values(detail.boxscore)) {
    players[line.playerId] = { name: line.name, teamId: line.teamId, headshot: headshotUrl(line.playerId) };
    const stats = { ...line.stats, ...twoPoint[line.playerId] };
    const points = scoreStatLine(stats, rules).total;
    if (points !== 0) {
      leaders.push({ playerId: line.playerId, points, summary: statLineSummary(stats, guessPosition(stats)) });
    }
  }
  leaders.sort((a, b) => b.points - a.points);

  const lastWin = [...plays].reverse().find((p) => p.homeWinPct !== undefined)?.homeWinPct;
  const homeWinPct =
    detail.game.state === "post"
      ? detail.game.home.score > detail.game.away.score
        ? 1
        : detail.game.home.score < detail.game.away.score
          ? 0
          : 0.5
      : (lastWin ?? null);

  return {
    game: detail.game,
    format,
    fetchedAt: detail.fetchedAt ?? new Date().toISOString(),
    plays,
    drives: detail.drives,
    teamStats: detail.teamStats,
    homeWinPct: homeWinPct === null ? null : roundPoints(homeWinPct, 3),
    players,
    leaders: leaders.slice(0, 10),
    field: fieldPositionFrom(detail.game),
  };
}
