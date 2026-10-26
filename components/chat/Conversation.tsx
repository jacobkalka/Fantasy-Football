"use client";

import { useSearchParams } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/States";
import { channelOf } from "@/lib/chat/rooms";
import { useChatRoom } from "@/lib/chat/room-store";
import { useRulesAccepted } from "@/lib/chat/rules";
import type { ChatMessage, RoomRef } from "@/lib/chat/types";
import { usePlayerIndex } from "@/lib/hooks/usePlayers";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { setQueryParams } from "@/lib/nav/query";
import { CommunityRules } from "./CommunityRules";
import { Composer } from "./Composer";
import { LeagueAccess } from "./LeagueAccess";
import { MessageList } from "./MessageList";
import { MessageOptions } from "./MessageOptions";
import { ReportsButton } from "./ReportsSheet";
import { RoomHeader } from "./RoomHeader";
import { RoomNoticeBar } from "./RoomNoticeBar";
import { ThreadPanel } from "./ThreadPanel";
import { useGameEvents } from "./useGameEvents";
import { useMessageActions } from "./useMessageActions";

/** Wide enough for the channel list, the conversation and a thread side by side. */
const THREAD_BESIDE = "(min-width: 1360px)";

function placeholderFor(room: RoomRef, playerName?: string) {
  const channel = channelOf(room);
  if (channel) return channel.placeholder;
  if (room.type === "game") return "Talk about this game";
  if (room.type === "player") return playerName ? `Talk about ${playerName}` : "Talk about this player";
  return "Message your league";
}

function EmptyRoom({ room }: { room: RoomRef }) {
  const channel = channelOf(room);
  return (
    <div className="flex flex-col items-start gap-2 px-3 py-10">
      <Icon name={channel ? "hash" : room.type === "game" ? "football" : "chat"} className="text-faint" />
      <p className="text-[16px] font-semibold">Nothing here yet</p>
      <p className="max-w-sm text-[14px] text-muted">
        {room.type === "game"
          ? "Be the first to talk about this game. Scoring plays from ESPN will show up here as they happen."
          : "Be the first to say something. Messages appear for everyone in the room instantly."}
      </p>
    </div>
  );
}

/**
 * One room: its header (with the live score in a game room), the messages, and the message
 * box. A thread opens beside it on a wide screen and over it everywhere else (?thread=<id>).
 */
export function Conversation({ room, me, isAdmin }: { room: RoomRef; me: string; isAdmin: boolean }) {
  const players = usePlayerIndex(room.type === "player");
  const playerName = room.type === "player" ? players.get(room.playerId)?.name : undefined;
  const { state, store } = useChatRoom({ room, me, playerName });
  const params = useSearchParams();
  const threadId = params.get("thread");
  const beside = useMediaQuery(THREAD_BESIDE);
  const rulesAccepted = useRulesAccepted();
  const events = useGameEvents(room.type === "game" ? room.gameId : null);
  const openThread = (message: ChatMessage) => setQueryParams({ thread: message.id }, { push: !threadId });
  const closeThread = () => {
    if ((window.history.state as { __fl?: boolean } | null)?.__fl) window.history.back();
    else setQueryParams({ thread: null });
  };
  const actions = useMessageActions(state, store, openThread);
  const ready = state.status === "ready";

  const thread =
    threadId && /^[0-9a-f-]{36}$/i.test(threadId) ? (
      <ThreadPanel
        key={threadId}
        room={room}
        me={me}
        rootId={threadId}
        parent={state}
        isAdmin={isAdmin}
        onClose={closeThread}
        chrome={beside}
      />
    ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <RoomHeader
          room={room}
          here={state.here}
          me={me}
          live={state.live}
          actions={isAdmin ? <ReportsButton /> : undefined}
        />
        {state.denied && room.type === "league" ? (
          <LeagueAccess leagueId={room.leagueId} onVerified={store.retry} />
        ) : state.status === "error" ? (
          <div className="p-3">
            <ErrorState what={state.error ?? "Couldn't load this room."} onRetry={store.retry} />
          </div>
        ) : (
          <MessageList
            state={state}
            store={store}
            me={me}
            events={events}
            empty={<EmptyRoom room={room} />}
            handlers={{
              onReact: (m, emoji) => void store.toggleReaction(m.id, emoji),
              onReply: actions.setReplyTo,
              onThread: openThread,
              onOptions: actions.setOptions,
            }}
          />
        )}
        {!state.denied && (
          <div className="flex flex-col gap-1.5 px-1.5 pt-1 pb-1 lg:px-3 lg:pb-3">
            <RoomNoticeBar notice={state.notice} onDismiss={store.dismissNotice} />
            <CommunityRules />
            <Composer
              onSend={store.send}
              disabled={!ready || !rulesAccepted}
              disabledReason={state.status === "error" ? "Chat isn't connected." : undefined}
              placeholder={placeholderFor(room, playerName)}
              replyTo={actions.replyTo}
              replyAuthor={actions.replyTo ? state.profiles[actions.replyTo.userId] : undefined}
              onCancelReply={() => actions.setReplyTo(null)}
            />
          </div>
        )}
      </div>

      {thread && beside && <aside className="flex w-[360px] shrink-0 flex-col border-l border-rule">{thread}</aside>}
      {!beside && (
        <Sheet open={Boolean(thread)} onClose={closeThread} title="Thread" size="lg">
          <div className="-mx-5 -mb-5 h-[min(72dvh,720px)]">{thread}</div>
        </Sheet>
      )}

      <MessageOptions
        message={actions.options}
        authorName={actions.authorName}
        me={me}
        isAdmin={isAdmin}
        muted={actions.optionsMuted}
        onClose={() => actions.setOptions(null)}
        actions={actions.optionActions}
      />
    </div>
  );
}
