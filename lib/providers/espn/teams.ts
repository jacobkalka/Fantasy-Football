import type { Team } from "@/lib/providers/types";
import { ESPN } from "./http";
import { arr, get, hexColor, obj, str, type Json } from "./json";

export function teamLogo(abbr: string) {
  return `${ESPN.cdn}/i/teamlogos/nfl/500-dark/${abbr.toLowerCase()}.png`;
}

export function headshotUrl(playerId: string) {
  return `${ESPN.cdn}/i/headshots/nfl/players/full/${playerId}.png`;
}

/** ESPN describes a team slightly differently on each endpoint; this reads any of them. */
export function parseTeam(raw: Json): Team {
  const t = obj(raw);
  const abbr = str(t.abbreviation, "?");
  const darkLogo = arr(t.logos)
    .map(obj)
    .find((logo) => arr(logo.rel).includes("dark") && !arr(logo.rel).includes("scoreboard"));
  return {
    id: str(t.id),
    abbr,
    name: str(t.name) || str(t.shortDisplayName) || abbr,
    displayName: str(t.displayName) || abbr,
    color: hexColor(t.color),
    altColor: hexColor(t.alternateColor, "#ffffff"),
    logo: str(get(darkLogo, "href")) || (abbr !== "?" ? teamLogo(abbr) : ""),
  };
}

/** All 32 teams from the /teams endpoint. */
export function parseTeams(raw: Json): Team[] {
  return arr(get(raw, "sports", 0, "leagues", 0, "teams")).map((entry) => parseTeam(get(entry, "team")));
}
