/**
 * Entitlements: the one place that decides what someone can use (DECISIONS.md, "Admin Mode").
 *
 * Today every feature is free for everyone: there are no paid plans. When a feature is ever
 * gated, it gets a name here and screens ask `can(entitlements, "that.feature")`, never an
 * "is admin?" check of their own. Admin Mode passes every gate. The server decides `admin`
 * (lib/entitlements/server.ts); what the browser holds is only for showing the indicator.
 */

/** Features that could one day be limited. None are, yet. */
export type Feature = "analysis.trades" | "analysis.pickups" | "live.tracker" | "leagues.multiple";

/** Gated features and who has them besides admins. Empty: nothing is gated. */
const GATED: Partial<Record<Feature, true>> = {};

export interface Entitlements {
  admin: boolean;
  /** When Admin Mode turns itself off (ISO), if it's on. */
  adminExpiresAt: string | null;
  /** Gated features this person has (besides being an admin). */
  granted: Feature[];
}

export const NO_ENTITLEMENTS: Entitlements = { admin: false, adminExpiresAt: null, granted: [] };

export function can(entitlements: Entitlements, feature: Feature): boolean {
  if (entitlements.admin) return true;
  if (!GATED[feature]) return true;
  return entitlements.granted.includes(feature);
}
