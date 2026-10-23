import { describe, expect, it } from "vitest";
import type { Roster } from "./lineup";
import { decodeTeam, encodeTeam, teamCodeFrom, teamLink } from "./share";

const roster: Roster = {
  version: 1,
  name: "Sunday Scaries",
  format: "half",
  updatedAt: "2026-10-20T12:00:00.000Z",
  players: [
    { playerId: "4362628", name: "A", position: "QB", teamId: "1", headshot: null, slot: "QB" },
    { playerId: "-16012", name: "B", position: "DST", teamId: "12", headshot: null, slot: "BENCH" },
  ],
};

describe("team links", () => {
  it("round-trips a roster through a link", () => {
    const link = teamLink(roster, "https://example.app");
    expect(link.startsWith("https://example.app/team/import?t=")).toBe(true);
    const code = teamCodeFrom(link);
    expect(code).toBe(encodeTeam(roster));
    expect(decodeTeam(code!)).toEqual({
      name: "Sunday Scaries",
      format: "half",
      players: [
        { playerId: "4362628", slot: "QB" },
        { playerId: "-16012", slot: "BENCH" },
      ],
    });
  });

  it("finds the code in pasted text with extra words around the link", () => {
    const text = `My team on FantasyLab: ${teamLink(roster, "https://x.app")}&utm=1 `;
    expect(teamCodeFrom(text)).toBe(encodeTeam(roster));
  });

  it("accepts a bare code", () => {
    expect(teamCodeFrom(`  ${encodeTeam(roster)}\n`)).toBe(encodeTeam(roster));
  });

  it("rejects text that isn't a team", () => {
    expect(teamCodeFrom("hello")).toBeNull();
    expect(teamCodeFrom("https://x.app/team/import?t=not_a_team_code")).toBeNull();
    expect(teamCodeFrom("")).toBeNull();
  });
});
