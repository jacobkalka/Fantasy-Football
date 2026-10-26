"use client";

import { useState } from "react";
import type { ChatRoomStore, RoomState } from "@/lib/chat/room-store";
import type { ChatMessage } from "@/lib/chat/types";
import type { OptionsActions } from "./MessageOptions";

/** What a room or thread needs to run its options sheet and reply bar. */
export function useMessageActions(state: RoomState, store: ChatRoomStore, openThread?: (message: ChatMessage) => void) {
  const [options, setOptions] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const author = options ? state.profiles[options.userId] : undefined;
  const authorName = author?.username ?? "someone";
  const optionActions: OptionsActions = {
    onReact: (emoji) => options && void store.toggleReaction(options.id, emoji),
    onReply: () => options && setReplyTo(options),
    onThread: openThread && options ? () => openThread(options) : undefined,
    onReport: (reason) => (options ? store.report(options.id, reason) : Promise.resolve(false)),
    onMute: () => options && void store.mute(options.userId, authorName),
    onUnmute: () => options && void store.unmute(options.userId),
    onBlock: () => options && void store.block(options.userId, authorName),
    onDelete: () => options && void store.remove(options.id),
  };
  return {
    options,
    setOptions,
    replyTo,
    setReplyTo,
    authorName,
    optionsMuted: options ? state.muted.includes(options.userId) : false,
    optionActions,
  };
}
