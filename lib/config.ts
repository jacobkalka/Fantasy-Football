/** The app's name, in one place. */
export const APP_NAME = "FantasyLab";

export const APP_DESCRIPTION =
  "Your fantasy football lab: team rating, start/sit, trades, pickups and live scoring, built on real NFL data.";

export type NavIcon = "home" | "team" | "players" | "trades" | "live";

export interface NavSection {
  href: string;
  label: string;
  icon: NavIcon;
  /** Paths that belong to this section (for the active state). */
  match: string[];
  /** Sub-pages, shown as tabs on the section's screens and under it in the desktop sidebar. */
  children?: { href: string; label: string }[];
}

/**
 * The app's map (DECISIONS.md, "Navigation"). Five sections: the phone's bottom bar
 * shows all five; the desktop sidebar shows them with their sub-pages.
 */
export const NAV: NavSection[] = [
  { href: "/", label: "Home", icon: "home", match: ["/"] },
  {
    href: "/team",
    label: "Team",
    icon: "team",
    match: ["/team", "/start-sit"],
    children: [
      { href: "/team", label: "Lineup" },
      { href: "/team/rating", label: "Rating" },
      { href: "/start-sit", label: "Start/Sit" },
      { href: "/team/edit", label: "Roster" },
    ],
  },
  {
    href: "/players",
    label: "Players",
    icon: "players",
    match: ["/players"],
    children: [
      { href: "/players", label: "Search" },
      { href: "/players/pickups", label: "Pickups" },
      { href: "/players/watchlist", label: "Watchlist" },
    ],
  },
  {
    href: "/trades",
    label: "Trades",
    icon: "trades",
    match: ["/trades"],
    children: [
      { href: "/trades", label: "Ideas" },
      { href: "/trades/calculator", label: "Calculator" },
    ],
  },
  {
    href: "/feed",
    label: "Live",
    icon: "live",
    match: ["/feed", "/games", "/chat"],
    children: [
      { href: "/feed", label: "Plays" },
      { href: "/games", label: "Games" },
      { href: "/chat", label: "Chat" },
    ],
  },
];

/** Which section a path belongs to (longest match wins; "/" only matches itself). */
export function sectionFor(pathname: string | null): NavSection | null {
  if (!pathname) return null;
  let best: NavSection | null = null;
  let bestLength = -1;
  for (const section of NAV) {
    for (const m of section.match) {
      const hit = m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`);
      if (hit && m.length > bestLength) {
        best = section;
        bestLength = m.length;
      }
    }
  }
  return best;
}

/** The active sub-page of a section (exact match first, then the longest prefix). */
export function activeChild(section: NavSection | null, pathname: string | null) {
  if (!section?.children || !pathname) return null;
  const exact = section.children.find((c) => c.href === pathname);
  if (exact) return exact;
  // Deeper pages belong to the tab they live under (/games/123 → Games, /players/123 → Search).
  return (
    [...section.children]
      .filter((c) => pathname.startsWith(`${c.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
