/**
 * Every chat read and write. The database's row-level security decides what's
 * allowed (signed-in only, post as yourself, 1 message per second, delete your
 * own, hide people you blocked); these functions just ask.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { REACTIONS, type ChatMessage, type ChatProfile, type Reaction, type RoomRef } from "./types";

/**
 * A message with its author's name and picture, and its reactions.
 * The "!messages_user_id_fkey" part names which link to follow to profiles
 * (reactions also connect messages and profiles, so it has to be said).
 */
const MESSAGE_FIELDS =
  "id, room_id, user_id, body, shared_play_id, created_at, deleted, " +
  "author:profiles!messages_user_id_fkey(id, username, avatar_url), " +
  "reactions:message_reactions!message_reactions_message_id_fkey(emoji, user_id)";

/** How many messages a room shows at first (and per "Load earlier"). */
export const PAGE_SIZE = 50;

interface MessageRow {
  id: string;
  room_id: string;
  user_id: string;
  body: string | null;
  shared_play_id: string | null;
  created_at: string;
  deleted: boolean | null;
  author?: { id: string; username: string; avatar_url: string | null } | null;
  reactions?: { emoji: string; user_id: string }[] | null;
}

function isReaction(value: string): value is Reaction {
  return (REACTIONS as readonly string[]).includes(value);
}

export function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    body: row.deleted ? "" : (row.body ?? ""),
    sharedPlayId: row.shared_play_id ?? null,
    createdAt: row.created_at,
    deleted: row.deleted === true,
    reactions: (row.reactions ?? [])
      .filter((r) => isReaction(r.emoji))
      .map((r) => ({ emoji: r.emoji as Reaction, userId: r.user_id })),
  };
}

export function toProfile(row: { id: string; username: string; avatar_url: string | null }): ChatProfile {
  return { id: row.id, username: row.username, avatarUrl: row.avatar_url ?? null };
}

/** The database id of a room, creating game and league rooms the first time anyone opens them. */
export async function resolveRoomId(supabase: SupabaseClient, room: RoomRef): Promise<{ id: string; title: string | null }> {
  if (room.type === "global") {
    const { data, error } = await supabase.from("chat_rooms").select("id, title").eq("type", "global").limit(1).single();
    if (error) throw error;
    return { id: data.id as string, title: (data.title as string | null) ?? null };
  }
  const { data, error } =
    room.type === "game"
      ? await supabase.rpc("ensure_game_room", { game_id: room.gameId })
      : await supabase.rpc("ensure_league_room", { league_id: room.leagueId });
  if (error) throw error;
  const id = data as string;
  const { data: row } = await supabase.from("chat_rooms").select("title").eq("id", id).maybeSingle();
  return { id, title: (row?.title as string | null) ?? null };
}

/** The newest messages in a room (oldest first), optionally only those before a time. */
export async function fetchMessages(
  supabase: SupabaseClient,
  roomId: string,
  { before, after, limit = PAGE_SIZE }: { before?: string; after?: string; limit?: number } = {},
): Promise<{ messages: ChatMessage[]; profiles: ChatProfile[]; hasMore: boolean }> {
  let query = supabase.from("messages").select(MESSAGE_FIELDS).eq("room_id", roomId);
  if (before) query = query.lt("created_at", before);
  if (after) query = query.gt("created_at", after);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit + 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as MessageRow[];
  const page = rows.slice(0, limit).reverse();
  const profiles = page.flatMap((row) => (row.author ? [toProfile(row.author)] : []));
  return { messages: page.map(toMessage), profiles, hasMore: rows.length > limit };
}

/** Names and pictures for people whose messages arrived live (live updates don't include them). */
export async function fetchProfiles(supabase: SupabaseClient, ids: string[]): Promise<ChatProfile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids);
  if (error) throw error;
  return (data ?? []).map((row) => toProfile(row as { id: string; username: string; avatar_url: string | null }));
}

/** Posts a message. The database trims it, stamps the time, and enforces the limits. */
export async function postMessage(
  supabase: SupabaseClient,
  { roomId, userId, body, sharedPlayId }: { roomId: string; userId: string; body: string; sharedPlayId?: string | null },
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ room_id: roomId, user_id: userId, body, shared_play_id: sharedPlayId ?? null })
    .select(MESSAGE_FIELDS)
    .single();
  if (error) throw error;
  return toMessage(data as unknown as MessageRow);
}

/** Soft-deletes a message: the database wipes the text and keeps a "deleted" marker. */
export async function deleteMessage(supabase: SupabaseClient, messageId: string): Promise<void> {
  const { error } = await supabase.from("messages").update({ deleted: true }).eq("id", messageId);
  if (error) throw error;
}

export async function addReaction(supabase: SupabaseClient, messageId: string, userId: string, emoji: Reaction) {
  const { error } = await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
  if (error) throw error;
}

export async function removeReaction(supabase: SupabaseClient, messageId: string, userId: string, emoji: Reaction) {
  const { error } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji);
  if (error) throw error;
}

export async function reportMessage(supabase: SupabaseClient, messageId: string, userId: string, reason: string) {
  const { error } = await supabase
    .from("reports")
    .insert({ message_id: messageId, reporter_id: userId, reason: reason.slice(0, 500) });
  if (error) throw error;
}

export async function blockUser(supabase: SupabaseClient, blockerId: string, blockedId: string) {
  const { error } = await supabase.from("user_blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;
}

export async function unblockUser(supabase: SupabaseClient, blockerId: string, blockedId: string) {
  const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
  if (error) throw error;
}
