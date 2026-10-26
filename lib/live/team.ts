/**
 * The live team engine: given your roster and this week's game data, work out
 * each player's live fantasy points and every play that moved them.
 *
 * Pure (no fetching), so it can be tested against real finished games.
 */
import type { Game, GameDetail, PlayerOutlook, Position, Scoreboard, Team } from "@/lib/providers/types";
import {
  addStatLines,
  reconcile,
  roundPoints,
  rulesForFormat,
  scoreDelta,
  scoreStatLine,
  type ScoringFormat,
  type ScoringRules,
} from "@/lib/scoring";
import { defensePlayDeltas, defenseStatLine } from "@/lib/providers";
import type { StatLine } from "@/lib/stats";
import { cleanPlayText } from "./play-text";
import { teamLite, type FeedItem, type PlayerGame, type PlayerLive, type TeamLive } from "./types";

export interface RosterInput {
  playerId: string;
  name: string;
  position: Position;
  teamId: string | null;
}

export interface TeamLiveInput {
  roster: RosterInput[];
  format: ScoringFormat;
  /** Exact rules to score with (a league's own); defaults to the format's preset. */
  rules?: Readonly<ScoringRules>;
  scoreboard: Scoreboard;
  /** Game details for games that have started, keyed by game id. */
  details: Record<string, GameDetail>;
  outlooks: PlayerOutlook[];
  byeWeeks: Record<string, number>;
  teams: Team[];
  fetchedAt: string;
}

const TWO_POINT_KEYS = ["pass2pt", "rush2pt", "rec2pt"] as const;
const TOUCHDOWN_KEYS = ["passTd", "rushTd", "recTd", "retTd", "fumRecTd", "dstIntTd", "dstFumTd", "dstBlkTd"] as const;

/** D/ST "players" use ESPN fantasy ids like -16012 (team 12). */
export function teamIdOf(player: RosterInput): string | null {
  if (player.teamId) return player.teamId;
  const dst = player.playerId.match(/^-16(\d{3})$/);
  return dst ? String(Number(dst[1])) : null;
}

export function findGame(games: Game[], teamId: string | null): Game | undefined {
  if (!teamId) return undefined;
  return games.find((g) => g.home.team.id === teamId || g.away.team.id === teamId);
}

function playerGame(game: Game, teamId: string): PlayerGame {
  const isHome = game.home.team.id === teamId;
  const us = isHome ? game.home : game.away;
  const them = isHome ? game.away : game.home;
  return {
    id: game.id,
    state: game.state,
    statusText: game.statusText,
    period: game.period,
    clock: game.clock,
    kickoff: game.kickoff,
    isHome,
    teamId,
    opponentId: them.team.id,
    teamScore: us.score,
    opponentScore: them.score,
    hasBall: game.state === "in" && game.situation?.possessionTeamId === teamId,
    possession:
      game.state !== "in"
        ? null
        : !game.situation?.possessionTeamId
          ? "unknown"
          : game.situation.possessionTeamId === teamId
            ? "ball"
            : game.situation.possessionTeamId === them.team.id
              ? "defense"
              : "unknown",
    downDistance: game.state === "in" ? (game.situation?.downDistance ?? null) : null,
    isRedZone: game.state === "in" && Boolean(game.situation?.isRedZone) && game.situation?.possessionTeamId === teamId,
  };
}

/** Share of a 60-minute game still to play (0 when final, 1 before kickoff). */
export function remainingShare(game: Pick<Game, "state" | "period" | "clock"> | null): number {
  if (!game || game.state === "pre") return 1;
  if (game.state === "post" || game.period > 4) return 0;
  const [m, s] = game.clock.split(":").map(Number);
  const clockLeft = (Number.isFinite(m) ? m : 0) + (Number.isFinite(s) ? s : 0) / 60;
  const left = (4 - game.period) * 15 + Math.min(15, clockLeft);
  return Math.max(0, Math.min(1, left / 60));
}

/** "J.Chase", the way ESPN play text names players. */
export function playTextName(fullName: string): string {
  const parts = fullName
    .replace(/\b(Jr|Sr|II|III|IV|V)\.?$/i, "")
    .trim()
    .split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}.${parts.slice(1).join(" ")}`;
}

const INJURY_PATTERN = /(was injured|is questionable to return|will not return|is out for the game|has returned to the game|is doubtful to return)/i;

/** Sentences in a play's text that report this player hurt (or back in the game). */
function injuryNote(text: string, shortName: string): string | null {
  if (!INJURY_PATTERN.test(text)) return null;
  const sentences = text.split(/(?<=[.!])\s+|\*\*\s*/);
  const hit = sentences.find((s) => s.includes(shortName) && INJURY_PATTERN.test(s));
  return hit ? hit.replace(/^Injury Update:\s*/i, "").trim() : null;
}

export function buildTeamLive(input: TeamLiveInput): TeamLive {
  const rules = input.rules ?? rulesForFormat(input.format);
  const feed: FeedItem[] = [];
  const outlooks = new Map(input.outlooks.map((o) => [o.playerId, o]));

  const players: PlayerLive[] = input.roster.map((rp) => {
    const teamId = teamIdOf(rp);
    const scoringSupported = true; // kickers and D/ST included since the K/DST phase
    const isDefense = rp.position === "DST";
    const game = findGame(input.scoreboard.games, teamId);
    const detail = game ? input.details[game.id] : undefined;
    const outlook = outlooks.get(rp.playerId);
    const projection =
      outlook?.projection && scoringSupported ? scoreStatLine(outlook.projection, rules).total : null;

    // Every play that changed this player's stats, and what each was worth.
    // A D/ST is a whole team: its changes (sacks, turnovers, points- and
    // yards-allowed tiers) come from the game as a whole, not from play.deltas.
    const changes =
      isDefense && detail && teamId
        ? defensePlayDeltas(detail, teamId)
        : (detail?.plays ?? []).flatMap((play) => {
            const delta = play.deltas.find((d) => d.playerId === rp.playerId);
            return delta ? [{ play, stats: delta.stats }] : [];
          });
    let fromPlays: StatLine = {};
    let playPoints = 0;
    const shortName = playTextName(rp.name);
    for (const { play, stats: delta } of changes) {
      fromPlays = addStatLines(fromPlays, delta);
      const scored = scoreDelta(delta, rules);
      playPoints += scored.points;
      if (scored.points !== 0 && scoringSupported) {
        feed.push({
          id: `${play.id}:${rp.playerId}`,
          kind: "points",
          playId: play.id,
          gameId: play.gameId,
          playerId: rp.playerId,
          playerName: rp.name,
          teamId,
          period: play.period,
          clock: play.clock,
          sequence: play.sequence,
          wallclock: play.wallclock,
          text: cleanPlayText(play.text),
          playType: play.type,
          isTouchdown: TOUCHDOWN_KEYS.some((key) => (delta[key] ?? 0) > 0),
          points: scored.points,
          parts: scored.parts,
        });
      }
    }
    for (const play of isDefense ? [] : (detail?.plays ?? [])) {
      const note = injuryNote(play.text, shortName);
      if (note) {
        feed.push({
          id: `${play.id}:injury:${rp.playerId}`,
          kind: "injury",
          playId: play.id,
          gameId: play.gameId,
          playerId: rp.playerId,
          playerName: rp.name,
          teamId,
          period: play.period,
          clock: play.clock,
          sequence: play.sequence + 0.5,
          wallclock: play.wallclock,
          text: note,
          playType: "Injury",
          isTouchdown: false,
          points: 0,
          parts: [],
        });
      }
    }

    // Official numbers win. Box scores leave out 2-point conversions, so add those from the plays.
    // A D/ST's official line is built from the box score and the final score (defenseStatLine).
    const box =
      isDefense && detail && teamId ? defenseStatLine(detail, teamId) : detail?.boxscore[rp.playerId]?.stats;
    let stats: StatLine = box ? { ...box } : fromPlays;
    if (box) {
      for (const key of TWO_POINT_KEYS) {
        if (fromPlays[key]) stats = { ...stats, [key]: fromPlays[key] };
      }
    }
    const points = scoringSupported ? scoreStatLine(stats, rules).total : 0;
    playPoints = scoringSupported ? roundPoints(playPoints) : 0;
    const check = reconcile(playPoints, points);

    const live = game ? playerGame(game, teamId!) : null;
    const share = remainingShare(game ?? null);
    return {
      playerId: rp.playerId,
      name: rp.name,
      position: rp.position,
      teamId,
      game: live,
      onBye: !game && teamId !== null && input.byeWeeks[teamId] === input.scoreboard.week,
      injuryStatus: outlook?.injuryStatus,
      stats,
      points: check.headline,
      playPoints,
      correction: check.ok ? 0 : roundPoints(points - playPoints),
      projection: projection === null ? null : roundPoints(projection),
      liveProjection: projection === null ? null : roundPoints(points + projection * share),
      scoringSupported,
    };
  });

  feed.sort((a, b) => {
    const ta = a.wallclock ? Date.parse(a.wallclock) : 0;
    const tb = b.wallclock ? Date.parse(b.wallclock) : 0;
    if (ta !== tb) return tb - ta;
    return a.gameId === b.gameId ? b.sequence - a.sequence : b.gameId.localeCompare(a.gameId);
  });

  const teams: TeamLive["teams"] = {};
  for (const team of input.teams) teams[team.id] = teamLite(team);

  return {
    season: input.scoreboard.season,
    week: input.scoreboard.week,
    format: input.format,
    fetchedAt: input.fetchedAt,
    players,
    feed,
    teams,
    anyLive: players.some((p) => p.game?.state === "in"),
  };
}
