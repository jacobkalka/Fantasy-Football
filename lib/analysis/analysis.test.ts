import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlayerUniverse } from "@/lib/providers/espn/universe";
import { MAX_ROSTER, STARTING_SLOTS } from "@/lib/roster/lineup";
import {
  DEFAULT_LEAGUE,
  evaluateTrade,
  findWeaknesses,
  GRADE_KEYS,
  isLikelyAvailable,
  leagueModel,
  leagueSettings,
  optimalLineup,
  playerImpact,
  rateTeam,
  ratingAnchors,
  rosterSize,
  scoreUniverse,
  suggestPickups,
  suggestTrades,
  xppg,
  type Universe,
} from "./index";
import { anchored, tradeLetter } from "./scale";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));
// Real ESPN data: the 650 most-rostered players in week 7 of 2026 (weeks 1-6 final, Thursday's game played).
const raw = parsePlayerUniverse(sample("fantasy-universe-week7.json"), sample("fantasy-pro-team-schedules.json"), 2026, 7);
const ppr = scoreUniverse(raw, "ppr");
const twelve = leagueSettings({ teams: 12 });

const player = (name: string, universe: Universe = ppr) => {
  const p = universe.players.find((x) => x.name === name);
  if (!p) throw new Error(`${name} not in sample`);
  return p;
};
const ids = (names: string[]) => names.map((n) => player(n).id);

// A realistic 16-man roster of real players.
const ROSTER = [
  "Joe Burrow",
  "Bijan Robinson",
  "Chase Brown",
  "Ja'Marr Chase",
  "Garrett Wilson",
  "Sam LaPorta",
  "Zay Flowers",
  "Brandon Aubrey",
  "Steelers D/ST",
  "Jordan Mason",
  "Rhamondre Stevenson",
  "Rome Odunze",
  "Jakobi Meyers",
  "Dallas Goedert",
  "Tyler Shough",
  "Kyle Monangai",
];

describe("league settings", () => {
  it("defaults match the app's lineup rules", () => {
    expect(DEFAULT_LEAGUE.teams).toBe(12);
    expect(DEFAULT_LEAGUE.slots).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 });
    expect(DEFAULT_LEAGUE.bench).toBe(MAX_ROSTER - STARTING_SLOTS.length);
    expect(rosterSize(DEFAULT_LEAGUE)).toBe(MAX_ROSTER);
  });

  it("fixes impossible values", () => {
    const s = leagueSettings({ teams: 13 as never, format: "nope" as never, bench: -2 });
    expect(s.teams).toBe(12);
    expect(s.format).toBe("ppr");
    expect(s.bench).toBe(7);
    expect(leagueSettings({ teams: 16 }).teams).toBe(16);
  });
});

describe("scored universe", () => {
  it("scores with the app's engine in each format", () => {
    const half = scoreUniverse(raw, "half");
    const standard = scoreUniverse(raw, "standard");
    const name = "Ja'Marr Chase";
    expect(player(name).seasonPoints).toBeGreaterThan(player(name, half).seasonPoints);
    expect(player(name, half).seasonPoints).toBeGreaterThan(player(name, standard).seasonPoints);
    // Kickers and defenses score the same in every format.
    expect(player("Steelers D/ST").ros!.points).toBe(player("Steelers D/ST", standard).ros!.points);
  });

  it("uses only finished weeks for results and drops this week's game from rest of season once it's played", () => {
    expect(ppr.throughWeek).toBe(6);
    const maye = player("Drake Maye"); // played Thursday of week 7
    expect(maye.games.every((g) => g.week <= 6)).toBe(true);
    expect(maye.ros!.teamGames).toBe(10);
    expect(maye.ros!.games).toBe(10);
    const gibbs = player("Jahmyr Gibbs"); // hasn't played week 7 yet
    expect(gibbs.ros!.teamGames).toBe(12);
  });

  it("says why a player has no rest-of-season points", () => {
    expect(player("Davante Adams").rosNote).toMatch(/doesn't project him to score again.*injured reserve/);
    expect(xppg(player("Davante Adams"))).toBe(0);
  });
});

describe("league model", () => {
  it("sets starters per position with a FLEX share, and replacement falls as leagues grow", () => {
    const m12 = leagueModel(ppr, twelve);
    expect(m12.startersAt.QB).toBe(12);
    expect(m12.startersAt.RB + m12.startersAt.WR + m12.startersAt.TE).toBe(12 * 6);
    expect(m12.startersAt.RB).toBeGreaterThanOrEqual(24);
    const m8 = leagueModel(ppr, leagueSettings({ teams: 8 }));
    const m16 = leagueModel(ppr, leagueSettings({ teams: 16 }));
    for (const pos of ["QB", "RB", "WR", "TE"] as const) {
      expect(m8.replacement[pos]).toBeGreaterThan(m12.replacement[pos]);
      expect(m12.replacement[pos]).toBeGreaterThan(m16.replacement[pos]);
    }
    expect(m12.likelyRosteredCount).toBe(192);
  });

  it("gives the most valuable player 100 and stars more than two average players", () => {
    const m = leagueModel(ppr, twelve);
    expect(Math.max(...m.marketValue.values())).toBe(100);
    const [star, mid] = [m.ranked.RB[1], m.ranked.RB[11]];
    // On points above waiver level, RB2 is worth less than two RB12s; the curve makes him worth more.
    expect(xppg(star) - m.waiver.RB).toBeLessThan(2 * (xppg(mid) - m.waiver.RB));
    expect(m.marketValue.get(star.id)!).toBeGreaterThan(2 * m.marketValue.get(mid.id)!);
  });
});

describe("optimal lineup", () => {
  const roster = ["Josh Allen", "Joe Burrow", "Bijan Robinson", "Kyle Monangai", "Jordan Mason", "Rhamondre Stevenson", "Ja'Marr Chase", "Zay Flowers", "Jakobi Meyers", "Garrett Wilson", "Sam LaPorta", "Brandon Aubrey", "Steelers D/ST"].map((n) => player(n));

  it("this week: byes and Out/IR players sit, the next best player starts", () => {
    const lineup = optimalLineup(roster, twelve, "week", 7);
    const at = (slot: string) => lineup.starters.filter((s) => s.slot === slot).map((s) => s.player?.name);
    expect(at("QB")).toEqual(["Joe Burrow"]); // Josh Allen is on bye in week 7
    expect(at("RB")).toEqual(["Bijan Robinson", "Rhamondre Stevenson"]); // Monangai out, Mason on IR
    expect(at("FLEX")).toEqual(["Garrett Wilson"]); // Meyers is on bye; QBs can't play FLEX
    const reasons = Object.fromEntries(lineup.bench.map((b) => [b.player.name, b.reason]));
    expect(reasons).toMatchObject({ "Josh Allen": "Bye week", "Kyle Monangai": "Out", "Jordan Mason": "Injured reserve", "Jakobi Meyers": "Bye week" });
  });

  it("rest of season: starts the best expected points per game", () => {
    const lineup = optimalLineup(roster, twelve, "ros", 7);
    expect(lineup.starters.find((s) => s.slot === "QB")!.player!.name).toBe("Josh Allen");
    const flexPos = lineup.starters.find((s) => s.slot === "FLEX")!.player!.position;
    expect(["RB", "WR", "TE"]).toContain(flexPos);
  });

  it("leaves a slot empty when nobody can fill it", () => {
    const lineup = optimalLineup([player("Joe Burrow")], twelve, "week", 7);
    expect(lineup.starters.filter((s) => s.player === null)).toHaveLength(8);
  });
});

describe("team rating", () => {
  it("scale anchors: replacement-level ≈ 0, average = 50, best possible ≈ 100", () => {
    expect(anchored(0, 0, 30, 70)).toBe(0);
    expect(anchored(30, 0, 30, 70)).toBe(50);
    expect(anchored(70, 0, 30, 70)).toBe(100);
    for (const teams of [8, 12, 16] as const) {
      const s = leagueSettings({ teams });
      const m = leagueModel(ppr, s);
      const best = (["QB", "RB", "WR", "TE", "K", "DST"] as const).flatMap((p) =>
        m.ranked[p].slice(0, s.slots[p] + (p === "RB" || p === "WR" ? 1 : 0)).map((x) => x.id),
      );
      const replacement = (["QB", "RB", "WR", "TE", "K", "DST"] as const).flatMap((p) =>
        m.ranked[p].slice(m.startersAt[p], m.startersAt[p] + s.slots[p] + (p === "WR" ? 1 : 0)).map((x) => x.id),
      );
      expect(rateTeam(best, ppr, s).overall).toBeGreaterThan(90);
      expect(rateTeam(replacement, ppr, s).overall).toBeLessThan(5);
      const a = ratingAnchors(ppr, s);
      expect(a.starters.avg).toBeGreaterThan(0);
      expect(a.starters.best).toBeGreaterThan(a.starters.avg);
    }
  });

  it("a team of mid-tier real starters lands near average", () => {
    const m = leagueModel(ppr, twelve);
    const mid = (pos: "QB" | "RB" | "WR" | "TE" | "K" | "DST", i: number) => m.ranked[pos][i].id;
    const team = [mid("QB", 6), mid("RB", 6), mid("RB", 18), mid("WR", 6), mid("WR", 18), mid("WR", 30), mid("TE", 6), mid("K", 6), mid("DST", 6)];
    const rating = rateTeam(team, ppr, twelve).overall;
    expect(rating).toBeGreaterThan(35);
    expect(rating).toBeLessThan(60);
  });

  it("rates the realistic roster with a graded, explained breakdown", () => {
    const r = rateTeam(ids(ROSTER), ppr, twelve);
    expect(r.overall).toBeGreaterThan(50);
    expect(r.overall).toBeLessThan(75);
    expect(r.parts.weights).toEqual({ STARTERS: 0.85, DEPTH: 0.15 });
    expect(r.overall).toBeCloseTo(0.85 * r.parts.starters + 0.15 * r.parts.depth!, 0);
    expect(Object.keys(r.grades).sort()).toEqual([...GRADE_KEYS].sort());
    for (const g of Object.values(r.grades)) expect(g.why.length).toBeGreaterThan(20);
    expect(r.grades.RB.why).toContain("Bijan Robinson");
    expect(r.grades.UPSIDE.score).not.toBeNull();
    expect(r.thisWeek.lineup.bench.find((b) => b.player.name === "Jakobi Meyers")!.reason).toBe("Bye week");
    expect(r.method.length).toBeGreaterThan(3);
  });

  it("the same roster rates higher in a bigger league (replacement players are worse)", () => {
    const small = rateTeam(ids(ROSTER), ppr, leagueSettings({ teams: 8 })).overall;
    const big = rateTeam(ids(ROSTER), ppr, leagueSettings({ teams: 16 })).overall;
    expect(big).toBeGreaterThan(small);
  });

  it("upside and consistency say 'not enough games yet' early in the season", () => {
    const early: Universe = { ...ppr, throughWeek: 2, players: ppr.players.map((p) => ({ ...p, games: p.games.slice(0, 2) })) };
    const r = rateTeam(ids(ROSTER), early, twelve);
    expect(r.grades.UPSIDE.score).toBeNull();
    expect(r.grades.CONSISTENCY.score).toBeNull();
    expect(r.grades.UPSIDE.why).toMatch(/Not enough games yet/);
  });

  it("reports roster players it can't analyze instead of guessing", () => {
    const r = rateTeam([...ids(ROSTER.slice(0, 15)), { playerId: "999999", name: "Nobody Special", position: "WR" }], ppr, twelve);
    expect(r.missing).toEqual([expect.objectContaining({ id: "999999", name: "Nobody Special" })]);
    expect(r.missing[0].reason).toMatch(/no projection/);
  });
});

describe("weaknesses", () => {
  const weakRb = ROSTER.map((n) => (n === "Bijan Robinson" ? "Braelon Allen" : n === "Chase Brown" ? "Tyrone Tracy Jr." : n));

  it("ranks a gutted RB room first, with numbers and a target", () => {
    const list = findWeaknesses(ids(weakRb), ppr, twelve);
    expect(list[0]).toMatchObject({ area: "RB", priority: "High" });
    expect(list[0].why).toMatch(/pts\/game short of an average team/);
    expect(list[0].fix!.positions).toEqual(["RB"]);
    expect(list[0].fix!.targetPerGame).toBeGreaterThan(11.6);
    expect(list[0].fix!.text).toMatch(/an RB who projects/);
    expect(list[0].gainPerGame).toBeGreaterThan(3);
  });

  it("flags an empty starting spot as High", () => {
    const noKicker = ROSTER.filter((n) => n !== "Brandon Aubrey");
    const k = findWeaknesses(ids(noKicker), ppr, twelve).find((w) => w.area === "K")!;
    expect(k.priority).toBe("High");
    expect(k.title).toMatch(/No kicker/);
  });
});

describe("trade evaluation", () => {
  // Strong WRs, one good RB and nothing behind him.
  const thinRb = ["Joe Burrow", "Bijan Robinson", "Braelon Allen", "Tyrone Tracy Jr.", "Ja'Marr Chase", "Zay Flowers", "Chris Olave", "Garrett Wilson", "Rome Odunze", "Sam LaPorta", "Brandon Aubrey", "Steelers D/ST", "Tyler Shough", "Dallas Goedert", "Jakobi Meyers", "Colby Parkinson"];

  it("grades badly a trade that brings in more raw points but weakens the team", () => {
    const give = player("Bijan Robinson");
    const get = player("Puka Nacua");
    expect(xppg(get)).toBeGreaterThan(xppg(give));
    const t = evaluateTrade(ids(thinRb), [give.id], [get.id], ppr, twelve);
    expect(t.ok).toBe(true);
    expect(t.verdict).toBe("weakens");
    expect(t.ratingChange).toBeLessThan(-2);
    expect(["D", "D-", "F"]).toContain(t.grade);
    expect(t.why.join(" ")).toMatch(/more points per game than Bijan Robinson .*doesn't help you/);
    expect(t.positions.find((p) => p.slot === "RB")!.perGameChange).toBeLessThan(-5);
  });

  it("handles a 1-for-2: drops the player your team misses least, and says so", () => {
    const t = evaluateTrade(ids(ROSTER), [player("Chase Brown").id], ids(["Derrick Henry", "Trey McBride"]), ppr, twelve);
    expect(t.dropped).toHaveLength(1);
    expect(t.dropped[0].name).toBe("Rome Odunze");
    expect(t.after.restOfSeason.lineup.starters.length + t.after.restOfSeason.lineup.bench.length).toBe(16);
    expect(t.why.join(" ")).toMatch(/you'd drop Rome Odunze/);
    expect(t.verdict).toBe("improves");
    expect(t.market.note).toMatch(/they may say no/);
  });

  it("handles a 2-for-1: an open roster spot", () => {
    const t = evaluateTrade(ids(ROSTER), ids(["Garrett Wilson", "Rhamondre Stevenson"]), [player("Derrick Henry").id], ppr, twelve);
    expect(t.openSpots).toBe(1);
    expect(t.dropped).toHaveLength(0);
    expect(t.why.join(" ")).toMatch(/1 open roster spot/);
  });

  it("refuses impossible trades with a reason", () => {
    const t = evaluateTrade(ids(ROSTER), [player("Puka Nacua").id], [player("Derrick Henry").id], ppr, twelve);
    expect(t.ok).toBe(false);
    expect(t.error).toMatch(/on your roster/);
  });

  it("letter grades follow the rating change", () => {
    expect(tradeLetter(6)).toBe("A+");
    expect(tradeLetter(0)).toBe("C");
    expect(tradeLetter(-4)).toBe("F");
  });
});

describe("trade suggestions", () => {
  const weakRb = ROSTER.map((n) => (n === "Bijan Robinson" ? "Braelon Allen" : n === "Chase Brown" ? "Tyrone Tracy Jr." : n));

  it("only suggests fair trades that make this team better at a weak spot, with likely-rostered targets", () => {
    const m = leagueModel(ppr, twelve);
    const result = suggestTrades(ids(weakRb), ppr, twelve);
    expect(result.note).toMatch(/targets to ask about/);
    expect(result.targeted[0].area).toBe("RB");
    expect(result.suggestions.length).toBeGreaterThan(0);
    const mine = new Set(ids(weakRb));
    for (const s of result.suggestions) {
      expect(s.ratingChange).toBeGreaterThanOrEqual(1);
      expect(s.evaluation.verdict).toBe("improves");
      const give = s.give.reduce((t, p) => t + p.value, 0);
      const get = s.get.reduce((t, p) => t + p.value, 0);
      expect(give).toBeGreaterThanOrEqual(0.9 * get - 0.1);
      expect(give).toBeLessThanOrEqual(1.3 * get + 0.1);
      for (const p of s.get) {
        expect(mine.has(p.id)).toBe(false);
        expect(isLikelyAvailable(m, p.id)).toBe(false);
      }
      expect(s.fixes).toMatch(/RB weakness/);
      expect(s.balance).toMatch(/Trade value/);
    }
  });
});

describe("pickups", () => {
  // Burrow at QB, but a weak tight end.
  const weakTe = ROSTER.map((n) => (n === "Sam LaPorta" ? "Gunnar Helm" : n === "Dallas Goedert" ? "Daniel Bellinger" : n));

  it("prefers a starter at the weak spot over the best raw player available", () => {
    const m = leagueModel(ppr, twelve);
    const result = suggestPickups(ids(weakTe), ppr, twelve);
    const firstTe = result.pickups.findIndex((p) => p.player.position === "TE");
    expect(firstTe).toBeGreaterThanOrEqual(0);
    expect(result.pickups[firstTe]).toMatchObject({ kind: "starter", atWeakSpot: true, spot: "TE" });
    // The best available raw projection is a quarterback who wouldn't start for this team.
    const bestRaw = ppr.players
      .filter((p) => isLikelyAvailable(m, p.id) && !ids(weakTe).includes(p.id))
      .sort((a, b) => xppg(b) - xppg(a))[0];
    expect(bestRaw.position).not.toBe("TE");
    expect(xppg(bestRaw)).toBeGreaterThan(result.pickups[firstTe].player.perGame!);
    const rawIndex = result.pickups.findIndex((p) => p.player.id === bestRaw.id);
    expect(rawIndex === -1 || rawIndex > firstTe).toBe(true);
    for (const p of result.pickups) {
      expect(isLikelyAvailable(m, p.player.id)).toBe(true);
      expect(p.availability).toMatch(/probably available/);
      expect(p.reasons[0]).toMatch(/Projects/);
    }
    expect(result.method).toMatch(/192 most-rostered/);
  });

  it("skips players you've marked as taken", () => {
    const first = suggestPickups(ids(weakTe), ppr, twelve).pickups[0];
    const again = suggestPickups(ids(weakTe), ppr, twelve, { taken: [first.player.id] });
    expect(again.pickups.some((p) => p.player.id === first.player.id)).toBe(false);
  });

  it("leaves out a trend reason when there aren't enough games for it", () => {
    for (const p of suggestPickups(ids(weakTe), ppr, twelve, { limit: 20 }).pickups) {
      const games = player(p.player.name).games.length;
      if (games < 4) expect(p.reasons.join(" ")).not.toMatch(/last 3 games/);
    }
  });
});

describe("player impact", () => {
  it("says where a new player would play and how the rating changes", () => {
    const impact = playerImpact(player("Brock Bowers").id, ids(ROSTER), ppr, twelve);
    expect(impact.verdict).toBe("improves");
    expect(impact.spot).toEqual({ restOfSeason: "TE", thisWeek: "TE" });
    expect(impact.replaces!.name).toBe("Sam LaPorta");
    expect(impact.drop).not.toBeNull();
    expect(impact.answer).toMatch(/^Yes/);
  });

  it("explains a player already on the team", () => {
    const impact = playerImpact(player("Bijan Robinson").id, ids(ROSTER), ppr, twelve);
    expect(impact.onRoster).toBe(true);
    expect(impact.answer).toMatch(/already on your team/);
  });

  it("is honest about an unknown player", () => {
    expect(playerImpact("424242424", ids(ROSTER), ppr, twelve).answer).toMatch(/can't tell/);
  });
});
