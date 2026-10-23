/**
 * Pure helpers that keep a room's message list correct as updates arrive from
 * several places at once (the first load, live updates, your own sends,
 * reconnect catch-ups). Tested in merge.test.ts.
 */
import { dayKey, dayLabel, GROUP_WINDOW_MS } from "./time";
import type { ChatMessage, Reaction } from "./types";

/** Most messages kept in memory per room; older ones can be loaded again. */
export const MAX_KEPT = 400;

/**
 * Adds or replaces messages by id (newer copies win), oldest first. Messages
 * still being sent stay at the end. Live updates don't carry reactions, so a
 * replacement without them keeps the ones we already had.
 */
export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
  { keepReactions = false }: { keepReactions?: boolean } = {},
): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, existing && keepReactions ? { ...message, reactions: existing.reactions } : message);
  }
  const all = [...byId.values()];
  const sent = all.filter((m) => !m.pending).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const pending = all.filter((m) => m.pending);
  const trimmed = sent.length > MAX_KEPT ? sent.slice(sent.length - MAX_KEPT) : sent;
  return [...trimmed, ...pending];
}

/** Adds or removes one person's reaction. Idempotent: safe if the same update arrives twice. */
export function applyReaction(
  messages: ChatMessage[],
  messageId: string,
  userId: string,
  emoji: Reaction,
  add: boolean,
): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const others = m.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji));
    return { ...m, reactions: add ? [...others, { emoji, userId }] : others };
  });
}

/** Reactions on a message, counted: [{ emoji: "🔥", count: 3, mine: true }]. */
export function countReactions(message: ChatMessage, me: string, order: readonly Reaction[]) {
  return order
    .map((emoji) => {
      const matching = message.reactions.filter((r) => r.emoji === emoji);
      return { emoji, count: matching.length, mine: matching.some((r) => r.userId === me) };
    })
    .filter((r) => r.count > 0);
}

export interface TimelineMessage {
  key: string;
  message: ChatMessage;
  mine: boolean;
  /** First of a run from one person: shows their name, picture and the time. */
  firstInGroup: boolean;
}

export interface TimelineDay {
  key: string;
  /** "Today", "Yesterday", "Sun, Oct 25". */
  label: string;
  messages: TimelineMessage[];
}

/**
 * What the room actually shows: messages split by day ("Today"), and grouped so
 * a run of messages from one person within a few minutes shows their name once.
 */
export function buildTimeline(messages: ChatMessage[], me: string, now: Date): TimelineDay[] {
  const days: TimelineDay[] = [];
  let previous: ChatMessage | null = null;
  for (const message of messages) {
    const day = dayKey(message.createdAt);
    let current = days.at(-1);
    if (!current || current.key !== `day-${day}`) {
      current = { key: `day-${day}`, label: dayLabel(message.createdAt, now), messages: [] };
      days.push(current);
      previous = null;
    }
    const gap = previous ? Date.parse(message.createdAt) - Date.parse(previous.createdAt) : Infinity;
    const firstInGroup = !previous || previous.userId !== message.userId || previous.deleted || gap > GROUP_WINDOW_MS;
    current.messages.push({ key: message.id, message, mine: message.userId === me, firstInGroup });
    previous = message;
  }
  return days;
}
