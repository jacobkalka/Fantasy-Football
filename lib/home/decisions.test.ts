import { describe, expect, it } from "vitest";
import type { PlayerGame, PlayerLive } from "@/lib/live/types";
import type { RosterPlayer, Slot } from "@/lib/roster/lineup";
import type { Position } from "@/lib/providers/types";
import { lineupDecisions } from "./decisions";

const game = (state: PlayerGame["state"] = "pre"): PlayerGame => ({
  id: "g1",
  state,
  statusText: "",
  period: 0,
  clock: "",
  kickoff: "2026-10-25T17:00:00Z",
  isHome: true,
  teamId: "1",
  opponentId: "2",
  teamScore: 0,
  opponentScore: 0,
  hasBall: false,
  isRedZone: false,
});

function player(id: string, position: Position, slot: Slot): RosterPlayer {
  return { playerId: id, name: `Player ${id}`, position, teamId: "1", headshot: null, slot };
}

function live(id: string, position: Position, extra: Partial<PlayerLive> = {}): PlayerLive {
  return {
    playerId: id,
    name: `Player ${id}`,
    position,
    teamId: "1",
    game: game(),
    onBye: false,
    stats: {},
    points: 0,
    playPoints: 0,
    correction: 0,
    projection: 10,
    liveProjection: null,
    scoringSupported: true,
    ...extra,
  };
}

const full: RosterPlayer[] = [
  player("qb", "QB", "QB"),
  player("rb1", "RB", "RB"),
  player("rb2", "RB", "RB"),
  player("wr1", "WR", "WR"),
  player("wr2", "WR", "WR"),
  player("te", "TE", "TE"),
  player("flex", "WR", "FLEX"),
  player("k", "K", "K"),
  player("dst", "DST", "DST"),
  player("bench-rb", "RB", "BENCH"),
];

function liveMap(over: Record<string, Partial<PlayerLive>> = {}) {
  return new Map(full.map((p) => [p.playerId, live(p.playerId, p.position, over[p.playerId])]));
}

describe("lineup decisions", () => {
  it("is quiet when nothing needs doing", () => {
    expect(lineupDecisions(full, liveMap())).toEqual([]);
  });

  it("flags a starter on bye first, and offers the best bench player", () => {
    const out = lineupDecisions(full, liveMap({ rb1: { onBye: true, game: null }, "bench-rb": { projection: 8 } }));
    expect(out[0]).toMatchObject({ urgency: "high", compare: ["rb1", "bench-rb"] });
    expect(out[0].title).toContain("on bye");
  });

  it("suggests a bench player only when he projects clearly higher", () => {
    expect(lineupDecisions(full, liveMap({ "bench-rb": { projection: 11 } }))).toEqual([]);
    const out = lineupDecisions(full, liveMap({ "bench-rb": { projection: 14 } }));
    expect(out.map((d) => d.urgency)).toContain("medium");
    // One suggestion for the bench player, not one per spot he could fill.
    expect(out.filter((d) => d.id.startsWith("upgrade"))).toHaveLength(1);
    expect(out.find((d) => d.id.startsWith("upgrade"))?.compare).toEqual(expect.arrayContaining(["bench-rb"]));
  });

  it("ignores players whose games have started (their spots are locked)", () => {
    expect(lineupDecisions(full, liveMap({ rb1: { injuryStatus: "OUT", game: game("in") } }))).toEqual([]);
  });

  it("reports empty starting spots", () => {
    const out = lineupDecisions(full.filter((p) => p.playerId !== "te"), liveMap());
    expect(out[0]).toMatchObject({ id: "empty-TE", urgency: "high" });
  });

  it("ranks ruled-out above doubtful above questionable", () => {
    const out = lineupDecisions(
      full,
      liveMap({ wr1: { injuryStatus: "QUESTIONABLE" }, wr2: { injuryStatus: "DOUBTFUL" }, te: { injuryStatus: "OUT" } }),
    );
    expect(out.map((d) => d.urgency)).toEqual(["high", "medium", "low"]);
  });
});
