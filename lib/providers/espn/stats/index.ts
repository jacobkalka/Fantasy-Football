/**
 * ESPN -> our stat vocabulary. Import from "@/lib/providers/espn/stats".
 *
 * - fantasyStatsToStatLine: ESPN fantasy feed stat ids -> StatLine
 * - parseBoxscore: official per-player totals from a game summary
 * - parseCorePlays / deltasForPlay: what every play changed for each player
 * - totalsFromPlays: add those changes up per player (to compare with the box score)
 */
export { ESPN_STAT_IDS, fantasyStatsToStatLine } from "./fantasy-ids";
export { parseBoxscore } from "./boxscore";
export {
  ADMINISTRATIVE_PLAY_TYPES,
  deltasForPlay,
  isAdministrativePlay,
  parseCorePlay,
  parseCorePlays,
  totalsFromPlays,
} from "./plays";
export { buildNameIndex, type NameIndex } from "./names";
export {
  defensePlayDeltas,
  defenseStatLine,
  dstPlayerId,
  dstTeamId,
  pointsAllowedTier,
  yardsAllowedTier,
  type DefenseGame,
  type DefensePlayDelta,
} from "./dst";
