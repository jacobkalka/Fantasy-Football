/** Shapes used by the chat screens. */

/** The reactions the database allows (message_reactions_emoji_allowed). Keep in sync with the migration. */
export const REACTIONS = ["🔥", "😂", "😭", "💀", "👏", "🏈"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_LABELS: Record<Reaction, string> = {
  "🔥": "fire",
  "😂": "laughing",
  "😭": "crying",
  "💀": "dead",
  "👏": "clapping",
  "🏈": "football",
};

/** The longest message the database accepts. */
export const MAX_MESSAGE_LENGTH = 500;

export interface ChatProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
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
  /** Shown straight away while it's still being sent. */
  pending?: boolean;
}

export type RoomRef =
  | { type: "global" }
  | { type: "game"; gameId: string }
  | { type: "league"; leagueId: string };
