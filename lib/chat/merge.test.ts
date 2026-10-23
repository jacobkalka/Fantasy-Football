import { describe, expect, it } from "vitest";
import { applyReaction, buildTimeline, countReactions, MAX_KEPT, mergeMessages } from "./merge";
import { REACTIONS, type ChatMessage } from "./types";

function msg(id: string, minute: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    roomId: "room",
    userId: "u1",
    body: `message ${id}`,
    sharedPlayId: null,
    createdAt: new Date(Date.UTC(2026, 9, 25, 18, minute)).toISOString(),
    deleted: false,
    reactions: [],
    ...extra,
  };
}

describe("mergeMessages", () => {
  it("dedupes by id and keeps time order", () => {
    const merged = mergeMessages([msg("b", 2), msg("a", 1)], [msg("c", 3), msg("a", 1, { body: "edited copy" })]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(merged[0].body).toBe("edited copy");
  });

  it("keeps messages being sent at the end", () => {
    const merged = mergeMessages([msg("p", 0, { pending: true })], [msg("a", 5)]);
    expect(merged.map((m) => m.id)).toEqual(["a", "p"]);
  });

  it("keeps known reactions when a live update (which has none) replaces a message", () => {
    const withFire = msg("a", 1, { reactions: [{ emoji: "🔥", userId: "u2" }] });
    const deletedUpdate = msg("a", 1, { deleted: true, body: "" });
    expect(mergeMessages([withFire], [deletedUpdate], { keepReactions: true })[0]).toMatchObject({
      deleted: true,
      reactions: [{ emoji: "🔥", userId: "u2" }],
    });
    expect(mergeMessages([withFire], [deletedUpdate])[0].reactions).toEqual([]);
  });

  it("drops the oldest beyond the memory cap", () => {
    const many = Array.from({ length: MAX_KEPT + 5 }, (_, i) => msg(`m${String(i).padStart(4, "0")}`, i));
    const merged = mergeMessages([], many);
    expect(merged).toHaveLength(MAX_KEPT);
    expect(merged[0].id).toBe("m0005");
  });
});

describe("reactions", () => {
  it("adds and removes idempotently", () => {
    let list = [msg("a", 1)];
    list = applyReaction(list, "a", "u2", "🔥", true);
    list = applyReaction(list, "a", "u2", "🔥", true);
    list = applyReaction(list, "a", "u3", "🔥", true);
    list = applyReaction(list, "a", "u2", "😂", true);
    expect(countReactions(list[0], "u2", REACTIONS)).toEqual([
      { emoji: "🔥", count: 2, mine: true },
      { emoji: "😂", count: 1, mine: true },
    ]);
    list = applyReaction(list, "a", "u2", "🔥", false);
    list = applyReaction(list, "a", "u2", "🔥", false);
    expect(countReactions(list[0], "u2", REACTIONS)).toEqual([
      { emoji: "🔥", count: 1, mine: false },
      { emoji: "😂", count: 1, mine: true },
    ]);
  });

  it("ignores reactions for messages that aren't loaded", () => {
    const list = [msg("a", 1)];
    expect(applyReaction(list, "zzz", "u2", "🔥", true)).toEqual(list);
  });
});

describe("buildTimeline", () => {
  const now = new Date(Date.UTC(2026, 9, 25, 20, 0));

  it("groups a run of messages from one person and starts a new group after a gap or another sender", () => {
    const days = buildTimeline(
      [msg("a", 0), msg("b", 2), msg("c", 3, { userId: "u2" }), msg("d", 4, { userId: "u2" }), msg("e", 30, { userId: "u2" })],
      "u2",
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0].label).toBe("Today");
    expect(days[0].messages.map((i) => [i.key, i.firstInGroup, i.mine])).toEqual([
      ["a", true, false],
      ["b", false, false],
      ["c", true, true],
      ["d", false, true],
      ["e", true, true],
    ]);
  });

  it("adds a divider when the day changes", () => {
    const yesterday = msg("y", 0, { createdAt: new Date(Date.UTC(2026, 9, 23, 18, 0)).toISOString() });
    const days = buildTimeline([yesterday, msg("t", 1)], "u1", now);
    expect(days.map((d) => d.messages.map((m) => [m.key, m.firstInGroup]))).toEqual([[["y", true]], [["t", true]]]);
  });
});
