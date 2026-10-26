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
  kind: "message";
  key: string;
  message: ChatMessage;
  mine: boolean;
  /** First of a run from one person: shows their name, picture and the time. */
  firstInGroup: boolean;
}

/**
 * Something that happened, not something someone said: a scoring play in a game room. Comes
 * from ESPN's play-by-play, never from a user, and is drawn differently from messages.
 */
export interface ChatEvent {
  id: string;
  at: string;
  title: string;
  text: string;
  detail?: string;
}

export interface TimelineEvent {
  kind: "event";
  key: string;
  event: ChatEvent;
}

export type TimelineEntry = TimelineMessage | TimelineEvent;

export interface TimelineDay {
  key: string;
  /** "Today", "Yesterday", "Sun, Oct 25". */
  label: string;
  messages: TimelineEntry[];
}

/**
 * What the room actually shows: messages (and any events) in time order, split by day
 * ("Today"), and grouped so a run of messages from one person within a few minutes shows
 * their name once. Messages still sending stay last.
 */
export function buildTimeline(messages: ChatMessage[], me: string, now: Date, events: ChatEvent[] = []): TimelineDay[] {
  type Item = { at: string; message?: ChatMessage; event?: ChatEvent };
  const sent: Item[] = messages.filter((m) => !m.pending).map((m) => ({ at: m.createdAt, message: m }));
  const inWindow = sent.length ? events.filter((e) => e.at >= sent[0].at) : events;
  const items: Item[] = [...sent, ...inWindow.map((e) => ({ at: e.at, event: e }))].sort((a, b) => a.at.localeCompare(b.at));
  items.push(...messages.filter((m) => m.pending).map((m) => ({ at: m.createdAt, message: m })));

  const days: TimelineDay[] = [];
  let previous: ChatMessage | null = null;
  for (const item of items) {
    const day = dayKey(item.at);
    let current = days.at(-1);
    if (!current || current.key !== `day-${day}`) {
      current = { key: `day-${day}`, label: dayLabel(item.at, now), messages: [] };
      days.push(current);
      previous = null;
    }
    if (item.event) {
      current.messages.push({ kind: "event", key: `event-${item.event.id}`, event: item.event });
      previous = null;
      continue;
    }
    const message = item.message!;
    const gap = previous ? Date.parse(message.createdAt) - Date.parse(previous.createdAt) : Infinity;
    const firstInGroup =
      !previous || previous.userId !== message.userId || previous.deleted || Boolean(message.replyTo) || gap > GROUP_WINDOW_MS;
    current.messages.push({ kind: "message", key: message.id, message, mine: message.userId === me, firstInGroup });
    previous = message;
  }
  return days;
}
