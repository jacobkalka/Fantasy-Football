/**
 * Small helpers that read ESPN's play descriptions, e.g.
 *   "(Shotgun) P.Mahomes pass short left to X.Worthy to LAC 47 for 15 yards (C.Hart)."
 * The play's participants tell us WHO was involved; the text tells us details
 * the structured fields get wrong (see yards below) and how a fumble ended.
 */

/**
 * After a replay review overturns a call, ESPN keeps the original description
 * and appends the corrected one:
 *   "...for 20 yards ... and the play was REVERSED.(Shotgun) A.Rodgers pass ... for 16 yards"
 * Only the corrected part counts. ("Upheld" reviews keep the whole text.)
 */
export function afterReplayReversal(text: string): string {
  const marker = "play was REVERSED.";
  const at = text.lastIndexOf(marker);
  return at === -1 ? text : text.slice(at + marker.length).trim();
}

/** A play split into the snap itself and the try that follows a touchdown. */
export interface PlayTextParts {
  /** The snap: run, pass, kick, return... */
  main: string;
  /** Extra point or two-point attempt text, or "" when there is none. */
  tryText: string;
}

/**
 * Splits off the extra point / two-point try ("...TOUCHDOWN. J.Slye extra point
 * is GOOD" or "...TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. ..."), so that words
 * in the try (like a penalty's "No Play") don't change what the snap counted.
 */
export function splitTry(text: string): PlayTextParts {
  const twoPoint = text.indexOf("TWO-POINT CONVERSION ATTEMPT");
  const extraPoint = text.search(/\S+ extra point is\b/);
  const cuts = [twoPoint, extraPoint].filter((i) => i >= 0);
  if (cuts.length === 0) return { main: text, tryText: "" };
  const cut = Math.min(...cuts);
  return { main: text.slice(0, cut), tryText: text.slice(cut) };
}

/** "- No Play." means a penalty wiped the play out: nothing counts. */
export function isNoPlay(main: string): boolean {
  return /\bNo Play\b/i.test(main);
}

/** "TOUCHDOWN" in the snap's text, but not "TOUCHDOWN NULLIFIED by Penalty". */
export function mentionsTouchdown(main: string): boolean {
  return /TOUCHDOWN(?! NULLIFIED)/.test(main);
}

/**
 * An abbreviated player name as ESPN writes it: "P.Mahomes", "Ca.Jones",
 * "K.Lambert-Smith", "A.St. Brown", "L.Van Ness".
 */
export const NAME = String.raw`[A-Z][a-z]{0,2}\.(?:[A-Z][a-z]+\. ?)?[A-Z][A-Za-z'\-]*(?: [A-Z][a-z'\-]+)?`;

// ---------------------------------------------------------------------------
// Field positions
// ---------------------------------------------------------------------------

/** A yard line as written in the text: "KC 35" (Kansas City's 35) or "50". */
export interface Spot {
  /** Team abbreviation whose half it is ("HST", "KC"); missing for midfield. */
  side?: string;
  line: number;
}

const SPOT = String.raw`(?:([A-Z]{2,3}) (\d{1,2})|(50))`;

function spotFrom(side: string | undefined, line: string | undefined, fifty: string | undefined) {
  if (fifty) return { line: 50 } satisfies Spot;
  if (side && line) return { side, line: Number(line) } satisfies Spot;
  return undefined;
}

/**
 * Yards from a spot to the goal line the offense is attacking ("KC 20" is 20
 * yards away when KC is defending, 80 when KC has the ball).
 */
function yardsToGoal(spot: Spot, defenseSide: string): number {
  if (spot.side === undefined) return 50;
  return spot.side === defenseSide ? spot.line : 100 - spot.line;
}

// ---------------------------------------------------------------------------
// Yards gained
// ---------------------------------------------------------------------------

/** One "for N yards" phrase, with where the ball carrier ended up. */
export interface Gain {
  yards: number;
  /** Spot written just before "for" ("to KC 35 for 6 yards"); missing if none. */
  end?: Spot;
  /**
   * True for "for 12 yards, TOUCHDOWN": the carrier reached the goal line
   * (even if a penalty then took the touchdown away).
   */
  reachedGoal: boolean;
  /** Where in the text this phrase starts. */
  index: number;
}

// "to KC 35 for 6 yards", "ran ob at SF 49 for 5 yards", "for 1 yard", "for no gain", "for -3 yards".
const GAIN = new RegExp(
  String.raw`(?:\b(?:to|at) ${SPOT} )?\bfor (?:(-?\d+) yards?\b|(no gain)|a loss of (\d+) yards?\b)(, TOUCHDOWN)?`,
);

/** The first "for N yards" at or after `from`, or undefined if the text has none. */
export function firstGain(text: string, from = 0): Gain | undefined {
  const start = Math.max(0, from);
  const match = GAIN.exec(text.slice(start));
  if (!match) return undefined;
  const [, side, line, fifty, yards, noGain, loss, touchdown] = match;
  return {
    yards: yards !== undefined ? Number(yards) : noGain !== undefined ? 0 : -Number(loss),
    end: spotFrom(side, line, fifty),
    reachedGoal: touchdown !== undefined,
    index: start + match.index,
  };
}

/**
 * Yards for a ball carrier, after two NFL scoring rules that the text alone
 * doesn't apply (both confirmed against ESPN's box scores):
 *
 * - Penalty at a spot: when a foul (like holding) is "enforced at" a spot
 *   between the line of scrimmage and where the run or catch ended, the
 *   player only gets yards up to that spot. "to JAX 44 for 4 yards ...
 *   Offensive Holding, enforced at JAX 42" counts as 2 yards.
 * - Fumble lost going backwards: if the other team recovers the ball behind
 *   where it was fumbled, the player only gets yards up to the recovery
 *   ("touched at" spot, if the text gives one). "to ARZ 22 for 8 yards.
 *   FUMBLES, RECOVERED by ARZ-D.Burke at ARZ 25" counts as 5 yards.
 */
export function creditedYards(main: string, gain: Gain): number {
  let yards = gain.yards;
  const afterGain = main.slice(gain.index);

  // --- Fumble lost: measure to where the other team got the ball. ------------
  if (gain.end) {
    // The first fumble after the gain, up to any second fumble.
    const [, fumble = ""] = afterGain.split(/\bFUMBLES\b/);
    const recovered = new RegExp(
      String.raw`(?:touched at ${SPOT}[^]*?)?RECOVERED by ([A-Z]{2,3})-\S+ at ${SPOT}`,
    ).exec(fumble);
    if (recovered) {
      const [, tSide, tLine, tFifty, defense, rSide, rLine, rFifty] = recovered;
      // A "touched at" spot wins over the recovery spot (that's what ESPN's
      // box score did in the one week-6 example, game 401872995).
      const lostAt = spotFrom(tSide, tLine, tFifty) ?? spotFrom(rSide, rLine, rFifty);
      if (lostAt) {
        // The recovering team is the defense, so we know which half is whose.
        const lineOfScrimmage = yardsToGoal(gain.end, defense) + yards;
        yards = Math.min(yards, lineOfScrimmage - yardsToGoal(lostAt, defense));
      }
    }
  }

  // --- Penalty enforced at a spot during the gain. ---------------------------
  // "PENALTY on JAX-E.Pregnon, Offensive Holding, 10 yards, enforced at JAX 42."
  // (Declined and offsetting penalties have no yards before "enforced", so they're skipped.)
  const penalty = new RegExp(
    String.raw`(?:PENALTY|Penalty) on [^,]+, [^,]+, \d+ yards?, enforced at ${SPOT}`,
    "g",
  );
  for (const match of afterGain.matchAll(penalty)) {
    const foul = spotFrom(match[1], match[2], match[3]);
    if (!foul) continue;
    const adjusted = yardsToFoulSpot(gain, yards, foul);
    if (adjusted !== undefined) {
      yards = adjusted;
      break;
    }
  }
  return yards;
}

/**
 * If `foul` lies between the line of scrimmage and the end of the gain, the
 * yards up to the foul; otherwise undefined. The text never says which team
 * has the ball, so both possibilities are tried: the team named in the spot
 * is defending, or it has the ball. Only one of them can put the foul inside
 * the gain; if neither (or, on a long touchdown, both) do, the yards are left
 * alone.
 */
function yardsToFoulSpot(gain: Gain, yards: number, foul: Spot): number | undefined {
  if (!gain.end && !gain.reachedGoal) return undefined;
  const named = gain.end?.side ?? foul.side;
  if (!named) return undefined;
  const answers: number[] = [];
  for (const namedIsDefending of [true, false]) {
    // Yards to the goal line, if `named` is (or isn't) the defending team.
    const toGoal = (spot: Spot) =>
      spot.side === undefined ? 50 : (spot.side === named) === namedIsDefending ? spot.line : 100 - spot.line;
    const end = gain.end ? toGoal(gain.end) : 0; // 0 = the goal line
    const lineOfScrimmage = end + yards;
    if (lineOfScrimmage < 1 || lineOfScrimmage > 99) continue; // not a real field position
    const foulAt = toGoal(foul);
    if (foulAt > end && foulAt <= lineOfScrimmage) answers.push(lineOfScrimmage - foulAt);
  }
  return answers.length === 1 ? answers[0] : undefined;
}
// ---------------------------------------------------------------------------
// Fumbles, two-point tries, names
// ---------------------------------------------------------------------------

/** One fumble or muffed catch in a play, and whether the other team got the ball. */
export interface BallLoss {
  /** "FUMBLES" (a fumble) or "MUFFS" (a muffed punt or kickoff). */
  kind: "FUMBLES" | "MUFFS";
  /** True when the other team recovered. */
  lost: boolean;
}

/**
 * Every fumble and muff in the text, in order, and whether each was lost.
 *
 * ESPN (like the NFL's official play-by-play) writes the recovery in capitals,
 * "RECOVERED by CHI-J.Blackwell", when the OTHER team recovers, and in lower
 * case, "recovered by ATL-R.Neuzil" or "and recovers", when the same team keeps
 * the ball. That held for every fumble in all 14 week-6 games. A fumble that
 * goes out of bounds is not lost.
 */
export function ballLosses(main: string): BallLoss[] {
  const events = [...main.matchAll(/\b(FUMBLES|MUFFS)\b/g)];
  return events.map((event, i) => {
    const start = (event.index ?? 0) + event[0].length;
    const end = i + 1 < events.length ? (events[i + 1].index ?? main.length) : main.length;
    const segment = main.slice(start, end);
    return { kind: event[1] as BallLoss["kind"], lost: /RECOVERED by/.test(segment) };
  });
}

/** True when a teammate (not the other team) recovered a fumble in this text. */
export function recoveredByOwnTeam(main: string): boolean {
  return /\brecovered by\b|\band recovers\b/.test(main);
}

/** What happened on a two-point try. */
export interface TwoPointResult {
  succeeded: boolean;
  /** True for a pass, false for a run. */
  isPass: boolean;
}

/**
 * Reads "TWO-POINT CONVERSION ATTEMPT. M.Penix pass to Z.Branch is complete.
 * ATTEMPT SUCCEEDS." Returns undefined when the play had no two-point try.
 * A "DEFENSIVE TWO-POINT ATTEMPT" (the defense returning the try) is ignored.
 */
export function twoPointTry(tryText: string): TwoPointResult | undefined {
  const start = tryText.indexOf("TWO-POINT CONVERSION ATTEMPT");
  if (start === -1) return undefined;
  let segment = tryText.slice(start + "TWO-POINT CONVERSION ATTEMPT".length);
  const defensive = segment.indexOf("DEFENSIVE TWO-POINT ATTEMPT");
  if (defensive !== -1) segment = segment.slice(0, defensive);
  return {
    succeeded: /ATTEMPT SUCCEEDS/.test(segment),
    isPass: /\bpass\b/.test(segment),
  };
}

/** "intended for J.Meyers INTERCEPTED by ..." -> "J.Meyers". */
export function intendedReceiverName(main: string): string | undefined {
  return new RegExp(String.raw`\bintended for (${NAME})`).exec(main)?.[1];
}

/** Each "Lateral to R.Johnson ... for 12 yards" in the text. */
export function laterals(main: string): { name: string; gain?: Gain }[] {
  const found: { name: string; gain?: Gain }[] = [];
  for (const match of main.matchAll(new RegExp(String.raw`\b[Ll]ateral to (${NAME})`, "g"))) {
    const after = (match.index ?? 0) + match[0].length;
    found.push({ name: match[1], gain: firstGain(main, after) });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Kicking
// ---------------------------------------------------------------------------

/** A field goal try: "J.Slye 44 yard field goal is GOOD" / "is No Good" / "is BLOCKED". */
export interface FieldGoal {
  /** Who kicked it, as the text names him ("J.Slye"). */
  kicker: string;
  distance: number;
  made: boolean;
}

const FIELD_GOAL = new RegExp(String.raw`(?:(${NAME}) )?(\d+) yard field goal is (GOOD|No Good|BLOCKED|Blocked)`);

export function fieldGoal(main: string): FieldGoal | undefined {
  const match = FIELD_GOAL.exec(main);
  if (!match) return undefined;
  return { kicker: match[1] ?? "", distance: Number(match[2]), made: match[3] === "GOOD" };
}

/** ESPN's distance bands: under 40, 40-49, 50-59, 60 and longer. */
export function fieldGoalBand(distance: number): "0_39" | "40_49" | "50_59" | "60" {
  if (distance < 40) return "0_39";
  if (distance < 50) return "40_49";
  if (distance < 60) return "50_59";
  return "60";
}

/**
 * The extra point after a touchdown: true if good, false if missed or blocked,
 * undefined when there was no kick (a two-point try, or no try at all).
 * Reads "S.Shrader extra point is GOOD" in the try, or ESPN's short form at
 * the end of the text: "(Will Reichard Kick)" / "(Ryan Fitzgerald PAT failed)".
 */
export function extraPoint(main: string, tryText: string): boolean | undefined {
  const long = /extra point is (GOOD|No Good|BLOCKED|Blocked)/.exec(tryText);
  if (long) return long[1] === "GOOD";
  const short = /\([^()]*? (Kick|PAT \w+)\)\s*$/.exec(main);
  if (short) return short[1] === "Kick";
  return undefined;
}

/** "...DEFENSIVE TWO-POINT ATTEMPT. ... ATTEMPT SUCCEEDS." The defense returned a try for 2. */
export function defensiveTwoPoint(tryText: string): boolean {
  const at = tryText.indexOf("DEFENSIVE TWO-POINT ATTEMPT");
  return at !== -1 && /ATTEMPT SUCCEEDS/.test(tryText.slice(at));
}

/**
 * Yards a team loses on a sack, as ESPN's box score counts them: the text's
 * "sacked at ATL 22 for -10 yards". If the QB fumbled and the ball was
 * recovered AHEAD of where he went down, the loss is measured to the recovery
 * spot instead, and is 0 if that's past the line of scrimmage. Checked against
 * the week 1-6 box scores ("sacked at ATL 2 for -8 yards ... recovered by
 * ATL-R.Neuzil at ATL 3" counts -7). A recovery further back keeps the text's
 * number; the box score sometimes differs by a yard or two there.
 */
export function sackYards(main: string): number | undefined {
  const gain = firstGain(main);
  if (!gain) return undefined;
  const [, fumble] = main.slice(gain.index).split(/\bFUMBLES\b/);
  const recovery = fumble && new RegExp(String.raw`(RECOVERED|recovered) by ([A-Z]{2,3})-\S+ at ${SPOT}`).exec(fumble);
  const spot = recovery && spotFrom(recovery[3], recovery[4], recovery[5]);
  if (!gain.end || !recovery || !spot) return gain.yards;
  // Capitals: the other team (the defense) recovered. Lower case: the offense did.
  const team = recovery[2];
  const defenseOwns = recovery[1] === "RECOVERED";
  const toGoal = (s: Spot) =>
    s.side === undefined ? 50 : (s.side === team) === defenseOwns ? s.line : 100 - s.line;
  const sackSpot = toGoal(gain.end);
  const recoveredAt = toGoal(spot);
  if (recoveredAt >= sackSpot) return gain.yards; // recovered behind where he went down
  const lineOfScrimmage = sackSpot + gain.yards; // yards is negative on a sack
  return Math.min(0, lineOfScrimmage - recoveredAt);
}
