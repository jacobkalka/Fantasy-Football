/**
 * The app's single doorway to sports data. Swap this one line to use a
 * different provider (e.g. a paid, official feed) without touching any screen.
 */
import { espnProvider } from "./espn";

export const sports = espnProvider;

export { ProviderError } from "./espn";
export type * from "./types";

/** Player photo URL for the active provider (ESPN's CDN today). */
export { headshotUrl } from "./espn/teams";
/** Timeouts, quarter breaks and the like: real entries in the play list, but not football plays. */
export { isAdministrativePlay } from "./espn/stats";
/** Team defense (D/ST) scoring helpers: a D/ST's stat line and its per-play changes for a game. */
export { defensePlayDeltas, defenseStatLine, dstPlayerId, dstTeamId } from "./espn/stats";
