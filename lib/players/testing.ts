/**
 * FOR TESTS ONLY (reads files): builds real player profiles from the ESPN
 * responses saved in samples/ (Week 7 of 2026), through the same parsers the
 * live app uses.
 */
import { readFileSync } from "node:fs";
import { parseAthleteBio, parseCareer, parseGameLog, parseSeasonAdvanced, parseSplits, NO_ADVANCED, NO_SPLITS } from "@/lib/providers/espn/athlete";
import { mergePlayerSeason } from "@/lib/providers/espn/player";
import { parsePlayerFantasy } from "@/lib/providers/espn/player-fantasy";
import { parsePlayersList } from "@/lib/providers/espn/fantasy";
import { parseTeams } from "@/lib/providers/espn/teams";
import { parseDepthChart, parseTeamSchedule } from "@/lib/providers/espn/team-pages";
import { dstTeamId } from "@/lib/providers/espn/stats";
import type { Player } from "@/lib/providers/types";
import { buildPlayerProfile } from "./profile";
import type { PlayerProfile } from "./types";

const cache = new Map<string, unknown>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sample(name: string): any {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(`samples/${name}`, "utf8")));
  return cache.get(name);
}

export const SEASON = 2026;
export const WEEK = 7;

/** Identity as the player list would give it (the trimmed list sample doesn't hold everyone). */
const LISTED: Record<string, Pick<Player, "name" | "position" | "teamId">> = {
  "-16012": { name: "Chiefs D/ST", position: "DST", teamId: "12" },
};

export function sampleProfile(playerId: string): PlayerProfile {
  const pick = (file: string) => sample(file)[playerId] ?? null;
  const kona = parsePlayerFantasy(sample("fantasy-kona-player-profile.json"), playerId, SEASON, WEEK);
  const bioWeb = pick("athlete-bio-trimmed.json");
  const bio = bioWeb ? parseAthleteBio(bioWeb, pick("athlete-core-trimmed.json")) : null;
  const log = pick("athlete-gamelog-trimmed.json");
  const splits = pick("athlete-splits-trimmed.json");
  const advanced = pick("athlete-season-stats-trimmed.json");
  const career = pick("athlete-stats-trimmed.json");
  const teamId = bio?.teamId ?? dstTeamId(playerId) ?? kona?.teamId ?? null;
  const schedule = teamId ? sample("team-schedule-trimmed.json")[teamId] : null;
  const depth = teamId ? sample("depthchart-trimmed.json")[teamId] : null;
  const listedFromSample = parsePlayersList(sample("fantasy-players-wl-trimmed.json")).find((p) => p.id === playerId);
  const listed: Player | null =
    listedFromSample ?? (LISTED[playerId] ? { id: playerId, headshot: null, ...LISTED[playerId] } : null);

  return buildPlayerProfile({
    playerId,
    season: SEASON,
    week: WEEK,
    listed,
    bio,
    career: career ? parseCareer(career) : [],
    seasonData: {
      playerId,
      season: SEASON,
      teamId,
      games: mergePlayerSeason(playerId, SEASON, kona, log ? parseGameLog(log) : []),
      splits: splits ? parseSplits(splits, SEASON) : NO_SPLITS,
      advanced: advanced ? parseSeasonAdvanced(advanced) : NO_ADVANCED,
      fantasy: kona!.info,
      fetchedAt: "2026-10-23T04:00:00.000Z",
    },
    schedule: schedule ? parseTeamSchedule(schedule, teamId!, SEASON) : null,
    depth: depth ? parseDepthChart(depth, teamId!) : null,
    teams: parseTeams(sample("teams.json")),
    news: [],
  });
}
