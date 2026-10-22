/**
 * Turns ESPN's play-by-play into "who gained what" on every play.
 *
 * Source: the core API plays list
 *   sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/<id>/competitions/<id>/plays
 * (see samples/core-plays-*.json). Each play has a type ("Rush", "Pass Reception"...),
 * a text description, and participants: athlete links with a role such as
 * "passer", "receiver", "rusher", "scorer" or "fumbler".
 *
 * deltasForPlay() is the heart of it. Adding up every play's deltas for a
 * player should give that player's box score; parseBoxscore() lets us check.
 */
import type { AttributedPlay, Play, PlayParticipant, PlayerStatDelta } from "@/lib/providers/types";
import { addStatLines } from "@/lib/scoring";
import type { StatKey, StatLine } from "@/lib/stats";
import { arr, bool, get, idFromRef, num, obj, str, type Json } from "../json";
import { buildNameIndex, type NameIndex } from "./names";
import {
  afterReplayReversal,
  ballLosses,
  creditedYards,
  firstGain,
  intendedReceiverName,
  isNoPlay,
  laterals,
  mentionsTouchdown,
  recoveredByOwnTeam,
  splitTry,
  twoPointTry,
} from "./play-text";

/**
 * Play types that are game administration, not football: no one gains stats.
 * They are kept in the play list (the feed can show "End of 1st Quarter"),
 * just with no deltas. Use isAdministrativePlay() to hide them.
 */
export const ADMINISTRATIVE_PLAY_TYPES: readonly string[] = [
  "Timeout",
  "Official Timeout",
  "End Period",
  "Two-minute warning",
  "Coin Toss",
  "End of Half",
  "End of Game",
  "End of Regulation",
];

export function isAdministrativePlay(play: Pick<Play, "type">): boolean {
  return ADMINISTRATIVE_PLAY_TYPES.includes(play.type);
}

// ---------------------------------------------------------------------------
// Reading the raw ESPN response
// ---------------------------------------------------------------------------

/** One raw ESPN play -> our Play shape. Returns null if it has no id. */
export function parseCorePlay(raw: unknown, gameId: string): Play | null {
  const p = obj(raw as Json);
  const id = str(p.id);
  if (!id) return null;

  // Participants come with an "order"; keep ESPN's order so "first fumbler" etc. make sense.
  const participants: PlayParticipant[] = arr(p.participants)
    .map((part) => obj(part))
    .sort((a, b) => num(a.order) - num(b.order))
    .map((part) => ({
      // Links may point at an internal ESPN host; we only read the id out of them.
      playerId: idFromRef(get(part, "athlete", "$ref"), "athletes") ?? "",
      role: str(part.type),
    }))
    .filter((part) => part.playerId !== "" && part.role !== "");

  return {
    id,
    gameId,
    sequence: num(p.sequenceNumber),
    period: num(get(p, "period", "number")),
    clock: str(get(p, "clock", "displayValue")),
    type: str(get(p, "type", "text")),
    text: str(p.text),
    teamId: idFromRef(get(p, "team", "$ref"), "teams"),
    yards: num(p.statYardage),
    scoring: bool(p.scoringPlay),
    scoreValue: num(p.scoreValue),
    awayScore: num(p.awayScore),
    homeScore: num(p.homeScore),
    isPenalty: bool(p.isPenalty),
    isTurnover: bool(p.isTurnover),
    participants,
    wallclock: str(p.wallclock) || undefined,
    modified: str(p.modified) || undefined,
  };
}

/**
 * The whole plays response -> plays in game order, each with its stat deltas.
 * Every play is kept, including timeouts and quarter breaks (they get no
 * deltas). If ESPN lists a play twice, the later copy wins.
 */
export function parseCorePlays(raw: unknown, gameId: string): AttributedPlay[] {
  const byId = new Map<string, Play>();
  for (const item of arr(get(raw as Json, "items"))) {
    const play = parseCorePlay(item, gameId);
    if (play) byId.set(play.id, play);
  }
  const plays = [...byId.values()].sort((a, b) => a.sequence - b.sequence);
  // Learn "J.Meyers" -> id from the whole game, for plays that only name someone in the text.
  const names = buildNameIndex(plays);
  return plays.map((play) => ({ ...play, deltas: deltasForPlay(play, names) }));
}

/** Adds up every play's deltas: player id -> game totals from the play-by-play. */
export function totalsFromPlays(plays: readonly AttributedPlay[]): Record<string, StatLine> {
  const totals: Record<string, StatLine> = {};
  for (const play of plays) {
    for (const delta of play.deltas) {
      totals[delta.playerId] = addStatLines(totals[delta.playerId] ?? {}, delta.stats);
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Who gained what on one play
// ---------------------------------------------------------------------------

/** Collects stat changes per player, remembering the order players were first credited. */
class Ledger {
  private readonly lines = new Map<string, StatLine>();

  add(playerId: string | undefined, key: StatKey, amount = 1): void {
    if (!playerId || amount === 0) return;
    const line = this.lines.get(playerId) ?? {};
    line[key] = (line[key] ?? 0) + amount;
    this.lines.set(playerId, line);
  }

  deltas(): PlayerStatDelta[] {
    const out: PlayerStatDelta[] = [];
    for (const [playerId, line] of this.lines) {
      const stats = addStatLines({}, line); // drops anything that netted to 0
      if (Object.keys(stats).length > 0) out.push({ playerId, stats });
    }
    return out;
  }
}

/** Ids of everyone with this role, without repeats (incompletions list the receiver twice). */
function withRole(play: Play, role: string): string[] {
  const ids = play.participants.filter((p) => p.role === role).map((p) => p.playerId);
  return [...new Set(ids)];
}

/**
 * What one play changed for each player involved. Rules, in the order applied:
 *
 * 1. Replay reversals: only the corrected description after "...REVERSED." counts.
 * 2. "No Play" (a penalty wiped it out) -> nothing for anyone. The extra point
 *    or two-point try is read separately, so a penalty on the try doesn't
 *    erase the touchdown.
 * 3. Passer:
 *    - sacked (a "sackedBy" participant or "sacked" in the text): no passing
 *      stats (sacks aren't pass attempts, and passing yards are gross).
 *    - INTERCEPTED: 1 attempt + 1 interception; the intended receiver
 *      ("intended for J.Meyers") gets a target, as in the official stats.
 *    - incomplete or spiked: 1 attempt (spikes and intentional grounding
 *      count, like the NFL's official stats); each listed receiver gets 1 target.
 *    - otherwise a completion: attempt, completion and yards for the passer;
 *      target, reception and yards for the receiver.
 * 4. Rusher (including kneel-downs and scrambles): 1 carry + yards. An
 *    "Aborted" snap is 1 carry for 0 yards whatever the text says, matching
 *    ESPN's box scores (the NFL charges the lost yards to the team).
 * 5. Yards come from the text ("for 12 yards", "for no gain", "for -3 yards"),
 *    never from ESPN's statYardage unless the text has no yardage at all
 *    (e.g. "Tommy Tremble 19 Yd pass from Bryce Young"). statYardage is the
 *    TEAM's net result: 0 on a fumble lost, and it includes penalty yards.
 *    Two NFL rules then trim the text's yards (see creditedYards): a penalty
 *    enforced at a spot inside the gain, and a fumble lost going backwards.
 * 6. Laterals ("Lateral to R.Johnson ... for 12 yards"): the yards after the
 *    lateral go to the player who caught it (receiving yards after a catch,
 *    rushing yards after a run, no extra catch or carry), and after a catch
 *    they also count as the passer's yards.
 * 7. Touchdowns go to the "scorer": receiver -> receiving TD (+ passing TD for
 *    the passer), rusher -> rushing TD, kick/punt returner -> return TD, and a
 *    player who recovers a teammate's fumble and scores -> fumble-recovery TD.
 *    A blocked punt returned for a TD is NOT a return TD: ESPN's box score
 *    lists it as a defensive TD (week 6, game 401873003), so it belongs to D/ST.
 * 8. Fumbles lost: each "FUMBLES" is matched (in order) to a "fumbler"; it is
 *    lost when the text says "RECOVERED by" in capitals (the other team got
 *    it). A muffed punt or kickoff recovered by the other team is a fumble
 *    lost for the returner, as in ESPN's box score.
 * 9. Two-point tries ("TWO-POINT CONVERSION ATTEMPT ... ATTEMPT SUCCEEDS"):
 *    a pass gives the "patPasser" pass2pt and the "patScorer" rec2pt; a run
 *    gives the "patScorer" rush2pt. "patScorer" also names the kicker on an
 *    ordinary extra point, so it only counts on a successful two-point try.
 *
 * `names` (built by parseCorePlays from the whole game) is only needed for
 * rules 3 and 6, where a player is named in the text but not listed with a
 * useful role. Without it those players are skipped.
 */
export function deltasForPlay(play: Play, names?: NameIndex): PlayerStatDelta[] {
  const ledger = new Ledger();
  const { main, tryText } = splitTry(afterReplayReversal(play.text));
  if (isNoPlay(main)) return [];

  const passer = withRole(play, "passer")[0];
  const receivers = withRole(play, "receiver");
  const rusher = withRole(play, "rusher")[0];
  const returners = withRole(play, "returner");
  const fumblers = withRole(play, "fumbler");
  const recoverers = withRole(play, "recoverer");
  const scorers = withRole(play, "scorer");

  const touchdown =
    mentionsTouchdown(main) || (play.scoring && /touchdown/i.test(play.type) && scorers.length > 0);
  const scored = new Set(touchdown ? scorers : []);
  const credited = new Set<string>(); // scorers whose TD has been counted

  /** Yards for the ball carrier whose "for N yards" is the first one at or after `from`. */
  const yardsFrom = (from: number): number => {
    const gain = firstGain(main, from);
    return gain ? creditedYards(main, gain) : play.yards;
  };

  /** Yards after laterals, given to whoever took them. Returns the total. */
  const lateralYards = (key: "recYds" | "rushYds", touchdownKey: "recTd" | "rushTd"): number => {
    let total = 0;
    for (const lateral of laterals(main)) {
      const yards = lateral.gain ? creditedYards(main, lateral.gain) : 0;
      const playerId = names?.get(lateral.name);
      total += yards;
      ledger.add(playerId, key, yards);
      if (playerId && scored.has(playerId) && !credited.has(playerId)) {
        ledger.add(playerId, touchdownKey);
        credited.add(playerId);
      }
    }
    return total;
  };

  // --- Passing ---------------------------------------------------------------
  if (passer) {
    const sacked = withRole(play, "sackedBy").length > 0 || /\bsacked\b/.test(main);
    if (sacked) {
      // Sacks aren't pass attempts and don't change passing yards.
    } else if (/\bINTERCEPTED\b/.test(main)) {
      ledger.add(passer, "passAtt");
      ledger.add(passer, "passInt");
      const intended = receivers.length > 0 ? receivers : [names?.get(intendedReceiverName(main) ?? "")];
      for (const receiver of intended) ledger.add(receiver, "targets");
    } else if (/\bincomplete\b|\bspiked\b/.test(main)) {
      ledger.add(passer, "passAtt");
      for (const receiver of receivers) ledger.add(receiver, "targets");
    } else if (/\bpass\b/.test(main)) {
      const receiver = receivers[0];
      const yards = yardsFrom(main.search(/\bpass\b/));
      ledger.add(passer, "passAtt");
      ledger.add(passer, "passCmp");
      ledger.add(passer, "passYds", yards);
      ledger.add(receiver, "targets");
      ledger.add(receiver, "rec");
      ledger.add(receiver, "recYds", yards);
      if (receiver && scored.has(receiver)) {
        ledger.add(receiver, "recTd");
        credited.add(receiver);
      }
      ledger.add(passer, "passYds", lateralYards("recYds", "recTd"));
      // A touchdown by the receiver, or by someone he lateraled to, is a passing TD.
      if (credited.size > 0) ledger.add(passer, "passTd");
    }
  }

  // --- Rushing ---------------------------------------------------------------
  if (rusher) {
    const aborted = /\bAborted\b/.test(main);
    ledger.add(rusher, "rushAtt");
    ledger.add(rusher, "rushYds", aborted ? 0 : yardsFrom(0));
    if (scored.has(rusher)) {
      ledger.add(rusher, "rushTd");
      credited.add(rusher);
    }
    if (!passer) lateralYards("rushYds", "rushTd");
  }

  // --- Other touchdowns: returns and fumble recoveries -------------------------
  const isKickPlay = /kickoff|punt/i.test(play.type);
  const isBlocked = /\bBLOCKED\b/.test(main) || /blocked/i.test(play.type);
  for (const scorer of scored) {
    if (credited.has(scorer)) continue;
    if (isKickPlay && !isBlocked && returners.includes(scorer)) {
      ledger.add(scorer, "retTd");
    } else if (
      recoverers.includes(scorer) &&
      !fumblers.includes(scorer) &&
      recoveredByOwnTeam(main)
    ) {
      ledger.add(scorer, "fumRecTd");
    }
  }

  // --- Fumbles lost ----------------------------------------------------------
  let nextFumbler = 0;
  for (const loss of ballLosses(main)) {
    // A muff belongs to the returner; each "FUMBLES" to the next listed fumbler.
    const player =
      loss.kind === "MUFFS"
        ? returners[0]
        : (fumblers[nextFumbler++] ?? fumblers[fumblers.length - 1]);
    if (loss.lost) ledger.add(player, "fumLost");
  }

  // --- Two-point try -----------------------------------------------------------
  const twoPoint = twoPointTry(tryText);
  if (twoPoint?.succeeded) {
    const patScorer = withRole(play, "patScorer")[0];
    if (twoPoint.isPass) {
      ledger.add(withRole(play, "patPasser")[0], "pass2pt");
      ledger.add(patScorer, "rec2pt");
    } else {
      ledger.add(patScorer, "rush2pt");
    }
  }

  return ledger.deltas();
}
