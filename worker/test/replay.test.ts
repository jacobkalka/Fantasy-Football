import { describe, expect, it } from "vitest";
import { playsUntil, replayGameState, replayStatusText, replayTimeline } from "../src/replay";
import { sampleDetail } from "./helpers/samples";

const detail = sampleDetail("401872996"); // HOU 34 @ JAX 31, 187 plays

describe("replay timeline", () => {
  const timeline = replayTimeline(detail.plays);

  it("places every play at its real time after the first one, never going backwards", () => {
    expect(timeline).toHaveLength(187);
    expect(timeline[0].atMs).toBe(0); // the coin toss has no time; it goes first
    const lastMinutes = timeline.at(-1)!.atMs / 60_000;
    expect(lastMinutes).toBeCloseTo(195.75, 1); // 13:32:38 → 16:48:23
    for (let i = 1; i < timeline.length; i++) expect(timeline[i].atMs).toBeGreaterThanOrEqual(timeline[i - 1].atMs);
  });

  it("counts the plays that have happened by a point in the game", () => {
    expect(playsUntil(timeline, -1)).toBe(0);
    expect(playsUntil(timeline, 0)).toBeGreaterThanOrEqual(2);
    expect(playsUntil(timeline, 60 * 60_000)).toBeGreaterThan(40);
    expect(playsUntil(timeline, Infinity)).toBe(187);
  });
});

describe("replay game state", () => {
  const timeline = replayTimeline(detail.plays);
  const started = "2026-10-22T18:00:00.000Z";

  it("shows the clock, score and possession after the plays so far", () => {
    const shown = timeline.slice(0, 100).map((t) => t.play);
    const last = shown.at(-1)!;
    const game = replayGameState(detail.game, shown, started, false);
    expect(game).toMatchObject({
      state: "in",
      period: last.period,
      clock: last.clock,
      kickoff: started,
      statusText: replayStatusText(last.period, last.clock),
      home: { score: last.homeScore },
      away: { score: last.awayScore },
      situation: { possessionTeamId: last.teamId },
    });
  });

  it("starts 0-0 at 15:00 of the 1st and ends with the real final", () => {
    expect(replayGameState(detail.game, [], started, false)).toMatchObject({
      period: 1,
      clock: "15:00",
      home: { score: 0 },
      away: { score: 0 },
      statusText: "15:00 - 1st · Replay",
    });
    const final = replayGameState(detail.game, detail.plays, started, true);
    expect(final).toMatchObject({ state: "post", home: { score: 31 }, away: { score: 34 }, statusText: "Final · Replay" });
  });

  it("labels overtime", () => {
    expect(replayStatusText(5, "8:41")).toBe("8:41 - OT · Replay");
  });
});
