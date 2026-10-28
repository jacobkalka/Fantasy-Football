/** The app's name, in one place. */
export const APP_NAME = "Xpert";

export const APP_DESCRIPTION =
  "Your fantasy football lab: team rating, start/sit, trades, pickups and live scoring, built on real NFL data.";

export type NavIcon = "home" | "team" | "live" | "news" | "chat";

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
 * The app's map (DECISIONS.md, "Navigation", 2026-10-26). Five destinations, each answering
 * "what does this mean for my team?": Home (command center), Team (roster, matchup and every
 * roster decision), Live (points as they happen), News, and Chat (the community). The phone's
 * bottom bar shows all five; the desktop sidebar shows them with their sub-pages.
 */
export const NAV: NavSection[] = [
  { href: "/", label: "Home", icon: "home", match: ["/"] },
  {
    href: "/team",
    label: "Team",
    icon: "team",
    match: ["/team", "/start-sit", "/players", "/trades"],
    children: [
      { href: "/team", label: "My team" },
      { href: "/team/matchup", label: "Matchup" },
      { href: "/start-sit", label: "Start/Sit" },
      { href: "/team/trades", label: "Trades" },
      { href: "/team/pickups", label: "Pickups" },
      { href: "/players", label: "Rankings" },
    ],
  },
  {
    href: "/feed",
    label: "Live",
    icon: "live",
    match: ["/feed", "/games"],
    children: [
      { href: "/feed", label: "Plays" },
      { href: "/games", label: "Games" },
    ],
  },
  { href: "/news", label: "News", icon: "news", match: ["/news"] },
  { href: "/chat", label: "Chat", icon: "chat", match: ["/chat", "/u"] },
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
