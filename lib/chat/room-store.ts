/**
 * One chat room (or one thread in it), live.
 *
 * Loads the last 50 messages, then listens with Supabase Realtime: new messages, edits
 * (deletions, thread reply counts), reactions and poll votes arrive the moment they happen.
 * After a dropped connection it re-loads the latest page so nothing is missed. Your own
 * actions show instantly ("optimistic") and are undone if the database says no; a message
 * that fails to send stays in place, marked, with Retry.
 *
 * Who's here comes from Realtime presence: only people who really have the room open.
 *
 * Used through useChatRoom() below.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState, useSyncExternalStore } from "react";
import { requireSupabase } from "@/lib/supabase/client";
import { friendlyDbError, isDuplicateError } from "@/lib/supabase/db-errors";
import {
  addReaction,
  blockUser,
  deleteMessage,
  fetchMessages,
  fetchMessagesById,
  fetchMutes,
  fetchPolls,
  fetchProfiles,
  markRead,
  muteUser,
  postMessage,
  removeReaction,
  removeVote,
  reportMessage,
  resolveRoom,
  toMessage,
  unblockUser,
  unmuteUser,
  votePoll,
  type MessageRow,
} from "./api";
import { applyReaction, mergeMessages } from "./merge";
import { unreadStore } from "./unread";
import {
  REACTIONS,
  type ChatMessage,
  type ChatPoll,
  type ChatProfile,
  type ChatRoomInfo,
  type OutgoingMessage,
  type Reaction,
  type RoomRef,
} from "./types";

export interface RoomNotice {
  id: number;
  text: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
}

export interface RoomState {
  status: "loading" | "ready" | "error";
  error: string | null;
  /** A league room you aren't a verified member of. */
  denied: boolean;
  room: ChatRoomInfo | null;
  messages: ChatMessage[];
  profiles: Record<string, ChatProfile>;
  polls: Record<string, ChatPoll>;
  /** Messages shown as quotes (a reply's original, a thread's first message) that aren't in the list. */
  quoted: Record<string, ChatMessage>;
  /** Is the live connection up? */
  live: "connecting" | "live" | "offline";
  /** People who have this room open right now (Realtime presence), you included. */
  here: string[];
  muted: string[];
  hasOlder: boolean;
  loadingOlder: boolean;
  notice: RoomNotice | null;
}

const INITIAL: RoomState = {
  status: "loading",
  error: null,
  denied: false,
  room: null,
  messages: [],
  profiles: {},
  polls: {},
  quoted: {},
  live: "connecting",
  here: [],
  muted: [],
  hasOlder: false,
  loadingOlder: false,
  notice: null,
};

/** How long after reaching the newest message it counts as read (so a quick scroll past doesn't). */
const READ_DELAY_MS = 1200;

export interface RoomOptions {
  room: RoomRef;
  me: string;
  /** Open one thread (its replies) instead of the main channel. */
  threadId?: string | null;
  /** Shown as a player room's title the first time anyone opens it. */
  playerName?: string;
}

export class ChatRoomStore {
  private state: RoomState = INITIAL;
  private listeners = new Set<() => void>();
  private generation = 0;
  private supabase: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private presence: RealtimeChannel | null = null;
  private roomId: string | null = null;
  private hiddenUsers = new Set<string>();
  private missingProfiles = new Set<string>();
  private profileTimer: ReturnType<typeof setTimeout> | undefined;
  private readTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRead = "";
  private drafts = new Map<string, OutgoingMessage>();
  private counter = 0;
  private readonly me: string;
  private readonly threadId: string | null;

  constructor(private readonly options: RoomOptions) {
    this.me = options.me;
    this.threadId = options.threadId ?? null;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private notify(text: string, tone: RoomNotice["tone"] = "info", action?: RoomNotice["action"]) {
    this.set({ notice: { id: ++this.counter, text, tone, action } });
  }

  dismissNotice = () => this.set({ notice: null });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    const gen = ++this.generation;
    void this.boot(gen);
  }

  stop() {
    this.generation += 1;
    clearTimeout(this.profileTimer);
    clearTimeout(this.readTimer);
    if (this.supabase) {
      if (this.channel) void this.supabase.removeChannel(this.channel);
      if (this.presence) void this.supabase.removeChannel(this.presence);
    }
    this.channel = null;
    this.presence = null;
    if (!this.threadId && this.roomId) unreadStore.setOpen(null, this.roomId);
  }

  retry = () => {
    this.stop();
    this.set({ status: "loading", error: null, denied: false });
    this.start();
  };

  private async boot(gen: number) {
    try {
      const supabase = await requireSupabase();
      this.supabase = supabase;
      const [room, muted] = await Promise.all([
        resolveRoom(supabase, this.options.room, this.options.playerName),
        fetchMutes(supabase, this.me).catch(() => [] as string[]),
      ]);
      if (gen !== this.generation) return;
      this.roomId = room.id;
      if (!this.threadId) unreadStore.setOpen(room.id);
      const [page, root] = await Promise.all([
        fetchMessages(supabase, room.id, { threadId: this.threadId }),
        this.threadId ? fetchMessagesById(supabase, [this.threadId]) : Promise.resolve(null),
      ]);
      if (gen !== this.generation) return;
      const quoted = { ...this.state.quoted };
      for (const m of root?.messages ?? []) quoted[m.id] = m;
      this.set({
        status: "ready",
        error: null,
        room,
        muted,
        messages: mergeMessages([], this.visible(page.messages)),
        profiles: this.withProfiles([...page.profiles, ...(root?.profiles ?? [])]),
        quoted,
        hasOlder: page.hasMore,
      });
      void this.loadExtras(gen, page.messages);
      // Your own name and picture, for what you send before anything of yours is loaded.
      if (!this.state.profiles[this.me]) this.queueProfile(this.me);
      this.listen(gen, supabase, room.id);
    } catch (error) {
      if (gen !== this.generation) return;
      const denied = this.options.room.type === "league" && (error as { code?: string } | null)?.code === "42501";
      if (!denied) console.error("chat room failed to load", error);
      this.set({ status: "error", denied, error: denied ? null : friendlyDbError(error, "load") });
    }
  }

  /** Polls on these messages, and the originals of any replies that aren't loaded. */
  private async loadExtras(gen: number, messages: ChatMessage[]) {
    const supabase = this.supabase;
    if (!supabase) return;
    const pollIds = messages.filter((m) => m.attachments?.poll && !this.state.polls[m.id]).map((m) => m.id);
    const have = new Set([...this.state.messages.map((m) => m.id), ...Object.keys(this.state.quoted)]);
    const missing = [...new Set(messages.map((m) => m.replyTo).filter((id): id is string => Boolean(id) && !have.has(id!)))];
    try {
      const [polls, originals] = await Promise.all([
        fetchPolls(supabase, pollIds),
        missing.length ? fetchMessagesById(supabase, missing) : Promise.resolve(null),
      ]);
      if (gen !== this.generation) return;
      const nextPolls = { ...this.state.polls };
      for (const poll of polls) nextPolls[poll.messageId] = poll;
      const quoted = { ...this.state.quoted };
      for (const m of originals?.messages ?? []) quoted[m.id] = m;
      this.set({ polls: nextPolls, quoted, profiles: this.withProfiles(originals?.profiles ?? []) });
    } catch {
      // Poll cards show "loading" and quotes show "original not available"; the next update retries.
    }
  }

  private listen(gen: number, supabase: SupabaseClient, roomId: string) {
    const topic = `room-${roomId}-${this.threadId ?? "main"}-${gen}-${Math.random().toString(36).slice(2, 8)}`;
    const messages = this.threadId
      ? { schema: "public", table: "messages", filter: `thread_id=eq.${this.threadId}` }
      : { schema: "public", table: "messages", filter: `room_id=eq.${roomId}` };
    let channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "INSERT", ...messages }, (payload) => this.onMessageRow(gen, payload.new))
      .on("postgres_changes", { event: "UPDATE", ...messages }, (payload) => this.onMessageRow(gen, payload.new));
    if (this.threadId) {
      // The thread's first message: deleted, or its reply count changing.
      channel = channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `id=eq.${this.threadId}` },
        (payload) => this.onRootRow(gen, payload.new),
      );
    }
    this.channel = channel
      // Reactions and votes have no room column to filter on; ones for other rooms are ignored below.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) =>
        this.onReactionRow(gen, payload.new, true),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) =>
        this.onReactionRow(gen, payload.old, false),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_poll_votes" }, (payload) =>
        this.onVoteRow(gen, payload.eventType === "DELETE" ? payload.old : payload.new, payload.eventType === "DELETE"),
      )
      .subscribe((status) => {
        if (gen !== this.generation) return;
        if (status === "SUBSCRIBED") {
          this.set({ live: "live" });
          // Fill any gap since the first load (or since the connection dropped).
          void this.catchUp(gen);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          this.set({ live: "offline" });
        }
      });
    if (!this.threadId) void this.joinPresence(gen, supabase, roomId);
  }

  private async joinPresence(gen: number, supabase: SupabaseClient, roomId: string) {
    const topic = `presence-${roomId}`;
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (stale) await supabase.removeChannel(stale);
    if (gen !== this.generation) return;
    const presence = supabase.channel(topic, { config: { presence: { key: this.me } } });
    this.presence = presence;
    presence
      .on("presence", { event: "sync" }, () => {
        if (gen !== this.generation) return;
        this.set({ here: Object.keys(presence.presenceState()) });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && gen === this.generation) void presence.track({ since: new Date().toISOString() });
      });
  }

  private async catchUp(gen: number) {
    if (!this.supabase || !this.roomId) return;
    try {
      const page = await fetchMessages(this.supabase, this.roomId, { threadId: this.threadId });
      if (gen !== this.generation) return;
      this.set({
        messages: mergeMessages(this.state.messages, this.visible(page.messages)),
        profiles: this.withProfiles(page.profiles),
      });
      void this.loadExtras(gen, page.messages);
    } catch {
      // The next reconnect tries again.
    }
  }

  // ── Live updates ───────────────────────────────────────────────────────────

  private visible(messages: ChatMessage[]) {
    return messages.filter((m) => !this.hiddenUsers.has(m.userId));
  }

  private withProfiles(list: ChatProfile[]) {
    if (list.length === 0) return this.state.profiles;
    const next = { ...this.state.profiles };
    for (const profile of list) next[profile.id] = profile;
    return next;
  }

  private onMessageRow(gen: number, row: Record<string, unknown>) {
    if (gen !== this.generation || typeof row.id !== "string") return;
    const message = toMessage(row as unknown as MessageRow);
    if (this.hiddenUsers.has(message.userId)) return;
    // The main channel never shows thread replies (their root's count updates instead).
    if ((message.threadId ?? null) !== this.threadId) return;
    let messages = this.state.messages;
    // Our own message arrived live before the send finished: drop its "sending" copy.
    if (message.userId === this.me) {
      const pending = messages.find((m) => m.pending && !m.failed && m.body === message.body);
      if (pending) {
        messages = messages.filter((m) => m.id !== pending.id);
        this.drafts.delete(pending.id);
      }
    }
    const isNew = !messages.some((m) => m.id === message.id);
    this.set({ messages: mergeMessages(messages, [message], { keepReactions: true }) });
    if (!this.state.profiles[message.userId]) this.queueProfile(message.userId);
    if (isNew && (message.attachments?.poll || (message.replyTo && !this.state.quoted[message.replyTo]))) {
      // A poll is saved just after its message: give it a moment.
      setTimeout(() => void this.loadExtras(gen, [message]), message.attachments?.poll ? 600 : 0);
    }
  }

  private onRootRow(gen: number, row: Record<string, unknown>) {
    if (gen !== this.generation || typeof row.id !== "string") return;
    const root = toMessage(row as unknown as MessageRow);
    const before = this.state.quoted[root.id];
    this.set({ quoted: { ...this.state.quoted, [root.id]: before ? { ...root, reactions: before.reactions } : root } });
  }

  private onReactionRow(gen: number, row: Record<string, unknown>, add: boolean) {
    if (gen !== this.generation) return;
    const { message_id: messageId, user_id: userId, emoji } = row as { message_id?: string; user_id?: string; emoji?: string };
    if (!messageId || !userId || !emoji || !(REACTIONS as readonly string[]).includes(emoji)) return;
    const root = this.state.quoted[messageId];
    if (root && this.threadId === messageId) {
      const [next] = applyReaction([root], messageId, userId, emoji as Reaction, add);
      this.set({ quoted: { ...this.state.quoted, [messageId]: next } });
    }
    if (!this.state.messages.some((m) => m.id === messageId)) return;
    this.set({ messages: applyReaction(this.state.messages, messageId, userId, emoji as Reaction, add) });
  }

  private onVoteRow(gen: number, row: Record<string, unknown>, removed: boolean) {
    if (gen !== this.generation) return;
    const { message_id: messageId, user_id: userId, option_index: option } = row as {
      message_id?: string;
      user_id?: string;
      option_index?: number;
    };
    const poll = messageId ? this.state.polls[messageId] : undefined;
    if (!poll || !userId) return;
    const votes = { ...poll.votes };
    if (removed) delete votes[userId];
    else if (typeof option === "number") votes[userId] = option;
    this.set({ polls: { ...this.state.polls, [poll.messageId]: { ...poll, votes } } });
  }

  /** Look up names for new senders, a few at a time. */
  private queueProfile(userId: string) {
    this.missingProfiles.add(userId);
    clearTimeout(this.profileTimer);
    const gen = this.generation;
    this.profileTimer = setTimeout(async () => {
      const ids = [...this.missingProfiles];
      this.missingProfiles.clear();
      if (!this.supabase || gen !== this.generation) return;
      try {
        const profiles = await fetchProfiles(this.supabase, ids);
        if (gen === this.generation) this.set({ profiles: this.withProfiles(profiles) });
      } catch {
        // Shows "someone" until the next message from them.
      }
    }, 150);
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /**
   * You're looking at the newest message: after a moment, save that as read (on the server,
   * so other devices and the unread counts agree). Threads don't count toward unread.
   */
  markSeen = () => {
    if (this.threadId || !this.supabase || !this.roomId) return;
    const newest = this.state.messages.findLast((m) => !m.pending);
    if (!newest || newest.createdAt <= this.lastRead) {
      unreadStore.clear(this.roomId);
      return;
    }
    clearTimeout(this.readTimer);
    const supabase = this.supabase;
    const roomId = this.roomId;
    this.readTimer = setTimeout(() => {
      this.lastRead = newest.createdAt;
      unreadStore.clear(roomId);
      void markRead(supabase, this.me, roomId, newest).catch(() => {
        this.lastRead = "";
      });
    }, READ_DELAY_MS);
  };

  // ── Your actions ───────────────────────────────────────────────────────────

  /** Sends a message. If it fails it stays in the list, marked, with Retry. */
  send = async (outgoing: OutgoingMessage): Promise<{ error?: string }> => {
    const body = outgoing.body.trim();
    if (!body) return {};
    if (!this.supabase || !this.roomId) return { error: "The chat isn't connected yet." };
    const draft: OutgoingMessage = { ...outgoing, body, threadId: this.threadId ?? outgoing.threadId ?? null };
    const temp: ChatMessage = {
      id: `pending-${++this.counter}`,
      roomId: this.roomId,
      userId: this.me,
      body,
      sharedPlayId: draft.sharedPlayId ?? null,
      createdAt: new Date().toISOString(),
      deleted: false,
      reactions: [],
      replyTo: draft.replyTo ?? null,
      threadId: draft.threadId ?? null,
      threadReplyCount: 0,
      lastThreadReplyAt: null,
      attachments: draft.poll ? { ...draft.attachments, poll: true } : (draft.attachments ?? null),
      pending: true,
    };
    this.drafts.set(temp.id, draft);
    this.set({ messages: mergeMessages(this.state.messages, [temp]) });
    return this.deliver(temp.id);
  };

  private async deliver(tempId: string): Promise<{ error?: string }> {
    const draft = this.drafts.get(tempId);
    if (!draft || !this.supabase || !this.roomId) return {};
    this.set({ messages: this.state.messages.map((m) => (m.id === tempId ? { ...m, failed: undefined } : m)) });
    try {
      const sent = await postMessage(this.supabase, { roomId: this.roomId, userId: this.me, message: draft });
      this.drafts.delete(tempId);
      const without = this.state.messages.filter((m) => m.id !== tempId);
      const polls = draft.poll
        ? { ...this.state.polls, [sent.id]: { messageId: sent.id, ...draft.poll, votes: {} } }
        : this.state.polls;
      this.set({ messages: mergeMessages(without, [sent], { keepReactions: true }), polls });
      return {};
    } catch (error) {
      const reason = friendlyDbError(error, "send");
      this.set({ messages: this.state.messages.map((m) => (m.id === tempId ? { ...m, failed: reason } : m)) });
      return { error: reason };
    }
  }

  retrySend = (tempId: string) => void this.deliver(tempId);

  discard = (tempId: string) => {
    this.drafts.delete(tempId);
    this.set({ messages: this.state.messages.filter((m) => m.id !== tempId) });
  };

  loadOlder = async () => {
    const oldest = this.state.messages.find((m) => !m.pending);
    if (!this.supabase || !this.roomId || !oldest || this.state.loadingOlder) return;
    this.set({ loadingOlder: true });
    const gen = this.generation;
    try {
      const page = await fetchMessages(this.supabase, this.roomId, { before: oldest.createdAt, threadId: this.threadId });
      this.set({
        messages: mergeMessages(this.state.messages, this.visible(page.messages)),
        profiles: this.withProfiles(page.profiles),
        hasOlder: page.hasMore,
        loadingOlder: false,
      });
      void this.loadExtras(gen, page.messages);
    } catch (error) {
      this.set({ loadingOlder: false });
      this.notify(friendlyDbError(error, "load"), "error");
    }
  };

  private findMessage(id: string) {
    return this.state.messages.find((m) => m.id === id) ?? this.state.quoted[id];
  }

  private patchMessage(id: string, change: (m: ChatMessage) => ChatMessage) {
    const quoted = this.state.quoted[id];
    this.set({
      messages: this.state.messages.map((m) => (m.id === id ? change(m) : m)),
      ...(quoted ? { quoted: { ...this.state.quoted, [id]: change(quoted) } } : {}),
    });
  }

  toggleReaction = async (messageId: string, emoji: Reaction) => {
    const message = this.findMessage(messageId);
    if (!this.supabase || !message || message.pending || message.deleted) return;
    const adding = !message.reactions.some((r) => r.userId === this.me && r.emoji === emoji);
    const flip = (add: boolean) => (m: ChatMessage) => applyReaction([m], messageId, this.me, emoji, add)[0];
    this.patchMessage(messageId, flip(adding));
    try {
      if (adding) await addReaction(this.supabase, messageId, this.me, emoji);
      else await removeReaction(this.supabase, messageId, this.me, emoji);
    } catch (error) {
      if (adding && isDuplicateError(error)) return;
      this.patchMessage(messageId, flip(!adding));
      this.notify(friendlyDbError(error, "react"), "error");
    }
  };

  vote = async (messageId: string, option: number | null) => {
    const poll = this.state.polls[messageId];
    if (!this.supabase || !poll) return;
    const before = poll.votes[this.me];
    const apply = (value: number | undefined) => {
      const current = this.state.polls[messageId];
      if (!current) return;
      const votes = { ...current.votes };
      if (value === undefined) delete votes[this.me];
      else votes[this.me] = value;
      this.set({ polls: { ...this.state.polls, [messageId]: { ...current, votes } } });
    };
    apply(option ?? undefined);
    try {
      if (option === null) await removeVote(this.supabase, messageId, this.me);
      else await votePoll(this.supabase, messageId, this.me, option);
    } catch (error) {
      apply(before);
      const message = (error as { message?: string } | null)?.message;
      this.notify(/closed/i.test(message ?? "") ? "This poll has closed." : "Couldn't save your vote. Try again.", "error");
    }
  };

  remove = async (messageId: string) => {
    const before = this.findMessage(messageId);
    if (!this.supabase || !before || before.pending) return;
    this.patchMessage(messageId, (m) => ({ ...m, deleted: true, body: "", attachments: null }));
    try {
      await deleteMessage(this.supabase, messageId);
    } catch (error) {
      this.patchMessage(messageId, () => before);
      this.notify(friendlyDbError(error, "delete"), "error");
    }
  };

  report = async (messageId: string, reason: string): Promise<boolean> => {
    if (!this.supabase) return false;
    try {
      await reportMessage(this.supabase, messageId, this.me, reason);
      this.notify("Thanks for reporting it. A moderator will take a look.");
      return true;
    } catch (error) {
      this.notify(friendlyDbError(error, "report"), isDuplicateError(error) ? "info" : "error");
      return isDuplicateError(error);
    }
  };

  mute = async (userId: string, username: string) => {
    if (!this.supabase || userId === this.me) return;
    const supabase = this.supabase;
    this.set({ muted: [...new Set([...this.state.muted, userId])] });
    try {
      await muteUser(supabase, this.me, userId);
      unreadStore.setMuted(this.state.muted);
      this.notify(`Muted @${username}. Their messages fold away and don't count as unread.`, "info", {
        label: "Undo",
        run: () => void this.unmute(userId),
      });
    } catch {
      this.set({ muted: this.state.muted.filter((id) => id !== userId) });
      this.notify("Couldn't mute them. Try again in a moment.", "error");
    }
  };

  unmute = async (userId: string) => {
    if (!this.supabase) return;
    try {
      await unmuteUser(this.supabase, this.me, userId);
      this.set({ muted: this.state.muted.filter((id) => id !== userId), notice: null });
      unreadStore.setMuted(this.state.muted);
    } catch {
      this.notify("Couldn't unmute them. Try again in a moment.", "error");
    }
  };

  block = async (userId: string, username: string) => {
    if (!this.supabase || userId === this.me) return;
    const supabase = this.supabase;
    const removed = this.state.messages.filter((m) => m.userId === userId);
    this.hiddenUsers.add(userId);
    this.set({ messages: this.state.messages.filter((m) => m.userId !== userId) });
    try {
      await blockUser(supabase, this.me, userId);
    } catch (error) {
      if (!isDuplicateError(error)) {
        this.hiddenUsers.delete(userId);
        this.set({ messages: mergeMessages(this.state.messages, removed) });
        this.notify(friendlyDbError(error, "block"), "error");
        return;
      }
    }
    this.notify(`Blocked @${username}. You won't see their messages.`, "info", {
      label: "Undo",
      run: () => void this.unblock(userId, removed),
    });
  };

  private async unblock(userId: string, removed: ChatMessage[]) {
    if (!this.supabase) return;
    try {
      await unblockUser(this.supabase, this.me, userId);
      this.hiddenUsers.delete(userId);
      this.set({ messages: mergeMessages(this.state.messages, removed), notice: null });
    } catch (error) {
      this.notify(friendlyDbError(error, "block"), "error");
    }
  }
}

/** A live chat room (or thread) for the signed-in person. Give the component a `key` per room/thread. */
export function useChatRoom(options: RoomOptions) {
  const [store] = useState(() => new ChatRoomStore(options));
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
