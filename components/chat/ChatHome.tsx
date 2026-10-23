"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { ChatGate } from "./ChatGate";
import { ChatRoom } from "./ChatRoom";
import { GameRooms, LeagueRooms } from "./RoomLists";

const TABS = [
  { value: "global", label: "Everyone" },
  { value: "games", label: "Games" },
  { value: "league", label: "League" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/**
 * The Chat tab: the room everyone shares, a list of this week's game rooms, and
 * league rooms. Needs a <Suspense> parent (it reads ?tab= from the URL).
 */
export function ChatHome() {
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const [tab, setTab] = useState<Tab>(fromUrl === "games" || fromUrl === "league" ? fromUrl : "global");
  return (
    <ChatGate next="/chat">
      {(userId) => (
        <div className="flex flex-col gap-4">
          <Segmented options={TABS} value={tab} onChange={setTab} label="Chat rooms" />
          {tab === "global" && (
            <ChatRoom key={`global-${userId}`} room={{ type: "global" }} me={userId} placeholder="Message everyone" />
          )}
          {tab === "games" && <GameRooms />}
          {tab === "league" && <LeagueRooms userId={userId} />}
        </div>
      )}
    </ChatGate>
  );
}
