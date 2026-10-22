import { describe, expect, it } from "vitest";
import { explainPayload, isGrounded, readClaudeText, SYSTEM_PROMPT, userPrompt } from "./explain";
import { decide } from "./model";
import type { PlayerFactors, StartSitResult } from "./types";

const factors = (o: Partial<PlayerFactors>): PlayerFactors => ({
  playerId: "1",
  name: "Ja'Marr Chase",
  position: "WR",
  teamId: "4",
  teamAbbr: "CIN",
  headshot: null,
  unavailable: null,
  injuryStatus: "ACTIVE",
  projection: 18.24,
  recent: [],
  matchup: { opponentId: "6", opponentAbbr: "DAL", rank: 29, teams: 32, allowedPerGame: 35.1, leagueAverage: 31.8, games: 6 },
  vegas: null,
  weather: { indoor: true },
  game: { id: "g", kickoff: "2026-10-25T17:00Z", state: "pre", isHome: false, opponentAbbr: "DAL" },
  ...o,
});

function result(): StartSitResult {
  const { players, recommendation } = decide(
    [factors({}), factors({ playerId: "2", name: "Jaylen Waddle", teamAbbr: "MIA", projection: 12.1, injuryStatus: "QUESTIONABLE" })],
    "ppr",
  );
  return { season: 2026, week: 7, format: "ppr", players, recommendation, aiAvailable: true, generatedAt: "2026-10-22T00:00:00Z" };
}

describe("explainPayload", () => {
  it("sends only the facts: names, numbers (1 decimal), confidence and the reasons", () => {
    const payload = explainPayload(result())!;
    expect(payload).toMatchObject({ week: 7, scoring: "PPR", pick: "Ja'Marr Chase", over: "Jaylen Waddle" });
    expect(payload.players[0]).toMatchObject({ name: "Ja'Marr Chase", team: "CIN", opponent: "DAL", home: false, espnProjection: 18.2, injury: null });
    expect(payload.players[1].injury).toBe("questionable");
    expect(payload.reasons.length).toBeGreaterThanOrEqual(3);
    // No ids or timestamps, so the same decision always shares one cached explanation.
    expect(JSON.stringify(payload)).not.toContain("generatedAt");
    expect(JSON.stringify(payload)).not.toContain("playerId");
  });

  it("returns null when there's nothing to explain", () => {
    expect(explainPayload({ ...result(), recommendation: null })).toBeNull();
  });

  it("tells Claude the math already decided and to use only our numbers", () => {
    expect(SYSTEM_PROMPT).toContain("already made the decision");
    expect(SYSTEM_PROMPT).toContain("Copy any number exactly");
    expect(userPrompt(explainPayload(result())!)).toContain("<decision>");
  });
});

describe("isGrounded", () => {
  const payload = explainPayload(result())!;

  it("accepts text that only uses numbers we sent and names the pick", () => {
    const pick = payload.players[0];
    expect(isGrounded(`Start Chase: ESPN projects ${pick.espnProjection} points and DAL is a soft matchup. It's a Strong call.`, payload)).toBe(true);
  });

  it("rejects a made-up stat", () => {
    expect(isGrounded("Start Chase, who has 9 touchdowns this year.", payload)).toBe(false);
  });

  it("rejects text that doesn't name the pick", () => {
    expect(isGrounded("Start Waddle this week.", payload)).toBe(false);
  });
});

describe("readClaudeText", () => {
  it("joins the text blocks of a finished answer and skips thinking blocks", () => {
    const body = {
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "", signature: "x" },
        { type: "text", text: "Start Chase. " },
        { type: "text", text: "It's a Strong call." },
      ],
    };
    expect(readClaudeText(body)).toBe("Start Chase. It's a Strong call.");
  });

  it("gives up on refusals, cut-off answers and junk", () => {
    expect(readClaudeText({ stop_reason: "refusal", content: [{ type: "text", text: "No." }] })).toBeNull();
    expect(readClaudeText({ stop_reason: "max_tokens", content: [{ type: "text", text: "Start" }] })).toBeNull();
    expect(readClaudeText(null)).toBeNull();
    expect(readClaudeText({ stop_reason: "end_turn", content: [] })).toBeNull();
  });
});
