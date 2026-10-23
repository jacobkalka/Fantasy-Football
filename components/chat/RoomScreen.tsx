"use client";

import Link from "next/link";
import { LiveDot } from "@/components/ui/bits";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { parseRoomKey } from "@/lib/chat/rooms";
import type { RoomRef } from "@/lib/chat/types";
import { usePoll } from "@/lib/hooks/usePoll";
import type { Scoreboard } from "@/lib/providers/types";
import { ChatGate } from "./ChatGate";
import { ChatRoom } from "./ChatRoom";

function BackLink({ room }: { room: RoomRef }) {
  const href = room.type === "game" ? "/chat?tab=games" : room.type === "league" ? "/chat?tab=league" : "/chat";
  return (
    <Link
      href={href}
      className="glass-chip pressable flex size-11 shrink-0 items-center justify-center rounded-full text-ink"
      aria-label="All chat rooms"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  );
}

/** The game room's title bar: both teams, the score and the clock, kept current. */
function GameTitle({ gameId }: { gameId: string }) {
  const { data } = usePoll<Scoreboard>("/api/scoreboard", {
    intervalMs: (board) => (board?.games.some((g) => g.id === gameId && g.state === "in") ? 15_000 : 120_000),
  });
  const game = data?.games.find((g) => g.id === gameId);
  if (!game) {
    return (
      <div className="min-w-0">
        <p className="text-[12px] text-sky">Game room</p>
        <h1 className="text-[20px] leading-7 font-semibold text-ink">Game chat</h1>
      </div>
    );
  }
  const live = game.state === "in";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex -space-x-2" aria-hidden="true">
        <TeamLogo abbr={game.away.team.abbr} logo={game.away.team.logo} color={game.away.team.color} size={30} />
        <TeamLogo abbr={game.home.team.abbr} logo={game.home.team.logo} color={game.home.team.color} size={30} />
      </span>
      <div className="min-w-0">
        <h1 className="text-[20px] leading-7 font-semibold text-ink">
          {game.away.team.abbr} @ {game.home.team.abbr}
          {game.state !== "pre" && (
            <span className="ml-2 text-ink-soft">
              {game.away.score}–{game.home.score}
            </span>
          )}
        </h1>
        <p className={`mt-0.5 flex items-center gap-1.5 text-[12px] ${live ? "text-gain" : "text-muted"}`}>
          {live && <LiveDot />}
          {game.state === "pre" ? "Pregame chat" : game.statusText}
        </p>
      </div>
    </div>
  );
}

function RoomTitle({ room }: { room: RoomRef }) {
  if (room.type === "game") return <GameTitle gameId={room.gameId} />;
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-sky">{room.type === "league" ? "Private" : "Everyone"}</p>
      <h1 className="text-[20px] leading-7 font-semibold text-ink">
        {room.type === "league" ? "League chat" : "Global chat"}
      </h1>
    </div>
  );
}

/** One chat room on its own screen (/chat/global, /chat/game-…, /chat/league-…). */
export function RoomScreen({ roomKey }: { roomKey: string }) {
  const room = parseRoomKey(roomKey);
  if (!room) return null;
  const placeholder = room.type === "game" ? "Talk about this game" : room.type === "league" ? "Message your league" : "Message everyone";
  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex items-center gap-3 rounded-[1.25rem] p-2 pr-4">
        <BackLink room={room} />
        <RoomTitle room={room} />
      </div>
      <ChatGate next={`/chat/${roomKey}`}>
        {(userId) => <ChatRoom key={`${roomKey}-${userId}`} room={room} me={userId} placeholder={placeholder} />}
      </ChatGate>
    </div>
  );
}
