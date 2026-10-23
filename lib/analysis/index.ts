/**
 * The analysis engine: "Is my team good? Where am I weak? Who should I trade or pick up?"
 * Pure functions over the player universe (/api/universe, scored for one format).
 * Everything is judged by how YOUR whole roster changes.
 */
export { DEFAULT_LEAGUE, LEAGUE_SIZES, leagueSettings, rosterSize, slotList, starterCount } from "./settings";
export type { LeagueSettings, LeagueSize, StartingSlot } from "./settings";

export { analysisWeek, isOut, scorePlayer, scoreUniverse } from "./universe";
export type { AnalysisGame, AnalysisPlayer, RestOfSeason, Universe } from "./universe";

export {
  availabilityShare,
  ceiling,
  expectedPerGame,
  MIN_GAMES,
  projectedRate,
  recentPerGame,
  seasonPerGame,
  usageTrend,
  volatility,
  xppg,
} from "./metrics";

export { isLikelyAvailable, leagueModel, marketValueOf, positionRank, VALUE_CURVE } from "./model";
export type { LeagueModel } from "./model";

export { lineupValue, optimalLineup, weekBlocker } from "./lineup";
export type { BenchSpot, Lineup, LineupMode, LineupSpot } from "./lineup";

export { GRADE_KEYS, RATING_METHOD, RATING_WEIGHTS, ratePlayers, rateTeam, ratingAnchors } from "./rating";
export type { Grade, GradeKey, TeamRating } from "./rating";

export { gradeLabel, tradeLetter } from "./scale";
export type { GradeLabel, LetterGrade } from "./scale";

export { findWeaknesses } from "./weaknesses";
export type { Priority, Weakness, WeaknessArea, WeaknessFix } from "./weaknesses";

export { evaluateTrade, NEUTRAL_BAND } from "./trade";
export type { PositionImpact, TradeEvaluation, Verdict } from "./trade";

export { suggestTrades, MIN_TRADE_GAIN } from "./suggest";
export type { TradeSuggestion, TradeSuggestions } from "./suggest";

export { suggestPickups } from "./pickups";
export type { Pickup, PickupSuggestions } from "./pickups";

export { playerImpact } from "./impact";
export type { PlayerImpact } from "./impact";

export type { PlayerBrief } from "./moves";
export type { MissingPlayer, RosterEntry, RosterInput } from "./roster";
