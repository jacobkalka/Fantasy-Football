import type { Drive, Game, TeamStat, WinProbabilityPoint } from "@/lib/providers/types";
import { arr, bool, get, num, obj, str, type Json } from "./json";
import { parseEvent } from "./scoreboard";

/**
 * The game itself from a /summary response. The summary's header is shaped like a
 * scoreboard event; venue, weather and odds live in other sections, and during
 * live games the down-and-distance lives in `situation` or the current drive.
 */
export function parseSummaryGame(raw: Json): Game {
  const d = obj(raw);
  const game = parseEvent(d.header);
  const venue = obj(get(d, "gameInfo", "venue"));
  const weather = obj(get(d, "gameInfo", "weather"));
  const pick = obj(get(d, "pickcenter", 0));

  if (!game.venue && Object.keys(venue).length) {
    game.venue = {
      name: str(venue.fullName),
      city: str(get(venue, "address", "city")) || undefined,
      indoor: bool(venue.indoor),
    };
  }
  if (!game.weather && Object.keys(weather).length) {
    game.weather = {
      text: str(weather.displayValue) || str(weather.conditionId),
      temperature: typeof weather.temperature === "number" ? weather.temperature : undefined,
    };
  }
  if (!game.odds && Object.keys(pick).length) {
    game.odds = {
      details: str(pick.details) || undefined,
      spread: typeof pick.spread === "number" ? pick.spread : undefined,
      overUnder: typeof pick.overUnder === "number" ? pick.overUnder : undefined,
    };
  }

  if (game.state === "in") {
    const situation = obj(d.situation);
    const currentPlays = arr(get(d, "drives", "current", "plays"));
    const lastPlay = obj(currentPlays[currentPlays.length - 1]);
    const end = obj(lastPlay.end);
    const yardsToEndzone = num(end.yardsToEndzone, num(situation.yardsToEndzone, 100));
    game.situation = {
      possessionTeamId:
        game.situation?.possessionTeamId ||
        str(situation.possession) ||
        str(get(d, "drives", "current", "team", "id")) ||
        undefined,
      downDistance:
        str(situation.downDistanceText) || str(end.downDistanceText) || game.situation?.downDistance,
      isRedZone: bool(situation.isRedZone) || (yardsToEndzone > 0 && yardsToEndzone <= 20),
      lastPlayText: str(get(situation, "lastPlay", "text")) || str(lastPlay.text) || undefined,
    };
  }
  return game;
}

function parseDrive(raw: Json): Drive {
  const d = obj(raw);
  return {
    id: str(d.id),
    teamId: str(get(d, "team", "id")),
    description: str(d.description),
    result: str(d.displayResult) || str(d.result) || "In progress",
    isScore: bool(d.isScore),
    yards: num(d.yards),
    playIds: arr(d.plays).map((p) => str(get(p, "id"))).filter(Boolean),
    startPeriod: num(get(d, "start", "period", "number")),
    startClock: str(get(d, "start", "clock", "displayValue")),
  };
}

/** Finished drives plus the one in progress, oldest first. */
export function parseDrives(raw: Json): Drive[] {
  const drives = obj(get(raw, "drives"));
  const all = arr(drives.previous).map(parseDrive);
  const current = obj(drives.current);
  if (current.id && !all.some((d) => d.id === str(current.id))) {
    all.push({ ...parseDrive(current), result: "In progress" });
  }
  return all;
}

/** Side-by-side team stats (total yards, turnovers, time of possession...). */
export function parseTeamStats(raw: Json): TeamStat[] {
  const teams = arr(get(raw, "boxscore", "teams")).map(obj);
  const home = teams.find((t) => t.homeAway === "home") ?? teams[1];
  const away = teams.find((t) => t.homeAway === "away") ?? teams[0];
  const awayStats = new Map(
    arr(get(away, "statistics")).map((s) => [str(get(s, "name")) + str(get(s, "label")), obj(s)]),
  );
  const seen = new Set<string>();
  const result: TeamStat[] = [];
  for (const s of arr(get(home, "statistics")).map(obj)) {
    const key = str(s.name) + str(s.label);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      name: str(s.name),
      label: str(s.label) || str(s.name),
      home: str(s.displayValue),
      away: str(awayStats.get(key)?.displayValue),
    });
  }
  return result;
}

export function parseWinProbability(raw: Json): WinProbabilityPoint[] {
  return arr(get(raw, "winprobability"))
    .map(obj)
    .map((p) => ({ playId: str(p.playId), homeWinPct: num(p.homeWinPercentage, 0.5) }))
    .filter((p) => p.playId);
}
