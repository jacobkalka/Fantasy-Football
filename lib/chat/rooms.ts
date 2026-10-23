/**
 * Chat room addresses. Each room has a short key used in the URL:
 *   /chat/global          the room everyone shares
 *   /chat/game-401772936  one room per NFL game (ESPN game id)
 *   /chat/league-123456   one room per imported ESPN league (Phase 9)
 */
import type { RoomRef } from "./types";

// Same rule the database uses in ensure_game_room().
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseRoomKey(key: string): RoomRef | null {
  const decoded = safeDecode(key);
  if (decoded === "global") return { type: "global" };
  const game = decoded.match(/^game-(.+)$/);
  if (game && ID.test(game[1])) return { type: "game", gameId: game[1] };
  const league = decoded.match(/^league-(.+)$/);
  if (league && /^[A-Za-z0-9_-]{1,32}$/.test(league[1])) return { type: "league", leagueId: league[1] };
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
      return "global";
    case "game":
      return `game-${room.gameId}`;
    case "league":
      return `league-${room.leagueId}`;
  }
}

export function roomHref(room: RoomRef): string {
  return `/chat/${roomKey(room)}`;
}
