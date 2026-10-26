/**
 * Chat room addresses. Each room has a short key used in the URL:
 *   /chat/general          General, the room everyone shares (the old /chat/global still works)
 *   /chat/start-sit        a topic channel (start-sit, trades, waivers, player-talk, matchups)
 *   /chat/game-401772936   one room per NFL game (ESPN game id), opened from the schedule
 *   /chat/player-3918298   one room per player (ESPN player id)
 *   /chat/league-123456    one private room per ESPN league, for verified members only
 */
import type { IconName } from "@/components/ui/Icon";
import type { ChannelSlug, RoomRef } from "./types";

export interface ChannelDef {
  key: "general" | ChannelSlug;
  title: string;
  description: string;
  icon: IconName;
  placeholder: string;
}

/** The fixed channels, in the order the database seeds them (sort_order). */
export const CHANNELS: readonly ChannelDef[] = [
  {
    key: "general",
    title: "General",
    description: "The whole FantasyLab community: news, hot takes, predictions, anything fantasy.",
    icon: "hash",
    placeholder: "Message General",
  },
  {
    key: "start-sit",
    title: "Start / Sit",
    description: "Who should I start? Lineup, flex and injury calls.",
    icon: "hash",
    placeholder: "Ask a start/sit question",
  },
  {
    key: "trades",
    title: "Trades",
    description: "Is this trade fair? Buy-low, sell-high and trade targets.",
    icon: "hash",
    placeholder: "Share a trade or ask if it's fair",
  },
  {
    key: "waivers",
    title: "Waivers",
    description: "Pickups, sleepers, breakouts and injury replacements.",
    icon: "hash",
    placeholder: "Who are you picking up?",
  },
  {
    key: "player-talk",
    title: "Player Talk",
    description: "Talk about any player. Each player also has a room of his own.",
    icon: "hash",
    placeholder: "Talk about any player",
  },
  {
    key: "matchups",
    title: "Matchups",
    description: "This week's matchups, close calls and playoff races.",
    icon: "hash",
    placeholder: "How's your matchup looking?",
  },
];

const SLUGS = new Set<string>(CHANNELS.map((c) => c.key).filter((k) => k !== "general"));

// Same rules the database uses in ensure_game_room() / ensure_player_room() / ensure_league_room().
const GAME_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PLAYER_ID = /^-?[0-9]{1,12}$/;
const LEAGUE_ID = /^[A-Za-z0-9_-]{1,32}$/;

export function parseRoomKey(key: string): RoomRef | null {
  const decoded = safeDecode(key);
  if (decoded === "general" || decoded === "global") return { type: "global" };
  if (SLUGS.has(decoded)) return { type: "channel", slug: decoded as ChannelSlug };
  const game = decoded.match(/^game-(.+)$/);
  if (game && GAME_ID.test(game[1])) return { type: "game", gameId: game[1] };
  const player = decoded.match(/^player-(.+)$/);
  if (player && PLAYER_ID.test(player[1])) return { type: "player", playerId: player[1] };
  const league = decoded.match(/^league-(.+)$/);
  if (league && LEAGUE_ID.test(league[1])) return { type: "league", leagueId: league[1] };
  return null;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function roomKey(room: RoomRef): string {
  switch (room.type) {
    case "global":
      return "general";
    case "channel":
      return room.slug;
    case "game":
      return `game-${room.gameId}`;
    case "player":
      return `player-${room.playerId}`;
    case "league":
      return `league-${room.leagueId}`;
  }
}

export function roomHref(room: RoomRef): string {
  return `/chat/${roomKey(room)}`;
}

/** The fixed channel a room is, if it is one. */
export function channelOf(room: RoomRef): ChannelDef | null {
  const key = room.type === "global" ? "general" : room.type === "channel" ? room.slug : null;
  return key ? (CHANNELS.find((c) => c.key === key) ?? null) : null;
}
