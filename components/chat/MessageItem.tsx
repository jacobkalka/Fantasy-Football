"use client";

import { motion } from "motion/react";
import { UserAvatar } from "@/components/auth/UserAvatar";
import { countReactions, type TimelineMessage } from "@/lib/chat/merge";
import { maskProfanity } from "@/lib/chat/profanity";
import { decodeMessageBody } from "@/lib/chat/shared-play";
import { messageTime } from "@/lib/chat/time";
import { REACTION_LABELS, REACTIONS, type ChatProfile, type Reaction } from "@/lib/chat/types";
import { SharedPlayCard } from "./SharedPlayCard";

type MessageEntry = TimelineMessage;

function Reactions({
  entry,
  me,
  onToggle,
}: {
  entry: MessageEntry;
  me: string;
  onToggle: (emoji: Reaction) => void;
}) {
  const counts = countReactions(entry.message, me, REACTIONS);
  if (counts.length === 0 || entry.message.deleted) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${entry.mine ? "justify-end" : ""}`} aria-label="Reactions">
      {counts.map((r) => (
        <li key={r.emoji}>
          <motion.button
            type="button"
            layout
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            onClick={() => onToggle(r.emoji)}
            aria-pressed={r.mine}
            aria-label={`${REACTION_LABELS[r.emoji]}: ${r.count}${r.mine ? ", including you. Tap to remove yours" : ". Tap to add yours"}`}
            className={`relative flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] ${
              r.mine ? "glass-gain text-gain" : "glass-chip text-ink-soft"
            }`}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span className="font-mono text-[11px] font-bold tabular-nums">{r.count}</span>
          </motion.button>
        </li>
      ))}
    </ul>
  );
}

/** One chat message: avatar and name (first in a run), the glass bubble, reactions, and an options button. */
export function MessageItem({
  entry,
  author,
  me,
  onOptions,
  onToggleReaction,
}: {
  entry: MessageEntry;
  author: ChatProfile | undefined;
  me: string;
  onOptions: () => void;
  onToggleReaction: (emoji: Reaction) => void;
}) {
  const { message, mine, firstInGroup } = entry;
  const name = author?.username ?? "someone";
  const time = messageTime(message.createdAt);
  const decoded = message.deleted ? { play: null, text: "" } : decodeMessageBody(message.body);
  const text = maskProfanity(decoded.text);

  const bubble = message.deleted ? (
    <div className="rounded-[1.25rem] border border-dashed border-line px-3.5 py-2 text-[14px] text-muted italic">
      Message deleted
    </div>
  ) : (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-[1.25rem] px-3.5 py-2.5 text-[15px] leading-snug ${
        mine
          ? "rounded-br-md border border-gain/35 bg-gain/[0.13] text-ink-strong shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_10px_24px_-14px_rgb(200_255_46/0.5)] backdrop-blur-xl"
          : "glass-chip rounded-bl-md text-ink"
      } ${message.pending ? "opacity-60" : ""}`}
    >
      {decoded.play && <SharedPlayCard play={decoded.play} compact />}
      {text && <p className="break-words whitespace-pre-wrap">{text}</p>}
    </div>
  );

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 16, x: mine ? 22 : -22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
      className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""} ${firstInGroup ? "mt-3" : "mt-1"}`}
    >
      {!mine &&
        (firstInGroup ? (
          // Lined up with the top of the bubble, under the name line.
          <UserAvatar username={name} avatarUrl={author?.avatarUrl} size={32} className="mt-[1.3rem]" />
        ) : (
          <span className="w-8 shrink-0" aria-hidden="true" />
        ))}
      <div className={`flex max-w-[80%] min-w-0 flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
        {firstInGroup && (
          <p className="px-1 font-mono text-[10.5px] tracking-[0.04em] text-muted">
            {!mine && <span className="font-semibold text-ink-soft">@{name} </span>}
            <time dateTime={message.createdAt}>{message.pending ? "Sending…" : time}</time>
          </p>
        )}
        <div className={`flex items-center gap-0.5 ${mine ? "flex-row-reverse" : ""}`}>
          <div className="min-w-0" title={time}>
            {!firstInGroup && (
              <span className="sr-only">
                {mine ? "You" : `@${name}`}, {time}:{" "}
              </span>
            )}
            {bubble}
          </div>
          {!message.pending && (
            <button
              type="button"
              onClick={onOptions}
              aria-label={`Options for ${mine ? "your" : `@${name}'s`} message`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          )}
        </div>
        <Reactions entry={entry} me={me} onToggle={onToggleReaction} />
      </div>
    </motion.li>
  );
}
