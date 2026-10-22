import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Play } from "@/lib/providers/types";
import { rulesForFormat, scoreStatLine } from "@/lib/scoring";
import type { StatKey, StatLine } from "@/lib/stats";
import { parseBoxscore } from "./boxscore";
import { fantasyStatsToStatLine } from "./fantasy-ids";
import { buildNameIndex, type NameIndex } from "./names";
import {
  deltasForPlay,
  isAdministrativePlay,
  parseCorePlay,
  parseCorePlays,
  totalsFromPlays,
} from "./plays";

function load(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../../samples/${file}`, import.meta.url), "utf8"));
}

// The stats the box score has. (It has no two-point conversions.)
const BOX_KEYS: StatKey[] = [
  "passAtt", "passCmp", "passYds", "passTd", "passInt",
  "rushAtt", "rushYds", "rushTd",
  "targets", "rec", "recYds", "recTd",
  "fumLost", "retTd",
  "fgMade", "fgAtt", "fgMiss", "fgMade0_39", "fgMade40_49", "fgMade50_59", "fgMade60",
  "fgMiss0_39", "fgMiss40_49", "fgMiss50_59", "fgMiss60", "xpMade", "xpAtt", "xpMiss",
];

function pick(line: StatLine, keys: StatKey[]): StatLine {
  const out: StatLine = {};
  for (const key of keys) if (line[key]) out[key] = line[key];
  return out;
}

/** Only the players with at least one of `keys`, trimmed to those keys. */
function trimAll(lines: Record<string, StatLine>, keys: StatKey[]): Record<string, StatLine> {
  const out: Record<string, StatLine> = {};
  for (const [id, line] of Object.entries(lines)) {
    const trimmed = pick(line, keys);
    if (Object.keys(trimmed).length > 0) out[id] = trimmed;
  }
  return out;
}

// HOU 34 - JAX 31 and CHI 31 - ATL 23 (the CHI-ATL game has a 2-pt pass, a muffed
// punt lost, a sack fumble lost, a lateral and an aborted snap).
const GAMES = ["401872996", "401872999"];

describe("adding up every play gives the official box score", () => {
  for (const gameId of GAMES) {
    it(`game ${gameId}: every player, every box-score stat`, () => {
      const plays = parseCorePlays(load(`core-plays-${gameId}.json`), gameId);
      const box = parseBoxscore(load(`summary-${gameId}-final.json`));
      const official = Object.fromEntries(Object.entries(box).map(([id, line]) => [id, line.stats]));

      const fromPlays = trimAll(totalsFromPlays(plays), BOX_KEYS);
      expect(fromPlays).toEqual(trimAll(official, BOX_KEYS));
      expect(Object.keys(fromPlays).length).toBeGreaterThan(15);
    });
  }

  it("matches ESPN's fantasy feed exactly, two-point conversions included", () => {
    const totals = {
      "401872996": totalsFromPlays(parseCorePlays(load("core-plays-401872996.json"), "401872996")),
      "401872999": totalsFromPlays(parseCorePlays(load("core-plays-401872999.json"), "401872999")),
    } as Record<string, Record<string, StatLine>>;
    const PPR = rulesForFormat("ppr");
    let checked = 0;

    for (const file of ["fantasy-kona-player-info.json", "fantasy-kona-player-info-2pt.json"]) {
      const { players } = load(file) as {
        players: { player: { id: number; stats: { statSourceId: number; scoringPeriodId: number; externalId: string; appliedTotal: number; stats: Record<string, number> }[] } }[];
      };
      for (const { player } of players) {
        const week6 = player.stats.find((s) => s.statSourceId === 0 && s.scoringPeriodId === 6)!;
        const fromPlays = totals[week6.externalId][String(player.id)];
        expect(fromPlays).toEqual(fantasyStatsToStatLine(week6.stats));
        expect(scoreStatLine(fromPlays, PPR).total).toBeCloseTo(week6.appliedTotal, 2);
        checked++;
      }
    }
    expect(checked).toBe(10);
  });
});

describe("parseCorePlays", () => {
  const raw = load("core-plays-401872999.json") as { count: number; items: unknown[] };
  const plays = parseCorePlays(raw, "401872999");

  it("keeps every play, in game order", () => {
    expect(plays).toHaveLength(raw.items.length);
    expect(plays.length).toBe(raw.count);
    const sequences = plays.map((p) => p.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(plays.map((p) => p.id)).size).toBe(plays.length);
  });

  it("reads a play's fields", () => {
    const muff = plays.find((p) => p.id === "4018729991786")!;
    expect(muff).toMatchObject({
      gameId: "401872999",
      type: "Muffed Punt Recovery (Opponent)",
      period: expect.any(Number),
      clock: expect.stringMatching(/^\d+:\d\d$/),
      teamId: "3",
      participants: [
        { playerId: "4686889", role: "punter" },
        { playerId: "4240459", role: "recoverer" },
        { playerId: "4870612", role: "returner" },
      ],
    });
  });

  it("keeps timeouts and quarter breaks, with no stat changes", () => {
    const admin = plays.filter(isAdministrativePlay);
    expect(admin.length).toBeGreaterThan(5);
    expect(admin.every((p) => p.deltas.length === 0)).toBe(true);
  });

  it("reads ids from links on ESPN's internal host too", () => {
    const play = parseCorePlay(
      {
        id: "1",
        sequenceNumber: "100",
        participants: [
          { athlete: { $ref: "http://sports.core.api.espn.pvt/v2/sports/football/leagues/nfl/seasons/2026/athletes/4431611?lang=en" }, type: "rusher", order: 1 },
        ],
      },
      "g",
    );
    expect(play?.participants).toEqual([{ playerId: "4431611", role: "rusher" }]);
  });

  it("never throws on missing or odd data", () => {
    expect(parseCorePlays(undefined, "g")).toEqual([]);
    expect(parseCorePlays({ items: "nope" }, "g")).toEqual([]);
    expect(parseCorePlays({ items: [null, 5, {}, { id: "9", participants: [{}] }] }, "g")).toMatchObject([
      { id: "9", type: "", participants: [], deltas: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// One rule at a time. Every play below is a real ESPN play from week 6, copied
// from samples/core-plays-<game>.json, or (where noted) from another week-6
// game that isn't saved in samples/. Only the fields the rules use are kept.
// ---------------------------------------------------------------------------

function play(
  type: string,
  text: string,
  roles: [role: string, playerId: string][],
  extra: Partial<Play> = {},
): Play {
  return {
    id: "test",
    gameId: "test",
    sequence: 1,
    period: 1,
    clock: "15:00",
    type,
    text,
    yards: 0,
    scoring: false,
    scoreValue: 0,
    awayScore: 0,
    homeScore: 0,
    isPenalty: false,
    isTurnover: false,
    participants: roles.map(([role, playerId]) => ({ role, playerId })),
    ...extra,
  };
}

/** deltasForPlay as { playerId: stats } for easy comparing. */
function deltas(p: Play, names?: NameIndex): Record<string, StatLine> {
  return Object.fromEntries(deltasForPlay(p, names).map((d) => [d.playerId, d.stats]));
}

// Players used below (ESPN ids).
const LAWRENCE = "4360310";
const STRANGE = "4430539";
const MEYERS = "3916433";
const C_WILLIAMS = "4431611";
const PENIX = "4360423";
const BRANCH = "4870612";
const R_JOHNSON = "4426386";

describe("deltasForPlay: passing", () => {
  it("completion: attempt, completion and yards for the passer; target, catch and yards for the receiver", () => {
    const p = play("Pass Reception", "(Shotgun) T.Lawrence pass deep left to B.Strange to HST 46 for 24 yards (C.Bullock).", [
      ["passer", LAWRENCE], ["receiver", STRANGE], ["tackler", "4431517"],
    ], { yards: 24 });
    expect(deltas(p)).toEqual({
      [LAWRENCE]: { passAtt: 1, passCmp: 1, passYds: 24 },
      [STRANGE]: { targets: 1, rec: 1, recYds: 24 },
    });
  });

  it("incompletion: an attempt, and one target even though ESPN lists the receiver twice", () => {
    const p = play("Pass Incompletion", "T.Lawrence pass incomplete short middle to J.Meyers (A.Al-Shaair).", [
      ["passer", LAWRENCE], ["receiver", MEYERS], ["receiver", MEYERS], ["passDefender", "3919117"],
    ]);
    expect(deltas(p)).toEqual({ [LAWRENCE]: { passAtt: 1 }, [MEYERS]: { targets: 1 } });
  });

  it("a throwaway with no receiver is still an attempt", () => {
    const p = play("Pass Incompletion", "C.Williams pass incomplete short left.", [["passer", C_WILLIAMS]]);
    expect(deltas(p)).toEqual({ [C_WILLIAMS]: { passAtt: 1 } });
  });

  it("a spike is an attempt (game 401873003, not in samples/)", () => {
    const p = play("Pass Incompletion", "(No Huddle) D.Jones spiked the ball to stop the clock.", [["passer", "3917792"]]);
    expect(deltas(p)).toEqual({ "3917792": { passAtt: 1 } });
  });

  it("interception: attempt + interception, and a target for the intended receiver", () => {
    const p = play("Pass Interception Return", "(Shotgun) T.Lawrence pass short left intended for J.Meyers INTERCEPTED by C.Bullock at HST -6. Touchback.", [
      ["passer", LAWRENCE], ["passDefender", "4431517"], ["returner", "4431517"], ["other", MEYERS],
    ]);
    // "J.Meyers" is learned from another play in the game where he's the listed receiver.
    const names = buildNameIndex([
      play("Pass Incompletion", "(Shotgun) T.Lawrence pass incomplete deep middle to J.Meyers.", [
        ["passer", LAWRENCE], ["receiver", MEYERS], ["receiver", MEYERS],
      ]),
    ]);
    expect(deltas(p, names)).toEqual({ [LAWRENCE]: { passAtt: 1, passInt: 1 }, [MEYERS]: { targets: 1 } });
    // Without the name index the passer is still right.
    expect(deltas(p)).toEqual({ [LAWRENCE]: { passAtt: 1, passInt: 1 } });
  });

  it("sack: no passing stats at all", () => {
    const p = play("Sack", "(Shotgun) C.Williams sacked at CHI 12 for -9 yards (G.Dexter).", [
      ["passer", C_WILLIAMS], ["sackedBy", "4429014"], ["tackler", "4429014"],
    ], { yards: -9 });
    expect(deltas(p)).toEqual({});
  });

  it("touchdown pass, and the extra point goes to the kicker", () => {
    const p = play("Passing Touchdown", "(Shotgun) C.Stroud pass short right to F.Moreau for 6 yards, TOUCHDOWN. K.Fairbairn extra point is GOOD, Center-A.Brinkman, Holder-K.Kroeger.", [
      ["passer", "4432577"], ["receiver", "3843945"], ["scorer", "3843945"], ["kicker", "2971573"], ["patScorer", "2971573"],
    ], { yards: 6, scoring: true });
    expect(deltas(p)).toEqual({
      "4432577": { passAtt: 1, passCmp: 1, passYds: 6, passTd: 1 },
      "3843945": { targets: 1, rec: 1, recYds: 6, recTd: 1 },
      "2971573": { xpAtt: 1, xpMade: 1 },
    });
  });

  it("short-form touchdown text with no 'for N yards' uses ESPN's yardage (game 401872998, not in samples/)", () => {
    const p = play("Passing Touchdown", "Tommy Tremble 19 Yd pass from Bryce Young (Ryan Fitzgerald PAT failed)", [
      ["passer", "4685720"], ["receiver", "4372780"], ["patScorer", "4568263"], ["penalized", "4372780"], ["scorer", "4372780"],
    ], { yards: 19, scoring: true });
    expect(deltas(p)).toEqual({
      "4685720": { passAtt: 1, passCmp: 1, passYds: 19, passTd: 1 },
      "4372780": { targets: 1, rec: 1, recYds: 19, recTd: 1 },
      "4568263": { xpAtt: 1, xpMiss: 1 }, // "(Ryan Fitzgerald PAT failed)"
    });
  });

  it("lateral after a catch: the catch is 2 yards, the lateral's 12 go to R.Johnson and to the passer", () => {
    const p = play("Pass Reception", "(Shotgun) C.Williams pass short right to R.Odunze to ATL 40 for 2 yards. Lateral to R.Johnson pushed ob at ATL 28 for 12 yards (H.Perkins).", [
      ["passer", C_WILLIAMS], ["receiver", "4431299"], ["tackler", "4685502"], ["other", "4243253"], ["other", R_JOHNSON],
    ], { yards: 14 });
    const names = buildNameIndex([
      play("Rush", "R.Johnson up the middle to ATL 45 for 4 yards (J.Bates).", [["rusher", R_JOHNSON]]),
    ]);
    expect(deltas(p, names)).toEqual({
      [C_WILLIAMS]: { passAtt: 1, passCmp: 1, passYds: 14 },
      "4431299": { targets: 1, rec: 1, recYds: 2 },
      [R_JOHNSON]: { recYds: 12 },
    });
  });
});

describe("deltasForPlay: rushing", () => {
  it("rushing touchdown (and 'reported in as eligible' doesn't confuse it)", () => {
    const p = play("Rushing Touchdown", "B.Fisher reported in as eligible.  J.Jordan left tackle for 25 yards, TOUCHDOWN. K.Fairbairn extra point is GOOD, Center-A.Brinkman, Holder-K.Kroeger.", [
      ["rusher", "4429939"], ["scorer", "4429939"], ["kicker", "2971573"], ["patScorer", "2971573"],
    ], { yards: 25, scoring: true });
    expect(deltas(p)).toEqual({
      "4429939": { rushAtt: 1, rushYds: 25, rushTd: 1 },
      "2971573": { xpAtt: 1, xpMade: 1 },
    });
  });

  it("kneel-downs are carries with lost yards", () => {
    const p = play("Rush", "C.Williams kneels to ATL 5 for -1 yards.", [["rusher", C_WILLIAMS]], { yards: -1 });
    expect(deltas(p)).toEqual({ [C_WILLIAMS]: { rushAtt: 1, rushYds: -1 } });
  });

  it("an aborted snap is a carry for 0 yards, not ESPN's -8", () => {
    const p = play("Fumble Recovery (Own)", "(Shotgun) C.Williams FUMBLES (Aborted) at CHI 37, and recovers at CHI 34.", [
      ["rusher", C_WILLIAMS], ["recoverer", C_WILLIAMS], ["fumbler", C_WILLIAMS],
    ], { yards: -8 });
    expect(deltas(p)).toEqual({ [C_WILLIAMS]: { rushAtt: 1 } });
  });

  it("an aborted snap is 0 yards even when the QB then runs (game 401872997, not in samples/)", () => {
    const p = play("Fumble Recovery (Own)", "(Shotgun) T.Huntley FUMBLES (Aborted) at CLV 44, and recovers at CLV 43. T.Huntley to CLV 42 for 1 yard (J.Verse, M.Collins).", [
      ["rusher", "4035671"], ["assistedBy", "3040471"], ["recoverer", "4035671"], ["fumbler", "4035671"], ["other", "4578085"],
    ], { yards: -3 });
    expect(deltas(p)).toEqual({ "4035671": { rushAtt: 1 } });
  });
});

describe("deltasForPlay: penalties", () => {
  it("'No Play' means nothing counts", () => {
    const p = play("Penalty", "(Shotgun) C.Williams pass short middle to R.Odunze to ATL 42 for 24 yards (K.Daniels; M.Hughes).PENALTY on CHI-O.Trapilo, Offensive Holding, 10 yards, enforced at CHI 34 - No Play.", [
      ["passer", C_WILLIAMS], ["receiver", "4431299"], ["penalized", "4432595"],
    ], { yards: -10 });
    expect(deltas(p)).toEqual({});
  });

  it("a nullified touchdown with 'No Play' counts nothing", () => {
    const p = play("Penalty", "B.Tuten right end for 3 yards, TOUCHDOWN NULLIFIED by Penalty.PENALTY on JAX-B.Strange, Offensive Holding, 10 yards, enforced at HST 3 - No Play.", [
      ["rusher", "4882093"], ["penalized", STRANGE],
    ], { yards: -10 });
    expect(deltas(p)).toEqual({});
  });

  it("holding at a spot inside the run: yards only up to the spot (4 -> 2), not ESPN's -18", () => {
    const p = play("Rush", "B.Tuten left tackle to JAX 44 for 4 yards (K.Lassiter; A.Al-Shaair).PENALTY on JAX-E.Pregnon, Offensive Holding, 10 yards, enforced at JAX 42.", [
      ["rusher", "4882093"], ["penalized", "4608929"],
    ], { yards: -18 });
    expect(deltas(p)).toEqual({ "4882093": { rushAtt: 1, rushYds: 2 } });
  });

  it("holding at a spot inside a catch: 21 -> 5 yards for receiver and passer", () => {
    const p = play("Pass Reception", "C.Williams pass short right to K.Raymond to ATL 20 for 21 yards (J.Ivey).PENALTY on CHI-D.Wright, Offensive Holding, 10 yards, enforced at ATL 36.", [
      ["passer", C_WILLIAMS], ["receiver", "2973405"], ["tackler", "4605478"], ["penalized", "4426358"],
    ], { yards: -15 });
    expect(deltas(p)).toEqual({
      [C_WILLIAMS]: { passAtt: 1, passCmp: 1, passYds: 5 },
      "2973405": { targets: 1, rec: 1, recYds: 5 },
    });
  });

  it("works on the offense's own half too (11 -> 3)", () => {
    const p = play("Rush", "D.Swift left end pushed ob at CHI 42 for 11 yards (Av.Terrell).PENALTY on CHI-C.Loveland, Offensive Holding, 10 yards, enforced at CHI 34.", [
      ["rusher", "4259545"], ["penalized", "4723086"],
    ], { yards: -17 });
    expect(deltas(p)).toEqual({ "4259545": { rushAtt: 1, rushYds: 3 } });
  });

  it("a foul at the end of the run doesn't change the yards (game 401873006, not in samples/)", () => {
    const p = play("Rush", "(Shotgun) J.Herbert scrambles right tackle to KC 22 for 6 yards (L.Sneed).PENALTY on KC-L.Sneed, Unnecessary Roughness, 11 yards, enforced at KC 22.", [
      ["rusher", "4038941"], ["tackler", "4040432"], ["penalized", "4040432"],
    ], { yards: 6 });
    expect(deltas(p)).toEqual({ "4038941": { rushAtt: 1, rushYds: 6 } });
  });

  it("a touchdown run called back by a spot foul: yards to the spot, no TD (game 401873008, not in samples/)", () => {
    const p = play("Rush", "(Shotgun) J.McNichols left guard for 31 yards, TOUCHDOWN NULLIFIED by Penalty.PENALTY on WAS-C.Paul, Face Mask, 15 yards, enforced at SF 25.", [
      ["rusher", "3127586"], ["penalized", "4244615"],
    ], { yards: -24 });
    expect(deltas(p)).toEqual({ "3127586": { rushAtt: 1, rushYds: 6 } });
  });
});

describe("deltasForPlay: fumbles", () => {
  it("run, then fumble recovered by the other team: run yards + a fumble lost", () => {
    const p = play("Fumble Recovery (Opponent)", "R.Johnson up the middle to ATL 45 for 4 yards (J.Bates). FUMBLES (J.Bates), RECOVERED by ATL-H.Perkins at ATL 43.", [
      ["rusher", R_JOHNSON], ["fumbler", R_JOHNSON], ["forcedBy", "3919512"], ["recoverer", "4685502"], ["tackler", "3919512"], ["other", "4426412"],
    ], { yards: 0, isTurnover: true });
    expect(deltas(p)).toEqual({ [R_JOHNSON]: { rushAtt: 1, rushYds: 4, fumLost: 1 } });
  });

  it("fumble lost going backwards: yards only to the recovery spot (8 -> 5) (game 401873004, not in samples/)", () => {
    const p = play("Fumble Recovery (Opponent)", "(Shotgun) M.Stafford pass short right to T.Higbee to ARZ 22 for 8 yards (C.Simon). FUMBLES (C.Simon), RECOVERED by ARZ-D.Burke at ARZ 25. ** Injury Update: ARZ-W.Nolen has returned to the game.", [
      ["passer", "12483"], ["receiver", "2573401"], ["fumbler", "2573401"], ["forcedBy", "4429071"], ["tackler", "4429071"], ["recoverer", "4432668"],
    ], { yards: 0, isTurnover: true });
    expect(deltas(p)).toEqual({
      "12483": { passAtt: 1, passCmp: 1, passYds: 5 },
      "2573401": { targets: 1, rec: 1, recYds: 5, fumLost: 1 },
    });
  });

  it("uses the 'touched at' spot when there is one (5 -> 2) (game 401872995, not in samples/)", () => {
    const p = play("Fumble Recovery (Opponent)", "R.Shaheed left end to DEN 30 for 5 yards (N.Bonitto). FUMBLES (N.Bonitto), touched at DEN 33, RECOVERED by DEN-J.Strnad at DEN 34. SEA-E.Arroyo was injured during the play.", [
      ["rusher", "4032473"], ["fumbler", "4032473"], ["forcedBy", "4360259"], ["recoverer", "3919548"], ["tackler", "4360259"],
    ], { yards: 0, isTurnover: true });
    expect(deltas(p)).toEqual({ "4032473": { rushAtt: 1, rushYds: 2, fumLost: 1 } });
  });

  it("sack fumble recovered by the other team: a fumble lost, still no passing stats", () => {
    const p = play("Sack Opp Fumble Recovery", "(Shotgun) M.Penix sacked at ATL 14 for -8 yards (K.Gordon). FUMBLES (K.Gordon) [K.Gordon], RECOVERED by CHI-D.Bush at ATL 28. D.Bush to ATL 28 for no gain (M.Bergeron).", [
      ["forcedBy", "4361093"], ["sackedBy", "4361093"], ["passer", PENIX], ["fumbler", PENIX], ["recoverer", "4036261"], ["tackler", "4568510"],
    ], { isTurnover: true });
    expect(deltas(p)).toEqual({ [PENIX]: { fumLost: 1 } });
  });

  it("fumble recovered by a teammate isn't lost", () => {
    const p = play("Fumble Recovery (Own)", "(Shotgun) M.Penix sacked at ATL 2 for -8 yards (K.Gordon). FUMBLES (K.Gordon), recovered by ATL-R.Neuzil at ATL 3.", [
      ["passer", PENIX], ["fumbler", PENIX], ["forcedBy", "4361093"], ["sackedBy", "4361093"], ["tackler", "4361093"], ["recoverer", "4036444"],
    ], { yards: -7 });
    expect(deltas(p)).toEqual({});
  });

  it("muffed punt recovered by the kicking team is a fumble lost for the returner", () => {
    const p = play("Muffed Punt Recovery (Opponent)", "T.Taylor punts 50 yards to ATL 10, Center-S.Daly. Z.Branch MUFFS catch, RECOVERED by CHI-J.Blackwell at ATL 10.", [
      ["punter", "4686889"], ["recoverer", "4240459"], ["returner", BRANCH],
    ]);
    expect(deltas(p)).toEqual({ [BRANCH]: { fumLost: 1 } });
  });

  it("a muff the returner falls on himself isn't lost", () => {
    const p = play("Kickoff", "C.Santos kicks 63 yards from CHI 35 to ATL 2. Br.Robinson MUFFS catch, and recovers at ATL 5. Br.Robinson to ATL 19 for 14 yards (D.Hardy; J.Blackwell).PENALTY on CHI-J.Walker, Disqualification, 15 yards, enforced at ATL 19.", [
      ["kicker", "17427"], ["returner", "4241474"], ["assistedBy", "4365629"], ["assistedBy", "4240459"], ["penalized", "5160110"],
    ], { yards: -1 });
    expect(deltas(p)).toEqual({});
  });

  it("kickoff return fumbled to the other team is a fumble lost", () => {
    const p = play("Kickoff", "C.Santos kicks 62 yards from CHI 35 to ATL 3. Z.Branch to ATL 29 for 26 yards (Z.Scott). FUMBLES (Z.Scott), touched at ATL 31, RECOVERED by CHI-N.McCloud at ATL 31.", [
      ["kicker", "17427"], ["fumbler", BRANCH], ["returner", BRANCH], ["recoverer", "4036169"], ["forcedBy", "4257364"], ["tackler", "4257364"],
    ], { yards: 26 });
    expect(deltas(p)).toEqual({ [BRANCH]: { fumLost: 1 } });
  });

  it("a replay reversal wipes out the original call's fumble", () => {
    const p = play("Kickoff", "K.Fairbairn kicks 61 yards from HST 35 to JAX 4. A.Abdullah to JAX 40 for 36 yards (W.Woodaz; B.Jordan). FUMBLES (W.Woodaz), RECOVERED by HST-D.Robinson at JAX 42.The Replay Official reviewed the runner was not down by contact ruling, and the play was REVERSED.K.Fairbairn kicks 61 yards from HST 35 to JAX 4. A.Abdullah to JAX 39 for 35 yards (W.Woodaz; B.Jordan).", [
      ["kicker", "2971573"], ["returner", "2576336"], ["assistedBy", "4837286"], ["assistedBy", "4362504"],
    ], { yards: 35 });
    expect(deltas(p)).toEqual({});
  });
});

describe("deltasForPlay: kickers", () => {
  it("a made field goal counts in its distance band (under 40: 3 points in ESPN's default)", () => {
    const p = play("Field Goal Good", "K.Fairbairn 25 yard field goal is GOOD, Center-A.Brinkman, Holder-K.Kroeger.", [
      ["kicker", "2971573"], ["scorer", "2971573"], ["snapper", "4690999"], ["holder", "4570033"],
    ], { scoring: true, scoreValue: 3 });
    expect(deltas(p)).toEqual({ "2971573": { fgAtt: 1, fgMade: 1, fgMade0_39: 1 } });
  });

  it("40-49 and 60+ bands", () => {
    const fortyNine = play("Field Goal Good", " K.Fairbairn 49 yard field goal is GOOD, Center-A.Brinkman, Holder-K.Kroeger.", [
      ["kicker", "2971573"], ["scorer", "2971573"],
    ], { scoring: true, scoreValue: 3 });
    const sixty = play("Field Goal Good", "C.Little 60 yard field goal is GOOD, Center-J.Bobenmoyer, Holder-L.Cooke.", [
      ["kicker", "4686361"], ["scorer", "4686361"],
    ], { scoring: true, scoreValue: 3 });
    expect(deltas(fortyNine)["2971573"]).toMatchObject({ fgMade40_49: 1 });
    expect(deltas(sixty)["4686361"]).toMatchObject({ fgMade60: 1 });
  });

  it("a missed field goal is an attempt and a miss, by band", () => {
    const p = play("Field Goal Missed", "C.Santos 56 yard field goal is No Good, Wide Left, Center-S.Daly, Holder-T.Taylor.", [
      ["kicker", "17427"], ["snapper", "2980138"], ["holder", "4686889"],
    ]);
    expect(deltas(p)).toEqual({ "17427": { fgAtt: 1, fgMiss: 1, fgMiss50_59: 1 } });
  });

  it("a blocked field goal wiped out by a penalty counts nothing (game 401872997, not in samples/)", () => {
    const p = play("Penalty", "A.Szmyt 42 yard field goal is BLOCKED (K.Martin), Center-R.Sunahara, Holder-C.Bojorquez, RECOVERED by BLT-T.Jones at BLT 23.PENALTY on BLT-K.Martin, Defensive Offside, 5 yards, enforced at BLT 23 - No Play.", [
      ["blocker", "1"], ["penalized", "1"], ["kicker", "4258620"],
    ]);
    expect(deltas(p)).toEqual({});
  });

  it("a missed extra point is an attempt and a miss (game 401873006, not in samples/)", () => {
    const p = play("Rushing Touchdown", "(Shotgun) K.Walker up the middle for 33 yards, TOUCHDOWN. H.Butker extra point is No Good, Wide Left, Center-J.Winchester, Holder-M.Araiza.", [
      ["rusher", "1"], ["scorer", "1"], ["kicker", "3055899"], ["patScorer", "3055899"],
    ], { yards: 33, scoring: true, scoreValue: 6 });
    expect(deltas(p)["3055899"]).toEqual({ xpAtt: 1, xpMiss: 1 });
  });

  it("the short form '(Jason Myers Kick)' is a made extra point (game 401872955, not in samples/)", () => {
    const p = play("Fumble Recovery (Own)", "Eric Saubert 13 Yd pass from Sam Darnold (Jason Myers Kick)", [
      ["passer", "3912547"], ["receiver", "2975863"], ["kicker", "2473037"], ["recoverer", "2975863"], ["patScorer", "2473037"], ["scorer", "2975863"],
    ], { yards: 13, scoring: true, scoreValue: 6 });
    expect(deltas(p)["2473037"]).toEqual({ xpAtt: 1, xpMade: 1 });
  });
});

describe("deltasForPlay: two-point tries and special teams touchdowns", () => {
  it("successful 2-pt pass after a TD pass: pass2pt for the passer, rec2pt for the catcher", () => {
    const p = play("Passing Touchdown", "(Shotgun) M.Penix pass short left to K.Pitts for 10 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. M.Penix pass to Z.Branch is complete. ATTEMPT SUCCEEDS.", [
      ["passer", PENIX], ["patPasser", PENIX], ["receiver", "4360248"], ["scorer", "4360248"], ["patScorer", BRANCH],
    ], { yards: 10, scoring: true });
    expect(deltas(p)).toEqual({
      [PENIX]: { passAtt: 1, passCmp: 1, passYds: 10, passTd: 1, pass2pt: 1 },
      "4360248": { targets: 1, rec: 1, recYds: 10, recTd: 1 },
      [BRANCH]: { rec2pt: 1 },
    });
  });

  it("successful 2-pt pass after a TD run (game 401872995, not in samples/)", () => {
    const p = play("Rushing Touchdown", "(No Huddle) G.Holani right end for 1 yard, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. S.Darnold pass to R.Shaheed is complete. ATTEMPT SUCCEEDS.", [
      ["rusher", "4429835"], ["scorer", "4429835"], ["patScorer", "4032473"], ["patPasser", "3912547"],
    ], { yards: 1, scoring: true });
    expect(deltas(p)).toEqual({
      "4429835": { rushAtt: 1, rushYds: 1, rushTd: 1 },
      "3912547": { pass2pt: 1 },
      "4032473": { rec2pt: 1 },
    });
  });

  it("failed 2-pt tries give nothing, even with a sack and a defensive return (game 401873004, not in samples/)", () => {
    const p = play("Passing Touchdown", "(Shotgun) M.Stafford pass short right to B.Corum for 15 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. M.Stafford is sacked. ATTEMPT FAILS. DEFENSIVE TWO-POINT ATTEMPT. L.Collier recovered a fumble. ATTEMPT FAILS.", [
      ["passer", "12483"], ["patPasser", "12483"], ["receiver", "4429096"], ["scorer", "4429096"], ["other", "3116449"],
    ], { yards: 15, scoring: true });
    expect(deltas(p)).toEqual({
      "12483": { passAtt: 1, passCmp: 1, passYds: 15, passTd: 1 },
      "4429096": { targets: 1, rec: 1, recYds: 15, recTd: 1 },
    });
  });

  it("a blocked punt returned for a TD is a defensive score, not a return TD (game 401873003, not in samples/)", () => {
    const p = play("Blocked Punt Touchdown", "R.Sanchez punt is BLOCKED by J.Chestnut, Center-L.Rhodes, RECOVERED by TEN-O.Oladejo at IND 14. O.Oladejo for 14 yards, TOUCHDOWN. IND-R.Sanchez was injured during the play. PENALTY on TEN, Unsportsmanlike Conduct, 15 yards, enforced between downs. J.Slye extra point is GOOD, Center-M.Cox, Holder-T.Townsend.", [
      ["punter", "3914922"], ["blocker", "4431613"], ["kicker", "3124084"], ["patScorer", "3124084"], ["scorer", "4876057"], ["other", "4367567"],
    ], { yards: 14, scoring: true });
    // Only the extra point (J.Slye) counts for a player; the TD itself is the Titans D/ST's (dst.ts).
    expect(deltas(p)).toEqual({ "3124084": { xpAtt: 1, xpMade: 1 } });
  });

  // No kick or punt return TD (or offensive fumble-recovery TD) happened in
  // week 6, so these two use HAND-WRITTEN text, not ESPN's. Replace them with
  // real plays once ESPN gives us some.
  it("kick returner who scores gets a return TD (hand-written example)", () => {
    const p = play("Kickoff Return Touchdown", "HAND-WRITTEN: K.Kicker kicks 65 yards from AAA 35 to BBB 0. R.Returner for 100 yards, TOUCHDOWN.", [
      ["kicker", "1"], ["returner", "2"], ["scorer", "2"],
    ], { yards: 100, scoring: true });
    expect(deltas(p)).toEqual({ "2": { retTd: 1 } });
  });

  it("teammate who recovers a fumble and scores gets a fumble-recovery TD (hand-written example)", () => {
    const p = play("Fumble Recovery (Own)", "HAND-WRITTEN: R.Runner up the middle to BBB 1 for 9 yards. FUMBLES, recovered by AAA-L.Lineman in End Zone, TOUCHDOWN.", [
      ["rusher", "3"], ["fumbler", "3"], ["recoverer", "4"], ["scorer", "4"],
    ], { yards: 10, scoring: true });
    expect(deltas(p)).toEqual({ "3": { rushAtt: 1, rushYds: 9 }, "4": { fumRecTd: 1 } });
  });
});
