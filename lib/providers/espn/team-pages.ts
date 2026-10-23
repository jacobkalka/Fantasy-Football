/**
 * Per-team ESPN pages used by player research: the season schedule
 * (site .../teams/{id}/schedule?season=YYYY) and the depth chart
 * (core .../seasons/{y}/teams/{id}/depthcharts). Verified against
 * samples/team-schedule-trimmed.json and samples/depthchart-trimmed.json.
 */
import type { DepthChart, DepthChartSpot, GameState, TeamSchedule, TeamScheduleGame } from "@/lib/providers/types";
import { arr, get, idFromRef, num, obj, str, type Json } from "./json";

export function parseTeamSchedule(raw: Json, teamId: string, season: number): TeamSchedule {
  const games: TeamScheduleGame[] = [];
  for (const event of arr(get(raw, "events")).map(obj)) {
    if (num(get(event, "seasonType", "type")) !== 2) continue; // regular season only
    const competition = obj(arr(event.competitions)[0]);
    const sides = arr(competition.competitors).map(obj);
    const us = sides.find((s) => str(get(s, "team", "id")) === teamId);
    const them = sides.find((s) => s !== us);
    if (!us || !them) continue;
    const stateRaw = str(get(competition, "status", "type", "state"));
    const state: GameState = stateRaw === "in" || stateRaw === "post" ? stateRaw : "pre";
    const done = state === "post";
    const score = (side: Record<string, Json>) => {
      const value = get(side, "score", "value");
      return done && typeof value === "number" ? value : null;
    };
    const teamScore = score(us);
    const opponentScore = score(them);
    games.push({
      gameId: str(event.id),
      week: num(get(event, "week", "number")),
      date: str(event.date),
      home: str(us.homeAway) === "home",
      opponentId: str(get(them, "team", "id")),
      opponentAbbr: str(get(them, "team", "abbreviation")),
      state,
      teamScore,
      opponentScore,
      result:
        teamScore === null || opponentScore === null
          ? null
          : us.winner === true
            ? "W"
            : them.winner === true
              ? "L"
              : teamScore === opponentScore
                ? "T"
                : teamScore > opponentScore
                  ? "W"
                  : "L",
    });
  }
  const bye = num(get(raw, "byeWeek"));
  return { teamId, season, byeWeek: bye > 0 ? bye : null, games: games.sort((a, b) => a.week - b.week) };
}

/** Depth-chart keys kept: skill positions and kickers (linemen and defense don't matter for fantasy). */
const KEPT_POSITIONS: Record<string, string> = {
  qb: "QB",
  rb: "RB",
  fb: "FB",
  wr: "WR",
  te: "TE",
  pk: "PK",
  kr: "KR",
  pr: "PR",
};

/**
 * ESPN lists each position's players with a `slot` (which starting spot: the three
 * WR spots are slots 1, 2 and 8 for Kansas City) and a `rank` (order across the
 * position). Checked against ESPN's web depth chart: slot order = WR1, WR2, WR3,
 * and rank order within a slot = starter, backup, third string.
 */
export function parseDepthChart(raw: Json, teamId: string): DepthChart {
  const items = arr(get(raw, "items")).map(obj);
  const offense = items.find((i) => "qb" in obj(i.positions));
  const special = items.find((i) => "pk" in obj(i.positions));
  const spots: DepthChartSpot[] = [];
  for (const item of [offense, special]) {
    for (const [key, entry] of Object.entries(obj(item?.positions))) {
      const position = KEPT_POSITIONS[key];
      if (!position) continue;
      const athletes = arr(get(entry, "athletes"))
        .map(obj)
        .map((a) => ({
          playerId: idFromRef(get(a, "athlete", "$ref"), "athletes"),
          slot: num(a.slot),
          rank: num(a.rank),
        }))
        .filter((a): a is { playerId: string; slot: number; rank: number } => Boolean(a.playerId));
      const slots = [...new Set(athletes.map((a) => a.slot))].sort((x, y) => x - y);
      for (const [slotIndex, slot] of slots.entries()) {
        const inSlot = athletes.filter((a) => a.slot === slot).sort((x, y) => x.rank - y.rank);
        inSlot.forEach((a, depth) => {
          spots.push({
            playerId: a.playerId,
            position,
            spot: slots.length > 1 ? `${position}${slotIndex + 1}` : position,
            depth: depth + 1,
          });
        });
      }
    }
  }
  return { teamId, formation: offense ? str(offense.name) || null : null, spots };
}
