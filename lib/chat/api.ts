/**
 * Every chat read and write. The database's row-level security decides what's allowed
 * (signed-in only, post as yourself, rate limits, delete your own, hide people you blocked,
 * league rooms for verified members); these functions just ask.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanAttachments, parseAttachments } from "./attachments";
import { CHANNELS } from "./rooms";
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

/**
 * A message with its author's name and picture, and its reactions.
 * The "!messages_user_id_fkey" part names which link to follow to profiles
 * (reactions also connect messages and profiles, so it has to be said).
 */
const MESSAGE_COLUMNS =
  "id, room_id, user_id, body, shared_play_id, created_at, deleted, reply_to, thread_id, attachments, thread_reply_count, last_thread_reply_at";
const PROFILE_COLUMNS = "id, username, avatar_url, display_name, is_admin";
const MESSAGE_FIELDS =
  `${MESSAGE_COLUMNS}, ` +
  `author:profiles!messages_user_id_fkey(${PROFILE_COLUMNS}), ` +
  "reactions:message_reactions!message_reactions_message_id_fkey(emoji, user_id)";
const ROOM_FIELDS = "id, type, slug, ref_id, title, description, sort_order, last_message_at";

/** How many messages a room shows at first (and per "Load earlier"). */
export const PAGE_SIZE = 50;

interface ProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name?: string | null;
  is_admin?: boolean | null;
}

export interface MessageRow {
  id: string;
  room_id: string;
  user_id: string;
  body: string | null;
  shared_play_id: string | null;
  created_at: string;
  deleted: boolean | null;
  reply_to?: string | null;
  thread_id?: string | null;
  attachments?: unknown;
  thread_reply_count?: number | null;
  last_thread_reply_at?: string | null;
  author?: ProfileRow | null;
  reactions?: { emoji: string; user_id: string }[] | null;
}

function isReaction(value: string): value is Reaction {
  return (REACTIONS as readonly string[]).includes(value);
}

export function toMessage(row: MessageRow): ChatMessage {
  const deleted = row.deleted === true;
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    body: deleted ? "" : (row.body ?? ""),
    sharedPlayId: row.shared_play_id ?? null,
    createdAt: row.created_at,
    deleted,
    reactions: (row.reactions ?? [])
      .filter((r) => isReaction(r.emoji))
      .map((r) => ({ emoji: r.emoji as Reaction, userId: r.user_id })),
    replyTo: row.reply_to ?? null,
    threadId: row.thread_id ?? null,
    threadReplyCount: row.thread_reply_count ?? 0,
    lastThreadReplyAt: row.last_thread_reply_at ?? null,
    attachments: deleted ? null : parseAttachments(row.attachments),
  };
}

export function toProfile(row: ProfileRow): ChatProfile {
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url ?? null,
    displayName: row.display_name?.trim() || null,
    isAdmin: row.is_admin === true,
  };
}

function toRoom(row: Record<string, unknown>): ChatRoomInfo {
  return {
    id: row.id as string,
    type: row.type as ChatRoomInfo["type"],
    slug: (row.slug as string | null) ?? null,
    refId: (row.ref_id as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    sortOrder: (row.sort_order as number | null) ?? 100,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
  };
}

/**
 * The rooms worth listing: General and the channels, your league rooms (the database only
 * returns ones you're a verified member of), and game and player rooms active this week.
 */
export async function fetchRooms(supabase: SupabaseClient, since: Date): Promise<ChatRoomInfo[]> {
  const { data, error } = await supabase
    .from("chat_rooms")
    .select(ROOM_FIELDS)
    .or(`type.in.(global,channel,league),last_message_at.gt.${since.toISOString()}`)
    .order("sort_order", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => toRoom(row as Record<string, unknown>));
}

/** The database row of a room, creating game, player and league rooms the first time anyone opens them. */
export async function resolveRoom(supabase: SupabaseClient, room: RoomRef, playerName?: string): Promise<ChatRoomInfo> {
  if (room.type === "global" || room.type === "channel") {
    const slug = room.type === "global" ? "general" : room.slug;
    const { data, error } = await supabase.from("chat_rooms").select(ROOM_FIELDS).eq("slug", slug).limit(1).single();
    if (error) throw error;
    return toRoom(data as Record<string, unknown>);
  }
  const { data, error } =
    room.type === "game"
      ? await supabase.rpc("ensure_game_room", { game_id: room.gameId })
      : room.type === "player"
        ? await supabase.rpc("ensure_player_room", { player_id: room.playerId, player_name: playerName ?? null })
        : await supabase.rpc("ensure_league_room", { league_id: room.leagueId });
  if (error) throw error;
  const { data: row, error: readError } = await supabase.from("chat_rooms").select(ROOM_FIELDS).eq("id", data as string).single();
  if (readError) throw readError;
  return toRoom(row as Record<string, unknown>);
}

/** The fixed channel definitions, matched to their database rows (when loaded). */
export function channelRooms(rooms: ChatRoomInfo[]) {
  return CHANNELS.map((def) => ({ def, info: rooms.find((r) => r.slug === def.key) ?? null }));
}

interface PageOptions {
  before?: string;
  after?: string;
  limit?: number;
  /** A thread's replies instead of the main channel. */
  threadId?: string | null;
}

/** The newest messages in a room's main channel or one thread (oldest first). */
export async function fetchMessages(
  supabase: SupabaseClient,
  roomId: string,
  { before, after, limit = PAGE_SIZE, threadId = null }: PageOptions = {},
): Promise<{ messages: ChatMessage[]; profiles: ChatProfile[]; hasMore: boolean }> {
  let query = supabase.from("messages").select(MESSAGE_FIELDS).eq("room_id", roomId);
  query = threadId ? query.eq("thread_id", threadId) : query.is("thread_id", null);
  if (before) query = query.lt("created_at", before);
  if (after) query = query.gt("created_at", after);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit + 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as MessageRow[];
  const page = rows.slice(0, limit).reverse();
  const profiles = page.flatMap((row) => (row.author ? [toProfile(row.author)] : []));
  return { messages: page.map(toMessage), profiles, hasMore: rows.length > limit };
}

/** Particular messages (a quoted reply that isn't loaded, a thread's first message). */
export async function fetchMessagesById(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ messages: ChatMessage[]; profiles: ChatProfile[] }> {
  if (ids.length === 0) return { messages: [], profiles: [] };
  const { data, error } = await supabase.from("messages").select(MESSAGE_FIELDS).in("id", ids.slice(0, 50));
  if (error) throw error;
  const rows = (data ?? []) as unknown as MessageRow[];
  return {
    messages: rows.map(toMessage),
    profiles: rows.flatMap((row) => (row.author ? [toProfile(row.author)] : [])),
  };
}

/** Names and pictures for people whose messages arrived live (live updates don't include them). */
export async function fetchProfiles(supabase: SupabaseClient, ids: string[]): Promise<ChatProfile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
  if (error) throw error;
  return (data ?? []).map((row) => toProfile(row as ProfileRow));
}

/** Posts a message (and its poll). The database trims it, stamps the time, and enforces the limits. */
export async function postMessage(
  supabase: SupabaseClient,
  { roomId, userId, message }: { roomId: string; userId: string; message: OutgoingMessage },
): Promise<ChatMessage> {
  const attachments = cleanAttachments({ ...message.attachments, ...(message.poll ? { poll: true as const } : {}) });
  const { data, error } = await supabase
    .from("messages")
    .insert({
      room_id: roomId,
      user_id: userId,
      body: message.body,
      shared_play_id: message.sharedPlayId ?? null,
      reply_to: message.replyTo ?? null,
      thread_id: message.threadId ?? null,
      attachments,
    })
    .select(MESSAGE_FIELDS)
    .single();
  if (error) throw error;
  const sent = toMessage(data as unknown as MessageRow);
  if (message.poll) {
    const { error: pollError } = await supabase.from("chat_polls").insert({
      message_id: sent.id,
      question: message.poll.question,
      options: message.poll.options,
      closes_at: message.poll.closesAt,
    });
    if (pollError) {
      // A poll message without its poll would be a dead card: take the message back.
      await supabase.from("messages").update({ deleted: true }).eq("id", sent.id);
      throw pollError;
    }
  }
  return sent;
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

// ── Polls ────────────────────────────────────────────────────────────────────

interface PollRow {
  message_id: string;
  question: string;
  options: string[];
  closes_at: string | null;
  votes?: { user_id: string; option_index: number }[] | null;
}

function toPoll(row: PollRow): ChatPoll {
  const votes: Record<string, number> = {};
  for (const v of row.votes ?? []) votes[v.user_id] = v.option_index;
  return { messageId: row.message_id, question: row.question, options: row.options ?? [], closesAt: row.closes_at, votes };
}

export async function fetchPolls(supabase: SupabaseClient, messageIds: string[]): Promise<ChatPoll[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from("chat_polls")
    .select("message_id, question, options, closes_at, votes:chat_poll_votes(user_id, option_index)")
    .in("message_id", messageIds.slice(0, 100));
  if (error) throw error;
  return (data ?? []).map((row) => toPoll(row as unknown as PollRow));
}

/**
 * Votes, or changes your vote. (Only the option can be changed, so this updates first and
 * inserts when there was no vote yet; an upsert would try to rewrite the other columns.)
 */
export async function votePoll(supabase: SupabaseClient, messageId: string, userId: string, option: number) {
  const { data, error } = await supabase
    .from("chat_poll_votes")
    .update({ option_index: option })
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .select("message_id");
  if (error) throw error;
  if (data && data.length > 0) return;
  const { error: insertError } = await supabase
    .from("chat_poll_votes")
    .insert({ message_id: messageId, user_id: userId, option_index: option });
  if (insertError) throw insertError;
}

export async function removeVote(supabase: SupabaseClient, messageId: string, userId: string) {
  const { error } = await supabase.from("chat_poll_votes").delete().eq("message_id", messageId).eq("user_id", userId);
  if (error) throw error;
}

// ── Read state and unread counts ─────────────────────────────────────────────

/** Remembers how far you've read in a room (on the server, so every device agrees). */
export async function markRead(supabase: SupabaseClient, userId: string, roomId: string, message: { id: string; createdAt: string }) {
  const values = { last_read_at: message.createdAt, last_read_message_id: message.id };
  const { data, error } = await supabase
    .from("chat_read_state")
    .update(values)
    .eq("user_id", userId)
    .eq("room_id", roomId)
    .lt("last_read_at", message.createdAt)
    .select("room_id");
  if (error) throw error;
  if (data && data.length > 0) return;
  const { error: insertError } = await supabase.from("chat_read_state").insert({ user_id: userId, room_id: roomId, ...values });
  // Already there and newer (another device read further): nothing to do.
  if (insertError && insertError.code !== "23505") throw insertError;
}

export async function fetchUnreadCounts(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("my_unread_counts");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { room_id: string; unread: number }[]) counts[row.room_id] = Number(row.unread) || 0;
  return counts;
}

// ── Search ───────────────────────────────────────────────────────────────────

/** "%" and "_" mean "anything" to the database; searched for literally here. */
function likePattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface MessageHit {
  message: ChatMessage;
  author: ChatProfile | null;
  room: ChatRoomInfo | null;
}

/** Messages containing the words, newest first, in rooms you can see (minus people you blocked). */
export async function searchMessages(supabase: SupabaseClient, text: string, limit = 30): Promise<MessageHit[]> {
  const q = text.trim().slice(0, 80);
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("messages")
    .select(`${MESSAGE_FIELDS}, room:chat_rooms!messages_room_id_fkey(${ROOM_FIELDS})`)
    .eq("deleted", false)
    .ilike("body", likePattern(q))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as (MessageRow & { room?: Record<string, unknown> | null })[]).map((row) => ({
    message: toMessage(row),
    author: row.author ? toProfile(row.author) : null,
    room: row.room ? toRoom(row.room) : null,
  }));
}

export async function searchProfiles(supabase: SupabaseClient, text: string, limit = 8): Promise<ChatProfile[]> {
  const q = text.trim().replace(/^@/, "").toLowerCase().slice(0, 24);
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .or(`username.ilike.${likePattern(q).replace(/[,()]/g, "")},display_name.ilike.${likePattern(q).replace(/[,()]/g, "")}`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => toProfile(row as ProfileRow));
}

// ── Moderation ───────────────────────────────────────────────────────────────

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

export async function fetchMutes(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("user_mutes").select("muted_id").eq("muter_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.muted_id as string);
}

export async function muteUser(supabase: SupabaseClient, muterId: string, mutedId: string) {
  const { error } = await supabase.from("user_mutes").insert({ muter_id: muterId, muted_id: mutedId });
  if (error && error.code !== "23505") throw error;
}

export async function unmuteUser(supabase: SupabaseClient, muterId: string, mutedId: string) {
  const { error } = await supabase.from("user_mutes").delete().eq("muter_id", muterId).eq("muted_id", mutedId);
  if (error) throw error;
}

export interface ReportRow {
  id: string;
  reason: string;
  /** The text as it was when reported (kept by the database even if the message is deleted). */
  body: string;
  createdAt: string;
  reporterId: string;
  message: ChatMessage | null;
  author: ChatProfile | null;
}

/** Moderators only (the database returns just your own reports to everyone else). */
export async function fetchReports(supabase: SupabaseClient): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(`id, reason, message_body, created_at, reporter_id, message:messages!reports_message_id_fkey(${MESSAGE_COLUMNS}, author:profiles!messages_user_id_fkey(${PROFILE_COLUMNS}))`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string;
    reason: string | null;
    message_body: string | null;
    created_at: string;
    reporter_id: string;
    message: MessageRow | null;
  }[]).map((row) => ({
    id: row.id,
    reason: row.reason ?? "",
    body: row.message_body ?? row.message?.body ?? "",
    createdAt: row.created_at,
    reporterId: row.reporter_id,
    message: row.message ? toMessage(row.message) : null,
    author: row.message?.author ? toProfile(row.message.author) : null,
  }));
}

export async function dismissReport(supabase: SupabaseClient, reportId: string) {
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw error;
}
