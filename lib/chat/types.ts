/** Shapes used by the chat screens. */

/** The reactions the database allows (message_reactions_emoji_allowed). Keep in sync with the migrations. */
export const REACTIONS = ["❤️", "🔥", "😂", "👀", "👍", "💀", "🏈", "😭", "👏"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_LABELS: Record<Reaction, string> = {
  "❤️": "heart",
  "🔥": "fire",
  "😂": "laughing",
  "👀": "eyes",
  "👍": "thumbs up",
  "💀": "dead",
  "🏈": "football",
  "😭": "crying",
  "👏": "clapping",
};

/** The longest message the database accepts. */
export const MAX_MESSAGE_LENGTH = 500;

export interface ChatProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** Optional name people chose to show beside their @username. */
  displayName: string | null;
  isAdmin: boolean;
}

/** A player named in a message. The name is what the author's app showed; the app re-checks it against its own player list. */
export interface PlayerRef {
  id: string;
  name: string;
}

/** "Is this fair?": the players each side gives up. */
export interface TradeCard {
  give: PlayerRef[];
  get: PlayerRef[];
}

/** Rich parts the author chose to attach (messages.attachments). Never roster, league or ESPN data. */
export interface MessageAttachments {
  players?: PlayerRef[];
  game?: { id: string };
  trade?: TradeCard;
  poll?: true;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  body: string;
  sharedPlayId: string | null;
  createdAt: string;
  deleted: boolean;
  reactions: { emoji: Reaction; userId: string }[];
  /** The message this one answers (quoted above it). */
  replyTo: string | null;
  /** The thread this message belongs to (thread replies stay out of the main channel). */
  threadId: string | null;
  threadReplyCount: number;
  lastThreadReplyAt: string | null;
  attachments: MessageAttachments | null;
  /** Shown straight away while it's still being sent. */
  pending?: boolean;
  /** It didn't send: why, in plain English. Retry or discard it. */
  failed?: string;
}

export interface ChatPoll {
  messageId: string;
  question: string;
  options: string[];
  closesAt: string | null;
  /** userId → option index. */
  votes: Record<string, number>;
}

/** What you're writing: the text plus whatever it answers or carries. */
export interface OutgoingMessage {
  body: string;
  replyTo?: string | null;
  threadId?: string | null;
  attachments?: MessageAttachments | null;
  sharedPlayId?: string | null;
  poll?: { question: string; options: string[]; closesAt: string | null } | null;
}

export type ChannelSlug = "start-sit" | "trades" | "waivers" | "player-talk" | "matchups";

export type RoomRef =
  | { type: "global" }
  | { type: "channel"; slug: ChannelSlug }
  | { type: "game"; gameId: string }
  | { type: "league"; leagueId: string }
  | { type: "player"; playerId: string };

/** A room as the database has it (chat_rooms). */
export interface ChatRoomInfo {
  id: string;
  type: RoomRef["type"];
  slug: string | null;
  refId: string | null;
  title: string | null;
  description: string | null;
  sortOrder: number;
  lastMessageAt: string | null;
}
