/**
 * Player research shapes: the assembled profile (facts from the data provider)
 * and the analysis derived from it (lib/players/analysis.ts). Safe to import in
 * client components: types only.
 */
import type {
  CareerSeason,
  DepthChartSpot,
  NewsItem,
  PlayerAdvancedStats,
  PlayerBio,
  PlayerFantasyInfo,
  PlayerGame,
  PlayerSplits,
  Position,
} from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";

/** Everything known about one player, from real data only. */
export interface PlayerProfile {
  id: string;
  /** "dst" = a team defense/special teams unit (no player page, bio or career table). */
  kind: "player" | "dst";
  name: string;
  /** Fantasy position (from the player list, else the bio). */
  position: Position | null;
  team: { id: string; abbr: string; name: string } | null;
  headshot: string | null;
  /** null for a D/ST, or when the player page couldn't be loaded. */
  bio: PlayerBio | null;
  /** Oldest first. Empty for a D/ST (see `fantasy.seasonTotals` for its fantasy totals). */
  career: CareerSeason[];
  season: number;
  /** The NFL week in progress (or next up). */
  week: number;
  /** Finished regular-season games this season, oldest first, including ones he missed. */
  games: PlayerGame[];
  byeWeek: number | null;
  nextGame: { week: number; date: string; opponentAbbr: string; home: boolean } | null;
  splits: PlayerSplits;
  advanced: PlayerAdvancedStats;
  fantasy: PlayerFantasyInfo;
  /** His spots on ESPN's depth chart (several when he also returns kicks). Empty = not listed or unavailable. */
  depth: DepthChartSpot[];
  depthFormation: string | null;
  news: NewsItem[];
  /** When the season data was fetched (ISO). */
  fetchedAt: string;
}

/** A number with a ready-to-show version. `value` null = can't be computed (shown as "—"). */
export interface Metric {
  id: string;
  label: string;
  value: number | null;
  /** "64%", "8.1", "—" */
  display: string;
  /** What it's computed from, e.g. "38 targets in 5 games". */
  basis?: string;
}

export interface GamePoints {
  gameId: string;
  week: number;
  opponentAbbr: string | null;
  home: boolean | null;
  result: string | null;
  played: boolean;
  /** Points in the requested format; null when he didn't play. */
  points: number | null;
  /** All three formats, null when he didn't play. */
  allFormats: Record<ScoringFormat, number> | null;
  /** ESPN's pregame projection in the requested format, when there was one. */
  projected: number | null;
}

/** "Useful", "boom" and "bust" week lines for a position and format (see lib/players/rules.ts). */
export interface WeekThresholds {
  bust: number;
  useful: number;
  boom: number;
}

export interface Consistency {
  thresholds: WeekThresholds;
  /** Spread of weekly points (standard deviation). */
  stdDev: number;
  /** stdDev ÷ average: under 0.35 is steady, 0.65+ is volatile. null when the average is 0. */
  variation: number | null;
  floor: number;
  ceiling: number;
  median: number;
  usefulGames: number;
  usefulShare: number;
  boomGames: number;
  bustGames: number;
  /** Games he beat ESPN's pregame projection, out of games that had one. */
  beatProjection: { beat: number; games: number } | null;
}

export type TrendDirection = "up" | "down" | "steady";

export interface Trend {
  id: string;
  label: string;
  last3: number;
  season: number;
  direction: TrendDirection;
  /** "Last 3 games: 9.3 targets a game vs 7.6 for the season." */
  text: string;
  /** Sample-size warning to show with it. */
  caveat: string;
}

export type SignalTone = "positive" | "caution" | "neutral";

/** A sustainability observation, always tied to numbers. */
export interface Signal {
  id: string;
  tone: SignalTone;
  text: string;
}

export interface RoleLabel {
  id: string;
  label: string;
  /** The numbers that earned it, e.g. "9.2 targets a game (rule: 8+)". */
  reason: string;
}

export interface CareerRow {
  season: number;
  teams: string[];
  games: number;
  points: number;
  pointsPerGame: number | null;
  /** "fantasy" = ESPN's official fantasy stats; "season-table" = scored from the season's box-score totals. */
  source: "fantasy" | "season-table";
  /** Why a season-table number might differ slightly from ESPN's official total. */
  note: string | null;
}

export interface PlayerAnalysis {
  format: ScoringFormat;
  position: Position | null;
  sample: {
    gamesPlayed: number;
    gamesMissed: number;
    /** "none" 0 games, "tiny" 1-2, "small" 3-4, "ok" 5+. */
    level: "none" | "tiny" | "small" | "ok";
    note: string | null;
  };
  games: GamePoints[];
  totals: {
    points: number;
    average: number | null;
    last3Average: number | null;
    best: { week: number; points: number } | null;
    worst: { week: number; points: number } | null;
  };
  consistency: Consistency | null;
  /** Position-specific usage and efficiency, in display order. */
  usage: Metric[];
  /** ESPN tracking numbers (season averages), when published for him. */
  advanced: Metric[];
  /** Red-zone numbers from ESPN's split (opponent's 19-yard line to the goal). */
  redZone: Metric[];
  trends: Trend[];
  signals: Signal[];
  labels: RoleLabel[];
  /** 2-4 plain-language sentences; every number in them is computed above. */
  summary: string;
  career: CareerRow[];
  /** What the data source doesn't publish, so the UI can say so instead of guessing. */
  unavailable: string[];
}
