/**
 * Puts a player's profile together from the separately cached pieces (bio, career,
 * season, team schedule, depth chart, news). Pure: no fetching here.
 */
import type {
  CareerSeason,
  DepthChart,
  NewsItem,
  Player,
  PlayerBio,
  PlayerGame,
  PlayerSeason,
  Team,
  TeamSchedule,
} from "@/lib/providers/types";
import type { PlayerProfile } from "./types";

export interface ProfileParts {
  playerId: string;
  season: number;
  week: number;
  /** His entry in the full player list (name, fantasy position), when found. */
  listed: Player | null;
  bio: PlayerBio | null;
  career: CareerSeason[];
  seasonData: PlayerSeason & { fetchedAt?: string };
  schedule: TeamSchedule | null;
  depth: DepthChart | null;
  teams: Team[];
  news: NewsItem[];
}

/**
 * Games the season data knows only by id (missed games, every D/ST game) get their
 * opponent and score from the team schedule. Games the schedule says aren't final
 * yet (in progress) are left out, so a half-played game never counts as a full one.
 */
export function fillFromSchedule(games: PlayerGame[], schedule: TeamSchedule | null): PlayerGame[] {
  if (!schedule) return games;
  const byId = new Map(schedule.games.map((g) => [g.gameId, g]));
  return games
    .filter((g) => {
      const s = byId.get(g.gameId);
      return !s || s.state === "post";
    })
    .map((g) => {
      const s = byId.get(g.gameId);
      if (!s || g.opponentId) return g;
      return {
        ...g,
        week: g.week || s.week,
        date: g.date ?? s.date,
        teamId: g.teamId ?? schedule.teamId,
        opponentId: s.opponentId,
        opponentAbbr: s.opponentAbbr,
        home: s.home,
        result: s.result,
        teamScore: s.teamScore,
        opponentScore: s.opponentScore,
      };
    });
}

export function buildPlayerProfile(parts: ProfileParts): PlayerProfile {
  const { playerId, bio, listed, seasonData, schedule, depth, teams } = parts;
  const kind = playerId.startsWith("-") ? "dst" : "player";
  const teamId = bio ? bio.teamId : (seasonData.teamId ?? listed?.teamId ?? null);
  const team = teamId ? teams.find((t) => t.id === teamId) : undefined;
  const next = schedule?.games.find((g) => g.state !== "post");

  return {
    id: playerId,
    kind,
    name: bio?.name || listed?.name || (team ? `${team.name} D/ST` : "Unknown player"),
    position: listed?.position ?? bio?.position ?? (kind === "dst" ? "DST" : null),
    team: teamId ? { id: teamId, abbr: team?.abbr ?? bio?.teamAbbr ?? "", name: team?.name ?? "" } : null,
    headshot: kind === "dst" ? (team?.logo ?? null) : (bio?.headshot ?? listed?.headshot ?? null),
    bio,
    career: parts.career,
    season: parts.season,
    week: parts.week,
    games: fillFromSchedule(seasonData.games, schedule),
    byeWeek: schedule?.byeWeek ?? null,
    nextGame: next ? { week: next.week, date: next.date, opponentAbbr: next.opponentAbbr, home: next.home } : null,
    splits: seasonData.splits,
    advanced: seasonData.advanced,
    fantasy: seasonData.fantasy,
    depth: depth?.spots.filter((s) => s.playerId === playerId) ?? [],
    depthFormation: depth?.formation ?? null,
    news: parts.news,
    fetchedAt: seasonData.fetchedAt ?? new Date().toISOString(),
  };
}
