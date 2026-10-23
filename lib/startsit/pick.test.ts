import { describe, expect, it } from "vitest";
import type { RosterPlayer, Slot } from "@/lib/roster/lineup";
import type { Position } from "@/lib/providers/types";
import { defaultPick, idsFromUrl, pickFromUrl, togglePick } from "./pick";

const p = (playerId: string, position: Position, slot: Slot): RosterPlayer => ({
  playerId,
  name: `P${playerId}`,
  position,
  teamId: "1",
  headshot: null,
  slot,
});

describe("defaultPick", () => {
  it("compares a bench player with the starter at the same position", () => {
    const roster = [p("1", "QB", "QB"), p("2", "WR", "WR"), p("3", "RB", "BENCH"), p("4", "RB", "RB"), p("5", "WR", "BENCH")];
    expect(defaultPick(roster)).toEqual(["4", "3"]);
  });

  it("falls back to two players at one position, then any two", () => {
    expect(defaultPick([p("1", "QB", "QB"), p("2", "WR", "WR"), p("3", "WR", "FLEX")])).toEqual(["2", "3"]);
    expect(defaultPick([p("1", "QB", "QB"), p("2", "WR", "WR")])).toEqual(["1", "2"]);
  });

  it("never picks kickers or defenses", () => {
    expect(defaultPick([p("-16012", "DST", "DST"), p("9", "K", "K"), p("1", "TE", "TE")])).toEqual(["1"]);
    expect(defaultPick([])).toEqual([]);
  });
});

describe("pickFromUrl / togglePick", () => {
  const roster = [p("1", "QB", "QB"), p("2", "WR", "WR"), p("3", "WR", "BENCH"), p("4", "K", "K"), p("5", "TE", "TE")];

  it("keeps only comparable players still on the roster, at most 3", () => {
    expect(pickFromUrl("2,99,4,2,3,5,1", roster)).toEqual(["2", "3", "5"]);
    expect(pickFromUrl(null, roster)).toEqual([]);
  });

  it("adds and removes, up to 3", () => {
    expect(togglePick(["1"], "2")).toEqual(["1", "2"]);
    expect(togglePick(["1", "2"], "1")).toEqual(["2"]);
    expect(togglePick(["1", "2", "3"], "5")).toEqual(["1", "2", "3"]);
  });
});

describe("idsFromUrl", () => {
  it("keeps any player ids, unique, at most three, and drops junk", () => {
    expect(idsFromUrl("3915416, 4362628,3915416,abc,,-16012,99")).toEqual(["3915416", "4362628", "-16012"]);
    expect(idsFromUrl(null)).toEqual([]);
  });
});
