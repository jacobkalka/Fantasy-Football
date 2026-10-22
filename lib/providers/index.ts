/**
 * The app's single doorway to sports data. Swap this one line to use a
 * different provider (e.g. a paid, official feed) without touching any screen.
 */
import { espnProvider } from "./espn";

export const sports = espnProvider;

export { ProviderError } from "./espn";
export type * from "./types";
