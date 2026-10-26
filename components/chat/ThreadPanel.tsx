"use client";

import { Icon } from "@/components/ui/Icon";
import { useChatRoom, type RoomState } from "@/lib/chat/room-store";
import { useRulesAccepted } from "@/lib/chat/rules";
import type { RoomRef } from "@/lib/chat/types";
import { useNow } from "@/lib/hooks/useNow";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import { MessageList } from "./MessageList";
import { MessageOptions } from "./MessageOptions";
import { RoomNoticeBar } from "./RoomNoticeBar";
import { useMessageActions } from "./useMessageActions";

/**
 * One thread: the message it started from, then the replies, live. Thread replies stay here
 * (the channel shows "3 replies" under the original instead), so side conversations don't
 * crowd the channel.
 */
export function ThreadPanel({
  room,
  me,
  rootId,
  parent,
  isAdmin,
  onClose,
  chrome = true,
}: {
  room: RoomRef;
  me: string;
  rootId: string;
  parent: RoomState;
  isAdmin: boolean;
  onClose: () => void;
  /** False inside a sheet, which has its own title and close button. */
  chrome?: boolean;
}) {
  const { state, store } = useChatRoom({ room, me, threadId: rootId });
  const actions = useMessageActions(state, store);
  const rulesAccepted = useRulesAccepted();
  const now = useNow(60_000);
  const root = state.quoted[rootId] ?? parent.messages.find((m) => m.id === rootId);
  const rootAuthor = root ? (state.profiles[root.userId] ?? parent.profiles[root.userId]) : undefined;
  const ready = state.status === "ready";

  const top = root ? (
    <div className="border-b border-rule pb-2">
      <ol>
        <MessageItem
          entry={{ kind: "message", key: root.id, message: root, mine: root.userId === me, firstInGroup: true }}
          author={rootAuthor}
          me={me}
          muted={false}
          inThread
          now={now}
          poll={parent.polls[root.id]}
          handlers={{
            onReact: (m, emoji) => void store.toggleReaction(m.id, emoji),
            onReply: () => document.getElementById(`thread-${rootId}`)?.focus(),
            onOptions: actions.setOptions,
            onVote: () => {},
            onRetry: () => {},
            onDiscard: () => {},
            onJumpTo: () => {},
          }}
        />
      </ol>
      <p className="px-2 pt-1 text-[12px] text-faint">
        {root.threadReplyCount} {root.threadReplyCount === 1 ? "reply" : "replies"}
      </p>
    </div>
  ) : state.status === "loading" ? null : (
    <p className="px-2 py-4 text-[14px] text-muted">The message this thread started from isn&apos;t available.</p>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {chrome && (
        <header className="flex min-h-14 items-center gap-2 border-b border-rule px-4">
          <h2 className="flex flex-1 items-center gap-2 text-[16px] font-semibold">
            <Icon name="thread" size={18} className="text-muted" /> Thread
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close thread"
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
      )}
      {state.status === "error" ? (
        <p className="p-4 text-[14px] text-muted">
          {state.error}{" "}
          <button type="button" onClick={store.retry} className="font-medium text-ink underline">
            Try again
          </button>
        </p>
      ) : (
        <MessageList
          state={state}
          store={store}
          me={me}
          inThread
          top={top}
          empty={<p className="px-2 py-6 text-[14px] text-muted">No replies yet. Start the thread.</p>}
          handlers={{
            onReact: (m, emoji) => void store.toggleReaction(m.id, emoji),
            onReply: actions.setReplyTo,
            onOptions: actions.setOptions,
          }}
        />
      )}
      <div className="flex flex-col gap-1.5 px-2 pt-1 pb-2 lg:px-3">
        <RoomNoticeBar notice={state.notice} onDismiss={store.dismissNotice} />
        <Composer
          inputId={`thread-${rootId}`}
          onSend={store.send}
          disabled={!ready || !rulesAccepted || !root || root.deleted}
          disabledReason={root?.deleted ? "This thread's first message was deleted." : undefined}
          placeholder="Reply in thread"
          replyTo={actions.replyTo}
          replyAuthor={actions.replyTo ? state.profiles[actions.replyTo.userId] : undefined}
          onCancelReply={() => actions.setReplyTo(null)}
          allowPolls={false}
        />
      </div>
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
