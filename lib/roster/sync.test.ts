import { describe, expect, it } from "vitest";
import { emptyRoster, type Roster, type RosterPlayer } from "./lineup";
import {
  decideSync,
  fromAccountRoster,
  nflSeason,
  parseTime,
  retryDelay,
  rosterSignature,
  syncNotice,
  toAccountRoster,
  toAccountRows,
  type AccountRoster,
} from "./sync";

const allen: RosterPlayer = {
  playerId: "3918298",
  name: "Josh Allen",
  position: "QB",
  teamId: "2",
  headshot: "https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png",
  slot: "QB",
};
const chase: RosterPlayer = { playerId: "4362628", name: "Ja'Marr Chase", position: "WR", teamId: "4", headshot: null, slot: "WR" };
const bills: RosterPlayer = { playerId: "-16002", name: "Bills D/ST", position: "DST", teamId: "2", headshot: null, slot: "DST" };

function local(players: RosterPlayer[], updatedAt = "2026-10-20T12:00:00.000Z", extra: Partial<Roster> = {}): Roster {
  return { ...emptyRoster(), players, updatedAt, ...extra };
}

function account(players: RosterPlayer[], updatedAt = "2026-10-21T12:00:00.000000+00:00", extra: Partial<AccountRoster> = {}): AccountRoster {
  return {
    id: "roster-1",
    name: "My Team",
    format: "ppr",
    updatedAt,
    players: players.map((p) => ({ playerId: p.playerId, slot: p.slot, position: p.position })),
    ...extra,
  };
}

const USER = "user-a";

describe("rosterSignature", () => {
  it("ignores player order, photos and display names", () => {
    const a = local([allen, chase]);
    const b = local([{ ...chase, name: "J. Chase" }, { ...allen, headshot: null }]);
    expect(rosterSignature(a)).toBe(rosterSignature(b));
  });

  it("changes when a slot, the format or the team name changes", () => {
    const base = rosterSignature(local([allen, chase]));
    expect(rosterSignature(local([allen, { ...chase, slot: "BENCH" }]))).not.toBe(base);
    expect(rosterSignature(local([allen, chase], undefined, { format: "half" }))).not.toBe(base);
    expect(rosterSignature(local([allen, chase], undefined, { name: "Sunday Funday" }))).not.toBe(base);
  });

  it("treats a blank name as the default name", () => {
    expect(rosterSignature(local([], undefined, { name: "  " }))).toBe(rosterSignature(local([])));
  });
});

describe("decideSync", () => {
  it("does nothing when both are empty", () => {
    expect(decideSync({ local: local([]), account: null, memory: null, userId: USER })).toEqual({
      action: "none",
      reason: "both-empty",
    });
  });

  it("saves the device team to a brand-new account", () => {
    expect(decideSync({ local: local([allen]), account: null, memory: null, userId: USER })).toEqual({
      action: "push",
      reason: "account-empty",
    });
  });

  it("loads the account team onto an empty device", () => {
    expect(decideSync({ local: local([], "2026-10-22T00:00:00Z"), account: account([allen]), memory: null, userId: USER })).toEqual({
      action: "pull",
      reason: "device-empty",
    });
  });

  it("does nothing when they already match", () => {
    expect(decideSync({ local: local([allen, chase]), account: account([chase, allen]), memory: null, userId: USER }).action).toBe("none");
  });

  it("keeps the most recently edited copy when both differ and the device never synced", () => {
    const newerDevice = decideSync({
      local: local([allen, chase], "2026-10-22T09:00:00.000Z"),
      account: account([allen], "2026-10-21T09:00:00.000000+00:00"),
      memory: null,
      userId: USER,
    });
    expect(newerDevice).toEqual({ action: "push", reason: "device-newer" });

    const newerAccount = decideSync({
      local: local([allen, chase], "2026-10-20T09:00:00.000Z"),
      account: account([allen], "2026-10-21T09:00:00.123456+00:00"),
      memory: null,
      userId: USER,
    });
    expect(newerAccount).toEqual({ action: "pull", reason: "account-newer" });
  });

  it("lets the account win a tie", () => {
    const t = "2026-10-21T09:00:00.000Z";
    expect(decideSync({ local: local([chase], t), account: account([allen], t), memory: null, userId: USER }).action).toBe("pull");
  });

  it("pushes routine edits made on this device since the last sync", () => {
    const synced = rosterSignature(local([allen]));
    const decision = decideSync({
      // Even if the account's timestamp looks newer (clock differences), only the device changed.
      local: local([allen, chase], "2026-10-01T00:00:00Z"),
      account: account([allen], "2026-10-21T00:00:00Z"),
      memory: { userId: USER, signature: synced },
      userId: USER,
    });
    expect(decision).toEqual({ action: "push", reason: "device-changed" });
  });

  it("pulls edits made on another device since the last sync", () => {
    const synced = rosterSignature(local([allen]));
    const decision = decideSync({
      local: local([allen], "2026-10-22T00:00:00Z"),
      account: account([allen, bills], "2026-10-01T00:00:00Z"),
      memory: { userId: USER, signature: synced },
      userId: USER,
    });
    expect(decision).toEqual({ action: "pull", reason: "account-changed" });
  });

  it("falls back to timestamps when both sides changed since the last sync", () => {
    const synced = rosterSignature(local([allen]));
    const decision = decideSync({
      local: local([allen, chase], "2026-10-22T10:00:00Z"),
      account: account([allen, bills], "2026-10-22T09:00:00Z"),
      memory: { userId: USER, signature: synced },
      userId: USER,
    });
    expect(decision).toEqual({ action: "push", reason: "device-newer" });
  });

  it("never pushes another account's team over this account's team", () => {
    const decision = decideSync({
      local: local([chase], "2026-10-22T10:00:00Z"),
      account: account([allen], "2026-10-01T00:00:00Z"),
      memory: { userId: "user-b", signature: rosterSignature(local([chase])) },
      userId: USER,
    });
    expect(decision).toEqual({ action: "pull", reason: "other-account" });
  });

  it("adopts the device team for an account that has none, whoever synced it before", () => {
    const decision = decideSync({
      local: local([chase]),
      account: null,
      memory: { userId: "user-b", signature: "x" },
      userId: USER,
    });
    expect(decision.action).toBe("push");
  });
});

describe("syncNotice", () => {
  it("tells the user which copy won", () => {
    expect(syncNotice({ action: "push", reason: "device-newer" })).toMatch(/this device.*saved to your account/);
    expect(syncNotice({ action: "pull", reason: "account-newer" })).toMatch(/account had a newer version/);
    expect(syncNotice({ action: "pull", reason: "device-empty" })).toMatch(/Loaded your saved team/);
  });

  it("stays quiet for routine syncs", () => {
    expect(syncNotice({ action: "push", reason: "device-changed" })).toBeNull();
    expect(syncNotice({ action: "none", reason: "in-sync" })).toBeNull();
  });
});

describe("conversions", () => {
  it("writes slots and positions, never more than the roster limit", () => {
    const rows = toAccountRows(local([allen, bills], undefined, { name: "  Bills Mafia  " }));
    expect(rows).toEqual({
      name: "Bills Mafia",
      scoringFormat: "ppr",
      players: [
        { player_id: "3918298", slot: "QB", position: "QB" },
        { player_id: "-16002", slot: "DST", position: "DST" },
      ],
    });
  });

  it("reads database rows defensively", () => {
    const parsed = toAccountRoster({
      id: "r1",
      name: null,
      scoring_format: "weird",
      updated_at: "2026-10-21T00:00:00+00:00",
      roster_players: [
        { player_id: "1", slot: "QB", position: "QB" },
        { player_id: "2", slot: "SUPERFLEX", position: "LB" },
      ],
    });
    expect(parsed.name).toBe("My Team");
    expect(parsed.format).toBe("ppr");
    expect(parsed.players).toEqual([
      { playerId: "1", slot: "QB", position: "QB" },
      { playerId: "2", slot: "BENCH", position: null },
    ]);
  });

  it("rebuilds a device roster with names from the player list, keeping unknown players", () => {
    const roster = fromAccountRoster(account([allen, chase]), (id) =>
      id === allen.playerId ? { name: "Josh Allen", position: "QB", teamId: "2", headshot: allen.headshot } : undefined,
    );
    expect(roster.players[0]).toEqual(allen);
    expect(roster.players[1]).toEqual({
      playerId: chase.playerId,
      name: `Player ${chase.playerId}`,
      position: "WR",
      teamId: null,
      headshot: null,
      slot: "WR",
    });
    // Round trip: the rebuilt roster matches the account copy, so it won't be pushed straight back.
    expect(rosterSignature(roster)).toBe(rosterSignature(account([allen, chase])));
  });
});

describe("helpers", () => {
  it("parses database times with microseconds", () => {
    expect(parseTime("2026-10-21T12:00:00.123456+00:00")).toBe(Date.parse("2026-10-21T12:00:00.123Z"));
    expect(parseTime("garbage")).toBe(0);
    expect(parseTime(undefined)).toBe(0);
  });

  it("knows which NFL season a date belongs to", () => {
    expect(nflSeason(new Date(2026, 9, 22))).toBe(2026);
    expect(nflSeason(new Date(2027, 0, 15))).toBe(2026);
    expect(nflSeason(new Date(2027, 2, 1))).toBe(2027);
  });

  it("backs off between retries, capped at a minute", () => {
    expect([1, 2, 3, 4, 10].map(retryDelay)).toEqual([2000, 4000, 8000, 16000, 60000]);
  });
});
