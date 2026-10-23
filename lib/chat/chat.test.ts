import { describe, expect, it } from "vitest";
import { friendlyDbError, isDuplicateError } from "@/lib/supabase/db-errors";
import type { FeedItem } from "@/lib/live/types";
import { hasProfanity, maskProfanity } from "./profanity";
import { parseRoomKey, roomHref, roomKey } from "./rooms";
import {
  decodeMessageBody,
  encodeSharedPlay,
  SHARE_COMMENT_MAX,
  sharedPlayFromFeedItem,
  sharedPlaySummary,
  type SharedPlay,
} from "./shared-play";
import { dayKey, dayLabel } from "./time";
import { MAX_MESSAGE_LENGTH } from "./types";

describe("maskProfanity", () => {
  it("masks listed words, keeping the first letter", () => {
    expect(maskProfanity("what the fuck")).toBe("what the f***");
    expect(maskProfanity("Shit happens")).toBe("S*** happens");
    expect(maskProfanity("that ref is an asshole!")).toBe("that ref is an a******!");
  });

  it("catches endings, stretched letters and look-alikes", () => {
    expect(maskProfanity("fucking")).toBe("f******");
    expect(maskProfanity("fuuuuck")).toBe("f******");
    expect(maskProfanity("sh1t")).toBe("s***");
    expect(maskProfanity("@ss")).toBe("@**");
    expect(maskProfanity("BULLSHIT call")).toBe("B******* call");
  });

  it("leaves innocent words alone", () => {
    for (const fine of ["Scunthorpe", "class", "assassin", "pass rush", "Dick Vermeil", "shiitake", "cocky", "Hancock", "bass", "assist", "Massachusetts"]) {
      expect(maskProfanity(fine)).toBe(fine);
    }
    expect(hasProfanity("great pass")).toBe(false);
    expect(hasProfanity("great pass, shit")).toBe(true);
    expect(hasProfanity("great pass, shit")).toBe(true); // stable across calls
  });
});

describe("rooms", () => {
  it("parses room keys from the URL", () => {
    expect(parseRoomKey("global")).toEqual({ type: "global" });
    expect(parseRoomKey("game-401772936")).toEqual({ type: "game", gameId: "401772936" });
    expect(parseRoomKey("league-12345")).toEqual({ type: "league", leagueId: "12345" });
    expect(parseRoomKey("game-")).toBeNull();
    expect(parseRoomKey("game-<script>")).toBeNull();
    expect(parseRoomKey("game-%3Cx%3E")).toBeNull();
    expect(parseRoomKey("lobby")).toBeNull();
  });

  it("round-trips keys and links", () => {
    for (const room of [{ type: "global" }, { type: "game", gameId: "401" }, { type: "league", leagueId: "9" }] as const) {
      expect(parseRoomKey(roomKey(room))).toEqual(room);
    }
    expect(roomHref({ type: "game", gameId: "401" })).toBe("/chat/game-401");
  });
});

const item: FeedItem = {
  id: "401-77-3918298",
  kind: "points",
  playId: "401772936077",
  gameId: "401772936",
  playerId: "3918298",
  playerName: "Josh Allen",
  teamId: "2",
  period: 2,
  clock: "4:12",
  sequence: 77,
  text: 'Josh Allen pass deep right to Khalil Shakir for 34 yards, TOUCHDOWN. "What a throw"',
  playType: "Passing Touchdown",
  isTouchdown: true,
  points: 9.36,
  parts: [],
};

describe("shared plays in messages", () => {
  it("round-trips a play and a comment", () => {
    const play = sharedPlayFromFeedItem(item);
    const body = encodeSharedPlay(play, "  Called it  ");
    expect(body.startsWith("[play]{")).toBe(true);
    const decoded = decodeMessageBody(body);
    expect(decoded.text).toBe("Called it");
    expect(decoded.play).toEqual(play);
  });

  it("works with no comment", () => {
    const decoded = decodeMessageBody(encodeSharedPlay(sharedPlayFromFeedItem(item)));
    expect(decoded.text).toBe("");
    expect(decoded.play?.playerName).toBe("Josh Allen");
  });

  it("always fits the 500-character limit, shortening the play text", () => {
    const long: SharedPlay = { ...sharedPlayFromFeedItem(item), text: "x".repeat(2000), playerName: "N".repeat(80) };
    const body = encodeSharedPlay(long, "c".repeat(400));
    expect(body.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    const decoded = decodeMessageBody(body);
    expect(decoded.play?.text.endsWith("…")).toBe(true);
    expect(decoded.text).toBe("c".repeat(SHARE_COMMENT_MAX));
    // Quotes and backslashes in the play text expand when encoded; still fits.
    const quoted = encodeSharedPlay({ ...long, text: '"\\'.repeat(500) }, "c".repeat(400));
    expect(quoted.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(decodeMessageBody(quoted).play).not.toBeNull();
  });

  it("treats anything malformed as plain text", () => {
    expect(decodeMessageBody("hello")).toEqual({ play: null, text: "hello" });
    expect(decodeMessageBody("[play]not json")).toEqual({ play: null, text: "[play]not json" });
    const wrongShape = '[play]{"v":2,"p":"1"}\nhi';
    expect(decodeMessageBody(wrongShape)).toEqual({ play: null, text: wrongShape });
    const hugePoints = '[play]{"v":1,"p":"1","g":"2","a":"3","n":"X","pts":1e9,"x":"","q":1,"c":"1:00"}';
    expect(decodeMessageBody(hugePoints).play).toBeNull();
  });

  it("summarizes a play in one line", () => {
    expect(sharedPlaySummary(sharedPlayFromFeedItem(item))).toBe("Josh Allen +9.4");
    expect(sharedPlaySummary({ ...sharedPlayFromFeedItem(item), points: -2 })).toBe("Josh Allen −2.0");
  });
});

describe("friendly database errors", () => {
  it("explains the rate limit", () => {
    const error = { code: "P0001", hint: "rate_limited", message: "You're sending messages too fast. Wait a second and try again." };
    expect(friendlyDbError(error, "send")).toBe("You're sending messages too fast. Wait a second and try again.");
  });

  it("explains length, duplicates, permissions and offline", () => {
    expect(friendlyDbError({ code: "23514" }, "send")).toMatch(/between 1 and 500/);
    expect(friendlyDbError({ code: "23505" }, "report")).toMatch(/already reported/);
    expect(friendlyDbError({ code: "23505" }, "save")).toMatch(/username is taken/);
    expect(friendlyDbError({ code: "42501" }, "send")).toMatch(/signed in/);
    expect(friendlyDbError(new TypeError("Failed to fetch"), "send")).toMatch(/offline/);
    expect(friendlyDbError({ code: "XX000" }, "delete")).toMatch(/Couldn't delete/);
    expect(isDuplicateError({ code: "23505" })).toBe(true);
    expect(isDuplicateError(null)).toBe(false);
  });
});

describe("chat time labels", () => {
  const now = new Date(2026, 9, 25, 15, 0);
  it("labels days relative to now", () => {
    expect(dayLabel(new Date(2026, 9, 25, 9, 0).toISOString(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 9, 24, 23, 59).toISOString(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 20, 12, 0).toISOString(), now)).not.toMatch(/Today|Yesterday/);
    expect(dayLabel("nope", now)).toBe("");
  });

  it("groups by local day", () => {
    expect(dayKey(new Date(2026, 9, 25, 0, 1).toISOString())).toBe(dayKey(new Date(2026, 9, 25, 23, 59).toISOString()));
    expect(dayKey(new Date(2026, 9, 25, 0, 1).toISOString())).not.toBe(dayKey(new Date(2026, 9, 24, 23, 59).toISOString()));
  });
});
