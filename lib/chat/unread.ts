/**
 * Unread counts and room activity for the channel list, shared by every chat screen.
 *
 * The counts come from the server (my_unread_counts(), from what you've read on any device),
 * then stay current from Realtime: a new message in a room you don't have open adds one.
 * Re-checked every minute while the app is visible, and when it comes back to the front.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useSyncExternalStore } from "react";
import { requireSupabase } from "@/lib/supabase/client";
import { fetchMutes, fetchRooms, fetchUnreadCounts } from "./api";
import type { ChatRoomInfo } from "./types";

export interface UnreadState {
  status: "idle" | "loading" | "ready" | "error";
  counts: Record<string, number>;
  rooms: ChatRoomInfo[];
  /** The newest message per room (from Realtime, this visit), for the list's preview line. */
  latest: Record<string, { body: string; userId: string; createdAt: string }>;
}

const EMPTY: UnreadState = { status: "idle", counts: {}, rooms: [], latest: {} };
const REFRESH_MS = 60_000;
/** Game and player rooms are listed while they've had a message in the last week. */
const ACTIVE_WINDOW_MS = 7 * 24 * 3600_000;

class UnreadStore {
  private state: UnreadState = EMPTY;
  private listeners = new Set<() => void>();
  private users = 0;
  private me: string | null = null;
  private supabase: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private open: string | null = null;
  private muted = new Set<string>();
  private gen = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;
  getServerSnapshot = () => EMPTY;

  private set(patch: Partial<UnreadState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Called by each screen that shows counts; the store runs while at least one is mounted. */
  retain(me: string) {
    this.users += 1;
    if (this.me !== me) {
      this.release(true);
      this.me = me;
      void this.boot(++this.gen);
    }
    return () => {
      this.users -= 1;
      if (this.users <= 0) setTimeout(() => this.users <= 0 && this.release(true), 30_000);
    };
  }

  private release(full: boolean) {
    this.gen += 1;
    clearInterval(this.timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisible);
    if (this.channel && this.supabase) void this.supabase.removeChannel(this.channel);
    this.channel = null;
    if (full) {
      this.me = null;
      this.state = EMPTY;
    }
  }

  private onVisible = () => {
    if (document.visibilityState === "visible") void this.refresh();
  };

  private async boot(gen: number) {
    const me = this.me;
    if (!me) return;
    this.set({ status: "loading" });
    try {
      const supabase = await requireSupabase();
      if (gen !== this.gen) return;
      this.supabase = supabase;
      const muted = await fetchMutes(supabase, me).catch(() => [] as string[]);
      this.muted = new Set(muted);
      await this.refresh();
      if (gen !== this.gen) return;
      this.channel = supabase
        .channel(`inbox-${me}-${gen}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => this.onInsert(gen, payload.new))
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && gen === this.gen) void this.refresh();
        });
      this.timer = setInterval(() => {
        if (document.visibilityState === "visible") void this.refresh();
      }, REFRESH_MS);
      document.addEventListener("visibilitychange", this.onVisible);
    } catch {
      if (gen === this.gen) this.set({ status: "error" });
    }
  }

  refresh = async () => {
    const supabase = this.supabase;
    const gen = this.gen;
    if (!supabase || !this.me) return;
    try {
      const [rooms, counts] = await Promise.all([
        fetchRooms(supabase, new Date(Date.now() - ACTIVE_WINDOW_MS)),
        fetchUnreadCounts(supabase),
      ]);
      if (gen !== this.gen) return;
      if (this.open) counts[this.open] = 0;
      this.set({ status: "ready", rooms, counts });
    } catch {
      if (gen === this.gen && this.state.status !== "ready") this.set({ status: "error" });
    }
  };

  private onInsert(gen: number, row: Record<string, unknown>) {
    if (gen !== this.gen) return;
    const roomId = row.room_id as string | undefined;
    const userId = row.user_id as string | undefined;
    if (!roomId || !userId || row.thread_id) return;
    const createdAt = (row.created_at as string) ?? new Date().toISOString();
    const latest = { ...this.state.latest, [roomId]: { body: String(row.body ?? ""), userId, createdAt } };
    let rooms = this.state.rooms;
    if (rooms.some((r) => r.id === roomId)) rooms = rooms.map((r) => (r.id === roomId ? { ...r, lastMessageAt: createdAt } : r));
    else void this.refresh();
    const counted = userId !== this.me && roomId !== this.open && !this.muted.has(userId);
    const counts = counted ? { ...this.state.counts, [roomId]: (this.state.counts[roomId] ?? 0) + 1 } : this.state.counts;
    this.set({ latest, rooms, counts });
  }

  /** The room on screen: its messages are being read as they arrive. */
  setOpen(roomId: string | null, closing?: string) {
    if (roomId === null && closing && this.open !== closing) return;
    this.open = roomId;
    if (roomId) this.clear(roomId);
  }

  clear(roomId: string) {
    if (!this.state.counts[roomId]) return;
    this.set({ counts: { ...this.state.counts, [roomId]: 0 } });
  }

  setMuted(ids: string[]) {
    this.muted = new Set(ids);
    void this.refresh();
  }
}

export const unreadStore = new UnreadStore();

/** Unread counts and active rooms for the signed-in person. */
export function useUnread(me: string | null): UnreadState {
  useEffect(() => (me ? unreadStore.retain(me) : undefined), [me]);
  return useSyncExternalStore(unreadStore.subscribe, unreadStore.getSnapshot, unreadStore.getServerSnapshot);
}

/** Every unread message across rooms (for a badge). */
export function totalUnread(state: UnreadState): number {
  return Object.values(state.counts).reduce((sum, n) => sum + n, 0);
}
