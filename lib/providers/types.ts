/**
 * The app's own shapes for football data. Every data provider (ESPN today)
 * translates its responses into these, and the rest of the app only uses these.
 */
import type { StatLine } from "@/lib/stats";

export type GameState = "pre" | "in" | "post";

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export interface Team {
  /** ESPN team id, e.g. "12" for Kansas City. */
  id: string;
  abbr: string;
  /** "Chiefs" */
  name: string;
  /** "Kansas City Chiefs" */
  displayName: string;
  /** "#e31837" */
  color: string;
  altColor: string;
  /** Logo drawn for dark backgrounds. */
  logo: string;
}

export interface GameSide {
  team: Team;
  score: number;
  /** "4-2" */
  record?: string;
  /** Points per quarter (overtime is a fifth entry). */
  linescores: number[];
}

export interface GameSituation {
  possessionTeamId?: string;
  /** "3rd & 7 at KC 35" */
  downDistance?: string;
  isRedZone: boolean;
  lastPlayText?: string;
}

export interface Game {
  /** ESPN event id. */
  id: string;
  season: number;
  /** 1 preseason, 2 regular season, 3 postseason. */
  seasonType: number;
  week: number;
  /** ISO time. */
  kickoff: string;
  state: GameState;
  completed: boolean;
  /** "Final/OT", "Q3 4:12", "Thu 8:15 PM": ready to display. */
  statusText: string;
  period: number;
  clock: string;
  home: GameSide;
  away: GameSide;
  situation?: GameSituation;
  odds?: { details?: string; spread?: number; overUnder?: number };
  weather?: { text: string; temperature?: number };
  venue?: { name: string; city?: string; indoor: boolean };
  broadcast?: string;
}

/** Someone involved in a play, and how ("passer", "receiver", "rusher", "scorer", "fumbler"...). */
export interface PlayParticipant {
  playerId: string;
  role: string;
}

export interface Play {
  /** ESPN play id; stable across corrections, so it's the de-duplication key. */
  id: string;
  gameId: string;
  /** Order within the game. */
  sequence: number;
  period: number;
  clock: string;
  /** "Pass Reception", "Rush", "Passing Touchdown"... */
  type: string;
  text: string;
  /** Team with the ball. */
  teamId?: string;
  yards: number;
  scoring: boolean;
  scoreValue: number;
  awayScore: number;
  homeScore: number;
  isPenalty: boolean;
  isTurnover: boolean;
  participants: PlayParticipant[];
  /** Real-world time the play happened (ISO), when known. */
  wallclock?: string;
  /** Last time ESPN changed this play (ISO). */
  modified?: string;
}

/** What one play changed for one player. */
export interface PlayerStatDelta {
  playerId: string;
  stats: StatLine;
}

export interface AttributedPlay extends Play {
  deltas: PlayerStatDelta[];
}

export interface Drive {
  id: string;
  teamId: string;
  /** "8 plays, 75 yards, 4:12" */
  description: string;
  /** "Touchdown", "Punt", "Field Goal"... */
  result: string;
  isScore: boolean;
  yards: number;
  playIds: string[];
  startPeriod: number;
  startClock: string;
}

/** One player's official box-score line for a game. */
export interface PlayerGameLine {
  playerId: string;
  name: string;
  teamId: string;
  stats: StatLine;
}

export interface TeamStat {
  name: string;
  label: string;
  away: string;
  home: string;
}

export interface WinProbabilityPoint {
  playId: string;
  homeWinPct: number;
}

export interface GameDetail {
  game: Game;
  drives: Drive[];
  /** Oldest first. */
  plays: AttributedPlay[];
  /** Official totals, keyed by player id. */
  boxscore: Record<string, PlayerGameLine>;
  teamStats: TeamStat[];
  winProbability: WinProbabilityPoint[];
}

export type InjuryStatus =
  | "ACTIVE"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "INJURY_RESERVE"
  | "SUSPENSION"
  | "DAY_TO_DAY"
  | "UNKNOWN";

export interface Player {
  /** ESPN athlete id (D/ST units use ESPN fantasy's negative ids, e.g. "-16012"). */
  id: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  injuryStatus?: InjuryStatus;
  percentOwned?: number;
}

export interface PlayerWeek {
  week: number;
  gameId?: string;
  stats: StatLine;
}

/** Projections and recent results from the fantasy feed. */
export interface PlayerOutlook {
  playerId: string;
  injuryStatus: InjuryStatus;
  /** Projected stat line for the requested week, if ESPN has one. */
  projection: StatLine | null;
  /** Actual stat lines for completed weeks this season, oldest first. */
  weeks: PlayerWeek[];
  seasonProjection: StatLine | null;
  outlook?: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  description: string;
  published: string;
  link?: string;
  playerIds: string[];
}

export interface Injury {
  playerId: string;
  teamId: string;
  status: string;
  /** One-line update. */
  shortComment: string;
  longComment?: string;
  date: string;
}

export interface Scoreboard {
  season: number;
  seasonType: number;
  week: number;
  games: Game[];
}

/** Everything the app needs from a sports data source. */
export interface DataProvider {
  /** This week's games (the source decides which week is current), or a specific week. */
  getScoreboard(opts?: { season?: number; week?: number }): Promise<Scoreboard>;
  getGameDetail(gameId: string): Promise<GameDetail>;
  getTeams(): Promise<Team[]>;
  /** Every fantasy-relevant player (for search). */
  getPlayers(season: number): Promise<Player[]>;
  getPlayerOutlooks(playerIds: string[], season: number, week: number): Promise<PlayerOutlook[]>;
  /** Team id → bye week. */
  getByeWeeks(season: number): Promise<Record<string, number>>;
  getPlayerNews(playerId: string): Promise<NewsItem[]>;
  getLeagueNews(): Promise<NewsItem[]>;
  getInjuries(): Promise<Injury[]>;
}
