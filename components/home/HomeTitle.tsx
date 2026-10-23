"use client";

import { useRoster } from "@/lib/roster/store";

/** The page title is your team's name once it's known ("Home" until then, and for an empty team). */
export function HomeTitle() {
  const { roster, ready } = useRoster();
  return <>{ready && roster.players.length > 0 ? roster.name.trim() || "My Team" : "Home"}</>;
}
