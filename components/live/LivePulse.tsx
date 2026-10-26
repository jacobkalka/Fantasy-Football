"use client";

import { useScoreboard } from "@/lib/fantasy/context";

/**
 * Invisible, mounted once: keeps the shared scoreboard fresh so every live poll in the app
 * knows whether games are on (fast) or not (slow). See lib/fantasy/context.ts `pace`.
 */
export function LivePulse() {
  useScoreboard();
  return null;
}
