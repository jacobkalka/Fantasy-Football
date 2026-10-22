/** The app's name, in one place. "Snap Count" is a placeholder until the owner picks one. */
export const APP_NAME = "Snap Count";

export const APP_DESCRIPTION =
  "Live fantasy football: every play that moves your score, in plain English, as it happens.";

/** The bottom tab bar, in order. */
export const TABS = [
  { href: "/", label: "Team", icon: "team" },
  { href: "/feed", label: "Feed", icon: "feed" },
  { href: "/games", label: "Games", icon: "games" },
  { href: "/start-sit", label: "Start/Sit", icon: "startSit" },
  { href: "/chat", label: "Chat", icon: "chat" },
] as const;

export type TabIcon = (typeof TABS)[number]["icon"];
