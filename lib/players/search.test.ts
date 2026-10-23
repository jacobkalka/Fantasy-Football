import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTeams } from "@/lib/providers/espn/teams";
import type { Player, Position } from "@/lib/providers/types";
import { editDistance, normalize, searchPlayers } from "./search";

const p = (id: string, name: string, position: Position, teamId: string | null, percentOwned: number): Player => ({
  id,
  name,
  position,
  teamId,
  headshot: null,
  percentOwned,
});

// Real entries from ESPN's full player list (Week 7, 2026), most-rostered first like /api/players.
const PLAYERS: Player[] = [
  p("4047646", "A.J. Brown", "WR", "17", 96.4),
  p("4374302", "Amon-Ra St. Brown", "WR", "8", 99.92),
  p("3932442", "Equanimeous St. Brown", "WR", null, 0.02),
  p("4362238", "Chase Brown", "RB", "4", 98.75),
  p("4362628", "Ja'Marr Chase", "WR", "4", 99.91),
  p("3150744", "Chase McLaughlin", "K", "27", 24.35),
  p("4262921", "Justin Jefferson", "WR", "16", 99.86),
  p("4433970", "J.J. McCarthy", "QB", "19", 18.84),
  p("4567048", "Kenneth Walker III", "RB", "12", 99.86),
  p("4360423", "Michael Penix Jr.", "QB", "1", 12.94),
  p("4430878", "Jaxon Smith-Njigba", "WR", "26", 99.93),
  p("3117251", "Christian McCaffrey", "RB", "25", 99.92),
  p("4426948", "Luke McCaffrey", "WR", "28", 0.13),
  p("3139477", "Patrick Mahomes", "QB", "12", 93.25),
  p("15847", "Travis Kelce", "TE", "12", 93.37),
  p("4683062", "Xavier Worthy", "WR", "12", 76.77),
  p("4428331", "Rashee Rice", "WR", "12", 94.95),
  p("-16012", "Chiefs D/ST", "DST", "12", 70.45),
  p("-16003", "Bears D/ST", "DST", "3", 18.54),
  p("3055899", "Harrison Butker", "K", "12", 67.42),
  p("4432773", "Brian Thomas Jr.", "WR", "30", 45.2),
  p("3918298", "Josh Allen", "QB", "2", 99.9),
  p("15818", "Keenan Allen", "WR", "11", 43.02),
  p("4360248", "Kyle Pitts Sr.", "TE", "1", 80.62),
  p("4259545", "D'Andre Swift", "RB", "3", 97.11),
  p("4429795", "Jahmyr Gibbs", "RB", "8", 99.94),
  p("3121023", "Dallas Goedert", "TE", "21", 84.87),
  p("4241478", "DeVonta Smith", "WR", "21", 98.17),
  p("4432665", "Brock Bowers", "TE", "13", 99.87),
  p("4870808", "Jeremiyah Love", "RB", "22", 95.56),
  p("4036378", "Jordan Love", "QB", "9", 89.67),
  p("4241372", "Hollywood Brown", "WR", "21", 0.2),
  p("4432708", "Marvin Harrison Jr.", "WR", "34", 74.3),
  p("4612826", "Ladd McConkey", "WR", "24", 86),
  p("3116406", "Tyreek Hill", "WR", null, 31.04),
  p("2578570", "Jacoby Brissett", "QB", "22", 21.52),
  p("4890973", "Ashton Jeanty", "RB", "13", 99.69),
].sort((a, b) => (b.percentOwned ?? 0) - (a.percentOwned ?? 0));

const teams = parseTeams(JSON.parse(readFileSync("samples/teams.json", "utf8")));
const abbr = (teamId: string | null) => teams.find((t) => t.id === teamId)?.abbr ?? null;
const teamNames = (teamId: string | null) => {
  const t = teams.find((team) => team.id === teamId);
  return t ? [t.name, t.displayName, t.displayName.replace(` ${t.name}`, "")] : [];
};
const names = (query: string, limit = 40, position?: Position | "ALL") =>
  searchPlayers(PLAYERS, query, abbr, limit, { position, teamNames }).map((x) => x.name);
const first = (query: string) => names(query)[0];

describe("normalize", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalize("A.J. Brown")).toBe("aj brown");
    expect(normalize("Ja'Marr Chase")).toBe("jamarr chase");
    expect(normalize("Amon-Ra St. Brown")).toBe("amon ra st brown");
    expect(normalize("  Pénix  JR. ")).toBe("penix jr");
    expect(normalize("D’Andre")).toBe("dandre");
  });
});

describe("searchPlayers", () => {
  it("finds names written with initials, any punctuation or spacing", () => {
    for (const q of ["aj brown", "A.J. Brown", "a.j brown", "AJ BROWN", "a j brown", "ajbrown"]) expect(first(q)).toBe("A.J. Brown");
    for (const q of ["st brown", "St. Brown", "stbrown", "amon-ra", "amonra", "amon ra st"]) expect(first(q)).toBe("Amon-Ra St. Brown");
    expect(first("jamarr")).toBe("Ja'Marr Chase");
    expect(first("dandre swift")).toBe("D'Andre Swift");
    expect(first("smith-njigba")).toBe("Jaxon Smith-Njigba");
  });

  it("ignores accents and suffixes", () => {
    expect(first("Pénix")).toBe("Michael Penix Jr.");
    expect(first("michael penix")).toBe("Michael Penix Jr.");
    expect(first("kenneth walker")).toBe("Kenneth Walker III");
    expect(first("marvin harrison")).toBe("Marvin Harrison Jr.");
  });

  it("ranks exact > last name > first name > starts-with > contains, then % rostered", () => {
    expect(first("josh allen")).toBe("Josh Allen");
    expect(names("allen").slice(0, 2)).toEqual(["Josh Allen", "Keenan Allen"]);
    // "Chase" is Ja'Marr's last name and Chase Brown's first name.
    expect(names("chase").slice(0, 3)).toEqual(["Ja'Marr Chase", "Chase Brown", "Chase McLaughlin"]);
    expect(names("brown").slice(0, 4)).toEqual(["Amon-Ra St. Brown", "Chase Brown", "A.J. Brown", "Hollywood Brown"]);
    expect(names("love")).toEqual(["Jeremiyah Love", "Jordan Love"]);
    expect(first("mah")).toBe("Patrick Mahomes");
    expect(first("pat mah")).toBe("Patrick Mahomes");
    expect(names("caffrey")).toEqual(["Christian McCaffrey", "Luke McCaffrey"]);
  });

  it("matches initials after names that start the same way", () => {
    expect(names("jj").slice(0, 2)).toEqual(["J.J. McCarthy", "Justin Jefferson"]);
  });

  it("forgives small typos", () => {
    expect(first("mahomse")).toBe("Patrick Mahomes");
    expect(first("mccaffery")).toBe("Christian McCaffrey");
    expect(first("travis kelse")).toBe("Travis Kelce");
    expect(names("zzzz")).toEqual([]);
  });

  it("lists a team by abbreviation, nickname or city", () => {
    const kc = searchPlayers(PLAYERS, "KC", abbr, 40, { teamNames });
    expect(kc.length).toBe(7);
    expect(kc.every((x) => x.teamId === "12")).toBe(true);
    expect(kc[0].name).toBe("Kenneth Walker III");
    expect(names("kansas city")).toHaveLength(7);
    expect(names("chiefs")[0]).toBe("Chiefs D/ST");
  });

  it("reads filters typed into the query", () => {
    expect(names("kc wr")).toEqual(["Rashee Rice", "Xavier Worthy"]);
    expect(names("chiefs te")).toEqual(["Travis Kelce"]);
    expect(names("wr brown")).toEqual(["Amon-Ra St. Brown", "A.J. Brown", "Hollywood Brown", "Equanimeous St. Brown"]);
    expect(first("chiefs dst")).toBe("Chiefs D/ST");
    expect(first("chiefs d/st")).toBe("Chiefs D/ST");
    expect(names("dst")).toEqual(["Chiefs D/ST", "Bears D/ST"]);
    // A team word that also starts a name: team matches first, then the name match.
    expect(names("jax smith")).toContain("Jaxon Smith-Njigba");
  });

  it("filters by position and limits results", () => {
    expect(names("", 40, "TE")).toEqual(["Brock Bowers", "Travis Kelce", "Dallas Goedert", "Kyle Pitts Sr."]);
    expect(names("", 3)).toHaveLength(3);
    expect(names("brown", 40, "RB")).toEqual(["Chase Brown"]);
  });

  it("works as a drop-in for the old search (players, query, teamAbbr, limit)", () => {
    expect(searchPlayers(PLAYERS, "st brown", abbr, 1).map((x) => x.name)).toEqual(["Amon-Ra St. Brown"]);
    expect(searchPlayers(PLAYERS, "", abbr, 2)).toEqual(PLAYERS.slice(0, 2));
  });

  it("is fast on a full-size list", () => {
    const big = Array.from({ length: 30 }, (_, i) => PLAYERS.map((x) => ({ ...x, id: `${x.id}-${i}` }))).flat();
    const start = performance.now();
    for (const q of ["aj brown", "mahomse", "kc wr", "st", "chase", "zz", "jj", "mccaffery", "love", "brown"]) searchPlayers(big, q, abbr, 40, { teamNames });
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("editDistance", () => {
  it("counts a swap of two letters as one edit", () => {
    expect(editDistance("mahomse", "mahomes")).toBe(1);
    expect(editDistance("kelce", "kelse")).toBe(1);
    expect(editDistance("mccaffery", "mccaffrey")).toBe(1);
    expect(editDistance("abc", "xyz", 1)).toBe(2);
  });
});
