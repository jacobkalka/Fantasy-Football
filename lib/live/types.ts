/** Shapes the live endpoints send to the Team and Feed screens. */
import type { GameState, InjuryStatus, Position, Team } from "@/lib/providers/types";
import type { ScoringFormat, ScoringPart } from "@/lib/scoring";
import type { StatLine } from "@/lib/stats";

export interface TeamLite {
  id: string;
  abbr: string;
  name: string;
  color: string;
  altColor: string;
  logo: string;
}

/** A player's game this week, from their team's point of view. */
export interface PlayerGame {
  id: string;
  state: GameState;
  statusText: string;
  period: number;
  clock: string;
  kickoff: string;
  isHome: boolean;
  teamId: string;
  opponentId: string;
  teamScore: number;
  opponentScore: number;
  hasBall: boolean;
  isRedZone: boolean;
}

export interface FeedItem {
  id: string;
  kind: "points" | "injury";
  playId: string;
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string | null;
  period: number;
  clock: string;
  sequence: number;
  wallclock?: string;
  text: string;
  playType: string;
  isTouchdown: boolean;
  /** Fantasy points this play was worth to this player in the chosen format. */
  points: number;
  parts: ScoringPart[];
}

export interface PlayerLive {
  playerId: string;
  name: string;
  position: Position;
  teamId: string | null;
  game: PlayerGame | null;
  onBye: boolean;
  injuryStatus?: InjuryStatus;
  /** Official stat line (box score, plus 2-point conversions from the plays). */
  stats: StatLine;
  /** The headline number: official points. */
  points: number;
  /** Sum of the per-play points; usually equal to `points`. */
  playPoints: number;
  /** points − playPoints, when the play-by-play disagrees with the box score. */
  correction: number;
  /** Pregame projection in this format, if ESPN published one. */
  projection: number | null;
  /** Points so far + the share of the projection still to play. An estimate. */
  liveProjection: number | null;
  /** Kickers and defenses are tracked, but their scoring arrives in a later phase. */
  scoringSupported: boolean;
}

export interface TeamLive {
  season: number;
  week: number;
  format: ScoringFormat;
  fetchedAt: string;
  players: PlayerLive[];
  /** Newest first, across every game. */
  feed: FeedItem[];
  teams: Record<string, TeamLite>;
  anyLive: boolean;
}

export function teamLite(team: Team): TeamLite {
  return {
    id: team.id,
    abbr: team.abbr,
    name: team.name,
    color: team.color,
    altColor: team.altColor,
    logo: team.logo,
  };
}
