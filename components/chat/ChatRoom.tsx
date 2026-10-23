"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FloatingNotice } from "@/components/auth/FloatingNotice";
import { LiveDot, Notice } from "@/components/ui/bits";
import { buildTimeline } from "@/lib/chat/merge";
import { maskProfanity } from "@/lib/chat/profanity";
import { decodeMessageBody } from "@/lib/chat/shared-play";
import { useChatRoom } from "@/lib/chat/room-store";
import { useRulesAccepted } from "@/lib/chat/rules";
import type { ChatMessage, RoomRef } from "@/lib/chat/types";
import { useNow } from "@/lib/hooks/useNow";
import { useProfile } from "@/lib/supabase/auth";
import { CommunityRules } from "./CommunityRules";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import { MessageOptions } from "./MessageOptions";

/** How close to the bottom (px) still counts as "reading the latest". */
const NEAR_BOTTOM = 160;

function isNearBottom() {
  const page = document.documentElement;
  return window.innerHeight + window.scrollY >= page.scrollHeight - NEAR_BOTTOM;
}

function LoadingBubbles() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading messages">
      {[60, 42, 72, 50].map((width, i) => (
        <div key={i} className={`flex items-end gap-2 ${i % 3 === 2 ? "flex-row-reverse" : ""}`}>
          {i % 3 !== 2 && <div className="skeleton size-8 shrink-0 rounded-full" aria-hidden="true" />}
          <div className="skeleton h-12 rounded-[1.25rem]" style={{ width: `${width}%` }} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

/**
 * A live chat room: messages (newest at the bottom), reactions, options, and the
 * message box. The page itself scrolls, so the phone's address bar can tuck away.
 */
export function ChatRoom({ room, me, placeholder }: { room: RoomRef; me: string; placeholder: string }) {
  const { state, store } = useChatRoom(room, me);
  const { profile } = useProfile();
  const rulesAccepted = useRulesAccepted();
  // The clock, for "Today"/"Yesterday" (0 until the page is in the browser).
  const now = useNow(60_000);
  const reduceMotion = useReducedMotion();
  const [optionsFor, setOptionsFor] = useState<ChatMessage | null>(null);
  const [view, setView] = useState({ atBottom: true, seenAt: "" });
  const atBottom = useRef(true);
  const newestSeen = useRef("");
  const firstScroll = useRef(true);

  const { messages } = state;
  const sent = messages.filter((m) => !m.pending);
  const newest = sent.at(-1)?.createdAt ?? "";
  const last = messages.at(-1);
  const timeline = useMemo(() => (now ? buildTimeline(messages, me, new Date(now)) : []), [now, messages, me]);
  const unseen = sent.filter((m) => m.userId !== me && m.createdAt > view.seenAt).length;
  // Screen readers hear just the newest message from someone else, not the whole list.
  const latestOther = sent.findLast((m) => m.userId !== me && !m.deleted);
  const announcement = latestOther
    ? `New message from @${state.profiles[latestOther.userId]?.username ?? "someone"}: ${maskProfanity(decodeMessageBody(latestOther.body).text) || "shared a play"}`
    : "";

  // Track whether the reader is at the bottom (then new messages scroll into view).
  useEffect(() => {
    const onScroll = () => {
      const bottom = isNearBottom();
      atBottom.current = bottom;
      setView((v) => (bottom ? { atBottom: true, seenAt: newestSeen.current } : v.atBottom ? { ...v, atBottom: false } : v));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // When a message arrives: follow it if you're at the bottom (or it's yours), otherwise count it as new.
  useEffect(() => {
    newestSeen.current = newest;
    if (!last || state.status !== "ready") return;
    const mineJustSent = last.userId === me && last.pending;
    if (!atBottom.current && !mineJustSent && !firstScroll.current) return;
    const behavior: ScrollBehavior = firstScroll.current || reduceMotion ? "auto" : "smooth";
    firstScroll.current = false;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
      setView({ atBottom: true, seenAt: newest });
    });
    return () => cancelAnimationFrame(frame);
  }, [last, newest, me, state.status, reduceMotion]);

  function jumpToLatest() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }

  async function loadOlder() {
    const before = document.documentElement.scrollHeight;
    await store.loadOlder();
    // Keep your place while older messages are added above (browsers without scroll anchoring).
    if (!CSS.supports("overflow-anchor", "auto")) {
      requestAnimationFrame(() => window.scrollBy(0, document.documentElement.scrollHeight - before));
    }
  }

  const authorOf = (message: ChatMessage | null) => (message ? state.profiles[message.userId]?.username ?? "someone" : "");
  const ready = state.status === "ready";

  return (
    <section aria-label="Chat messages" className="flex flex-col">
      <div className="flex items-center justify-between px-1 pb-1">
        <span
          className={`inline-flex items-center gap-1.5 text-[12px] ${ state.live === "live" ? "text-gain" : state.live === "offline" ? "text-alert" : "text-muted" }`}
          aria-live="polite"
        >
          {state.live === "live" && <LiveDot />}
          {state.live === "live" ? "Live" : state.live === "offline" ? "Reconnecting…" : "Connecting…"}
        </span>
        {ready && state.hasOlder && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={state.loadingOlder}
            className="min-h-11 rounded-xl px-3 text-[12px] text-sky hover:bg-white/5 disabled:opacity-50"
          >
            {state.loadingOlder ? "Loading…" : "Load earlier"}
          </button>
        )}
      </div>

      {state.status === "loading" && <LoadingBubbles />}
      {state.status === "error" && (
        <Notice title="Chat didn't load" tone="warn">
          {state.error}{" "}
          <button type="button" onClick={store.retry} className="min-h-11 text-gain underline underline-offset-4">
            Try again
          </button>
        </Notice>
      )}
      {ready && messages.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="text-4xl" aria-hidden="true">
            🏈
          </span>
          <p className="text-[18px] leading-6 font-semibold text-ink">Quiet in here</p>
          <p className="text-[14px] text-ink-soft">Be the first to say something. Messages appear for everyone instantly.</p>
        </div>
      )}

      {/* One block per day, so each day's label sticks under the header only while that day is on screen. */}
      <div className="flex flex-col">
        {timeline.map((day) => (
          <section key={day.key} aria-label={day.label} className="relative">
            <div className="sticky top-[calc(max(env(safe-area-inset-top),0.75rem)+3.75rem)] z-10 flex justify-center py-2">
              <span className="glass-chip rounded-full px-3 py-1 text-[12px] text-muted">
                {day.label}
              </span>
            </div>
            <ol className="flex flex-col">
              <AnimatePresence initial={false}>
                {day.messages.map((entry) => (
                  <MessageItem
                    key={entry.key}
                    entry={entry}
                    author={state.profiles[entry.message.userId]}
                    me={me}
                    onOptions={() => setOptionsFor(entry.message)}
                    onToggleReaction={(emoji) => void store.toggleReaction(entry.message.id, emoji)}
                  />
                ))}
              </AnimatePresence>
            </ol>
          </section>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {ready ? announcement : ""}
      </p>

      {/* Room for the floating message box. */}
      <div className="h-16" aria-hidden="true" />

      <Composer
        onSend={(text) => store.send(text)}
        disabled={!ready || !rulesAccepted}
        disabledReason={state.status === "error" ? "Chat isn't connected." : undefined}
        placeholder={placeholder}
        above={
          <>
            <FloatingNotice notice={state.notice} onDismiss={store.dismissNotice} placement="inline" />
            <AnimatePresence>
              {!view.atBottom && ready && (
                <motion.button
                  key="jump"
                  type="button"
                  onClick={jumpToLatest}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 460, damping: 30 }}
                  className={`pointer-events-auto flex min-h-11 items-center gap-2 self-center rounded-full px-4 text-[12px] font-bold ${ unseen > 0 ? "glass-gain text-gain" : "glass-bar text-ink-soft" }`}
                >
                  {unseen > 0 ? `${unseen} new ${unseen === 1 ? "message" : "messages"}` : "Latest"}
                  <span aria-hidden="true">↓</span>
                </motion.button>
              )}
            </AnimatePresence>
          </>
        }
      />

      <MessageOptions
        message={optionsFor}
        authorName={authorOf(optionsFor)}
        me={me}
        isAdmin={profile?.isAdmin ?? false}
        onClose={() => setOptionsFor(null)}
        onReact={(emoji) => optionsFor && void store.toggleReaction(optionsFor.id, emoji)}
        onReport={(reason) => (optionsFor ? store.report(optionsFor.id, reason) : Promise.resolve(false))}
        onBlock={() => optionsFor && void store.block(optionsFor.userId, authorOf(optionsFor))}
        onDelete={() => optionsFor && void store.remove(optionsFor.id)}
      />

      <CommunityRules />
    </section>
  );
}
