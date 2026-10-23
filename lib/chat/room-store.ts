/**
 * One chat room, live.
 *
 * Loads the last 50 messages, then listens for changes with Supabase Realtime:
 * new messages, deletions, and reactions arrive the moment they happen. After a
 * dropped connection it re-loads the latest page so nothing is missed. Your own
 * actions show instantly ("optimistic") and are undone if the database says no.
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
  fetchProfiles,
  postMessage,
  removeReaction,
  reportMessage,
  resolveRoomId,
  toMessage,
  unblockUser,
} from "./api";
import { applyReaction, mergeMessages } from "./merge";
import { REACTIONS, type ChatMessage, type ChatProfile, type Reaction, type RoomRef } from "./types";

export interface RoomNotice {
  id: number;
  text: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
}

export interface RoomState {
  status: "loading" | "ready" | "error";
  error: string | null;
  title: string | null;
  messages: ChatMessage[];
  profiles: Record<string, ChatProfile>;
  /** Is the live connection up? */
  live: "connecting" | "live" | "offline";
  hasOlder: boolean;
  loadingOlder: boolean;
  notice: RoomNotice | null;
}

const INITIAL: RoomState = {
  status: "loading",
  error: null,
  title: null,
  messages: [],
  profiles: {},
  live: "connecting",
  hasOlder: false,
  loadingOlder: false,
  notice: null,
};

export class ChatRoomStore {
  private state: RoomState = INITIAL;
  private listeners = new Set<() => void>();
  private generation = 0;
  private supabase: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private roomId: string | null = null;
  private hiddenUsers = new Set<string>();
  private missingProfiles = new Set<string>();
  private profileTimer: ReturnType<typeof setTimeout> | undefined;
  private counter = 0;

  constructor(
    private readonly room: RoomRef,
    private readonly me: string,
  ) {}

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
    if (this.channel && this.supabase) void this.supabase.removeChannel(this.channel);
    this.channel = null;
  }

  retry = () => {
    this.stop();
    this.set({ status: "loading", error: null });
    this.start();
  };

  private async boot(gen: number) {
    try {
      const supabase = await requireSupabase();
      this.supabase = supabase;
      const room = await resolveRoomId(supabase, this.room);
      if (gen !== this.generation) return;
      this.roomId = room.id;
      const page = await fetchMessages(supabase, room.id);
      if (gen !== this.generation) return;
      this.set({
        status: "ready",
        error: null,
        title: room.title,
        messages: mergeMessages([], this.visible(page.messages)),
        profiles: this.withProfiles(page.profiles),
        hasOlder: page.hasMore,
      });
      this.listen(gen, supabase, room.id);
    } catch (error) {
      if (gen !== this.generation) return;
      console.error("chat room failed to load", error);
      this.set({ status: "error", error: friendlyDbError(error, "load") });
    }
  }

  private listen(gen: number, supabase: SupabaseClient, roomId: string) {
    const messageFilter = { schema: "public", table: "messages", filter: `room_id=eq.${roomId}` };
    this.channel = supabase
      .channel(`room-${roomId}-${gen}`)
      .on("postgres_changes", { event: "INSERT", ...messageFilter }, (payload) => this.onMessageRow(gen, payload.new))
      .on("postgres_changes", { event: "UPDATE", ...messageFilter }, (payload) => this.onMessageRow(gen, payload.new))
      // Reactions have no room column to filter on; ones for other rooms are ignored below.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) =>
        this.onReactionRow(gen, payload.new, true),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) =>
        this.onReactionRow(gen, payload.old, false),
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
  }

  private async catchUp(gen: number) {
    if (!this.supabase || !this.roomId) return;
    try {
      const page = await fetchMessages(this.supabase, this.roomId);
      if (gen !== this.generation) return;
      this.set({
        messages: mergeMessages(this.state.messages, this.visible(page.messages)),
        profiles: this.withProfiles(page.profiles),
      });
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
    const message = toMessage(row as unknown as Parameters<typeof toMessage>[0]);
    if (this.hiddenUsers.has(message.userId)) return;
    let messages = this.state.messages;
    // Our own message arrived live before the send finished: drop its "sending" copy.
    if (message.userId === this.me) {
      const pending = messages.find((m) => m.pending && m.body === message.body);
      if (pending) messages = messages.filter((m) => m.id !== pending.id);
    }
    this.set({ messages: mergeMessages(messages, [message], { keepReactions: true }) });
    if (!this.state.profiles[message.userId]) this.queueProfile(message.userId);
  }

  private onReactionRow(gen: number, row: Record<string, unknown>, add: boolean) {
    if (gen !== this.generation) return;
    const { message_id: messageId, user_id: userId, emoji } = row as { message_id?: string; user_id?: string; emoji?: string };
    if (!messageId || !userId || !emoji || !(REACTIONS as readonly string[]).includes(emoji)) return;
    if (!this.state.messages.some((m) => m.id === messageId)) return;
    this.set({ messages: applyReaction(this.state.messages, messageId, userId, emoji as Reaction, add) });
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

  // ── Your actions ───────────────────────────────────────────────────────────

  /** Sends a message. Resolves with a plain-English error if it didn't go through. */
  send = async (text: string, sharedPlayId?: string | null): Promise<{ error?: string }> => {
    const body = text.trim();
    if (!body || !this.supabase || !this.roomId) return { error: body ? "The chat isn't connected yet." : undefined };
    const temp: ChatMessage = {
      id: `pending-${++this.counter}`,
      roomId: this.roomId,
      userId: this.me,
      body,
      sharedPlayId: sharedPlayId ?? null,
      createdAt: new Date().toISOString(),
      deleted: false,
      reactions: [],
      pending: true,
    };
    this.set({ messages: mergeMessages(this.state.messages, [temp]) });
    try {
      const sent = await postMessage(this.supabase, { roomId: this.roomId, userId: this.me, body, sharedPlayId });
      const withoutTemp = this.state.messages.filter((m) => m.id !== temp.id);
      this.set({ messages: mergeMessages(withoutTemp, [sent], { keepReactions: true }) });
      return {};
    } catch (error) {
      this.set({ messages: this.state.messages.filter((m) => m.id !== temp.id) });
      return { error: friendlyDbError(error, "send") };
    }
  };

  loadOlder = async () => {
    const oldest = this.state.messages.find((m) => !m.pending);
    if (!this.supabase || !this.roomId || !oldest || this.state.loadingOlder) return;
    this.set({ loadingOlder: true });
    try {
      const page = await fetchMessages(this.supabase, this.roomId, { before: oldest.createdAt });
      this.set({
        messages: mergeMessages(this.state.messages, this.visible(page.messages)),
        profiles: this.withProfiles(page.profiles),
        hasOlder: page.hasMore,
        loadingOlder: false,
      });
    } catch (error) {
      this.set({ loadingOlder: false });
      this.notify(friendlyDbError(error, "load"), "error");
    }
  };

  toggleReaction = async (messageId: string, emoji: Reaction) => {
    const message = this.state.messages.find((m) => m.id === messageId);
    if (!this.supabase || !message || message.pending || message.deleted) return;
    const adding = !message.reactions.some((r) => r.userId === this.me && r.emoji === emoji);
    this.set({ messages: applyReaction(this.state.messages, messageId, this.me, emoji, adding) });
    try {
      if (adding) await addReaction(this.supabase, messageId, this.me, emoji);
      else await removeReaction(this.supabase, messageId, this.me, emoji);
    } catch (error) {
      if (adding && isDuplicateError(error)) return;
      this.set({ messages: applyReaction(this.state.messages, messageId, this.me, emoji, !adding) });
      this.notify(friendlyDbError(error, "react"), "error");
    }
  };

  remove = async (messageId: string) => {
    const before = this.state.messages.find((m) => m.id === messageId);
    if (!this.supabase || !before || before.pending) return;
    this.set({
      messages: this.state.messages.map((m) => (m.id === messageId ? { ...m, deleted: true, body: "" } : m)),
    });
    try {
      await deleteMessage(this.supabase, messageId);
    } catch (error) {
      this.set({ messages: this.state.messages.map((m) => (m.id === messageId ? before : m)) });
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

/** A live chat room for the signed-in person `me`. Give the component a `key` per room. */
export function useChatRoom(room: RoomRef, me: string) {
  const [store] = useState(() => new ChatRoomStore(room, me));
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
