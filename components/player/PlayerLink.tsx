"use client";

import { openPlayer } from "@/lib/nav/query";

/**
 * Every player name, photo or row in the app goes through this, so a tap ALWAYS opens the one
 * canonical player profile (components/player/PlayerProfile.tsx) over the current screen.
 * It's a real link to /players/<id>: a new tab, middle-click or no-JS gets the full page.
 */
export function PlayerLink({
  id,
  children,
  className = "",
  label,
  stopPropagation = false,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Accessible name when the children aren't text (a photo). */
  label?: string;
  /** Inside another clickable row: don't trigger it too. */
  stopPropagation?: boolean;
}) {
  return (
    <a
      href={`/players/${id}`}
      aria-label={label}
      className={className}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openPlayer(id);
      }}
    >
      {children}
    </a>
  );
}
