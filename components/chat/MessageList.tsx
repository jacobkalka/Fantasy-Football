"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { buildTimeline, type ChatEvent } from "@/lib/chat/merge";
import { maskProfanity } from "@/lib/chat/profanity";
import type { ChatRoomStore, RoomState } from "@/lib/chat/room-store";
import { decodeMessageBody } from "@/lib/chat/shared-play";
import { messageTime } from "@/lib/chat/time";
import type { ChatMessage } from "@/lib/chat/types";
import { useNow } from "@/lib/hooks/useNow";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";
import { MessageItem, type MessageHandlers } from "./MessageItem";

/** How close to the bottom (px) still counts as "reading the latest". */
const NEAR_BOTTOM = 120;

/** A scoring play from ESPN in a game room: drawn as an event, never as someone's message. */
function EventRow({ event }: { event: ChatEvent }) {
  return (
    <li
      className="my-2 flex items-start gap-3 rounded-xl bg-surface px-3 py-2.5"
      aria-label={`Scoring play from ESPN: ${event.title}`}
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-well">
        <Icon name="football" size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-faint">
          <span className="font-semibold text-ink">{event.title}</span>
          {event.detail && (
            <span className="tabular text-muted">{event.detail}</span>
          )}
          <span>Scoring play · ESPN · {messageTime(event.at)}</span>
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{event.text}</p>
      </div>
    </li>
  );
}

function LoadingRows() {
  return (
    <div
      className="flex flex-col gap-4 px-2 py-4"
      role="status"
      aria-label="Loading messages"
    >
      {[64, 40, 78, 52].map((width, i) => (
        <div key={i} className="flex gap-3" aria-hidden="true">
          <div className="skeleton size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="skeleton h-3.5 w-28 rounded" />
            <div
              className="skeleton h-4 rounded"
              style={{ width: `${width}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The scrolling list of a room or thread: newest at the bottom, a divider per day, earlier
 * messages loaded as you scroll up (keeping your place), "N new" when you're reading back,
 * and read state saved once you've reached the newest.
 */
export function MessageList({
  state,
  store,
  me,
  events = [],
  inThread = false,
  top,
  empty,
  handlers,
}: {
  state: RoomState;
  store: ChatRoomStore;
  me: string;
  events?: ChatEvent[];
  inThread?: boolean;
  /** Shown above the messages (a thread's first message). */
  top?: React.ReactNode;
  empty: React.ReactNode;
  handlers: Omit<
    MessageHandlers,
    "onJumpTo" | "onVote" | "onRetry" | "onDiscard"
  >;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [seenAt, setSeenAt] = useState("");
  const bottom = useRef(true);
  const first = useRef(true);
  const lastKey = useRef<string | null>(null);
  const now = useNow(60_000);
  const ready = state.status === "ready";
  const { messages } = state;
  const sent = messages.filter((m) => !m.pending);
  const newest = sent.at(-1)?.createdAt ?? "";
  const last = messages.at(-1);
  const timeline = now
    ? buildTimeline(messages, me, new Date(now), events)
    : [];
  const unseen = sent.filter(
    (m) => m.userId !== me && m.createdAt > seenAt,
  ).length;
  const latestOther = sent.findLast((m) => m.userId !== me && !m.deleted);
  const announcement = latestOther
    ? `New message from ${state.profiles[latestOther.userId]?.username ?? "someone"}: ${maskProfanity(decodeMessageBody(latestOther.body).text) || "shared something"}`
    : "";

  function scrollToBottom(smooth: boolean) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    });
  }

  // A message arrived: follow it if you're at the bottom (or it's yours); otherwise it counts as new.
  useEffect(() => {
    if (!ready || !last) return;
    const key = last.id;
    if (lastKey.current === key) return;
    const isFirst = first.current;
    lastKey.current = key;
    first.current = false;
    const mine = last.userId === me && last.pending;
    if (isFirst || bottom.current || mine) {
      const frame = requestAnimationFrame(() => {
        scrollToBottom(!isFirst);
        setSeenAt(newest);
      });
      if (!isFirst && !prefersReducedMotion()) {
        const el = document.getElementById(`msg-${key}`);
        if (el)
          gsap.fromTo(
            el,
            { autoAlpha: 0, y: 10 },
            {
              autoAlpha: 1,
              y: 0,
              duration: MOTION.base,
              ease: "power2.out",
              clearProps: "all",
            },
          );
      }
      return () => cancelAnimationFrame(frame);
    }
  }, [last, ready, me, newest]);

  // Cards that finish loading (a poll, player photos) make the list taller: stay on the newest.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (bottom.current && scroller.current)
        scroller.current.scrollTop = scroller.current.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reached the newest (and the app is on screen): it's read.
  useEffect(() => {
    if (!ready || !atBottom || inThread) return;
    const mark = () =>
      document.visibilityState === "visible" && store.markSeen();
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [ready, atBottom, newest, inThread, store]);

  async function loadOlder() {
    const el = scroller.current;
    if (!el || state.loadingOlder || !state.hasOlder) return;
    const fromBottom = el.scrollHeight - el.scrollTop;
    await store.loadOlder();
    requestAnimationFrame(() => {
      if (scroller.current)
        scroller.current.scrollTop = scroller.current.scrollHeight - fromBottom;
    });
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    bottom.current = near;
    if (near !== atBottom) setAtBottom(near);
    if (near) setSeenAt(newest);
    if (el.scrollTop < 200 && state.hasOlder && !state.loadingOlder)
      void loadOlder();
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    gsap.fromTo(
      el,
      { backgroundColor: "rgb(255 255 255 / 0.08)" },
      {
        backgroundColor: "rgb(255 255 255 / 0)",
        duration: 1.6,
        delay: 0.3,
        clearProps: "backgroundColor",
      },
    );
  }

  const allHandlers: MessageHandlers = {
    ...handlers,
    onJumpTo: jumpTo,
    onVote: (message, option) => void store.vote(message.id, option),
    onRetry: (message) => store.retrySend(message.id),
    onDiscard: (message) => store.discard(message.id),
  };
  const quoted = (message: ChatMessage) =>
    message.replyTo
      ? (state.messages.find((m) => m.id === message.replyTo) ??
        state.quoted[message.replyTo])
      : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 [overflow-anchor:none] lg:px-3"
        role="region"
        aria-label="Messages"
        tabIndex={0}
      >
        <div ref={content}>
          {top}
          {ready && state.hasOlder && (
            <div className="flex justify-center py-3">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={state.loadingOlder}
                className="rounded-full px-3 py-1.5 text-[13px] text-muted hover:bg-raised hover:text-ink disabled:opacity-60"
              >
                {state.loadingOlder
                  ? "Loading earlier messages…"
                  : "Load earlier messages"}
              </button>
            </div>
          )}
          {state.status === "loading" && <LoadingRows />}
          {ready && messages.length === 0 && events.length === 0 && empty}
          {timeline.map((day) => (
            <section key={day.key} aria-label={day.label}>
              <div className="flex items-center gap-3 px-2 py-2" role="separator" aria-label={day.label}>
                <span className="h-px flex-1 bg-rule" aria-hidden="true" />
                <span className="text-[12px] font-medium text-faint">{day.label}</span>
                <span className="h-px flex-1 bg-rule" aria-hidden="true" />
              </div>
              <ol className="flex flex-col pb-1">
                {day.messages.map((entry) =>
                  entry.kind === "event" ? (
                    <EventRow key={entry.key} event={entry.event} />
                  ) : (
                    <MessageItem
                      key={entry.key}
                      entry={entry}
                      author={state.profiles[entry.message.userId]}
                      me={me}
                      quoted={quoted(entry.message)}
                      quotedAuthor={(() => {
                        const q = quoted(entry.message);
                        return q ? state.profiles[q.userId] : undefined;
                      })()}
                      poll={state.polls[entry.message.id]}
                      muted={state.muted.includes(entry.message.userId)}
                      inThread={inThread}
                      now={now}
                      handlers={allHandlers}
                    />
                  ),
                )}
              </ol>
            </section>
          ))}
          <div className="h-2" aria-hidden="true" />
        </div>
      </div>

      {!atBottom && ready && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="pressable absolute bottom-3 left-1/2 z-10 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-black shadow-[0_6px_20px_rgb(0_0_0/0.5)]"
        >
          {unseen > 0
            ? `${unseen} new ${unseen === 1 ? "message" : "messages"}`
            : "Latest"}
          <Icon name="arrowDown" size={15} />
        </button>
      )}
      <p className="sr-only" aria-live="polite">
        {ready ? announcement : ""}
      </p>
    </div>
  );
}
