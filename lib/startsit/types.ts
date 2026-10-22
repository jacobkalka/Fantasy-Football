/**
 * Shapes shared by the Start/Sit model, the /api/startsit endpoint and the screen.
 * Every number here is in fantasy points for the chosen scoring format.
 */
import type { GameState, InjuryStatus, OffensePosition } from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";

/** How tough the opposing defense is against this player's position. */
export interface MatchupInput {
  opponentId: string;
  opponentAbbr: string;
  /** 1 = allows the fewest points to this position (toughest) … `teams` = the most (easiest). */
  rank: number;
  teams: number;
  /** Points per game this defense allows to the position. */
  allowedPerGame: number;
  /** The same number averaged over every defense. */
  leagueAverage: number;
  /** Games the defense has played; fewer games = less trust. */
  games: number;
}

/** What the betting market expects from the player's team. */
export interface VegasInput {
  teamAbbr: string;
  /**
   * Points the market expects this team to score:
   * implied = overUnder / 2 − spread / 2, with the spread from this team's side
   * (−3 means favored by 3). Example: total 50.5, favored by 3 → 26.75.
   */
  impliedTotal: number;
  /** Average implied total over this week's games. */
  leagueAverage: number;
  overUnder: number;
  /** From this team's side: negative = favored. */
  spread: number;
}

export interface WeatherInput {
  /** Dome or closed roof: weather can't matter. */
  indoor: boolean;
  /** ESPN's forecast words, e.g. "Mostly sunny" (ESPN gives no wind speed). */
  text?: string;
  temperature?: number;
}

export interface GameInput {
  id: string;
  kickoff: string;
  state: GameState;
  isHome: boolean;
  opponentAbbr: string;
}

/** Everything the model knows about one player this week. Missing pieces are null. */
export interface PlayerFactors {
  playerId: string;
  name: string;
  position: OffensePosition;
  teamId: string | null;
  teamAbbr: string | null;
  headshot: string | null;
  /** Why the player can't score this week, if that's the case. */
  unavailable: "bye" | "no-game" | "out" | null;
  /** Null when the injury report couldn't be loaded. */
  injuryStatus: InjuryStatus | null;
  /** ESPN's projection for this week, in this scoring format. */
  projection: number | null;
  /** Real points in each finished game this season, oldest first (bye weeks have no entry). */
  recent: { week: number; points: number }[];
  matchup: MatchupInput | null;
  vegas: VegasInput | null;
  weather: WeatherInput | null;
  game: GameInput | null;
}

export type FactorKey = "availability" | "projection" | "matchup" | "injury" | "form" | "vegas" | "weather";

/** One line of "how we got this number". */
export interface FactorResult {
  key: FactorKey;
  label: string;
  /** Points this factor added (+) or took away (−). For "projection" it's the starting number. */
  points: number;
  /** The adjustment as a share of the starting number (0.05 = +5%). */
  pct: number;
  /** Plain-English explanation with the numbers behind it. */
  detail: string;
  /** False when the data wasn't there, so the factor was left out. */
  available: boolean;
}

export interface PlayerVerdict extends PlayerFactors {
  playing: boolean;
  /** The starting number: ESPN's projection, or a stand-in when there isn't one. */
  base: number;
  /** The model's number after every adjustment. */
  score: number;
  /** A rough bad week and good week (about 1 week in 5 lands outside this range). */
  floor: number;
  ceiling: number;
  /** How much this player's points usually swing week to week (standard deviation). */
  spread: number;
  factors: FactorResult[];
  /** Share (0–1) of the model's inputs that had real data. */
  dataQuality: number;
}

export type Confidence = "Lean" | "Solid" | "Strong";

export interface Reason {
  key: FactorKey;
  text: string;
  /** Points of difference this reason makes between the two players. */
  impact: number;
  /** Player id this reason points toward, or null when it's neutral. */
  favors: string | null;
}

export interface Recommendation {
  startId: string;
  /** Compared against (the second-best player). */
  overId: string;
  confidence: Confidence;
  /** Rough chance the pick outscores the other player (0.5–0.99). */
  chance: number;
  /** Biggest reasons first, 3 to 5 of them. */
  reasons: Reason[];
  /** Things worth knowing that don't change the numbers (kickoff times, locked games…). */
  notes: string[];
}

export interface StartSitResult {
  season: number;
  week: number;
  format: ScoringFormat;
  /** Best first. */
  players: PlayerVerdict[];
  recommendation: Recommendation | null;
  /** Why there's no recommendation (e.g. everyone is on bye). */
  noRecommendation?: string;
  /** A friendly 2–3 sentence explanation written by Claude from the numbers above, when available. */
  aiSummary?: string | null;
  /** Whether asking for `aiSummary` can work on this server. */
  aiAvailable: boolean;
  generatedAt: string;
}
