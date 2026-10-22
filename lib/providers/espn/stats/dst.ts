/**
 * Team defense / special teams ("D/ST") for fantasy, the way ESPN scores it.
 *
 * A D/ST is a whole team, so its numbers depend on the game so far (the score,
 * the other team's yards), not just one play. That's why this lives apart
 * from deltasForPlay: give it a game (GameDetail) and a team id.
 *
 * ESPN's rules, each checked against ESPN's real numbers (weeks 1-6 of 2026):
 * - A D/ST starts each game with 0 points allowed (worth 5) and 0 yards allowed
 *   (worth 5), so it shows 10 points at kickoff and loses them as the other
 *   team moves the ball and scores. (ESPN's help page says so too.)
 * - Points allowed = the other team's score, MINUS 6 for each interception or
 *   fumble they returned for a TD against this team's offense, and MINUS 2 for
 *   each safety they scored. (The extra point after a pick-six still counts.)
 *   Special-teams scores against you (punt return TD, blocked punt TD) count.
 *   Weeks 1-5: all 24 such games matched this exactly; week 6: all 28 teams.
 * - Yards allowed = the other team's total net yards (rushing + passing minus
 *   sack yards), the box score's "totalYards". Week 6: all 28 teams matched.
 * - Fumbles count when recovered, not just forced. A muffed punt or kickoff
 *   recovered by the kicking team counts as a fumble recovery.
 * - Sacks count only when a defender is credited (a "sackedBy" participant):
 *   ESPN skipped the uncredited "J.Strand sacked ... FUMBLES" kind and sacks
 *   on two-point tries, which the box score's team total does include.
 *
 * Who scored: each scoring play's own team and value (scoreValue, plus the
 * try). The running score on each play can't be used: ESPN often updates it
 * a play late (on the next timeout). Adding up scoring plays reproduced the
 * final score of all 26 games we checked.
 *
 * Tiers are 0/1 switches (see lib/stats.ts): when allowing a touchdown moves
 * the defense from 7-13 to 14-17, that play gives { dstPa7_13: -1, dstPa14_17: +1 }.
 */
import type { AttributedPlay, GameDetail, TeamStat } from "@/lib/providers/types";
import { addStatLines } from "@/lib/scoring";
import type { StatKey, StatLine } from "@/lib/stats";
import {
  afterReplayReversal,
  ballLosses,
  defensiveTwoPoint,
  extraPoint,
  isNoPlay,
  mentionsTouchdown,
  sackYards,
  splitTry,
  twoPointTry,
} from "./play-text";
import { isAdministrativePlay } from "./plays";

/** What the D/ST helpers need from a game. Drives and team stats are optional extras. */
export type DefenseGame = Pick<GameDetail, "game" | "plays" | "boxscore"> &
  Partial<Pick<GameDetail, "drives" | "teamStats">>;

/** ESPN fantasy's id for a team's D/ST: team 12 -> "-16012". */
export function dstPlayerId(teamId: string): string {
  return `-16${teamId.padStart(3, "0")}`;
}

/** "-16012" -> "12", or null if it isn't a D/ST id. */
export function dstTeamId(playerId: string): string | null {
  const match = /^-16(\d{3})$/.exec(playerId);
  return match ? String(Number(match[1])) : null;
}

// Highest value in each tier, in order. ESPN's tiers (samples/fantasy-league-defaults-scoring.json).
const POINTS_TIERS: [max: number, key: StatKey][] = [
  [0, "dstPa0"], [6, "dstPa1_6"], [13, "dstPa7_13"], [17, "dstPa14_17"], [21, "dstPa18_21"],
  [27, "dstPa22_27"], [34, "dstPa28_34"], [45, "dstPa35_45"], [Infinity, "dstPa46"],
];
const YARDS_TIERS: [max: number, key: StatKey][] = [
  [99, "dstYa0_99"], [199, "dstYa100_199"], [299, "dstYa200_299"], [349, "dstYa300_349"],
  [399, "dstYa350_399"], [449, "dstYa400_449"], [499, "dstYa450_499"], [549, "dstYa500_549"],
  [Infinity, "dstYa550"],
];
const TIER_KEYS = new Set<StatKey>([...POINTS_TIERS, ...YARDS_TIERS].map(([, key]) => key));

/** Which points-allowed tier a total falls in: 10 -> "dstPa7_13". */
export function pointsAllowedTier(points: number): StatKey {
  return POINTS_TIERS.find(([max]) => points <= max)![1];
}

/** Which yards-allowed tier a total falls in: 257 -> "dstYa200_299". (Negative counts as 0-99.) */
export function yardsAllowedTier(yards: number): StatKey {
  return YARDS_TIERS.find(([max]) => yards <= max)![1];
}

/** One play's change to a D/ST's stat line. */
export interface DefensePlayDelta {
  play: AttributedPlay;
  stats: StatLine;
}

/**
 * Every play that changed this team's D/ST line, oldest first. Adding them up
 * gives the D/ST's line from the play-by-play. The first real play (usually
 * the opening kickoff) carries the starting tiers: 0 points and 0 yards allowed.
 */
export function defensePlayDeltas(detail: DefenseGame, teamId: string): DefensePlayDelta[] {
  return analyze(detail, teamId).deltas;
}

/**
 * The D/ST's official line for the game. Starts from the plays, then uses the
 * official numbers wherever ESPN's box score has them: the score (points
 * allowed), the other team's total yards, and interceptions thrown. The tiers
 * are then set from those official totals. (Sacks stay from the plays: the box
 * score's team sack count includes sacks ESPN fantasy doesn't.) Before kickoff
 * it's empty.
 */
export function defenseStatLine(detail: DefenseGame, teamId: string): StatLine {
  const { deltas, excludedPoints, opponentId } = analyze(detail, teamId);
  if (!opponentId || (deltas.length === 0 && detail.game.state === "pre")) return {};

  const fromPlays = deltas.reduce<StatLine>((sum, d) => addStatLines(sum, d.stats), {});
  const line: StatLine = {};
  for (const [key, value] of Object.entries(fromPlays) as [StatKey, number][]) {
    if (!TIER_KEYS.has(key)) line[key] = value;
  }

  const opponent = detail.game.home.team.id === opponentId ? detail.game.home : detail.game.away;
  line.dstPa = Math.max(0, opponent.score - excludedPoints);
  const yards = teamStatNumber(detail.teamStats, "totalYards", detail, opponentId);
  if (yards !== undefined) line.dstYa = yards;
  const opponentLines = Object.values(detail.boxscore).filter((l) => l.teamId === opponentId);
  if (opponentLines.length > 0) {
    line.dstInt = opponentLines.reduce((n, l) => n + (l.stats.passInt ?? 0), 0);
  }

  line[pointsAllowedTier(line.dstPa)] = 1;
  line[yardsAllowedTier(line.dstYa ?? 0)] = 1;
  return addStatLines({}, line); // drop zeros
}

// ---------------------------------------------------------------------------
// The play-by-play walk
// ---------------------------------------------------------------------------

interface Analysis {
  deltas: DefensePlayDelta[];
  /** Points that don't count against this team (opponent's defensive TDs and safeties). */
  excludedPoints: number;
  opponentId?: string;
}

function analyze(detail: DefenseGame, teamId: string): Analysis {
  const home = detail.game.home.team.id;
  const away = detail.game.away.team.id;
  if (teamId !== home && teamId !== away) return { deltas: [], excludedPoints: 0 };
  const opponentId = teamId === home ? away : home;
  const teams = new TeamFinder(detail, home, away);

  const deltas: DefensePlayDelta[] = [];
  let started = false;
  let pointsAllowed = 0;
  let yardsAllowed = 0;
  let opponentPoints = 0;
  let excludedPoints = 0;

  for (const play of detail.plays) {
    const stats: StatLine = {};
    const add = (key: StatKey, amount = 1) => {
      if (amount !== 0) stats[key] = (stats[key] ?? 0) + amount;
    };

    if (!started && !isAdministrativePlay(play)) {
      started = true;
      add(pointsAllowedTier(0));
      add(yardsAllowedTier(0));
    }

    const facts = playFacts(play, teams);
    for (const event of facts.events) if (event.teamId === teamId) add(event.key, event.amount);
    for (const ex of facts.excluded) if (ex.teamId === teamId) excludedPoints += ex.points;
    for (const scored of facts.points) if (scored.teamId === opponentId) opponentPoints += scored.points;
    const newYards = yardsAllowed + (facts.yards?.teamId === opponentId ? facts.yards.amount : 0);
    const newPoints = Math.max(0, opponentPoints - excludedPoints);

    if (started) {
      swapTier(add, pointsAllowedTier(pointsAllowed), pointsAllowedTier(newPoints));
      swapTier(add, yardsAllowedTier(yardsAllowed), yardsAllowedTier(newYards));
      add("dstPa", newPoints - pointsAllowed);
      add("dstYa", newYards - yardsAllowed);
    }
    pointsAllowed = newPoints;
    yardsAllowed = newYards;

    if (Object.keys(stats).length > 0) deltas.push({ play, stats });
  }
  return { deltas, excludedPoints, opponentId };
}

function swapTier(add: (key: StatKey, amount?: number) => void, from: StatKey, to: StatKey) {
  if (from === to) return;
  add(from, -1);
  add(to, 1);
}

// ---------------------------------------------------------------------------
// One play: who had the ball, and what it means for each D/ST
// ---------------------------------------------------------------------------

interface PlayFacts {
  /** D/ST stats earned on this play, by team. */
  events: { teamId: string; key: StatKey; amount: number }[];
  /** Points scored on this play, by team (touchdown or kick, plus the try). */
  points: { teamId: string; points: number }[];
  /** Points scored on this play that don't count against `teamId`'s points allowed. */
  excluded: { teamId: string; points: number }[];
  /** Yards gained by `teamId`'s offense on this play (count against the other D/ST). */
  yards?: { teamId: string; amount: number };
}

/** Works out which team a player or play belongs to. */
class TeamFinder {
  private readonly playerTeam = new Map<string, string>();
  private readonly driveTeam = new Map<string, string>();

  constructor(
    detail: DefenseGame,
    readonly home: string,
    readonly away: string,
  ) {
    // Box-score players: passers, runners, receivers, kickers, punters, returners.
    for (const line of Object.values(detail.boxscore)) {
      if (line.teamId) this.playerTeam.set(line.playerId, line.teamId);
    }
    // Each drive's plays belong to the team with the ball on that drive.
    for (const drive of detail.drives ?? []) {
      for (const playId of drive.playIds) this.driveTeam.set(playId, drive.teamId);
    }
  }

  of(playerId: string | undefined): string | undefined {
    return playerId ? this.playerTeam.get(playerId) : undefined;
  }

  other(teamId: string | undefined): string | undefined {
    if (teamId === this.home) return this.away;
    if (teamId === this.away) return this.home;
    return undefined;
  }

  /**
   * The team with the ball when the play started: the offense, or the kicking
   * team on a kickoff, punt or field goal.
   */
  possession(play: AttributedPlay, isKickoff: boolean): string | undefined {
    const role = (r: string) => play.participants.find((p) => p.role === r)?.playerId;
    return (
      this.of(role("passer")) ??
      this.of(role("rusher")) ??
      this.of(role("receiver")) ??
      this.of(role("punter")) ??
      this.of(role("kicker")) ??
      this.other(this.of(role("returner"))) ??
      // ESPN files a kickoff under the receiving team's drive.
      (isKickoff ? this.other(this.driveTeam.get(play.id)) : this.driveTeam.get(play.id))
    );
  }
}

function playFacts(play: AttributedPlay, teams: TeamFinder): PlayFacts {
  const facts: PlayFacts = { events: [], points: [], excluded: [] };
  const text = afterReplayReversal(play.text);
  const { main, tryText } = splitTry(text);
  if (isNoPlay(main) || isAdministrativePlay(play)) return facts;

  const ids = (role: string) => play.participants.filter((p) => p.role === role).map((p) => p.playerId);
  const isKickoff = /kickoff/i.test(play.type) || /\bkicks\b/.test(main);
  const isPunt = /punt/i.test(play.type) || /\bpunts\b|\bpunt is\b/.test(main);
  const isKickPlay = isKickoff || isPunt; // the other team returns it
  const offense = teams.possession(play, isKickoff);
  const defense = teams.other(offense);
  const credit = (teamId: string | undefined, key: StatKey, amount = 1) => {
    if (teamId) facts.events.push({ teamId, key, amount });
  };

  // Who scored, and how much (ESPN tags a scoring play with the scoring team).
  const touchdown = mentionsTouchdown(main) || (play.scoring && /touchdown/i.test(play.type));
  const scorer = play.scoring ? play.teamId : undefined;
  if (scorer) {
    let points = play.scoreValue;
    if (extraPoint(main, tryText) === true) points += 1;
    if (twoPointTry(tryText)?.succeeded) points += 2;
    facts.points.push({ teamId: scorer, points });
  }

  const passer = ids("passer")[0];
  const sacked = passer !== undefined && /\bsacked\b/.test(main);
  const intercepted = passer !== undefined && /\bINTERCEPTED\b/.test(main);
  const blocked = /\bBLOCKED\b/.test(main);
  if (sacked && ids("sackedBy").length > 0) credit(defense, "dstSack");
  if (intercepted) credit(defense, "dstInt");
  if (blocked) credit(defense, "dstBlk");
  if (/extra point is (BLOCKED|Blocked)/.test(tryText)) credit(teams.other(scorer), "dstBlk");

  // Fumbles and muffs recovered by the other team.
  const fumblers = ids("fumbler");
  const returner = ids("returner")[0];
  let nextFumbler = 0;
  let fumbleLost = false;
  for (const loss of ballLosses(main)) {
    const player = loss.kind === "MUFFS" ? returner : (fumblers[nextFumbler++] ?? fumblers.at(-1));
    if (!loss.lost) continue;
    fumbleLost = true;
    const losingTeam = teams.of(player) ?? (isKickPlay ? defense : offense);
    credit(teams.other(losingTeam), "dstFumRec");
  }

  // Touchdowns by the defense or special teams.
  if (touchdown && scorer && scorer === defense) {
    if (blocked) {
      credit(scorer, "dstBlkTd");
    } else if (intercepted) {
      credit(scorer, "dstIntTd");
      facts.excluded.push({ teamId: offense!, points: 6 }); // a pick-six doesn't count against the D/ST
    } else if (fumbleLost && !isKickPlay) {
      credit(scorer, "dstFumTd");
      facts.excluded.push({ teamId: offense!, points: 6 });
    } else if (isKickPlay && ids("scorer").some((id) => id === returner)) {
      credit(scorer, "retTd");
    } else if (fumbleLost) {
      credit(scorer, "dstFumTd"); // e.g. the punter fumbles and the return team scores
    }
  } else if (touchdown && scorer && scorer === offense && isKickPlay && fumbleLost) {
    credit(scorer, "dstFumTd"); // kicking team recovers a muff or return fumble and scores
  }

  // Safety: 2 points for the defense, with no touchdown on the play.
  if (scorer && !touchdown && play.scoreValue === 2) {
    credit(scorer, "dstSafety");
    const victim = teams.other(scorer);
    if (victim) facts.excluded.push({ teamId: victim, points: 2 });
  }

  // Two-point try returned by the defense.
  if (defensiveTwoPoint(tryText)) {
    const returningTeam = teams.other(scorer);
    credit(returningTeam, "dst2ptRet");
    if (returningTeam) facts.points.push({ teamId: returningTeam, points: 2 });
    if (scorer) facts.excluded.push({ teamId: scorer, points: 2 });
  }

  // Yards gained by the offense: every runner's and passer's yards on the play
  // (laterals included), minus yards lost on a sack.
  if (offense && (passer !== undefined || ids("rusher").length > 0)) {
    let yards = 0;
    for (const delta of play.deltas) yards += (delta.stats.rushYds ?? 0) + (delta.stats.passYds ?? 0);
    if (sacked) yards += sackYards(main) ?? play.yards;
    facts.yards = { teamId: offense, amount: yards };
  }
  return facts;
}

/** A number for one team from the box score's team stats: "412" -> 412, "4-35" -> 4. */
function teamStatNumber(
  stats: TeamStat[] | undefined,
  name: string,
  detail: DefenseGame,
  teamId: string,
): number | undefined {
  const stat = stats?.find((s) => s.name === name);
  if (!stat) return undefined;
  const value = detail.game.home.team.id === teamId ? stat.home : stat.away;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}
