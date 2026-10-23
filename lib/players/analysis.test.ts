import { describe, expect, it } from "vitest";
import { parseTeamSchedule } from "@/lib/providers/espn/team-pages";
import { rulesForFormat, scoreStatLine } from "@/lib/scoring";
import { analyzePlayer, careerLine, gamePoints } from "./analysis";
import { fillFromSchedule } from "./profile";
import { LABEL_RULES } from "./rules";
import { sample, sampleProfile } from "./testing";
import type { PlayerProfile } from "./types";

const ids = (labels: { id: string }[]) => labels.map((l) => l.id);
const kona = sample("fantasy-kona-player-profile.json");
/** ESPN's own PPR total for a player's game (the feed is PPR league defaults). */
const espnPpr = (playerId: string, week: number) =>
  kona.players
    .find((p: { id: number }) => String(p.id) === playerId)
    .player.stats.find((s: { seasonId: number; statSourceId: number; statSplitTypeId: number; scoringPeriodId: number }) => s.seasonId === 2026 && s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId === week).appliedTotal;

describe("points per game", () => {
  it("matches ESPN's own PPR totals game by game", () => {
    for (const id of ["4362628", "3139477", "3953687", "-16012", "4430807"]) {
      for (const g of gamePoints(sampleProfile(id), "ppr")) {
        if (g.played) expect(g.points).toBeCloseTo(espnPpr(id, g.week), 1);
      }
    }
  });

  it("scores all three formats and ESPN's projection", () => {
    const week1 = gamePoints(sampleProfile("4362628"), "half")[0];
    // 2 catches: each format step is worth 0.5 a catch.
    expect(week1.allFormats).toEqual({ standard: 1.2, half: 2.2, ppr: 3.2 });
    expect(week1.points).toBe(2.2);
    expect(week1.projected).not.toBeNull();
  });
});

describe("analysis of real players", () => {
  it("Ja'Marr Chase: averages, consistency, usage and tracking numbers", () => {
    const a = analyzePlayer(sampleProfile("4362628"), "ppr");
    expect(a.sample).toEqual({ gamesPlayed: 5, gamesMissed: 0, level: "ok", note: null });
    expect(a.totals).toMatchObject({ points: 79.9, average: 15.98, last3Average: 16.73, best: { week: 2, points: 26.5 }, worst: { week: 1, points: 3.2 } });
    expect(a.consistency).toMatchObject({ thresholds: { bust: 6, useful: 12, boom: 20 }, usefulGames: 3, boomGames: 2, bustGames: 2, floor: 3.2, ceiling: 26.5, beatProjection: { beat: 2, games: 5 } });
    const usage = Object.fromEntries(a.usage.map((m) => [m.id, m.display]));
    expect(usage).toMatchObject({ targetsPerGame: "7.6", catchRate: "71%", yardsPerTarget: "7.6", receivingTd: "4", tdPerTarget: "10.5%" });
    const advanced = Object.fromEntries(a.advanced.map((m) => [m.id, m.display]));
    expect(advanced).toMatchObject({ avgDepthOfTarget: "9.1 yds", yardsPerRouteRun: "2.06", yacPerReception: "2.6", yacShare: "25%" });
    expect(Object.fromEntries(a.redZone.map((m) => [m.id, m.display]))).toMatchObject({ rzReceptionsPerGame: "1.0", rzRecTd: "2" });
    expect(ids(a.labels)).toEqual(["boomBust", "redZoneTarget"]);
  });

  it("Bijan Robinson: workhorse back, with each label's numbers and rule", () => {
    const a = analyzePlayer(sampleProfile("4430807"), "ppr");
    expect(ids(a.labels)).toEqual(["workhorse", "receivingBack", "goalLine", "efficientRunner"]);
    expect(a.labels[0].reason).toBe(`23.0 carries + targets a game (rule: ${LABEL_RULES.workhorse.rule})`);
    // A back's yards at the catch can be negative; "share after the catch" would pass 100%, so it's left out.
    expect(a.advanced.some((m) => m.id === "yacShare")).toBe(false);
  });

  it("Patrick Mahomes: starter, steady, touchdown-dependent", () => {
    const a = analyzePlayer(sampleProfile("3139477"), "ppr");
    expect(ids(a.labels)).toEqual(["depthStarter", "steady", "tdDependent", "efficientPasser"]);
    expect(a.signals.find((s) => s.id === "td-dependent")?.text).toMatch(/^45% of his PPR points came from touchdowns/);
    expect(a.trends.map((t) => [t.id, t.direction])).toEqual([["points", "down"], ["passAttempts", "steady"]]);
    expect(a.trends[0].caveat).toMatch(/small sample/);
  });

  it("Travis Kelce: falling targets and efficiency far above his career norm", () => {
    const a = analyzePlayer(sampleProfile("15847"), "ppr");
    expect(a.trends.find((t) => t.id === "targets")).toMatchObject({ last3: 3.7, season: 5.4, direction: "down" });
    expect(a.signals.map((s) => s.id)).toEqual(["injury", "tdPerTarget-above", "yardsPerTarget-hot", "volume-down", "vs-projection"]);
  });

  it("Brandon Aubrey (K): kicks by distance, and accuracy below his career", () => {
    const a = analyzePlayer(sampleProfile("3953687"), "ppr");
    const usage = Object.fromEntries(a.usage.map((m) => [m.id, m.display]));
    expect(usage).toMatchObject({ fgPct: "9/12 (75%)", fg0_39: "5/5", fg40_49: "2/2", fg50_59: "1/2", fg60: "1/3", xp: "14/15", longFg: "60 yds" });
    expect(a.signals[0]).toMatchObject({ id: "fgPct-cold", text: "His field-goal rate is 75.0% this season vs 88.2% over his career before this season: well below his norm." });
    expect(ids(a.labels)).toContain("depthStarter");
    expect(a.labels.find((l) => l.id === "depthStarter")?.reason).not.toContain("3WR");
  });

  it("Jeremiyah Love (rookie): the missed game is kept, with its opponent from the schedule", () => {
    const profile = sampleProfile("4870808");
    const a = analyzePlayer(profile, "ppr");
    expect(a.sample).toMatchObject({ gamesPlayed: 5, gamesMissed: 1 });
    expect(a.games.at(-1)).toMatchObject({ week: 6, played: false, points: null, opponentAbbr: "LAR", result: "W 18-16" });
    expect(ids(a.labels)).toEqual(["rookie", "depthStarter", "boomBust", "leadBack"]);
    expect(a.signals.map((s) => s.id)).toContain("no-track-record");
    expect(profile.nextGame).toEqual({ week: 7, date: "2026-10-25T20:05Z", opponentAbbr: "DEN", home: true });
    expect(profile.byeWeek).toBe(14);
  });

  it("Davante Adams (on IR): injury first, deep-threat role from tracking data", () => {
    const a = analyzePlayer(sampleProfile("16800"), "ppr");
    expect(a.signals[0]).toEqual({ id: "injury", tone: "caution", text: "ESPN has him on injured reserve (hamstring); its estimated return date is Nov 25." });
    expect(ids(a.labels)).toEqual(["injured", "boomBust", "targetEarner", "downfield", "routeEfficient"]);
  });

  it("Chiefs D/ST: team numbers, no player-only claims", () => {
    const profile = sampleProfile("-16012");
    const a = analyzePlayer(profile, "ppr");
    expect(profile).toMatchObject({ kind: "dst", name: "Chiefs D/ST", position: "DST", bio: null, career: [] });
    expect(a.games.map((g) => g.opponentAbbr)).toEqual(["DEN", "IND", "MIA", "LV", "LAC"]);
    expect(Object.fromEntries(a.usage.map((m) => [m.id, m.display]))).toMatchObject({ sacksPerGame: "1.6", takeawaysPerGame: "1.8", pointsAllowedPerGame: "16.6" });
    expect(ids(a.labels)).toEqual(["boomBust", "ballHawks", "stingy"]);
    expect(a.career.map((c) => [c.season, c.points, c.source])).toEqual([[2025, 88, "fantasy"], [2026, 37, "fantasy"]]);
    expect(a.unavailable[0]).toMatch(/no ESPN player page/);
  });

  it("a free agent who hasn't played: no averages, honest summary, last season's numbers", () => {
    const a = analyzePlayer(sampleProfile("15795"), "ppr");
    expect(a.sample).toEqual({ gamesPlayed: 0, gamesMissed: 0, level: "none", note: "He hasn't played a game this season." });
    expect(a.consistency).toBeNull();
    expect(a.usage).toEqual([]);
    expect(a.summary).toBe(
      "DeAndre Hopkins is a 34-year-old wide receiver who is currently a free agent, in his 13th NFL season; he was the No. 27 overall pick in 2013, out of Clemson. He hasn't played a game this season. Last season he averaged 3.9 PPR points in 17 games.",
    );
  });

  it("says 'not enough games yet' with fewer than 3 games, and skips trends and labels that need more", () => {
    const full = sampleProfile("4430807");
    const early: PlayerProfile = { ...full, games: full.games.slice(0, 2) };
    const a = analyzePlayer(early, "ppr");
    expect(a.sample.level).toBe("tiny");
    expect(a.totals.last3Average).toBeNull();
    expect(a.trends).toEqual([]);
    expect(a.summary).toContain("has played only 2 games (31.3 and 11.1 PPR points), not enough games yet to judge.");
    expect(ids(a.labels)).not.toContain("steady");
    expect(a.signals.map((s) => s.id)).toContain("tiny-sample");
  });
});

describe("non-fantasy positions", () => {
  it("says a linebacker isn't scored instead of claiming 0 points", () => {
    const qb = sampleProfile("3139477");
    const lb: PlayerProfile = { ...qb, position: null, bio: { ...qb.bio!, sourcePosition: "LB", position: null } };
    const a = analyzePlayer(lb, "ppr");
    expect(a.summary).toContain("LB isn't a fantasy position here");
    expect(a.summary).not.toMatch(/averaging/);
    expect(a.trends).toEqual([]);
    expect(a.consistency).toBeNull();
  });
});

describe("summary", () => {
  it("is 2-4 sentences built from computed numbers", () => {
    for (const id of ["4362628", "4430807", "3139477", "15847", "3953687", "4870808", "16800", "-16012", "15795", "8439"]) {
      const a = analyzePlayer(sampleProfile(id), "ppr");
      const sentences = a.summary.split(/(?<!\bNo)\.\s+(?=[A-Z0-9])/);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(4);
    }
    const chase = analyzePlayer(sampleProfile("4362628"), "ppr");
    expect(chase.summary).toBe(
      "Ja'Marr Chase is a 26-year-old wide receiver for the Bengals, in his 6th NFL season; he was the No. 5 overall pick in 2021, out of LSU. " +
        "He's averaging 16.0 PPR points over 5 games, ranging from 3.2 to 26.5; 3 of the 5 reached 12+ points, a useful WR week. " +
        "He's seeing 7.6 targets a game and catching 71% of them for 7.6 yards per target, on targets an average of 9.1 yards downfield. " +
        "His touchdown rate per target is 10.5% this season vs 7.0% over his career before this season, somewhat above his norm.",
    );
  });

  it("puts an injury in, and speaks of a D/ST as 'it'", () => {
    expect(analyzePlayer(sampleProfile("4870808"), "ppr").summary).toContain("ESPN lists him as questionable (ankle).");
    const kc = analyzePlayer(sampleProfile("-16012"), "standard").summary;
    expect(kc.startsWith("The Chiefs D/ST is averaging 7.4 standard points over 5 games")).toBe(true);
    expect(kc).toContain("It's averaging 1.6 sacks and 1.8 takeaways a game");
    expect(kc).not.toMatch(/\bhe\b|\bhis\b/i);
  });
});

describe("career points", () => {
  it("uses ESPN's official fantasy totals where they exist", () => {
    const rows = analyzePlayer(sampleProfile("4430807"), "ppr").career;
    expect(rows.map((r) => [r.season, r.source])).toEqual([[2023, "season-table"], [2024, "season-table"], [2025, "fantasy"], [2026, "fantasy"]]);
    expect(rows.find((r) => r.season === 2025)).toMatchObject({ points: 370.8, games: 17, pointsPerGame: 21.8 });
  });

  it("season-table estimates match ESPN's official 2025 totals, except the documented gaps", () => {
    const official: Record<string, number> = { "4430807": 370.8, "4362628": 313.6, "15847": 193.2, "16800": 222.9, "8439": 227.1 };
    for (const [id, points] of Object.entries(official)) {
      const season = sampleProfile(id).career.find((s) => s.season === 2025)!;
      expect(scoreStatLine(careerLine(season).line, rulesForFormat("ppr")).total).toBeCloseTo(points, 1);
    }
    // Mahomes threw two 2-point conversions the season table doesn't list (ESPN: 285.7).
    const mahomes = careerLine(sampleProfile("3139477").career.find((s) => s.season === 2025)!);
    expect(scoreStatLine(mahomes.line, rulesForFormat("ppr")).total).toBeCloseTo(281.7, 1);
    expect(mahomes.note).toMatch(/2-point passes/);
    // Aubrey made three 60+ kicks; the table only says 50+ (ESPN: 184.6).
    const aubrey = careerLine(sampleProfile("3953687").career.find((s) => s.season === 2025)!);
    expect(scoreStatLine(aubrey.line, rulesForFormat("ppr")).total).toBeCloseTo(182.6, 1);
    expect(aubrey.note).toMatch(/60\+/);
  });
});

describe("profile assembly", () => {
  it("leaves out a game still in progress", () => {
    const profile = sampleProfile("4870808");
    const schedule = sample("team-schedule-trimmed.json")["22"];
    const live = JSON.parse(JSON.stringify(schedule));
    live.events.find((e: { id: string }) => e.id === "401872991").competitions[0].status.type.state = "in";
    // Week 5 is "in progress": it must not count as a finished game.
    const games = fillFromSchedule(profile.games, parseTeamSchedule(live, "22", 2026));
    expect(games.map((g) => g.week)).not.toContain(5);
  });

  it("lists what ESPN doesn't publish, by position", () => {
    const wr = analyzePlayer(sampleProfile("4362628"), "ppr").unavailable.join(" ");
    expect(wr).toMatch(/Snap counts/);
    expect(wr).toMatch(/Red-zone targets/);
    const qb = analyzePlayer(sampleProfile("3139477"), "ppr").unavailable.join(" ");
    expect(qb).toMatch(/time to throw/);
  });
});
