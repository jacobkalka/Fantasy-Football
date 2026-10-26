import { describe, expect, it } from "vitest";
import { blankTeam } from "@/lib/teams/store";
import { DEFAULT_SHARE, choicesOf, snapshotChanged, snapshotTeam, toPublicTeam } from "./public-teams";

const team = {
  ...blankTeam({ id: "t_abc123", name: "Sunday Scaries", source: "espn" }),
  players: [{ playerId: "4374302", name: "Amon-Ra St. Brown", position: "WR" as const, teamId: "8", headshot: null, slot: "WR" as const }],
  espn: {
    leagueId: "99",
    season: 2026,
    teamId: 3,
    leagueName: "Office League",
    teamAbbrev: "SS",
    logo: "https://evil.example.com/logo.png",
    private: true,
    syncedAt: null,
    record: "4-2",
  },
};

describe("publishing a team", () => {
  it("shares only what was switched on, and never the league name by default", () => {
    const values = snapshotTeam(team, DEFAULT_SHARE, { season: 2026, matchup: { week: 7, opponent: "Team 2", points: 98.4, opponentPoints: 87.1 } });
    expect(values.roster).toHaveLength(1);
    expect(values.record).toBe("4-2");
    expect(values.leagueName).toBeNull();
    expect(values.matchup).toBeNull();
    // Logos from anywhere but ESPN are dropped (the database refuses them too).
    expect(values.logoUrl).toBeNull();
    const nothing = snapshotTeam(team, { roster: false, record: false, league: false, matchup: false }, { season: 2026, matchup: null });
    expect([nothing.roster, nothing.record, nothing.leagueName, nothing.matchup]).toEqual([null, null, null, null]);
  });

  it("reads share choices back from a saved team and spots changes", () => {
    const values = snapshotTeam(team, { ...DEFAULT_SHARE, league: true }, { season: 2026, matchup: null });
    const saved = toPublicTeam({ id: "1", user_id: "u", updated_at: "", ...{
      local_id: values.localId, name: values.name, logo_url: null, source: values.source, league_name: values.leagueName,
      season: values.season, record: values.record, scoring_label: values.scoringLabel, roster: values.roster, matchup: null, is_visible: true,
    } });
    expect(choicesOf(saved)).toEqual({ roster: true, record: true, league: true, matchup: false });
    expect(snapshotChanged(saved, values)).toBe(false);
    expect(snapshotChanged(saved, { ...values, record: "5-2" })).toBe(true);
  });

  it("checks other people's rows before showing them", () => {
    const shown = toPublicTeam({
      id: "1", user_id: "u", local_id: "t_x", name: "X", source: "espn", record: "<b>", logo_url: "javascript:x",
      roster: [{ id: "1", name: "A", position: "WR", slot: "WR", teamId: "1" }, { id: "x", name: "B", position: "WR", slot: "WR" }, "junk"],
      matchup: { week: 7, opponent: "Y", points: "lots", opponentPoints: 1 },
    });
    expect(shown.record).toBeNull();
    expect(shown.logoUrl).toBeNull();
    expect(shown.roster?.map((p) => p.id)).toEqual(["1"]);
    expect(shown.matchup).toBeNull();
  });
});
