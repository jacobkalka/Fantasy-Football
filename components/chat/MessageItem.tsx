"use client";

import { useState } from "react";
import { UserAvatar } from "@/components/auth/UserAvatar";
import { Icon } from "@/components/ui/Icon";
import { splitMentions } from "@/lib/chat/attachments";
import { countReactions, type TimelineMessage } from "@/lib/chat/merge";
import { maskProfanity } from "@/lib/chat/profanity";
import { decodeMessageBody } from "@/lib/chat/shared-play";
import { messageTime, sinceLabel } from "@/lib/chat/time";
import { REACTION_LABELS, REACTIONS, type ChatMessage, type ChatPoll, type ChatProfile, type Reaction } from "@/lib/chat/types";
import { openUser } from "@/lib/nav/query";
import { GameCardView, PlayerMention, PollCard, TradeCardView } from "./Attachments";
import { ReactionPicker } from "./ReactionPicker";
import { SharedPlayCard } from "./SharedPlayCard";

/** The reactions offered one tap away on hover; the rest are in the picker. */
// These emoji are the chat's reaction set (content people send), not UI icons.
const QUICK: Reaction[] = ["❤️", "🔥", "😂", "👀"]; // taste-skill-ignore

export interface MessageHandlers {
  onReact: (message: ChatMessage, emoji: Reaction) => void;
  onReply: (message: ChatMessage) => void;
  onThread?: (message: ChatMessage) => void;
  onOptions: (message: ChatMessage) => void;
  onVote: (message: ChatMessage, option: number | null) => void;
  onRetry: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
  onJumpTo: (messageId: string) => void;
}

function nameOf(profile: ChatProfile | undefined) {
  return profile?.displayName ?? profile?.username ?? "someone";
}

/** The text of a message, with @player mentions as links and the profanity filter applied. */
export function MessageText({ message, className = "" }: { message: ChatMessage; className?: string }) {
  const { text } = decodeMessageBody(message.body);
  const parts = splitMentions(maskProfanity(text), message.attachments?.players);
  if (parts.length === 0) return null;
  return (
    <p className={`break-words whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => (part.kind === "player" ? <PlayerMention key={i} player={part.player} /> : <span key={i}>{part.text}</span>))}
    </p>
  );
}

/** "Replying to @alice: ..." above a reply. Tapping it jumps to the original if it's loaded. */
function ReplyQuote({
  original,
  author,
  onJump,
}: {
  original: ChatMessage | undefined;
  author: ChatProfile | undefined;
  onJump: () => void;
}) {
  const snippet = original
    ? original.deleted
      ? "Message deleted"
      : maskProfanity(decodeMessageBody(original.body).text).slice(0, 140) || "Shared a play"
    : "Original message isn't available";
  return (
    <button
      type="button"
      onClick={onJump}
      disabled={!original}
      className="mb-0.5 flex max-w-full min-w-0 items-center gap-1.5 text-left text-[12px] text-muted hover:text-ink disabled:hover:text-muted"
    >
      <Icon name="reply" size={14} className="shrink-0" />
      {original && <span className="shrink-0 font-medium text-ink">@{author?.username ?? "someone"}</span>}
      <span className="truncate">{snippet}</span>
    </button>
  );
}

function Reactions({ message, me, onToggle }: { message: ChatMessage; me: string; onToggle: (emoji: Reaction) => void }) {
  const counts = countReactions(message, me, REACTIONS);
  if (counts.length === 0 || message.deleted) return null;
  return (
    <ul className="mt-1 flex flex-wrap items-center gap-1" aria-label="Reactions">
      {counts.map((r) => (
        <li key={r.emoji}>
          <button
            type="button"
            onClick={() => onToggle(r.emoji)}
            aria-pressed={r.mine}
            aria-label={`${REACTION_LABELS[r.emoji]}: ${r.count}${r.mine ? ", including you. Tap to remove yours" : ". Tap to add yours"}`}
            className={`pressable flex h-7 items-center gap-1 rounded-full px-2 text-[13px] ${r.mine ? "bg-control text-ink" : "bg-raised text-muted hover:bg-well"}`}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span className="tabular text-[12px] font-semibold">{r.count}</span>
          </button>
        </li>
      ))}
      <li>
        <ReactionPicker
          onPick={onToggle}
          mine={message.reactions.filter((r) => r.userId === me).map((r) => r.emoji)}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              aria-label="Add a reaction"
              className="pressable grid h-7 w-8 place-items-center rounded-full bg-raised text-muted hover:bg-well hover:text-ink"
            >
              <Icon name="smile" size={15} />
            </button>
          )}
        />
      </li>
    </ul>
  );
}

/** Hover (or keyboard focus) toolbar on devices with a mouse. Touch devices use the ⋯ button. */
function HoverActions({
  message,
  me,
  inThread,
  handlers,
}: {
  message: ChatMessage;
  me: string;
  inThread: boolean;
  handlers: MessageHandlers;
}) {
  const mine = message.reactions.filter((r) => r.userId === me).map((r) => r.emoji);
  const button = "grid size-8 place-items-center rounded-lg text-muted hover:bg-well hover:text-ink";
  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className="absolute -top-4 right-2 z-10 hidden items-center gap-0.5 rounded-xl bg-raised p-0.5 shadow-[0_6px_20px_rgb(0_0_0/0.5)] group-has-[:focus-visible]:flex [@media(hover:hover)]:group-hover:flex"
    >
      {QUICK.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => handlers.onReact(message, emoji)}
          aria-pressed={mine.includes(emoji)}
          aria-label={`React ${REACTION_LABELS[emoji]}`}
          className={`${button} text-[16px] ${mine.includes(emoji) ? "bg-well" : ""}`}
        >
          {emoji}
        </button>
      ))}
      <ReactionPicker
        onPick={(emoji) => handlers.onReact(message, emoji)}
        mine={mine}
        trigger={(open) => (
          <button type="button" onClick={open} aria-label="More reactions" className={button}>
            <Icon name="smile" size={17} />
          </button>
        )}
      />
      <span className="mx-0.5 h-5 w-px bg-well" aria-hidden="true" />
      <button type="button" onClick={() => handlers.onReply(message)} aria-label="Reply" className={button}>
        <Icon name="reply" size={17} />
      </button>
      {!inThread && handlers.onThread && (
        <button type="button" onClick={() => handlers.onThread?.(message)} aria-label="Reply in thread" className={button}>
          <Icon name="thread" size={17} />
        </button>
      )}
      <button type="button" onClick={() => handlers.onOptions(message)} aria-label="More actions" className={button}>
        <Icon name="more" size={17} />
      </button>
    </div>
  );
}

/**
 * One chat message: picture and name (first in a run), the text with any player mentions,
 * cards it carries (a shared play, a poll, a trade, a game), reactions, and its thread.
 * Your own unsent message shows "Sending…", or what went wrong with Retry.
 */
export function MessageItem({
  entry,
  author,
  me,
  quoted,
  quotedAuthor,
  poll,
  muted,
  inThread = false,
  now,
  handlers,
}: {
  entry: TimelineMessage;
  author: ChatProfile | undefined;
  me: string;
  /** The message this one replies to. */
  quoted?: ChatMessage;
  quotedAuthor?: ChatProfile;
  poll?: ChatPoll;
  muted: boolean;
  inThread?: boolean;
  now: number;
  handlers: MessageHandlers;
}) {
  const { message, firstInGroup } = entry;
  const [revealed, setRevealed] = useState(false);
  const name = nameOf(author);
  const time = messageTime(message.createdAt);
  const decoded = message.deleted ? { play: null, text: "" } : decodeMessageBody(message.body);
  const live = !message.pending && !message.failed;

  if (muted && !revealed && !message.deleted) {
    return (
      <li className="flex items-center gap-2 py-1 pl-[52px] text-[13px] text-faint">
        Message from someone you muted
        <button type="button" onClick={() => setRevealed(true)} className="font-medium text-muted hover:text-ink">
          Show
        </button>
      </li>
    );
  }

  return (
    <li
      id={`msg-${message.id}`}
      className={`group relative flex gap-3 rounded-xl px-2 transition-colors [@media(hover:hover)]:hover:bg-raised ${firstInGroup ? "mt-2 pt-1.5 pb-1" : "py-0.5"}`}
    >
      <div className="w-9 shrink-0">
        {firstInGroup && (
          <button
            type="button"
            onClick={() => author && openUser(author.username)}
            aria-label={`${name}'s profile`}
            className="mt-0.5 block rounded-full"
            tabIndex={-1}
          >
            <UserAvatar username={author?.username ?? "?"} avatarUrl={author?.avatarUrl} size={36} />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {firstInGroup && (
          <p className="flex items-baseline gap-1.5 text-[14px] leading-5">
            <button
              type="button"
              onClick={() => author && openUser(author.username)}
              className="truncate font-semibold hover:underline"
            >
              {name}
            </button>
            {author?.displayName && <span className="truncate text-[12px] text-faint">@{author.username}</span>}
            {author?.isAdmin && <span className="rounded bg-well px-1 text-[11px] font-medium text-muted">Mod</span>}
            <time dateTime={message.createdAt} className="shrink-0 text-[12px] text-faint">
              {message.pending && !message.failed ? "Sending…" : time}
            </time>
          </p>
        )}
        {!firstInGroup && (
          <span className="sr-only">
            {name}, {time}:{" "}
          </span>
        )}
        {message.replyTo && (
          <ReplyQuote original={quoted} author={quotedAuthor} onJump={() => message.replyTo && handlers.onJumpTo(message.replyTo)} />
        )}
        {message.deleted ? (
          <p className="text-[14px] text-faint italic">Message deleted</p>
        ) : (
          <div className={`flex flex-col gap-1.5 text-[15px] leading-[1.4] ${message.pending && !message.failed ? "opacity-60" : ""}`}>
            {decoded.play && <SharedPlayCard play={decoded.play} compact />}
            {!message.attachments?.poll && <MessageText message={message} />}
            {message.attachments?.poll && (
              <PollCard poll={poll} me={me} onVote={(option) => live && handlers.onVote(message, option)} />
            )}
            {message.attachments?.trade && <TradeCardView trade={message.attachments.trade} />}
            {message.attachments?.game && <GameCardView gameId={message.attachments.game.id} />}
          </div>
        )}
        {message.failed && (
          <p role="alert" className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-negative">
            <span className="flex items-center gap-1">
              <Icon name="alert" size={14} /> {/didn.t send/i.test(message.failed) ? message.failed : `Didn't send. ${message.failed}`}
            </span>
            <button type="button" onClick={() => handlers.onRetry(message)} className="font-medium text-ink hover:underline">
              Retry
            </button>
            <button type="button" onClick={() => handlers.onDiscard(message)} className="text-muted hover:text-ink">
              Discard
            </button>
          </p>
        )}
        {live && <Reactions message={message} me={me} onToggle={(emoji) => handlers.onReact(message, emoji)} />}
        {live && !inThread && message.threadReplyCount > 0 && handlers.onThread && (
          <button
            type="button"
            onClick={() => handlers.onThread?.(message)}
            className="mt-1 flex items-center gap-1.5 rounded-lg py-1 text-[13px] hover:underline"
          >
            <Icon name="thread" size={15} className="text-muted" />
            <span className="font-medium">
              {message.threadReplyCount} {message.threadReplyCount === 1 ? "reply" : "replies"}
            </span>
            {message.lastThreadReplyAt && <span className="text-faint">Last {sinceLabel(message.lastThreadReplyAt, now)}</span>}
          </button>
        )}
      </div>
      {live && !message.deleted && (
        <>
          <HoverActions message={message} me={me} inThread={inThread} handlers={handlers} />
          <button
            type="button"
            onClick={() => handlers.onOptions(message)}
            aria-label={`Actions for ${name}'s message`}
            className="-mr-1 hidden size-9 shrink-0 place-items-center self-start rounded-full text-faint [@media(hover:none)]:grid"
          >
            <Icon name="more" size={18} />
          </button>
        </>
      )}
    </li>
  );
}
