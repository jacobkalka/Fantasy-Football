import type { Game, GameSide, GameState, Scoreboard } from "@/lib/providers/types";
import { arr, bool, get, num, obj, str, type Json } from "./json";
import { parseTeam } from "./teams";

function parseState(value: Json): GameState {
  const s = str(value);
  return s === "in" || s === "post" ? s : "pre";
}

function parseSide(raw: Json): GameSide {
  const c = obj(raw);
  const records = arr(c.records ?? c.record).map(obj);
  const overall = records.find((r) => str(r.type) === "total") ?? records[0];
  return {
    team: parseTeam(c.team),
    score: num(c.score),
    record: overall ? str(overall.summary) || undefined : undefined,
    linescores: arr(c.linescores).map((l) => num(get(l, "value") ?? get(l, "displayValue"))),
  };
}

/** One event from the scoreboard (or a summary's header) as a Game. */
export function parseEvent(raw: Json): Game {
  const e = obj(raw);
  const comp = obj(get(e, "competitions", 0));
  const status = obj(e.status ?? comp.status);
  const type = obj(status.type);
  const competitors = arr(comp.competitors).map(obj);
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
  const situation = obj(comp.situation);
  const odds = obj(get(comp, "odds", 0));
  const weather = obj(e.weather ?? comp.weather);
  const venue = obj(comp.venue);
  const state = parseState(type.state);

  // Possession lives in `situation` on the scoreboard and on each competitor in a summary.
  const possessionTeamId =
    str(situation.possession) ||
    str(get(competitors.find((c) => c.possession === true), "team", "id")) ||
    undefined;

  return {
    id: str(e.id) || str(comp.id),
    season: num(get(e, "season", "year")),
    seasonType: num(get(e, "season", "type"), 2),
    week: num(get(e, "week", "number"), num(e.week)),
    kickoff: str(e.date) || str(comp.date),
    state,
    completed: bool(type.completed),
    statusText: str(type.shortDetail) || str(type.detail) || str(type.description),
    period: num(status.period),
    clock: str(status.displayClock),
    home: parseSide(home),
    away: parseSide(away),
    situation:
      state === "in"
        ? {
            possessionTeamId,
            downDistance: str(situation.downDistanceText) || undefined,
            isRedZone: bool(situation.isRedZone),
            lastPlayText: str(get(situation, "lastPlay", "text")) || undefined,
          }
        : undefined,
    odds: Object.keys(odds).length
      ? {
          details: str(odds.details) || undefined,
          spread: typeof odds.spread === "number" ? odds.spread : undefined,
          overUnder: typeof odds.overUnder === "number" ? odds.overUnder : undefined,
        }
      : undefined,
    weather: Object.keys(weather).length
      ? {
          text: str(weather.displayValue),
          temperature: typeof weather.temperature === "number" ? weather.temperature : undefined,
        }
      : undefined,
    venue: Object.keys(venue).length
      ? {
          name: str(venue.fullName),
          city: str(get(venue, "address", "city")) || undefined,
          indoor: bool(venue.indoor),
        }
      : undefined,
    broadcast:
      str(comp.broadcast) || str(get(comp, "broadcasts", 0, "names", 0)) || undefined,
  };
}

export function parseScoreboard(raw: Json): Scoreboard {
  const d = obj(raw);
  const games = arr(d.events)
    .map(parseEvent)
    .filter((g) => g.id)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
  return {
    season: num(get(d, "season", "year")),
    seasonType: num(get(d, "season", "type"), 2),
    week: num(get(d, "week", "number")),
    games,
  };
}
