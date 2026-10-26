"use client";

import { parseRoomKey } from "@/lib/chat/rooms";
import { DESKTOP, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useProfile } from "@/lib/supabase/auth";
import { ChannelList } from "./ChannelList";
import { ChatGate } from "./ChatGate";
import { Conversation } from "./Conversation";

/**
 * The chat screen. Desktop: the channel list and the open room side by side (General when none
 * is chosen). Phone: one at a time, the list at /chat and a room at /chat/<room>, with the top
 * bar's back arrow returning to the list. Needs a <Suspense> parent (threads live in the URL).
 */
export function ChatShell({ roomKey }: { roomKey: string | null }) {
  const desktop = useMediaQuery(DESKTOP);
  const { profile } = useProfile();
  const key = roomKey ?? (desktop ? "general" : null);
  const room = key ? parseRoomKey(key) : null;
  return (
    <ChatGate next={roomKey ? `/chat/${roomKey}` : "/chat"}>
      {(userId) => (
        <div data-chat data-no-pull className="chat-frame mt-1 flex gap-3 lg:mt-6">
          <aside
            aria-label="Chat rooms"
            className={`min-h-0 w-full flex-col lg:flex lg:w-[300px] lg:shrink-0 ${roomKey ? "hidden" : "flex"}`}
          >
            <h1 className="px-2.5 pb-3 text-[24px] leading-8 font-semibold tracking-[-0.02em] lg:text-[20px]">Chat</h1>
            <ChannelList me={userId} active={key} />
          </aside>
          {room && (
            <section aria-label="Conversation" className="card flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <Conversation key={`${key}-${userId}`} room={room} me={userId} isAdmin={profile?.isAdmin ?? false} />
            </section>
          )}
        </div>
      )}
    </ChatGate>
  );
}
